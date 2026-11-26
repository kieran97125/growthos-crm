"use client";

import Image from "next/image";
import { useActionState, useId } from "react";
import {
  beginMailboxProof,
  confirmEmailCode,
  startEnrollment,
  verifyAuthenticator,
} from "./actions";
import type { MfaResult } from "./types";
import styles from "./MfaForm.module.css";

export type MfaView = "email" | "sent" | "setup" | "verify" | "recovery";
type Factor = { id: string; name: string };
const initial: MfaResult = {};

function CodeField({ email = false }: { email?: boolean }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>{email ? "電郵驗證碼" : "驗證器嘅 6 位數字"}</label>
      <input
        className={styles.code}
        id={id}
        name="code"
        type="text"
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={email ? "[0-9]{6,10}" : "[0-9]{6}"}
        minLength={6}
        maxLength={email ? 10 : 6}
        required
      />
    </>
  );
}

function RecoveryInstructions() {
  return (
    <p>
      如果你失去驗證器，請用公司已登記嘅聯絡方法搵 Convelta
      營運團隊，安排獨立核實身份同重新綁定裝置。收唔到驗證電郵，可以先查垃圾郵件，再請管理員核對帳戶記錄。請自行保管密碼、設定金鑰同驗證碼。
    </p>
  );
}

function MailboxForm({ alreadySent }: { alreadySent: boolean }) {
  const [delivery, send, sending] = useActionState(beginMailboxProof, initial);
  const [confirmation, confirm, confirming] = useActionState(
    confirmEmailCode,
    initial,
  );
  const sent = alreadySent || delivery.sent;
  return (
    <>
      {sent ? (
        <>
          <p role="status">
            請喺呢個瀏覽器開啟驗證電郵入面嘅連結。如果郵件附有驗證碼，亦可以喺下面輸入。
          </p>
          <form action={confirm} className="sv-login-form">
            <CodeField email />
            {confirmation.error && <p role="alert">{confirmation.error}</p>}
            <button disabled={confirming || sending}>
              {confirming ? "正在核實…" : "確認電郵驗證碼"}
            </button>
          </form>
        </>
      ) : (
        <p>首次設定驗證器之前，我哋會先用你帳戶已登記嘅電郵核實身份。</p>
      )}
      <form action={send} className="sv-login-form">
        {delivery.error && <p role="alert">{delivery.error}</p>}
        <button
          className={sent ? styles.secondary : undefined}
          disabled={sending || confirming}
        >
          {sending ? "正在傳送…" : sent ? "重新傳送驗證電郵" : "傳送驗證電郵"}
        </button>
      </form>
    </>
  );
}

function AuthenticatorForm({
  newFactor,
  existingFactors,
}: {
  newFactor?: string;
  existingFactors?: Factor[];
}) {
  const [result, verify, pending] = useActionState(
    verifyAuthenticator,
    initial,
  );
  const selectId = useId();
  return (
    <form className="sv-login-form" action={verify}>
      {newFactor && <input type="hidden" name="factor" value={newFactor} />}
      {existingFactors && (
        <>
          <label htmlFor={selectId}>選擇你本人持有嘅驗證器</label>
          <select
            id={selectId}
            className={styles.select}
            name="factor"
            defaultValue=""
            required
          >
            <option value="" disabled>
              請選擇驗證器
            </option>
            {existingFactors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.name}
              </option>
            ))}
          </select>
        </>
      )}
      <CodeField />
      {result.error && <p role="alert">{result.error}</p>}
      <button disabled={pending}>
        {pending
          ? "正在核實…"
          : newFactor || existingFactors
            ? "確認並綁定驗證器"
            : "驗證並繼續"}
      </button>
    </form>
  );
}

function EnrollmentForm({ factors }: { factors: Factor[] }) {
  const [setup, enroll, pending] = useActionState(startEnrollment, initial);
  if (setup.factor && (setup.qr || setup.secret)) {
    return (
      <>
        <p>
          開啟驗證器 App，加入帳戶並掃描 QR 碼，再輸入 App 顯示嘅 6 位數字。
        </p>
        {setup.qr?.startsWith("data:image/") && (
          <Image
            src={setup.qr}
            alt="用驗證器 App 掃描以綁定此帳戶"
            width={200}
            height={200}
            unoptimized
            className={styles.qr}
          />
        )}
        {setup.secret && (
          <details className={styles.details}>
            <summary>喺同一部手機設定？顯示手動輸入金鑰</summary>
            <p>
              喺驗證器選擇「手動輸入金鑰」同「按時間產生驗證碼」，然後輸入以下金鑰。
            </p>
            <code className={styles.secret} dir="ltr">
              {setup.secret}
            </code>
          </details>
        )}
        <AuthenticatorForm newFactor={setup.factor} />
      </>
    );
  }
  return (
    <>
      <p>
        喺你自己嘅手機開啟驗證器 App，例如 Apple「密碼」、Google Authenticator
        或 Microsoft Authenticator。
      </p>
      <form className="sv-login-form" action={enroll}>
        {setup.error && <p role="alert">{setup.error}</p>}
        <button disabled={pending}>
          {pending ? "正在準備…" : "設定新驗證器"}
        </button>
      </form>
      {factors.length > 0 && (
        <details className={styles.details}>
          <summary>使用已經喺我手機上嘅驗證器</summary>
          <AuthenticatorForm existingFactors={factors} />
        </details>
      )}
    </>
  );
}

export function MfaForm({
  view,
  factors,
}: {
  view: MfaView;
  factors: Factor[];
}) {
  if (view === "recovery") return <RecoveryInstructions />;
  return (
    <div className={styles.content}>
      {(view === "email" || view === "sent") && (
        <MailboxForm alreadySent={view === "sent"} />
      )}
      {view === "setup" && <EnrollmentForm factors={factors} />}
      {view === "verify" && (
        <>
          <p>開啟已綁定嘅驗證器，輸入 Convelta 帳戶目前顯示嘅驗證碼。</p>
          <AuthenticatorForm />
        </>
      )}
      <details className={styles.details}>
        <summary>收唔到電郵，或者用唔到驗證器？</summary>
        <RecoveryInstructions />
      </details>
    </div>
  );
}
