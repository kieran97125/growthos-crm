"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  FileQuestion,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import { canManage } from "@/lib/saas/identity";
import { Modal } from "@/components/crm/conversations/WorkspacePrimitives";
import { uid, actionTime } from "@/components/crm/conversations/events";
import { articleSchema, type Article } from "@/components/crm/studio/model";
import type { StudioController } from "@/components/crm/studio/useStudioStore";
import WebsiteKnowledgeImport from "./WebsiteKnowledgeImport";
import "./website-import.css";

export default function BrandKnowledge({
  studio,
  brandId,
}: {
  studio: StudioController;
  brandId: string;
}) {
  const identity = useIdentity();
  const manageable = canManage(identity.actor.role);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Article | null>(null);
  const [error, setError] = useState("");
  const articles = studio.state.articles.filter((a) => a.brandId === brandId);
  const results = articles.filter((a) =>
    `${a.title} ${a.content}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const today = new Date(actionTime() + 8 * 3600000).toISOString().slice(0, 10);
  function edit(article?: Article) {
    setError("");
    setEditing(
      article ?? {
        id: uid(),
        clientId: identity.scope.companyId,
        brandId,
        title: "",
        content: "",
        keywords: [],
        source: "手動新增",
        status: "approved",
        revision: 1,
        validUntil: "9999-12-31",
      },
    );
  }
  return (
    <section className="kb-library" aria-label="品牌 FAQ">
      {manageable && (
        <WebsiteKnowledgeImport
          key={brandId}
          companyId={identity.scope.companyId}
          brandId={brandId}
          connected={identity.connected}
        />
      )}
      <div className="kb-toolbar">
        <div className="kb-list-title">
          <h2>常見問題</h2>
          <span>{articles.length}</span>
        </div>
        <div className="kb-list-actions">
          <label className="kb-search">
            <Search size={17} />
            <input
              aria-label="搜尋 FAQ"
              placeholder="搜尋問題或答案"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {manageable && (
            <button className="st-button kb-add" onClick={() => edit()}>
              <Plus size={17} />
              新增 FAQ
            </button>
          )}
        </div>
      </div>
      <div className="kb-list">
        {results.map((a) => (
          <details className="kb-item" key={a.id} name={`brand-faq-${brandId}`}>
            <summary>
              <span className="kb-q" aria-hidden="true">
                Q
              </span>
              <strong>{a.title}</strong>
              {(a.status !== "approved" || a.validUntil < today) && (
                <span className="kb-inactive">暫停使用</span>
              )}
              <ChevronDown size={17} />
            </summary>
            <div className="kb-answer">
              <p>{a.content}</p>
              <div className="kb-answer-actions">
                {manageable && (
                  <button
                    className="kb-edit"
                    aria-label={`修改 FAQ ${a.title}`}
                    onClick={() => edit(a)}
                  >
                    <Pencil size={15} />
                    修改答案
                  </button>
                )}
                <details className="kb-source">
                  <summary>
                    來源 <ChevronDown size={12} />
                  </summary>
                  <div>
                    {a.website ? (
                      <>
                        <a
                          href={a.website.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {new URL(a.website.url).hostname}
                          <ArrowUpRight size={13} />
                        </a>
                        <span>
                          掃描於{" "}
                          {new Date(a.website.fetchedAt).toLocaleDateString(
                            "zh-HK",
                            { timeZone: "Asia/Hong_Kong" },
                          )}
                        </span>
                        {a.website.truncated && <span>已截取網站部分內容</span>}
                      </>
                    ) : (
                      <span>{a.source}</span>
                    )}
                  </div>
                </details>
              </div>
            </div>
          </details>
        ))}
        {!results.length && (
          <div className="kb-empty">
            <FileQuestion size={30} />
            <h3>{query ? "搵唔到相關 FAQ" : "由你嘅網站開始"}</h3>
            <p>
              {query
                ? "試下另一個關鍵字。"
                : "掃描網站，或者直接新增第一條問題同答案。"}
            </p>
          </div>
        )}
      </div>
      {editing && (
        <Modal
          title={editing.title ? "修改 FAQ" : "新增 FAQ"}
          onClose={() => setEditing(null)}
        >
          <form
            className="kb-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const article = {
                ...editing,
                title: String(data.get("question")).trim(),
                content: String(data.get("answer")).trim(),
                status: "approved" as const,
                validUntil: "9999-12-31",
                revision:
                  editing.revision +
                  (articles.some((a) => a.id === editing.id) ? 1 : 0),
              };
              if (!articleSchema.safeParse(article).success) {
                setError("請填好問題同答案。");
                return;
              }
              if (
                !articles.some((a) => a.id === article.id) &&
                studio.state.articles.length >= 100
              ) {
                setError("知識庫已達 100 條上限。");
                return;
              }
              studio.dispatch({ type: "article", article });
              setEditing(null);
            }}
          >
            <label>
              問題
              <input
                name="question"
                  aria-label="問題"
                required
                maxLength={100}
                defaultValue={editing.title}
                placeholder="例如：你哋提供咩服務？"
              />
            </label>
            <label>
              答案
              <textarea
                name="answer"
                  aria-label="答案"
                required
                rows={7}
                maxLength={5000}
                defaultValue={editing.content}
                placeholder="寫低你想 C 使用嘅答案。"
              />
            </label>
            {error && (
              <p role="alert" className="wi-error">
                {error}
              </p>
            )}
            <footer>
              <button
                className="st-button"
                type="button"
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button className="st-button st-primary" type="submit">
                儲存
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
