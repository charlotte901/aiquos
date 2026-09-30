import { useMemo, useState } from "react";
import { CaretDown, CheckCircle, ClockCountdown, Exam, Plus, XCircle } from "@phosphor-icons/react";
import { EDITIONS } from "../../bank-editions";

function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function scopeLabel(assignment) {
  if (assignment.scope?.all) return "全部学员";
  const parts = [];
  if (assignment.scope?.classNames?.length) parts.push(`班级：${assignment.scope.classNames.join("、")}`);
  if (assignment.scope?.studentIds?.length) parts.push(`指定 ${assignment.scope.studentIds.length} 名学员`);
  return parts.join(" · ") || "未指定范围";
}

/**
 * 组卷中心：教师把综合能力测评试卷组卷并推送给学员。
 * 学员端（AssessmentHub 的「老师推送」区）实时收到；学员完成后成绩回到
 * 这里汇总（完成名单 / 平均分），并计入数据概览与学员管理的真实数据。
 */
export function AssignmentsView({ status, error, teacherData, onReload, onCreate, onToggle, onNotice }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [edition, setEdition] = useState("B");
  const [dueAt, setDueAt] = useState("");
  const [scopeMode, setScopeMode] = useState("all");
  const [pickedClasses, setPickedClasses] = useState(new Set());
  const [pickedStudents, setPickedStudents] = useState(new Set());
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const classes = useMemo(() => teacherData?.classes ?? [], [teacherData]);
  const students = useMemo(() => teacherData?.students ?? [], [teacherData]);
  const assignments = useMemo(() => teacherData?.assignments ?? [], [teacherData]);

  const toggleSet = (set, value) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setFormError("");
    if (!title.trim()) {
      setFormError("请填写试卷标题");
      return;
    }
    const scope = scopeMode === "all"
      ? { all: true }
      : scopeMode === "classes"
        ? { classNames: [...pickedClasses] }
        : { studentIds: [...pickedStudents] };
    if (scopeMode !== "all" && ((scopeMode === "classes" && scope.classNames.length === 0)
      || (scopeMode === "students" && scope.studentIds.length === 0))) {
      setFormError("请至少选择一个班级或学员");
      return;
    }
    setPending(true);
    try {
      await onCreate({
        title: title.trim(),
        note: note.trim(),
        edition,
        dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null,
        scope,
      });
      setTitle("");
      setNote("");
      setDueAt("");
      setPickedClasses(new Set());
      setPickedStudents(new Set());
      setScopeMode("all");
      onNotice("试卷已下发，学生端登录后即可看到");
    } catch (submitError) {
      setFormError(submitError.message || "下发失败，请稍后再试");
    } finally {
      setPending(false);
    }
  }

  if (status === "error") {
    return (
      <div className="admin-view">
        <div className="empty-state">
          <strong>组卷中心需要服务端数据</strong>
          <p>{error}</p>
          <button type="button" className="admin-text-button" onClick={onReload}>重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-view">
      <section className="panel assignment-compose" aria-label="组卷下发">
        <h2><Exam size={16} weight="fill" /> 组一份综合能力测评试卷并下发</h2>
        <p className="panel-note">
          试卷即一次完整的综合能力测评（对话定档 → 客观 CAT → 实操工作台），题库版本在此选定。
          下发后学生端「老师推送」区实时可见；学生完成的成绩自动汇总回本页与数据概览。
        </p>
        <form onSubmit={submit} className="assignment-form">
          <label className="assignment-field is-wide">
            <span>试卷标题 *</span>
            <input
              type="text"
              value={title}
              maxLength={60}
              placeholder="例如：期中 AI 综合能力测评"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="assignment-field is-wide">
            <span>作答说明</span>
            <textarea
              value={note}
              maxLength={300}
              rows={2}
              placeholder="写给学生看的说明（可选）：考查重点、注意事项等"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <label className="assignment-field">
            <span>题库版本</span>
            <select value={edition} onChange={(event) => setEdition(event.target.value)}>
              {Object.values(EDITIONS).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}（客观 {item.counts.objective} · 实操 {item.counts.practical}）
                </option>
              ))}
            </select>
          </label>
          <label className="assignment-field">
            <span>截止日期</span>
            <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </label>
          <fieldset className="assignment-field is-wide assignment-scope">
            <legend>下发范围</legend>
            <div className="assignment-scope-modes" role="group" aria-label="下发范围方式">
              {[
                { id: "all", label: "全部学员" },
                { id: "classes", label: "按班级" },
                { id: "students", label: "指定学员" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={scopeMode === item.id ? "is-active" : ""}
                  aria-pressed={scopeMode === item.id}
                  onClick={() => setScopeMode(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {scopeMode === "classes" && (
              classes.length > 0 ? (
                <div className="assignment-chip-row">
                  {classes.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={`assignment-chip${pickedClasses.has(name) ? " is-on" : ""}`}
                      aria-pressed={pickedClasses.has(name)}
                      onClick={() => setPickedClasses((current) => toggleSet(current, name))}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : <p className="assignment-hint">暂无已注册班级的学员——学生注册时填写班级后可选。</p>
            )}
            {scopeMode === "students" && (
              students.length > 0 ? (
                <div className="assignment-chip-row">
                  {students.map((student) => (
                    <button
                      key={student.accountId}
                      type="button"
                      className={`assignment-chip${pickedStudents.has(student.accountId) ? " is-on" : ""}`}
                      aria-pressed={pickedStudents.has(student.accountId)}
                      onClick={() => setPickedStudents((current) => toggleSet(current, student.accountId))}
                    >
                      {student.nickname}{student.className ? ` · ${student.className}` : ""}
                    </button>
                  ))}
                </div>
              ) : <p className="assignment-hint">暂无已注册学员。学生端注册并登录后出现在这里。</p>
            )}
          </fieldset>
          {formError && <p className="assignment-form-error" role="alert">{formError}</p>}
          <div className="assignment-form-actions">
            <button type="submit" className="admin-primary-button" disabled={pending}>
              <Plus size={15} weight="bold" /> {pending ? "下发中…" : "下发试卷"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel" aria-label="已下发试卷">
        <h2>已下发试卷（{assignments.length}）</h2>
        {assignments.length === 0 ? (
          <div className="empty-state">
            <strong>还没有下发过试卷</strong>
            <p>上方组卷下发后，学生端登录即可看到并作答。</p>
          </div>
        ) : (
          <ul className="assignment-admin-list">
            {assignments.map((assignment) => (
              <li key={assignment.id} className={`assignment-admin-item${assignment.status === "closed" ? " is-closed" : ""}`}>
                <button
                  type="button"
                  className="assignment-admin-head"
                  aria-expanded={expanded === assignment.id}
                  onClick={() => setExpanded(expanded === assignment.id ? null : assignment.id)}
                >
                  <div className="assignment-admin-title">
                    <strong>{assignment.title}</strong>
                    <span>{scopeLabel(assignment)} · {EDITIONS[assignment.edition]?.label ?? "精选版"} · {formatDate(assignment.createdAt)} 下发</span>
                  </div>
                  <div className="assignment-admin-stats">
                    <span><b>{assignment.completedCount}</b>/{assignment.targetedCount} 完成</span>
                    <span>均分 <b>{assignment.averageScore === null ? "—" : Math.round(assignment.averageScore)}</b></span>
                    {assignment.dueAt && <span className="is-due"><ClockCountdown size={13} /> {formatDate(assignment.dueAt)} 截止</span>}
                    <em className={`assignment-status is-${assignment.status}`}>{assignment.status === "closed" ? "已截止" : "进行中"}</em>
                    <CaretDown size={15} className={`assignment-caret${expanded === assignment.id ? " is-open" : ""}`} />
                  </div>
                </button>
                {expanded === assignment.id && (
                  <div className="assignment-admin-body">
                    {assignment.note && <p className="assignment-note">{assignment.note}</p>}
                    <table className="admin-table">
                      <thead>
                        <tr><th>学员</th><th>班级</th><th>状态</th><th>完成时间</th><th>总分</th><th>等级</th></tr>
                      </thead>
                      <tbody>
                        {assignment.roster.map((row) => (
                          <tr key={row.accountId}>
                            <td><b>{row.nickname}</b></td>
                            <td>{row.className || "未分班"}</td>
                            <td>
                              {row.completed
                                ? <span className="is-up"><CheckCircle size={14} weight="fill" /> 已完成</span>
                                : <span className="is-muted"><XCircle size={14} /> 未完成</span>}
                            </td>
                            <td>{formatDate(row.completedAt)}</td>
                            <td>{row.overallScore === null ? "—" : <b>{Math.round(row.overallScore)}</b>}</td>
                            <td>{row.grade
                              ? <span className={`grade-badge is-${row.grade.toLowerCase()}`}>{row.grade}</span>
                              : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="assignment-admin-actions">
                      <button type="button" className="admin-text-button" onClick={() => onReload()}>
                        刷新完成情况
                      </button>
                      <button
                        type="button"
                        className="admin-text-button"
                        onClick={async () => {
                          try {
                            await onToggle(assignment.id);
                            onNotice(assignment.status === "closed" ? "已重新开启该试卷" : "已截止该试卷");
                          } catch (toggleError) {
                            onNotice(toggleError.message || "操作失败");
                          }
                        }}
                      >
                        {assignment.status === "closed" ? "重新开启" : "截止作答"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
