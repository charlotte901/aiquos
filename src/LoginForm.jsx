import { useState } from "react";
import { ArrowRight, ChalkboardTeacher, Eye, EyeSlash, LockKey, User } from "@phosphor-icons/react";
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
  const [pending, setPending] = useState(false);

  const switchMode = (next) => {
    if (pending || next === mode) return;
    setMode(next);
    setErrors({});
    setFormError("");
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
        <span className="login-kicker" aria-hidden="true">
          <span className="login-kicker-dot" />
          AIQUOS · PLAYGROUND
        </span>
        <h2 id="login-title" className="login-title" tabIndex={-1}>
          {mode === "login" ? "欢迎回来" : "创建账号"}
        </h2>
        <p>{mode === "login" ? "登录，探索你的 AI 实力" : "注册后即可参加测评并接收老师推送的试卷"}</p>
      </header>

      <div className="login-mode-tabs" role="group" aria-label="登录或注册">
        <button type="button" className={mode === "login" ? "is-active" : ""}
          aria-pressed={mode === "login"} onClick={() => switchMode("login")}>登录</button>
        <button type="button" className={mode === "register" ? "is-active" : ""}
          aria-pressed={mode === "register"} onClick={() => switchMode("register")}>注册</button>
      </div>

      <div className="login-fields">
        <label className={`login-field${errors.account ? " is-invalid" : ""}`}>
          <span className="sr-only">账号</span>
          <User size={19} aria-hidden="true" />
          <input type="text" placeholder="手机号 / 邮箱" autoComplete="username"
            autoCapitalize="none" spellCheck={false} aria-label="账号"
            value={account} disabled={pending}
            {...fieldState("account")}
            onChange={(event) => { setAccount(event.target.value); setErrors((current) => ({ ...current, account: undefined })); }} />
        </label>
        {errors.account && <p className="login-field-error" role="alert">{errors.account}</p>}
        <div className={`login-field${errors.password ? " is-invalid" : ""}`}>
          <LockKey size={19} aria-hidden="true" />
          <label className="sr-only" htmlFor="login-password">密码</label>
          <input id="login-password" type={showPassword ? "text" : "password"}
            placeholder={mode === "login" ? "密码" : "设置密码（8 位以上，含字母和数字）"}
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
        {mode === "register" && (
          <>
            <label className={`login-field${errors.nickname ? " is-invalid" : ""}`}>
              <span className="sr-only">昵称（可选）</span>
              <ChalkboardTeacher size={19} aria-hidden="true" />
              <input type="text" placeholder="昵称（可选，展示用）" autoComplete="nickname"
                maxLength={24} aria-label="昵称（可选）" value={nickname} disabled={pending}
                {...fieldState("nickname")}
                onChange={(event) => { setNickname(event.target.value); setErrors((current) => ({ ...current, nickname: undefined })); }} />
            </label>
            {errors.nickname && <p className="login-field-error" role="alert">{errors.nickname}</p>}
            <label className={`login-field${errors.className ? " is-invalid" : ""}`}>
              <span className="sr-only">班级（可选）</span>
              <ChalkboardTeacher size={19} aria-hidden="true" />
              <input type="text" placeholder="班级（可选，如 AI 应用 1 班）" autoComplete="off"
                maxLength={30} aria-label="班级（可选）" value={className} disabled={pending}
                {...fieldState("className")}
                onChange={(event) => { setClassName(event.target.value); setErrors((current) => ({ ...current, className: undefined })); }} />
            </label>
            {errors.className && <p className="login-field-error" role="alert">{errors.className}</p>}
          </>
        )}
      </div>

      {formError && <p className="login-form-error" role="alert">{formError}</p>}

      <button type="submit" className="login-submit" disabled={pending}>
        <span>{pending ? "请稍候…" : mode === "login" ? "登录" : "注册并登录"}</span>
        {!pending && <ArrowRight size={19} weight="bold" aria-hidden="true" />}
      </button>
      <p id="login-note" className="login-note">
        {mode === "login"
          ? "账号为注册时的手机号或邮箱 · 密码错误连续 5 次将临时锁定"
          : "账号仅支持大陆手机号或邮箱 · 密码需 8 位以上且含字母和数字"}
      </p>
    </form>
  );
}
