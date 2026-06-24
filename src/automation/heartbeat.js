import fs from "node:fs";
import path from "node:path";

const HEARTBEAT_REL_PATH = ".ucode/HEARTBEAT.md";

const TEMPLATE = `# Heartbeat

Read fresh by \`ucode heartbeat\` on every wake-up — edit this file any time, changes apply on
the next tick without restarting the heartbeat.

Replace this with concrete instructions for what to check periodically, and what "nothing to
report" looks like, so the agent doesn't manufacture busywork when there's nothing to do.

Example:
- Run \`git status\` in this directory. If there are uncommitted changes, summarize them.
- Otherwise, reply "nothing to report".
`;

/**
 * Locate the heartbeat instructions file: project .ucode/HEARTBEAT.md takes
 * precedence over a global ~/.ucode/HEARTBEAT.md fallback.
 */
export function findHeartbeatFile(config) {
  const projectPath = path.join(config.projectRoot ?? process.cwd(), HEARTBEAT_REL_PATH);
  if (fs.existsSync(projectPath)) return projectPath;
  const globalPath = path.join(config.globalDir, "HEARTBEAT.md");
  if (fs.existsSync(globalPath)) return globalPath;
  return null;
}

/** Re-read the heartbeat file fresh; returns null if none exists yet. */
export function readHeartbeat(config) {
  const file = findHeartbeatFile(config);
  return file ? fs.readFileSync(file, "utf8") : null;
}

/** Write a starter project-level heartbeat file and return its path. */
export function scaffoldHeartbeat(config) {
  const file = path.join(config.projectRoot ?? process.cwd(), HEARTBEAT_REL_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, TEMPLATE);
  return file;
}
