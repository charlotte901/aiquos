import { useEffect, useState } from "react";
import { ArrowLeft, BookmarkSimple } from "@phosphor-icons/react";
import { favoriteFromCase, toggleFavorite, useFavoriteSaved } from "./favorites-store";

export const CASE_PROJECTS = [
  {
    title: "Aiquos Identity Refresh",
    tags: "Branding, Website",
    year: 2025,
    description:
      "以 AIQUOS 的粉色视觉为基底，重新整理标志、字体和页面节奏，让品牌在网站与展示物料之间保持同一种语气。",
  },
  {
    title: "Spatial Learning Toolkit",
    tags: "Education, Product",
    year: 2025,
    description:
      "把学习路径转成可拖拽的空间模块，帮助学习者先看见任务结构，再进入具体练习和成果整理。",
  },
  {
    title: "Studio Workflow Assistant",
    tags: "Productivity, AI",
    year: 2025,
    description:
      "为小型工作室设计的 AI 协作面板，将简报、素材、修改记录和交付检查放进同一条工作流。",
  },
  {
    title: "Retail Navigation Concept",
    tags: "Retail, Interactive",
    year: 2024,
    description:
      "通过实时导览和分层信息，减少实体零售空间中的寻找成本，让促销与路线信息保持安静而清晰。",
  },
  {
    title: "Quiet City Guide",
    tags: "Editorial, Mobile",
    year: 2024,
    description:
      "一组低干扰的城市漫游内容，用编辑式图片、短文和步行路线替代密集的评分列表。",
  },
  {
    title: "Modular Sound Archive",
    tags: "Culture, Web",
    year: 2024,
    description:
      "把声音档案拆成可组合的片段，访问者能够按地点、时间和材质重新编排自己的听觉路径。",
  },
  {
    title: "Field Research Atlas",
    tags: "Research, Data",
    year: 2024,
    description:
      "将田野记录、照片和统计数据叠放在同一张地图中，方便团队比较不同区域的变化过程。",
  },
  {
    title: "Soft Interface Study",
    tags: "Interaction, Prototype",
    year: 2024,
    description:
      "研究轻触、缓冲与渐进入场的界面语言，探索数字工具如何减少操作时的紧张感。",
  },
  {
    title: "Collaboration Service Design",
    tags: "Service, Branding",
    year: 2024,
    description:
      "从接待、沟通到交付重新梳理协作服务，让品牌承诺落实到每个可见的接触点。",
  },
  {
    title: "Neighborhood Commerce",
    tags: "Commerce, Web",
    year: 2024,
    description:
      "为街区小店构建轻量线上橱窗，保留店主叙事，同时让库存、预约和取货流程更直接。",
  },
  {
    title: "Motion Identity Draft",
    tags: "Motion, Branding",
    year: 2023,
    description:
      "以重复、停顿和轻微偏移组织品牌动效，使动态识别不会压过正文与图片内容。",
  },
  {
    title: "Archive Access System",
    tags: "Culture, Product",
    year: 2023,
    description:
      "为文化机构整理一套可检索的档案入口，让模糊的历史材料也能通过主题和时间被重新发现。",
  },
  {
    title: "Playful Data Reader",
    tags: "Data, Education",
    year: 2023,
    description:
      "把抽象数据转换成可触摸的图形任务，学习者在比较和排序中自然理解统计关系。",
  },
  {
    title: "Studio Collaboration Kit",
    tags: "Productivity, Web",
    year: 2023,
    description:
      "提供评审、标注和版本说明的共享模板，帮助远程团队减少反复同步造成的损耗。",
  },
  {
    title: "Museum Wayfinding",
    tags: "Culture, Interactive",
    year: 2023,
    description:
      "用安静的路线提示替代复杂指引，观众可以按停留时长和兴趣选择自己的展厅顺序。",
  },
  {
    title: "Health Companion Concept",
    tags: "Health, Mobile",
    year: 2023,
    description:
      "以温和的提醒和记录流为核心，让健康数据成为日常照顾的一部分，而不是冷冰的指标面板。",
  },
  {
    title: "Generative Type Workshop",
    tags: "Education, Type",
    year: 2023,
    description:
      "通过参数化字形实验讲解字体结构，参与者可以即时看到规则变化对识别度的影响。",
  },
  {
    title: "Low-energy Web Pilot",
    tags: "Sustainability, Web",
    year: 2023,
    description:
      "压缩媒体、限制动态层并重排加载顺序，在保留品牌氛围的前提下降低页面的能源消耗。",
  },
  {
    title: "Personal Knowledge Map",
    tags: "Tool, Product",
    year: 2022,
    description:
      "把笔记连接成不断生长的关系图，帮助个人在长期项目中保持上下文和灵感的可见性。",
  },
  {
    title: "Small Press Reader",
    tags: "Editorial, Mobile",
    year: 2022,
    description:
      "为独立出版社设计连续阅读体验，让标题、正文和图片在小屏幕上保留纸本的呼吸感。",
  },
  {
    title: "Maker Marketplace",
    tags: "Commerce, Web",
    year: 2022,
    description:
      "突出制作过程与材料来源，让买家在了解手作物件背景之后再进入购买流程。",
  },
  {
    title: "Remote Residency Platform",
    tags: "Culture, Web",
    year: 2022,
    description:
      "把驻留项目的展示、讨论和阶段记录集中在一个线上空间，支持分散地点的共同创作。",
  },
  {
    title: "Adaptive Learning Space",
    tags: "Education, AI",
    year: 2022,
    description:
      "根据练习结果调整任务难度和示例，AI 在这里承担反馈助手，而不是替代学习者的判断。",
  },
  {
    title: "Transport Signage Study",
    tags: "Wayfinding, Public",
    year: 2022,
    description:
      "比较不同换乘场景中的信息层级，用更大的距离对比和更少的颜色强化关键指示。",
  },
  {
    title: "Tactile Dashboard",
    tags: "Data, Prototype",
    year: 2022,
    description:
      "以厚实边缘、可按压区域和缓慢反馈组织数据界面，让复杂状态更容易被感知。",
  },
  {
    title: "Independent Film Hub",
    tags: "Entertainment, Web",
    year: 2022,
    description:
      "围绕导演、场景和主题组织独立影像，提供连续观看路径而不是单纯的片名列表。",
  },
  {
    title: "Garden Planning Tool",
    tags: "Sustainability, Mobile",
    year: 2022,
    description:
      "结合季节、光照和空间尺寸安排种植计划，帮助小型花园维持长期可维护的生态。",
  },
  {
    title: "Architecture Archive",
    tags: "Architecture, Culture",
    year: 2022,
    description:
      "将图纸、模型照片和现场记录按项目阶段排列，呈现建筑从概念到使用的完整过程。",
  },
  {
    title: "Open Studio Index",
    tags: "Community, Web",
    year: 2022,
    description:
      "为开放工作室活动建立共享索引，访客可以按区域规划路线，创作者也能更新当日状态。",
  },
  {
    title: "Quiet Product Studio",
    tags: "Product, Editorial",
    year: 2022,
    description:
      "以留白、克制色彩和长段落说明展示产品，强调材料、使用方式与长期维护。",
  },
  {
    title: "Light Archive Editorial",
    tags: "Editorial, Culture",
    year: 2022,
    description:
      "以自然光为主题整理摄影专题，文字与图片交替出现，形成缓慢推进的阅读节奏。",
  },
  {
    title: "Sequential Memory",
    tags: "Archive, Interactive",
    year: 2022,
    description:
      "让访问者按时间顺序揭开记忆片段，影像之间的间隙成为回忆与补充说明的位置。",
  },
  {
    title: "Soft Machine Study",
    tags: "Prototype, Technology",
    year: 2022,
    description:
      "探索柔软材质与机械结构结合的原型，记录它们在压力、温度和触碰下的反应。",
  },
  {
    title: "Everyday Interface Atlas",
    tags: "Interface, Research",
    year: 2022,
    description:
      "收集日常环境中的界面样本，比较它们如何通过形状、文字和位置引导行为。",
  },
  {
    title: "Studio Season Review",
    tags: "Editorial, Web",
    year: 2022,
    description:
      "以季度为单位回顾工作室项目，保留失败草图和过程笔记，呈现完整决策路径。",
  },
  {
    title: "Process Library",
    tags: "Community, Archive",
    year: 2022,
    description:
      "把可复用的制作方法整理成公共资料库，鼓励创作者贡献自己的修改与验证结果。",
  },
];

const projectImage = (index) => `/assets/cases/${index + 1}.webp`;

export function CaseDetail({
  project,
  index,
  total = CASE_PROJECTS.length,
  onBack,
  returnLabel = "返回",
}) {
  const saved = useFavoriteSaved(`case-${index}`);

  return (
    <section className="case-archive case-detail" aria-label="Case detail">
      <button className="case-detail-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        {returnLabel}
      </button>
      <div className="case-detail-body">
        <figure className="case-detail-figure">
          <img
            src={projectImage(index)}
            alt={project.title}
            draggable="false"
          />
        </figure>
        <div className="case-detail-info">
          <p className="case-detail-index">
            Work {String(index + 1).padStart(2, "0")} / {total}
          </p>
          <h1>{project.title}</h1>
          <p className="case-detail-meta">
            {project.tags}
            <i aria-hidden="true">•</i>
            {project.year}
          </p>
          <p className="case-detail-copy">{project.description}</p>
          <button
            type="button"
            className={`favorite-button case-favorite-button${saved ? " is-saved" : ""}`}
            aria-pressed={saved}
            onClick={() => toggleFavorite(favoriteFromCase(project, index))}
          >
            <BookmarkSimple size={17} weight={saved ? "fill" : "regular"} />
            {saved ? "已收藏" : "收藏作品"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function CaseArchive({ onDetailChange }) {
  const [active, setActive] = useState(3);
  const [openProject, setOpenProject] = useState(null);

  useEffect(() => {
    onDetailChange?.(openProject !== null);
  }, [openProject, onDetailChange]);

  const roleFor = (index) => {
    const offset = (active - index + CASE_PROJECTS.length) % CASE_PROJECTS.length;
    return ["front", "lower", "upper", "back"][offset] ?? "hidden";
  };

  if (openProject !== null) {
    const project = CASE_PROJECTS[openProject];
    return (
      <CaseDetail
        project={project}
        index={openProject}
        onBack={() => setOpenProject(null)}
      />
    );
  }

  return (
    <section className="case-archive" aria-label="Case archive">
      <div className="case-archive-inner">
        <h1 className="case-archive-title">
          Work <sup>{CASE_PROJECTS.length}</sup>
        </h1>
        <ul className="case-archive-list">
          {CASE_PROJECTS.map((project, index) => (
            <li key={project.title}>
              <button
                className={`case-archive-row${active === index ? " is-active" : ""}`}
                type="button"
                aria-label={`查看 ${project.title}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onClick={() => {
                  setActive(index);
                  setOpenProject(index);
                }}
              >
                <span className="case-archive-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="case-archive-name">{project.title}</span>
                <span className="case-archive-meta">
                  {project.tags}
                  <i aria-hidden="true">•</i>
                  {project.year}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="case-archive-preview" aria-hidden="true">
          {CASE_PROJECTS.map((project, index) => (
            <img
              key={project.title}
              className={`case-stack-media ${roleFor(index)}`}
              src={`/assets/cases/${index + 1}.webp`}
              alt=""
              draggable="false"
              loading={index < 4 ? "eager" : "lazy"}
              decoding="async"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
