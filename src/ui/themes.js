import path from "node:path";
import { readJsonDefsFromDir } from "../util/resourceFiles.js";
import { loadPlugins } from "../plugins/index.js";

const HUE_SLOTS = ["red", "green", "yellow", "blue", "magenta", "cyan", "gray"];

// Colors are either a raw ANSI SGR code (number, matches the classic 16-color
// palette) or a "#rrggbb" hex string (rendered as 24-bit truecolor). Custom
// and plugin themes only need to override the slots they care about --
// resolveThemes() fills in anything missing from the "default" theme.
export const BUILTIN_THEMES = {
  default: {
    description: "Classic 16-color ANSI palette (ucode's original look).",
    colors: { red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, gray: 90 },
  },
  dracula: {
    description: "Dracula palette -- purples and pinks on dark backgrounds.",
    colors: { red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c", blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", gray: "#6272a4" },
  },
  "solarized-dark": {
    description: "Solarized Dark -- low-contrast, eye-friendly palette.",
    colors: { red: "#dc322f", green: "#859900", yellow: "#b58900", blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", gray: "#586e75" },
  },
  nord: {
    description: "Nord -- cool, muted arctic-inspired blues.",
    colors: { red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b", blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", gray: "#4c566a" },
  },
  monochrome: {
    description: "No color at all -- bold/dim only, for unsupported terminals or accessibility.",
    colors: { red: null, green: null, yellow: null, blue: null, magenta: null, cyan: null, gray: null },
  },
};

function customThemeDir(config) {
  return path.join(config.projectRoot ?? process.cwd(), config.themesDir ?? ".ucode/themes");
}

function globalThemeDir(config) {
  return config.globalDir ? path.join(config.globalDir, "themes") : null;
}

/**
 * Merge built-in, plugin-provided, and user-defined themes into one registry,
 * keyed by name. Later sources win on a name collision: built-in < plugin <
 * global custom (~/.ucode/themes/*.json) < project custom (.ucode/themes/*.json).
 */
export function resolveThemes(config) {
  const themes = {};
  for (const [name, def] of Object.entries(BUILTIN_THEMES)) themes[name] = { ...def, source: "built-in" };
  for (const plugin of loadPlugins(config)) {
    for (const [name, def] of Object.entries(plugin.themes)) themes[name] = { ...def, source: `plugin:${plugin.name}` };
  }
  const globalDir = globalThemeDir(config);
  if (globalDir) {
    for (const [name, def] of Object.entries(readJsonDefsFromDir(globalDir))) themes[name] = { ...def, source: "global" };
  }
  for (const [name, def] of Object.entries(readJsonDefsFromDir(customThemeDir(config)))) themes[name] = { ...def, source: "project" };
  return themes;
}

function toEscape(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return `\x1b[${value}m`;
  const hex = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
  if (!hex) return "";
  const n = parseInt(hex[1], 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

/** Compile a theme definition's color map into ready-to-use ANSI escape prefixes. Missing slots fall back to the default theme's. */
export function compileTheme(themeDef) {
  const colors = { ...BUILTIN_THEMES.default.colors, ...(themeDef?.colors ?? {}) };
  const compiled = { bold: "\x1b[1m", dim: "\x1b[2m" };
  for (const slot of HUE_SLOTS) compiled[slot] = toEscape(colors[slot]);
  return compiled;
}
