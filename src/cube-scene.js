import * as THREE from "three";
import {
  DESIGN_SIZE,
  FACE_SEGMENTS,
  faceGrid,
  faceVisible,
  writeFaceGrid,
} from "./cube3d";

/** Rasterize the calibrated 3D cube shell with WebGL. One continuous mesh per
 * face, shared edges, antialiased — replaces the three separately warped DOM
 * quads whose seams tore during the turn. Falls back by throwing if WebGL is
 * unavailable; the caller then keeps the DOM projection path. */
export function createCubeScene(canvas, textures) {
  const [width, height] = DESIGN_SIZE;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  // Design pixels with y growing downward, camera looking along -z.
  const camera = new THREE.OrthographicCamera(0, width, 0, -height, -1600, 1600);
  camera.position.z = 800;
  const meshes = Object.keys(textures).map((key) => {
    const grid = faceGrid(key, FACE_SEGMENTS);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(writeFaceGrid(grid, 0), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(grid.uvs, 2));
    geometry.setIndex(grid.indices);
    const map = new THREE.CanvasTexture(textures[key]);
    map.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      geometry,
      // Discard the photo's antialiased fringe; translucent edge pixels read
      // as a separate outline once the shell is a moving 3D surface.
      new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5 }),
    );
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { key, grid, mesh };
  });
  return {
    setProgress(progress) {
      for (const { key, grid, mesh } of meshes) {
        mesh.visible = faceVisible(key, progress);
        if (!mesh.visible) continue;
        writeFaceGrid(grid, progress);
        mesh.geometry.attributes.position.needsUpdate = true;
      }
      renderer.render(scene, camera);
    },
    dispose() {
      for (const { mesh } of meshes) {
        mesh.geometry.dispose();
        mesh.material.map.dispose();
        mesh.material.dispose();
      }
      renderer.dispose();
    },
  };
}
