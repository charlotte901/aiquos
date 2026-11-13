import { readFileSync, writeFileSync } from "node:fs";
import { classRanking } from "../src/class-ranking.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function exportInitialCohort(root = new URL("../", import.meta.url)) {
  const auth = JSON.parse(readFileSync(new URL("worker/auth-accounts.json", root), "utf8"));
  const shared = JSON.parse(readFileSync(new URL("worker/aiquos-shared-data.json", root), "utf8"));
  // 只导出明确创建的 81 个初始账号，不携带其他注册用户、签名密钥或会话。
  const accounts = auth.accounts.filter((item) => item.account === "virtual.teacher1@aiquos.local"
    || /^v[12]\.student(?:0[1-9]|[1-3]\d|40)@aiquos\.local$/.test(item.account));
  const ids = new Set(accounts.map((item) => item.accountId));
  const classes = shared.classes.filter((item) => ["AI2026V1", "AI2026V2"].includes(item.code) && ids.has(item.teacherAccountId));
  const names = new Set(classes.map((item) => item.name));
  const assignments = shared.assignments.filter((item) => ids.has(item.createdByAccountId)
    && item.scope?.classNames?.some((name) => names.has(name)));
  const data = { classes, students: Object.fromEntries(Object.entries(shared.students).filter(([id]) => ids.has(id))),
    runs: shared.runs.filter((item) => ids.has(item.accountId)), assignments, counter: shared.counter };
  if (accounts.length !== 81 || classes.length !== 2 || data.runs.length !== 320) throw new Error("初始数据数量不符，停止导出");
  const fixture = { version: 1, accounts, data };
  writeFileSync(new URL("worker/initial-cohort.json", root), JSON.stringify(fixture, null, 2));
  writeClassRoster(fixture, root);
  return { accounts: accounts.length, classes: classes.length, runs: data.runs.length };
}

function writeClassRoster(fixture, root) {
  const { accounts, data } = fixture;
  const teacher = accounts.find((item) => item.role === "teacher");
  const latestRun = (id, type) => data.runs.filter((run) => run.accountId === id && (!type || run.assessmentId === type))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const groups = data.classes.slice().sort((a, b) => a.code.localeCompare(b.code)).map((classroom) => {
    const students = accounts.filter((item) => item.role === "student" && item.className === classroom.name)
      .sort((a, b) => a.account.localeCompare(b.account));
    const average = classRanking(students, data.runs).classAverage;
    return { classroom, students, average };
  });
  const sections = ["# 两个班级师生信息", "", "本清单包含当前创建的一位教师、两个班级及全部 80 名学生。每位学生已有对话式、客观题、实操、综合四种测评记录，共 320 条。", "",
    "## 教师信息", "", "| 姓名 | 登录账号 | 登录密码 | 账号 ID | 管理班级 |", "|---|---|---|---|---|",
    `| ${teacher.nickname} | ${teacher.account} | Teacher2026Demo | ${teacher.accountId} | ${groups.map((group) => group.classroom.name).join("、")} |`, "",
    "## 班级概览", "", "| 班级 | 学期 | 班级口令 | 人数 | 测评记录数 | 班级平均分 |", "|---|---|---|---:|---:|---:|",
    ...groups.map(({ classroom, students, average }) => `| ${classroom.name} | ${classroom.term} | ${classroom.code} | ${students.length} | ${data.runs.filter((run) => students.some((student) => student.accountId === run.accountId)).length} | ${average} |`), "",
    "全部学生的登录密码均为 `Student2026Demo`。下表列出每名学生的姓名、完整登录账号、登录密码、账号 ID、四种测评成绩和班级排名。分数为 0–100；排名与网站一致，按每人的全部完成记录平均分计算，同分并列。", ""];
  for (const { classroom, students } of groups) {
    sections.push(`## ${classroom.name}（${students.length} 人）`, "", "| 序号 | 姓名 | 登录账号 | 登录密码 | 账号 ID | 对话式 | 客观题 | 实操 | 综合 | 平均分 | 班级排名 |",
      "|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|");
    for (const [index, student] of students.entries()) {
      const results = ["conversation", "objective", "practical", "comprehensive"].map((type) => latestRun(student.accountId, type)?.overallScore ?? "—");
      const ranking = classRanking(students, data.runs, student.accountId);
      const rank = ranking.myRank;
      sections.push(`| ${index + 1} | ${student.nickname} | ${student.account} | Student2026Demo | ${student.accountId} | ${results.join(" | ")} | ${ranking.myAverage} | ${rank} |`);
    }
    sections.push("");
  }
  sections.push("## 登录与页面入口", "", "- 学生端：网站首页；登录后在“我的组织”查看班级，在“测评记录”按日期查看四种成绩。",
    "- 教师端：网站地址加 `/admin.html`；同一教师账号可查看两个班级、80 名学生和 320 条记录。", "",
    "## 分享源码与数据保存", "", "完整源码包含 `worker/initial-cohort.json`。对方安装依赖并运行 `npm run dev` 后，首次启动会自动导入本清单中的师生、班级和成绩；已有服务端账号库、班级库时不会覆盖。每台服务生成独立的签名密钥。",
    "", "分享完整源码和本清单即可，无需附带本机 `.env.local`、`worker/auth-accounts.json`、`worker/aiquos-shared-data.json` 或它们的备份。初始数据仅含本次创建的师生，成绩为生成的初始展示数据，页面不添加来源标签。",
    "", "注册账号、班级和成绩保存在服务端文件，清除浏览器缓存或重启服务不会删除账号。后续新增账号和成绩属于各自运行的服务，不会跨机器自动同步；共享实时数据需访问同一个部署网站。正式上线仍需配置持久数据库或服务端持久磁盘，并迁移数据。",
    "", "服务端文件以临时文件加原子替换方式写入，并保留 `.bak` 备份。备份应同时包含账号库、班级库及有效备份文件。部署入口未配置持久存储时会拒绝账号和班级请求，避免数据只保存在临时内存。",
    "", "维护时先停止网站，再运行 `node scripts/seed-virtual-classes.mjs --server-stopped`，可幂等重建初始班级并更新本清单。`node scripts/export-initial-cohort.mjs` 可从服务端数据更新初始数据与本清单；`node scripts/verify-virtual-classes.mjs` 用于验证师生同步。", "");
  writeFileSync(new URL("docs/两个班级师生信息.md", root), sections.join("\n"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(exportInitialCohort());
}
