/** 停止 dev 服务后运行；保留已有账号、幂等生成两个 40 人仿真班级。 */
import { exportInitialCohort } from "./export-initial-cohort.mjs";
import { fileURLToPath } from "node:url";
import { setAccountPersistence, createAccount, findAccountByLogin, verifyLogin } from "../worker/account-store.js";
import { filePersistence } from "../worker/file-persistence.js";
import { setSharedDataPersistence, createClass, createAssignment, changeClass, reportRun, teacherData, studentSummary } from "../worker/data-store.js";
import { DIMENSIONS, gradeOverall } from "../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";

// 与正在运行的服务同时写文件会覆盖其内存中的数据，必须先停止服务。
if (!process.argv.includes("--server-stopped")) throw new Error("请先停止网站服务，再加 --server-stopped 运行");
const root = new URL("../", import.meta.url);
setAccountPersistence(filePersistence(fileURLToPath(new URL("worker/auth-accounts.json", root))));
setSharedDataPersistence(filePersistence(fileURLToPath(new URL("worker/aiquos-shared-data.json", root))));
const TEACHER_PASSWORD = "Teacher2026Demo";
const STUDENT_PASSWORD = "Student2026Demo";
const groups = [
  { name: "AI 应用仿真 1 班", code: "AI2026V1", teacher: "virtual.teacher1@aiquos.local", nickname: "陈老师", prefix: "v1" },
  { name: "AI 应用仿真 2 班", code: "AI2026V2", teacher: "virtual.teacher1@aiquos.local", nickname: "陈老师", prefix: "v2" },
];
const surnames = ["陈", "林", "周", "李", "王", "张", "刘", "赵", "黄", "吴", "徐", "孙", "胡", "朱", "高", "何", "郭", "罗", "郑", "梁"];
const given = ["子涵", "雨桐", "思远", "明轩", "可欣", "一帆", "嘉宁", "书瑶", "清越", "星野", "宇航", "若曦", "欣怡", "亦辰", "安然", "景行", "知遥", "沐晴", "浩然", "梓萱"];
const types = ["conversation", "objective", "practical", "comprehensive"];
let seed = 20261004;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const round = (n) => Math.round(n * 10) / 10;
const clamp = (n) => round(Math.max(32, Math.min(98, n)));
async function account(input) {
  const existing = findAccountByLogin(input.account);
  if (existing) {
    if (existing.role !== input.role || !(await verifyLogin(input.account, input.password)).ok) throw new Error(`种子账号冲突：${input.account}`);
    return existing;
  }
  const result = await createAccount(input);
  if (!result.record) throw new Error(`${input.account}: ${result.error}`);
  return result.record;
}
const info = [];
// 旧版两个教师的种子班级迁至同一教师，保留班级/作业/记录 ID 和已注册账号。
const sharedFile = filePersistence(fileURLToPath(new URL("worker/aiquos-shared-data.json", root)));
const owner = await account({ account: groups[0].teacher, password: TEACHER_PASSWORD, role: "teacher", nickname: groups[0].nickname });
const sharedRaw = sharedFile.load();
if (sharedRaw) {
  const shared = JSON.parse(sharedRaw);
  for (const group of groups) {
    const classroom = shared.classes?.find((item) => item.name === group.name && item.code === group.code);
    if (!classroom || classroom.teacherAccountId === owner.accountId) continue;
    const previous = findAccountByLogin("virtual.teacher2@aiquos.local");
    if (!previous || classroom.teacherAccountId !== previous.accountId) throw new Error("班级归属与预期不符，停止迁移");
    classroom.teacherAccountId = owner.accountId;
    for (const assignment of shared.assignments || []) {
      if (assignment.createdByAccountId === previous.accountId && assignment.scope?.classNames?.includes(group.name)) {
        assignment.createdByAccountId = owner.accountId;
        assignment.createdByName = owner.nickname;
      }
    }
  }
  for (const assignment of shared.assignments || []) {
    if (assignment.createdByAccountId === owner.accountId && groups.some((group) => assignment.title === `${group.name} · 综合能力摸底（模拟）`)) {
      assignment.title = assignment.title.replace("（模拟）", "");
      assignment.note = "用于班级综合能力摸底与师生数据同步。";
    }
  }
  sharedFile.save(JSON.stringify(shared, null, 2));
  setSharedDataPersistence(sharedFile);
}
for (const [groupIndex, group] of groups.entries()) {
  const teacher = await account({ account: group.teacher, password: TEACHER_PASSWORD, role: "teacher", nickname: group.nickname });
  const created = createClass(teacher, { name: group.name, code: group.code, term: "2026 秋季" });
  if (created.error) throw new Error(created.error);
  const title = `${group.name} · 综合能力摸底`;
  let assignment = teacherData(teacher).assignments.find((item) => item.title === title);
  if (!assignment) {
    const result = createAssignment(teacher, { title, edition: "B", scope: { classNames: [group.name] }, note: "用于班级综合能力摸底与师生数据同步。" });
    if (result.error) throw new Error(result.error);
    assignment = result.assignment;
  }
  for (let index = 0; index < 40; index++) {
    const studentAccount = `${group.prefix}.student${String(index + 1).padStart(2, "0")}@aiquos.local`;
    const nickname = surnames[(index + groupIndex * 7) % 20] + given[(index * 3 + Math.floor(index / 20) + groupIndex * 5) % 20];
    const student = await account({ account: studentAccount, password: STUDENT_PASSWORD, role: "student", nickname, className: group.name });
    const joined = changeClass(student, group.code);
    if (joined.error) throw new Error(joined.error);
    const ability = 48 + random() * 43;
    const tilt = DIMENSIONS.map(() => (random() - 0.5) * 18);
    const channelDims = {};
    for (const [typeIndex, assessmentId] of types.entries()) {
      const scores = assessmentId === "comprehensive"
        ? DIMENSIONS.map((_, i) => clamp(channelDims.objective[i] * 0.6 + channelDims.conversation[i] * 0.25 + channelDims.practical[i] * 0.15))
        : DIMENSIONS.map((_, i) => clamp(ability + tilt[i] + (random() - 0.5) * 15 + (assessmentId === "conversation" ? 5 : assessmentId === "practical" ? -3 : 0)));
      channelDims[assessmentId] = scores;
      const overallScore = round(scores.reduce((a, b) => a + b, 0) / 6);
      const completedAt = new Date(Date.UTC(2026, 9, 4, 0, 10) - (39 - index) * 3600000 - (3 - typeIndex) * 86400000 - groupIndex * 1200000).toISOString();
      const duration = assessmentId === "comprehensive" ? 18 : 5;
      const count = assessmentId === "conversation" ? 6 : assessmentId === "practical" ? 1 : 22 + (index % 9);
      const result = reportRun(student, { assessmentId, simulated: true, completedAt,
        startedAt: new Date(Date.parse(completedAt) - duration * 60000).toISOString(),
        overallScore, grade: gradeOverall(overallScore),
        dimensions: DIMENSIONS.map((dimension, i) => ({ ...dimension, score: scores[i] })),
        answeredCount: count, totalQuestions: count,
        assignmentId: assessmentId === "comprehensive" ? assignment.id : null,
        bankVersion: "simulation-v1", scoringVersion: "simulation-v1",
        channels: assessmentId === "comprehensive" ? {
          objective: round(channelDims.objective.reduce((a, b) => a + b) / 6),
          interview: round(channelDims.conversation.reduce((a, b) => a + b) / 6),
          practical: round(channelDims.practical.reduce((a, b) => a + b) / 6),
        } : null,
      });
      if (result.error) throw new Error(result.error);
    }
    const summary = studentSummary(student);
    if (summary.classStats.studentCount < index + 1 || summary.runs.length !== 4) throw new Error("仿真数据校验失败");
  }
  const overview = teacherData(teacher);
  const classmates = overview.students.filter((student) => student.className === group.name);
  const ids = new Set(classmates.map((student) => student.accountId));
  info.push({ ...group, students: classmates.length, runs: overview.runs.filter((run) => ids.has(run.accountId)).length,
    average: overview.classDetails.find((item) => item.name === group.name).classAverage, assignment: assignment.title });
}
exportInitialCohort(root);
console.log(JSON.stringify(info, null, 2));
