import {
  Camera,
  EnvelopeSimple,
  LockKey,
  SignOut,
  Eye,
  EyeSlash,
  User,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useFavorites } from "./favorites-store";

export function AccountSettings({ onBack, onLogout, busy, source = "home", variant = "screen" }) {
  const [nickname, setNickname] = useState("智核学员");
  const [accountId, setAccountId] = useState("aiquos-2026");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const avatarInputRef = useRef(null);
  const favorites = useFavorites();

  const updateAvatar = (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setAvatarUrl(URL.createObjectURL(file));
    event.target.value = "";
  };

  const saveProfile = (event) => {
    event.preventDefault();
    setSaved(true);
    setPassword("");
    window.setTimeout(() => setSaved(false), 2200);
  };

  const card = (
    <section className="account-settings-card" aria-label="账号资料">
      <aside className="account-side">
        <div className="account-avatar-control">
          <div className={`account-avatar${avatarUrl ? " has-image" : ""}`} aria-hidden={avatarUrl ? "true" : undefined}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : nickname.trim().charAt(0) || "智"}
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
        <p className="account-kicker">AIQUOS / ACCOUNT</p>
        <h1 className="account-settings-title" tabIndex={-1}>{variant === "panel" ? "账号设置" : "账号设置"}</h1>
        <p className="account-meta">{nickname} · {accountId}</p>
        <dl className="account-side-stats">
          <div><dt>测评</dt><dd>23 次</dd></div>
          <div><dt>作品</dt><dd>4 项</dd></div>
          <div><dt>收藏</dt><dd>{favorites.length} 条</dd></div>
        </dl>
        <p className="account-note">演示资料仅在本页展示，不会保存或传输。</p>
      </aside>

      <div className="account-editor">
        <header>
          <h2>基础资料</h2>
          <span>本地演示 · 不做登录校验</span>
        </header>
        <form onSubmit={saveProfile}>
          <label className="settings-field">
            <span><User size={18} weight="bold" /> 昵称</span>
            <input type="text" value={nickname} onChange={(event) => setNickname(event.target.value)} autoComplete="nickname" />
          </label>
          <label className="settings-field">
            <span><EnvelopeSimple size={18} weight="bold" /> 账号</span>
            <input type="text" value={accountId} onChange={(event) => setAccountId(event.target.value)} autoComplete="username" />
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
          <div className="account-actions">
            <p>{saved ? "资料已在本地演示中更新。" : "修改后点击保存，密码不会被上传。"}</p>
            <div>
              <button type="submit" className="save-button">保存资料</button>
              <button type="button" className="logout-button" onClick={onLogout} disabled={busy}>
                <SignOut size={18} weight="bold" /> 退出登录
              </button>
            </div>
          </div>
        </form>
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
