import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig, type EnvRecord } from "../src/config/index.js";

const DOCKER_URL = "postgresql://rezen:dockerpw@localhost:15432/rezen_mcp";
const LOCAL_URL = "postgresql://postgres:localpw@localhost:5432/rezen_mcp";
const MAP = JSON.stringify({ docker: DOCKER_URL, local: LOCAL_URL });

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "rezen-dburl-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const load = (env: EnvRecord) => loadConfig({ cwd: dir, env });

/** The message of the ConfigError that loading this env produces. */
function failure(env: EnvRecord): string {
  try {
    load(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error("expected loadConfig to throw");
}

describe("DATABASE_URL as a single string", () => {
  it("is returned unchanged, whichever provider is chosen", () => {
    expect(load({ DATABASE_URL: DOCKER_URL }).DATABASE_URL).toBe(DOCKER_URL);
    expect(load({ DATABASE_URL: LOCAL_URL, DB_PROVIDER: "local" }).DATABASE_URL).toBe(LOCAL_URL);
  });

  it("is still accepted in production", () => {
    expect(load({ NODE_ENV: "production", DATABASE_URL: DOCKER_URL }).DATABASE_URL).toBe(
      DOCKER_URL,
    );
  });
});

describe("DATABASE_URL as a map of provider to URL", () => {
  it("resolves to the URL of the chosen provider, as a string", () => {
    const docker = load({ DATABASE_URL: MAP, DB_PROVIDER: "docker" });
    const local = load({ DATABASE_URL: MAP, DB_PROVIDER: "local" });
    expect(docker.DATABASE_URL).toBe(DOCKER_URL);
    expect(local.DATABASE_URL).toBe(LOCAL_URL);
    expect(typeof docker.DATABASE_URL).toBe("string");
  });

  it("uses the default provider (docker) when DB_PROVIDER is not set", () => {
    expect(load({ DATABASE_URL: MAP }).DATABASE_URL).toBe(DOCKER_URL);
  });

  it("works in development and in test", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(load({ NODE_ENV, DATABASE_URL: MAP, DB_PROVIDER: "local" }).DATABASE_URL).toBe(
        LOCAL_URL,
      );
    }
  });

  it("may hold only the provider in use", () => {
    const onlyLocal = JSON.stringify({ local: LOCAL_URL });
    expect(load({ DATABASE_URL: onlyLocal, DB_PROVIDER: "local" }).DATABASE_URL).toBe(LOCAL_URL);
  });

  it("is rejected when it has no URL for the chosen provider, naming the provider", () => {
    const onlyLocal = JSON.stringify({ local: LOCAL_URL });
    const message = failure({ DATABASE_URL: onlyLocal, DB_PROVIDER: "docker" });
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/DB_PROVIDER="docker"/);
    expect(message).toMatch(/it has: local/);
    expect(message).not.toMatch(/localpw/);
    expect(failure({ DATABASE_URL: "{}" })).toMatch(/it has: none/);
  });

  it("is rejected in production, even when it would otherwise be valid", () => {
    const message = failure({ NODE_ENV: "production", DATABASE_URL: MAP });
    expect(message).toMatch(/DATABASE_URL.*single URL in production/);
    expect(message).not.toMatch(/dockerpw|localpw/);
  });
});

describe("invalid DATABASE_URL values", () => {
  it("rejects invalid JSON, without echoing any of it", () => {
    const message = failure({ DATABASE_URL: "{docker:postgresql://u:s3cret@h/d" });
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toMatch(/s3cret/);
  });

  it("rejects a map entry that is not a postgres URL, without echoing it", () => {
    const message = failure({
      DATABASE_URL: JSON.stringify({ docker: "mysql://u:s3cret@h/d", local: LOCAL_URL }),
    });
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toMatch(/s3cret|localpw/);
  });

  it("rejects unknown providers, non-string values and non-objects", () => {
    expect(failure({ DATABASE_URL: JSON.stringify({ podman: DOCKER_URL }) })).toMatch(
      /DATABASE_URL/,
    );
    expect(failure({ DATABASE_URL: '{"docker": 5432}' })).toMatch(/DATABASE_URL/);
    expect(failure({ DATABASE_URL: "[1, 2]" })).toMatch(/DATABASE_URL/);
  });

  it("keeps rejecting a plain string that is not a postgres URL", () => {
    expect(failure({ DATABASE_URL: "mysql://u:s3cret@h/d" })).not.toMatch(/s3cret/);
    expect(failure({ DATABASE_URL: "not a url" })).toMatch(/DATABASE_URL/);
  });
});

describe("DATABASE_URL in env files", () => {
  it("reads a single-quoted JSON map from .env and lets DB_PROVIDER switch it", () => {
    writeFileSync(path.join(dir, ".env"), `DATABASE_URL='${MAP}'\nDB_PROVIDER=docker\n`);
    expect(loadConfig({ cwd: dir, env: {} }).DATABASE_URL).toBe(DOCKER_URL);
    expect(loadConfig({ cwd: dir, env: { DB_PROVIDER: "local" } }).DATABASE_URL).toBe(LOCAL_URL);
  });

  it("also reads the map without quotes", () => {
    writeFileSync(path.join(dir, ".env"), `DATABASE_URL=${MAP}\n`);
    expect(loadConfig({ cwd: dir, env: {} }).DATABASE_URL).toBe(DOCKER_URL);
  });

  it("lets .env.test replace the whole value, and a real variable replace both", () => {
    writeFileSync(path.join(dir, ".env"), `DATABASE_URL='${MAP}'\n`);
    writeFileSync(path.join(dir, ".env.test"), `DATABASE_URL=${LOCAL_URL}\n`);
    const test = loadConfig({ cwd: dir, env: { NODE_ENV: "test", DB_PROVIDER: "docker" } });
    expect(test.DATABASE_URL).toBe(LOCAL_URL);
    const real = loadConfig({
      cwd: dir,
      env: { NODE_ENV: "test", DATABASE_URL: DOCKER_URL },
    });
    expect(real.DATABASE_URL).toBe(DOCKER_URL);
  });

  it("refuses a map from .env.production", () => {
    writeFileSync(path.join(dir, ".env.production"), `DATABASE_URL='${MAP}'\n`);
    expect(() => loadConfig({ cwd: dir, env: { NODE_ENV: "production" } })).toThrow(
      /single URL in production/,
    );
  });
});
