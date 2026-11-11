"use client";
import { useActionState } from "react";
import { setPassword } from "./actions";
export function PasswordForm() {
  const [state, action, pending] = useActionState(setPassword, { error: "" });
  return (
    <form action={action} className="sv-login-form">
      <label htmlFor="new-password">新密碼</label>
      <input
        id="new-password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        required
      />
      <label htmlFor="confirm-password">再輸入新密碼</label>
      <input
        id="confirm-password"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        required
      />
      <p>最少 12 個字元。更新後會登出目前及其他裝置嘅登入。</p>
      <button disabled={pending}>
        {pending ? "正在更新…" : "設定密碼並登出"}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
