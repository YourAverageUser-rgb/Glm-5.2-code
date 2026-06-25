import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileTool } from "../src/tools/read.js";
import { writeFileTool } from "../src/tools/write.js";
import { editFileTool } from "../src/tools/edit.js";
import { globTool } from "../src/tools/glob.js";
import { grepTool } from "../src/tools/grep.js";

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ucode-tools-test-"));
}

test("write_file then read_file round-trips content", async () => {
  const dir = mkTmpDir();
  await writeFileTool.execute({ path: "hello.txt", content: "line1\nline2\n" }, { cwd: dir });
  const result = await readFileTool.execute({ path: "hello.txt" }, { cwd: dir });
  assert.match(result.output, /line1/);
  assert.match(result.output, /line2/);
});

test("write_file with append:true adds to an existing file instead of replacing it", async () => {
  const dir = mkTmpDir();
  await writeFileTool.execute({ path: "big.txt", content: "part1\n" }, { cwd: dir });
  await writeFileTool.execute({ path: "big.txt", content: "part2\n", append: true }, { cwd: dir });
  const content = fs.readFileSync(path.join(dir, "big.txt"), "utf8");
  assert.equal(content, "part1\npart2\n");
});

test("write_file with append:true on a nonexistent file creates it", async () => {
  const dir = mkTmpDir();
  const result = await writeFileTool.execute({ path: "new.txt", content: "first\n", append: true }, { cwd: dir });
  assert.equal(result.isError, undefined);
  assert.equal(fs.readFileSync(path.join(dir, "new.txt"), "utf8"), "first\n");
});

test("read_file reports a clear error for missing files", async () => {
  const dir = mkTmpDir();
  const result = await readFileTool.execute({ path: "nope.txt" }, { cwd: dir });
  assert.equal(result.isError, true);
});

test("edit_file requires a unique match unless replace_all is set", async () => {
  const dir = mkTmpDir();
  fs.writeFileSync(path.join(dir, "f.txt"), "foo\nfoo\nbar\n");
  const ambiguous = await editFileTool.execute({ path: "f.txt", old_string: "foo", new_string: "baz" }, { cwd: dir });
  assert.equal(ambiguous.isError, true);

  const replaced = await editFileTool.execute({ path: "f.txt", old_string: "foo", new_string: "baz", replace_all: true }, { cwd: dir });
  assert.equal(replaced.isError, undefined);
  const content = fs.readFileSync(path.join(dir, "f.txt"), "utf8");
  assert.equal(content, "baz\nbaz\nbar\n");
});

test("edit_file fails loudly when old_string isn't found", async () => {
  const dir = mkTmpDir();
  fs.writeFileSync(path.join(dir, "f.txt"), "abc\n");
  const result = await editFileTool.execute({ path: "f.txt", old_string: "xyz", new_string: "q" }, { cwd: dir });
  assert.equal(result.isError, true);
});

test("glob_files finds nested files matching **", async () => {
  const dir = mkTmpDir();
  fs.mkdirSync(path.join(dir, "src", "nested"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "a.js"), "");
  fs.writeFileSync(path.join(dir, "src", "nested", "b.js"), "");
  fs.writeFileSync(path.join(dir, "src", "nested", "c.txt"), "");
  const result = await globTool.execute({ pattern: "src/**/*.js" }, { cwd: dir });
  assert.match(result.output, /a\.js/);
  assert.match(result.output, /b\.js/);
  assert.doesNotMatch(result.output, /c\.txt/);
});

test("grep finds matching lines with file:line:text format", async () => {
  const dir = mkTmpDir();
  fs.writeFileSync(path.join(dir, "x.js"), "const needle = 1;\nconst other = 2;\n");
  const result = await grepTool.execute({ pattern: "needle" }, { cwd: dir });
  assert.match(result.output, /x\.js:1:/);
});
