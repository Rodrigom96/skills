import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Mode } from "./mode";

export function createModeRegistry(_pi: ExtensionAPI) {
  const modes = new Map<string, Mode>();
  let active: Mode | undefined;
  return {
    register(mode: Mode): void { modes.set(mode.name, mode); },
    names(): string[] { return [...modes.keys()]; },
    current(): string | undefined { return active?.name; },
    get(name: string): Mode | undefined { return modes.get(name); },
    async switchTo(name: string | undefined, ctx: ExtensionContext): Promise<boolean> {
      if (active?.name === name) return false;
      const next = name ? modes.get(name) : undefined;
      if (name && !next) return false;
      if (active) await active.exit(ctx);
      active = next;
      if (active) await active.enter(ctx);
      return true;
    },
    notifyManualModelChange(): void { active?.onModelSelect?.(); },
  };
}
