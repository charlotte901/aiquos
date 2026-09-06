import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  BookmarkSimple,
  CaretLeft,
  CaretRight,
  ChatCircleDots,
  Eye,
  Heart,
  PaperPlaneRight,
} from "@phosphor-icons/react";
import { ForumEffect } from "./ForumEffect";
import { favoriteFromForum, toggleFavorite, useFavoriteSaved } from "./favorites-store";

const POSTS = [
  {
    id: "ai-workflow-notes",
    tag: "学习笔记",
    title: "我把 AI 变成工作流里的第二双眼睛",
    summary:
      "从收集素材、整理问题到复核结论，这份笔记记录了一次完整的 AI 协作流程，也标注了三个最容易失真的环节。",
    author: "林知遥",
    createdAt: "2026-09-04 20:12",
    views: 2864,
    likes: 318,
    comments: [
      {
        id: "ai-workflow-comment-1",
        author: "周屿",
        createdAt: "2026-09-04 21:02",
        content: "“让模型只提出反驳”这个方法很实用，比让它直接改稿更容易发现问题。",
      },
      {
        id: "ai-workflow-comment-2",
        author: "黄小满",
        createdAt: "2026-09-04 22:37",
        content: "人工复核那一段很有共鸣，数字和来源真的不能全交给工具。",
      },
    ],
    image: "/assets/cases/2.webp",
    images: ["/assets/cases/2.webp", "/assets/cases/5.webp", "/assets/cases/8.webp"],
    imageRatio: "4 / 5",
    color: "#f568a3",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#ffd7ec",
    art: "arcs",
    content: [
      "第一次把 AI 放进完整工作流时，我以为它更像一个高级搜索框。真正有效的方法是先给它任务边界：素材来源、受众、篇幅和必须保留的判断权。",
      "第二遍使用时，我让模型只负责提出反驳，不负责改写结论。这个限制反而让输出变得锋利，很多模糊表达被直接指了出来。",
      "最后一定要留一道人工复核。尤其是数字、时间线和引用来源，AI 可以帮你发现盲区，但不能替你承担判断。",
    ],
  },
  {
    id: "prompt-review",
    tag: "实战案例",
    title: "一周 Prompt 复盘：越具体的约束越自由",
    summary:
      "同一份策划案被改写了十一版。真正让结果稳定的不是更长指令，而是把限制、样例和验收标准说清楚。",
    author: "陈序",
    createdAt: "2026-09-04 15:36",
    views: 1978,
    likes: 246,
    comments: [
      {
        id: "prompt-review-comment-1",
        author: "林知遥",
        createdAt: "2026-09-04 16:18",
        content: "把不能改动的事实提前写出来，确实能减少很多无效版本。",
      },
      {
        id: "prompt-review-comment-2",
        author: "徐望舒",
        createdAt: "2026-09-04 18:44",
        content: "第十一版一定很痛，但这套约束方法值得抄走。",
      },
    ],
    image: "/assets/cases/7.webp",
    images: ["/assets/cases/7.webp", "/assets/cases/13.webp"],
    imageRatio: "1 / 1",
    color: "#247cf1",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#c8e0ff",
    art: "waves",
    content: [
      "最初我只是写“帮我把方案改得更有说服力”，结果得到的是漂亮但不针对客户的套话。",
      "后来我把客户关注点、预算边界、过往反馈和三条不能改动的事实写进去，输出立刻从泛泛建议变成了可执行方案。",
      "把成功标准写清楚，是最省时间的一步。它让 AI 知道什么时候可以停，也让你更容易评估结果。",
    ],
  },
  {
    id: "community-thread",
    tag: "社区共建",
    title: "论坛卡片墙改版：我们要更直接的讨论",
    summary:
      "新的瀑布流会突出帖子梗概和讨论热度。你可以在每张卡上快速判断内容是否值得展开。",
    author: "AIQUOS 编辑部",
    createdAt: "2026-09-05 09:20",
    views: 4521,
    likes: 502,
    comments: [
      {
        id: "community-thread-comment-1",
        author: "苏一宁",
        createdAt: "2026-09-05 10:05",
        content: "梗概放在卡片第一屏太重要了，扫一眼就知道要不要展开。",
      },
      {
        id: "community-thread-comment-2",
        author: "陈序",
        createdAt: "2026-09-05 11:29",
        content: "希望后面的分类筛选可以把“讨论中”和“已沉淀”分开。",
      },
    ],
    image: "/assets/cases/12.webp",
    imageRatio: "16 / 10",
    color: "#ffb703",
    ink: "#17150f",
    line: "#17150f",
    accent: "#fff0c2",
    art: "grid",
    content: [
      "这次改版保留了顶部的字母动画，把下方内容换成更轻的卡片流，方便成员快速扫到感兴趣的话题。",
      "卡片上会固定显示内容梗概、作者、发布时间、浏览量和点赞量，帖子展开后才能看到完整正文。",
      "接下来我们会继续调整分类筛选和热门排序，让持续更新的讨论更容易被看到。",
    ],
  },
  {
    id: "career-signal",
    tag: "讨论场",
    title: "AI 时代的作品集，应该展示过程还是结果？",
    summary:
      "三位不同岗位的成员给出相反答案。有人展示终稿，有人把失败版本也放进去，评论区已经吵出不少火花。",
    author: "苏一宁",
    createdAt: "2026-09-03 22:04",
    views: 3409,
    likes: 389,
    comments: [
      {
        id: "career-signal-comment-1",
        author: "何云帆",
        createdAt: "2026-09-04 08:41",
        content: "过程和结果都要，但过程必须指向结论，不能变成流水账。",
      },
      {
        id: "career-signal-comment-2",
        author: "顾清和",
        createdAt: "2026-09-04 13:20",
        content: "我会放一页失败版本，标注后来改了什么。",
      },
    ],
    image: "/assets/cases/17.webp",
    imageRatio: "3 / 4",
    color: "#7438e5",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#e0ccff",
    art: "rings",
    content: [
      "产品经理更关心结果是否能落地，设计师更在意决策路径，研究员则会追问数据来源和验证方法。",
      "如果只能保留一种，我会保留过程。因为结果说明你做过什么，过程说明你如何思考。",
      "最好的折中是先给结论，再用一页展示关键迭代。这样不同读者都能快速找到自己需要的信息。",
    ],
  },
  {
    id: "data-visual",
    tag: "作品分享",
    title: "让数据先开口：一组城市通勤可视化笔记",
    summary:
      "不用复杂图表也能讲清流动感。这组练习把等待、换乘和拥挤程度压缩成一张可扫描的时间图。",
    author: "周屿",
    createdAt: "2026-09-03 18:41",
    views: 1642,
    likes: 227,
    comments: [
      {
        id: "data-visual-comment-1",
        author: "AIQUOS 编辑部",
        createdAt: "2026-09-03 20:12",
        content: "把拥挤程度压进时间轴的做法很聪明，信息密度高但不乱。",
      },
      {
        id: "data-visual-comment-2",
        author: "李声远",
        createdAt: "2026-09-03 21:57",
        content: "“非数据背景朋友能否复述”这个验收标准很好。",
      },
    ],
    image: "/assets/cases/21.webp",
    imageRatio: "5 / 4",
    color: "#00a96d",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#bdf2d8",
    art: "dots",
    content: [
      "我先把原始通勤记录拆成等待、移动、换乘三段，再去掉所有与体感无关的字段。",
      "颜色只保留冷热两级，形状只保留线和点。读者的注意力应该落在拥堵变化，而不是图例上。",
      "完成以后我让三位没有数据背景的朋友先看图，他们是否能复述结论，比图表精度更重要。",
    ],
  },
  {
    id: "model-reading",
    tag: "前沿观察",
    title: "读完一份模型评测后，我更关心失败样例",
    summary:
      "平均分只说明大致水平。真正决定能不能用进工作的，是边界条件、异常输入和复核成本。",
    author: "何云帆",
    createdAt: "2026-09-02 21:18",
    views: 2275,
    likes: 264,
    comments: [
      {
        id: "model-reading-comment-1",
        author: "周屿",
        createdAt: "2026-09-02 22:36",
        content: "失败样例往往比平均分更能说明真实工作量。",
      },
      {
        id: "model-reading-comment-2",
        author: "苏一宁",
        createdAt: "2026-09-03 00:10",
        content: "“可修正性”这个词抓得很准，我会加进评审清单。",
      },
    ],
    image: "/assets/cases/26.webp",
    imageRatio: "4 / 5",
    color: "#fb5727",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#ffd2c0",
    art: "arcs",
    content: [
      "排行榜适合建立第一印象，但它常常把不同任务压成同一个分数。",
      "我会优先看失败样例：模型在哪些提示下失去结构？哪些语言混合会降低稳定性？错误能否被快速发现？",
      "如果一个模型虽然分数稍低，但失败方式更容易被人修正，它在真实工作里可能仍然更可靠。",
    ],
  },
  {
    id: "member-roundtable",
    tag: "成员活动",
    title: "本周圆桌：把 AI 讲给完全不懂的人听",
    summary:
      "每位成员只有三分钟，不能使用模型、参数和语料。你只能用日常场景解释它的边界。",
    author: "徐望舒",
    createdAt: "2026-09-02 12:30",
    views: 1394,
    likes: 178,
    comments: [
      {
        id: "member-roundtable-comment-1",
        author: "黄小满",
        createdAt: "2026-09-02 14:08",
        content: "用图书馆解释检索，用厨房解释生成，这个类比可以带走。",
      },
      {
        id: "member-roundtable-comment-2",
        author: "何云帆",
        createdAt: "2026-09-02 16:52",
        content: "三分钟限制反而逼着人先讲清楚边界。",
      },
    ],
    image: "/assets/cases/31.webp",
    imageRatio: "1 / 1",
    color: "#fff4fa",
    ink: "#17150f",
    line: "#17150f",
    accent: "#ffd7ec",
    art: "grid",
    content: [
      "最好的类比来自厨房、公共交通和图书馆。它们能解释检索、组织和生成，但也各有不成立的地方。",
      "当听众开始追问“那它会不会错”，说明解释已经成功了一半。",
      "这次活动结束后，我们会把所有类比整理成一张公共表，标注适用场景和误导风险。",
    ],
  },
  {
    id: "automation-recipe",
    tag: "效率工具",
    title: "三个自动化小配方，减少重复整理时间",
    summary:
      "不追求全自动，只把复制、命名、归档这些低判断动作交出去，把精力留给真正的决定。",
    author: "李声远",
    createdAt: "2026-09-01 19:02",
    views: 3017,
    likes: 331,
    comments: [
      {
        id: "automation-recipe-comment-1",
        author: "林知遥",
        createdAt: "2026-09-01 20:33",
        content: "“低判断动作交出去，高判断留下”这句值得贴在桌边。",
      },
      {
        id: "automation-recipe-comment-2",
        author: "陈序",
        createdAt: "2026-09-01 23:11",
        content: "素材命名那招真的省时间，尤其是跨项目找版本的时候。",
      },
    ],
    image: "/assets/cases/36.webp",
    imageRatio: "16 / 11",
    color: "#17150f",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#c9c7cf",
    art: "waves",
    content: [
      "第一个配方是会议记录归档：自动抽取日期、参会人和待办，但负责人必须人工确认。",
      "第二个是素材重命名，把项目编号、版本和日期固定在同一顺序里，检索速度提升非常明显。",
      "第三个是每日摘要。它不替我阅读，只把变化点列出来，让我决定哪一条需要深入。",
    ],
  },
  {
    id: "assessment-method",
    tag: "测评研究",
    title: "测评不是考试：怎样设计更真实的 AI 任务？",
    summary:
      "选择题能检查记忆，真实任务才能看到提问、修正和取舍。这里整理了四个可复用的任务原型。",
    author: "AIQUOS 研究组",
    createdAt: "2026-08-31 16:45",
    views: 2508,
    likes: 292,
    comments: [
      {
        id: "assessment-method-comment-1",
        author: "顾清和",
        createdAt: "2026-08-31 18:02",
        content: "识别错误结论比复述答案更能检验真实能力。",
      },
      {
        id: "assessment-method-comment-2",
        author: "徐望舒",
        createdAt: "2026-08-31 20:40",
        content: "“下一轮修正”很关键，能看出使用者是否真的在思考。",
      },
    ],
    image: "/assets/cases/4.webp",
    imageRatio: "3 / 4",
    color: "#247cf1",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#c8e0ff",
    art: "dots",
    content: [
      "好的任务应该有真实限制：时间不足、信息杂乱、目标之间存在冲突。",
      "我们常用四种原型：整理散乱资料、把想法推进成方案、识别错误结论、向特定受众解释复杂概念。",
      "评分重点不是答案唯一，而是是否能说明依据、识别风险并做出下一轮修正。",
    ],
  },
  {
    id: "ethics-thread",
    tag: "讨论场",
    title: "当 AI 替你完成第一稿，署名意味着什么？",
    summary:
      "这次讨论不设标准答案，只要求参与者说明哪些判断属于自己，哪些动作交给了工具。",
    author: "顾清和",
    createdAt: "2026-08-31 10:08",
    views: 3052,
    likes: 366,
    comments: [
      {
        id: "ethics-thread-comment-1",
        author: "周屿",
        createdAt: "2026-08-31 12:15",
        content: "署名必须连责任一起署，否则就只是装饰。",
      },
      {
        id: "ethics-thread-comment-2",
        author: "黄小满",
        createdAt: "2026-08-31 15:47",
        content: "“输入来源、关键修改、最终决策者”这三行很可执行。",
      },
    ],
    image: "/assets/cases/9.webp",
    imageRatio: "4 / 5",
    color: "#f568a3",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#ffd7ec",
    art: "rings",
    content: [
      "署名不只是劳动证明，也是责任边界。读者需要知道谁为事实、判断和后果负责。",
      "一个简单做法是保留三行记录：输入来源、关键修改和最终决策者。",
      "如果你无法向读者解释这些内容，可能说明署名方式需要重新考虑。",
    ],
  },
  {
    id: "campus-notes",
    tag: "校园故事",
    title: "社团第一次 AI 工作坊，我们踩过的四个坑",
    summary:
      "报名很热，真正完成练习的人却不多。复盘后发现，问题不在工具难度，而在任务设计。",
    author: "黄小满",
    createdAt: "2026-08-30 17:24",
    views: 1187,
    likes: 156,
    comments: [
      {
        id: "campus-notes-comment-1",
        author: "苏一宁",
        createdAt: "2026-08-30 19:06",
        content: "“十分钟小任务”开场确实比原理讲解更容易留住人。",
      },
      {
        id: "campus-notes-comment-2",
        author: "李声远",
        createdAt: "2026-08-30 20:54",
        content: "留修改时间的坑太真实了，现场演示总是被压缩掉。",
      },
    ],
    image: "/assets/cases/14.webp",
    imageRatio: "5 / 4",
    color: "#ffb703",
    ink: "#17150f",
    line: "#17150f",
    accent: "#fff0c2",
    art: "grid",
    content: [
      "第一个坑是开场讲了太多原理。后来我们改成先展示一个十分钟可完成的小任务。",
      "第二个坑是任务没有受众，参与者不知道为谁写、为什么写。",
      "剩下两个坑分别是缺少现场展示和没有留出修改时间。下一次我们会把节奏倒过来。",
    ],
  },
  {
    id: "weekly-pick",
    tag: "每周精选",
    title: "精选五条：关于提问、复核与长期积累",
    summary:
      "本期从社区讨论里挑出五段高热回复，共同点都很朴素：先定义问题，再让工具进入流程。",
    author: "AIQUOS 编辑部",
    createdAt: "2026-08-29 20:00",
    views: 3876,
    likes: 428,
    comments: [
      {
        id: "weekly-pick-comment-1",
        author: "何云帆",
        createdAt: "2026-08-29 21:18",
        content: "“先定义问题，再让工具进入流程”应该成为每周精选的标准。",
      },
      {
        id: "weekly-pick-comment-2",
        author: "顾清和",
        createdAt: "2026-08-29 23:02",
        content: "把有效提示和失败原因放在一起，这个积累方式比收藏夹有用。",
      },
    ],
    image: "/assets/cases/19.webp",
    imageRatio: "16 / 10",
    color: "#00a96d",
    ink: "#ffffff",
    line: "#ffffff",
    accent: "#bdf2d8",
    art: "waves",
    content: [
      "这些回复没有被骤增的热度推动，而是在后续讨论里被反复引用。",
      "共同点是把 AI 放在具体环节里：查找反例、压缩草稿、检查表达，而不是期待它一次性交付完整答案。",
      "长期积累比单次技巧更重要。把有效的提示和失败原因留在同一个地方，你的方法会越来越稳。",
    ],
  },
];

function ForumTitle({ text }) {
  const titleRef = useRef(null);
  const textRef = useRef(null);
  const [lines, setLines] = useState([]);

  const measure = useCallback(() => {
    const text = textRef.current;
    const title = titleRef.current;
    if (!text || !title) return;

    const range = document.createRange();
    range.selectNodeContents(text);
    const boxes = Array.from(range.getClientRects()).filter((box) => box.width > 0);
    const titleBox = title.getBoundingClientRect();

    setLines(
      boxes.map((box, index) => ({
        id: `${index}-${Math.round(box.width)}`,
        top: box.bottom - titleBox.top - 1.5,
        left: box.left - titleBox.left,
        width: box.width,
        delay: index * 80,
      })),
    );
  }, [text]);

  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    let timer;
    const delayedMeasure = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 120);
    };

    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", delayedMeasure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", delayedMeasure);
    };
  }, [measure]);

  return (
    <h3 className="forum-card-title" ref={titleRef}>
      <span ref={textRef}>{text}</span>
      <span className="forum-title-lines" aria-hidden="true">
        {lines.map((line) => (
          <i
            key={line.id}
            style={{
              top: `${line.top}px`,
              left: `${line.left}px`,
              width: `${line.width}px`,
              transitionDelay: `${line.delay}ms`,
            }}
          />
        ))}
      </span>
    </h3>
  );
}

function createComment(content) {
  const now = new Date();

  return {
    id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    author: "你",
    createdAt: new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
    content,
  };
}

function ForumActionBar({ post, activity, onToggleLike, onAddComment }) {
  const [draft, setDraft] = useState("");
  const liked = activity.liked;
  const comments = activity.comments;
  const likeCount = post.likes + (liked ? 1 : 0);

  const submitComment = (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    onAddComment(post.id, content);
    setDraft("");
  };

  return (
    <div className="forum-post-actions">
      <form className="forum-comment-composer" onSubmit={submitComment}>
        <input
          type="text"
          value={draft}
          maxLength={200}
          placeholder="说点什么..."
          aria-label={`评论：${post.title}`}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim()}>
          <PaperPlaneRight size={17} />
          发布
        </button>
      </form>

      <footer className="forum-post-footer">
        <div className="forum-post-author">
          <span className="forum-post-avatar" style={{ background: post.color, color: post.ink }}>
            {post.author.slice(0, 1)}
          </span>
          <div>
            <strong>{post.author}</strong>
            <time>{post.createdAt}</time>
          </div>
        </div>
        <div className="forum-post-stats">
          <span aria-label={`浏览量 ${post.views.toLocaleString("zh-CN")}`}>
            <Eye size={17} />
            {post.views.toLocaleString("zh-CN")}
          </span>
          <button
            type="button"
            className={`forum-like-button${liked ? " is-liked" : ""}`}
            aria-pressed={liked}
            aria-label={liked ? "取消点赞" : "点赞"}
            onClick={() => onToggleLike(post.id)}
          >
            <Heart size={17} weight={liked ? "fill" : "regular"} />
            {likeCount.toLocaleString("zh-CN")}
          </button>
          <span aria-label={`评论量 ${comments.length.toLocaleString("zh-CN")}`}>
            <ChatCircleDots size={17} />
            {comments.length.toLocaleString("zh-CN")}
          </span>
        </div>
      </footer>
  </div>
  );
}

function ForumPostGallery({ post }) {
  const images = post.images?.length ? post.images : [post.image].filter(Boolean);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    setActiveImage(0);
  }, [post.id]);

  if (!images.length) return null;

  return (
    <figure className="forum-post-media">
      {images.map((image, index) => (
        <img
          key={`${post.id}-${image}`}
          className={`forum-gallery-image${index === activeImage ? " is-active" : ""}`}
          src={image}
          alt={index === activeImage ? post.title : ""}
          draggable="false"
          decoding="async"
        />
      ))}

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="forum-gallery-nav is-prev"
            aria-label="上一张图片"
            onClick={() => setActiveImage((current) => (current - 1 + images.length) % images.length)}
          >
            <CaretLeft weight="bold" />
          </button>
          <button
            type="button"
            className="forum-gallery-nav is-next"
            aria-label="下一张图片"
            onClick={() => setActiveImage((current) => (current + 1) % images.length)}
          >
            <CaretRight weight="bold" />
          </button>
        </>
      )}

      <div className="forum-gallery-dots" aria-label="图片页码">
        {images.map((image, index) => (
          <button
            key={`${post.id}-${image}-dot`}
            type="button"
            className={index === activeImage ? "is-active" : ""}
            aria-label={`第 ${index + 1} 张图片`}
            aria-current={index === activeImage}
            disabled={images.length < 2}
            onClick={() => setActiveImage(index)}
          />
        ))}
      </div>
    </figure>
  );
}

export function ForumDetail({
  post,
  activity,
  onBack,
  onToggleLike,
  onAddComment,
  returnLabel = "返回论坛",
}) {
  const bodyRef = useRef(null);
  const comments = activity.comments;
  const saved = useFavoriteSaved(post.id);

  useEffect(() => {
    document
      .querySelector('.app[data-tab="forum"] .home-tab-screen')
      ?.scrollTo({ top: 0, behavior: "instant" });
  }, [post.id]);

  const handleCommentAdded = () => {
    requestAnimationFrame(() => {
      const body = bodyRef.current;
      body?.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
    });
  };

  return (
    <article className="forum-detail-screen" aria-labelledby="forum-detail-title">
      <button className="forum-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        {returnLabel}
      </button>

      <ForumPostGallery post={post} />

      <section className="forum-post-panel" aria-label="帖子内容">
        <header className="forum-post-head">
          <div className="forum-post-toolbar">
            <span className="forum-post-tag" style={{ background: post.color, color: post.ink }}>
              {post.tag}
            </span>
            <button
              type="button"
              className={`favorite-button${saved ? " is-saved" : ""}`}
              aria-pressed={saved}
              onClick={() => toggleFavorite(favoriteFromForum(post, comments))}
            >
              <BookmarkSimple size={16} weight={saved ? "fill" : "regular"} />
              {saved ? "已收藏" : "收藏"}
            </button>
          </div>
          <h1 id="forum-detail-title">{post.title}</h1>
          <p>{post.summary}</p>
        </header>

        <div className="forum-post-body" ref={bodyRef}>
          {post.content.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          <div className="forum-post-comments">
            <div className="forum-comments-title">
              <strong>评论</strong>
              <span>{comments.length.toLocaleString("zh-CN")}</span>
            </div>
            {comments.length === 0 ? (
              <p className="forum-comments-empty">还没有评论，来发第一条。</p>
            ) : (
              <ul>
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <strong>{comment.author}</strong>
                    <time>{comment.createdAt}</time>
                    <p>{comment.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ForumActionBar
          post={post}
          activity={activity}
          onToggleLike={onToggleLike}
          onAddComment={(id, content) => {
            onAddComment(id, content);
            handleCommentAdded();
          }}
        />
      </section>
    </article>
  );
}

export function ForumBoard({ onDetailChange }) {
  const [activeId, setActiveId] = useState(null);
  const [activity, setActivity] = useState(() =>
    Object.fromEntries(
      POSTS.map((post) => [post.id, { liked: false, comments: post.comments ?? [] }]),
    ),
  );
  const activePost = POSTS.find((post) => post.id === activeId);

  const toggleLike = useCallback((id) => {
    setActivity((current) => {
      const item = current[id] ?? { liked: false, comments: [] };
      return { ...current, [id]: { ...item, liked: !item.liked } };
    });
  }, []);

  const addComment = useCallback((id, content) => {
    setActivity((current) => {
      const item = current[id] ?? { liked: false, comments: [] };
      return {
        ...current,
        [id]: { ...item, comments: [...item.comments, createComment(content)] },
      };
    });
  }, []);

  useEffect(() => {
    onDetailChange?.(Boolean(activePost));
  }, [activePost, onDetailChange]);

  if (activePost) {
    const activeActivity = activity[activePost.id] ?? { liked: false, comments: [] };

    return (
      <ForumDetail
        key={activePost.id}
        post={activePost}
        activity={activeActivity}
        onBack={() => setActiveId(null)}
        onToggleLike={toggleLike}
        onAddComment={addComment}
      />
    );
  }

  return (
    <>
      <ForumEffect />
      <section className="forum-board" aria-label="社区帖子">
        <div className="forum-masonry">
          {POSTS.map((post) => {
            const postActivity = activity[post.id] ?? { liked: false, comments: post.comments ?? [] };

            return (
              <article
                key={post.id}
                className="forum-card"
                style={{
                  "--card-color": post.color,
                  "--card-ink": post.ink,
                  "--card-line": post.line,
                  "--card-accent": post.accent,
                }}
                tabIndex={0}
                role="button"
                aria-label={`展开帖子：${post.title}`}
                onClick={() => setActiveId(post.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveId(post.id);
                  }
                }}
              >
                <span className="forum-card-media" aria-hidden="true">
                  <img src={post.image} alt="" loading="lazy" decoding="async" draggable="false" />
                </span>
                <div className="forum-card-body">
                  <span className="forum-tag">{post.tag}</span>
                  <ForumTitle text={post.title} />
                  <p className="forum-card-summary">{post.summary}</p>
                </div>
                <footer className="forum-card-meta">
                  <strong>{post.author}</strong>
                  <time>{post.createdAt}</time>
                  <span>
                    浏览量
                    <b>{post.views.toLocaleString("zh-CN")}</b>
                  </span>
                  <span>
                    评论量
                    <b>{postActivity.comments.length.toLocaleString("zh-CN")}</b>
                  </span>
                  <span>
                    点赞量
                    <b>{(post.likes + (postActivity.liked ? 1 : 0)).toLocaleString("zh-CN")}</b>
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
