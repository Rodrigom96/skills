import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const OTHER_VALUE = "\u0000ask-user-other";

const OptionSchema = Type.Object({
  answer: Type.String({ description: "The answer value returned when this option is selected" }),
  description: Type.String({ description: "A concise explanation shown alongside the answer" }),
});

type AskOption = { answer: string; description?: string };

const normalizeOptions = (options: Array<{ answer: string; description: string }>): AskOption[] =>
  options.flatMap(({ answer, description }) => {
    const value = answer.trim();
    const details = description.trim();
    return value ? [{ answer: value, ...(details ? { description: details } : {}) }] : [];
  });

async function selectOption(
  ctx: ExtensionContext,
  question: string,
  options: AskOption[],
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  let otherLabel = "Other…";
  while (options.some(({ answer }) => answer === otherLabel)) otherLabel += "…";

  const labels = options.map(({ answer, description }) => {
    const boldAnswer = `\u001b[1m${answer}\u001b[22m`;
    return description ? `${boldAnswer} — ${description}` : boldAnswer;
  });
  labels.push(otherLabel);
  const selected = await ctx.ui.select(question, labels, { signal });
  if (selected === undefined) return undefined;
  if (selected === otherLabel) return OTHER_VALUE;
  return options[labels.indexOf(selected)]?.answer;
}

export function createAskUserTool() {
  return {
    name: "ask_user",
    label: "Ask Question",
    description: "Use ask_user to ask the user questions and collect responses.",
    promptSnippet: "Use ask_user to ask the user questions and collect responses",
    promptGuidelines: [
      "Use ask_user to ask the user questions and collect responses.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "The focused question to ask the user" }),
      options: Type.Optional(Type.Array(OptionSchema, {
        description: "Optional answer choices. Each choice must include the answer value and a concise description; a custom answer is always available",
      })),
    }),
    executionMode: "sequential",
    async execute(_id, params, signal, _update, ctx: ExtensionContext) {
      const options = normalizeOptions(params.options ?? []);
      const result = (answer: string | undefined, wasCustom = false) => ({
        content: [{
          type: "text",
          text: answer === undefined ? "User cancelled the question" : `User answered: ${answer}`,
        }],
        details: {
          question: params.question,
          options,
          answer: answer ?? null,
          wasCustom: answer !== undefined && wasCustom,
        },
      });

      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "Unable to collect an answer: interaction is unavailable." }],
          details: { question: params.question, options, answer: null, wasCustom: false },
        };
      }

      if (!options.length) {
        return result(await ctx.ui.input(params.question, undefined, { signal }), true);
      }

      const selected = await selectOption(ctx, params.question, options, signal);
      if (selected === OTHER_VALUE) {
        return result(await ctx.ui.input(params.question, undefined, { signal }), true);
      }
      return result(selected);
    },
  };
}
