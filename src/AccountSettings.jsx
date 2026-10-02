import {
  Camera,
  EnvelopeSimple,
  LockKey,
  SignOut,
  Eye,
  EyeSlash,
  DeviceMobile,
  User,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { setAccount, useAccount } from "./account-store";
import { useFavorites } from "./favorites-store";
import { loadAttemptHistory } from "./assessment-attempt";
import { apiUpdateNickname, clearSession, readProfile } from "./auth-client";
import { writeActiveAssignmentId } from "./run-report";
import { scopedKey } from "./account-scope.js";

// 与 ProfileDetail 共用同一存储：我的记录按日期分桶（账号隔离）。
const RECORD_ENTRIES_KEY = "aiquos.record-entries.v1";

export function AccountSettings({ onBack, onLogout, busy, source = "home", variant = "screen" }) {
  const { nickname, accountId, avatar: accountAvatar } = useAccount();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const avatarInputRef = useRef(null);
  const favorites = useFavorites();
  // 左侧统计全部取真实数据：完成的测评历史、本机写的记录条数、收藏数。
  // 挂载时读一次即可——进入本页时数据已是最新。
  const [attemptCount] = useState(() => loadAttemptHistory().length);
  const [recordCount] = useState(() => {
    try {
      const raw = localStorage.getItem(scopedKey(RECORD_ENTRIES_KEY));
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return 0;
      return Object.values(parsed).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    } catch {
      return 0;
    }
  });
  // 已登录：以服务端档案展示身份；未登录：保留本地演示资料卡。
  const authProfile = readProfile();
  const logout = () => {
    clearSession();
    // 作业暂存一并清掉：换人登录后，上一位的作业关联不应挂到新账号的
    // 完成记录上。
    writeActiveAssignmentId(null);
    onLogout();
  };

  // 头像存进账号（data URL）而不是组件状态：这样头部右上角的圆形头像、
  // 以及下次打开页面都能拿到同一张图。object URL 一刷新就成了死链。
  const updateAvatar = (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAccount({ avatar: reader.result });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const [saveState, setSaveState] = useState(""); // "" | "saving" | "saved" | 错误文案
  // 自动保存：昵称失焦即存（与上次已保存值相同则跳过，避免每次失焦
  // 都打一次接口）。密码修改入口在底部按钮区，具体界面暂未实现。
  const savedNicknameRef = useRef(nickname);
  const saveNickname = async () => {
    const next = nickname.trim();
    if (!next || next === savedNicknameRef.current || saveState === "saving") return;
    setSaveState("saving");
    try {
      if (readProfile()) await apiUpdateNickname(next);
      setAccount({ nickname: next });
      savedNicknameRef.current = next;
      setSaveState("saved");
    } catch (error) {
      setSaveState(error.message || "保存失败");
    }
    window.setTimeout(() => setSaveState(""), 2600);
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    saveNickname();
  };

  const card = (
    <section className="account-settings-card" aria-label="账号资料">
      <aside className="account-side">
        <div className="account-avatar-stage">
          <i className="account-stage-arch" aria-hidden="true" />
          <i className="account-stage-lines" aria-hidden="true" />
          <div className="account-avatar-control">
            <div className={`account-avatar${accountAvatar ? " has-image" : ""}`} aria-hidden={accountAvatar ? "true" : undefined}>
              {accountAvatar ? <img src={accountAvatar} alt="" /> : nickname.trim().charAt(0) || "智"}
            </div>
            <button type="button" className="avatar-change-button" onClick={() => avatarInputRef.current?.click()}>
              <Camera size={15} weight="bold" /> 更换头像
            </button>
            <input
              ref={avatarInputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              aria-label="选择头像图片"
              onChange={updateAvatar}
            />
          </div>
        </div>
        <div className="account-side-card">
          <strong>{nickname}</strong>
          <span>{accountId}</span>
        </div>
        <dl className="account-side-stats">
          <div><dt>测评</dt><dd>{attemptCount} 次</dd></div>
          <div><dt>记录</dt><dd>{recordCount} 条</dd></div>
          <div><dt>收藏</dt><dd>{favorites.length} 条</dd></div>
        </dl>
        <p className="account-note">{authProfile
          ? "登录后完成测评会上报成绩摘要给教师端；头像与草稿等明细仅存本机。"
          : "演示资料仅在本页展示，不会保存或传输。"}</p>
      </aside>

      <div className="account-editor">
        <header>
          <div>
            <h2>账号设置</h2>
          </div>
          <span>{authProfile ? "已登录 · 服务端账号" : "本地资料 · 未登录"}</span>
        </header>
        {authProfile ? (
          <form onSubmit={handleSubmit}>
            <label className="settings-field">
              <span><User size={18} weight="bold" /> 昵称</span>
              <input type="text" value={nickname} onChange={(event) => setAccount({ nickname: event.target.value })} onBlur={saveNickname} autoComplete="nickname" />
            </label>
            <label className="settings-field">
              <span><User size={18} weight="bold" /> 登录账号</span>
              <input type="text" value={authProfile.account} readOnly disabled title="登录账号注册后不可修改" />
            </label>
            <label className="settings-field">
              <span><User size={18} weight="bold" /> 系统账号 ID</span>
              <input type="text" value={authProfile.accountId} readOnly disabled autoComplete="username" />
            </label>
            <label className="settings-field">
              <span><User size={18} weight="bold" /> 角色</span>
              <input type="text" value={authProfile.role === "teacher" ? "教师" : "学生"} readOnly disabled />
            </label>
            <label className="settings-field">
              <span><User size={18} weight="bold" /> 班级</span>
              <input type="text" value={authProfile.className || "未加入班级"} readOnly disabled title="班级在注册时填写" />
            </label>
            <div className="account-actions">
              <p>{saveState === "saved" ? "已保存。" : saveState === "saving" ? "正在保存…" : saveState || "资料修改后自动保存。"}</p>
              <div>
                <button type="button" className="save-button">修改密码</button>
                <button type="button" className="logout-button" onClick={logout} disabled={busy}>
                  <SignOut size={18} weight="bold" /> 退出登录
                </button>
              </div>
            </div>
          </form>
        ) : (
        <form onSubmit={handleSubmit}>
          <label className="settings-field">
            <span><User size={18} weight="bold" /> 昵称</span>
            <input type="text" value={nickname} onChange={(event) => setAccount({ nickname: event.target.value })} onBlur={saveNickname} autoComplete="nickname" />
          </label>
          <label className="settings-field">
            <span><User size={18} weight="bold" /> 账号</span>
            <input
              type="text"
              value={accountId}
              readOnly
              disabled
              title="账号由系统自动分配，不可修改"
              autoComplete="username"
            />
          </label>
          <label className="settings-field">
            <span><LockKey size={18} weight="bold" /> 密码</span>
            <span className="password-box">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                placeholder="请输入密码"
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <label className="settings-field">
            <span><EnvelopeSimple size={18} weight="bold" /> 邮箱</span>
            <input type="email" value={email} placeholder="填写邮箱地址" onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label className="settings-field">
            <span><DeviceMobile size={18} weight="bold" /> 手机号</span>
            <input type="tel" value={phone} placeholder="填写手机号" onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
          </label>
          <div className="account-actions">
            <p>{saveState === "saved" ? "已保存。" : saveState === "saving" ? "正在保存…" : saveState || "昵称修改后自动保存；未登录时资料仅存本机。"}</p>
            <div>
              <button type="button" className="logout-button" onClick={logout} disabled={busy}>
                <SignOut size={18} weight="bold" /> 退出登录
              </button>
            </div>
          </div>
        </form>
        )}
      </div>
    </section>
  );

  if (variant === "panel") {
    return <div className="account-panel-host">{card}</div>;
  }

  return (
    <main className="account-settings-screen" aria-label="账号设置">
      <button
        className="pill-button settings-back"
        onClick={onBack}
        disabled={busy}
      >
        {source === "profile" ? "返回个人中心" : "返回首页"}
      </button>
      <div className="account-settings-layout">
        {card}
      </div>
    </main>
  );
}
