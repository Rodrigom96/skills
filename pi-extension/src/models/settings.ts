import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Settings {
  [key: string]: unknown;
}
export interface ModelIdentity { provider: string; modelId: string }

export function parseModelIdentity(value: unknown): ModelIdentity | undefined {
  if (typeof value !== "string") return undefined;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return undefined;
  const provider = value.slice(0, slash);
  const modelId = value.slice(slash + 1);
  return provider && modelId ? { provider, modelId } : undefined;
}

export function formatModelIdentity(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

export function settingsPath(): string {
  return join(homedir(), ".pi", "agent", "settings.json");
}

export async function readSettings(path = settingsPath()): Promise<Settings> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Settings : {};
  } catch {
    return {};
  }
}

export async function getModeModel(mode: string, path?: string): Promise<ModelIdentity | undefined> {
  const settings = await readSettings(path);
  const modes = settings.modes;
  if (!modes || typeof modes !== "object" || Array.isArray(modes)) return undefined;
  const entry = (modes as Record<string, unknown>)[mode];
  const value = entry && typeof entry === "object" && !Array.isArray(entry)
    ? (entry as Record<string, unknown>).model : undefined;
  return parseModelIdentity(value);
}



export async function getDefaultModel(path?: string): Promise<ModelIdentity | undefined> {
  const settings = await readSettings(path);
  if (typeof settings.defaultProvider !== "string" || typeof settings.defaultModel !== "string") return undefined;
  return parseModelIdentity(formatModelIdentity(settings.defaultProvider, settings.defaultModel));
}

export async function setModeModel(mode: string, identity: string | undefined, path = settingsPath()): Promise<void> {
  const settings = await readSettings(path);
  const modes = settings.modes && typeof settings.modes === "object" && !Array.isArray(settings.modes)
    ? { ...(settings.modes as Record<string, unknown>) } : {};
  if (identity === undefined) delete modes[mode];
  else modes[mode] = { ...(modes[mode] && typeof modes[mode] === "object" ? modes[mode] as object : {}), model: identity };
  if (Object.keys(modes).length) settings.modes = modes;
  else delete settings.modes;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}
