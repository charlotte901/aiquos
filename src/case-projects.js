// Archive case manifest, extracted from CaseArchive.jsx so stores can seed from
// the same source of truth instead of duplicating project data.

export const CASE_PROJECTS = [
  {
    // 1.webp — a black cat in heavy black-framed glasses, drawn in a loose
    // brush-and-ink style. It opens the archive because the poster's first case
    // carries `HOME_GROUND` (see below), so entering the tab moves the ink
    // rather than cutting to a different colour.
    image: 1,
    title: "戴眼镜的黑猫",
    tags: "AI 生图",
    year: 2026,
    description:
      "对 AI 说一句想要的角色，得到一张有脾气的猫。蓬乱的毛、镜片的反光和那副不太高兴的表情都由模型一次画完，人只从几版里挑出最像自己那只的——不需要会画画，也能把宠物变成可以挂起来的角色插画。",
  },
  {
    // 6.webp — a watercolour parrot on a branch, green wash and ink linework.
    image: 6,
    title: "笼外的鹦鹉",
    tags: "AI 生图",
    year: 2025,
    // Sampled from the leaf-green wash behind the bird.
    world: { top: "PERCH", bottom: "OUTSIDE", background: "#5f8f52", ink: "#f4ffe8", accent: "#ffd98a" },
    description:
      "让 AI 画一只正在看你的鸟。羽毛的黄绿过渡、爪子和树枝的笔触、眼睛那圈亮环都是一次成型的，水彩的留白也没有补过——同一句话可以再生成一只完全不同的，挑到喜欢的那张为止。",
  },
  {
    // 3.webp — a torn-paper collage poster: snow mountains, a yurt and yaks over
    // a hand-annotated sheet, on a deep blue ground.
    image: 3,
    title: "高原拼贴海报",
    tags: "AI 海报",
    year: 2025,
    // Ground sampled from the artwork's own deep blue, so the poster and the
    // stamp share one colour instead of the stamp sitting on an unrelated field.
    world: { top: "CUT", bottom: "PASTE", background: "#07599b", ink: "#ffeccc", accent: "#ffd166" },
    description:
      "让 AI 按一句话生成一张海报。雪山、毡房与牦牛的插画，撕纸便签的排布，连同手写标注和印章的位置，都由模型一次铺好，人只决定留下哪些——得到的成品像手工拼贴了一下午，实际只是把想要的感觉说清楚了。",
  },
  {
    // 7.webp — the poster for a fictional climate short: a chair frozen inside a
    // block of ice, on coral-orange paper.
    image: 7,
    title: "The Last Ice",
    tags: "AI 海报",
    year: 2026,
    // The poster's own coral orange, which is what the case is.
    world: { top: "KEEP", bottom: "UNTIL SUNSET", background: "#e8623c", ink: "#2b1a12", accent: "#ffd98a" },
    description:
      "让 AI 生成一部虚构短片的视觉方向，再由人定稿。一块巨大的冰被当作棚拍产品来打光，冰里封着一把鲜红的塑料椅，荒谬却拍得像真的。珊瑚橘的纸面上只留大片空白，所有信息都用贴纸完成——深蓝的片名、写着 42°C 的圆标、银灰的 KEEP UNTIL SUNSET、红底编号 03，全部歪斜、卷边、裁切不齐。手写的一句 “it was still cold when we left.” 让整张海报停在一种安静的荒谬上。",
  },
  {
    // 5.webp — a flat storybook illustration of a girl and a white cat side by
    // side on a warm yellow ground.
    image: 5,
    title: "女孩与白猫",
    tags: "AI 生图",
    year: 2026,
    // The artwork's warm yellow ground, with dark brown ink on it.
    world: { top: "DRAW", bottom: "CLOSER", background: "#f7d88e", ink: "#3f352f", accent: "#c98b5e" },
    description:
      "让 AI 把一段关系画成一张图。猫毛的蓬松感、眼里那点蓝和脸上的雀斑都由模型定下，两个神情要对上视线，是反复改了几轮的结果——想给谁画一张专属的图，不必再去找一张勉强合适的现成画。",
  },
  {
    // 2.webp — a watercolour portrait of a girl whose head fills a fishbowl,
    // aqua and blush tones. The avatar case.
    image: 2,
    title: "鱼缸里的女孩",
    tags: "AI 头像",
    year: 2026,
    // Aqua from the water, with a deeper teal for the ink so the display type
    // stays legible on it.
    world: { top: "BLOOM", bottom: "BENEATH", background: "#8cd1da", ink: "#14484f", accent: "#f4a9a9" },
    description:
      "把自己想要的样子说给 AI 听，得到一张能直接当头像的画。水彩的晕染、鱼群的位置和视线朝向都试过几轮，人在其中只做挑选——头像不一定是照片，也可以是一张 AI 画出来的、更接近自己的脸。",
  },
  {
    // 4.webp — an anime-style still of a bus under sunlit green leaves.
    image: 4,
    title: "夏日公交",
    tags: "AI 生图",
    year: 2025,
    // The foliage green, with pale ink for the sunlit feel of the still.
    world: { top: "SUMMER", bottom: "RIDE", background: "#37845c", ink: "#eaffef", accent: "#ffe98a" },
    description:
      "想要的只是一个夏天，AI 给了一整张画面。树叶的透光、车窗上的反光和站牌上的小字都由一句话铺开，接着改的全是光的温度而不是像素——用文字反复调一张图的空气感，直到它像记忆里的那个下午。",
  },
];
