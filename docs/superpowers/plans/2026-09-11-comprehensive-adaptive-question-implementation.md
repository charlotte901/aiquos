# 综合测评自适应出题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将综合测评改为跨五关、逐题动态选择的轻量自适应出题，同时不新增任何评分、等级或报告逻辑。

**Architecture:** 在独立纯函数模块中维护不可见的自适应会话，并由 `SiteExperience` 的 ref 跨地图和关卡保存。`ComprehensiveTask` 每次只请求当前题，提交答案后更新路由信号，点击继续时再选择下一题；难度元数据直接写入本地题库 JSON。

**Tech Stack:** React 19、Vite 6、ES modules、Node.js built-in test runner、JSON 本地题库

**Spec:** `docs/superpowers/specs/2026-09-11-comprehensive-adaptive-question-design.md`

## Global Constraints

- 只对综合测评启用自适应出题。
- 每关仍然固定完成五题，保留现有开场、逐题反馈、答案解析、守护者反应、结尾和地图流程。
- `position` 初始为 `1`，完全正确加 `0.4`，错误减 `0.4`，多选部分正确不变，并限制在 `0` 至 `2`。
- 新关卡执行 `position = 1 + (position - 1) * 0.65`，同一关重复打开不得重复回归。
- 下一题按难度距离、能力维度累计次数、是否与上一题同型的字典序排序，再从前三个候选中随机选择。
- 同一次综合测评不重复题目；题池耗尽时返回 `null`，不得重复出题或自动完成关卡。
- 离开综合测评返回 TEST 选择页时重置临时会话；刷新页面不恢复会话。
- 不计算、展示、保存或传递总分、百分制成绩、等级、能力值、雷达图、觉醒报告或其他测评结果。
- 不改变客观题测评、对话式测评和实操任务测评。
- 不新增依赖、后端服务或浏览器存储。

---

## File Structure

- Create `src/comprehensive-adaptive.js`: 纯函数会话创建、关卡回归、候选排序、随机选择和结果更新。
- Create `tests/comprehensive-adaptive.test.mjs`: 题库难度分布和自适应纯函数行为测试。
- Modify `src/comprehensive-questions.json`: 给一百二十题补充 `difficulty`。
- Modify `src/comprehensive-quiz.js`: 移除旧的一次性五题随机抽取接口，继续提供关卡内容、即时判题和反馈文案。
- Modify `src/AssessmentFlow.jsx`: 综合测评逐题请求和空题池错误状态。
- Modify `src/SiteExperience.jsx`: 使用 ref 保存并重置跨关卡自适应会话。
- Modify `tests/assessment-flow.test.mjs`: 锁定 React 集成边界与“仅综合测评”约束。
- Modify `README.md`: 把综合测评说明更新为本地逐题自适应，并明确无评分和无持久化。

---

### Task 1: 题库难度元数据

**Files:**
- Create: `tests/comprehensive-adaptive.test.mjs`
- Modify: `src/comprehensive-questions.json`

**Interfaces:**
- Consumes: `src/comprehensive-questions.json` 的 `{ questions: Question[] }`。
- Produces: 每个 `Question` 都有 `difficulty: "low" | "medium" | "high"`；后续选择器直接读取该字段。

- [ ] **Step 1: 写入会失败的难度分布测试**

创建 `tests/comprehensive-adaptive.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import questionBank from "../src/comprehensive-questions.json" with { type: "json" };

const DIFFICULTIES = ["low", "medium", "high"];
const LEVELS = ["academy", "labyrinth", "workshop", "station", "court"];

test("the comprehensive bank has explicit balanced difficulty metadata", () => {
  assert.equal(questionBank.questions.length, 120);
  assert.equal(new Set(questionBank.questions.map((question) => question.id)).size, 120);

  for (const question of questionBank.questions) {
    assert.ok(DIFFICULTIES.includes(question.difficulty), `${question.id} has a valid difficulty`);
    assert.ok(["single", "judge", "multi"].includes(question.type), `${question.id} has a valid type`);
    assert.equal(question.dimKeys.length, 2, `${question.id} has two dimensions`);
    assert.ok(question.dimKeys.every((key) => /^D[1-6]$/.test(key)), `${question.id} has valid dimensions`);
  }

  for (const difficulty of DIFFICULTIES) {
    assert.equal(
      questionBank.questions.filter((question) => question.difficulty === difficulty).length,
      40,
    );
  }

  for (const levelId of LEVELS) {
    for (const difficulty of DIFFICULTIES) {
      assert.equal(
        questionBank.questions.filter(
          (question) => question.levelId === levelId && question.difficulty === difficulty,
        ).length,
        8,
      );
    }
  }
});
```

- [ ] **Step 2: 运行测试并确认因缺少字段而失败**

Run: `node --test tests/comprehensive-adaptive.test.mjs`

Expected: FAIL at `has a valid difficulty` for `q001`.

- [ ] **Step 3: 按原始 Word 题库顺序补入难度字段**

对 `src/comprehensive-questions.json` 做一次机械变换，在每个题目的 `id` 后插入：

```js
const number = Number(question.id.slice(1));
question.difficulty = number <= 40 ? "low" : number <= 80 ? "medium" : "high";
```

写回 JSON 时使用两个空格缩进并保留结尾换行。抽查 `q001`、`q040`、`q041`、`q080`、`q081`、`q120` 的边界值。

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/comprehensive-adaptive.test.mjs`

Expected: PASS, 1 test passed and 0 failed.

- [ ] **Step 5: 提交题库元数据**

```bash
git add src/comprehensive-questions.json tests/comprehensive-adaptive.test.mjs
git commit -m "test: define comprehensive question difficulties"
```

---

### Task 2: 纯函数自适应选择器

**Files:**
- Create: `src/comprehensive-adaptive.js`
- Modify: `tests/comprehensive-adaptive.test.mjs`

**Interfaces:**
- Produces: `createAdaptiveSession(): AdaptiveSession`。
- Produces: `startAdaptiveStage(session: AdaptiveSession, stage: number): AdaptiveSession`。
- Produces: `applyAdaptiveOutcome(session: AdaptiveSession, outcome: "correct" | "partial" | "wrong"): AdaptiveSession`。
- Produces: `selectAdaptiveQuestion({ questions, levelId, session, rng? }): { question: Question | null, session: AdaptiveSession }`。
- `selectAdaptiveQuestion` 在返回题目时把题目 ID、两个维度、题型和上一题型记录进返回的新会话，不修改输入对象。

- [ ] **Step 1: 写入会失败的会话更新测试**

在 `tests/comprehensive-adaptive.test.mjs` 导入尚不存在的接口并增加：

```js
import {
  applyAdaptiveOutcome,
  createAdaptiveSession,
  startAdaptiveStage,
} from "../src/comprehensive-adaptive.js";

test("adaptive routing starts in the middle and applies bounded evidence", () => {
  const initial = createAdaptiveSession();
  assert.equal(initial.position, 1);
  assert.equal(applyAdaptiveOutcome(initial, "correct").position, 1.4);
  assert.equal(applyAdaptiveOutcome(initial, "partial").position, 1);
  assert.equal(applyAdaptiveOutcome(initial, "wrong").position, 0.6);

  let high = initial;
  let low = initial;
  for (let index = 0; index < 10; index += 1) {
    high = applyAdaptiveOutcome(high, "correct");
    low = applyAdaptiveOutcome(low, "wrong");
  }
  assert.equal(high.position, 2);
  assert.equal(low.position, 0);
});

test("a new stage partially regresses once toward medium", () => {
  const high = { ...createAdaptiveSession(), position: 2 };
  const stageOne = startAdaptiveStage(high, 1);
  const stageTwo = startAdaptiveStage(stageOne, 2);
  assert.equal(stageOne.position, 2);
  assert.equal(stageTwo.position, 1.65);
  assert.deepEqual(startAdaptiveStage(stageTwo, 2), stageTwo);
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `node --test tests/comprehensive-adaptive.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/comprehensive-adaptive.js`.

- [ ] **Step 3: 实现最小会话创建、结果更新和关卡回归**

创建 `src/comprehensive-adaptive.js`，先实现：

```js
const DIMENSION_KEYS = ["D1", "D2", "D3", "D4", "D5", "D6"];
const TYPES = ["single", "judge", "multi"];

export function createAdaptiveSession() {
  return {
    position: 1,
    usedQuestionIds: [],
    dimensionCounts: Object.fromEntries(DIMENSION_KEYS.map((key) => [key, 0])),
    typeCounts: Object.fromEntries(TYPES.map((type) => [type, 0])),
    lastType: null,
    activeStage: null,
  };
}

export function startAdaptiveStage(session, stage) {
  if (session.activeStage === stage) return session;
  const position = session.activeStage === null
    ? session.position
    : 1 + (session.position - 1) * 0.65;
  return { ...session, position, activeStage: stage };
}

export function applyAdaptiveOutcome(session, outcome) {
  const delta = outcome === "correct" ? 0.4 : outcome === "wrong" ? -0.4 : 0;
  return { ...session, position: Math.max(0, Math.min(2, session.position + delta)) };
}
```

- [ ] **Step 4: 运行会话测试并确认通过**

Run: `node --test tests/comprehensive-adaptive.test.mjs`

Expected: PASS for the metadata and two session tests.

- [ ] **Step 5: 写入会失败的候选选择测试**

在同一测试文件增加一个 `candidate()` 工具和以下行为测试：

```js
import { selectAdaptiveQuestion } from "../src/comprehensive-adaptive.js";

function candidate(id, difficulty, dimKeys, type = "single", levelId = "academy") {
  return { id, difficulty, dimKeys, type, levelId };
}

test("selection favors difficulty before under-covered dimensions and type variety", () => {
  const session = {
    ...createAdaptiveSession(),
    position: 1.8,
    dimensionCounts: { D1: 4, D2: 4, D3: 0, D4: 0, D5: 2, D6: 2 },
    lastType: "single",
  };
  const questions = [
    candidate("medium-gap", "medium", ["D3", "D4"], "judge"),
    candidate("high-covered", "high", ["D1", "D2"], "single"),
    candidate("high-gap", "high", ["D3", "D4"], "single"),
    candidate("high-gap-varied", "high", ["D3", "D4"], "judge"),
  ];
  const result = selectAdaptiveQuestion({ questions, levelId: "academy", session, rng: () => 0 });
  assert.equal(result.question.id, "high-gap-varied");
  assert.deepEqual(result.session.usedQuestionIds, ["high-gap-varied"]);
  assert.equal(result.session.dimensionCounts.D3, 1);
  assert.equal(result.session.dimensionCounts.D4, 1);
  assert.equal(result.session.typeCounts.judge, 1);
  assert.equal(result.session.lastType, "judge");
});

test("selection excludes used and foreign-level questions", () => {
  const session = { ...createAdaptiveSession(), usedQuestionIds: ["used"] };
  const questions = [
    candidate("used", "medium", ["D1", "D2"]),
    candidate("foreign", "medium", ["D1", "D2"], "single", "court"),
    candidate("fresh", "medium", ["D1", "D2"]),
  ];
  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session, rng: () => 0 }).question.id,
    "fresh",
  );
});

test("selection randomizes within the top three and returns null for an empty pool", () => {
  const questions = [1, 2, 3, 4].map((number) =>
    candidate(`q${number}`, "medium", ["D1", "D2"]),
  );
  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session: createAdaptiveSession(), rng: () => 0.999 }).question.id,
    "q3",
  );
  const empty = selectAdaptiveQuestion({ questions: [], levelId: "academy", session: createAdaptiveSession() });
  assert.equal(empty.question, null);
  assert.deepEqual(empty.session, createAdaptiveSession());
});

test("selection clamps invalid random values to a valid shortlist index", () => {
  const questions = [1, 2, 3].map((number) =>
    candidate(`q${number}`, "medium", ["D1", "D2"]),
  );
  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session: createAdaptiveSession(), rng: () => -2 }).question.id,
    "q1",
  );
  assert.equal(
    selectAdaptiveQuestion({ questions, levelId: "academy", session: createAdaptiveSession(), rng: () => Number.NaN }).question.id,
    "q1",
  );
});
```

- [ ] **Step 6: 运行测试并确认缺少选择器而失败**

Run: `node --test tests/comprehensive-adaptive.test.mjs`

Expected: FAIL because `selectAdaptiveQuestion` is not exported.

- [ ] **Step 7: 实现候选字典序排序、前三随机和不可变状态记录**

在 `src/comprehensive-adaptive.js` 增加：

```js
const DIFFICULTY_INDEX = { low: 0, medium: 1, high: 2 };

export function selectAdaptiveQuestion({ questions, levelId, session, rng = Math.random }) {
  const used = new Set(session.usedQuestionIds);
  const candidates = questions
    .filter((question) => question.levelId === levelId && !used.has(question.id))
    .map((question, order) => ({
      question,
      order,
      difficultyDistance: Math.abs(DIFFICULTY_INDEX[question.difficulty] - session.position),
      dimensionLoad: question.dimKeys.reduce(
        (total, key) => total + (session.dimensionCounts[key] ?? 0),
        0,
      ),
      repeatsType: question.type === session.lastType ? 1 : 0,
    }))
    .sort((left, right) =>
      left.difficultyDistance - right.difficultyDistance
      || left.dimensionLoad - right.dimensionLoad
      || left.repeatsType - right.repeatsType
      || left.order - right.order,
    );

  if (candidates.length === 0) return { question: null, session };
  const shortlist = candidates.slice(0, 3);
  const randomValue = Number(rng());
  const rawIndex = Number.isFinite(randomValue) ? Math.floor(randomValue * shortlist.length) : 0;
  const index = Math.max(0, Math.min(shortlist.length - 1, rawIndex));
  const question = shortlist[index].question;
  const dimensionCounts = { ...session.dimensionCounts };
  for (const key of question.dimKeys) dimensionCounts[key] = (dimensionCounts[key] ?? 0) + 1;

  return {
    question,
    session: {
      ...session,
      usedQuestionIds: [...session.usedQuestionIds, question.id],
      dimensionCounts,
      typeCounts: {
        ...session.typeCounts,
        [question.type]: (session.typeCounts[question.type] ?? 0) + 1,
      },
      lastType: question.type,
    },
  };
}
```

- [ ] **Step 8: 运行全部自适应纯函数测试**

Run: `node --test tests/comprehensive-adaptive.test.mjs`

Expected: PASS, all adaptive tests pass with 0 failures.

- [ ] **Step 9: 提交自适应选择器**

```bash
git add src/comprehensive-adaptive.js tests/comprehensive-adaptive.test.mjs
git commit -m "feat: add adaptive comprehensive selector"
```

---

### Task 3: 综合测评逐题集成和跨关卡生命周期

**Files:**
- Modify: `src/comprehensive-quiz.js:125-132`
- Modify: `src/AssessmentFlow.jsx:13-20,303-468,470-485`
- Modify: `src/SiteExperience.jsx:97-108,313-333,410,451-469`
- Modify: `tests/assessment-flow.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 2 的四个纯函数。
- Produces: `SiteExperience.selectComprehensiveQuestion(levelId, stage): Question | null`。
- Produces: `SiteExperience.recordComprehensiveOutcome(outcome): void`。
- `AssessmentTask` 新增 `onSelectComprehensiveQuestion` 和 `onRecordComprehensiveOutcome`，只传给 `ComprehensiveTask`。

- [ ] **Step 1: 写入会失败的 React 集成契约测试**

扩展 `tests/assessment-flow.test.mjs`：

```js
test("comprehensive questions are selected one at a time from a cross-stage session", async () => {
  const [flow, experience, quiz] = await Promise.all([
    readFile(new URL("../src/AssessmentFlow.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/SiteExperience.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/comprehensive-quiz.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(quiz, /createComprehensiveQuestions/);
  assert.match(flow, /onSelectComprehensiveQuestion\(level\.id, stage\)/);
  assert.match(flow, /onRecordComprehensiveOutcome\(outcome\)/);
  assert.match(experience, /useRef\(createAdaptiveSession\(\)\)/);
  assert.match(experience, /startAdaptiveStage/);
  assert.match(experience, /selectAdaptiveQuestion/);
  assert.match(experience, /adaptiveSession\.current = createAdaptiveSession\(\)/);
});
```

- [ ] **Step 2: 运行测试并确认旧的一次性抽题接口导致失败**

Run: `node --test tests/assessment-flow.test.mjs`

Expected: FAIL because `createComprehensiveQuestions` is still present and the adaptive callbacks do not exist.

- [ ] **Step 3: 从题库模块移除旧的一次性随机五题函数**

在 `src/comprehensive-quiz.js` 删除 `createComprehensiveQuestions`，继续导出 `COMPREHENSIVE_QUESTION_COUNT`、关卡内容、反馈和 `judgeComprehensiveAnswer`。额外导出原始题目数组供 `SiteExperience` 的选择器使用：

```js
export const COMPREHENSIVE_QUESTIONS = questionBank.questions;
```

- [ ] **Step 4: 在 SiteExperience 建立跨关卡 ref 和两个回调**

在 `src/SiteExperience.jsx` 导入 Task 2 接口与 `COMPREHENSIVE_QUESTIONS`，在组件状态附近创建：

```js
const adaptiveSession = useRef(createAdaptiveSession());

function selectComprehensiveQuestion(levelId, stage) {
  const started = startAdaptiveStage(adaptiveSession.current, stage);
  const selected = selectAdaptiveQuestion({
    questions: COMPREHENSIVE_QUESTIONS,
    levelId,
    session: started,
  });
  adaptiveSession.current = selected.session;
  return selected.question;
}

function recordComprehensiveOutcome(outcome) {
  adaptiveSession.current = applyAdaptiveOutcome(adaptiveSession.current, outcome);
}
```

增加一个明确的入口函数，只有从 TEST 卡片开始新的综合测评时重置：

```js
function startAssessment(id) {
  if (id === "comprehensive") adaptiveSession.current = createAdaptiveSession();
  openAssessmentMap(id);
}
```

把 `AssessmentHub` 的 `onStart` 从 `openAssessmentMap` 改为 `startAssessment`。综合测评地图返回 TEST 时再次重置；任务返回同一地图时不重置。在 `AssessmentTask` 调用处传入：

```jsx
onSelectComprehensiveQuestion={selectComprehensiveQuestion}
onRecordComprehensiveOutcome={recordComprehensiveOutcome}
```

- [ ] **Step 5: 把 ComprehensiveTask 改成逐题请求**

修改签名：

```js
function ComprehensiveTask({
  stage,
  onComplete,
  onSelectComprehensiveQuestion,
  onRecordComprehensiveOutcome,
})
```

用当前题替换预生成数组：

```js
const [question, setQuestion] = useState(
  () => onSelectComprehensiveQuestion(level.id, stage),
);
const isLastQuestion = questionIndex === COMPREHENSIVE_QUESTION_COUNT - 1;
```

在 `answer` 中保留现有即时判题，并只发送三态路由结果：

```js
const outcome = answerResult.correct
  ? "correct"
  : answerResult.partialCorrect
    ? "partial"
    : "wrong";
onRecordComprehensiveOutcome(outcome);
```

在非最后一题的 `nextQuestion` 中调用：

```js
setQuestion(onSelectComprehensiveQuestion(level.id, stage));
setQuestionIndex((current) => current + 1);
setSelected([]);
setResult(null);
setReaction("");
```

如果 `phase === "quiz"` 且 `question === null`，显示 `role="alert"` 的“当前关卡暂无可用题目，请返回关卡地图后重试。”，不显示完成按钮，也不调用 `onComplete`。

- [ ] **Step 6: 从 AssessmentTask 只向综合题组件转发新回调**

给 `AssessmentTask` 增加两个属性，并在综合分支中传入：

```jsx
<ComprehensiveTask
  key={`${taskKey}-comprehensive`}
  {...props}
  onSelectComprehensiveQuestion={onSelectComprehensiveQuestion}
  onRecordComprehensiveOutcome={onRecordComprehensiveOutcome}
/>
```

客观题、对话式和实操任务分支不接收这些属性。

- [ ] **Step 7: 更新 README 的综合测评说明**

把“每关随机抽五题”说明改为：综合测评每关仍为五题，系统根据前序作答逐题调整难度，并兼顾六维覆盖、题型变化和防重复；状态只存在于本次综合测评内，不生成或保存分数、等级及报告。不要改写其他测评或首页说明。

- [ ] **Step 8: 运行集成测试并修正最小实现直至通过**

Run: `node --test tests/assessment-flow.test.mjs tests/comprehensive-adaptive.test.mjs`

Expected: PASS, all tests in both files pass with 0 failures.

- [ ] **Step 9: 提交 React 集成**

```bash
git add src/comprehensive-quiz.js src/AssessmentFlow.jsx src/SiteExperience.jsx tests/assessment-flow.test.mjs README.md
git commit -m "feat: adapt comprehensive questions across stages"
```

---

### Task 4: 完整回归和浏览器验收

**Files:**
- Verify only; modify the files from Tasks 1-3 only when a failing check demonstrates a defect.

**Interfaces:**
- Consumes: Tasks 1-3 的完整实现。
- Produces: 可构建、可交互且满足规格的功能分支。

- [ ] **Step 1: 运行全部 Node 测试**

Run: `node --test tests/*.test.mjs`

Expected: exit 0, all tests pass, 0 failed.

- [ ] **Step 2: 运行生产构建和 Sites Worker 测试**

Run: `npm run build`

Expected: exit 0 and `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json` exist.

Run: `npm run test:sites`

Expected: exit 0, all Sites Worker tests pass.

- [ ] **Step 3: 启动本地预览**

Run: `npm run dev -- --host 127.0.0.1 --port 4286`

Expected: Vite reports `http://127.0.0.1:4286/` and keeps running in a terminal session.

- [ ] **Step 4: 在浏览器完成综合测评验收**

打开 `http://127.0.0.1:4286/#assessment/comprehensive`，完成以下检查：

- 地图和五关节点正常显示。
- 第一关能进入，开场对话每次点击推进一句。
- 第一题出现后，单选、判断即时提交，多选显式提交保持原行为。
- 完成五题后进入原结尾并返回地图。
- 下一关正常进入，页面不显示新增分数、等级、能力值或报告。
- 返回 TEST 后重新进入综合测评，能够开始新的临时会话。
- 客观题测评仍可进入原题目页面，未出现综合自适应错误。
- 浏览器控制台没有新增错误或 React 警告。

- [ ] **Step 5: 检查变更范围和工作区**

Run: `git diff main...HEAD --check && git status --short`

Expected: diff check has no errors; status is clean after any required fix commit.

---

### Task 5: 推送分支并创建 Pull Request

**Files:**
- No file changes expected.

**Interfaces:**
- Consumes: 已完整验证的 `feat/comprehensive-adaptive-questions` 分支。
- Produces: 指向 `charlotte901/aiquos` 的公开 Pull Request URL。

- [ ] **Step 1: 确认 GitHub CLI 登录和远端**

Run: `gh auth status`

Expected: authenticated account with permission to push or open a PR for `charlotte901/aiquos`.

Run: `git remote -v`

Expected: `origin` points to `https://github.com/charlotte901/aiquos.git`.

- [ ] **Step 2: 推送功能分支**

Run: `git push -u origin feat/comprehensive-adaptive-questions`

Expected: branch is created or updated on `origin` and local upstream is set.

- [ ] **Step 3: 创建 Pull Request**

Run:

```bash
gh pr create \
  --repo charlotte901/aiquos \
  --base main \
  --head feat/comprehensive-adaptive-questions \
  --title "Add adaptive question selection to comprehensive assessment" \
  --body "## Summary
- select comprehensive questions one at a time using cross-stage adaptive routing
- balance difficulty, ability-dimension coverage, question types, and repeat exposure
- keep the feature local to comprehensive assessment without adding scores or reports

## Verification
- node --test tests/*.test.mjs
- npm run build
- npm run test:sites
- browser walkthrough of comprehensive and objective assessment flows"
```

Expected: GitHub returns a new Pull Request URL targeting `main`.

- [ ] **Step 4: 核对 Pull Request 状态**

Run: `gh pr view --repo charlotte901/aiquos --json url,title,baseRefName,headRefName,state`

Expected: `state` is `OPEN`, base is `main`, head is `feat/comprehensive-adaptive-questions`, and the title matches the created PR.
