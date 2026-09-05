import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getDefaultModel, getModeModel } from "../models/settings";
import type { createToolManager } from "../tools/manager";
import { selectConfiguredModel, updateModeUi } from "./helpers";
import { Mode } from "./mode";
import type { createModeRegistry } from "./registry";

class CodeMode extends Mode {
  constructor(private readonly pi: ExtensionAPI, private readonly tools: ReturnType<typeof createToolManager>) {
    super("code", "💻");
  }

  async enter(ctx: ExtensionContext): Promise<void> {
    await selectConfiguredModel(this.pi, ctx, await getModeModel("code"));
    updateModeUi(ctx, this);
    ctx.ui.notify("Code mode ON.", "info");
    this.tools.setPlanMode(false);
  }

  async exit(ctx: ExtensionContext): Promise<void> {
    await selectConfiguredModel(this.pi, ctx, await getDefaultModel());
    updateModeUi(ctx, undefined);
    ctx.ui.notify("Code mode OFF.", "info");
    this.tools.setPlanMode(false);
  }
}

export function registerCodeMode(
  pi: ExtensionAPI,
  tools: ReturnType<typeof createToolManager>,
  registry: ReturnType<typeof createModeRegistry>,
): Mode {
  const mode = new CodeMode(pi, tools);
  registry.register(mode);
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
