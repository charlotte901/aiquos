import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Sparkle, ChatCircleDots } from "@phosphor-icons/react";
import { getComprehensiveLevel } from "./comprehensive-quiz";
import "./task-character.css";

// Map assessment theme colors to Three.js hex colors
const THEME_HEX = {
  comprehensive: 0x247cf1, // Blue
  objective: 0x00a96d,     // Green
  conversation: 0x7438e5,  // Purple
  practical: 0xfb5727,     // Coral Orange
};

const THEME_GLOW = {
  comprehensive: 0x6bb1ff,
  objective: 0x2ff2a4,
  conversation: 0xb588ff,
  practical: 0xff8e66,
};

/**
 * Creates the built-in procedural 3D AI Guardian/Mentor.
 * Clean, modern Apple-meets-cyberpunk aesthetic:
 * high-gloss white ceramic chassis, glowing holographic visor,
 * floating halo ring, power core, floating hands, and soft floor shadow.
 */
function createProceduralGuardian(themeColorHex, themeGlowHex) {
  const root = new THREE.Group();
  root.name = "guardian-root";

  // Materials
  const ceramicMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.14,
    metalness: 0.08,
    clearcoat: 0.95,
    clearcoatRoughness: 0.1,
  });

  const darkVisorMat = new THREE.MeshPhysicalMaterial({
    color: 0x111622,
    roughness: 0.05,
    metalness: 0.8,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });

  const emissiveCoreMat = new THREE.MeshStandardMaterial({
    color: themeGlowHex,
    emissive: themeColorHex,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });

  const eyeGlowMat = new THREE.MeshBasicMaterial({
    color: 0x7be5ff,
  });

  const haloMat = new THREE.MeshStandardMaterial({
    color: themeGlowHex,
    emissive: themeColorHex,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.4,
  });

  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x2b3445,
    roughness: 0.4,
    metalness: 0.6,
  });

  // --- FLOATING BASE & PEDESTAL ---
  const pedestalGroup = new THREE.Group();
  pedestalGroup.position.y = -1.55;

  // Contact Shadow plane
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, "rgba(0, 0, 0, 0.42)");
  grad.addColorStop(0.6, "rgba(0, 0, 0, 0.12)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(canvas);
  const shadowGeo = new THREE.PlaneGeometry(2.4, 2.4);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.02;
  pedestalGroup.add(shadowMesh);

  // Holographic circular rings
  const ringGeo1 = new THREE.RingGeometry(1.05, 1.12, 48);
  const ringMat1 = new THREE.MeshBasicMaterial({
    color: themeGlowHex,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
  ringMesh1.rotation.x = -Math.PI / 2;
  ringMesh1.position.y = 0.04;
  pedestalGroup.add(ringMesh1);

  const ringGeo2 = new THREE.RingGeometry(0.7, 0.73, 40);
  const ringMat2 = new THREE.MeshBasicMaterial({
    color: themeColorHex,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
  ringMesh2.rotation.x = -Math.PI / 2;
  ringMesh2.position.y = 0.05;
  pedestalGroup.add(ringMesh2);

  root.add(pedestalGroup);

  // --- CHARACTER BODY & LIMBS (Parent for vertical bobbing) ---
  const bodyFloatGroup = new THREE.Group();
  bodyFloatGroup.position.y = 0;
  root.add(bodyFloatGroup);

  // --- TORSO / CHASSIS ---
  const torsoGeo = new THREE.CapsuleGeometry(0.48, 0.42, 16, 24);
  const torso = new THREE.Mesh(torsoGeo, ceramicMat);
  torso.position.y = -0.25;
  bodyFloatGroup.add(torso);

  // Core Reactor (Chest)
  const coreGeo = new THREE.SphereGeometry(0.16, 20, 20);
  const coreMesh = new THREE.Mesh(coreGeo, emissiveCoreMat);
  coreMesh.position.set(0, -0.15, 0.42);
  coreMesh.scale.set(1, 1, 0.45);
  bodyFloatGroup.add(coreMesh);

  // Collar ring / joint
  const collarGeo = new THREE.CylinderGeometry(0.24, 0.3, 0.12, 24);
  const collar = new THREE.Mesh(collarGeo, jointMat);
  collar.position.y = 0.12;
  bodyFloatGroup.add(collar);

  // --- HEAD (Tracks mouse pointer) ---
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.54;
  bodyFloatGroup.add(headGroup);

  // Helmet / Head sphere
  const headGeo = new THREE.SphereGeometry(0.48, 28, 28);
  const headMesh = new THREE.Mesh(headGeo, ceramicMat);
  headMesh.scale.set(1.05, 0.98, 1.02);
  headGroup.add(headMesh);

  // Curved dark visor
  const visorGeo = new THREE.SphereGeometry(0.44, 24, 24, 0, Math.PI);
  const visorMesh = new THREE.Mesh(visorGeo, darkVisorMat);
  visorMesh.rotation.y = Math.PI / 2;
  visorMesh.rotation.x = -Math.PI / 18;
  visorMesh.scale.set(0.9, 0.62, 0.48);
  visorMesh.position.set(0, 0.02, 0.34);
  headGroup.add(visorMesh);

  // Visor Digital Eyes (Normal state)
  const eyeGroup = new THREE.Group();
  eyeGroup.position.set(0, 0.03, 0.48);

  const eyeGeo = new THREE.CapsuleGeometry(0.045, 0.08, 12, 16);
  const eyeLeft = new THREE.Mesh(eyeGeo, eyeGlowMat);
  eyeLeft.position.x = -0.14;
  eyeLeft.rotation.z = -Math.PI / 24;

  const eyeRight = new THREE.Mesh(eyeGeo, eyeGlowMat);
  eyeRight.position.x = 0.14;
  eyeRight.rotation.z = Math.PI / 24;

  eyeGroup.add(eyeLeft);
  eyeGroup.add(eyeRight);
  headGroup.add(eyeGroup);

  // Headphone / Ear nodes
  const earGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 20);
  const earLeft = new THREE.Mesh(earGeo, ceramicMat);
  earLeft.rotation.z = Math.PI / 2;
  earLeft.position.set(-0.54, 0.02, 0);
  headGroup.add(earLeft);

  const earLightGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.11, 16);
  const earLightLeft = new THREE.Mesh(earLightGeo, emissiveCoreMat);
  earLightLeft.rotation.z = Math.PI / 2;
  earLightLeft.position.set(-0.54, 0.02, 0);
  headGroup.add(earLightLeft);

  const earRight = new THREE.Mesh(earGeo, ceramicMat);
  earRight.rotation.z = -Math.PI / 2;
  earRight.position.set(0.54, 0.02, 0);
  headGroup.add(earRight);

  const earLightRight = new THREE.Mesh(earLightGeo, emissiveCoreMat);
  earLightRight.rotation.z = -Math.PI / 2;
  earLightRight.position.set(0.54, 0.02, 0);
  headGroup.add(earLightRight);

  // Floating Halo / Data ring above head
  const haloGeo = new THREE.TorusGeometry(0.38, 0.028, 16, 40);
  const haloMesh = new THREE.Mesh(haloGeo, haloMat);
  haloMesh.rotation.x = Math.PI / 2;
  haloMesh.position.y = 0.68;
  headGroup.add(haloMesh);

  // --- FLOATING HANDS / ORBS ---
  const handGeo = new THREE.SphereGeometry(0.14, 18, 18);
  handGeo.scale(1, 0.82, 1.15);

  const leftHandGroup = new THREE.Group();
  leftHandGroup.position.set(-0.76, -0.22, 0.1);
  const leftHand = new THREE.Mesh(handGeo, ceramicMat);
  leftHandGroup.add(leftHand);
  bodyFloatGroup.add(leftHandGroup);

  const rightHandGroup = new THREE.Group();
  rightHandGroup.position.set(0.76, -0.22, 0.1);
  const rightHand = new THREE.Mesh(handGeo, ceramicMat);
  rightHandGroup.add(rightHand);
  bodyFloatGroup.add(rightHandGroup);

  return {
    root,
    bodyFloatGroup,
    headGroup,
    haloMesh,
    coreMesh,
    eyeLeft,
    eyeRight,
    leftHandGroup,
    rightHandGroup,
    ringMesh1,
    ringMesh2,
    eyeGlowMat,
    emissiveCoreMat,
    haloMat,
  };
}

export function Task3DCharacter({
  id = "comprehensive",
  stage = 1,
  mode = "comprehensive",
  phase = "quiz",
  reaction = null,
  result = null,
  modelUrl = null,
  speakerName = null,
}) {
  const containerRef = useRef(null);
  const stateRef = useRef({
    result,
    phase,
    pointer: { x: 0, y: 0, targetX: 0, targetY: 0 },
    celebrateTimer: 0,
    wrongTimer: 0,
  });

  const [dialogueText, setDialogueText] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [feedbackKind, setFeedbackKind] = useState("idle");

  // Keep stateRef in sync with props
  useEffect(() => {
    stateRef.current.result = result;
    stateRef.current.phase = phase;

    if (result) {
      if (result.correct) {
        stateRef.current.celebrateTimer = 180; // frames
        setFeedbackKind("correct");
      } else {
        stateRef.current.wrongTimer = 160;
        setFeedbackKind("wrong");
      }
    } else {
      setFeedbackKind("idle");
    }
  }, [result, phase]);

  // Compute guardian / speaker name and dialogue
  useEffect(() => {
    const level = getComprehensiveLevel(stage);
    const resolvedSpeaker = speakerName || (
      phase === "opening" || phase === "ending"
        ? level.guardian
        : result
          ? "AI 导师 · 小源"
          : level.guardian || "守护向导"
    );
    setCharacterName(resolvedSpeaker);

    if (reaction) {
      setDialogueText(reaction);
    } else if (phase === "opening") {
      setDialogueText(`欢迎来到第 ${stage} 关！仔细阅读题目，准备好了随时开始。`);
    } else if (phase === "ending") {
      setDialogueText("恭喜顺利突破本关，你的智核实力在稳步提升！");
    } else if (result?.correct) {
      setDialogueText("太棒了，判断准确！能力画像已更新。");
    } else if (result && !result.correct) {
      setDialogueText("别灰心，看看解析并总结考点，下一题继续加油！");
    } else {
      setDialogueText("正在伴学中… 点击选项作答，支持键盘 1-4 或 A-D 快速选择。");
    }
  }, [stage, phase, reaction, result, speakerName]);

  // Three.js Mount and Render Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const width = container.clientWidth || 380;
    const height = container.clientHeight || 560;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 4.4);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);

    const themeColorHex = THEME_HEX[id] || 0x247cf1;
    const themeGlowHex = THEME_GLOW[id] || 0x6bb1ff;

    const rimLight = new THREE.DirectionalLight(themeGlowHex, 3.4);
    rimLight.position.set(-3, 2, -3);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(themeColorHex, 2.0, 10);
    fillLight.position.set(0, -1.8, 2);
    scene.add(fillLight);

    // Procedural Guardian or GLTF
    let guardian = createProceduralGuardian(themeColorHex, themeGlowHex);
    scene.add(guardian.root);

    let mixer = null;
    let customModel = null;

    // If external modelUrl provided, attempt to load GLB
    if (modelUrl) {
      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          customModel = gltf.scene;
          // Scale and center model
          const box = new THREE.Box3().setFromObject(customModel);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = 2.4 / maxDim;
          customModel.scale.set(scale, scale, scale);
          customModel.position.y = -1.2;

          if (gltf.animations && gltf.animations.length) {
            mixer = new THREE.AnimationMixer(customModel);
            mixer.clipAction(gltf.animations[0]).play();
          }

          // Swap out procedural guardian with custom GLTF model
          scene.remove(guardian.root);
          scene.add(customModel);
          measureFraming(customModel);
          fitCamera();
        },
        undefined,
        (error) => {
          console.warn("[Task3DCharacter] Failed to load GLB model, using procedural guardian:", error);
        }
      );
    }

    // Mouse Pointer tracking
    const handlePointerMove = (event) => {
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      stateRef.current.pointer.targetX = Math.max(-1, Math.min(1, x));
      stateRef.current.pointer.targetY = Math.max(-1, Math.min(1, y));
    };

    window.addEventListener("pointermove", handlePointerMove);

    // Resize observer
    // 按当前可见角色的包围盒计算相机距离，保证窄舞台下手臂也不被裁切
    let framed = null;
    const measureFraming = (object) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      framed = {
        halfWidth: Math.max(size.x, 0.2) / 2,
        halfHeight: Math.max(size.y, 0.2) / 2,
        centerY: center.y,
      };
    };
    measureFraming(guardian.root);

    const fitCamera = () => {
      if (!container || !framed) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      const aspect = w / h;
      const vFov = (camera.fov * Math.PI) / 180;
      const tanV = Math.tan(vFov / 2);
      const distanceForHeight = framed.halfHeight / tanV;
      const distanceForWidth = framed.halfWidth / (tanV * aspect);
      const distance = Math.max(distanceForHeight, distanceForWidth, 3.2) * 1.12;
      camera.aspect = aspect;
      camera.position.set(0, framed.centerY, distance);
      camera.lookAt(0, framed.centerY, 0);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const handleResize = () => fitCamera();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop
    let animId = 0;
    let clock = new THREE.Clock();

    const render = () => {
      animId = requestAnimationFrame(render);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Pointer smoothing
      const p = stateRef.current.pointer;
      p.x += (p.targetX - p.x) * 0.08;
      p.y += (p.targetY - p.y) * 0.08;

      if (mixer) {
        mixer.update(delta);
      }

      if (customModel) {
        customModel.rotation.y = p.x * 0.35;
        customModel.position.y = -1.2 + Math.sin(elapsed * 2.2) * 0.05;
      } else if (guardian) {
        // Floating bobbing motion
        const isCelebrating = stateRef.current.celebrateTimer > 0;
        const isWrong = stateRef.current.wrongTimer > 0;

        if (isCelebrating) {
          stateRef.current.celebrateTimer -= 1;
        }
        if (isWrong) {
          stateRef.current.wrongTimer -= 1;
        }

        const bobSpeed = isCelebrating ? 5.5 : 2.2;
        const bobAmp = isCelebrating ? 0.12 : 0.045;
        guardian.bodyFloatGroup.position.y = Math.sin(elapsed * bobSpeed) * bobAmp;

        // Head look-at tracking with mouse
        guardian.headGroup.rotation.y = p.x * 0.45;
        guardian.headGroup.rotation.x = -p.y * 0.28;

        // Torso subtle lag
        guardian.bodyFloatGroup.rotation.y = p.x * 0.18;

        // Halo spin
        guardian.haloMesh.rotation.z = elapsed * (isCelebrating ? 4.5 : 1.2);

        // Pedestal rings slow orbit
        guardian.ringMesh1.rotation.z = -elapsed * 0.4;
        guardian.ringMesh2.rotation.z = elapsed * 0.6;

        // Hands gesture animation
        if (isCelebrating) {
          // Cheering raised hands
          guardian.leftHandGroup.position.y = 0.2 + Math.sin(elapsed * 8) * 0.08;
          guardian.rightHandGroup.position.y = 0.2 + Math.sin(elapsed * 8 + 0.8) * 0.08;
          guardian.eyeGlowMat.color.setHex(0x55ff99); // Gold-green celebratory eyes
        } else if (isWrong) {
          // Thoughtful encouraging tilt
          guardian.leftHandGroup.position.y = -0.22;
          guardian.rightHandGroup.position.y = -0.08;
          guardian.eyeGlowMat.color.setHex(0xffaa66); // Amber thoughtful eyes
        } else {
          // Normal idle hover
          guardian.leftHandGroup.position.y = -0.22 + Math.cos(elapsed * 2.2) * 0.03;
          guardian.rightHandGroup.position.y = -0.22 + Math.sin(elapsed * 2.2) * 0.03;
          guardian.eyeGlowMat.color.setHex(0x7be5ff); // Cool cyan digital eyes
        }

        // Core pulsing intensity
        const pulse = 1.4 + Math.sin(elapsed * 3.0) * 0.5;
        guardian.emissiveCoreMat.emissiveIntensity = pulse;
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(render);

    // Cleanup
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("pointermove", handlePointerMove);
      resizeObserver.disconnect();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      renderer.dispose();
      scene.clear();
    };
  }, [id, modelUrl]);

  return (
    <div className={`task-character-container is-${feedbackKind}`}>
      {/* Dynamic 3D WebGL Canvas */}
      <div className="task-character-canvas" ref={containerRef} />

      {/* Floating Interactive Speech Bubble */}
      <div className="task-character-bubble" role="status" aria-live="polite">
        <div className="bubble-header">
          <ChatCircleDots size={16} weight="fill" />
          <span className="bubble-speaker">{characterName}</span>
          {result?.correct && <span className="bubble-badge is-correct"><Sparkle weight="fill" /> 回答正确</span>}
          {result && !result.correct && <span className="bubble-badge is-wrong">复盘提示</span>}
        </div>
        <p className="bubble-text">{dialogueText}</p>
      </div>

      {/* Bottom Character Identity Tag */}
      <div className="task-character-badge">
        <span className="badge-pulse" />
        <span className="badge-name">{characterName}</span>
        <span className="badge-status">
          {feedbackKind === "correct" ? "点赞祝贺中" : feedbackKind === "wrong" ? "启发思路中" : "全程伴学中"}
        </span>
      </div>
    </div>
  );
}
