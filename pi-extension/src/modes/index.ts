import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { createToolManager } from "../tools/manager";
import { registerCodeMode } from "./code-mode";
import { registerPlanMode } from "./plan-mode";
import { createModeRegistry } from "./registry";

export function registerModes(pi: ExtensionAPI, tools: ReturnType<typeof createToolManager>) {
  const registry = createModeRegistry();
  registerPlanMode(pi, tools, registry);
  registerCodeMode(pi, tools, registry);
  return registry;
}
