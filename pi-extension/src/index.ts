import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "./safe-command";
import { registerPlanCommand } from "./plan-mode";
import sandboxExtension from "./sandbox";
export { isSafeCommand };

export default function (pi: ExtensionAPI) {
  // Gondolin VM integration
  sandboxExtension(pi);

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  // Register the /plan command
  registerPlanCommand(pi);

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = (event.input as { command: string }).command;

    if (isSafeCommand(command)) return;

    const ok = await ctx.ui.confirm("Bash command", `Allow:\n\n  ${command}`);

    if (!ok) {
      return {
        block: true,
        reason:
          "User blocks mutating or non-allowlisted bash commands. Stop and wait for next instruction",
      };
    }
  });
}
