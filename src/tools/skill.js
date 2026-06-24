import { renderSkill } from "../skills/index.js";

// Exposes user-authored playbooks (.ucode/skills/*.md) as something the model
// can invoke itself mid-task, not just something the human types as a slash
// command. The tool's output is the skill's instructions, which the agent
// then follows in its next turn.
export function createSkillTool(skills) {
  const byName = new Map(skills.map((s) => [s.name, s]));
  return {
    name: "run_skill",
    description:
      `Load a saved playbook of step-by-step instructions for a known task. Available skills: ${
        skills.length ? skills.map((s) => `${s.name} (${s.description})`).join("; ") : "none defined yet"
      }`,
    riskLevel: "read",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name" },
        args: { type: "string", description: "Optional free-text arguments substituted into the skill body where it references {{args}}" },
      },
      required: ["name"],
    },
    async execute({ name, args }) {
      const skill = byName.get(name);
      if (!skill) {
        return { isError: true, output: `Unknown skill "${name}". Available: ${[...byName.keys()].join(", ") || "(none)"}` };
      }
      return { output: renderSkill(skill, args) };
    },
  };
}
