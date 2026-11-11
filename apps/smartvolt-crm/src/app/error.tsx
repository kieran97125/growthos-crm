"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: 48 }}>
      <h1>暫時未能開啟工作台</h1>
      <p>你可以重新載入頁面再試。</p>
      <button onClick={reset}>重新載入</button>
    </main>
  );
}
