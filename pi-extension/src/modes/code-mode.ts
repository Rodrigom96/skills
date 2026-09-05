import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { createToolManager } from "../tools/manager";
import { Mode } from "./mode";
import type { createModeManager } from "./manager";

class CodeMode extends Mode {
  constructor() {
    super("code", "💻", "Implement and modify the project.");
  }

  async enter(_ctx: ExtensionContext): Promise<void> {}

  async exit(_ctx: ExtensionContext): Promise<void> {}
}

export function registerCodeMode(
  pi: ExtensionAPI,
  tools: ReturnType<typeof createToolManager>,
  registry: ReturnType<typeof createModeManager>,
): Mode {
  const mode = new CodeMode();
  registry.register(mode, { onEnterMessage: "Code mode ON.", onExitMessage: "Code mode OFF." });
  pi.registerCommand("code", {
    description: "Toggle code mode or implement a plan: /code <plan file>",
    handler: async (args, ctx) => {
      const input = args.trim();
      if (input) {
        await registry.switchTo("code", ctx);
        pi.sendUserMessage(`Implement ${input}.`, { deliverAs: "followUp" });
      } else {
        await registry.switchTo(registry.current() === "code" ? undefined : "code", ctx);
      }
    },
  });
  return mode;
}
