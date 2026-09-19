import { useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  MagnifyingGlass,
  PencilSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { DIMENSIONS } from "../../../vendor/aiquos-six-dimension-scoring/scripts/scoring-core.mjs";
import { saveBank, resetBankToBundled } from "../api.js";
import { bankAudit } from "../stats.js";

const LEVEL_LABELS = { academy: "智核学院", labyrinth: "信息迷城", workshop: "创客工坊", station: "协同空间站", court: "伦理殿堂" };
const DIFFICULTY_LABELS = { low: "低", medium: "中", high: "高" };
const TYPE_LABELS = { single: "单选", multi: "多选", judge: "判断" };
const PAGE_SIZE = 10;

function EditDialog({ question, questions, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => structuredClone(question));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const updateOption = (index, text) => {
    const options = draft.options.map((option, optionIndex) => (optionIndex === index ? { ...option, text } : option));
    update({ options });
  };
  const toggleAnswer = (key) => {
    const answer = draft.answer.includes(key)
      ? draft.answer.filter((item) => item !== key)
      : [...draft.answer, key].sort();
    update({ answer });
  };
  const toggleDim = (key) => {
    const dimKeys = draft.dimKeys.includes(key)
      ? draft.dimKeys.filter((item) => item !== key)
      : [...draft.dimKeys, key];
    update({ dimKeys });
  };

  const validate = () => {
    if (!draft.q.trim()) return "题干不能为空";
    if (draft.options.some((option) => !option.text.trim())) return "选项文本不能为空";
    if (draft.answer.length === 0) return "至少选择一个正确答案";
    if (draft.type !== "multi" && draft.answer.length > 1) return "单选与判断题只能有一个答案";
    if (draft.dimKeys.length === 0) return "至少关联一个维度";
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const nextQuestions = questions.map((item) => (item.id === draft.id ? draft : item));
      const state = await saveBank(nextQuestions);
      onSaved(state);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="edit-dialog" role="dialog" aria-modal="true" aria-label={`编辑题目 ${question.id}`}>
        <header>
          <div>
            <h2>编辑题目</h2>
            <p>{question.id} · 保存后将发布新题库版本，学生端下一次出题即生效</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭编辑"><X size={18} weight="bold" /></button>
        </header>
        <div className="edit-body">
          <label className="edit-field">
            <span>题干</span>
            <textarea rows={3} value={draft.q} onChange={(event) => update({ q: event.target.value })} />
          </label>
          <div className="edit-row">
            <label>
              <span>关卡</span>
              <select value={draft.levelId} onChange={(event) => update({ levelId: event.target.value })}>
                {Object.entries(LEVEL_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>难度</span>
              <select value={draft.difficulty} onChange={(event) => update({ difficulty: event.target.value })}>
                {Object.entries(DIFFICULTY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>题型</span>
              <select value={draft.type} onChange={(event) => update({ type: event.target.value, answer: [draft.answer[0]] })}>
                {Object.entries(TYPE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="edit-options">
            <legend>选项与正确答案{draft.type === "multi" ? "（多选，勾选全部正确项）" : "（勾选唯一正确项）"}</legend>
            {draft.options.map((option, index) => (
              <div key={option.key} className="edit-option">
                <label className={`answer-pick ${draft.answer.includes(option.key) ? "is-on" : ""}`}>
                  <input
                    type={draft.type === "multi" ? "checkbox" : "radio"}
                    name={`answer-${question.id}`}
                    checked={draft.answer.includes(option.key)}
                    onChange={() => toggleAnswer(option.key)}
                  />
                  <b>{option.key}</b>
                </label>
                <input value={option.text} onChange={(event) => updateOption(index, event.target.value)} aria-label={`选项 ${option.key} 文本`} />
              </div>
            ))}
          </fieldset>
          <label className="edit-field">
            <span>解析</span>
            <textarea rows={2} value={draft.analysis} onChange={(event) => update({ analysis: event.target.value })} />
          </label>
          <fieldset className="edit-dims">
            <legend>考察维度（已选 {draft.dimKeys.length} 项）</legend>
            {DIMENSIONS.map((dimension) => (
              <label key={dimension.key} className={draft.dimKeys.includes(dimension.key) ? "is-on" : ""}>
                <input
                  type="checkbox"
                  checked={draft.dimKeys.includes(dimension.key)}
                  onChange={() => toggleDim(dimension.key)}
                />
                {dimension.short} · {dimension.name}
              </label>
            ))}
          </fieldset>
          {error && <p className="edit-error" role="alert"><WarningCircle size={15} weight="fill" /> {error}</p>}
        </div>
        <footer>
          <span>保存即发布：题库版本自动晋升，进行中的学生草稿将按新版本续跑。</span>
          <div>
            <button type="button" className="is-ghost" onClick={onClose} disabled={saving}>取消</button>
            <button type="button" onClick={save} disabled={saving}>{saving ? "正在保存…" : "保存并发布"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function BankView({ bankState, status, error, onReload, onNotice }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(false);

  const audit = useMemo(() => (bankState ? bankAudit(bankState.questions) : null), [bankState]);
  const filtered = useMemo(() => {
    if (!bankState) return [];
    return bankState.questions.filter((question) => {
      if (level !== "all" && question.levelId !== level) return false;
      if (difficulty !== "all" && question.difficulty !== difficulty) return false;
      if (type !== "all" && question.type !== type) return false;
      if (!query.trim()) return true;
      const needle = query.trim();
      return question.q.includes(needle) || question.id.includes(needle);
    });
  }, [bankState, query, level, difficulty, type]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const reset = async () => {
    if (!window.confirm("确认放弃全部管理端修改，恢复内置题库？")) return;
    setResetting(true);
    try {
      await resetBankToBundled();
      await onReload();
      onNotice("已恢复内置题库");
    } catch (resetError) {
      onNotice(resetError.message);
    } finally {
      setResetting(false);
    }
  };

  if (status === "loading") {
    return <div className="empty-state"><span className="spinner" aria-hidden="true" /> <strong>正在读取题库…</strong></div>;
  }
  if (status === "error") {
    return (
      <div className="empty-state is-error">
        <strong>题库读取失败</strong>
        <p>{error}</p>
        <button type="button" onClick={onReload}>重新加载</button>
      </div>
    );
  }

  return (
    <div className="admin-view">
      {audit && (
        <section className="audit-panel" aria-label="题库体检">
          <div className="audit-stats">
            <div><span>题目总数</span><b>{audit.total}</b></div>
            <div><span>关卡覆盖</span><b>{Object.keys(audit.levels).length} 关</b></div>
            <div><span>难度均衡</span><b>{audit.byDifficulty.low} 低 / {audit.byDifficulty.medium} 中 / {audit.byDifficulty.high} 高</b></div>
            <div><span>题型分布</span><b>{audit.byType.single} 单选 / {audit.byType.judge} 判断 / {audit.byType.multi} 多选</b></div>
          </div>
          {audit.warnings.length > 0 ? (
            <ul className="audit-warnings">
              {audit.warnings.map((warning) => <li key={warning}><WarningCircle size={14} weight="fill" /> {warning}</li>)}
            </ul>
          ) : (
            <p className="audit-ok"><CheckCircle size={14} weight="fill" /> 题库体检通过：难度、维度与关卡覆盖满足自适应出题与完成判定要求。</p>
          )}
        </section>
      )}

      <div className="toolbar">
        <label className="search-box">
          <MagnifyingGlass size={16} />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="搜索题干或题目 id" />
        </label>
        <select value={level} onChange={(event) => { setLevel(event.target.value); setPage(0); }} aria-label="按关卡筛选">
          <option value="all">全部关卡</option>
          {Object.entries(LEVEL_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setPage(0); }} aria-label="按难度筛选">
          <option value="all">全部难度</option>
          {Object.entries(DIFFICULTY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={type} onChange={(event) => { setType(event.target.value); setPage(0); }} aria-label="按题型筛选">
          <option value="all">全部题型</option>
          {Object.entries(TYPE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <span className="toolbar-count">{filtered.length} 题</span>
        <button type="button" className="is-ghost toolbar-reset" onClick={reset} disabled={resetting || bankState.source === "bundled"}>
          <ArrowCounterClockwise size={15} weight="bold" /> 恢复内置题库
        </button>
      </div>

      <table className="admin-table is-hover">
        <thead>
          <tr><th>id</th><th>题干</th><th>关卡</th><th>难度</th><th>题型</th><th>维度</th><th>操作</th></tr>
        </thead>
        <tbody>
          {pageItems.map((question) => (
            <tr key={question.id}>
              <td className="is-mono">{question.id}</td>
              <td className="is-title">{question.q}</td>
              <td>{LEVEL_LABELS[question.levelId] ?? question.levelId}</td>
              <td>{DIFFICULTY_LABELS[question.difficulty]}</td>
              <td>{TYPE_LABELS[question.type]}</td>
              <td className="is-dims">{question.dimKeys.join(" · ")}</td>
              <td>
                <button type="button" className="row-edit" onClick={() => setEditing(question)}>
                  <PencilSimple size={14} weight="bold" /> 编辑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pager">
        <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>上一页</button>
        <span>第 {safePage + 1} / {pageCount} 页</span>
        <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>下一页</button>
      </div>

      {editing && (
        <EditDialog
          question={editing}
          questions={bankState.questions}
          onClose={() => setEditing(null)}
          onSaved={(state) => {
            setEditing(null);
            onReload();
            onNotice(`已发布 ${state.bankVersion}，学生端下一次出题生效`);
          }}
        />
      )}
    </div>
  );
}
