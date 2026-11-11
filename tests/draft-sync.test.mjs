// 草稿服务端同步的验收：worker 端点（鉴权/回环/体积上限/清除）、
// mergeDraftChoice 取新策略、saveAttemptDraft 的 savedAt 戳与监听器。
import test from "node:test";
import assert from "node:assert/strict";
import { handleDataDraft } from "../worker/data.js";
import { handleAuthRegister } from "../worker/auth.js";
import { setAccountPersistence } from "../worker/account-store.js";
import { setSharedDataPersistence } from "../worker/data-store.js";
import { mergeDraftChoice } from "../src/draft-sync.js";

function freshStores() {
  setAccountPersistence(null);
  setSharedDataPersistence(null);
}

async function registeredToken(account = "13800139001") {
  const response = await handleAuthRegister(new Request("https://example.test/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password: "aiquos2026play", nickname: "小草", role: "student" }),
  }));
  assert.equal(response.status, 201);
  return (await response.json()).token;
}

const draftRequest = (method, token, body) => new Request("https://example.test/api/data/draft", {
  method,
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test("draft endpoints require authentication", async () => {
  freshStores();
  for (const method of ["GET", "PUT", "DELETE"]) {
    const response = await handleDataDraft(draftRequest(method, null, method === "PUT" ? { draft: {} } : undefined));
    assert.equal(response.status, 401, `${method} 未带令牌必须 401`);
  }
});

test("draft round-trips per account and clears", async () => {
  freshStores();
  const token = await registeredToken();

  const empty = await handleDataDraft(draftRequest("GET", token));
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).draft, null);

  const draft = {
    assessmentId: "comprehensive",
    evidence: [{ questionId: "q001", credit: 1 }],
    routing: { position: 1.4 },
    phasesDone: ["conversation"],
    savedAt: "2026-11-09T10:00:00.000Z",
  };
  const put = await handleDataDraft(draftRequest("PUT", token, { draft, savedAt: draft.savedAt }));
  assert.equal(put.status, 200);

  const got = await handleDataDraft(draftRequest("GET", token));
  const payload = await got.json();
  assert.equal(payload.draft.draft.routing.position, 1.4);
  assert.equal(payload.draft.savedAt, draft.savedAt);

  // 另一账号互不可见。
  const otherToken = await registeredToken("13800139002");
  const other = await handleDataDraft(draftRequest("GET", otherToken));
  assert.equal((await other.json()).draft, null);

  const cleared = await handleDataDraft(draftRequest("DELETE", token));
  assert.equal(cleared.status, 200);
  const after = await handleDataDraft(draftRequest("GET", token));
  assert.equal((await after.json()).draft, null);
});

test("oversized or malformed drafts are rejected", async () => {
  freshStores();
  const token = await registeredToken();
  const huge = await handleDataDraft(draftRequest("PUT", token, { draft: { blob: "x".repeat(300_000) } }));
  assert.equal(huge.status, 413);
  const badShape = await handleDataDraft(draftRequest("PUT", token, { savedAt: "x" }));
  assert.equal(badShape.status, 400);
  const wrongMethod = await handleDataDraft(draftRequest("POST", token, {}));
  assert.equal(wrongMethod.status, 405);
});

test("mergeDraftChoice picks the newer draft by savedAt", () => {
  const older = { assessmentId: "comprehensive", savedAt: "2026-11-09T09:00:00.000Z", evidence: [1] };
  const newer = { assessmentId: "comprehensive", savedAt: "2026-11-09T11:00:00.000Z", evidence: [1, 2] };
  assert.equal(mergeDraftChoice(older, newer).source, "server");
  assert.equal(mergeDraftChoice(newer, older).source, "local");
  assert.equal(mergeDraftChoice(null, newer).source, "server");
  assert.equal(mergeDraftChoice(older, null).source, "local");
  assert.equal(mergeDraftChoice(null, null), null);
  // 本地缺 savedAt（旧版本草稿）→ 视为更旧。
  assert.equal(mergeDraftChoice({ evidence: [] }, newer).source, "server");
});

test("saveAttemptDraft stamps savedAt and fires the sync listener", async () => {
  const saved = {};
  globalThis.localStorage = {
    backing: new Map(),
    getItem: (key) => (saved[key] ?? null),
    setItem: (key, value) => { saved[key] = value; },
    removeItem: (key) => { delete saved[key]; },
  };
  const { saveAttemptDraft, setDraftListeners, clearAttemptDraft } = await import("../src/assessment-attempt.js");
  let heard = null;
  setDraftListeners({ onSaved: (draft) => { heard = draft; }, onCleared: () => {} });
  saveAttemptDraft({ assessmentId: "comprehensive", evidence: [] });
  assert.ok(heard, "监听器必须随保存触发");
  assert.ok(Date.parse(heard.savedAt) > 0, "草稿必须带可解析的 savedAt");
  const stored = JSON.parse(saved[Object.keys(saved)[0]]);
  assert.equal(stored.savedAt, heard.savedAt, "localStorage 里的就是同一份带戳草稿");
  let cleared = false;
  setDraftListeners({ onSaved: null, onCleared: () => { cleared = true; } });
  clearAttemptDraft();
  assert.ok(cleared, "清除也要通知监听器（服务端草稿随之清）");
  setDraftListeners({});
  delete globalThis.localStorage;
});
