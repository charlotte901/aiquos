import {
  FRAME_QUADS,
  FACE_CORNERS,
  CUBE_CENTER,
  CUBE_WIDTH,
  CUBE_HEIGHT,
  quadMatrix,
  pointToUV,
} from "./cube-geometry.js";

/** Design-space size of the scene shared with the reference background. */
export const DESIGN_SIZE = [1514, 1006];
/** Grid resolution per cube face; shared edges stay watertight because the
 * calibration displacement is bilinear and identical on both sides. */
export const FACE_SEGMENTS = 24;

// Local face corners of the ideal box, index-aligned with FRAME_QUADS.
export const VERTICES = {
  top: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  left: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
  right: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
};

export const yawAt = (progress) => (Math.PI / 4) * (1 - progress);
export const pitchAt = (progress) => 0.345 * (1 - progress);

/** Rotate a local box vertex into design-space CSS pixels (y grows downward).
 * The x/y components reproduce the previous 2D turn math exactly; z keeps the
 * depth so the WebGL rasterizer can order the faces. */
export function rotateVertex([vx, vy, vz], progress) {
  const yaw = yawAt(progress);
  const pitch = pitchAt(progress);
  const x = (vx * CUBE_WIDTH) / 2;
  const y = (vy * CUBE_HEIGHT) / 2;
  const z = (vz * CUBE_WIDTH) / 2;
  const turnedX = x * Math.cos(yaw) + z * Math.sin(yaw);
  const turnedZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [
    CUBE_CENTER[0] + turnedX,
    CUBE_CENTER[1] + y * Math.cos(pitch) + turnedZ * Math.sin(pitch),
    -y * Math.sin(pitch) + turnedZ * Math.cos(pitch),
  ];
}

function bilinear(corners, u, v) {
  const top = corners[0].map((value, axis) => value + (corners[1][axis] - value) * u);
  const bottom = corners[3].map((value, axis) => value + (corners[2][axis] - value) * u);
  return top.map((value, axis) => value + (bottom[axis] - value) * v);
}

/** Photographed outline minus the ideal rest projection. The correction is a
 * screen-space (x,y) warp only — depth stays that of the rigid box. Applied
 * with a (1-p)^2 falloff, the resting cube reproduces the source photo
 * pixel-for-pixel while the turn itself stays a single rigid 3D box. */
const CALIBRATION = Object.fromEntries(
  Object.entries(VERTICES).map(([key, vertices]) => [
    key,
    vertices.map((vertex, index) => {
      const rest = rotateVertex(vertex, 0);
      return [
        FRAME_QUADS[key][index][0] - rest[0],
        FRAME_QUADS[key][index][1] - rest[1],
        0,
      ];
    }),
  ]),
);

/** Screen rectangles as face-texture UV, taken from the photographed corners. */
export const SCREEN_UV = Object.fromEntries(
  Object.entries(FACE_CORNERS).map(([key, corners]) => [
    key,
    corners.map(([x, y]) => pointToUV(quadMatrix(FRAME_QUADS[key]), x, y)),
  ]),
);
const rightUV = SCREEN_UV.right;
const flatRect = {
  u0: Math.min(rightUV[0][0], rightUV[3][0]),
  u1: Math.max(rightUV[1][0], rightUV[2][0]),
  v0: Math.min(rightUV[0][1], rightUV[1][1]),
  v1: Math.max(rightUV[2][1], rightUV[3][1]),
};
const FLAT_SCREEN_UV = [
  [flatRect.u0, flatRect.v0],
  [flatRect.u1, flatRect.v0],
  [flatRect.u1, flatRect.v1],
  [flatRect.u0, flatRect.v1],
];

/** One face point (frame or screen interior) at turn progress p. */
export function facePoint(key, u, v, progress) {
  const local = bilinear(VERTICES[key], u, v);
  const rotated = rotateVertex(local, progress);
  const blend = (1 - progress) ** 2;
  if (!blend) return rotated;
  const delta = bilinear(CALIBRATION[key], u, v);
  return rotated.map((value, axis) => value + delta[axis] * blend);
}

/** Screen corners in design pixels. The right screen squares up inside its
 * face with the same p^2 morph the previous implementation used. */
export function screenCorner(key, index, progress) {
  const [u, v] = SCREEN_UV[key][index];
  const target = key === "right" ? FLAT_SCREEN_UV[index] : [u, v];
  const morph = progress * progress;
  return facePoint(key, u + (target[0] - u) * morph, v + (target[1] - v) * morph, progress);
}

/** Residual between the bilinear 3D path and the photographed screen corners;
 * blended out with (1-p)^2 so the resting screens sit on their bezels exactly. */
const SCREEN_REST = Object.fromEntries(
  Object.keys(VERTICES).map((key) => [
    key,
    [0, 1, 2, 3].map((index) =>
      FACE_CORNERS[key][index].map(
        (value, axis) => value - screenCorner(key, index, 0)[axis],
      ),
    ),
  ]),
);
export const DEBUG_CALIBRATION = CALIBRATION;

/** Full screen quad for a face at turn progress p, exact on the photo at rest. */
export function screenQuad(key, progress) {
  const blend = (1 - progress) ** 2;
  return [0, 1, 2, 3].map((index) =>
    screenCorner(key, index, progress).map(
      (value, axis) => value + SCREEN_REST[key][index][axis] * blend,
    ),
  );
}

/** Content swapping turns the physical cube through one third of a turn
 * around the body diagonal through the shared visible corner. The rest pose
 * returns exactly, while the three face contents have cycled one position. */
const DIAGONAL_PITCH = 0.345;
const DIAGONAL_CENTER = [-1, -1, 1];
const DIAGONAL_AXIS = [1, 1, -1].map((value) => value / Math.sqrt(3));
const DIAGONAL_FACE_TARGET = { top: "left", left: "right", right: "top" };

function rotateAroundDiagonal([x, y, z], turn) {
  const point = [x, y, z].map((value, axis) => value - DIAGONAL_CENTER[axis]);
  const cosine = Math.cos((turn * Math.PI * 2) / 3);
  const sine = Math.sin((turn * Math.PI * 2) / 3);
  const dot = DIAGONAL_AXIS.reduce((total, axisValue, axis) =>
    total + axisValue * point[axis], 0);
  const cross = [
    DIAGONAL_AXIS[1] * point[2] - DIAGONAL_AXIS[2] * point[1],
    DIAGONAL_AXIS[2] * point[0] - DIAGONAL_AXIS[0] * point[2],
    DIAGONAL_AXIS[0] * point[1] - DIAGONAL_AXIS[1] * point[0],
  ];
  return DIAGONAL_CENTER.map((centerValue, axis) =>
    centerValue
    + point[axis] * cosine
    + cross[axis] * sine
    + DIAGONAL_AXIS[axis] * dot * (1 - cosine));
}

function projectDiagonalPoint([x, y, z]) {
  const halfWidth = CUBE_WIDTH / 2;
  const halfHeight = CUBE_HEIGHT / 2;
  return [
    CUBE_CENTER[0] + x * halfWidth,
    CUBE_CENTER[1] + y * halfHeight * Math.cos(DIAGONAL_PITCH)
      + z * halfWidth * Math.sin(DIAGONAL_PITCH),
    -y * halfHeight * Math.sin(DIAGONAL_PITCH)
      + z * halfWidth * Math.cos(DIAGONAL_PITCH),
  ];
}

function diagonalTargetUV(face, [x, y, z]) {
  if (face === "top") return [(x + 1) / 2, (z + 1) / 2];
  if (face === "left") return [(z + 1) / 2, (y + 1) / 2];
  return [(x + 1) / 2, (y + 1) / 2];
}

function unscaledDiagonalFacePoint(face, u, v, turn) {
  const amount = Math.max(0, Math.min(1, turn));
  const local = bilinear(VERTICES[face], u, v);
  const rotatedCurrent = rotateAroundDiagonal(local, amount);
  const rotatedEnd = rotateAroundDiagonal(local, 1);
  const rigidStart = projectDiagonalPoint(local);
  const rigidMoved = projectDiagonalPoint(rotatedCurrent);
  const rigidEnd = projectDiagonalPoint(rotatedEnd);
  const rest = sharedSurfacePoint(local, 0);
  const target = sharedSurfacePoint(rotatedEnd, 0);
  // Correct the ideal rigid path through one displacement field attached to
  // the cube itself. Shared physical points therefore have one path, instead
  // of each projected face pulling the same edge toward its own photograph.
  return rigidMoved.map((value, axis) =>
    value
    + (rest[axis] - rigidStart[axis]) * (1 - amount)
    + (target[axis] - rigidEnd[axis]) * amount);
}

function sharedSurfacePoint(local, progress) {
  const tolerance = 1e-7;
  const [x, y, z] = local;
  const matches = [];
  if (Math.abs(y + 1) < tolerance) {
    matches.push(["top", (x + 1) / 2, (z + 1) / 2]);
  }
  if (Math.abs(x + 1) < tolerance) {
    matches.push(["left", (z + 1) / 2, (y + 1) / 2]);
  }
  if (Math.abs(z - 1) < tolerance) {
    matches.push(["right", (x + 1) / 2, (y + 1) / 2]);
  }
  if (!matches.length) return projectDiagonalPoint(local);
  return matches.reduce((sum, [key, u, v]) => {
    const point = facePoint(key, u, v, progress);
    return sum.map((value, axis) => value + point[axis] / matches.length);
  }, [0, 0, 0]);
}

// A body diagonal presents more of the box to an orthographic camera. Scale
// the whole shell uniformly about its center so the turn reads at the same
// physical size instead of expanding past the photographed silhouette.
const REST_BOUNDS = Object.values(FRAME_QUADS).flat().reduce((bounds, [x, y]) => [
  [Math.min(bounds[0][0], x), Math.max(bounds[0][1], x)],
  [Math.min(bounds[1][0], y), Math.max(bounds[1][1], y)],
], [[Infinity, -Infinity], [Infinity, -Infinity]]);
const REST_CENTER = REST_BOUNDS.map(([minimum, maximum]) => (minimum + maximum) / 2);

const DIAGONAL_SCALE_SAMPLES = Array.from({ length: 101 }, (_, sample) => {
  const turn = sample / 100;
  const points = Object.entries(FRAME_QUADS).flatMap(([face, corners]) =>
    corners.map((_, index) => {
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]][index];
      return unscaledDiagonalFacePoint(face, uv[0], uv[1], turn);
    }));
  const bounds = points.reduce((current, [x, y]) => [
    [Math.min(current[0][0], x), Math.max(current[0][1], x)],
    [Math.min(current[1][0], y), Math.max(current[1][1], y)],
  ], [[Infinity, -Infinity], [Infinity, -Infinity]]);
  const widthScale = (REST_BOUNDS[0][1] - REST_BOUNDS[0][0])
    / Math.max(1, bounds[0][1] - bounds[0][0]);
  const heightScale = (REST_BOUNDS[1][1] - REST_BOUNDS[1][0])
    / Math.max(1, bounds[1][1] - bounds[1][0]);
  return {
    scale: Math.min(1, widthScale, heightScale),
    center: bounds.map(([minimum, maximum]) => (minimum + maximum) / 2),
  };
});

function diagonalNormalization(turn) {
  const position = Math.max(0, Math.min(1, turn)) * (DIAGONAL_SCALE_SAMPLES.length - 1);
  const index = Math.floor(position);
  const next = Math.min(index + 1, DIAGONAL_SCALE_SAMPLES.length - 1);
  const blend = position - index;
  const from = DIAGONAL_SCALE_SAMPLES[index];
  const to = DIAGONAL_SCALE_SAMPLES[next];
  return {
    scale: from.scale + (to.scale - from.scale) * blend,
    center: from.center.map((value, axis) =>
      value + (to.center[axis] - value) * blend),
  };
}

/** A shell/screen point in source-face UV, after the diagonal turn. The
 * per-face photograph calibration blends from its source bezel to the target
 * bezel, so turn start/end both sit on the supplied artwork. */
export function diagonalFacePoint(face, u, v, turn) {
  const amount = Math.max(0, Math.min(1, turn));
  const point = unscaledDiagonalFacePoint(face, u, v, turn);
  const { scale, center } = diagonalNormalization(amount);
  const centered = point.map((value, axis) =>
    axis < 2 ? REST_CENTER[axis] + (value - center[axis]) * scale : value);
  const centeredAtCube = point.map((value, axis) =>
    axis < 2 ? CUBE_CENTER[axis] + (value - CUBE_CENTER[axis]) * scale : value);
  const normalizeWeight = 4 * amount * (1 - amount);
  return centered.map((value, axis) =>
    centeredAtCube[axis] + (value - centeredAtCube[axis]) * normalizeWeight);
}

export function diagonalFrameQuad(face, turn) {
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) =>
    diagonalFacePoint(face, u, v, turn));
}

export function screenQuadDiagonal(face, turn) {
  const amount = Math.max(0, Math.min(1, turn));
  const uv = SCREEN_UV[face];
  return [0, 1, 2, 3].map((index) => {
    const [uu, vv] = uv[index];
    const local = bilinear(VERTICES[face], uu, vv);
    const rotatedLocal = rotateAroundDiagonal(local, amount);
    const target = DIAGONAL_FACE_TARGET[face];
    const [targetU, targetV] = diagonalTargetUV(target, rotatedLocal);
    const point = diagonalFacePoint(face, uu, vv, amount);
    const base = screenQuad(face, 0)[index];
    const origin = diagonalFacePoint(face, uu, vv, 0);
    const targetRest = bilinear(SCREEN_REST[target], targetU, targetV);
    const sourceRest = bilinear(SCREEN_REST[face], uu, vv);
    const rest = sourceRest.map((value, axis) =>
      value + (targetRest[axis] - value) * amount);
    return [point[0] + rest[0], point[1] + rest[1]];
  });
}

export function diagonalFaceVisible(face, turn) {
  const corners = diagonalFrameQuad(face, turn);
  const [a, b, c] = corners;
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 1e-6;
}

export function writeDiagonalFaceGrid(grid, turn) {
  const { key, cells, positions } = grid;
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const index = (row * cells + column) * 3;
      const [x, y, z] = diagonalFacePoint(key, column / (cells - 1), row / (cells - 1), turn);
      positions[index] = x;
      positions[index + 1] = -y;
      positions[index + 2] = -z;
    }
  }
  return positions;
}

/** A face is on camera while its projected outline keeps positive area. */
export function faceVisible(key, progress) {
  const a = facePoint(key, 0, 0, progress);
  const b = facePoint(key, 1, 0, progress);
  const c = facePoint(key, 1, 1, progress);
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 1e-6;
}

/** Grid template shared by the WebGL meshes and the tests. */
export function faceGrid(key, segments = FACE_SEGMENTS) {
  const cells = segments + 1;
  const positions = new Float32Array(cells * cells * 3);
  const uvs = new Float32Array(cells * cells * 2);
  const indices = [];
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const i = row * cells + column;
      uvs[i * 2] = column / segments;
      uvs[i * 2 + 1] = 1 - row / segments;
    }
  }
  for (let row = 0; row < segments; row++) {
    for (let column = 0; column < segments; column++) {
      const a = row * cells + column;
      indices.push(a, a + cells, a + 1, a + 1, a + cells, a + cells + 1);
    }
  }
  return { key, cells, positions, uvs, indices };
}

/** Fill a grid's positions for progress p; returns the same Float32Array. */
export function writeFaceGrid(grid, progress) {
  const { key, cells, positions } = grid;
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const i = (row * cells + column) * 3;
      const [x, y, z] = facePoint(key, column / (cells - 1), row / (cells - 1), progress);
      positions[i] = x;
      positions[i + 1] = -y; // WebGL space grows upward.
      positions[i + 2] = z;
    }
  }
  return positions;
}
