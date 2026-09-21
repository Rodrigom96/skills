import assert from "node:assert";
import { createAskUserTool } from "../src/tools/ask-user";

const tool = createAskUserTool();

function context(select: (question: string, options: string[]) => Promise<string | undefined>, input = "") {
  return {
    hasUI: true,
    ui: { select, input: async () => input },
  } as any;
}

async function main() {
  assert.strictEqual(tool.name, "ask_user");

  const predefined = await tool.execute("1", {
    question: "Choose",
    options: [
      { answer: " yes ", description: "  Use yes  " },
      { answer: " ", description: "ignored" },
    ],
  }, undefined, undefined, context(async (_question, options) => {
    assert.deepStrictEqual(options, ["\u001b[1myes\u001b[22m — Use yes", "Other…"]);
    return options[0];
  }));
  assert.strictEqual(predefined.details.answer, "yes");
  assert.strictEqual(predefined.details.wasCustom, false);
  assert.deepStrictEqual(predefined.details.options, [{ answer: "yes", description: "Use yes" }]);

  const custom = await tool.execute("2", {
    question: "Choose",
    options: [{ answer: "yes", description: "Use yes" }],
  }, undefined, undefined, context(async (_question, options) => options[1], "my own answer"));
  assert.strictEqual(custom.details.answer, "my own answer");
  assert.strictEqual(custom.details.wasCustom, true);

  console.log("✅ Ask question tests passed");
}

void main();
