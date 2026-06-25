import fs from "node:fs";
import path from "node:path";

// Media types every major vision-capable provider accepts (OpenAI-compatible
// image_url data URLs and Anthropic base64 image blocks both use these).
const MEDIA_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const SUPPORTED_IMAGE_EXTENSIONS = Object.keys(MEDIA_TYPES);

export function isImagePath(p) {
  return Boolean(MEDIA_TYPES[path.extname(p).toLowerCase()]);
}

/**
 * Read an image off disk and return it base64-encoded with its media type, ready
 * to drop into a provider's wire format. Throws (with a clear message) for a
 * missing file or an unsupported extension so callers can surface it to the user.
 */
export function loadImage(filePath, cwd = process.cwd()) {
  const resolved = path.resolve(cwd, filePath);
  const ext = path.extname(resolved).toLowerCase();
  const mediaType = MEDIA_TYPES[ext];
  if (!mediaType) {
    throw new Error(`Unsupported image type "${ext || "(none)"}". Supported: ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`No such image file: ${resolved}`);
  }
  const buf = fs.readFileSync(resolved);
  return { data: buf.toString("base64"), mediaType, bytes: buf.length, path: resolved };
}
