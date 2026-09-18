/**
 * 企鹅叠叠乐 — a clumsy blue penguin balancing a tall, wobbling stack.
 *
 * The model is the entire subject, so the scene is built to stay out of its way:
 * a single key light plus a soft fill, a neutral studio ground, and a slow orbit
 * that shows the stack in the round. Nothing here simulates the wobble — the
 * mesh is static and the motion is the camera's.
 */
import * as THREE from "three";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
// The model is inlined as a data URI rather than fetched.
//
// The showcase runs inside `<iframe sandbox="allow-scripts">`, which gives the
// page an opaque origin where every network request — including a same-origin
// fetch of a sibling file — fails with "Failed to fetch". The other scenes work
// because their `scene.js` is entirely self-contained; a scene that loads an
// external asset simply cannot start. Inlining the model is what makes this one
// behave like the rest, and it is why `model.glb` is imported rather than
// referenced by URL.
import modelUrl from "../model.glb";

const canvas = document.getElementById("c");
const fail = document.getElementById("fail");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  // The parent screenshots this canvas to crossfade between cases, and the
  // default (cleared) buffer makes that capture come back blank. Preserving the
  // drawing buffer is what lets the hand-off show the real frame.
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
// Without a ground the stack floated in empty colour, which read as flat next to
// the other scenes. A soft contact shadow is what gives it weight and depth.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14263a);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

// A cool studio backdrop so the blue penguin keeps its silhouette: a broad
// hemisphere for ambient tint, one warm key for form, and a rim light behind to
// pick the stack's edge out of the dark background.
scene.add(new THREE.HemisphereLight(0xd6ecff, 0x2c4055, 2.0));

const key = new THREE.DirectionalLight(0xfff2e0, 3.4);
key.position.set(3.2, 5.4, 4.2);
key.castShadow = true;
// The shadow map only ever covers the stack, so it can be small and still sharp.
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 16;
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -3;
key.shadow.bias = -0.0012;
key.shadow.radius = 3;
scene.add(key);
scene.add(key.target);

const rim = new THREE.DirectionalLight(0x9ed4ff, 2.2);
rim.position.set(-3.6, 2.4, -4.4);
scene.add(rim);

const fill = new THREE.DirectionalLight(0xc2e2ff, 1.1);
fill.position.set(-2.8, -1.2, 3.6);
scene.add(fill);

/** Vertical half-extent of the normalised model. The camera's height is derived
 * from this so the stack sits centred rather than low in the frame. */
let halfY = 1;
/** The model's visible corners in world space, used to fit the frame. */
let corners = [];
/** Half-height of the frame at unit distance, i.e. the vertical half-angle. */
let tanHalfV = Math.tan((40 * Math.PI) / 360);
/** Distance from the origin to the camera, solved in `resize()`. */
let distance = 4;

/** Project the model's corners into the camera's view plane and return the
 * largest half-extents that actually need to fit. */
function measure(camera) {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const corner of corners) {
    x = Math.max(x, Math.abs(corner.dot(right)));
    y = Math.max(y, Math.abs(corner.dot(up)));
    // Depth matters too: the nearest corner is what can clip the frame.
    z = Math.min(z, corner.dot(forward));
  }
  return { x, y, z };
}

function resize() {
  const width = innerWidth;
  const height = innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  tanHalfV = Math.tan((camera.fov * Math.PI) / 360);
  camera.updateProjectionMatrix();
}

/** Solve the orbit distance for the current angle. Called per frame because the
 * model's silhouette changes as the camera moves around the stack. */
function solveDistance(angle) {
  camera.position.set(Math.sin(angle), halfY * 0.18, Math.cos(angle));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const need = measure(camera);
  const halfH = tanHalfV * camera.aspect;
  // Fit the silhouette's half-extents, then add only a fraction of the model's
  // half-depth as a margin. Adding the whole half-depth was what shrank the piece:
  // it moves the camera back by the object's full depth even though only the
  // corners nearest the camera can actually reach the frame edge.
  const margin = Math.abs(need.z) * 0.35;
  const byHeight = need.y / tanHalfV + margin;
  const byWidth = need.x / halfH + margin;
  return Math.max(byHeight, byWidth) * 1.06;
}

const clock = new THREE.Clock();
let loaded = false;

function frame() {
  const t = clock.getElapsedTime();
  if (loaded) {
    // A slow, continuous orbit at a height set by the model's own half-height, so
    // the stack stays centred instead of drifting low in the frame. The distance
    // is re-solved each frame because a tall stack presents a narrower silhouette
    // from the side than from the corner, and a fixed radius either crops it or
    // leaves it small depending on which angle it happens to be at.
    const angle = t * 0.22;
    distance = solveDistance(angle);
    camera.position.set(
      Math.sin(angle) * distance,
      halfY * 0.18,
      Math.cos(angle) * distance,
    );
    camera.lookAt(0, 0, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/** Linear multiplier for the floor's base colour, i.e. how dark the plane sits
 * relative to the background. Kept well below 1 so the shadow under the piece
 * reads as a shadow rather than a stain on a bright surface. */
const FLOOR_TINT = 0.13;

/** Per-vertex colours for the floor: the plane's own tone at the centre, fading
 * to black at the rim so it dissolves into the background instead of ending in a
 * hard horizon. Returned as a plain float array for a BufferAttribute. */
function fadeToRim(geometry) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  let radius = 0;
  for (let i = 0; i < position.count; i++) {
    radius = Math.max(radius, Math.hypot(position.getX(i), position.getY(i)));
  }
  for (let i = 0; i < position.count; i++) {
    const d = Math.hypot(position.getX(i), position.getY(i)) / (radius || 1);
    // The plane's material is white and these colours multiply it, so the value
    // has to fall from the FLOOR's dark toward the rim — not the reverse. An
    // earlier version used the falloff directly and lit the centre to white,
    // floating the piece on a bright disc.
    const edge = Math.pow(Math.max(0, 1 - d), 1.6);
    const shade = FLOOR_TINT * edge;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  return colors;
}

new GLTFLoader().load(
  modelUrl,
  (gltf) => {
    const model = gltf.scene;

    // Normalise the export into a known frame: centred on the origin and scaled
    // so its largest axis spans 2 units.
    //
    // The offset goes on a wrapper, not on the model. Setting `model.position`
    // and then `model.scale` does not do what it looks like: a node's scale
    // applies to its own geometry, so the centring offset would be left unscaled
    // and the model would sit off-centre by exactly the amount the fit maths is
    // meant to cancel out.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2 / maxAxis;

    const pivot = new THREE.Group();
    pivot.scale.setScalar(scale);
    model.position.copy(centre).multiplyScalar(-1);
    pivot.add(model);

    // The model's eight corners in the normalised frame, which is what the camera
    // fits. Using the real corners rather than a bounding sphere matters here: the
    // stack is tall and thin, and a sphere reserves the full diagonal in every
    // direction, leaving the model a small figure in the middle of the frame.
    const min = box.min.clone().sub(centre).multiplyScalar(scale);
    const max = box.max.clone().sub(centre).multiplyScalar(scale);
    corners = [];
    for (const x of [min.x, max.x])
      for (const y of [min.y, max.y])
        for (const z of [min.z, max.z]) corners.push(new THREE.Vector3(x, y, z));
    halfY = (size.y * scale) / 2;

    // The export is double-sided, which doubles fill cost for no visible gain on
    // a closed mesh; front faces only keeps the frame budget small.
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.castShadow = true;
      node.receiveShadow = true;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material) material.side = THREE.FrontSide;
      }
    });

    // Seen at this angle a flat plane ends in a hard horizon across the middle of
    // the frame. Darkening it toward the rim dissolves that seam into the
    // background, so the only thing the eye reads is the shadow pool under the
    // piece. Vertex colours are used rather than an alpha map: making the
    // material transparent moves it into the transparent pass, which draws after
    // the opaque sculpture with depth writes disabled and so paints over it.
    const floorGeometry = new THREE.PlaneGeometry(12, 12, 24, 24);
    floorGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(fadeToRim(floorGeometry), 3),
    );
    const floor = new THREE.Mesh(
      floorGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.96,
        metalness: 0,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = min.y;
    floor.receiveShadow = true;
    scene.add(floor);

    // The key light follows the model so its shadow camera covers the stack
    // wherever the orbit has moved it, rather than a fixed window it can slide out of.
    key.target.position.set(0, (min.y + max.y) / 2, 0);
    key.position.set(3.2, 5.4 + max.y, 4.2);

    scene.add(pivot);
    resize();
    loaded = true;
  },
  undefined,
  () => {
    fail.classList.add("on");
  },
);

addEventListener("resize", resize);
resize();
frame();
