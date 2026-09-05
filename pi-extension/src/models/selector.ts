import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { formatModelIdentity, getModeModel } from "./settings";

export function modelLabel(model: Model<any>): string {
  return formatModelIdentity(model.provider, model.id);
}

export async function selectModel(ctx: ExtensionContext): Promise<Model<any> | undefined> {
  const models = ctx.modelRegistry.getAvailable();
  if (!models.length) {
    ctx.ui.notify("No models available.", "warning");
    return undefined;
  }
  const choice = await ctx.ui.select("Select model", models.map(modelLabel));
  return choice ? models.find((model) => modelLabel(model) === choice) : undefined;
}

export async function showModeAssignments(ctx: ExtensionContext, modes: string[]): Promise<void> {
  const lines = await Promise.all(modes.map(async (mode) => {
    const configured = await getModeModel(mode);
    return `${mode}: ${configured ? formatModelIdentity(configured.provider, configured.modelId) : "default model"}`;
  }));
  ctx.ui.notify(lines.join("\n"), "info");
}
