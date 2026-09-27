import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isSubmitEnter, onEnterSubmit } from "../src/ime.js";

const makeEvent = (overrides = {}) => ({
  key: "Enter",
  keyCode: 13,
  isComposing: false,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  nativeEvent: { isComposing: false },
  preventDefault() { this.defaultPrevented = true; },
  defaultPrevented: false,
  ...overrides,
});

test("a plain Enter is a submit", () => {
  assert.equal(isSubmitEnter(makeEvent()), true);
});

test("Enter during IME composition is never a submit", () => {
  // The three signals browsers expose while a candidate list is open.
  assert.equal(isSubmitEnter(makeEvent({ isComposing: true })), false);
  assert.equal(isSubmitEnter(makeEvent({ nativeEvent: { isComposing: true } })), false);
  assert.equal(isSubmitEnter(makeEvent({ keyCode: 229 })), false);
});

test("non-Enter keys are ignored", () => {
  assert.equal(isSubmitEnter(makeEvent({ key: "a" })), false);
  assert.equal(isSubmitEnter(makeEvent({ key: "Process" })), false);
});

test("onEnterSubmit calls the action once and prevents the default", () => {
  let calls = 0;
  const handler = onEnterSubmit(() => { calls += 1; });
  const confirmWord = makeEvent({ isComposing: true, keyCode: 229 });
  handler(confirmWord);
  assert.equal(calls, 0, "confirming an IME candidate must not submit");
  assert.equal(confirmWord.defaultPrevented, false, "the IME must get its default behaviour");

  const submit = makeEvent();
  handler(submit);
  assert.equal(calls, 1);
  assert.equal(submit.defaultPrevented, true);
});

test("Shift+Enter inserts a newline instead of submitting", () => {
  let calls = 0;
  const handler = onEnterSubmit(() => { calls += 1; });
  handler(makeEvent({ shiftKey: true }));
  assert.equal(calls, 0);
});

test("withMeta requires Cmd/Ctrl+Enter", () => {
  let calls = 0;
  const handler = onEnterSubmit(() => { calls += 1; }, { withMeta: true });
  handler(makeEvent());
  assert.equal(calls, 0, "a bare Enter in a textarea must stay a newline");
  handler(makeEvent({ metaKey: true }));
  handler(makeEvent({ ctrlKey: true }));
  assert.equal(calls, 2);
});

test("the `when` gate can suppress submission", () => {
  let calls = 0;
  const handler = onEnterSubmit(() => { calls += 1; }, { when: () => false });
  const event = makeEvent();
  handler(event);
  assert.equal(calls, 0);
  assert.equal(event.defaultPrevented, false, "a gated Enter keeps its default behaviour");
});

test("every text-submitting input in the app uses the IME-safe handler", async () => {
  // Only files with element-level text-field key handlers need the helper.
  const files = ["../src/AssessmentFlow.jsx", "../src/ForumBoard.jsx"];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /from "\.\/ime"/, `${file} must import the IME helper`);
    // The bug pattern is a raw `key === "Enter"` inside an onKeyDown prop on a
    // text field. A window-level key handler is legitimate (it drives A–D
    // answering) as long as it ignores events originating in an input, so the
    // check targets the JSX prop form plus the global-handler guard.
    // Activation handlers on role="button" dialogue layers legitimately accept
    // Enter/Space (keyboard accessibility, no IME ambiguity); only element-level
    // handlers on real text fields are the bug. Text fields are identified by
    // proximity to a value/onChange prop in the same JSX element.
    const rawPropHandlers = [...source.matchAll(/onKeyDown=\{\(?e?vent\)? =>[^}]*key === "Enter"/g)];
    assert.deepEqual(
      rawPropHandlers.map((m) => m[0]).filter((snippet) => /value=|onChange=/.test(snippet)),
      [],
      `${file} still has a raw Enter handler on a text field`,
    );
  }

  // The objective quiz listens on window for A–D answering; it must stand down
  // whenever the event comes from a text field (or an IME composition).
  const quiz = await readFile(new URL("../src/AssessmentFlow.jsx", import.meta.url), "utf8");
  assert.match(quiz, /tag === "INPUT" \|\| tag === "TEXTAREA"/, "global key handler must ignore inputs");
  assert.match(quiz, /event\.isComposing \|\| event\.keyCode === 229/, "global key handler must ignore IME composition");
});
