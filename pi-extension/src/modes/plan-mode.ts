import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "../safe-command";
import { getDefaultModel, getModeModel } from "../models/settings";
import type { createToolManager } from "../tools/manager";
import type { FinishPlanResult } from "../tools/finish-plan";
import { selectConfiguredModel, updateModeUi } from "./helpers";
import { Mode } from "./mode";
import type { createModeRegistry } from "./registry";

const PLANS_DIR = ".plans/";
interface PlanModeState { enabled?: boolean; mode?: string; }

function isPathInPlans(path: string): boolean {
  return path === ".plans" || path.startsWith(PLANS_DIR) || path.startsWith("./" + PLANS_DIR) || path.includes("/.plans/");
}

class PlanMode extends Mode {
  private planModeEnabled = false;
  private manualModelChange = false;
  private automaticModelChange = false;

  constructor(private readonly pi: ExtensionAPI, private readonly tools: ReturnType<typeof createToolManager>) {
    super("plan", "📝");
  }

  get enabled(): boolean { return this.planModeEnabled; }

  private async selectConfigured(ctx: ExtensionContext, configured: Awaited<ReturnType<typeof getModeModel>>): Promise<void> {
    if (!configured) return;
    this.automaticModelChange = true;
    try {
      await selectConfiguredModel(this.pi, ctx, configured);
    } finally {
      this.automaticModelChange = false;
    }
  }

  async enter(ctx: ExtensionContext): Promise<void> {
    this.planModeEnabled = true;
    this.manualModelChange = false;
    await this.selectConfigured(ctx, await getModeModel("plan"));
    updateModeUi(ctx, this);
    ctx.ui.notify("Plan mode ON: write/edit restricted to .plans/. Use finish_plan when done.", "info");
    this.tools.setPlanMode(true);
  }

  async exit(ctx: ExtensionContext): Promise<void> {
    if (!this.manualModelChange) await this.selectConfigured(ctx, await getDefaultModel());
    this.planModeEnabled = false;
    this.manualModelChange = false;
    updateModeUi(ctx, undefined);
    ctx.ui.notify("Plan mode OFF. All tools restored.", "info");
    this.tools.setPlanMode(false);
  }

  onModelSelect(): void {
    if (!this.automaticModelChange && this.planModeEnabled) this.manualModelChange = true;
  }
}

async function handleFinishPlan(
  planFilePath: string,
  ctx: ExtensionContext,
  registry: ReturnType<typeof createModeRegistry>,
): Promise<FinishPlanResult> {
  if (!isPathInPlans(planFilePath)) return { content: [{ type: "text" as const, text: `Error: plan must be in .plans/. Got: ${planFilePath}` }], details: {} };
  const choice = await ctx.ui.select("Plan ready! What next?", ["Implement on this session", "Continue planning"]);
  if (!choice) return { content: [{ type: "text" as const, text: "Selector cancelled. Continue planning." }], details: {} };
  if (choice === "Continue planning") return { content: [{ type: "text" as const, text: `Plan saved to ${planFilePath}. Continue refining.` }], details: {} };
  await registry.switchTo("code", ctx);
  return { content: [{ type: "text" as const, text: `User accepted the plan. Implement ${planFilePath}.` }], details: {} };
}

export function registerPlanMode(
  pi: ExtensionAPI,
  tools: ReturnType<typeof createToolManager>,
  registry: ReturnType<typeof createModeRegistry>,
) {
  const planMode = new PlanMode(pi, tools);
  registry.register(planMode);

  const setPlanMode = (enabled: boolean, ctx: ExtensionContext) => registry.switchTo(enabled ? "plan" : undefined, ctx);
  pi.registerCommand("plan", {
    description: "Toggle plan mode or invoke plan skill: /plan <description>",
    handler: async (args, ctx) => {
      const input = args.trim();
      if (input) {
        await setPlanMode(true, ctx);
        pi.sendUserMessage(`/skill:plan ${input}`, { deliverAs: "followUp" });
      } else await setPlanMode(registry.current() !== "plan", ctx);
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

  pi.on("before_agent_start", async () => planMode.enabled ? ({ message: {
    customType: "plan-mode-context",
    content: "[PLAN MODE ACTIVE]\nYou are in plan mode - a read-only exploration mode.\n\nRestrictions:\n- You must ONLY write/edit files within the .plans/ directory\n- You must NEVER attempt to implement the plan or modify code outside .plans/\n- Use read, grep, find, ls, and safe bash commands to explore the codebase\n- Create a detailed, numbered plan describing each step you would take\n\nWhen your plan is complete and ready for implementation, call the finish_plan tool.\nDo NOT start implementing - just call finish_plan when planning is done.", display: false,
  } }) : undefined);

  pi.on("tool_call", async (event) => {
    if (!planMode.enabled) return;
    if ((event.toolName === "write" || event.toolName === "edit") && !isPathInPlans((event.input as { path: string }).path)) return { block: true, reason: `Plan mode: writes restricted to .plans/. Got: ${(event.input as { path: string }).path}` };
    if (event.toolName === "bash" && !isSafeCommand((event.input as { command: string }).command)) return { block: true, reason: `Plan mode: bash blocked: ${(event.input as { command: string }).command}` };
  });
  pi.on("model_select", (event) => { if (event.source !== "restore") registry.notifyManualModelChange(); });
  pi.on("turn_end", () => pi.appendEntry("plan-mode", { enabled: planMode.enabled, mode: registry.current() }));
  pi.on("session_start", async (_event, ctx) => {
    const saved = [...ctx.sessionManager.getEntries()].reverse().find((e) => e.type === "custom" && e.customType === "plan-mode") as { data?: PlanModeState } | undefined;
    const mode = saved?.data?.mode ?? (saved?.data?.enabled ? "plan" : undefined);
    if (mode) await registry.switchTo(mode, ctx);
  });

  tools.setFinishPlanHandler((path, ctx) => handleFinishPlan(path, ctx, registry));
  return registry;
}
