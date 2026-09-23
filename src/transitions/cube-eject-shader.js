import * as THREE from "three";

/**
 * Scheme B: 3D Cube Face Ejection & 180-Degree Card Flip.
 * Creates a thick cardstock object with front (ticket) and back (gold emblem passport).
 */

export function createEjectCard(frontTex, backTex, width = 706, height = 460) {
  const group = new THREE.Group();
  group.name = "eject-card-root";

  // Card aspect normalized to 3D world units (base width ~ 2.4)
  const w = 2.4;
  const h = w * (height / width);
  const thickness = 0.025;

  const geo = new THREE.BoxGeometry(w, h, thickness, 16, 16, 1);

  // Card materials:
  // 0: right edge, 1: left edge, 2: top edge, 3: bottom edge, 4: front (ticket), 5: back (passport)
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xffeef5,
    roughness: 0.3,
    metalness: 0.1,
  });

  const frontMat = new THREE.MeshPhysicalMaterial({
    map: frontTex,
    roughness: 0.18,
    metalness: 0.05,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
  });

  const backMat = new THREE.MeshPhysicalMaterial({
    map: backTex,
    roughness: 0.22,
    metalness: 0.35,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
  });

  const materials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];
  const mesh = new THREE.Mesh(geo, materials);
  mesh.castShadow = true;
  group.add(mesh);

  return {
    group,
    mesh,
    frontMat,
    backMat,
    updatePose(progress, fromTransform, toTransform) {
      // Eased progress (cubic out for travel, with spring settle at end)
      const p = Math.min(1, Math.max(0, progress));

      // Parabolic jump along Z (lifts off from cube, peaks midway, settles onto target)
      const jumpZ = Math.sin(p * Math.PI) * 1.8;

      // Position interpolation
      const x = fromTransform.x + (toTransform.x - fromTransform.x) * p;
      const y = fromTransform.y + (toTransform.y - fromTransform.y) * p;
      const z = fromTransform.z + (toTransform.z - fromTransform.z) * p + jumpZ;
      group.position.set(x, y, z);

      // Rotation: 180° Flip around Y + gentle aerodynamic tilt around Z & X
      // Start at back (or initial face angle) and flip 180° to reveal front face
      const rotX = fromTransform.rotX + (toTransform.rotX - fromTransform.rotX) * p + Math.sin(p * Math.PI) * 0.22;
      const rotY = fromTransform.rotY + (toTransform.rotY + Math.PI - fromTransform.rotY) * p;
      const rotZ = fromTransform.rotZ + (toTransform.rotZ - fromTransform.rotZ) * p - Math.sin(p * Math.PI) * 0.15;
      group.rotation.set(rotX, rotY, rotZ);

      // Scale interpolation
      const s = fromTransform.scale + (toTransform.scale - fromTransform.scale) * p;
      group.scale.set(s, s, s);
    },
  };
}
