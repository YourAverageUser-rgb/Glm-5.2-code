// Subagent dispatch. Spawns a nested, constrained agent loop and returns only
// its final text report — keeping the parent's context window clean, the same
// trade-off Claude Code's own Task/Agent tool makes.
export function createTaskTool({ allTools, subagentTypes, defaultDepthRemaining }) {
  const typeNames = Object.keys(subagentTypes);

  return {
    name: "dispatch_agent",
    description:
      "Delegate a self-contained chunk of work to a fresh subagent with its own context window. " +
      "Good for broad codebase exploration or research; the parent only sees the final report, not the " +
      `subagent's intermediate steps. Subagent types: ${typeNames.map((n) => `${n} (${subagentTypes[n].description})`).join("; ")}. ` +
      "Subagents cannot spawn further subagents.",
    riskLevel: "exec",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Short description of the task, shown to the user" },
        prompt: { type: "string", description: "Full, self-contained instructions for the subagent" },
        subagent_type: { type: "string", enum: typeNames, description: "Which subagent type to use (default: general)" },
      },
      required: ["description", "prompt"],
    },
    async execute({ description, prompt, subagent_type }, ctx) {
      if ((ctx.depthRemaining ?? defaultDepthRemaining) <= 0) {
        return { isError: true, output: "Max subagent nesting depth reached; cannot dispatch a further subagent." };
      }
      const { runAgentLoop } = await import("../agent/loop.js");

      const type = subagentTypes[subagent_type] ?? subagentTypes.general;
      const subTools = type.toolFilter(allTools);

      let systemPromptOverride = ctx.buildSubagentSystemPrompt?.(description);
      if (type.extraInstructions) systemPromptOverride += `\n\n# Role-specific instructions\n${type.extraInstructions}`;

      const result = await runAgentLoop({
        config: ctx.config,
        provider: ctx.provider,
        tools: subTools,
        systemPromptOverride,
        initialMessages: [{ role: "user", content: prompt }],
        cwd: ctx.cwd,
        permissionGate: ctx.permissionGate,
        ui: { log: () => {} }, // subagents run quietly; parent prints a one-line summary
        depthRemaining: (ctx.depthRemaining ?? defaultDepthRemaining) - 1,
        sessionDir: ctx.sessionDir,
        isSubagent: true,
      });

      return { output: result.finalText || "(subagent finished with no final report)" };
    },
  };
}
