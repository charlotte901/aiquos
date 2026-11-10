// 存储层验收：原子写语义 + AIQUOS_DATA_DIR 生产接线的跨「重启」持久化。
//
// 重启模拟：Node 对带不同 query 的 URL 动态 import 会生成**全新的模块图**
// （独立模块实例），等价于新进程加载同一份代码；同一 AIQUOS_DATA_DIR 下
// 第二个实例必须读到第一个实例写入的账号与草稿。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtomicJsonFileStore, ensureFilePersistence, filePersistenceAdapters } from "../worker/storage.js";

const jsonBody = (payload) => JSON.stringify(payload);

function fakeFs(files = new Map()) {
  return {
    files,
    readFileSync: (path, encoding) => {
      if (!files.has(path)) { const error = new Error("ENOENT"); error.code = "ENOENT"; throw error; }
      return files.get(path);
    },
    writeFileSync: (path, text) => files.set(path, text),
    renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    unlinkSync: (path) => { if (!files.delete(path)) throw new Error("ENOENT"); },
    mkdirSync: () => {},
  };
}

test("atomic store writes tmp then renames, never a partial target", () => {
  const fs = fakeFs();
  const store = createAtomicJsonFileStore(fs, "/data/state.json");
  assert.equal(store.load(), null, "无文件 → null");

  store.save('{"a":1}');
  assert.deepEqual([...fs.files.keys()], ["/data/state.json"], "tmp 文件必须被 rename 吃掉");
  assert.equal(store.load(), '{"a":1}');

  store.save('{"a":2}');
  assert.equal(store.load(), '{"a":2}');
  store.remove();
  assert.equal(store.load(), null);
  store.remove(); // 幂等删除
});

test("adapters expose the three store contracts", () => {
  const fs = fakeFs();
  const adapters = filePersistenceAdapters(fs, (dir, name) => `${dir}/${name}`, "/d");
  adapters.account.save("{}");
  adapters.shared.save("{}");
  adapters.bank.save("{}", "A");
  adapters.bank.save("{}", "B");
  assert.deepEqual([...fs.files.keys()].sort(), [
    "/d/aiquos-shared-data.json",
    "/d/auth-accounts.json",
    "/d/bank-overrides-full.json",
    "/d/bank-overrides.json",
  ]);
  adapters.bank.clear("A");
  assert.equal(adapters.bank.load("A"), null);
  assert.equal(adapters.bank.load("B"), "{}");
});

test("ensureFilePersistence skips silently without the env var or fs", async () => {
  let injected = false;
  assert.equal(await ensureFilePersistence({}, () => { injected = true; }), false);
  assert.equal(injected, false);
});

test("worker persists accounts and drafts across a simulated restart (AIQUOS_DATA_DIR)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aiquos-store-"));
  const assets = { fetch: async () => new Response("missing", { status: 404 }) };
  const body = (payload) => JSON.stringify(payload);
  try {
    // 实例 1（首次启动）：注册 + 写草稿。
    const first = (await import(`../worker/index.js?instance=first-${Date.now()}`)).default;
    const env = { AIQUOS_DATA_DIR: dir, ASSETS: assets };
    const register = await first.fetch(new Request("https://example.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: jsonBody({ account: "13800139777", password: "aiquos2026play", nickname: "重启测试", role: "student" }),
    }), env);
    assert.equal(register.status, 201);
    const token = (await register.json()).token;

    const putDraft = await first.fetch(new Request("https://example.test/api/data/draft", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: jsonBody({ draft: { assessmentId: "comprehensive", evidence: [{ questionId: "q001", credit: 1 }], phasesDone: ["conversation"] }, savedAt: "2026-11-09T12:00:00.000Z" }),
    }), env);
    assert.equal(putDraft.status, 200);

    // 目录里确实落了盘（原子写不留 tmp 残骸）。
    const files = readdirSync(dir);
    assert.ok(files.includes("auth-accounts.json"), `auth-accounts.json 落盘: ${files}`);
    assert.ok(files.includes("aiquos-shared-data.json"));
    assert.ok(files.every((name) => !name.includes(".tmp-")), "不得残留 tmp 文件");

    // 实例 2（重启）：全新模块图必须读到实例 1 的数据。
    const second = (await import(`../worker/index.js?instance=second-${Date.now()}`)).default;
    const login = await second.fetch(new Request("https://example.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: jsonBody({ account: "13800139777", password: "aiquos2026play" }),
    }), env);
    assert.equal(login.status, 200, "重启后原账号可登录（签名密钥随文件存活）");
    const token2 = (await login.json()).token;

    const getDraft = await second.fetch(new Request("https://example.test/api/data/draft", {
      headers: { authorization: `Bearer ${token2}` },
    }), env);
    assert.equal(getDraft.status, 200);
    const draft = (await getDraft.json()).draft;
    assert.equal(draft.draft.phasesDone[0], "conversation", "重启后草稿仍在");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a truncated (crashed-mid-write legacy) file degrades to a fresh store, not a crash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aiquos-store-bad-"));
  try {
    writeFileSync(join(dir, "auth-accounts.json"), '{"secret": "trunc'); // 旧实现写一半崩溃的现场
    const assets = { fetch: async () => new Response("missing", { status: 404 }) };
    const worker = (await import(`../worker/index.js?instance=badfile-${Date.now()}`)).default;
    const env = { AIQUOS_DATA_DIR: dir, ASSETS: assets };
    const register = await worker.fetch(new Request("https://example.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: jsonBody({ account: "13800139888", password: "aiquos2026play", nickname: "坏档", role: "student" }),
    }), env);
    assert.equal(register.status, 201, "损坏存档按空库处理，注册照常可用");
    // 且坏档被新写入覆盖为合法 JSON。
    assert.ok(JSON.parse(readFileSync(join(dir, "auth-accounts.json"), "utf8")).secret);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
