/**
 * Rebuild the penguin model as a GLB that cannot fail to load.
 *
 * Why this exists rather than a one-line CLI call.
 *
 * The obvious optimization — `gltf-transform optimize --texture-compress webp` —
 * produces a 1.67 MB file that declares `extensionsRequired: ["EXT_texture_webp"]`.
 * three.js's GLTFLoader probes WebP support by loading a 1x1 data-URI image and
 * checking it decodes to height 1. That probe passes in a normal page but fails
 * in the app, because the showcase scenes run inside `<iframe sandbox="allow-scripts">`
 * (see `CaseScreen.jsx`), which gives them an opaque origin where the data-URI
 * image is blocked. When the probe fails and the extension is *required*, the
 * loader does not fall back — it throws, and the entire model fails with the
 * scene's "模型载入失败" message.
 *
 * The same applies to `KHR_mesh_quantization`, which the CLI's quantize step adds.
 *
 * So the fix is not a smaller file, it is a file with nothing optional in it:
 * every texture is re-encoded to a format the loader can always decode, and the
 * extension declarations are removed. Geometry is left alone — at these settings
 * it was only 1.5 MB, while the original PNG textures were 7.7 MB, so the
 * textures are where the weight actually is.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE = process.argv[2];
const OUT = process.argv[3];
if (!SOURCE || !OUT) throw new Error("usage: build-penguin-model.mjs <in.glb> <out.glb>");

/** Longest texture edge after downscaling. 1024 keeps the printed labels on the
 * cup legible while cutting the source textures by roughly two thirds. */
const TEXTURE_SIZE = 1024;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SOURCE);
const root = doc.getRoot();
const work = mkdtempSync(join(tmpdir(), "penguin-tex-"));

// Which image slots are normal maps. A normal map is a vector field, not a
// picture: JPEG ringing in it shows up as blotchy shading across the model, so it
// stays lossless even though that costs more bytes than the colour maps.
const normalImages = new Set();
for (const material of root.listMaterials()) {
  const normal = material.getNormalTexture();
  if (normal?.getImage()) normalImages.add(normal);
}

for (const texture of root.listTextures()) {
  const image = texture.getImage();
  if (!image) continue;
  const lossless = normalImages.has(texture);
  const converted = reencode(image, TEXTURE_SIZE, lossless);
  texture.setImage(converted.data).setMimeType(converted.mimeType);
}

// Strip every extension declaration. `dispose()` on each extension removes both
// its entry in `extensionsUsed` and any matching `extensionsRequired`, which is
// what stops a capability probe from being able to fail the whole load.
for (const extension of root.listExtensionsUsed()) extension.dispose();

await io.write(OUT, doc);

const bytes = readFileSync(OUT);
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
console.log(`wrote ${OUT} (${(bytes.length / 1048576).toFixed(2)} MB)`);
console.log("extensionsUsed    :", json.extensionsUsed ?? "none");
console.log("extensionsRequired:", json.extensionsRequired ?? "none");
for (const [i, image] of (json.images ?? []).entries()) {
  const view = json.bufferViews[image.bufferView];
  console.log(`  image ${i}: ${image.mimeType} ${(view.byteLength / 1024).toFixed(0)} KB`);
}

/** Decode, downscale and re-encode one texture using `sips`, which ships with
 * macOS and needs no native image dependency. Falls back to the original bytes
 * if any step fails, so a failure here can never produce a broken model. */
function reencode(buffer, max, lossless) {
  const stem = join(work, `tex-${Math.random().toString(36).slice(2)}`);
  const input = `${stem}.png`;
  writeFileSync(input, buffer);
  const args = ["-Z", String(max)];
  if (!lossless) args.push("-s", "format", "jpeg", "-s", "formatOptions", "88");
  const output = lossless ? `${stem}-out.png` : `${stem}-out.jpg`;
  args.push(input, "--out", output);
  if (spawnSync("sips", args, { stdio: "ignore" }).status !== 0) {
    return { data: buffer, mimeType: "image/png" };
  }
  return {
    data: readFileSync(output),
    mimeType: lossless ? "image/png" : "image/jpeg",
  };
}
