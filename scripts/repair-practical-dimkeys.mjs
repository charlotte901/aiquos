/**
 * 修复实操题库 dimKeys 的「静默兜底」缺陷。
 *
 * 缺陷：import-practical-bank.mjs 的 dimKeysFor() 在源文档「考察维度」名与
 * DIM_KEY 映射表全部不匹配时静默回落到固定 ["D2","D5"]。结果 90 个任务
 * （80 全量 + 10 精选）的 dimKeys 全部相同——实操通道的证据只进 D2/D5，
 * 六维后验中 D1/D3/D4/D6 从实操通道拿不到任何证据（与客观题答案错位同属
 * 「导入期映射失败被兜底掩盖」类缺陷）。
 *
 * 修复原则（可审计）：
 *   1. D2（提示词工程）对所有任务保留——每个实操任务的第一套量规就是
 *      通用提示词量规（角色/任务/约束/上下文/格式），这是源导入注释里
 *      声明的「提示词工程是所有实操任务的共同底座」哲学。
 *   2. 第二个维度按任务内容逐条显式指派（下方 SECOND_KEY 表），规则：
 *      - D3 AI工具使用：调用/集成 AI API 与生图工具的任务
 *      - D4 AI结果评估与优化：诊断修正 AI 输出、核验保真、改写迭代类
 *      - D5 人机协同解决问题：多步任务编排、端到端用 AI 产出交付物
 *      - D1 AI基础认知：Token/上下文窗口等概念计算
 *      - D6 AI伦理与合规：注入防护、安全检测
 *   3. dims（中文名）按 DIMENSIONS 表同步回填（此前为空数组）。
 *
 * 运行：node scripts/repair-practical-dimkeys.mjs [--apply]（默认 dry-run）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const here = dirname(fileURLToPath(import.meta.url));

const DIMENSIONS = [
  { key: "D1", name: "AI基础认知" },
  { key: "D2", name: "提示词工程" },
  { key: "D3", name: "AI工具使用" },
  { key: "D4", name: "AI结果评估与优化" },
  { key: "D5", name: "人机协同解决问题" },
  { key: "D6", name: "AI伦理与合规" },
];
const NAME_OF = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.name]));

/** 任务 id → 差异化第二维度（D2 为所有任务的共同底座，另计）。 */
const SECOND_KEY = {
  // ── 代码类：默认 D3（AI API/工具调用）──
  "full-001": ["D4", "调用无输出无报错：诊断 AI 工具链故障"],
  "full-002": ["D3", "实现流式输出：API 能力使用"],
  "full-003": ["D3", "多轮对话历史：API 状态管理"],
  "full-004": ["D4", "JSON 输出解析异常：修正 AI 输出可用性"],
  "full-005": ["D3", "API 容错重试：工具链工程"],
  "full-006": ["D3", "模板批量生成：API 自动化"],
  "full-007": ["D3", "函数调用触发：工具集成"],
  "full-008": ["D1", "Token 统计与成本估算：基础概念计算"],
  "full-009": ["D5", "CSV→计算→图表：多步任务编排"],
  "full-010": ["D3", "RAG 系统搭建：检索工具集成"],
  "full-011": ["D3", "并发调用：API 工程优化"],
  "full-012": ["D1", "上下文窗口截断：基础概念应用"],
  "full-013": ["D3", "缓存重复查询：API 成本工程"],
  "full-014": ["D6", "提示注入防护：安全合规"],
  "full-015": ["D4", "输出混入解释无法执行：输出净化修正"],
  "full-016": ["D3", "后端错误处理：API 工程可靠性"],
  "full-017": ["D3", "多轮状态保持类：API 状态管理"],
  "full-018": ["D3", "usage 信息记录：API 工程观测"],
  "full-019": ["D3", "系统/用户提示词分离管理：API 工程"],
  "full-020": ["D3", "PDF 提取接 AI 摘要：工具链集成"],
  "full-021": ["D6", "SQL 注入检测：安全合规"],
  "full-022": ["D5", "按复杂度路由大小模型：方案设计权衡"],
  "full-023": ["D3", "LangChain 排障：框架工具使用"],
  "full-024": ["D3", "Mermaid 图代码生成渲染：工具集成"],
  "full-025": ["D5", "多功能客服机器人：端到端系统编排"],
  // ── 图片类：生图工具使用 ──
  "full-026": ["D3", "电商主图生图提示词：生图工具"],
  "full-027": ["D3", "绘本配图生图：生图工具"],
  "full-028": ["D3", "建筑概念图生图：生图工具"],
  "full-029": ["D3", "品牌视觉生图：生图工具"],
  "full-030": ["D3", "文章配图生图：生图工具"],
  // ── 文本类 031-037：提示词应用 ──
  "full-031": ["D5", "写节约用电通知：用 AI 完成交付物"],
  "full-032": ["D4", "两版提示词输出对比：评估差异"],
  "full-033": ["D5", "设计行为面试题：用 AI 完成设计任务"],
  "full-034": ["D4", "推理题求解：核验 AI 答案"],
  "full-035": ["D5", "Markdown 表格简介：用 AI 产出结构化交付物"],
  "full-036": ["D4", "负面约束写作：检查输出合规"],
  "full-037": ["D5", "任务序列分解：多步编排"],
  // ── 文本类 038-060：改写/摘要/提取（保真与迭代）──
  "full-038": ["D4", "语气风格调整：输出迭代"],
  "full-039": ["D4", "评论分类提取：结果核验"],
  "full-040": ["D4", "担心编造：幻觉核验"],
  "full-041": ["D4", "精简保卖点：压缩优化"],
  "full-042": ["D4", "口述转书面：改写优化"],
  "full-043": ["D4", "通俗化改写：受众适配优化"],
  "full-044": ["D4", "公函格式改写：格式规范优化"],
  "full-045": ["D4", "三版本风格改写：多稿对比"],
  "full-046": ["D4", "10 个备选标题：多方案择优"],
  "full-047": ["D4", "段落扩充：扩写优化"],
  "full-048": ["D4", "鲁迅风格仿写：风格迁移优化"],
  "full-049": ["D4", "翻译去直译感：译文优化"],
  "full-050": ["D5", "差评专业回复：用 AI 处理业务沟通"],
  "full-051": ["D4", "会议纪要整理：信息结构化保真"],
  "full-052": ["D4", "长文观点提取：信息保真"],
  "full-053": ["D4", "关键词标签云提取：信息核验"],
  "full-054": ["D4", "三种长度摘要：多版本产出评估"],
  "full-055": ["D4", "双说明书差异对比：比对分析"],
  "full-056": ["D4", "FAQ 问答对提取：信息保真"],
  "full-057": ["D4", "邮件摘要+待办：信息保真"],
  "full-058": ["D4", "客户反馈聚合分析：归纳评估"],
  "full-059": ["D4", "长报道快讯化：压缩保真"],
  "full-060": ["D4", "30 轮对话纪要：信息保真"],
  // ── 文本类 061-070：端到端写作交付 ──
  "full-061": ["D5", "请假邮件：用 AI 完成沟通交付"],
  "full-062": ["D5", "售后投诉处理：用 AI 解决业务问题"],
  "full-063": ["D5", "年度工作总结：用 AI 完成文书"],
  "full-064": ["D5", "立项申请：用 AI 完成文书"],
  "full-065": ["D5", "活动策划案：用 AI 完成规划"],
  "full-066": ["D5", "招聘 JD：用 AI 完成文书"],
  "full-067": ["D5", "制度调整通知：用 AI 完成沟通"],
  "full-068": ["D5", "数据丢失道歉声明：用 AI 处理危机沟通"],
  "full-069": ["D5", "跨部门会议邀请：用 AI 完成协调沟通"],
  "full-070": ["D5", "新品发布文案：用 AI 完成营销交付"],
  // ── 文本类 071-080：翻译与本地化（译文质量评估优化）──
  "full-071": ["D4", "美式英语本地化：译文优化"],
  "full-072": ["D4", "口号文化适配：译文评估调优"],
  "full-073": ["D4", "五语种翻译+注意事项：多版本核验"],
  "full-074": ["D4", "商务邮件惯例改写：译文优化"],
  "full-075": ["D4", "术语本地化定译：译名评估"],
  "full-076": ["D4", "古诗意境翻译：译文质量把控"],
  "full-077": ["D4", "粤语转标准书面语：转写核验"],
  "full-078": ["D4", "法律声明双受众版本：分级产出核验"],
  "full-079": ["D4", "日本市场文化适配：跨文化改写"],
  "full-080": ["D4", "博客翻译+SEO 关键词：双语优化"],
  // ── 精选 10 题 ──
  "lite-001": ["D3", "运动会海报生图：生图工具"],
  "lite-002": ["D5", "销售 CSV 汇总分析：多步数据任务"],
  "lite-003": ["D4", "口语汇报转纪要：改写保真"],
  "lite-004": ["D3", "竖图定向外扩：生图工具"],
  "lite-005": ["D4", "IndexError 定位修复：诊断修正"],
  "lite-006": ["D4", "遗留代码重构+对比报告：评估优化"],
  "lite-007": ["D4", "8000 字报告层级摘要：信息保真"],
  "lite-008": ["D3", "摄影转水墨插画：生图工具"],
  "lite-009": ["D5", "班级成绩分析报告：端到端数据任务"],
  "lite-010": ["D5", "马原论文结合 AI 案例：用 AI 完成学术写作"],
};

const BANKS = [
  join(here, "../src/banks/practical-80.json"),
  join(here, "../src/banks/practical-10.json"),
];

const stats = { changed: 0, untouched: 0, missing: [] };
const secondTally = {};
for (const path of BANKS) {
  const bank = JSON.parse(readFileSync(path, "utf8"));
  for (const task of bank.tasks ?? bank) {
    const entry = SECOND_KEY[task.id];
    if (!entry) { stats.missing.push(task.id); continue; }
    const [second, why] = entry;
    const dimKeys = ["D2", second];
    if (JSON.stringify(task.dimKeys) === JSON.stringify(dimKeys)) { stats.untouched += 1; continue; }
    stats.changed += 1;
    secondTally[second] = (secondTally[second] ?? 0) + 1;
    console.log(`${task.id}: ${JSON.stringify(task.dimKeys)} → ${JSON.stringify(dimKeys)}  (${why})`);
    if (APPLY) {
      task.dimKeys = dimKeys;
      task.dims = dimKeys.map((key) => NAME_OF[key]);
    }
  }
  if (APPLY) writeFileSync(path, `${JSON.stringify(bank, null, 2)}\n`);
}

console.log(`\n改动 ${stats.changed} 项，未变 ${stats.untouched} 项，缺映射 ${stats.missing.length} 项`);
console.log("第二维度分布:", JSON.stringify(secondTally));
if (stats.missing.length) { console.log("缺映射任务:", stats.missing.join(", ")); process.exitCode = 1; }
console.log(APPLY ? "已写回两库。" : "dry-run 未写盘。确认后加 --apply。");
