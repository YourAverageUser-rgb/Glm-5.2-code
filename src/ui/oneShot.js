import { runAgentLoop } from "../agent/loop.js";
import { Session } from "../agent/session.js";
import { color, nonInteractiveUi } from "./render.js";
import { buildRuntime } from "../agent/runtime.js";

export async function runOneShot({ prompt, flags = {} }) {
  const confirm = async (tool) => {
    process.stderr.write(color(`(non-interactive: denying "${tool.name}"; pass --auto to allow mutating actions without prompts)\n`, "yellow"));
    return false;
  };

  const runtime = await buildRuntime({ flags, confirm });
  if (runtime.problems.length) {
    for (const p of runtime.problems) console.error(color(`✗ ${p}`, "red"));
    process.exitCode = 1;
    return;
  }
  if (runtime.calibration && !runtime.calibration.ok && !flags.quiet) {
    console.error(color(`⚠ Calibration: ${runtime.calibration.reason}`, "yellow"));
  }

  const { config, provider, tools, memory, permissionGate, providerLabel, cwd } = runtime;
  const session = new Session(config);

  const ui = nonInteractiveUi({ quiet: flags.quiet });

  const result = await runAgentLoop({
    config,
    provider,
    tools,
    initialMessages: [{ role: "user", content: prompt }],
    cwd,
    permissionGate,
    ui,
    memory,
    providerLabel,
    onMessage: (m) => session.save({ messages: m, usage: {} }),
  });

  session.save({ messages: result.messages, usage: result.usage });
  console.log(flags.quiet ? result.finalText : "\n" + color("── result ──", "gray") + "\n" + result.finalText);
}
