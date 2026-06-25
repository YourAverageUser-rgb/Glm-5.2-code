import test from "node:test";
import assert from "node:assert/strict";

// render.js reads process.stdout.isTTY once at import; force it on so the
// color/badge/box paths (not the plain-text fallbacks) are exercised here.
process.stdout.isTTY = true;
const { color, badge, modeBadge, divider, renderBanner, renderEvent } = await import("../src/ui/render.js");

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

function capture(fn) {
  const original = process.stdout.write.bind(process.stdout);
  const chunks = [];
  process.stdout.write = (s) => {
    chunks.push(s);
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}

test("color wraps text in an ANSI escape and resets it", () => {
  const out = color("hi", "cyan");
  assert.match(out, /\x1b\[/);
  assert.match(out, /\x1b\[0m$/);
  assert.equal(strip(out), "hi");
});

test("badge renders a reverse-video pill and modeBadge maps known modes", () => {
  assert.match(badge("x", "blue"), /\x1b\[7m/);
  assert.equal(strip(modeBadge("default")), " default ");
  assert.equal(strip(modeBadge("bypassPermissions")), " bypassPermissions ");
});

test("divider includes its label", () => {
  assert.match(strip(divider("result")), /result/);
});

test("renderBanner draws a box whose borders line up", () => {
  const out = capture(() => renderBanner({ provider: "glm", model: "glm-5.2", mode: "default", cwd: "/tmp/x" }));
  const boxLines = strip(out)
    .split("\n")
    .filter((l) => /[╭╮╰╯│]/.test(l));
  assert.equal(boxLines.length, 4);
  const widths = new Set(boxLines.map((l) => [...l].length));
  assert.equal(widths.size, 1, `box lines should all share one width, got ${[...widths].join(",")}`);
});

test("tool-call event summarizes run_command as the command, not raw JSON", () => {
  const out = capture(() => renderEvent({ type: "tool-call", name: "run_command", args: { command: "npm test" } }));
  assert.match(strip(out), /run_command\s+npm test/);
  assert.doesNotMatch(out, /\{"command"/);
});

test("tool-result caps long output and reports how many lines were elided", () => {
  const output = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
  const out = capture(() => renderEvent({ type: "tool-result", output, isError: false }));
  assert.match(strip(out), /\+14 more lines/);
});
