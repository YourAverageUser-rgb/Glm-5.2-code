import fs from "node:fs";
import path from "node:path";

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export const editFileTool = {
  name: "edit_file",
  description:
    "Replace an exact string occurrence in a file with a new string. The old_string must match exactly " +
    "(including whitespace) and must be unique in the file unless replace_all is true. Fails loudly if the " +
    "match isn't found or isn't unique, rather than guessing.",
  riskLevel: "write",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file" },
      old_string: { type: "string", description: "Exact text to find and replace" },
      new_string: { type: "string", description: "Replacement text" },
      replace_all: { type: "boolean", description: "Replace every occurrence instead of requiring uniqueness" },
    },
    required: ["path", "old_string", "new_string"],
  },
  async execute({ path: filePath, old_string, new_string, replace_all }, { cwd }) {
    const resolved = path.resolve(cwd, filePath);
    if (!fs.existsSync(resolved)) {
      return { isError: true, output: `File not found: ${resolved}` };
    }
    if (old_string === new_string) {
      return { isError: true, output: "old_string and new_string are identical; nothing to do." };
    }
    const original = fs.readFileSync(resolved, "utf8");
    const occurrences = countOccurrences(original, old_string);

    if (occurrences === 0) {
      return { isError: true, output: `old_string was not found in ${resolved}. No changes made.` };
    }
    if (occurrences > 1 && !replace_all) {
      return {
        isError: true,
        output: `old_string matches ${occurrences} locations in ${resolved}. Provide more surrounding context to make it unique, or set replace_all: true.`,
      };
    }

    const updated = replace_all
      ? original.split(old_string).join(new_string)
      : original.replace(old_string, new_string);

    fs.writeFileSync(resolved, updated, "utf8");
    return { output: `Updated ${resolved} (${occurrences} replacement${occurrences > 1 ? "s" : ""}).` };
  },
};
