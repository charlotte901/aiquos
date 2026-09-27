import { useEffect, useRef, useState } from "react";
import { readTuningOverrides, subscribeTuning } from "./character-tuning-store";
import TUNING_DEFAULTS from "./character-tuning.json";
import "./task-character.css";

/**
 * 伴学角色舞台：播放一段带 alpha 通道的 3D 角色视频。
 *
 * 参考素材是一支 28 秒的竖屏动画，每 7 秒切换一位角色——四位角色刚好
 * 对应四个测评通道，各自的主题色也一致（见 CHARACTERS）。每个片段已被
 * 裁成独立的一支动画：出场即待机站姿，随后做一次手里的动作，最后落定。
 *
 * 播放节奏由组件控制（不用 `loop`）：整段播完后停留 10 秒，再播下一轮。
 *
 * 素材两套编码并存：VP9/WebM 带 alpha（体积小，Chrome/Firefox/Edge），
 * 以及 HEVC/MOV 带 alpha（Safari 只认这个）。
 */
const CHARACTERS = {
  // 蓝白夹克的少年（手抬到脸侧）— 综合测评
  comprehensive: {
    label: "智核向导",
    sources: [
      { src: "/assets/companion-comprehensive.webm", type: "video/webm" },
      { src: "/assets/companion-comprehensive.mov", type: "video/quicktime" },
    ],
  },
  // 白绿校服、抱着笔记本的女生 — 客观题（绿色主题）
  objective: {
    label: "林教授的助教",
    sources: [
      { src: "/assets/companion-objective.webm", type: "video/webm" },
      { src: "/assets/companion-objective.mov", type: "video/quicktime" },
    ],
  },
  // 紫色礼帽的黑袍法师 — 对话式测评（紫色主题）
  conversation: {
    label: "苏记者的搭档",
    sources: [
      { src: "/assets/companion-conversation.webm", type: "video/webm" },
      { src: "/assets/companion-conversation.mov", type: "video/quicktime" },
    ],
  },
  // 橙色运动装、挥手打招呼的少年 — 实操（橙色主题）
  practical: {
    label: "陈创客的学徒",
    sources: [
      { src: "/assets/companion-practical.webm", type: "video/webm" },
      { src: "/assets/companion-practical.mov", type: "video/quicktime" },
    ],
  },
};

const FALLBACK = CHARACTERS.comprehensive;

export function Task3DCharacter({ id = "comprehensive" }) {
  const videoRef = useRef(null);
  // 一位角色＝一个测评通道：综合/客观/对话/实操各自固定自己的伴学角色。
  // 综合测评内部虽有对话、客观、实操三种阶段，但它是同一个测评，
  // 全程用同一位向导（此处曾按阶段切换，导致第 1 关与「对话式测评」
  // 撞了同一个人物）。
  const character = CHARACTERS[id] ?? FALLBACK;
  // 缩放/位移微调：文件默认值 + 调参面板的本地覆盖（后者优先）。
  // 面板改动通过 subscribeTuning 通知，这里保持为 state 以便即时重渲染。
  const resolveTuning = () => ({
    ...(TUNING_DEFAULTS[id] ?? { scale: 1, x: 0, y: 0 }),
    ...(readTuningOverrides()?.[id] ?? {}),
  });
  const [tuning, setTuning] = useState(resolveTuning);
  useEffect(() => subscribeTuning(() => setTuning(resolveTuning())), [id]);

  // 播放节奏：整段动画播完 → 停在结束姿态 10 秒 → 再播下一轮。
  //
  // 不用 `loop` 属性做无缝循环：那会让动作一轮接一轮没有间隔，人物看起来
  // 一直在动。改为监听 ended 事件、延时后重播，间隔期画面停在最后一帧
  // （人物保持落定姿态，不是黑屏或回位）。
  //
  // 自动播放策略：静音视频通常可自动播放，但省电模式/后台标签仍可能拒绝；
  // 被拒绝时静默重试。系统开启「减少动态效果」时完全不播，停在首帧。
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const REPLAY_DELAY_MS = 10_000;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let replayTimer = 0;

    const clearReplay = () => {
      if (replayTimer) {
        window.clearTimeout(replayTimer);
        replayTimer = 0;
      }
    };

    const play = () => {
      clearReplay();
      const attempt = video.play();
      // 自动播放被拒（无用户手势的页面在部分环境会拒绝）：记下来，
      // 等第一次交互后补播，否则角色会一直停在首帧。
      if (attempt?.catch) {
        attempt.catch(() => {
          blocked = true;
        });
      }
    };
    let blocked = false;

    const onFirstGesture = () => {
      if (blocked || video.paused) play();
      blocked = false;
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };

    const handleEnded = () => {
      if (reduce.matches) return;
      clearReplay();
      replayTimer = window.setTimeout(() => {
        // 重播前回到开头，否则 play() 会立刻再次触发 ended。
        video.currentTime = 0;
        video.play().catch(() => {});
      }, REPLAY_DELAY_MS);
    };

    const applyMotionPreference = () => {
      if (reduce.matches) {
        clearReplay();
        video.pause();
        video.currentTime = 0;
      } else {
        play();
      }
    };

    video.addEventListener("ended", handleEnded);
    applyMotionPreference();
    reduce.addEventListener("change", applyMotionPreference);
    window.addEventListener("pointerdown", onFirstGesture);
    window.addEventListener("keydown", onFirstGesture);

    const onVisible = () => {
      if (document.visibilityState !== "visible" || reduce.matches) return;
      // 后台标签里定时器会被节流、视频也可能被暂停；回到前台时若停在
      // 末尾就补一次延时重播，否则直接继续。
      if (video.ended) handleEnded();
      else if (video.paused) play();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearReplay();
      video.removeEventListener("ended", handleEnded);
      reduce.removeEventListener("change", applyMotionPreference);
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [character]);

  return (
    <div
      className="task-character-container"
      data-character={id}
      /* 微调值以行内 CSS 变量注入：文件默认值（src/character-tuning.json）
         在这里落地；?tune=1 面板改动后经 subscribeTuning 通知，
         本组件重渲染时用新值覆盖。 */
      style={{
        "--ctune-scale": String(tuning.scale),
        "--ctune-x": `${tuning.x}%`,
        "--ctune-y": `${tuning.y}%`,
      }}
    >
      {/* key 让换角色时重建 <video>：换 source 不会自动重新加载 */}
      <video
        key={character.sources[0].src}
        ref={videoRef}
        className="task-character-video"
        data-tuning-scale={tuning.scale}
        data-tuning-x={tuning.x}
        data-tuning-y={tuning.y}
        autoPlay
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-label={`AI 伴学导师 · ${character.label}`}
      >
        {character.sources.map(({ src, type }) => (
          <source key={src} src={src} type={type} />
        ))}
      </video>
    </div>
  );
}
