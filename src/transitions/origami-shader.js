import * as THREE from "three";
import { createCardShadowTexture } from "./stamp-texture.js";

/**
 * Scheme C: 3D Origami Accordion Unfold & Press.
 * Constructs a 3-panel hinged ticket that unfolds from a compact Z-fold into a flat ticket.
 */

function createSubPanelGeometry(w, h, uMin, uMax) {
  const geo = new THREE.PlaneGeometry(w, h, 16, 16);
  const uvAttr = geo.attributes.uv;
  for (let i = 0; i < uvAttr.count; i++) {
    const origU = uvAttr.getX(i);
    // Remap [0, 1] to [uMin, uMax]
    uvAttr.setX(i, uMin + origU * (uMax - uMin));
  }
  uvAttr.needsUpdate = true;
  return geo;
}

export function createOrigamiTicket(frontTex, backTex, width = 706, height = 383) {
  const root = new THREE.Group();
  root.name = "origami-ticket-root";

  const totalW = 2.4;
  const h = totalW * (height / width);

  // Split into 3 panels: Left (36%), Center (36%), Right (28%)
  const wLeft = totalW * 0.36;
  const wCenter = totalW * 0.36;
  const wRight = totalW * 0.28;

  const matConfig = {
    roughness: 0.25,
    metalness: 0.05,
    clearcoat: 0.6,
    side: THREE.DoubleSide,
    toneMapped: false,
  };

  const frontMat = new THREE.MeshPhysicalMaterial({
    map: frontTex,
    ...matConfig,
  });

  // --- CENTER PANEL (Anchor) ---
  const centerGeo = createSubPanelGeometry(wCenter, h, 0.36, 0.72);
  const centerMesh = new THREE.Mesh(centerGeo, frontMat);
  root.add(centerMesh);

  // --- LEFT PANEL (Hinged to left edge of center panel) ---
  const leftHinge = new THREE.Group();
  leftHinge.position.set(-wCenter / 2, 0, 0);
  root.add(leftHinge);

  const leftGeo = createSubPanelGeometry(wLeft, h, 0.0, 0.36);
  const leftMesh = new THREE.Mesh(leftGeo, frontMat);
  // Center of left panel is -wLeft / 2 relative to hinge
  leftMesh.position.set(-wLeft / 2, 0, 0);
  leftHinge.add(leftMesh);

  // --- RIGHT PANEL (Hinged to right edge of center panel) ---
  const rightHinge = new THREE.Group();
  rightHinge.position.set(wCenter / 2, 0, 0);
  root.add(rightHinge);

  const rightGeo = createSubPanelGeometry(wRight, h, 0.72, 1.0);
  const rightMesh = new THREE.Mesh(rightGeo, frontMat);
  // Center of right panel is +wRight / 2 relative to hinge
  rightMesh.position.set(wRight / 2, 0, 0);
  rightHinge.add(rightMesh);

  // Crease shadow decals (dark lines that fade as panels flatten)
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x220515,
    transparent: true,
    opacity: 0.45,
  });
  const shadowGeo = new THREE.PlaneGeometry(0.04, h);

  const shadowLeft = new THREE.Mesh(shadowGeo, shadowMat);
  shadowLeft.position.set(0, 0, 0.005);
  leftHinge.add(shadowLeft);

  const shadowRight = new THREE.Mesh(shadowGeo, shadowMat);
  shadowRight.position.set(0, 0, 0.005);
  rightHinge.add(shadowRight);

  // Resting drop shadow under the whole ticket (the DOM card's grounding),
  // fading in as the fold flattens.
  const groundShadowMat = new THREE.MeshBasicMaterial({
    map: createCardShadowTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundShadowMat);
  groundShadow.scale.set(totalW * 1.52, h * 1.73, 1);
  groundShadow.position.z = -0.02;
  root.add(groundShadow);

  return {
    root,
    frontMat,
    updatePose(progress, fromTransform, toTransform) {
      const p = Math.min(1, Math.max(0, progress));

      // Unfold curves with overshoot & spring press
      // Fold angle starts at ~145 deg (2.53 rad) and settles to 0 rad
      const unfoldT = Math.min(1, p * 1.15);
      const easeUnfold = 1 - Math.pow(1 - unfoldT, 3.2);

      const maxAngle = 2.45; // ~140 degrees
      const currentAngle = maxAngle * (1 - easeUnfold);

      // Accordion Z-fold: left hinges forward, right hinges backward
      leftHinge.rotation.y = -currentAngle;
      rightHinge.rotation.y = currentAngle;

      // Crease shadow opacity decays as angle approaches 0
      shadowMat.opacity = Math.max(0, (1 - easeUnfold) * 0.45);

      // Root position and flight path
      const jumpZ = Math.sin(p * Math.PI) * 1.5;
      const x = fromTransform.x + (toTransform.x - fromTransform.x) * p;
      const y = fromTransform.y + (toTransform.y - fromTransform.y) * p;
      const z = fromTransform.z + (toTransform.z - fromTransform.z) * p + jumpZ;
      root.position.set(x, y, z);

      // Subtle aerodynamic wobble while unfolding
      const wobble = Math.sin(p * Math.PI * 2.5) * (1 - p) * 0.12;
      root.rotation.set(
        fromTransform.rotX + (toTransform.rotX - fromTransform.rotX) * p + wobble,
        fromTransform.rotY + (toTransform.rotY - fromTransform.rotY) * p,
        fromTransform.rotZ + (toTransform.rotZ - fromTransform.rotZ) * p - wobble * 0.8
      );

      const s = fromTransform.scale + (toTransform.scale - fromTransform.scale) * p;
      root.scale.set(s, s, s);

      const settle = Math.min(1, Math.max(0, (p - 0.55) / 0.45));
      groundShadowMat.opacity = settle * settle * 0.55;
    },
  };
}
