import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "./safe-command";

const PLANS_DIR = ".plans/";

interface PlanModeState {
  enabled: boolean;
}

function isPathInPlans(path: string): boolean {
  return path === ".plans" || path.startsWith(PLANS_DIR) || path.startsWith("./" + PLANS_DIR) || path.includes("/.plans/");
}

export function registerPlanCommand(pi: ExtensionAPI): void {
  let planModeEnabled = false;

  function setPlanMode(enabled: boolean, ctx: ExtensionContext): void {
    planModeEnabled = enabled;

    if (planModeEnabled) {
      ctx.ui.setStatus(
        "plan-mode",
        ctx.ui.theme.fg("warning", "⏸ plan: write to .plans/ only"),
      );
      ctx.ui.notify(
        "Plan mode ON: write/edit restricted to .plans/. Use finish_plan when done.",
        "info",
      );
      ensureFinishPlanTool(true);
    } else {
      ctx.ui.setStatus("plan-mode", undefined);
      ctx.ui.notify("Plan mode OFF. All tools restored.", "info");
      ensureFinishPlanTool(false);
    }
  }

  function ensureFinishPlanTool(active: boolean): void {
    const currentTools = pi.getAllTools().map((t) => t.name);

    if (active && !currentTools.includes("finish_plan")) {
      pi.registerTool({
        name: "finish_plan",
        label: "Finish Plan",
        description:
          "Signal that planning is complete. Shows a selector to implement the plan or continue refining it.",
        parameters: Type.Object({
          planFilePath: Type.String({
            description: "Path to the plan file in .plans/ (e.g., '.plans/add-login.md')",
          }),
        }),
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
          return await handleFinishPlan(params.planFilePath, ctx);
        },
      });
    } else if (!active && currentTools.includes("finish_plan")) {
      const others = currentTools.filter((n) => n !== "finish_plan");
      pi.setActiveTools(others);
    }
  }

  pi.registerCommand("plan", {
    description: "Toggle plan mode or invoke plan skill: /plan <description>",
    handler: async (args, ctx) => {
      const input = args.trim();

      if (input) {
        // Enable plan mode first, then invoke the plan skill
        setPlanMode(true, ctx);
        pi.sendUserMessage(`/skill:plan ${input}`, { deliverAs: "followUp" });
      } else {
        // Legacy toggle behavior (backward compatibility)
        setPlanMode(!planModeEnabled, ctx);
      }
    },
  });

  pi.registerCommand("plan-lazy", {
    description:
      "Toggle plan mode and invoke plan + lazy-dev skills for minimal solutions: /plan-lazy <description>",
    handler: async (args, ctx) => {
      const input = args.trim();

      if (input) {
        // Enable plan mode first, then invoke the plan skill with lazy-dev instructions
        setPlanMode(true, ctx);
        pi.sendUserMessage(
          `/skill:plan ${input} (call lazy-dev skill to build this plan) /skill:lazy-dev`,
          { deliverAs: "followUp" },
        );
      } else {
        ctx.ui.notify("Usage: /plan-lazy <description>", "warning");
      }
    },
  });

  // Inject plan mode context before agent starts
  pi.on("before_agent_start", async () => {
    if (!planModeEnabled) return;
    return {
      message: {
        customType: "plan-mode-context",
        content: "[PLAN MODE ACTIVE]\nYou are in plan mode - a read-only exploration mode.\n\nRestrictions:\n- You must ONLY write/edit files within the .plans/ directory\n- You must NEVER attempt to implement the plan or modify code outside .plans/\n- Use read, grep, find, ls, and safe bash commands to explore the codebase\n- Create a detailed, numbered plan describing each step you would take\n\nWhen your plan is complete and ready for implementation, call the finish_plan tool.\nDo NOT start implementing - just call finish_plan when planning is done.",
        display: false,
      },
    };
  });

  // Block tool calls that violate plan mode rules
  pi.on("tool_call", async (event, _ctx) => {
    if (!planModeEnabled) return;

    if (event.toolName === "write" || event.toolName === "edit") {
      const path = (event.input as { path: string }).path;
      if (!isPathInPlans(path)) {
        return {
          block: true,
          reason: `Plan mode: writes restricted to .plans/. Got: ${path}`,
        };
      }
    }

    if (event.toolName === "bash") {
      const command = (event.input as { command: string }).command;
      if (!isSafeCommand(command)) {
        return {
          block: true,
          reason: `Plan mode: bash blocked: ${command}`,
        };
      }
    }
  });

  // Persist plan-mode state across turns
  pi.on("turn_end", () => {
    pi.appendEntry("plan-mode", { enabled: planModeEnabled });
  });

  // Restore plan-mode state on session start
  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const saved = entries.find(
      (e) => e.type === "custom" && e.customType === "plan-mode",
    ) as { type: "custom"; customType: "plan-mode"; data?: PlanModeState } | undefined;

    if (saved?.data?.enabled) {
      setPlanMode(true, ctx);
    }
  });

  async function handleFinishPlan(planFilePath: string, ctx: ExtensionContext) {
    if (!isPathInPlans(planFilePath)) {
      return {
        content: [
          { type: "text", text: `Error: plan must be in .plans/. Got: ${planFilePath}` },
        ],
        details: {},
      };
    }

    const choice = await ctx.ui.select("Plan ready! What next?", [
      "Implement on this session",
      "Continue planning",
    ]);

    if (!choice) {
      return {
        content: [{ type: "text", text: "Selector cancelled. Continue planning." }],
        details: {},
      };
    }

    if (choice === "Continue planning") {
      return {
        content: [{ type: "text", text: `Plan saved to ${planFilePath}. Continue refining.` }],
        details: {},
      };
    }

    // Deactivate plan mode
    planModeEnabled = false;
    ctx.ui.setStatus("plan-mode", undefined);
    ensureFinishPlanTool(false);

    return {
      content: [
        { type: "text", text: `User accepted the plan. Implement ${planFilePath}.` },
      ],
      details: {},
    };
  }
}
