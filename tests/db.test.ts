import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/index.js";
import { createDatabase, DatabaseError, describeTarget, type Database } from "../src/db/index.js";

const opened: Database[] = [];

function track(database: Database): Database {
  opened.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.close()));
});

// Port 1 refuses connections at once, so these tests need no Postgres server.
const UNREACHABLE = "postgresql://rezen:s3cret-pass@127.0.0.1:1/rezen_mcp_test";

describe("database settings in the config", () => {
  const settings = (env: Record<string, string>) =>
    loadConfig({ cwd: "/nonexistent-rezen-dir", env });

  it("defaults the provider to docker and leaves DATABASE_URL optional", () => {
    const config = settings({});
    expect(config.DB_PROVIDER).toBe("docker");
    expect(config.DATABASE_URL).toBeUndefined();
  });

  it("accepts postgres and postgresql URLs and the local provider", () => {
    expect(
      settings({ DATABASE_URL: "postgres://u:p@localhost:5432/db" }).DATABASE_URL,
    ).toBeDefined();
    const config = settings({
      DATABASE_URL: "postgresql://u:p@localhost/db",
      DB_PROVIDER: "local",
    });
    expect(config.DB_PROVIDER).toBe("local");
  });

  it("rejects other protocols and unknown providers", () => {
    expect(() => settings({ DATABASE_URL: "mysql://u:p@localhost/db" })).toThrow(ConfigError);
    expect(() => settings({ DATABASE_URL: "not a url" })).toThrow(/DATABASE_URL/);
    expect(() => settings({ DB_PROVIDER: "podman" })).toThrow(/DB_PROVIDER/);
  });
});

describe("describeTarget", () => {
  it("shows host, port and database without credentials", () => {
    expect(describeTarget("postgresql://rezen:s3cret@db.example.com:5433/rezen_mcp")).toBe(
      "db.example.com:5433/rezen_mcp",
    );
  });

  it("assumes port 5432 when none is given", () => {
    expect(describeTarget("postgres://u:p@localhost/rezen_mcp")).toBe("localhost:5432/rezen_mcp");
  });

  it("rejects a bad URL without echoing it", () => {
    const act = () => describeTarget("not-a-url-with-s3cret");
    expect(act).toThrow(DatabaseError);
    expect(act).not.toThrow(/s3cret/);
  });
});

describe("createDatabase", () => {
  it("creates the provider named by the config", () => {
    const docker = track(createDatabase({ DATABASE_URL: UNREACHABLE, DB_PROVIDER: "docker" }));
    const local = track(createDatabase({ DATABASE_URL: UNREACHABLE, DB_PROVIDER: "local" }));
    expect(docker.provider).toBe("docker");
    expect(local.provider).toBe("local");
    expect(docker.target).toBe("127.0.0.1:1/rezen_mcp_test");
  });

  it("needs a DATABASE_URL", () => {
    expect(() => createDatabase({ DATABASE_URL: undefined, DB_PROVIDER: "docker" })).toThrow(
      /DATABASE_URL is not set/,
    );
  });

  it("closes cleanly when it never connected", async () => {
    const database = createDatabase({ DATABASE_URL: UNREACHABLE, DB_PROVIDER: "docker" });
    await expect(database.close()).resolves.toBeUndefined();
  });
});

describe("check", () => {
  it("reports an unreachable server with the hint for the docker provider", async () => {
    const database = track(createDatabase({ DATABASE_URL: UNREACHABLE, DB_PROVIDER: "docker" }));
    const error = await database.check().then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as DatabaseError).kind).toBe("unreachable");
    expect((error as DatabaseError).message).toContain("127.0.0.1:1/rezen_mcp_test");
    expect((error as DatabaseError).message).toContain("pnpm db:up");
  });

  it("gives the local provider its own hint and never mentions starting a container first", async () => {
    const database = track(createDatabase({ DATABASE_URL: UNREACHABLE, DB_PROVIDER: "local" }));
    const error = await database.check().then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect((error as DatabaseError).kind).toBe("unreachable");
    expect((error as DatabaseError).message).toContain("local PostgreSQL server is running");
  });

  it("never puts the password in the message", async () => {
    const database = track(createDatabase({ DATABASE_URL: UNREACHABLE, DB_PROVIDER: "docker" }));
    const error = await database.check().then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect((error as DatabaseError).message).not.toContain("s3cret-pass");
  });
});
