// Subagent dispatch. Spawns a nested, constrained agent loop and returns only
// its final text report — keeping the parent's context window clean, the same
// trade-off Claude Code's own Task/Agent tool makes.
const READ_ONLY_TOOL_NAMES = ["read_file", "glob_files", "grep", "web_fetch"];

export function createTaskTool({ allTools, defaultDepthRemaining }) {
  return {
    name: "dispatch_agent",
    description:
      "Delegate a self-contained chunk of work to a fresh subagent with its own context window. " +
      "Good for broad codebase exploration or research; the parent only sees the final report, not the " +
      "subagent's intermediate steps. Subagents cannot spawn further subagents.",
    riskLevel: "exec",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Short description of the task, shown to the user" },
        prompt: { type: "string", description: "Full, self-contained instructions for the subagent" },
        read_only: { type: "boolean", description: "Restrict the subagent to read-only tools (default false)" },
      },
      required: ["description", "prompt"],
    },
    async execute({ description, prompt, read_only }, ctx) {
      if ((ctx.depthRemaining ?? defaultDepthRemaining) <= 0) {
        return { isError: true, output: "Max subagent nesting depth reached; cannot dispatch a further subagent." };
      }
      const { runAgentLoop } = await import("../agent/loop.js");

      const subTools = read_only ? allTools.filter((t) => READ_ONLY_TOOL_NAMES.includes(t.name)) : allTools.filter((t) => t.name !== "dispatch_agent");

      const result = await runAgentLoop({
        config: ctx.config,
        provider: ctx.provider,
        tools: subTools,
        systemPromptOverride: ctx.buildSubagentSystemPrompt?.(description),
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
