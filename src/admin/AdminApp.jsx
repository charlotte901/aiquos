import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChartPieSlice,
  ClipboardText,
  Database,
  LockSimple,
  SignOut,
  SquaresFour,
  Users,
} from "@phosphor-icons/react";
import { fetchBank } from "./api.js";
import { buildRoster } from "./cohort.js";
import { OverviewView } from "./views/OverviewView.jsx";
import { StudentsView } from "./views/StudentsView.jsx";
import { BankView } from "./views/BankView.jsx";
import { RecordsView } from "./views/RecordsView.jsx";
import { SettingsView } from "./views/SettingsView.jsx";

const SESSION_KEY = "aiquos.admin-session.v1";
const DEMO_PASSCODE = "admin";

const NAV = [
  { id: "overview", label: "数据概览", icon: SquaresFour },
  { id: "students", label: "学员管理", icon: Users },
  { id: "bank", label: "题库管理", icon: Database },
  { id: "records", label: "测评记录", icon: ClipboardText },
  { id: "settings", label: "系统设置", icon: ChartPieSlice },
];

function Gate({ onEnter }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const submit = (event) => {
    event.preventDefault();
    if (passcode === DEMO_PASSCODE) {
      try {
        localStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Session flag is best-effort; the gate still opens for this visit.
      }
      onEnter();
      return;
    }
    setError("口令不正确。本地演示口令为 admin。");
  };
  return (
    <main className="admin-gate" aria-label="管理端登录">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-brand" aria-hidden="true">
          <span>AIQUOS</span>
          <i />
        </div>
        <h1>管理端</h1>
        <p>面向测评运营的本地演示控制台。口令校验仅在前端，不含真实账号体系。</p>
        <label>
          <span>管理口令</span>
          <input
            type="password"
            value={passcode}
            onChange={(event) => { setPasscode(event.target.value); setError(""); }}
            placeholder="输入演示口令"
            autoFocus
          />
        </label>
        {error && <p className="gate-error" role="alert">{error}</p>}
        <button type="submit" disabled={!passcode}>
          <LockSimple size={17} weight="bold" /> 进入管理端
        </button>
        <a href="/" className="gate-back">返回学生端</a>
      </form>
    </main>
  );
}

export function AdminApp() {
  const [entered, setEntered] = useState(() => {
    try {
      return localStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [view, setView] = useState("overview");
  const [bankState, setBankState] = useState(null);
  const [bankStatus, setBankStatus] = useState("loading");
  const [bankError, setBankError] = useState("");
  const [notice, setNotice] = useState("");
  const [rosterVersion, setRosterVersion] = useState(0);

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

  useEffect(() => {
    if (entered) loadBank();
  }, [entered, loadBank]);

  // The roster rebuilds when the admin asks for a refresh (records view does
  // this after returning from the student app).
  const roster = useMemo(() => (entered ? buildRoster() : []), [entered, rosterVersion]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const logout = () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore: the flag is absent anyway.
    }
    setEntered(false);
  };

  if (!entered) return <Gate onEnter={() => setEntered(true)} />;

  const bankMeta = bankState
    ? { bankVersion: bankState.bankVersion, source: bankState.source, updatedAt: bankState.updatedAt, persistent: bankState.persistent }
    : null;

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-brand" aria-hidden="true">
          <span>AIQUOS</span>
          <em>管理端</em>
        </div>
        <nav aria-label="管理端导航">
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
          <button type="button" onClick={logout}>
            <SignOut size={16} weight="bold" /> 退出登录
          </button>
          <a href="/">打开学生端</a>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-top">
          <h1>{NAV.find((item) => item.id === view)?.label}</h1>
          {bankMeta && (
            <div className="admin-bank-chip" title="当前生效题库版本">
              <i className={bankMeta.source === "override" ? "is-override" : ""} aria-hidden="true" />
              {bankMeta.bankVersion}
              <span>{bankMeta.source === "override" ? "已覆盖" : "内置"}</span>
            </div>
          )}
        </header>
        {notice && <div className="admin-notice" role="status">{notice}</div>}
        {view === "overview" && <OverviewView roster={roster} bankMeta={bankMeta} />}
        {view === "students" && <StudentsView roster={roster} />}
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
          <RecordsView roster={roster} onRefreshRoster={() => setRosterVersion((current) => current + 1)} />
        )}
        {view === "settings" && (
          <SettingsView
            bankMeta={bankMeta}
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
