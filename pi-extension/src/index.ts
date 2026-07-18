import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "./safe-command";
export { isSafeCommand };

export default function (pi: ExtensionAPI) {  // eslint-disable-line import/export
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = (event.input as { command: string }).command;

    if (isSafeCommand(command)) return;

    const ok = await ctx.ui.confirm(
      "Bash command",
      `Allow:\n\n  ${command}`,
    );

    if (!ok) {
      return { block: true, reason: "Blocked by user" };
    }
  });
}
