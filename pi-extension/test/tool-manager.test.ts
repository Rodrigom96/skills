import assert from "node:assert";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createToolManager } from "../src/tools/manager";

const registered: string[] = [];
let active = ["read", "finish_plan", "write"];
const pi = {
  registerTool(tool: { name: string }) { registered.push(tool.name); },
  getActiveTools() { return active; },
  setActiveTools(names: string[]) { active = names; },
} as unknown as ExtensionAPI;

const manager = createToolManager(pi, async () => ({ content: [{ type: "text", text: "done" }], details: {} }));
assert.deepStrictEqual(registered, ["ask_question"]);
manager.setPlanMode(true);
assert.deepStrictEqual(registered, ["ask_question", "finish_plan"]);
assert.deepStrictEqual(active, ["read", "write", "finish_plan"]);
manager.setPlanMode(true);
assert.deepStrictEqual(registered, ["ask_question", "finish_plan"]);
assert.deepStrictEqual(active, ["read", "write", "finish_plan"]);
manager.setPlanMode(false);
assert.deepStrictEqual(active, ["read", "write"]);
manager.setPlanMode(true);
assert.deepStrictEqual(registered, ["ask_question", "finish_plan"]);
assert.deepStrictEqual(active, ["read", "write", "finish_plan"]);
console.log("✅ Tool manager tests passed");
