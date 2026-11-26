import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryRepository } from "../src/data/repository.js";
import { gradingRulesText } from "../src/domain/grading.js";
import { connect } from "./helpers.js";

function promptText(result: { messages: { content: unknown }[] }): string {
  return (result.messages[0]?.content as { text: string }).text;
}

describe("resources and prompts", () => {
  let client: Client;

  beforeEach(async () => {
    client = await connect(createInMemoryRepository(), "sch_demo_a");
  });
  afterEach(async () => {
    await client.close();
  });

  it("advertises the grading rules resource", async () => {
    const { resources } = await client.listResources();
    const rules = resources.find((r) => r.uri === "rezen://grading-rules");
    expect(rules).toBeDefined();
    expect(rules?.mimeType).toBe("text/markdown");
  });

  it("serves rules that match the code", async () => {
    const result = await client.readResource({ uri: "rezen://grading-rules" });
    const content = result.contents[0] as { text: string };
    expect(content.text).toBe(gradingRulesText());
    expect(content.text).toContain("- A: 70 to 100");
    expect(content.text).toContain("1, 2, 2, 4");
  });

  it("advertises the summary prompt with a required class and optional term", async () => {
    const { prompts } = await client.listPrompts();
    const prompt = prompts.find((p) => p.name === "summarise_class_term");
    expect(prompt).toBeDefined();
    const args = Object.fromEntries((prompt?.arguments ?? []).map((a) => [a.name, a.required]));
    expect(args).toEqual({ classId: true, term: false });
  });

  it("builds a prompt that names the tools, the class and the term", async () => {
    const result = await client.getPrompt({
      name: "summarise_class_term",
      arguments: { classId: "sch_demo_a_c1", term: "2026-T1" },
    });
    expect(result.messages[0]?.role).toBe("user");
    const text = promptText(result);
    expect(text).toContain("sch_demo_a_c1");
    expect(text).toContain("term 2026-T1");
    for (const tool of ["rank_class", "get_class_results", "find_missing_scores"]) {
      expect(text).toContain(tool);
    }
    expect(text).toContain("Never treat a missing score as zero");
  });

  it("refers to the current term when no term is given", async () => {
    const result = await client.getPrompt({
      name: "summarise_class_term",
      arguments: { classId: "sch_demo_a_c1" },
    });
    const text = promptText(result);
    expect(text).toContain("the current term");
    expect(text).not.toContain("latest term");
  });

  it("rejects a prompt request without a class", async () => {
    await expect(
      client.getPrompt({ name: "summarise_class_term", arguments: {} }),
    ).rejects.toThrow();
  });
});
