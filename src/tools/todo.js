import { setTodos } from "./todoStore.js";

const VALID_STATUSES = new Set(["pending", "in_progress", "completed"]);

export const todoWriteTool = {
  name: "todo_write",
  description:
    "Replace the current task list with the given list of todos, to plan and track progress on multi-step work. " +
    "Mark exactly one item in_progress at a time; mark items completed as soon as they're done.",
  riskLevel: "write",
  parameters: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          },
          required: ["id", "content", "status"],
        },
      },
    },
    required: ["todos"],
  },
  async execute({ todos }) {
    const bad = todos.find((t) => !VALID_STATUSES.has(t.status));
    if (bad) return { isError: true, output: `Invalid status "${bad.status}" for todo "${bad.id}".` };
    setTodos(todos);
    const summary = todos.map((t) => `[${t.status === "completed" ? "x" : t.status === "in_progress" ? "~" : " "}] ${t.content}`).join("\n");
    return { output: `Todo list updated:\n${summary}` };
  },
};
