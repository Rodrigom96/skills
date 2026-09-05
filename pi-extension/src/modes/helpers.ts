import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Mode } from "./mode";
import type { ModelIdentity } from "../models/settings";

export async function selectConfiguredModel(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  configured: ModelIdentity | undefined,
): Promise<void> {
  if (!configured) return;
  const model = ctx.modelRegistry.find(configured.provider, configured.modelId);
  if (model && await pi.setModel(model)) {
    ctx.ui.notify(`Model: ${configured.provider}/${configured.modelId}`, "info");
  }
}

export function updateModeUi(ctx: ExtensionContext, mode: Mode | undefined): void {
  const content = mode ? [ctx.ui.theme.fg("accent", `Mode: ${mode.icon} ${mode.name}`)] : undefined;
  ctx.ui.setWidget("mode", content, content ? { placement: "belowEditor" } : undefined);
}
