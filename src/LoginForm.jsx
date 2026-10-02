import { useState } from "react";
import {
  ArrowRight,
  ChalkboardTeacher,
  DeviceMobile,
  Eye,
  EyeSlash,
  LockKey,
  QrCode,
  User,
} from "@phosphor-icons/react";
import {
  validateAccount,
  validateClassName,
  validateNickname,
  validatePassword,
} from "./auth-validation";
import { apiLogin, apiRegister } from "./auth-client";

/**
 * 严格登录/注册表单。校验规则在 src/auth-validation.js —— 与 worker 的
 * /api/auth/* 端点 import 同一模块，前后端口径永远一致；服务端校验是
 * 权威，这里先行给出即时反馈。成功后才回调 onLogin(profile)。
 *
 * 版式按设计稿：标题「AIQUOS 登录」+ 可见字段标签 + 渐变主按钮
 * 「账号密码登录」，注册切换收进底部链接；「或」分隔线下的
 * 验证码/二维码登录为占位（后端未开通，点击给暂未开通提示）。
 */
export function LoginForm({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [className, setClassName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [altHint, setAltHint] = useState("");
  const [pending, setPending] = useState(false);

  const switchMode = (next) => {
    if (pending || next === mode) return;
    setMode(next);
    setErrors({});
    setFormError("");
  };

  const notifyAltLocked = () => {
    setAltHint("该登录方式暂未开通，请使用账号密码登录");
    window.setTimeout(() => setAltHint(""), 2400);
  };

  const validateAll = () => {
    const next = {};
    const accountCheck = validateAccount(account);
    if (!accountCheck.ok) next.account = accountCheck.error;
    const passwordCheck = validatePassword(password, account);
    if (!passwordCheck.ok) next.password = passwordCheck.error;
    if (mode === "register") {
      const nicknameCheck = validateNickname(nickname);
      if (!nicknameCheck.ok) next.nickname = nicknameCheck.error;
      const classCheck = validateClassName(className);
      if (!classCheck.ok) next.className = classCheck.error;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setFormError("");
    if (!validateAll()) return;
    setPending(true);
    try {
      const profile = mode === "register"
        ? await apiRegister({
          account: account.trim(),
          password,
          nickname: nickname.trim(),
          className: className.trim(),
        })
        : await apiLogin(account.trim(), password);
      setPassword("");
      onLogin(profile);
    } catch (error) {
      setFormError(error.message || "登录服务暂不可用，请稍后再试");
    } finally {
      setPending(false);
    }
  }

  const fieldState = (key) => (errors[key] ? { "aria-invalid": "true" } : {});

  return (
    <form className="login-form" noValidate autoComplete="off"
      aria-labelledby="login-title" aria-describedby="login-note"
      onSubmit={submit}>
      <header className="login-heading">
        <h2 id="login-title" className="login-title" tabIndex={-1}>
          {mode === "login" ? "AIQUOS 登录" : "AIQUOS 注册"}
        </h2>
        <p>{mode === "login" ? "认证你的智能，解锁全部能力" : "创建账号，开始你的能力测评"}</p>
      </header>

      <div className="login-fields">
        <div className={`login-field-group${errors.account ? " is-invalid" : ""}`}>
          <label className="login-field-label" htmlFor="login-account">账号</label>
          <label className="login-field">
            <span className="sr-only">账号</span>
            <User size={19} aria-hidden="true" />
            <input id="login-account" type="text" placeholder="手机号 / 邮箱" autoComplete="username"
              autoCapitalize="none" spellCheck={false}
              value={account} disabled={pending}
              {...fieldState("account")}
              onChange={(event) => { setAccount(event.target.value); setErrors((current) => ({ ...current, account: undefined })); }} />
          </label>
          {errors.account && <p className="login-field-error" role="alert">{errors.account}</p>}
        </div>
        <div className={`login-field-group${errors.password ? " is-invalid" : ""}`}>
          <label className="login-field-label" htmlFor="login-password">密码</label>
          <div className="login-field">
            <LockKey size={19} aria-hidden="true" />
            <input id="login-password" type={showPassword ? "text" : "password"}
              placeholder={mode === "login" ? "输入密码" : "设置密码（8 位以上，含字母和数字）"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password} disabled={pending}
              {...fieldState("password")}
              onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })); }} />
            <button type="button" className="login-password-toggle"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}
              disabled={pending}>
              {showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}
            </button>
          </div>
          {errors.password && <p className="login-field-error" role="alert">{errors.password}</p>}
        </div>
        {mode === "register" && (
          <>
            <div className={`login-field-group${errors.nickname ? " is-invalid" : ""}`}>
              <label className="login-field-label" htmlFor="login-nickname">昵称（可选）</label>
              <label className="login-field">
                <span className="sr-only">昵称（可选）</span>
                <ChalkboardTeacher size={19} aria-hidden="true" />
                <input id="login-nickname" type="text" placeholder="展示用昵称" autoComplete="nickname"
                  maxLength={24} value={nickname} disabled={pending}
                  {...fieldState("nickname")}
                  onChange={(event) => { setNickname(event.target.value); setErrors((current) => ({ ...current, nickname: undefined })); }} />
              </label>
              {errors.nickname && <p className="login-field-error" role="alert">{errors.nickname}</p>}
            </div>
            <div className={`login-field-group${errors.className ? " is-invalid" : ""}`}>
              <label className="login-field-label" htmlFor="login-class">班级（可选）</label>
              <label className="login-field">
                <span className="sr-only">班级（可选）</span>
                <ChalkboardTeacher size={19} aria-hidden="true" />
                <input id="login-class" type="text" placeholder="如 AI 应用 1 班" autoComplete="off"
                  maxLength={30} value={className} disabled={pending}
                  {...fieldState("className")}
                  onChange={(event) => { setClassName(event.target.value); setErrors((current) => ({ ...current, className: undefined })); }} />
              </label>
              {errors.className && <p className="login-field-error" role="alert">{errors.className}</p>}
            </div>
          </>
        )}
      </div>

      {formError && <p className="login-form-error" role="alert">{formError}</p>}

      <button type="submit" className="login-submit" disabled={pending}>
        <span>{pending ? "请稍候…" : mode === "login" ? "账号密码登录" : "注册并登录"}</span>
        {!pending && <ArrowRight size={19} weight="bold" aria-hidden="true" />}
      </button>

      <button type="button" className="login-mode-link" onClick={() => switchMode(mode === "login" ? "register" : "login")}
        disabled={pending}>
        {mode === "login" ? "还没有账号？注册一个 →" : "已有账号？直接登录 →"}
      </button>

      {mode === "login" && (
        <>
          <div className="login-alt-divider" aria-hidden="true"><i />或<i /></div>
          <div className="login-alt-row">
            <button type="button" className="login-alt-button" onClick={notifyAltLocked}
              title="暂未开通" disabled={pending}>
              <DeviceMobile size={17} aria-hidden="true" /> 验证码登录
            </button>
            <button type="button" className="login-alt-button" onClick={notifyAltLocked}
              title="暂未开通" disabled={pending}>
              <QrCode size={17} aria-hidden="true" /> 二维码登录
            </button>
          </div>
          {altHint && <p className="login-alt-hint" role="status">{altHint}</p>}
        </>
      )}

      <p id="login-note" className="login-note">
        {mode === "login"
          ? "账号为注册时的手机号或邮箱 · 密码错误连续 5 次将临时锁定"
          : "账号仅支持大陆手机号或邮箱 · 密码需 8 位以上且含字母和数字"}
      </p>
    </form>
  );
}
