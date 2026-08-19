import { useEffect, useState } from "react";

type CloudAuthModalProps = {
  open: boolean;
  pending: boolean;
  error: string;
  onClose: () => void;
  onLogin: (input: { email: string; password: string }) => Promise<void>;
  onRegister: (input: { email: string; password: string; displayName?: string }) => Promise<void>;
  onRequestPasswordReset: (email: string) => Promise<void>;
  onResetPassword: (input: { token: string; password: string }) => Promise<void>;
};

export function CloudAuthModal({ open, pending, error, onClose, onLogin, onRegister, onRequestPasswordReset, onResetPassword }: CloudAuthModalProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetToken, setResetToken] = useState("");

  const submit = async () => {
    if (mode === "forgot") {
      if (!email.trim()) return;
      await onRequestPasswordReset(email.trim());
      setMode("reset");
      return;
    }
    if (mode === "reset") {
      if (!resetToken.trim() || !password) return;
      await onResetPassword({ token: resetToken.trim(), password });
      setPassword("");
      setResetToken("");
      setMode("login");
      return;
    }
    if (!email.trim() || !password) return;
    if (mode === "login") await onLogin({ email: email.trim(), password });
    else await onRegister({ email: email.trim(), password, displayName: displayName.trim() || undefined });
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (event.key === "Escape") {
        if (!pending) {
          event.preventDefault();
          onClose();
        }
        return;
      }
      if (event.key === "Enter" && !(event.target as HTMLElement | null)?.closest("button, select, textarea")) {
        event.preventDefault();
        if (!pending) void submit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayName, email, mode, onClose, onLogin, onRegister, onRequestPasswordReset, onResetPassword, open, password, pending, resetToken]);

  if (!open) return null;

  return (
    <div className="modal-mask" onClick={pending ? undefined : onClose}>
      <section className="modal-card cloud-auth-modal" onClick={(event) => event.stopPropagation()} aria-label="登录个人云空间">
        <header className="modal-header">
          <div>
            <h3>{mode === "login" ? "登录个人云空间" : mode === "register" ? "注册个人云空间" : mode === "forgot" ? "找回密码" : "重置密码"}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="关闭登录窗口">×</button>
        </header>
        <div className="cloud-auth-fields">
          {mode === "register" ? (
            <label>
              显示名称
              <input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
            </label>
          ) : null}
          {mode !== "reset" ? <label>
              邮箱
              <input value={email} type="email" onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </label> : null}
          {mode === "reset" ? <label>
              邮件中的重置码
              <input value={resetToken} onChange={(event) => setResetToken(event.target.value)} autoComplete="one-time-code" />
            </label> : null}
          <label>
            {mode === "reset" ? "新密码" : "密码"}
            <input value={password} type="password" onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </label>
          {error ? <p className="warning cloud-auth-error">{error}</p> : null}
          <div className="inline-actions cloud-auth-actions">
            <button type="button" className="tool-ghost" disabled={pending} onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "注册账号" : "返回登录"}
            </button>
            {mode === "login" ? <button type="button" className="tool-ghost" disabled={pending} onClick={() => setMode("forgot")}>忘记密码</button> : null}
            <button type="button" className="primary" disabled={pending || (mode === "reset" ? !resetToken.trim() || !password : !email.trim() || (mode !== "forgot" && !password))} onClick={() => void submit()}>
              {pending ? "处理中..." : mode === "login" ? "登录" : mode === "register" ? "注册并登录" : mode === "forgot" ? "发送重置码" : "确认重置"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
