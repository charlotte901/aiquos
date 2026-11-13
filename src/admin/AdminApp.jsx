import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChartPieSlice,
  ClipboardText,
  Database,
  Exam,
  LockSimple,
  SignOut,
  SquaresFour,
  Users,
} from "@phosphor-icons/react";
import {
  adminLogin,
  adminLogout,
  adminMe,
  adminRegisterTeacher,
  createAssignment,
  fetchBank,
  fetchTeacherData,
  readAdminProfile,
  toggleAssignmentStatus,
} from "./api.js";
import { buildRoster, buildServerRoster } from "./cohort.js";
import {
  validateAccount,
  validateNickname,
  validatePassword,
} from "../auth-validation";
import { OverviewView } from "./views/OverviewView.jsx";
import { StudentsView } from "./views/StudentsView.jsx";
import { BankView } from "./views/BankView.jsx";
import { RecordsView } from "./views/RecordsView.jsx";
import { AssignmentsView } from "./views/AssignmentsView.jsx";
import { SettingsView } from "./views/SettingsView.jsx";

const NAV = [
  { id: "overview", label: "数据概览", icon: SquaresFour },
  { id: "students", label: "学员管理", icon: Users },
  { id: "assignments", label: "组卷中心", icon: Exam },
  { id: "bank", label: "题库管理", icon: Database },
  { id: "records", label: "测评记录", icon: ClipboardText },
  { id: "settings", label: "系统设置", icon: ChartPieSlice },
];

/** 管理端登录/注册教师：真实服务端校验（/api/auth/*），仅教师角色可进入。
 *  注册不再需要邀请码（2026-10-03 产品要求）：教师与学员同一注册口、直接
 *  可注册；服务端同样忽略该旧字段（见 auth-worker 测试）。 */
function Gate({ onEnter }) {
  const [mode, setMode] = useState("login");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const validate = () => {
    const next = {};
    const accountCheck = validateAccount(account);
    if (!accountCheck.ok) next.account = accountCheck.error;
    const passwordCheck = validatePassword(password, account);
    if (!passwordCheck.ok) next.password = passwordCheck.error;
    if (mode === "register") {
      const nicknameCheck = validateNickname(nickname);
      if (!nicknameCheck.ok) next.nickname = nicknameCheck.error;
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (!validate()) return;
    setPending(true);
    try {
      if (mode === "register") {
        await adminRegisterTeacher({
          account: account.trim(),
          password,
          nickname: nickname.trim(),
        });
      } else {
        await adminLogin(account.trim(), password);
      }
      setPassword("");
      onEnter(readAdminProfile());
    } catch (submitError) {
      setError(submitError.message || "服务暂不可用，请稍后再试");
    } finally {
      setPending(false);
    }
  }

  const field = (key) => (fieldErrors[key] ? { "aria-invalid": "true" } : {});

  return (
    <main className="admin-gate" aria-label="管理端登录">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-brand" aria-hidden="true">
          <span>AIQUOS</span>
          <i />
        </div>
        <h1>教师端</h1>
        <p>登录后可查看班级与学员测评数据、组卷并推送给学生。账号由服务端严格校验。</p>
        <div className="gate-tabs" role="group" aria-label="登录或注册教师账号">
          <button type="button" className={mode === "login" ? "is-active" : ""}
            aria-pressed={mode === "login"}
            onClick={() => { setMode("login"); setFieldErrors({}); setError(""); }}>登录</button>
          <button type="button" className={mode === "register" ? "is-active" : ""}
            aria-pressed={mode === "register"}
            onClick={() => { setMode("register"); setFieldErrors({}); setError(""); }}>注册教师</button>
        </div>
        <label>
          <span>账号（手机号 / 邮箱）</span>
          <input
            type="text"
            value={account}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            {...field("account")}
            onChange={(event) => { setAccount(event.target.value); setFieldErrors((current) => ({ ...current, account: undefined })); }}
          />
          {fieldErrors.account && <em className="gate-field-error" role="alert">{fieldErrors.account}</em>}
        </label>
        <label>
          <span>密码</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            {...field("password")}
            onChange={(event) => { setPassword(event.target.value); setFieldErrors((current) => ({ ...current, password: undefined })); }}
          />
          {fieldErrors.password && <em className="gate-field-error" role="alert">{fieldErrors.password}</em>}
        </label>
        {mode === "register" && (
          <label>
            <span>姓名（昵称）</span>
            <input
              type="text"
              value={nickname}
              maxLength={24}
              autoComplete="nickname"
              {...field("nickname")}
              onChange={(event) => { setNickname(event.target.value); setFieldErrors((current) => ({ ...current, nickname: undefined })); }}
            />
            {fieldErrors.nickname && <em className="gate-field-error" role="alert">{fieldErrors.nickname}</em>}
          </label>
        )}
        {error && <p className="gate-error" role="alert">{error}</p>}
        <button type="submit" disabled={pending}>
          <LockSimple size={17} weight="bold" /> {pending ? "请稍候…" : mode === "login" ? "进入教师端" : "注册并进入"}
        </button>
        <a href="/" className="gate-back">返回学生端</a>
      </form>
    </main>
  );
}

export function AdminApp() {
  const [entered, setEntered] = useState(null); // null=探测中 false=网关 true=已进入
  const [teacher, setTeacher] = useState(null);
  const [view, setView] = useState("overview");
  const [bankState, setBankState] = useState(null);
  const [bankStatus, setBankStatus] = useState("loading");
  const [bankError, setBankError] = useState("");
  const [notice, setNotice] = useState("");
  // 服务端实时数据（教师端主数据源）；拉取失败时回退本地演示名册。
  const [teacherData, setTeacherData] = useState(null);
  const [dataStatus, setDataStatus] = useState("loading");
  const [dataError, setDataError] = useState("");

  // 会话恢复：已有教师会话则校验后直接进入，失效则回到网关。
  useEffect(() => {
    let alive = true;
    adminMe()
      .then((profile) => {
        if (!alive) return;
        if (profile) {
          setTeacher(profile);
          setEntered(true);
        } else {
          setEntered(false);
        }
      })
      .catch(() => {
        if (alive) setEntered(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadBank = useCallback(async () => {
    setBankStatus("loading");
    setBankError("");
    try {
      setBankState(await fetchBank());
      setBankStatus("ready");
    } catch (error) {
      setBankError(error.message);
      setBankStatus("error");
    }
  }, []);

  const loadTeacherData = useCallback(async () => {
    setDataStatus("loading");
    setDataError("");
    try {
      const payload = await fetchTeacherData();
      setTeacherData(payload);
      setDataStatus("ready");
    } catch (error) {
      setDataError(error.message);
      setDataStatus("error");
    }
  }, []);

  useEffect(() => {
    if (entered) {
      loadBank();
      loadTeacherData();
    }
  }, [entered, loadBank, loadTeacherData]);

  // 名册：服务端实时优先；不可达时回退本地演示（明确标注离线）。
  const roster = useMemo(() => {
    if (!entered) return [];
    if (dataStatus === "ready" && teacherData) return buildServerRoster(teacherData);
    if (dataStatus === "error") return buildRoster();
    return [];
  }, [entered, dataStatus, teacherData]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const logout = () => {
    adminLogout();
    setTeacher(null);
    setTeacherData(null);
    setDataStatus("loading");
    setBankState(null);
    setBankStatus("loading");
    setView("overview");
    setEntered(false);
  };

  if (entered === null) {
    return <main className="admin-gate" aria-label="管理端加载中"><div className="gate-card"><p>正在检查登录状态…</p></div></main>;
  }
  if (!entered) return <Gate onEnter={(profile) => { setTeacher(profile); setEntered(true); }} />;

  const bankMeta = bankState
    ? { bankVersion: bankState.bankVersion, source: bankState.source, updatedAt: bankState.updatedAt, persistent: bankState.persistent }
    : null;

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-brand" aria-hidden="true">
          <span>AIQUOS</span>
          <em>教师端</em>
        </div>
        <nav aria-label="教师端导航">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={view === item.id ? "is-active" : ""}
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? "page" : undefined}
              >
                <Icon size={18} weight={view === item.id ? "fill" : "regular"} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="admin-side-foot">
          <span className="admin-teacher-chip" title={teacher?.account ?? ""}>{teacher?.nickname ?? "教师"}</span>
          <button type="button" onClick={logout}>
            <SignOut size={16} weight="bold" /> 退出登录
          </button>
          <a href="/">打开学生端</a>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-top">
          <h1>{NAV.find((item) => item.id === view)?.label}</h1>
          <div className="admin-top-meta">
            <span
              className={`admin-data-chip is-${dataStatus === "ready" ? "live" : dataStatus === "error" ? "offline" : "loading"}`}
              title={dataStatus === "error" ? dataError : undefined}
            >
              <i aria-hidden="true" />
              {dataStatus === "ready" ? "服务端实时数据" : dataStatus === "error" ? "离线 · 显示本机演示数据" : "数据加载中"}
            </span>
            {bankMeta && (
              <div className="admin-bank-chip" title="当前生效题库版本">
                <i className={bankMeta.source === "override" ? "is-override" : ""} aria-hidden="true" />
                {bankMeta.bankVersion}
                <span>{bankMeta.source === "override" ? "已覆盖" : "内置"}</span>
              </div>
            )}
          </div>
        </header>
        {notice && <div className="admin-notice" role="status">{notice}</div>}
        {dataStatus === "ready" && ["overview", "students"].includes(view) && teacherData?.classDetails?.length > 0 && (
          <div className="admin-notice" aria-label="我的班级信息">
            {teacherData.classDetails.map((item) => <p key={item.id}>
              {item.name} · {item.teacherName} · 班级口令 {item.code} · {item.studentCount} 人 · 班级均分 {item.classAverage ?? "暂无"}
            </p>)}
          </div>
        )}
        {dataStatus === "error" && view !== "bank" && view !== "settings" && (
          <div className="admin-warn" role="alert">
            服务端数据不可用（{dataError}）。当前显示本机演示名册，学生真实数据需服务恢复后可见。
          </div>
        )}
        {view === "overview" && <OverviewView roster={roster} bankMeta={bankMeta} dataSource={dataStatus} />}
        {view === "students" && <StudentsView roster={roster} dataSource={dataStatus} />}
        {view === "assignments" && (
          <AssignmentsView
            status={dataStatus}
            error={dataError}
            teacherData={teacherData}
            onReload={loadTeacherData}
            onCreate={async (payload) => {
              await createAssignment(payload);
              await loadTeacherData();
            }}
            onToggle={async (id) => {
              await toggleAssignmentStatus(id);
              await loadTeacherData();
            }}
            onNotice={setNotice}
          />
        )}
        {view === "bank" && (
          <BankView
            bankState={bankState}
            status={bankStatus}
            error={bankError}
            onReload={loadBank}
            onNotice={setNotice}
          />
        )}
        {view === "records" && (
          <RecordsView roster={roster} onRefreshRoster={() => loadTeacherData()} />
        )}
        {view === "settings" && (
          <SettingsView
            bankMeta={bankMeta}
            dataStatus={dataStatus}
            dataError={dataError}
            teacher={teacher}
            onResetBank={async () => {
              await loadBank();
              setNotice("已恢复内置题库");
            }}
          />
        )}
      </div>
    </div>
  );
}
