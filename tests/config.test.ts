import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConfigError,
  getConfig,
  loadConfig,
  resetConfigCache,
  resolveEnv,
} from "../src/config/index.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "rezen-config-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetConfigCache();
  rmSync(dir, { recursive: true, force: true });
});

function write(name: string, content: string): void {
  writeFileSync(path.join(dir, name), content);
}

describe("SCHOOL_TOKEN and SCHOOL_ID (ADR-022)", () => {
  const load = (env: Record<string, string>) => loadConfig({ cwd: dir, env });
  const token = "rzn_" + "A".repeat(43);

  it("are optional, and unset by default", () => {
    const config = load({});
    expect(config.SCHOOL_TOKEN).toBeUndefined();
    expect(config.SCHOOL_ID).toBeUndefined();
  });

  it("accepts a token with postgres, and a school ID with memory", () => {
    expect(load({ DATA_STORE: "postgres", SCHOOL_TOKEN: token }).SCHOOL_TOKEN).toBe(token);
    expect(load({ DATA_STORE: "memory", SCHOOL_ID: "sch_demo_b" }).SCHOOL_ID).toBe("sch_demo_b");
  });

  it("treats empty values as unset", () => {
    const config = load({ SCHOOL_TOKEN: "", SCHOOL_ID: "" });
    expect(config.SCHOOL_TOKEN).toBeUndefined();
    expect(config.SCHOOL_ID).toBeUndefined();
  });

  it("rejects a token with memory, which would ignore it, without printing it", () => {
    const error = (() => {
      try {
        load({ DATA_STORE: "memory", SCHOOL_TOKEN: token });
      } catch (e) {
        return e as Error;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.message).toContain("SCHOOL_TOKEN");
    expect(error?.message).not.toContain(token);
  });

  it("rejects a school ID with postgres, where the token decides", () => {
    expect(() => load({ DATA_STORE: "postgres", SCHOOL_ID: "sch_demo_a" })).toThrow(/SCHOOL_ID/);
  });
});

describe("resolveEnv", () => {
  it("reads .env on its own, and works when no files exist", () => {
    write(".env", "A=from-base\nB=only-base\n");
    const resolved = resolveEnv({ cwd: dir, env: {} });
    expect(resolved.env).toMatchObject({ A: "from-base", B: "only-base" });
    expect(resolved.files).toEqual([path.join(dir, ".env")]);

    const empty = mkdtempSync(path.join(tmpdir(), "rezen-config-empty-"));
    try {
      expect(resolveEnv({ cwd: empty, env: {} })).toEqual({
        env: { NODE_ENV: "development" },
        files: [],
      });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("lets .env.<NODE_ENV> override .env and keeps values only .env has", () => {
    write(".env", "A=base\nB=only-base\n");
    write(".env.test", "A=test\n");
    const { env, files } = resolveEnv({ cwd: dir, env: { NODE_ENV: "test" } });
    expect(env).toMatchObject({ A: "test", B: "only-base" });
    expect(files).toEqual([path.join(dir, ".env"), path.join(dir, ".env.test")]);
  });

  it("only reads the file for the active NODE_ENV", () => {
    write(".env.test", "A=test\n");
    write(".env.production", "A=production\n");
    expect(resolveEnv({ cwd: dir, env: { NODE_ENV: "production" } }).env.A).toBe("production");
    expect(resolveEnv({ cwd: dir, env: { NODE_ENV: "test" } }).env.A).toBe("test");
  });

  it("treats an unset NODE_ENV as development", () => {
    write(".env.development", "A=dev\n");
    write(".env.test", "A=test\n");
    expect(resolveEnv({ cwd: dir, env: {} }).env.A).toBe("dev");
  });

  it("lets real environment variables beat every file", () => {
    write(".env", "A=base\n");
    write(".env.test", "A=test\n");
    const { env } = resolveEnv({ cwd: dir, env: { NODE_ENV: "test", A: "from-host" } });
    expect(env.A).toBe("from-host");
  });

  it("treats empty values as unset, so a file can fill them in", () => {
    write(".env", "A=from-file\nB=\n");
    const { env } = resolveEnv({ cwd: dir, env: { A: "" } });
    expect(env.A).toBe("from-file");
    expect("B" in env).toBe(false);
  });

  it("ignores NODE_ENV written inside a file", () => {
    write(".env", "NODE_ENV=production\n");
    expect(resolveEnv({ cwd: dir, env: { NODE_ENV: "test" } }).env.NODE_ENV).toBe("test");
    expect(resolveEnv({ cwd: dir, env: {} }).env.NODE_ENV).toBe("development");
  });

  it("does not read outside the working directory through NODE_ENV", () => {
    mkdirSync(path.join(dir, "inner"));
    write(".env.x", "A=escaped\n");
    expect(() =>
      resolveEnv({ cwd: path.join(dir, "inner"), env: { NODE_ENV: "../.env.x" } }),
    ).toThrow(ConfigError);
  });

  it("does not modify process.env", () => {
    write(".env", "REZEN_CONFIG_TEST_ONLY=1\n");
    resolveEnv({ cwd: dir, env: {} });
    expect(process.env.REZEN_CONFIG_TEST_ONLY).toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("defaults NODE_ENV to development", () => {
    expect(loadConfig({ cwd: dir, env: {} }).NODE_ENV).toBe("development");
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(loadConfig({ cwd: dir, env: { NODE_ENV: "test" } }))).toBe(true);
  });

  it("rejects an unknown NODE_ENV and says what is wrong", () => {
    write(".env", "A=1\n");
    const act = () => loadConfig({ cwd: dir, env: { NODE_ENV: "staging" } });
    expect(act).toThrow(ConfigError);
    expect(act).toThrow(/NODE_ENV/);
    expect(act).toThrow(path.join(dir, ".env"));
  });
});

describe("getConfig", () => {
  it("loads once and returns the same object afterwards", () => {
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const first = getConfig();
    write(".env", "NODE_ENV=production\n");
    expect(getConfig()).toBe(first);
    resetConfigCache();
    expect(getConfig()).not.toBe(first);
  });
});
