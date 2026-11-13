import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { filePersistence } from "./file-persistence.js";

/** 首次启动导入随源码分发的班级；已有站点的数据绝不被种子覆盖。 */
export function bootstrapInitialCohort(accountPath, dataPath, fixturePath) {
  const hasAccounts = existsSync(accountPath), hasData = existsSync(dataPath);
  if (hasAccounts && hasData) return false;
  if (hasAccounts || hasData) throw new Error("账号库与班级库不完整，请恢复缺失的数据文件后启动，避免覆盖已有账号");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  if (!Array.isArray(fixture.accounts) || !fixture.data || fixture.accounts.length !== 81
    || fixture.data.classes?.length !== 2 || fixture.data.runs?.length !== 320) {
    throw new Error("初始班级数据不完整");
  }
  // 签名密钥由每台服务独立生成，不随源码分享。
  filePersistence(accountPath).save(JSON.stringify({ secret: randomBytes(32).toString("base64url"), accounts: fixture.accounts }, null, 2));
  filePersistence(dataPath).save(JSON.stringify(fixture.data, null, 2));
  return true;
}
