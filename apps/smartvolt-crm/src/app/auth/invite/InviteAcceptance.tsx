"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
type Credentials = {
  invitation: string | null;
  token: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};
export default function InviteAcceptance() {
  const credentials = useRef<Credentials | null>(null),
    router = useRouter();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (credentials.current) return;
    const url = new URL(window.location.href),
      hash = new URLSearchParams(url.hash.slice(1));
    credentials.current = {
      invitation: url.searchParams.get("invitation"),
      token: url.searchParams.get("token"),
      accessToken: hash.get("access_token"),
      refreshToken: hash.get("refresh_token"),
    };
    window.history.replaceState(null, "", "/auth/invite");
  }, []);
  async function accept(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password && password.length < 12) {
      setError("新密碼最少需要 12 個字元。");
      return;
    }
    if (password !== confirm) {
      setError("兩次輸入嘅密碼不一致。");
      return;
    }
    if (!credentials.current?.accessToken) {
      setError("登入連結已失效，請重新開啟最新嘅邀請郵件。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/team/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...credentials.current,
            ...(password ? { password } : {}),
          }),
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error ?? "未能接受邀請。");
      credentials.current = null;
      router.replace(`/company/${body.companyId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能接受邀請，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sv-picker" style={{ maxWidth: 560, margin: "8vh auto" }}>
      <form onSubmit={accept} className="sv-login-form">
        <span className="sv-eyebrow">CONVELTA · TEAM</span>
        <h1>加入團隊</h1>
        <p>接受邀請後，就可以使用公司分配畀你嘅品牌及產品。</p>
        <label>
          設定登入密碼
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          再輸入密碼
          <input
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <p>
          首次使用請設定最少 12 個字元嘅密碼；已有帳戶可留空，沿用原有密碼。
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="sv-primary" disabled={busy}>
          {busy ? "正在加入…" : "接受邀請，進入公司"}
        </button>
        <Link href="/login">返回登入</Link>
      </form>
    </main>
  );
}
