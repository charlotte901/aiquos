import { build } from "esbuild";
import { fileURLToPath } from "node:url";

/**
 * Bundles every standalone showcase scene into a self-contained IIFE.
 *
 * The scenes ship next to the site rather than through Vite: each one is loaded
 * on its own inside an iframe, so it has to work without the app's module graph.
 * `three` is aliased to the vendored copy so the bundle and the version the scene
 * was written against cannot drift apart — note the vendored build is r160 while
 * the app's own dependency is newer, so this alias is what keeps them in step,
 * not the package version.
 *
 * Each scene declares its own output, so adding one is an entry here rather than
 * an edit to a hard-coded path.
 */
const scenes = [
  {
    entry: "public/cases/conbini/src/main.js",
    out: "public/cases/conbini/scene.js",
    three: "./public/cases/conbini/vendor/three.module.js",
  },
  {
    entry: "public/cases/penguin/src/main.js",
    out: "public/cases/penguin/scene.js",
    three: "./public/cases/penguin/vendor/three.module.js",
  },
];

const root = fileURLToPath(new URL("../", import.meta.url));

for (const scene of scenes) {
  await build({
    absWorkingDir: root,
    entryPoints: [scene.entry],
    bundle: true,
    format: "iife",
    minify: true,
    outfile: scene.out,
    alias: { three: scene.three },
    // A model imported by a scene is inlined as a base64 data URI. The showcase
    // iframes are sandboxed without `allow-same-origin`, so their origin is
    // opaque and any network request — even for a sibling file — fails. A scene
    // that fetches its asset cannot start there; one that carries it inline can.
    // This is why the bundle is larger than the model on disk, by roughly a third.
    loader: { ".glb": "dataurl" },
  });
  console.log(`built ${scene.out}`);
}
