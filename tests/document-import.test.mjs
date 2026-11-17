import assert from 'node:assert/strict';
import test from 'node:test';
import { handleDocumentImport, documentText, parseImportedQuestions, createDocumentClient } from '../worker/document-import.js';

const env = { ALIYUN_ACCESS_KEY_ID: 'test', ALIYUN_ACCESS_KEY_SECRET: 'test', DEEPSEEK_API_KEY: 'test' };
const verify = async () => ({ record: { role: 'teacher', accountId: 'teacher-1' } });
const draft = { q: '如何核对 AI 输出？', type: 'single', options: [{ key: 'A', text: '查证来源' }, { key: 'B', text: '直接采信' }], answer: [] };
class Model { constructor(value) { Object.assign(this, value); } }
let sequence = 0;
function fixture() {
  const id = `job-test-${++sequence}`;
  const calls = { submit: 0, status: 0, chat: 0 };
  const cloud = async () => ({ sdk: { SubmitDocParserJobAdvanceRequest: Model, QueryDocParserStatusRequest: Model, GetDocParserResultRequest: Model },
    client: {
      submitDocParserJobAdvance: async () => { calls.submit++; return { body: { data: { id } } }; },
      queryDocParserStatus: async () => { calls.status++; return { body: { data: { status: 'success' } } }; },
      getDocParserResult: async () => ({ body: { data: { layouts: [{ text: '如何核对 AI 输出？ A 查证来源 B 直接采信' }] } } }),
    } });
  const chat = async () => { calls.chat++; await new Promise(r => setTimeout(r, 15)); return new Response(JSON.stringify({ message: JSON.stringify({ questions: [draft] }) })); };
  return { id, calls, deps: { verify, cloud, chat } };
}
const upload = () => {
  const form = new FormData(); form.append('file', new Blob(['%PDF-1.4']), 'test.pdf');
  return new Request('http://test', { method: 'POST', body: form });
};
const poll = id => new Request('http://test', { method: 'POST', body: JSON.stringify({ jobId: id }) });

test('document extraction preserves repeated options and rejects malformed model drafts', () => {
  assert.equal(documentText({ layouts: [{ text: 'A' }, { text: 'A' }, { children: [{ text: 'B' }] }] }), 'A\nA\nB');
  assert.deepEqual(parseImportedQuestions(JSON.stringify({ questions: [draft] }))[0].answer, []);
  for (const invalid of [[], [null], [{ ...draft, options: [null, null] }], [{ ...draft, answer: ['unknown'] }]]) {
    assert.throws(() => parseImportedQuestions(JSON.stringify({ questions: invalid })));
  }
});
test('import requires management role and configuration before contacting cloud', async () => {
  assert.equal((await handleDocumentImport(upload(), env, { verify: async () => null })).status, 401);
  assert.equal((await handleDocumentImport(upload(), env, { verify: async () => ({ record: { role: 'student' } }) })).status, 403);
  assert.equal((await handleDocumentImport(upload(), {}, { verify })).status, 503);
  assert.equal((await handleDocumentImport(upload(), { ...env, DEEPSEEK_API_KEY: '' }, { verify })).status, 503);
});
test('task belongs to uploader; concurrent polls share one extraction and preserve missing answers', async () => {
  const { id, calls, deps } = fixture();
  const submitted = await handleDocumentImport(upload(), env, deps);
  assert.equal((await submitted.json()).jobId, id);
  assert.equal((await handleDocumentImport(poll(id), env, { ...deps, verify: async () => ({ record: { role: 'teacher', accountId: 'other' } }) })).status, 404);
  const results = await Promise.all([handleDocumentImport(poll(id), env, deps), handleDocumentImport(poll(id), env, deps)]);
  for (const result of results) assert.deepEqual((await result.json()).questions[0].answer, []);
  await handleDocumentImport(poll(id), env, deps);
  assert.deepEqual(calls, { submit: 1, status: 1, chat: 1 });
});
test('streamed upload without Content-Length stops at size limit before provider access', async () => {
  const { calls, deps } = fixture();
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024)); }, cancel() { cancelled = true; } });
  const request = new Request('http://test', { method: 'POST', duplex: 'half', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body });
  assert.equal((await handleDocumentImport(request, env, deps)).status, 413);
  assert.equal(cancelled, true);
  assert.equal(calls.submit, 0);
});
test('invalid upload and polling inputs fail without provider access', async () => {
  const { calls, deps } = fixture();
  const form = new FormData(); form.append('file', new Blob(['x']), 'x.exe');
  assert.equal((await handleDocumentImport(new Request('http://test', { method: 'POST', body: form }), env, deps)).status, 400);
  assert.equal((await handleDocumentImport(new Request('http://test', { method: 'POST', body: '{broken' }), env, deps)).status, 400);
  assert.equal((await handleDocumentImport(new Request('http://test', { method: 'POST', body: '{}' }), env, deps)).status, 400);
  assert.equal(calls.submit, 0);
});
test('installed official SDK exposes all configured methods without a network request', async () => {
  const { client } = await createDocumentClient(env);
  assert.equal(typeof client.submitDocParserJobAdvance, 'function');
  assert.equal(typeof client.queryDocParserStatusWithOptions, 'function');
  assert.equal(typeof client.getDocParserResultWithOptions, 'function');
});
