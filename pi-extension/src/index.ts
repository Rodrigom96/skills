import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "./safe-command";
import { registerPlanCommand } from "./modes/plan-mode";
import { modelLabel } from "./models/selector";
import { getModeModel, setModeModel } from "./models/settings";
import sandboxExtension from "./sandbox";
import { createToolManager } from "./tools/manager";
export { isSafeCommand };

export default function (pi: ExtensionAPI) {
  sandboxExtension(pi);
  pi.on("session_start", async (_event, ctx) => ctx.ui.notify("Extension loaded!", "info"));
  const tools = createToolManager(pi);
  const registry = registerPlanCommand(pi, tools);

  pi.registerCommand("mode-model", {
    description: "Configure, view, or reset models assigned to modes",
    handler: async (args, ctx) => {
      const modes = registry.names();
      let mode = args.trim() || undefined;
      if (mode && !modes.includes(mode)) return void ctx.ui.notify(`Unknown mode: ${mode}`, "warning");
      const action = await ctx.ui.select("Mode models", ["Configure", "View", "Reset"]);
      if (!action) return;
      if (action === "View") {
        const lines = await Promise.all(modes.map(async (name) => {
          const configured = await getModeModel(name);
          return `${name}: ${configured ? `${configured.provider}/${configured.modelId}` : "default model"}`;
        }));
        return void ctx.ui.notify(lines.join("\n"), "info");
      }
      mode ??= (await ctx.ui.select("Select mode", modes));
      if (!mode) return;
      if (action === "Reset") {
        try { await setModeModel(mode, undefined); ctx.ui.notify(`${mode} model reset.`, "info"); }
        catch { ctx.ui.notify("Could not write settings.", "error"); }
        return;
      }
      const models = ctx.modelRegistry.getAvailable();
      if (!models.length) return void ctx.ui.notify("No models available.", "warning");
      const choice = await ctx.ui.select("Select model", models.map(modelLabel));
      if (!choice) return;
      try { await setModeModel(mode, choice); ctx.ui.notify(`${mode} model set to ${choice}.`, "info"); }
      catch { ctx.ui.notify("Could not write settings.", "error"); }
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const command = (event.input as { command: string }).command;
    if (isSafeCommand(command)) return;
    if (!(await ctx.ui.confirm("Bash command", `Allow:\n\n  ${command}`))) return { block: true, reason: "User blocks bash commands. Stop and wait for next instruction" };
  });
}
