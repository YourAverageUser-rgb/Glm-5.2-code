import { runAgentLoop } from "../agent/loop.js";
import { color } from "../ui/render.js";

export function parseInterval(str) {
  const m = /^(\d+)\s*(s|sec|m|min|h|hr)?$/i.exec(String(str).trim());
  if (!m) throw new Error(`Invalid interval "${str}". Use formats like 30s, 10m, 1h.`);
  const n = Number(m[1]);
  const unit = (m[2] || "m").toLowerCase();
  const mult = unit.startsWith("s") ? 1000 : unit.startsWith("h") ? 3_600_000 : 60_000;
  return n * mult;
}

async function sleepCancelable(ms, isStopped) {
  const stepMs = 250;
  let waited = 0;
  while (waited < ms) {
    if (isStopped()) return;
    await new Promise((r) => setTimeout(r, Math.min(stepMs, ms - waited)));
    waited += stepMs;
  }
}

const STOP_SENTINEL = "<<LOOP_DONE>>";

/**
 * Re-run a prompt against the agent loop on a fixed interval until maxRuns is
 * hit, the model's reply contains the stop sentinel, or the caller's stop
 * signal fires (e.g. Ctrl+C). Each run is independent (fresh conversation) so
 * this is meant for monitoring/polling-style prompts, not for continuing a
 * single long task — use a normal turn for that.
 *
 * `prompt` may be a string (fixed every tick) or a function returning a
 * string, called fresh on every tick — e.g. to re-read an instructions file
 * that the user can edit between runs without restarting the loop.
 */
export async function startLoopRunner({ runtime, session, prompt, intervalMs, maxRuns = Infinity, ui, isStopped = () => false }) {
  const { config, provider, tools, memory, permissionGate, providerLabel, cwd } = runtime;
  let runs = 0;

  while (runs < maxRuns && !isStopped()) {
    runs++;
    process.stdout.write(color(`\n[loop ${runs}${maxRuns !== Infinity ? `/${maxRuns}` : ""}] `, "gray") + new Date().toLocaleTimeString() + "\n");

    const currentPrompt = typeof prompt === "function" ? await prompt() : prompt;
    const wrappedPrompt = `${currentPrompt}\n\n(This prompt re-runs on a timer until stopped. If the underlying task is now fully done and the loop should stop, include the exact text ${STOP_SENTINEL} somewhere in your reply.)`;

    const result = await runAgentLoop({
      config,
      provider,
      tools,
      initialMessages: [{ role: "user", content: wrappedPrompt }],
      cwd,
      permissionGate,
      ui,
      memory,
      providerLabel,
      onMessage: (m) => session?.save({ messages: m, usage: {} }),
    });

    if (result.finalText?.includes(STOP_SENTINEL)) {
      process.stdout.write(color("Loop stop sentinel seen in response; stopping.\n", "yellow"));
      break;
    }
    if (runs >= maxRuns || isStopped()) break;
    await sleepCancelable(intervalMs, isStopped);
  }

  return { runs };
}
