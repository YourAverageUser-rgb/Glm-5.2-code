// Permission modes, modeled on Claude Code's: default / acceptEdits / plan / bypassPermissions.
// "bypassPermissions" is what the user experiences as "auto mode" / "auto-accept everything".
export const MODES = ["default", "acceptEdits", "plan", "bypassPermissions"];

function matchesAny(name, patterns) {
  if (!patterns) return false;
  return patterns.some((p) => p === name || p === "*" || (p.endsWith("*") && name.startsWith(p.slice(0, -1))));
}

/**
 * Decide whether a tool call may proceed without asking, must be confirmed,
 * or must be denied outright.
 *
 * @returns {"allow" | "confirm" | "deny"}
 */
export function decide({ toolName, riskLevel, mode, allowTools, denyTools }) {
  if (matchesAny(toolName, denyTools)) return "deny";
  if (matchesAny(toolName, allowTools)) return "allow";

  if (riskLevel === "interactive") return "allow";

  if (mode === "plan") {
    return riskLevel === "read" ? "allow" : "deny";
  }
  if (mode === "bypassPermissions") {
    return "allow";
  }
  if (mode === "acceptEdits") {
    if (riskLevel === "read" || riskLevel === "write") return "allow";
    return "confirm"; // exec still confirmed
  }
  // default
  if (riskLevel === "read") return "allow";
  return "confirm";
}

export class PermissionGate {
  constructor({ mode = "default", allowTools = null, denyTools = [], confirm } = {}) {
    this.mode = mode;
    this.allowTools = allowTools;
    this.denyTools = denyTools;
    this.confirm = confirm || (async () => true); // injected UI confirmation callback
  }

  setMode(mode) {
    if (!MODES.includes(mode)) throw new Error(`Unknown permission mode: ${mode}`);
    this.mode = mode;
  }

  async check(tool, args) {
    const verdict = decide({
      toolName: tool.name,
      riskLevel: tool.riskLevel,
      mode: this.mode,
      allowTools: this.allowTools,
      denyTools: this.denyTools,
    });
    if (verdict === "allow") return { allowed: true };
    if (verdict === "deny") {
      return {
        allowed: false,
        reason:
          this.mode === "plan"
            ? `"${tool.name}" is a ${tool.riskLevel} action and is blocked while in plan mode. Finish planning and ask the user to exit plan mode before making changes.`
            : `"${tool.name}" is blocked by deny-list/settings.`,
      };
    }
    // confirm
    const approved = await this.confirm(tool, args);
    return approved
      ? { allowed: true }
      : { allowed: false, reason: `User declined to approve "${tool.name}".` };
  }
}
