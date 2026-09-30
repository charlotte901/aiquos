/**
 * 开发演示数据种子：教师 + 班级学生 + 组卷作业 + 一次完成记录。
 *   node scripts/seed-demo-data.mjs [base]
 *
 * 账号（仅本地 dev，存储于 gitignored 的 worker/auth-accounts.json 与
 * worker/aiquos-shared-data.json）：
 *   教师  teacher1@aiquos.local / teach1234
 *   学生  13800000002 / stud1234（班级「AI 应用 1 班」，已有一份 86.4/A 的完成记录）
 * 已存在同账号时跳过注册（幂等），作业与记录重复执行会追加。
 */
const BASE = process.argv[2] || "http://127.0.0.1:4287";
const INVITE = process.env.AIQUOS_TEACHER_INVITE_CODE || "AIQUOS-TEACHER-2026";

const post = (path, body, token) => fetch(BASE + path, {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

const login = async (account, password) => {
  const response = await post("/api/auth/login", { account, password });
  if (response.ok) return (await response.json()).token;
  const register = await post("/api/auth/register",
    account.includes("@")
      ? { account, password, nickname: "王老师", role: "teacher", teacherInviteCode: INVITE }
      : { account, password, nickname: "小林", className: "AI 应用 1 班" });
  if (!register.ok) throw new Error(`账号 ${account} 注册失败: ${(await register.text()).slice(0, 200)}`);
  return (await register.json()).token;
};

const teacherToken = await login("teacher1@aiquos.local", "teach1234");
const studentToken = await login("13800000002", "stud1234");

const assignmentsResponse = await fetch(`${BASE}/api/data/assignments`, {
  headers: { authorization: `Bearer ${studentToken}` },
});
if (!assignmentsResponse.ok) throw new Error(`读取作业列表失败（${assignmentsResponse.status}）——dev server 是否在运行？`);
const assignments = await assignmentsResponse.json();
let assignment = assignments.assignments.find((item) => item.title.includes("期中"));
if (!assignment) {
  const created = await post("/api/data/assignments", {
    title: "期中 AI 综合能力测评",
    note: "重点考查提示词构建与实操产出，请预留 20 分钟完整作答。",
    edition: "B",
    scope: { classNames: ["AI 应用 1 班"] },
  }, teacherToken);
  if (!created.ok) throw new Error(`作业创建失败: ${(await created.text()).slice(0, 200)}`);
  assignment = (await created.json()).assignment;
}

if (!assignment.myRun) {
  const reported = await post("/api/data/runs", {
    assessmentId: "comprehensive",
    assignmentId: assignment.id,
    completedAt: new Date().toISOString(),
    overallScore: 86.4,
    grade: "A",
    dimensions: [
      { key: "D1", name: "需求定义", short: "需求", score: 85 },
      { key: "D2", name: "提示构建", short: "提示", score: 88 },
      { key: "D3", name: "工具编排", short: "编排", score: 82 },
      { key: "D4", name: "产物评估", short: "评估", score: 87 },
      { key: "D5", name: "迭代优化", short: "迭代", score: 84 },
      { key: "D6", name: "伦理边界", short: "伦理", score: 92 },
    ],
    answeredCount: 25,
    totalQuestions: 25,
    bankVersion: "objective-bank-v6-120",
    channels: { objective: 88, interview: 82, practical: 84 },
  }, studentToken);
  if (!reported.ok) throw new Error(`完成记录上报失败: ${(await reported.text()).slice(0, 200)}`);
}

console.log("演示数据就绪：teacher1@aiquos.local / teach1234 · 13800000002 / stud1234 · 作业「期中 AI 综合能力测评」");
