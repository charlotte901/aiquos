/** 真实案例论坛数据库 (AIQUOS Real Case Forum Topics)
 *
 * 融合项目内全部 17 个真实案例（涵盖 AI 生图 / AI 视频 / AI 代码 / AI 办公），
 * 每个案例配备真实提示词 (Prompt)、模型信息、发布者创作配文复盘、点赞/收藏/评论数据。
 */

const TAG_PALETTES = {
  "AI 生图": { color: "#f568a3", ink: "#ffffff", line: "#ffffff", accent: "#ffd7ec" },
  "AI 视频": { color: "#247cf1", ink: "#ffffff", line: "#ffffff", accent: "#c8e0ff" },
  "AI 代码": { color: "#7438e5", ink: "#ffffff", line: "#ffffff", accent: "#e0ccff" },
  "AI 办公": { color: "#00a96d", ink: "#ffffff", line: "#ffffff", accent: "#bdf2d8" },
};

function casePost({
  id,
  tag,
  title,
  summary,
  author,
  createdAt,
  views,
  likes,
  image,
  imageRatio = "16 / 9",
  model,
  prompt,
  params = "",
  content,
  comments = [],
}) {
  const palette = TAG_PALETTES[tag] ?? {
    color: "#f568a3",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#ffd7ec",
  };
  return {
    id,
    tag,
    title,
    summary,
    author,
    createdAt,
    views,
    likes,
    image,
    imageRatio,
    model,
    prompt,
    params,
    content,
    comments,
    color: palette.color,
    ink: palette.ink,
    line: palette.line,
    accent: palette.accent,
  };
}

export const TOPIC_POSTS = [
  // ── AI 生图 (Visual Arts) ────────────────────────────────────────────────
  casePost({
    id: "case-cat-glasses",
    tag: "AI 生图",
    title: "戴眼镜的黑猫 · 宣纸水墨神态捕捉",
    summary: "对 AI 说一句想要的角色，得到一张有脾气的猫。蓬乱的毛、镜片反光和微怒表情一次成型。",
    author: "知遥测不准",
    createdAt: "2026-09-18 19:20",
    views: 4820,
    likes: 562,
    image: "/assets/cases/1.webp",
    imageRatio: "3 / 4",
    model: "Midjourney v6.0 (Raw Mode)",
    params: "--ar 3:4 --v 6.0 --style raw --stylize 280",
    prompt:
      "A quirky British Shorthair black cat wearing thick black-rimmed vintage spectacles, intense intellectual gaze with slight grumpy frown, loose ink wash and dry brushstrokes on textured raw Xuan paper, expressive ink splatter, warm rice paper tone, minimal composition, masterwork --ar 3:4 --v 6.0 --style raw",
    content: [
      "做角色的难点不在画得像，而在把‘脾气’画出来。最开始用默认风格，模型总喜欢把猫画成光溜溜的 3D 渲染质感，完全没有文人画那种神气。",
      "后来发现关键在于限定媒介：‘raw Xuan paper’（生宣）配合‘dry brushstrokes’（枯笔焦墨），再指定黑框老花镜作为荒谬的反差符号，一下子就立住了。",
      "提示词里的‘intense intellectual gaze with slight grumpy frown’是灵魂：用文学化的神态描述替代简单的表情词，AI 能生成非常有层次的微表情。",
      "不需要会画画，也能把陪伴自己的宠物变成一张可以挂在书房的角色插画。这就是 AI 给创作者带来的直觉解放。",
    ],
    comments: [
      {
        id: "c-cat-1",
        author: "屿见图表",
        createdAt: "2026-09-18 20:05",
        content: "枯笔焦墨和生宣纸纹理控制得太绝了，镜片里那一抹冷光正好压住了黑色的闷。",
      },
      {
        id: "c-cat-2",
        author: "徐望舒",
        createdAt: "2026-09-18 21:14",
        content: "‘脾气’这个词抓得准。好提示词是在跟模型做心理学沟通，不是在列名词清单。",
      },
      {
        id: "c-cat-3",
        author: "一宁不苟",
        createdAt: "2026-09-19 09:30",
        content: "已收藏！准备照这个结构给我家柴犬也写一组提示词试试。",
      },
    ],
  }),

  casePost({
    id: "case-parrot",
    tag: "AI 生图",
    title: "笼外的鹦鹉 · 水彩晕染留白与灵动画意",
    summary: "让 AI 画一只正在看你的鸟。羽毛黄绿过渡、爪子与树枝水彩晕染留白一次成型，眼神充满好奇灵气。",
    author: "屿见图表",
    createdAt: "2026-09-17 14:15",
    views: 3180,
    likes: 388,
    image: "/assets/cases/6.webp",
    imageRatio: "3 / 4",
    model: "Midjourney v6.0",
    params: "--ar 3:4 --v 6.0 --stylize 320",
    prompt:
      "A vivid emerald and chartreuse parrot perched quietly on a wild mossy branch, head cocked looking straight at viewer, delicate transparent wet-on-wet watercolor wash, loose calligraphic outlines, natural pigment granulation, organic watercolor paper texture, generous white breathing space --ar 3:4 --v 6.0",
    content: [
      "水彩最动人的是水色交融的不可预测性，而传统算法容易把边缘扣得死板。这次调优的核心目标是保留‘湿画法’（wet-on-wet）的自由晕染。",
      "给提示词加入‘generous white breathing space’（留白）后，画面立刻有了呼吸感，背景没有多余杂色，整只鸟像是在宣纸上刚刚干透。",
      "爪子扣住树枝的受力感、圆圆的眼圈高光，都是一句话一次生成的。同一组词换几个随机种子，能拿到截然不同的灵动姿态。",
    ],
    comments: [
      {
        id: "c-par-1",
        author: "闻人夏",
        createdAt: "2026-09-17 15:40",
        content: "留白的呼吸感太重要了！很多新手提示词喜欢写 full background，最后画面挤得透不过气。",
      },
      {
        id: "c-par-2",
        author: "小满闯关中",
        createdAt: "2026-09-17 18:22",
        content: "眼睛里那点亮环真有神气，感觉下一秒它就要扭头啄树枝了。",
      },
    ],
  }),

  casePost({
    id: "case-collage",
    tag: "AI 生图",
    title: "高原拼贴海报 · 混合媒介手工质感复现",
    summary: "雪山、毡房与牦牛插画，撕纸便签的排布，连同手写标注和印章位置一次铺好，宛如手工拼贴一下午。",
    author: "苏一宁",
    createdAt: "2026-09-16 11:30",
    views: 2950,
    likes: 342,
    image: "/assets/cases/3.webp",
    imageRatio: "3 / 4",
    model: "Midjourney v6.0 (Raw)",
    params: "--ar 3:4 --v 6.0 --style raw",
    prompt:
      "Torn paper mixed-media collage poster of Tibetan highlands: snow-capped peaks, nomad felt yurt, yak silhouette, overlapping textured aged parchment strips, red postal rubber stamp, handwritten expedition diary annotations, deep ultramarine blue field background, tactile paper grain --ar 3:4 --v 6.0",
    content: [
      "这是一次把现代平面设计与手工日记拼贴融合的尝试。提示词中引入了‘torn paper strips’（撕纸条）和‘aged parchment’（做旧羊皮纸）。",
      "深蓝色大底衬托出浅色便签的层次，模型自动在纸条边缘模拟出了细碎的纤维毛边与轻微投影，几乎难辨是否为人工实物翻拍。",
      "通过‘handwritten diary annotations’要求手写笔迹，打破了数字海报容易有的规整僵硬感，故事感立刻丰富起来。",
    ],
    comments: [
      {
        id: "c-col-1",
        author: "陈序优化中",
        createdAt: "2026-09-16 13:10",
        content: "纸张纤维毛边的质感很惊艳，克制的深蓝底色让元素非常凝聚。",
      },
    ],
  }),

  casePost({
    id: "case-ice",
    tag: "AI 生图",
    title: "The Last Ice · 虚构环境短片极简海报",
    summary: "一块巨大的透明冰封着鲜红塑料椅。珊瑚橘纸面留出大片纯净空白，贴纸标签与手写题字安静荒谬。",
    author: "顾清和",
    createdAt: "2026-09-15 16:40",
    views: 3820,
    likes: 418,
    image: "/assets/cases/7.webp",
    imageRatio: "3 / 4",
    model: "Midjourney v6.0",
    params: "--ar 3:4 --v 6.0 --stylize 180",
    prompt:
      "Minimalist conceptual art film poster: a bright red plastic monobloc chair frozen solid inside a pristine transparent block of melting ice, soft studio shadow, warm coral orange paper backdrop, crooked label stickers, handwritten title 'it was still cold when we left', high fashion editorial look --ar 3:4 --v 6.0",
    content: [
      "艺术海报的核心在于‘安静的荒谬感’。一把最廉价的红色塑料椅，被当成珠宝一样端庄地封存在透明冰块中，打着摄影棚的静物柔光。",
      "背景使用温暖高饱和的珊瑚橘，与冰块的冷透形成强烈张力。版面特意控制贴纸的不整齐与手写字体，避免 AI 常见的‘死板居中’。",
      "手写的一句‘it was still cold when we left’把整张海报的情绪收在了冰融化前的静止时刻。",
    ],
    comments: [
      {
        id: "c-ice-1",
        author: "知遥测不准",
        createdAt: "2026-09-15 17:30",
        content: "冷暖反差和塑料椅的符号感太绝了，完全可以作为气候主题独立影展的主视觉。",
      },
      {
        id: "c-ice-2",
        author: "沈观澜",
        createdAt: "2026-09-15 19:15",
        content: "歪斜的贴纸和手写签名让画面有了真实的‘人造缺陷感’，高级！",
      },
    ],
  }),

  casePost({
    id: "case-girl-cat",
    tag: "AI 生图",
    title: "女孩与白猫 · 绘本温情对视插画",
    summary: "让 AI 把一段温暖陪伴画成一张图。猫毛蓬松感、眼里那点蓝和脸上的雀斑由模型定下，神情默契对视。",
    author: "徐望舒",
    createdAt: "2026-09-14 10:20",
    views: 2450,
    likes: 310,
    image: "/assets/cases/5.webp",
    imageRatio: "3 / 4",
    model: "Midjourney v6.0",
    params: "--ar 3:4 --v 6.0 --stylize 200",
    prompt:
      "A heartwarming storybook flat illustration of an 8-year-old girl with faint freckles resting her chin next to her fluffy white cat, side by side, shared gentle eye contact with viewer, flat warm ochre yellow ground, soft nostalgic colored pencil linework, gentle gouache textures --ar 3:4 --v 6.0",
    content: [
      "想画一张具有治愈力量的图，难点在于让一人一猫的‘视线焦点’产生默契感，而不是各自看各自的镜头。",
      "在提示词中强调‘shared gentle eye contact with viewer’和‘flat warm ochre yellow ground’，把背景简化为纯净的赭黄暖地，把所有注意力留给人物脸部。",
      "反复调了几轮铅笔勾线与树胶水彩质感，最终猫毛的软与少女发丝的轻柔在暖底衬托下格外动人。",
    ],
    comments: [
      {
        id: "c-gc-1",
        author: "一宁不苟",
        createdAt: "2026-09-14 11:45",
        content: "暖赭石色做背景太舒服了，完全是童年绘本里的夏日午后感觉。",
      },
    ],
  }),

  casePost({
    id: "case-fishbowl",
    tag: "AI 生图",
    title: "鱼缸里的女孩 · 水彩折射专属头像",
    summary: "把自己想要的样子说给 AI 听，得到一张水彩头像。透明玻璃缸的折射与橙红小鱼游动，水灵而自由。",
    author: "闻人夏",
    createdAt: "2026-09-13 15:30",
    views: 2880,
    likes: 375,
    image: "/assets/cases/2.webp",
    imageRatio: "3 / 4",
    model: "Midjourney v6.0",
    params: "--ar 1:1 --v 6.0 --stylize 260",
    prompt:
      "Surrealist whimsical avatar: a dreamy girl whose curly hair and head form a spherical crystal fishbowl, swimming vibrant orange goldfish inside, clear turquoise water refraction, soft blush cheek tones, fluid wet watercolor blending, clean isolated white background --ar 1:1 --v 6.0",
    content: [
      "头像不一定是单调的照片，它可以是一张超越现实的自我表达。这个提示词把‘卷发’与‘圆球鱼缸’在拓扑形态上合二为一。",
      "水彩折射（turquoise water refraction）的加入，让光线在脸颊和玻璃上产生波光粼粼的动态感。",
      "生成后直接被很多人存来做即时通讯头像，真正实现了把心中构想的超现实自画像一键落地。",
    ],
    comments: [
      {
        id: "c-fb-1",
        author: "屿见图表",
        createdAt: "2026-09-13 16:20",
        content: "水光在脸上的焦散散色太通透了，金鱼的红和水底的湖蓝配比极准。",
      },
    ],
  }),

  casePost({
    id: "case-summer-bus",
    tag: "AI 生图",
    title: "夏日公交 · 空气感动画场景定格",
    summary: "想要的是一个夏天，AI 给了一整张画面。樟树透光的斑驳光影、车窗玻璃反光，反复调出记忆里的温度。",
    author: "黄小满",
    createdAt: "2026-09-12 18:10",
    views: 2650,
    likes: 320,
    image: "/assets/cases/4.webp",
    imageRatio: "3 / 4",
    model: "Midjourney v6.0",
    params: "--ar 16:9 --v 6.0 --stylize 250",
    prompt:
      "Nostalgic anime environment background still: an empty rural blue bus parked under sun-drenched green camphor tree canopy on a quiet summer afternoon, dappled foliage shadows on windshield glass, dust motes in warm golden light, cinematic Makoto Shinkai style --ar 16:9 --v 6.0",
    content: [
      "文字调图调的不是某个物体，而是‘空气感’。为了表现‘夏天的温度’，提示词重点放在了树叶透光与玻璃微尘的反光上。",
      "写‘sun-drenched camphor tree’比写普通的‘trees’有效得多——树种带来的叶片密集度与色彩层次立刻精准对应到了记忆中的江南夏日。",
      "生成后无需后期调色，光斑与阴影的冷暖互补直接满足了一张成熟动画背景的工业要求。",
    ],
    comments: [
      {
        id: "c-sb-1",
        author: "李声远",
        createdAt: "2026-09-12 19:40",
        content: "树叶缝隙漏下来的丁达尔光束太写实了，一瞬间回到高中放学等车的下午。",
      },
    ],
  }),

  // ── AI 视频 (Generative Video) ──────────────────────────────────────────
  casePost({
    id: "case-wing-it",
    tag: "AI 视频",
    title: "Wing It · 分镜剪辑配音完整成片",
    summary: "AI 把一段奇思妙想剪成了 114 秒成片。分镜结构、镜头节奏、转场与中文解说配音合成全流程生成。",
    author: "陈序优化中",
    createdAt: "2026-09-18 10:15",
    views: 6420,
    likes: 720,
    image: "/assets/case-covers/wing-it.webp",
    imageRatio: "16 / 9",
    model: "Runway Gen-2 + Claude 3.5 Sonnet + CosyVoice",
    params: "1080p H.264 / 24fps / 114s / 双音轨合成",
    prompt:
      "System: You are an award-winning animation director. Generate a 12-shot storyboard JSON for a comedic short 'Wing It': two eccentric Victorian engineers attempting man-powered flight from a bell tower. For each shot specify: camera motion (pan/dolly), focal length, prompt describing feather physics and brass mechanisms, pacing duration in seconds, and an audio soundstage prompt.",
    content: [
      "做 AI 视频最怕画面前后角色脸崩、道具形态不连贯。这篇是《Wing It》114 秒成片的完整工作流拆解。",
      "首先用 Claude 3.5 Sonnet 先敲定 12 个关键分镜的 JSON 状态机，固定核心角色提示词前缀与道具锚点（羽毛机翼、铜齿轮、厚底皮靴）。",
      "视频生成阶段采用 Runway Gen-2 的 Image-to-Video 控首尾帧，再把中文解说脚本输入 CosyVoice 进行自然语调合成，全片保持了统一的英式幽默节奏。",
      "在这个过程中，人不再是辛苦补帧的工人，而是坐在监视器前掌控叙事节奏和剪辑点的大导演。",
    ],
    comments: [
      {
        id: "c-wi-1",
        author: "知遥测不准",
        createdAt: "2026-09-18 11:20",
        content: "分镜状态机用 JSON 固化提示词前缀是保证角色跨镜头一致性的核心解法！学到了。",
      },
      {
        id: "c-wi-2",
        author: "何云帆",
        createdAt: "2026-09-18 14:02",
        content: "双音轨解说的声音合成自然度很高，齿音和呼吸感调教得很细腻。",
      },
    ],
  }),

  casePost({
    id: "case-stop-motion",
    tag: "AI 视频",
    title: "纸箱宇航员 · 定格动画手工触感还原",
    summary: "瓦楞纸箱折成的小宇航员在桌面上探索未知星球。真实定格动画质感，带有迷人的轻微手工抖动。",
    author: "沈观澜",
    createdAt: "2026-09-16 17:50",
    views: 3910,
    likes: 450,
    image: "/assets/case-covers/stop-motion.webp",
    imageRatio: "16 / 9",
    model: "Stable Video Diffusion + Luma Dream Machine",
    params: "12fps 逐帧微抖 / 宏观浅景深",
    prompt:
      "Macro tabletop stop-motion animation: a tiny 3-inch astronaut handcrafted from corrugated cardboard walking across an alien planetary surface made of desktop pencil shavings and sandpaper. Warm incandescent desk lamp lighting, visible glue edges, thumbprints on cardboard, cinematic 12fps tactile shutter jitter --ar 16:9",
    content: [
      "AI 生成视频容易有一种过于丝滑平滑的‘数码塑料感’。为了打破这种刻板印象，我们特意训练了‘定格动画缺陷美学’。",
      "通过提示词强制锁定 12fps 的快门节奏，并显式加入‘thumbprints on cardboard’（纸板上的指纹）和‘visible glue edges’（胶水印记）。",
      "生成出来的宇航员每一步都有定格摄影特有的物理顿挫与光影闪烁，仿佛真实手工匠人在暗房里一帧一帧摆拍而成的佳作。",
    ],
    comments: [
      {
        id: "c-sm-1",
        author: "徐望舒",
        createdAt: "2026-09-16 19:10",
        content: "故意保留‘手作缺陷’反而是 AI 时代最高级的真实感。绝佳的案例！",
      },
    ],
  }),

  // ── AI 代码 (Code & WebGL & Games) ──────────────────────────────────────
  casePost({
    id: "case-mario",
    tag: "AI 代码",
    title: "超级马里奥 · 原生 Canvas 实时可玩游戏",
    summary: "AI 直接写出了一款能玩的横版游戏，而不是画了一张截图。碰撞判定、重力加速度与实时镜头跟随。",
    author: "陈序优化中",
    createdAt: "2026-09-18 22:30",
    views: 7850,
    likes: 890,
    image: "/assets/case-covers/mario.webp",
    imageRatio: "16 / 9",
    model: "Claude 3.5 Sonnet + Vanilla Canvas API",
    params: "60fps delta-time / Web Audio API 8-bit Synth",
    prompt:
      "Generate a single-file, zero-dependency HTML5 Canvas platformer in modular vanilla ES6. Implement: 1. Physics engine with delta-time, variable jump height, horizontal deceleration; 2. Tilemap collision with breakable question-mark blocks; 3. Goomba enemy AI with edge patrol and squash animation; 4. Web Audio API synthesized retro sound effects (jump, coin, death); 5. Smooth camera tracking with deadzone.",
    content: [
      "很多人以为 AI 写游戏只能产出静态代码片段。这个案例证明：给足架构边界，模型能一次性输出一整套具备工业鲁棒性的完整 60fps 原生游戏引擎。",
      "最容易踩坑的是碰撞判定（穿墙/卡墙）和不同显示器刷新率下的物理速度漂移。因此在提示词中强制约定‘delta-time 步长’和‘AABB 轴对齐分轴检测’。",
      "音频部分用 Web Audio API 的振荡器（OscillatorNode）合成经典的 8-bit 方波音效，连额外音频素材都不需要引入，真正做到开箱即玩。",
    ],
    comments: [
      {
        id: "c-m-1",
        author: "李声远",
        createdAt: "2026-09-18 23:15",
        content: "Web Audio 合成方波这个思路太极客了，省去了所有外部资源依赖，加载飞快。",
      },
      {
        id: "c-m-2",
        author: "小满闯关中",
        createdAt: "2026-09-19 08:40",
        content: "首页立方体上的马里奥原来就是这段代码驱动的！跳跃手感出奇地扎实。",
      },
    ],
  }),

  casePost({
    id: "case-conbini",
    tag: "AI 代码",
    title: "日式便利店 · WebGL 3D 雨夜街角实时渲染",
    summary: "AI 搭出了一个可以走进去的雨夜街角。霓虹招牌、积水反光与店内暖光不是视频，而是实时 WebGL 计算。",
    author: "李声远",
    createdAt: "2026-09-17 19:10",
    views: 5240,
    likes: 612,
    image: "/assets/case-covers/conbini.webp",
    imageRatio: "16 / 9",
    model: "Three.js + GLSL Custom Shaders",
    params: "PBR Materials / GPU Particles / 30fps Capped",
    prompt:
      "Write an interactive Three.js 3D diorama of a rainy Tokyo convenience store corner at night. Features required: 1. PBR wet asphalt road with normal-mapped planar reflections; 2. Custom GLSL neon sign shader with bloom luminance threshold; 3. GPU instanced rain streak particle system with puddle ripples; 4. Smooth orbit camera with damping and bounds.",
    content: [
      "不是渲染好的视频，而是在你的浏览器里实时跑的 3D 几何与光照着色器。雨夜的水泊反光、霓虹招牌漫射全都受视角实时影响。",
      "为了在低端移动设备上也能跑满 30-60fps，让 AI 优化了着色器逻辑：用伪反射贴图替代昂贵的实时屏幕空间反射（SSR），雨丝采用 GPU 实例化粒子（InstancedMesh）。",
      "提示词设计要懂图形学管线：明确指定 PBR 材质贴图通道与法线扰动公式，AI 就能写出极其精炼高效的 WebGL 代码。",
    ],
    comments: [
      {
        id: "c-con-1",
        author: "屿见图表",
        createdAt: "2026-09-17 20:30",
        content: "雨夜便利店的孤寂感拉满了。特别是橱窗里的暖光透出来那一刻，很有氛围。",
      },
    ],
  }),

  casePost({
    id: "case-pirate",
    tag: "AI 代码",
    title: "暴风雨海盗船 · Gerstner 浪涌与浮力姿态",
    summary: "AI 让一艘船在风暴里真实摇晃。浪涌高度、船体姿态与天色变化互相关联，持续演算的动态物理过程。",
    author: "何云帆",
    createdAt: "2026-09-16 21:05",
    views: 4320,
    likes: 495,
    image: "/assets/case-covers/pirate.webp",
    imageRatio: "16 / 9",
    model: "Three.js + Gerstner Wave Vertex Shaders",
    params: "4-Octave Gerstner Waves / 浮力四点采样",
    prompt:
      "Implement an interactive WebGL simulation of a galleon in a violent midnight storm. Technical requirements: 1. Multi-octave Gerstner wave displacement in custom vertex shader; 2. Buoyancy physics: sample 4 hull coordinates on the wave equation, calculate buoyant pitch and roll torque to tilt the ship realistically; 3. Atmospheric volumetric fog with periodic lightning flash lights.",
    content: [
      "海浪不是简单的正弦波，而是尖峰平谷的 Gerstner 波形。难点在于让船体‘浮’在波浪上，且船头的俯仰角（pitch）和横滚角（roll）与浪面法线严格贴合。",
      "提示词指导 AI 在 CPU 侧同步复现 GPU 顶点着色器里的相同波形数学公式，采样船头船尾四个受力点的高程，算出四元数动态驱动船体姿态。",
      "整个项目没有任何第三方物理引擎包，几百行纯数学驱动，在浏览器里以极低的 CPU 占用平稳运行。",
    ],
    comments: [
      {
        id: "c-pir-1",
        author: "陈序优化中",
        createdAt: "2026-09-16 22:40",
        content: "CPU/GPU 双向同步波形高程公式很规范，完全没有漂移感。",
      },
    ],
  }),

  casePost({
    id: "case-penguin",
    tag: "AI 代码",
    title: "企鹅叠叠乐 · 结构化 3D 资产生成",
    summary: "一句话生成完整的 3D 网格、贴图与法线：顶着红茶、奶盅与小黄鸭的企鹅，无需手工补面或修形。",
    author: "周屿",
    createdAt: "2026-09-15 11:20",
    views: 3670,
    likes: 410,
    image: "/assets/case-covers/penguin.webp",
    imageRatio: "16 / 9",
    model: "Hyper3D Rodin / Meshy-4 + GLTF Transformer",
    params: "Quad Topology / PBR Diffuse+Roughness+Normal",
    prompt:
      "A stylized low-poly emperor penguin standing proudly, balancing a vintage porcelain teacup, a tiny stainless steel milk jug, and a cheerful yellow rubber duck on its head. Clean manifold quad-topology mesh, centered origin, baked diffuse, roughness, and normal maps, optimized for real-time web rendering.",
    content: [
      "过去在 3D 资产制作中，从白模、倒角、拓扑重构到烘焙法线贴图需要耗费数天工时。如今模型理解能力足以一次完成多物体的空间受力叠放。",
      "提示词特别强调了‘balanced manifold topology’（闭合流形网格）和‘centered origin’（原点居中），确保导入 Three.js 时坐标无需繁琐的手工纠偏。",
      "导出的 GLTF 文件体积仅数百 KB，材质通道完备，直接成为 AIQUOS 案例库中最受欢迎的可交互模型之一。",
    ],
    comments: [
      {
        id: "c-pen-1",
        author: "知遥测不准",
        createdAt: "2026-09-15 12:45",
        content: "企鹅头顶叠放茶杯和小黄鸭的物理合理度很高，贴图接缝完全看不出来。",
      },
    ],
  }),

  casePost({
    id: "case-security-audit",
    tag: "AI 代码",
    title: "红客挑战赛 · 网络安全自动化审计溯源",
    summary: "AI 审查多微服务鉴权架构，定位双重 URL 编码绕过与原型链污染漏洞链，并生成修复补丁。",
    author: "陈序优化中",
    createdAt: "2026-09-14 20:30",
    views: 4560,
    likes: 520,
    image: "/assets/case-covers/security-audit.webp",
    imageRatio: "16 / 9",
    model: "Claude 3.5 Sonnet Security Sandbox",
    params: "OWASP Top 10 / AST 污点追踪 / 补丁差异输出",
    prompt:
      "Act as an elite application security auditor. Analyze the following Node.js authentication gateway routing code. Trace untrusted request input through URL parsing and proxy forwarding. Identify the double-decode SSRF vulnerability and prototype pollution vector, generate a curl payload reproducing the bypass, and output a production-ready git diff remediation.",
    content: [
      "安全审计不是简单的关键词扫描，而是‘污点追踪’（Taint Analysis）：必须看懂用户输入是如何在多层服务转发中被解码、转义和篡改的。",
      "向 AI 提供架构拓扑与关键中间件代码，要求其以攻击者视角推演 bypass 链路，并以防守方视角编写防御性类型断言。",
      "这套提示词框架在攻防演练中帮团队在 15 分钟内排查出 2 处高危逻辑盲区，证明了 AI 在安全工程化落地的深度潜力。",
    ],
    comments: [
      {
        id: "c-sec-1",
        author: "顾清和",
        createdAt: "2026-09-14 21:50",
        content: "双重解码导致路径遍历是很经典的陷阱，AI 能给出规范的 git diff 补丁非常实用。",
      },
    ],
  }),

  // ── AI 办公 (Office & PPT & Productivity) ─────────────────────────────
  casePost({
    id: "case-moon-route",
    tag: "AI 办公",
    title: "人类登上月球 · 史料信息图 PPT 提炼",
    summary: "把上万字阿波罗 11 号飞行任务日志提炼为一张 16:9 信息图幻灯片，地月轨道航线与节点一目了然。",
    author: "林知遥",
    createdAt: "2026-09-17 09:40",
    views: 5120,
    likes: 630,
    image: "/assets/case-covers/moon-route.webp",
    imageRatio: "16 / 9",
    model: "DeepSeek R1 + Vector Infographic Pipeline",
    params: "16:9 宽幅 / 史料时序解析 / SVG 轨道描边",
    prompt:
      "Ingest the complete Apollo 11 mission transcript and flight timeline. Synthesize into an executive 16:9 presentation infographic: 1. Plot the lunar trajectory curve from launch, translunar injection, lunar orbit insertion, descent, to splashdown; 2. Call out 10 crucial decision timestamps; 3. Minimal dark space design, crisp typographic hierarchy.",
    content: [
      "做演示汇报最头疼的是海量专业技术史料的降噪与视觉转化。上百页枯燥的任务报告，人脑梳理容易迷失在术语里。",
      "利用推理模型提炼出关键飞行拓扑节点（地月转移轨道、登月舱分离、月面着陆、再入大气层），并指定 16:9 极简太空暗色美学。",
      "最终生成的信息图既具备严谨的工程坐标时序，又具备高层汇报所需的高级审美感，直接拿去汇报完全不需要二次调整。",
    ],
    comments: [
      {
        id: "c-mr-1",
        author: "屿见图表",
        createdAt: "2026-09-17 10:55",
        content: "信息降噪做得极其漂亮！地月轨道抛物线的弧度与注释对齐非常干净。",
      },
    ],
  }),

  casePost({
    id: "case-onboarding-schedule",
    tag: "AI 办公",
    title: "迎新志愿排班表 · 需求变多约束排班算法",
    summary: "48 名志愿者、7 天活动期，输入复杂的人员时间与组长配比约束，AI 自动输出均衡美观的排班表格。",
    author: "苏一宁",
    createdAt: "2026-09-16 14:15",
    views: 3340,
    likes: 380,
    image: "/assets/case-covers/onboarding-schedule.webp",
    imageRatio: "16 / 9",
    model: "Python OR-Tools Constraint Solver + AI 表格",
    params: "48 人 x 7 天 / 约束求解 / 零冲突排班",
    prompt:
      "Solve a volunteer scheduling problem with Python OR-Tools: 48 students, 7 consecutive days, 2 shifts per day. Hard constraints: max 20 hours/student, min 2 experienced leads per shift, honor student conflict requests. Soft constraints: balance weekend shifts evenly. Format output as a color-coded clean tabular calendar.",
    content: [
      "人工排班是最耗精力又容易得罪人的事：请假偏好冲突、男女搭配、老带新、每个人总工时还要绝对公平。",
      "把口语化的诉求转化成约束满足问题（CSP），让 AI 编写并执行求解器，在数秒内找到了最优可行解。",
      "输出的结果不仅零冲突，还自带清晰的色块标识与工时统计，彻底把运营同学从 Excel 连线加班里解救出来。",
    ],
    comments: [
      {
        id: "c-os-1",
        author: "小满闯关中",
        createdAt: "2026-09-16 15:30",
        content: "每年迎新我们社团都要因为排班吵架，这套算法提示词真是及时雨！",
      },
    ],
  }),

  casePost({
    id: "case-browser-ops",
    tag: "AI 办公",
    title: "电脑控制 · 浏览器无人值守多步 Agent",
    summary: "让 AI 自主操作浏览器完成供应商采购系统核验：跨 14 张动态发票提取明细，核对偏差，自动归档。",
    author: "李声远",
    createdAt: "2026-09-15 18:20",
    views: 4980,
    likes: 580,
    image: "/assets/case-covers/browser-ops.webp",
    imageRatio: "16 / 9",
    model: "Browser-Use Agent + Playwright Python",
    params: "DOM Snapshot 驱动 / 异常自愈 / 完整审计日志",
    prompt:
      "Autonomous browser-use agent: 1. Log in to supplier invoice dashboard; 2. Enumerate 14 pending invoice line items; 3. Extract tax IDs, amounts, and item categories; 4. Cross-reference against enterprise budget sheet; 5. Flag discrepancies > 3% and take screenshots; 6. Compile verified audit report PDF.",
    content: [
      "传统 RPA 最脆弱的地方在于网页 DOM 稍一改动脚本就崩。而基于视觉与大模型的自主 Agent 具备极强的容错与语义理解能力。",
      "给 Agent 下达清晰的验收条件与异常处理准则，它能像一个熟练的会计助理一样自己点击翻页、处理弹出层、记录核查明细。",
      "这展示了 AI 正在从‘文字生成器’走向‘真实生产力执行者’的关键蜕变。",
    ],
    comments: [
      {
        id: "c-bo-1",
        author: "陈序优化中",
        createdAt: "2026-09-15 19:40",
        content: "语义级定位比传统 Xpath 稳定太多了，未来企业的日常后台运维基本都是这个形态。",
      },
    ],
  }),
];
