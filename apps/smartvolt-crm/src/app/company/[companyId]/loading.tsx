export default function LoadingCompanyModule() {
  return (
    <div
      className="cq-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="cq-loading-bar" />
      <span>正在開啟工作區…</span>
      <div className="cq-loading-grid">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
