import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAskQuestionTool } from "./ask-question";

type ModeToolFactory = () => Parameters<ExtensionAPI["registerTool"]>[0];

export function createToolManager(pi: ExtensionAPI) {
  const modeTools = new Map<string, ModeToolFactory>();
  const registered = new Set<string>();

  pi.registerTool(createAskQuestionTool());

  return {
    registerModeTool(name: string, factory: ModeToolFactory): void { modeTools.set(name, factory); },
    setModeTools(active: boolean, names: readonly string[]): void {
      const managed = new Set(modeTools.keys());
      const current = pi.getActiveTools().filter((name) => !managed.has(name));
      if (active) {
        for (const name of names) {
          const factory = modeTools.get(name);
          if (!factory) continue;
          if (!registered.has(name)) {
            pi.registerTool(factory());
            registered.add(name);
          }
        }
        pi.setActiveTools([...new Set([...current, ...names.filter((name) => modeTools.has(name))])]);
      } else pi.setActiveTools(current);
    },
  };
}
