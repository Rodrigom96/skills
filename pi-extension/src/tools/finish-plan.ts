import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export type FinishPlanResult = {
  content: [{ type: "text"; text: string }];
  details: Record<string, never>;
};
export type FinishPlanHandler = (planFilePath: string, ctx: ExtensionContext) => Promise<FinishPlanResult>;

export function createFinishPlanTool(onFinishPlan: FinishPlanHandler) {
  return {
    name: "finish_plan",
    label: "Finish Plan",
    description: "Signal that planning is complete. Shows a selector to implement the plan or continue refining it.",
    parameters: Type.Object({ planFilePath: Type.String({ description: "Path to the plan file in .plans/" }) }),
    async execute(_id, params, _signal, _update, ctx) {
      return onFinishPlan(params.planFilePath, ctx);
    },
  };
}
