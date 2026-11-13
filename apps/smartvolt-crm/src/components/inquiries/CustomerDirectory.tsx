"use client";
import {
  useWorkspaceChrome,
  useWorkspaceCustomer,
} from "@/components/workspace/context";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Inbox,
  Search,
  Store,
  UsersRound,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import type { CustomerDetail } from "@/lib/inquiries/model";
import CustomerPanel, { type Mutate } from "./CustomerPanel";
export default function CustomerDirectory({
  companyId,
  companyName,
  hasPos,
  canEdit,
  initialCustomer,
}: {
  companyId: string;
  companyName: string;
  hasPos: boolean;
  canEdit: boolean;
  initialCustomer?: string;
}) {
  const chrome = useWorkspaceChrome();
  const [list, setList] = useState<
      { id: string; name: string; phone: string }[]
    >([]),
    [after, setAfter] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string | null>(initialCustomer ?? null),
    [detail, setDetail] = useState<CustomerDetail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(initialCustomer ? "profile" : "list"),
    [pending, setPending] = useState<{
      kind: "inbox" | "customers";
      data: unknown;
    } | null>(null);
  const queryRef = useRef(query);
  const endpoint = `/api/companies/${companyId}/customers`;
  useWorkspaceCustomer("crm", {
    contactId: detail?.customer.id,
    brandId: detail?.customer.brandIds[0],
  });
  async function fetchData(
    path: string,
    data?: unknown,
    kind: "inbox" | "customers" = "customers",
  ) {
    const r = await fetch(
      (kind === "customers" ? endpoint : `/api/companies/${companyId}/inbox`) +
        path,
      {
        method: data ? "POST" : "GET",
        headers: data ? { "Content-Type": "application/json" } : undefined,
        body: data ? JSON.stringify(data) : undefined,
        cache: "no-store",
      },
    );
    const d = await r.json();
    if (!r.ok)
      throw Object.assign(new Error(d.error ?? "暫時未能讀取客戶資料。"), {
        status: r.status,
      });
    return d;
  }
  useEffect(() => {
    queryRef.current = query;
    let active = true;
    void fetch(endpoint + "?" + new URLSearchParams({ search: query }), {
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (active) {
          setList(d.customers);
          setAfter(d.nextAfter);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [endpoint, query]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    void fetch(endpoint + "?id=" + encodeURIComponent(selected), {
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [endpoint, selected]);
  const mutate: Mutate = async (kind, data) => {
    if (busy) return false;
    setBusy(true);
    setPending({ kind, data });
    setError("");
    try {
      await fetchData("", data, kind);
      setPending(null);
      if (selected) {
        const fresh = await fetchData("?id=" + encodeURIComponent(selected));
        setDetail(fresh);
        setList((old) =>
          old.map((c) =>
            c.id === fresh.customer.id
              ? { ...c, name: fresh.customer.name, phone: fresh.customer.phone }
              : c,
          ),
        );
      }
      return true;
    } catch (e) {
      if (
        (e as { status?: number }).status &&
        (e as { status: number }).status < 500
      ) {
        setPending(null);
        setError((e as Error).message);
        return false;
      }
      setError("儲存結果待確認，請核對同一操作。");
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return (
    <main
      className="iq-app iq-directory-app"
      data-mobile={mobile}
      data-shared-chrome={!!chrome}
    >
      {!chrome && (
        <>
          <header className="iq-header">
            <Link className="iq-brand" href={`/company/${companyId}/crm`}>
              <BrandMark />
              <b>Convelta</b>
              <span>CRM</span>
            </Link>
            <span className="iq-company">{companyName}</span>
            <nav>
              {hasPos && (
                <Link href={`/company/${companyId}/pos`}>
                  <Store size={15} />
                  切換 POS
                </Link>
              )}
            </nav>
          </header>
          <nav className="iq-rail" aria-label="CRM 功能">
            <Link href={`/company/${companyId}/crm`}>
              <Inbox size={19} />
              <span>收件匣</span>
            </Link>
            <Link
              aria-current="page"
              href={`/company/${companyId}/crm/customers`}
            >
              <UsersRound size={19} />
              <span>客戶</span>
            </Link>
          </nav>
        </>
      )}
      <section className="iq-directory" aria-label="公司客戶目錄">
        <h1>客戶</h1>
        <form
          className="iq-search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
          }}
        >
          <Search size={17} />
          <input
            aria-label="搜尋客戶"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            placeholder="姓名或電話…"
          />
          <button>搜尋</button>
        </form>
        {list.map((c) => (
          <button
            disabled={busy || !!pending}
            className="iq-directory-row"
            key={c.id}
            onClick={() => {
              setSelected(c.id);
              setDetail(null);
              setMobile("profile");
            }}
          >
            <span className="iq-avatar">{c.name.slice(0, 1)}</span>
            <div>
              <strong>{c.name}</strong>
              <small>{c.phone || "未提供電話"}</small>
            </div>
            <ArrowUpRight size={16} />
          </button>
        ))}
        {!list.length && <p className="iq-empty-small">未有符合條件嘅客戶。</p>}
        {after && (
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void fetchData(
                "?" + new URLSearchParams({ search: query, after }),
              )
                .then((d) => {
                  if (queryRef.current !== query) return;
                  setList((old) => [
                    ...new Map(
                      [...old, ...d.customers].map((c) => [c.id, c]),
                    ).values(),
                  ]);
                  setAfter(d.nextAfter);
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            載入更多客戶
          </button>
        )}
      </section>
      <section className="iq-context" aria-label="客戶詳情">
        <header>
          <button
            className="iq-mobile-back"
            aria-label="返回客戶目錄"
            onClick={() => setMobile("list")}
          >
            <ArrowLeft size={18} />
          </button>
          <span>客戶資料與營運紀錄</span>
        </header>
        {detail ? (
          <CustomerPanel
            key={detail.customer.id}
            data={detail}
            companyId={companyId}
            hasPos={hasPos}
            canEdit={canEdit}
            busy={busy || !!pending}
            mutate={mutate}
            onLoadMore={() => {
              void fetchData(
                `?id=${encodeURIComponent(detail.customer.id)}&before=${detail.nextEvent}`,
              )
                .then((d: CustomerDetail) =>
                  setDetail((old) =>
                    old
                      ? {
                          ...old,
                          events: [...old.events, ...d.events],
                          nextEvent: d.nextEvent,
                        }
                      : old,
                  ),
                )
                .catch((e) => setError(e.message));
            }}
          />
        ) : (
          <p className="iq-empty-small">選擇客戶查看完整記錄。</p>
        )}
      </section>
      {(!!error || !!pending) && (
        <div role="alert" className="iq-feedback is-error">
          {error}
          {pending && !busy ? (
            <button onClick={() => void mutate(pending.kind, pending.data)}>
              核對同一操作
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}
