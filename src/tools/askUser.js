export const askUserTool = {
  name: "ask_user_question",
  description:
    "Ask the human a multiple-choice question when genuinely blocked on a decision only they can make. " +
    "In non-interactive contexts this returns instructions to proceed using best judgement instead of blocking forever.",
  riskLevel: "interactive",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string" },
      options: { type: "array", items: { type: "string" }, description: "2-4 short option labels" },
    },
    required: ["question", "options"],
  },
  async execute({ question, options }, { ui }) {
    if (ui?.askUser) {
      const answer = await ui.askUser(question, options);
      return { output: `User selected: ${answer}` };
    }
    return {
      output:
        `(non-interactive session, cannot ask: "${question}") ` +
        `Proceed using best judgement; default to the first reasonable option: ${options?.[0] ?? "N/A"}.`,
    };
  },
};
