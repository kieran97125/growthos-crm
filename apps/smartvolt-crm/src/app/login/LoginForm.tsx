"use client";
import { useActionState } from "react";
import { signIn } from "./actions";
export function LoginForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(signIn, { error: "" });
  return (
    <form action={action} className="sv-login-form">
      <label htmlFor="email">工作電郵</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="you@company.com"
        required
        maxLength={200}
        disabled={!enabled}
      />
      <label htmlFor="password">密碼</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={200}
        disabled={!enabled}
      />
      {state.error && <p role="alert">{state.error}</p>}
      <button disabled={!enabled || pending}>
        {pending ? "正在登入…" : "登入公司工作空間"}
        <span aria-hidden="true">→</span>
      </button>
      {!enabled && (
        <p role="status">公司登入尚未啟用。你可以先體驗示範工作空間。</p>
      )}
      <p className="sv-fine">
        帳戶由公司管理員安排。如需加入或重設登入資料，請聯絡管理員。
      </p>
    </form>
  );
}
