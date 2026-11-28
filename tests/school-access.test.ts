import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  generateToken,
  openSchoolAccess,
  PostgresTokenStore,
  TokenError,
} from "../src/auth/index.js";
import { generateDataset } from "../src/data/synthetic.js";
import { PostgresRepository } from "../src/db/index.js";
import { createServer } from "../src/server.js";
import { connectTo } from "./helpers.js";
import { seededDatabase } from "./support/postgres-subject.js";
import type { TestDatabase } from "./support/test-database.js";

// How a server learns who is calling (ADR-022), end to end: from a token, through
// to what a real MCP client can read.
const dataset = generateDataset();
const SCHOOL_A = "sch_demo_a";
const SCHOOL_B = "sch_demo_b";

const classOf = (schoolId: string) =>
  dataset.classes.find((c) => c.schoolId === schoolId)?.id ?? "";
const studentOf = (schoolId: string) => {
  const cls = classOf(schoolId);
  return dataset.students.find((s) => s.classId === cls)?.id ?? "";
};

async function errorOf(promise: Promise<unknown>): Promise<TokenError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TokenError);
  return error as TokenError;
}

describe("openSchoolAccess (tokens over Postgres)", () => {
  let db: TestDatabase;
  let tokens: PostgresTokenStore;
  let store: {
    repositoryFor: (schoolId: string) => PostgresRepository;
    tokens: PostgresTokenStore;
  };
  const clients: Client[] = [];

  beforeAll(async () => {
    db = await seededDatabase(dataset);
    tokens = new PostgresTokenStore(db);
    // The way the real store builds it: every school's repository is restricted by Postgres (ADR-024).
    store = {
      repositoryFor: (schoolId) => new PostgresRepository(db, { restrictedToSchool: schoolId }),
      tokens,
    };
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
  });

  afterAll(async () => {
    await db?.close();
  });

  /** The whole path: a token in, a real MCP client out. */
  async function clientForToken(token: string): Promise<Client> {
    const access = await openSchoolAccess(store, { SCHOOL_TOKEN: token });
    const client = await connectTo(createServer(access.repository));
    clients.push(client);
    return client;
  }

  it("serves the school the token belongs to, and only that school", async () => {
    for (const [mine, theirs] of [
      [SCHOOL_A, SCHOOL_B],
      [SCHOOL_B, SCHOOL_A],
    ] as const) {
      const client = await clientForToken((await tokens.issue(mine)).token);

      const list = await client.callTool({ name: "list_classes", arguments: {} });
      expect(list.isError).toBeFalsy();
      const data = list.structuredContent as { classes: { id: string }[] };
      expect(data.classes.map((c) => c.id)).toEqual(
        dataset.classes.filter((c) => c.schoolId === mine).map((c) => c.id),
      );

      const own = await client.callTool({
        name: "rank_class",
        arguments: { classId: classOf(mine) },
      });
      expect(own.isError).toBeFalsy();

      // The other school's IDs, through every tool that takes one, look like unknown IDs.
      for (const [name, args, unknown] of [
        ["get_class_results", { classId: classOf(theirs) }, { classId: "nope" }],
        ["rank_class", { classId: classOf(theirs) }, { classId: "nope" }],
        ["find_missing_scores", { classId: classOf(theirs) }, { classId: "nope" }],
        ["get_student_report", { studentId: studentOf(theirs) }, { studentId: "nope" }],
      ] as const) {
        const foreign = await client.callTool({ name, arguments: args });
        const absent = await client.callTool({ name, arguments: unknown });
        expect(foreign.isError, name).toBe(true);
        // Same shape, and the only difference is the ID the caller typed.
        const text = (r: typeof foreign) => JSON.stringify(r.content);
        expect(text(foreign).replace(Object.values(args)[0] as string, "ID"), name).toBe(
          text(absent).replace("nope", "ID"),
        );
      }
    }
  });

  it("cannot be steered to another school by an argument", async () => {
    const client = await clientForToken((await tokens.issue(SCHOOL_A)).token);
    const result = await client.callTool({
      name: "list_classes",
      arguments: { schoolId: SCHOOL_B },
    });
    expect((result.structuredContent as { school: string }).school).toBe("Demo School A");
  });

  it("stops when SCHOOL_TOKEN is not set, and says how to make one", async () => {
    const error = await errorOf(openSchoolAccess(store, {}));
    expect(error.kind).toBe("token-missing");
    expect(error.message).toContain("pnpm db:token issue");
  });

  it("gives one message for a malformed, unknown and revoked token, without the token", async () => {
    const revoked = await tokens.issue(SCHOOL_A);
    await tokens.revoke(revoked.id);
    const values = ["garbage", generateToken(), revoked.token];

    const errors = await Promise.all(
      values.map((token) => errorOf(openSchoolAccess(store, { SCHOOL_TOKEN: token }))),
    );
    for (const [i, error] of errors.entries()) {
      expect(error.kind).toBe("token-rejected");
      expect(error.message).toBe(errors[0]?.message);
      expect(error.message).not.toContain(values[i] as string);
    }
  });

  it("stops serving a token once it is revoked and the server is started again", async () => {
    const issued = await tokens.issue(SCHOOL_A);
    await clientForToken(issued.token);
    await tokens.revoke(issued.id);
    const error = await errorOf(openSchoolAccess(store, { SCHOOL_TOKEN: issued.token }));
    expect(error.kind).toBe("token-rejected");
  });

  it("stops, naming the school, if a token's school is not in the data", async () => {
    // Cannot happen with a real token (it refers to a school by foreign key), so this
    // is the defence in depth, with a store that vouches for a school that is not there.
    const vouching = {
      repositoryFor: store.repositoryFor,
      tokens: { verify: async () => ({ tokenId: "t", schoolId: "sch_nope" }) },
    };
    const error = await errorOf(openSchoolAccess(vouching, { SCHOOL_TOKEN: generateToken() }));
    expect(error.kind).toBe("unknown-school");
    expect(error.message).toContain("sch_nope");
  });
});
