import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "../safe-command";
import type { createToolManager } from "../tools/manager";
import type { FinishPlanResult } from "../tools/finish-plan";
import { Mode } from "./mode";
import type { createModeManager } from "./manager";

const PLANS_DIR = ".plans/";
function isPathInPlans(path: string): boolean {
  return path === ".plans" || path.startsWith(PLANS_DIR) || path.startsWith("./" + PLANS_DIR) || path.includes("/.plans/");
}

class PlanMode extends Mode {
  private planModeEnabled = false;

  constructor() {
    super("plan", "📝", "Explore safely and write plans under .plans/.");
  }

  get enabled(): boolean { return this.planModeEnabled; }

  async enter(ctx: ExtensionContext): Promise<void> {
    this.planModeEnabled = true;

  }

  async exit(ctx: ExtensionContext): Promise<void> {
    this.planModeEnabled = false;
  }
}

async function handleFinishPlan(
  planFilePath: string,
  ctx: ExtensionContext,
  registry: ReturnType<typeof createModeManager>,
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
  registry: ReturnType<typeof createModeManager>,
) {
  const planMode = new PlanMode();
  registry.register(planMode, {
    tools: ["finish_plan"],
    onEnterMessage: "Plan mode ON: write/edit restricted to .plans/. Use finish_plan when done.",
    onExitMessage: "Plan mode OFF. All tools restored.",
  });

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
  tools.setFinishPlanHandler((path, ctx) => handleFinishPlan(path, ctx, registry));
  return registry;
}
