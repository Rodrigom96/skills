import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAskQuestionTool } from "./ask-question";
import { createFinishPlanTool, type FinishPlanHandler } from "./finish-plan";

export function createToolManager(pi: ExtensionAPI, onFinishPlan?: FinishPlanHandler) {
  let finishPlanRegistered = false;
  let finishPlanHandler = onFinishPlan;
  pi.registerTool(createAskQuestionTool());

  return {
    setFinishPlanHandler(handler: FinishPlanHandler): void { finishPlanHandler = handler; },
    setPlanMode(active: boolean): void {
      if (active && !finishPlanRegistered) {
        if (!finishPlanHandler) throw new Error("finish_plan handler is not configured");
        pi.registerTool(createFinishPlanTool(finishPlanHandler));
        finishPlanRegistered = true;
      }
      const tools = pi.getActiveTools().filter((name) => name !== "finish_plan");
      pi.setActiveTools(active ? [...tools, "finish_plan"] : tools);
    },
  };
}
