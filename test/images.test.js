import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadImage, isImagePath } from "../src/util/images.js";
import { OpenAICompatibleProvider } from "../src/providers/openaiCompatible.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ucode-images-test-"));
}

test("isImagePath recognizes supported extensions and rejects others", () => {
  assert.equal(isImagePath("sketch.png"), true);
  assert.equal(isImagePath("photo.JPG"), true);
  assert.equal(isImagePath("notes.txt"), false);
});

test("loadImage base64-encodes the bytes and infers the media type", () => {
  const dir = mkTmpDir();
  fs.writeFileSync(path.join(dir, "pic.png"), "rawbytes");
  const img = loadImage("pic.png", dir);
  assert.equal(img.mediaType, "image/png");
  assert.equal(Buffer.from(img.data, "base64").toString(), "rawbytes");
  assert.equal(img.bytes, 8);
});

test("loadImage throws a clear error for unsupported types and missing files", () => {
  const dir = mkTmpDir();
  fs.writeFileSync(path.join(dir, "doc.txt"), "x");
  assert.throws(() => loadImage("doc.txt", dir), /Unsupported image type/);
  assert.throws(() => loadImage("ghost.png", dir), /No such image file/);
});

test("OpenAI-compatible provider serializes images as image_url data URLs", () => {
  const provider = new OpenAICompatibleProvider({});
  const wire = provider.toWireMessages("", [
    { role: "user", content: "recreate this", images: [{ data: "QUJD", mediaType: "image/png" }] },
  ]);
  const userMsg = wire.find((m) => m.role === "user");
  assert.ok(Array.isArray(userMsg.content));
  assert.deepEqual(userMsg.content[0], { type: "text", text: "recreate this" });
  assert.equal(userMsg.content[1].type, "image_url");
  assert.equal(userMsg.content[1].image_url.url, "data:image/png;base64,QUJD");
});

test("Anthropic provider serializes images as base64 image source blocks", () => {
  const provider = new AnthropicProvider({});
  const wire = provider.toWireMessages([
    { role: "user", content: "build this", images: [{ data: "QUJD", mediaType: "image/jpeg" }] },
  ]);
  const userMsg = wire.find((m) => m.role === "user");
  assert.ok(Array.isArray(userMsg.content));
  assert.deepEqual(userMsg.content[0], { type: "text", text: "build this" });
  assert.deepEqual(userMsg.content[1], {
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: "QUJD" },
  });
});

test("messages without images keep the plain string content shape", () => {
  const provider = new OpenAICompatibleProvider({});
  const wire = provider.toWireMessages("", [{ role: "user", content: "hi" }]);
  assert.equal(wire[0].content, "hi");
});
