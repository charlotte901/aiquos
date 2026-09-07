import { FRAME_QUADS, quadMatrix, pointOnQuad } from "./cube-geometry";

export const TEXTURE_SIZE = 640;
let textures;

/** Unproject the existing shell into material maps. These are the supplied
 * product pixels, not generated replacements or new illustrations. */
export function loadCubeTextures() {
  if (textures) return textures;
  textures = new Promise((resolve, reject) => {
    const source = new Image();
    source.onload = () => {
      try {
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = source.width;
        sourceCanvas.height = source.height;
        const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
        // Respect the photographed rounded silhouette. Sampling the rectangular
        // image without this alpha mask brought pink corner wedges into the turn.
        // Keep this outline identical to .cube-shell: the source art's base
        // extends below the cube, and the stale old mask turned that base
        // into a loose pink edge while the shell rotated.
        sourceContext.clip(new Path2D("M 493 409 Q 490 383 516 372 L 786 286 Q 804 278 821 285 L 1105 373 Q 1133 382 1132 412 L 1123 720 Q 1124 744 1103 754 L 1097 771 Q 1098 781 1078 788 L 831 872 Q 813 879 791 872 L 535 779 Q 519 773 520 754 Q 501 747 500 724 Z"));
        sourceContext.drawImage(source, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
        const result = {};
        for (const [key, corners] of Object.entries(FRAME_QUADS)) {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = TEXTURE_SIZE;
          const context = canvas.getContext("2d");
          const output = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
          const matrix = quadMatrix(corners);
          for (let y = 0; y < TEXTURE_SIZE; y++) {
            for (let x = 0; x < TEXTURE_SIZE; x++) {
              const [sx, sy] = pointOnQuad(matrix, x / (TEXTURE_SIZE - 1), y / (TEXTURE_SIZE - 1));
              const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
              const target = (y * TEXTURE_SIZE + x) * 4;
              for (let channel = 0; channel < 4; channel++) {
                const at = (px, py) => pixels[(py * source.width + px) * 4 + channel];
                output.data[target + channel] =
                  at(ix,iy) * (1-fx) * (1-fy) + at(ix+1,iy) * fx * (1-fy) +
                  at(ix,iy+1) * (1-fx) * fy + at(ix+1,iy+1) * fx * fy;
              }
            }
          }
          context.putImageData(output, 0, 0);
          result[key] = canvas;
        }
        resolve(result);
      } catch (error) { reject(error); }
    };
    source.onerror = reject;
    source.src = "/assets/aiquos-reference.png";
  });
  return textures;
}
