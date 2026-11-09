import Link from "next/link";
import { ArrowUpRight, BookOpen, Boxes, CircleDot } from "lucide-react";
import { CrmShell } from "@/components/crm/CrmShell";
import { capabilities, capabilityStates } from "@/lib/crm/capabilities";
export default function SystemPage() {
  return (
    <CrmShell active="system">
      <div className="ops-workspace ops-scroll-page">
        <header className="ops-header">
          <div>
            <p className="ops-eyebrow">PRODUCT SYSTEMS / 10 NOV 2026</p>
            <h1>CRM 功能藍圖</h1>
            <p className="ops-muted">
              Omnichat 功能拆解，配合 Growth OS 原生嘅查詢、預約同成效流程。
            </p>
          </div>
          <span className="ops-mode">
            <Boxes size={16} />
            {capabilities.length} 個系統模組
          </span>
        </header>
        <div className="ops-page-body">
          <section className="ops-hero-note">
            <BookOpen size={23} />
            <div>
              <h2>來源、判斷與實作，分開記錄。</h2>
              <p>
                Omnichat
                功能依據官方網站同教學核實，未有登入後台逐項驗收。以下係我哋嘅產品設計同本地實作進度；正式渠道、AI、權限及工作佇列仍有明確接駁條件。
              </p>
            </div>
          </section>
          <div className="ops-system-grid">
            {capabilities.map((card) => (
              <article
                className="ops-card ops-system-card"
                key={card.id}
                id={card.id}
              >
                <div className="ops-card-title">
                  <span className="ops-eyebrow">
                    {card.id} / {card.phase}
                  </span>
                  <CircleDot size={15} />
                </div>
                <h2>{card.name}</h2>
                <span
                  className={`ops-badge ${card.state === "blocked" ? "ops-badge-warning" : ""}`}
                >
                  {capabilityStates[card.state]}
                </span>
                <p>{card.summary}</p>
                <dl>
                  <dt>下一步</dt>
                  <dd>{card.next}</dd>
                  <dt>完成條件</dt>
                  <dd>{card.acceptance}</dd>
                </dl>
                <div className="ops-card-links">
                  {card.href ? (
                    <Link href={card.href}>
                      打開模組
                      <ArrowUpRight size={14} />
                    </Link>
                  ) : null}
                  {card.source ? (
                    <a href={card.source} target="_blank" rel="noreferrer">
                      官方功能來源
                      <ArrowUpRight size={14} />
                    </a>
                  ) : (
                    <span className="ops-muted">Growth OS 架構要求</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </CrmShell>
  );
}
