import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getDefaultModel, getModeModel } from "../models/settings";
import type { createToolManager } from "../tools/manager";
import { selectConfiguredModel, updateModeUi } from "./helpers";
import type { Mode } from "./mode";

export interface ModeOptions {
  readonly tools?: readonly string[];
  readonly onEnterMessage?: string;
  readonly onExitMessage?: string;
}

export function createModeManager(pi?: ExtensionAPI, tools?: ReturnType<typeof createToolManager>) {
  const modeTools = tools ?? { setModeTools: (_active: boolean, _names: readonly string[]) => {} };
  const modes = new Map<string, { mode: Mode; options: ModeOptions }>();
  let active: Mode | undefined;
  let switching = false;

  const render = (ctx: ExtensionContext) => { if (ctx.ui) updateModeUi(ctx, active); };
  const notify = (ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info") => { if (ctx.ui) ctx.ui.notify(message, level); };

  async function selectModeModel(ctx: ExtensionContext, mode: Mode | undefined): Promise<void> {
    if (!pi) return;
    await selectConfiguredModel(pi, ctx, mode ? await getModeModel(mode.name) : await getDefaultModel());
  }

  async function switchTo(name: string | undefined, ctx: ExtensionContext): Promise<boolean> {
    if (switching || active?.name === name) return false;
    const next = name ? modes.get(name) : undefined;
    if (name && !next) return false;
    switching = true;
    const previous = active;
    try {
      if (previous) {
        await previous.exit(ctx);
        modeTools.setModeTools(false, modes.get(previous.name)?.options.tools ?? []);
      }
      active = undefined;
      await selectModeModel(ctx, next?.mode);
      if (next) {
        await next.mode.enter(ctx);
        active = next.mode;
        modeTools.setModeTools(true, next.options.tools ?? []);
        render(ctx);
        if (previous) notify(ctx, modes.get(previous.name)?.options.onExitMessage ?? `${previous.name} mode OFF.`);
        notify(ctx, next.options.onEnterMessage ?? `${next.mode.name} mode ON.`);
      } else {
        render(ctx);
        if (previous) notify(ctx, modes.get(previous.name)?.options.onExitMessage ?? `${previous.name} mode OFF.`);
      }
      return true;
    } catch (error) {
      active = undefined;
      try {
        if (previous) {
          await selectModeModel(ctx, previous);
          await previous.enter(ctx);
          active = previous;
          modeTools.setModeTools(true, modes.get(previous.name)?.options.tools ?? []);
          render(ctx);
        } else {
          modeTools.setModeTools(false, []);
          render(ctx);
        }
      } catch {
        active = undefined;
        render(ctx);
      }
      notify(ctx, `Could not switch mode: ${error instanceof Error ? error.message : String(error)}`, "error");
      return false;
    } finally {
      switching = false;
    }
  }

  const manager = {
    register(mode: Mode, options: ModeOptions = {}): void { modes.set(mode.name, { mode, options }); },
    names(): string[] { return [...modes.keys()]; },
    list(): readonly Mode[] { return [...modes.values()].map(({ mode }) => mode); },
    current(): string | undefined { return active?.name; },
    isActive(name: string): boolean { return active?.name === name; },
    get(name: string): Mode | undefined { return modes.get(name)?.mode; },
    activate(name: string, ctx: ExtensionContext): Promise<boolean> { return switchTo(name, ctx); },
    deactivate(ctx: ExtensionContext): Promise<boolean> { return switchTo(undefined, ctx); },
    toggle(name: string, ctx: ExtensionContext): Promise<boolean> { return switchTo(active?.name === name ? undefined : name, ctx); },
    switchTo,
    notifyManualModelChange(): void { active?.onModelSelect(); },
  };

  if (pi) {
    pi.on("model_select", (event) => { if (event.source !== "restore") manager.notifyManualModelChange(); });
    pi.on("turn_end", () => pi.appendEntry("mode-manager", { version: 1, mode: active?.name }));
    pi.on("session_start", async (_event, ctx) => {
      const entries = ctx.sessionManager.getEntries();
      const saved = [...entries].reverse().find((entry) => entry.type === "custom" && (entry.customType === "mode-manager" || entry.customType === "plan-mode")) as { customType?: string; data?: { mode?: string; enabled?: boolean } } | undefined;
      const mode = saved?.data?.mode ?? (saved?.customType === "plan-mode" && saved.data?.enabled ? "plan" : undefined);
      if (mode && modes.has(mode)) await switchTo(mode, ctx);
      else if (mode) notify(ctx, `Saved mode is no longer available: ${mode}`, "warning");
    });
  }

  return manager;
}

/** Temporary compatibility alias while callers migrate to ModeManager. */
export const createModeRegistry = createModeManager;
