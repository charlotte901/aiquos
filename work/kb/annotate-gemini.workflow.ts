// 知识库标注工作流：用 gemini-3.8-flash-high（宿主路由，走计划额度）替代
// 余额耗尽的 DeepSeek 完成剩余 1536 条候选的标注。
// 结构：并行标注 32 个切片 → world.run 确定性校验合并（与 s3 checkTag 同规则）
// → 失败切片修复（最多 2 轮）→ 抽查标注质量 → 报告。
// 合并与失败协议由 work/kb/merge-gemini.mjs 承担；修复输出优先于首轮输出。

interface SliceResult {
  /** 切片 id，如 "07"。 */
  slice: string;
  /** 实际写出的标注行数。 */
  written: number;
}
interface MergeSummary {
  merged: number;
  failed: number;
  failSlices: string[];
  pendingTotal: number;
}
interface WorkflowReport {
  conclusion: string;
  findings: { where: string; what: string; evidence: string; status: "verified" | "unconfirmed"; severity: "low" | "medium" | "high" }[];
  verified: string[];
  notCovered: string[];
}

const REPO = "/Users/lunaecho/.zcode/workspace/draft-c879bc09-ee4a-4dd1-beb0-a89d9f5f6c7a/aiquos";
const SLICES = Array.from({ length: 53 }, (_, i) => String(i + 1).padStart(2, "0"));

artifact.metrics("annot-progress", {
  title: "标注合并进度",
  metrics: [
    { field: "merged", label: "已合并" },
    { field: "failed", label: "校验失败" },
    { field: "round", label: "修复轮次" },
  ],
});

const RUBRIC = `评分口径（严格遵守）：
- relevant：是否为「教人理解或使用 AI」的学习资源（教学/讲解/指南/课程）。纯新闻八卦、娱乐、卖课广告、纯产品发布宣发 → false。
- quality（讲解质量分）：5=体系完整讲解清晰；4=单点扎实可信；3=信息稀薄或浅尝辄止；2=标题党/干货极少；1=无学习价值。广告软文与「关注公众号看全文」类 ≤2。拿不准时往下打。
- difficulty：low=零基础可看；medium=需要基本概念；high=专业深水区。
- dims：1-2 个维度键（D1 基础认知 / D2 提示词工程 / D3 工具使用 / D4 结果评估与优化 / D5 人机协同 / D6 伦理合规），主维度必须是候选的 dimPrior（除非明显错配）；次维度仅在内容确有覆盖时才加。
- subtopic：只能从候选的 enumDomain 字段里选，且必须属于 dims 中的主维度。
- summary/why：中文 ≤60 字，具体、可追溯（基于标题/简介事实），不编造内容；relevant=false 时简要说明判断依据。`;

function parseMerge(stdout: string): MergeSummary {
  const match = /MERGE_RESULT (\{.*\})/.exec(stdout);
  if (match === null) throw new Error(`合并脚本无汇总行：${stdout.slice(-300)}`);
  return JSON.parse(match[1]) as MergeSummary;
}

phase("并行标注 32 个切片");
log(`待标注 1536 条候选，切为 ${SLICES.length} 片，全部跑在 gemini-3.8-flash-high 上`);
const results = await Promise.all(
  SLICES.map((slice) => {
    const annotator = agent(`标注员-${slice}`, {
      system: "你是严谨的 AI 学习资源库元数据标注员。只依据候选给出的标题/简介等事实标注，绝不编造内容；写完逐行自检 JSON 合法性与口径后再落盘。",
    });
    return annotator.ask<SliceResult>(
      `读取 ${REPO}/work/kb/tagged/pending/slice-${slice}.json（一条 JSON 数组，48 条学习资源候选）。\n` +
      `对每条输出一行 JSON（JSONL，不要数组、不要 markdown 围栏、不要任何多余文字）：\n` +
      `{"key":"<原样抄写候选的 key>","relevant":true或false,"quality":1到5的整数,"difficulty":"low"|"medium"|"high","dims":["Dx"最多2个],"subtopic":"<从该候选的 enumDomain 里选>","summary":"≤60字","why":"≤60字"}\n` +
      `${RUBRIC}\n` +
      `候选字段说明：kind=video 是B站视频（看标题/简介/播放量），kind=book 是开源教材章节页（质量起点较高，且 difficulty 不得低于 minDifficulty 字段），其余是网页/文章。\n` +
      `写完后逐行自检：key 与候选一致、subtopic 在 enumDomain 内且其维度在 dims 里、JSON 可解析。\n` +
      `然后用 Write 工具把全部 ${48} 行写到 ${REPO}/work/kb/tagged/gemini-out/slice-${slice}.jsonl。\n` +
      `最后只回复 JSON：{"slice":"${slice}","written":<行数>}`,
    );
  }),
);
const written = results.reduce((sum, r) => sum + r.written, 0);
log(`首轮标注写盘 ${written} 行，开始合并校验`);

phase("合并校验标注");
let merge = await world.run("node", [`${REPO}/work/kb/merge-gemini.mjs`], { timeoutMs: 120_000 });
let summary = parseMerge(merge.stdout);
report({ merged: summary.merged, failed: summary.failed, round: 0 }, "annot-progress");

const findings: WorkflowReport["findings"] = [];

phase("修复校验失败的切片");
for (let round = 1; round <= 2 && summary.failed > 0; round++) {
  log(`第 ${round} 轮修复：${summary.failed} 条失败，涉及切片 ${summary.failSlices.join(",")}`);
  await Promise.all(
    summary.failSlices.map((slice) => {
      const repairer = agent(`修复员-${slice}-r${round}`, {
        system: "你负责修复未通过校验的标注。常见原因：subtopic 不在枚举域、subtopic 维度与 dims 不一致、summary/why 太短或非中文、JSON 解析失败。修正时仍严格遵守评分口径。",
      });
      return repairer.ask<SliceResult>(
        `读取 ${REPO}/work/kb/tagged/gemini-failures.jsonl（JSON 数组），只处理其中 slice === "${slice}" 的条目。\n` +
        `每条失败含 problems（错误原因）与 ann（原标注，可能缺失）。对照 ${REPO}/work/kb/tagged/pending/slice-${slice}.json 里同 key 候选的元数据重新标注。\n` +
        `每条输出一行 JSON（JSONL，字段同前）：{"key":"...","relevant":...,"quality":...,"difficulty":"...","dims":[...],"subtopic":"...","summary":"...","why":"..."}\n` +
        `${RUBRIC}\n` +
        `特别注意 problems 里指出的错误，逐条对症修正。写完自检后用 Write 工具写到 ${REPO}/work/kb/tagged/gemini-out-fixed/slice-${slice}.jsonl。\n` +
        `最后只回复 JSON：{"slice":"${slice}","written":<行数>}`,
      );
    }),
  );
  merge = await world.run("node", [`${REPO}/work/kb/merge-gemini.mjs`], { timeoutMs: 120_000 });
  summary = parseMerge(merge.stdout);
  report({ merged: summary.merged, failed: summary.failed, round }, "annot-progress");
}

if (summary.failed > 0) {
  const dropped = await world.run("node", [`${REPO}/work/kb/merge-gemini.mjs`, "--drop-failures"], { timeoutMs: 120_000 });
  summary = parseMerge(dropped.stdout);
  findings.push({
    where: "work/kb/rejected/gemini-drop.jsonl",
    what: `两轮修复后仍有 ${summary.failed} 条标注未通过校验，按 s3 同款协议淘汰（记入 rejected/gemini-drop.jsonl）`,
    evidence: `merge-gemini.mjs --drop-failures 输出：${dropped.stdout.slice(-200)}`,
    status: "verified",
    severity: "low",
  });
}

phase("抽查标注质量");
const sample = await agent("质量抽查员", {
  system: "你是知识库质检员。抽查标注是否忠实于候选事实：summary/why 是否与标题/简介相符、有无编造内容、dims/难度是否合理。只读文件，不修改任何文件。",
}).ask<string>(
  `从 ${REPO}/work/kb/tagged/annotations.jsonl 中找出 annotator 字段为 "gemini-3.8-flash-high" 的最后 60 条，抽其中 12 条（覆盖不同 type）。\n` +
  `对每条对照 ${REPO}/work/kb/tagged/pending/ 下对应切片里的候选元数据，检查：summary/why 是否基于标题/简介事实、有无编造、difficulty 是否明显失当。\n` +
  `返回一段中文结论：抽了哪些、发现的问题清单（无问题就明说），并给出「可疑标注占比」的估计。`,
);
findings.push({
  where: "work/kb/tagged/annotations.jsonl",
  what: `质量抽查结论：${sample}`,
  evidence: "抽查员只读对照 pending 切片元数据与合并后的标注记录",
  status: "verified",
  severity: "low",
});

return {
  conclusion: `本轮共合并 ${summary.merged} 条 Gemini 标注入 annotations.jsonl（含修复轮），两轮修复后淘汰 ${summary.failed} 条。全部通过 checkTag 同规则的确定性校验门，待主会话跑 s4 体检与 s5 入库。`,
  findings,
  verified: [
    "每条标注经 merge-gemini.mjs 校验（subtopic 枚举域/维度一致、quality 1-5、summary/why 长度、书籍难度下限）",
    "质量抽查员独立对照候选元数据抽检 12 条",
  ],
  notCovered: [
    "链接存活性未在本工作流内复验（由既有 s4 体检层负责）",
    "质量抽查为 12 条抽样而非全量人工复核",
  ],
};
