import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "../safe-command";
import { getDefaultModel, getModeModel, type ModelIdentity } from "../models/settings";
import { createModeRegistry } from "./registry";

const PLANS_DIR = ".plans/";
interface PlanModeState { enabled: boolean; }

function isPathInPlans(path: string): boolean {
  return path === ".plans" || path.startsWith(PLANS_DIR) || path.startsWith("./" + PLANS_DIR) || path.includes("/.plans/");
}

export function registerPlanCommand(pi: ExtensionAPI) {
  const registry = createModeRegistry(pi);
  let planModeEnabled = false;
  let manualModelChange = false;
  let automaticModelChange = false;

  async function selectConfigured(ctx: ExtensionContext, configured: ModelIdentity | undefined): Promise<void> {
    if (!configured) return;
    const model = ctx.modelRegistry.find(configured.provider, configured.modelId);
    if (!model) return;
    automaticModelChange = true;
    try {
      if (await pi.setModel(model)) ctx.ui.notify(`Model: ${configured.provider}/${configured.modelId}`, "info");
    } finally {
      automaticModelChange = false;
    }
  }

  function ensureFinishPlanTool(active: boolean): void {
    const currentTools = pi.getAllTools().map((t) => t.name);
    if (active && !currentTools.includes("finish_plan")) {
      pi.registerTool({
        name: "finish_plan", label: "Finish Plan",
        description: "Signal that planning is complete. Shows a selector to implement the plan or continue refining it.",
        parameters: Type.Object({ planFilePath: Type.String({ description: "Path to the plan file in .plans/" }) }),
        async execute(_id, params, _signal, _update, ctx) { return handleFinishPlan(params.planFilePath, ctx); },
      });
    } else if (active && currentTools.includes("finish_plan") && !pi.getActiveTools().includes("finish_plan")) {
      pi.setActiveTools([...pi.getActiveTools(), "finish_plan"]);
    } else if (!active && currentTools.includes("finish_plan")) {
      pi.setActiveTools(pi.getActiveTools().filter((n) => n !== "finish_plan"));
    }
  }

  const planMode = {
    name: "plan",
    async enter(ctx: ExtensionContext) {
      planModeEnabled = true;
      manualModelChange = false;
      await selectConfigured(ctx, await getModeModel("plan"));
      ctx.ui.setWidget("plan-mode", [ctx.ui.theme.fg("warning", "⏸ plan: write to .plans/ only")], { placement: "belowEditor" });
      ctx.ui.notify("Plan mode ON: write/edit restricted to .plans/. Use finish_plan when done.", "info");
      ensureFinishPlanTool(true);
    },
    async exit(ctx: ExtensionContext) {
      if (!manualModelChange) await selectConfigured(ctx, await getDefaultModel());
      planModeEnabled = false;
      manualModelChange = false;
      ctx.ui.setWidget("plan-mode", undefined);
      ctx.ui.notify("Plan mode OFF. All tools restored.", "info");
      ensureFinishPlanTool(false);
    },
    onModelSelect() { if (!automaticModelChange && planModeEnabled) manualModelChange = true; },
  };
  registry.register(planMode);

  async function setPlanMode(enabled: boolean, ctx: ExtensionContext): Promise<void> {
    await registry.switchTo(enabled ? "plan" : undefined, ctx);
  }

  pi.registerCommand("plan", {
    description: "Toggle plan mode or invoke plan skill: /plan <description>",
    handler: async (args, ctx) => {
      const input = args.trim();
      if (input) {
        await setPlanMode(true, ctx);
        pi.sendUserMessage(`/skill:plan ${input}`, { deliverAs: "followUp" });
      } else {
        await setPlanMode(registry.current() !== "plan", ctx);
      }
    },
  });
  pi.registerCommand("plan-lazy", {
    description: "Toggle plan mode and invoke plan + lazy-dev skills for minimal solutions: /plan-lazy <description>",
    handler: async (args, ctx) => {
      const input = args.trim();
      if (!input) return void ctx.ui.notify("Usage: /plan-lazy <description>", "warning");
      await setPlanMode(true, ctx);
      pi.sendUserMessage(`/skill:plan ${input} (call lazy-dev skill to build this plan) /skill:lazy-dev`, { deliverAs: "followUp" });
    },
  });

  pi.on("before_agent_start", async () => planModeEnabled ? ({ message: {
    customType: "plan-mode-context",
    content: "[PLAN MODE ACTIVE]\nYou are in plan mode - a read-only exploration mode.\n\nRestrictions:\n- You must ONLY write/edit files within the .plans/ directory\n- You must NEVER attempt to implement the plan or modify code outside .plans/\n- Use read, grep, find, ls, and safe bash commands to explore the codebase\n- Create a detailed, numbered plan describing each step you would take\n\nWhen your plan is complete and ready for implementation, call the finish_plan tool.\nDo NOT start implementing - just call finish_plan when planning is done.", display: false,
  } }) : undefined);

  pi.on("tool_call", async (event) => {
    if (!planModeEnabled) return;
    if ((event.toolName === "write" || event.toolName === "edit") && !isPathInPlans((event.input as { path: string }).path)) return { block: true, reason: `Plan mode: writes restricted to .plans/. Got: ${(event.input as { path: string }).path}` };
    if (event.toolName === "bash" && !isSafeCommand((event.input as { command: string }).command)) return { block: true, reason: `Plan mode: bash blocked: ${(event.input as { command: string }).command}` };
  });
  pi.on("model_select", (event) => { if (event.source !== "restore") registry.notifyManualModelChange(); });
  pi.on("turn_end", () => pi.appendEntry("plan-mode", { enabled: planModeEnabled }));
  pi.on("session_start", async (_event, ctx) => {
    const saved = ctx.sessionManager.getEntries().find((e) => e.type === "custom" && e.customType === "plan-mode") as { data?: PlanModeState } | undefined;
    if (saved?.data?.enabled) await setPlanMode(true, ctx);
  });

  async function handleFinishPlan(planFilePath: string, ctx: ExtensionContext) {
    if (!isPathInPlans(planFilePath)) return { content: [{ type: "text" as const, text: `Error: plan must be in .plans/. Got: ${planFilePath}` }], details: {} };
    const choice = await ctx.ui.select("Plan ready! What next?", ["Implement on this session", "Continue planning"]);
    if (!choice) return { content: [{ type: "text" as const, text: "Selector cancelled. Continue planning." }], details: {} };
    if (choice === "Continue planning") return { content: [{ type: "text" as const, text: `Plan saved to ${planFilePath}. Continue refining.` }], details: {} };
    await setPlanMode(false, ctx);
    return { content: [{ type: "text" as const, text: `User accepted the plan. Implement ${planFilePath}.` }], details: {} };
  }

  return registry;
}
