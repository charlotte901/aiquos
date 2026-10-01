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
import { clearAllAssessmentData } from "./assessment-attempt";
import { apiChangePassword, apiUpdateNickname, clearSession, readProfile } from "./auth-client";
import { writeActiveAssignmentId } from "./run-report";

export function AccountSettings({ onBack, onLogout, busy, source = "home", variant = "screen" }) {
  const { nickname, accountId, avatar: accountAvatar } = useAccount();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [dataCleared, setDataCleared] = useState(false);
  const avatarInputRef = useRef(null);
  const favorites = useFavorites();
  // 已登录：以服务端档案展示身份；未登录：保留本地演示资料卡。
  const authProfile = readProfile();
  const logout = () => {
    clearSession();
    // 作业暂存一并清掉：换人登录后，上一位的作业关联不应挂到新账号的
    // 完成记录上。
    writeActiveAssignmentId(null);
    onLogout();
  };

  const clearLocalData = () => {
    clearAllAssessmentData();
    setDataCleared(true);
    window.setTimeout(() => setDataCleared(false), 2600);
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

  const [currentPassword, setCurrentPassword] = useState("");
  const [saveState, setSaveState] = useState(""); // "" | "saving" | "saved" | 错误文案
  const saveProfile = async (event) => {
    event.preventDefault();
    const loggedIn = Boolean(readProfile());
    setSaveState("saving");
    try {
      if (loggedIn) {
        if (nickname.trim()) await apiUpdateNickname(nickname.trim());
        if (password) {
          if (!currentPassword) { setSaveState("请输入当前密码以确认修改"); return; }
          await apiChangePassword(currentPassword, password);
        }
        setAccount({ nickname: nickname.trim() });
        setPassword("");
        setCurrentPassword("");
        setSaveState("saved");
      } else {
        // 未登录：昵称仅存本机（历史行为）。
        setAccount({ nickname: nickname.trim() });
        setSaveState("saved");
      }
      setPassword("");
    } catch (error) {
      setSaveState(error.message || "保存失败");
    }
    window.setTimeout(() => setSaveState(""), 2600);
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
          <div><dt>测评</dt><dd>23 次</dd></div>
          <div><dt>作品</dt><dd>4 项</dd></div>
          <div><dt>收藏</dt><dd>{favorites.length} 条</dd></div>
        </dl>
        <p className="account-note">{authProfile
          ? "登录后完成测评会上报成绩摘要给教师端；头像与草稿等明细仅存本机。"
          : "演示资料仅在本页展示，不会保存或传输。"}</p>
      </aside>

      <div className="account-editor">
        <header>
          <div>
            <p className="account-kicker">AIQUOS / ACCOUNT</p>
            <h2>账号设置</h2>
          </div>
          <span>{authProfile ? "已登录 · 服务端账号" : "本地资料 · 未登录"}</span>
        </header>
        {authProfile ? (
          <form onSubmit={saveProfile}>
            <label className="settings-field">
              <span><User size={18} weight="bold" /> 昵称</span>
              <input type="text" value={nickname} onChange={(event) => setAccount({ nickname: event.target.value })} autoComplete="nickname" />
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
            <label className="settings-field">
              <span><LockKey size={18} weight="bold" /> 当前密码</span>
              <span className="password-box">
                <input
                  type={showPassword ? "text" : "password"}
                  value={currentPassword}
                  placeholder="修改密码需先输入当前密码"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </span>
            </label>
            <label className="settings-field">
              <span><LockKey size={18} weight="bold" /> 新密码</span>
              <span className="password-box">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  placeholder="留空则不修改密码"
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
              <input type="text" value={authProfile.className || "未加入班级"} readOnly disabled title="班级在注册时填写" />
            </label>
            <div className="account-actions">
              <p>{saveState === "saved" ? "资料已保存。" : saveState === "saving" ? "正在保存…" : saveState || "登录账号与角色由服务端管理；密码修改需输入当前密码确认。"}</p>
              <div>
                <button type="submit" className="save-button" disabled={saveState === "saving"}>{saveState === "saving" ? "保存中…" : "保存资料"}</button>
                <button type="button" className="logout-button" onClick={logout} disabled={busy}>
                  <SignOut size={18} weight="bold" /> 退出登录
                </button>
              </div>
            </div>
          </form>
        ) : (
        <form onSubmit={saveProfile}>
          <label className="settings-field">
            <span><User size={18} weight="bold" /> 昵称</span>
            <input type="text" value={nickname} onChange={(event) => setAccount({ nickname: event.target.value })} autoComplete="nickname" />
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
            <p>{saved ? "资料已在本地演示中更新。" : "修改后点击保存，密码不会被上传。"}</p>
            <div>
              <button type="submit" className="save-button" disabled={saveState === "saving"}>{saveState === "saving" ? "保存中…" : "保存资料"}</button>
              <button type="button" className="logout-button" onClick={logout} disabled={busy}>
                <SignOut size={18} weight="bold" /> 退出登录
              </button>
            </div>
          </div>
        </form>
        )}
        <section className="account-privacy" aria-label="数据与隐私">
          <h3>数据与隐私</h3>
          <p>
            综合测评的答题草稿、历史报告（最多 12 份）与自适应出题的选题记录全部保存在本机浏览器
            （localStorage）。{authProfile
              ? "登录状态下，每次完成综合测评会把成绩摘要（总分、六维得分、题库版本）上报到教师端，供老师查看班级与个人报告。"
              : "未登录时不向服务器上报任何数据。"}
            本机数据可随时一键清除：
          </p>
          <ul>
            <li><code>aiquos.comprehensive-attempt.v1</code> 未完成测评的续答草稿</li>
            <li><code>aiquos.comprehensive-history.v1</code> 已完成的觉醒报告快照</li>
            <li><code>aiquos.adaptive-exposure.v1</code> 题目曝光均衡计数</li>
          </ul>
          <div className="account-privacy-actions">
            <span>{dataCleared ? "已清除本机测评数据。" : "清除后无法恢复，报告与草稿将被删除。"}</span>
            <button type="button" className="logout-button" onClick={clearLocalData}>
              清除本机测评数据
            </button>
          </div>
        </section>
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
