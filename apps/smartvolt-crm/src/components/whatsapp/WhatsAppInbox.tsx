"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  WaConnectionSummary,
  WaConnectionsResponse,
  WaConversationSummary,
  WaInboxResponse,
  WaMessageSummary,
  WaMessagesResponse,
  WaSendResponse,
} from "@/lib/whatsapp/responses";
import WhatsAppInboxView, { type PendingSend } from "./WhatsAppInboxView";
import {
  isForeground,
  serviceWindowOpen,
  whatsappRequest,
  WhatsAppRequestError,
  verifiedConnections,
  verifiedInbox,
  verifiedMessages,
  verifiedSend,
  verifiedCommand,
} from "./transport";

function mergeConversations(
  old: WaConversationSummary[],
  incoming: WaConversationSummary[],
) {
  const merged = new Map(old.map((c) => [c.id, c]));
  for (const c of incoming) {
    const previous = merged.get(c.id);
    if (!previous || c.revision >= previous.revision) merged.set(c.id, c);
  }
  return [...merged.values()].sort(
    (a, b) =>
      (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0) ||
      b.id.localeCompare(a.id),
  );
}
function mergeMessages(old: WaMessageSummary[], incoming: WaMessageSummary[]) {
  const merged = new Map(old.map((m) => [m.id, m]));
  // Receipt snapshots can race with send acknowledgements and other polls.
  // Delivered/read are irreversible. Sent/failed follow provider receipt time,
  // matching the database policy, so newer signed corrections remain visible.
  const rank: Record<WaMessageSummary["state"], number> = {
    dispatching: 0,
    unknown: 1,
    accepted: 2,
    sent: 3,
    failed: 4,
    delivered: 5,
    read: 6,
  };
  for (const message of incoming) {
    const previous = merged.get(message.id);
    const oldAt = previous?.statusAt ?? 0;
    const newAt = message.statusAt ?? 0;
    const bothAttemptReceipts =
      previous &&
      ["sent", "failed"].includes(previous.state) &&
      ["sent", "failed"].includes(message.state);
    const preserve =
      previous &&
      (bothAttemptReceipts
        ? oldAt > newAt ||
          (previous.state === "failed" &&
            message.state === "sent" &&
            oldAt === newAt)
        : rank[previous.state] > rank[message.state]);
    merged.set(
      message.id,
      preserve
        ? {
            ...message,
            state: previous.state,
            errorCode: previous.errorCode,
            statusAt: previous.statusAt,
          }
        : message,
    );
  }
  return [...merged.values()].sort((a, b) => a.seq - b.seq);
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "暫時未能讀取資料。";

export default function WhatsAppInbox({
  companyId,
  companyName,
  canSend,
  canManage,
}: {
  companyId: string;
  companyName: string;
  canSend: boolean;
  canManage: boolean;
}) {
  const base = `/api/companies/${encodeURIComponent(companyId)}/whatsapp`;
  const [connections, setConnections] = useState<WaConnectionSummary[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<WaConversationSummary[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [quotes, setQuotes] = useState<Record<string, WaMessageSummary | null>>(
    {},
  );
  const [pending, setPending] = useState<Record<string, PendingSend | null>>(
    {},
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  const mounted = useRef(false);
  const fetchGeneration = useRef(0);
  const pageBusy = useRef(false);
  const sendLocks = useRef(new Set<string>());
  const readMarks = useRef(new Set<string>());
  const scrollMode = useRef<"bottom" | { height: number; top: number } | null>(
    null,
  );
  const atBottomRef = useRef(true);
  const initialized = useRef(false);
  const historyInitialized = useRef(false);
  const newestSeq = useRef(0);
  const messageRequests = useRef(new Set<string>());
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const loadConnections = useCallback(async () => {
    try {
      const response = verifiedConnections(
        await whatsappRequest<WaConnectionsResponse>(`${base}/connections`),
      );
      if (mounted.current) {
        setConnections(response.connections);
        setConnectionError(null);
      }
    } catch (e) {
      if (mounted.current) setConnectionError(errorText(e));
    } finally {
      if (mounted.current) setConnectionsLoading(false);
    }
  }, [base]);

  const loadInbox = useCallback(
    async (more = false) => {
      if (pageBusy.current) return;
      pageBusy.current = true;
      if (more) setLoadingMore(true);
      try {
        const response = verifiedInbox(
          await whatsappRequest<WaInboxResponse>(
            `${base}/inbox?limit=40${more && nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ""}`,
          ),
        );
        if (!mounted.current) return;
        setConversations((old) =>
          mergeConversations(old, response.conversations),
        );
        if (more || !initialized.current) setNextCursor(response.nextCursor);
        initialized.current = true;
        setError(null);
      } catch (e) {
        if (mounted.current) setError(errorText(e));
      } finally {
        pageBusy.current = false;
        if (mounted.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [base, nextCursor],
  );

  const loadMessages = useCallback(
    async (id: string, older?: number) => {
      const generation = fetchGeneration.current;
      const requestKey = `${generation}:${id}:${older ?? "latest"}`;
      if (messageRequests.current.has(requestKey)) return;
      messageRequests.current.add(requestKey);
      try {
        const response = verifiedMessages(
          await whatsappRequest<WaMessagesResponse>(
            `${base}/conversations/${encodeURIComponent(id)}/messages?limit=60${older !== undefined ? `&before=${older}` : ""}`,
          ),
        );
        if (
          !mounted.current ||
          generation !== fetchGeneration.current ||
          selectedRef.current !== id
        )
          return;
        // Fill every intervening page after a burst so polling never leaves a
        // silent gap between the existing history and the newest page.
        const incoming = [...response.messages];
        let gapCursor = response.nextBefore;
        while (
          older === undefined &&
          newestSeq.current > 0 &&
          gapCursor !== null &&
          incoming.length > 0 &&
          incoming[0].seq > newestSeq.current
        ) {
          const gap = verifiedMessages(
            await whatsappRequest<WaMessagesResponse>(
              `${base}/conversations/${encodeURIComponent(id)}/messages?limit=60&before=${gapCursor}`,
            ),
          );
          if (
            !mounted.current ||
            generation !== fetchGeneration.current ||
            selectedRef.current !== id
          )
            return;
          if (!gap.messages.length) break;
          incoming.unshift(...gap.messages);
          if (gap.nextBefore === gapCursor) break;
          gapCursor = gap.nextBefore;
        }
        const pane = listRef.current;
        if (older !== undefined && pane)
          scrollMode.current = {
            height: pane.scrollHeight,
            top: pane.scrollTop,
          };
        else if (atBottomRef.current) scrollMode.current = "bottom";
        setConversations((old) =>
          mergeConversations(old, [response.conversation]),
        );
        setMessages((old) => mergeMessages(old, incoming));
        newestSeq.current = incoming.reduce(
          (latest, item) => Math.max(latest, item.seq),
          newestSeq.current,
        );
        if (older !== undefined || !historyInitialized.current)
          setNextBefore(response.nextBefore);
        historyInitialized.current = true;
        setMessageError(null);
      } catch (e) {
        if (
          mounted.current &&
          generation === fetchGeneration.current &&
          selectedRef.current === id
        )
          setMessageError(errorText(e));
      } finally {
        messageRequests.current.delete(requestKey);
        if (
          mounted.current &&
          generation === fetchGeneration.current &&
          selectedRef.current === id
        ) {
          setMessagesLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [base],
  );

  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => {
      setNow(Date.now());
      void loadConnections();
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
    };
  }, [loadConnections]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadInbox(), 0);
    return () => clearTimeout(initial);
  }, [loadInbox]);

  const selectConversation = useCallback((id: string | null) => {
    if (selectedRef.current === id) return;
    selectedRef.current = id;
    fetchGeneration.current += 1;
    setSelectedId(id);
    setMessages([]);
    setNextBefore(null);
    historyInitialized.current = false;
    newestSeq.current = 0;
    setMessageError(null);
    atBottomRef.current = true;
    setAtBottom(true);
    scrollMode.current = "bottom";
    if (id) setMessagesLoading(true);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      if (selectedId) void loadMessages(selectedId);
    }, 0);
    return () => clearTimeout(initial);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const refresh = () => {
      if (!isForeground()) return;
      setNow(Date.now());
      void loadInbox();
      void loadConnections();
      if (selectedRef.current) void loadMessages(selectedRef.current);
    };
    const timer = window.setInterval(refresh, 4000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadConnections, loadInbox, loadMessages]);

  useLayoutEffect(() => {
    const pane = listRef.current;
    if (!pane) return;
    const mode = scrollMode.current;
    if (mode === "bottom") pane.scrollTop = pane.scrollHeight;
    else if (mode) pane.scrollTop = mode.top + pane.scrollHeight - mode.height;
    scrollMode.current = null;
  }, [messages]);

  useEffect(() => {
    if (
      !canSend ||
      !selected ||
      !atBottom ||
      !selected.unreadCount ||
      !messages.length ||
      !isForeground()
    )
      return;
    const throughMessageId = messages[messages.length - 1].id;
    const mark = `${selected.id}:${throughMessageId}`;
    if (readMarks.current.has(mark)) return;
    readMarks.current.add(mark);
    void whatsappRequest<{ conversation: WaConversationSummary }>(
      `${base}/conversations/${encodeURIComponent(selected.id)}`,
      {
        method: "POST",
        body: JSON.stringify({
          kind: "read",
          clientId: crypto.randomUUID(),
          revision: selected.revision,
          throughMessageId,
        }),
      },
    )
      .then((response) => {
        const { conversation } = verifiedCommand(response, selected.id);
        if (mounted.current)
          setConversations((old) => mergeConversations(old, [conversation]));
      })
      .catch(() => {
        readMarks.current.delete(mark);
      });
  }, [atBottom, base, canSend, messages, selected]);

  const send = async (retry = false) => {
    const current = selected;
    if (!current || !canSend || sendLocks.current.has(current.id)) return;
    const saved = pending[current.id];
    const draft = drafts[current.id] || "";
    const attempt: PendingSend | null =
      retry && saved
        ? { ...saved, revision: current.revision, phase: "sending" }
        : !saved &&
            serviceWindowOpen(current.lastInboundAt, Date.now()) &&
            draft.trim() &&
            Array.from(draft).length <= 4096
          ? {
              clientId: crypto.randomUUID(),
              body: draft.trim(),
              ...(quotes[current.id]
                ? { replyTo: quotes[current.id]!.id }
                : {}),
              revision: current.revision,
              phase: "sending",
            }
          : null;
    if (!attempt) return;
    sendLocks.current.add(current.id);
    setPending((old) => ({ ...old, [current.id]: attempt }));
    setMessageError(null);
    try {
      const response = verifiedSend(
        await whatsappRequest<WaSendResponse>(
          `${base}/conversations/${encodeURIComponent(current.id)}/send`,
          {
            method: "POST",
            body: JSON.stringify({
              clientId: attempt.clientId,
              body: attempt.body,
              replyTo: attempt.replyTo,
              revision: attempt.revision,
            }),
          },
        ),
        attempt,
      );
      if (!mounted.current) return;
      setPending((old) => ({ ...old, [current.id]: null }));
      setDrafts((old) => ({ ...old, [current.id]: "" }));
      setQuotes((old) => ({ ...old, [current.id]: null }));
      if (selectedRef.current === current.id) {
        if (atBottomRef.current) scrollMode.current = "bottom";
        setMessages((old) => mergeMessages(old, [response.message]));
        setMessageError(response.warning || null);
        void loadMessages(current.id);
      }
      void loadInbox();
    } catch (e) {
      if (mounted.current) {
        const rejected =
          !saved &&
          e instanceof WhatsAppRequestError &&
          [400, 401, 403, 404, 409, 422].includes(e.status);
        setPending((old) => ({
          ...old,
          [current.id]: rejected ? null : { ...attempt, phase: "uncertain" },
        }));
        if (selectedRef.current === current.id) setMessageError(errorText(e));
        void loadInbox();
        if (selectedRef.current === current.id) void loadMessages(current.id);
      }
    } finally {
      sendLocks.current.delete(current.id);
    }
  };

  const resolve = async () => {
    if (!selected || !canSend || actionBusy) return;
    setActionBusy(true);
    try {
      const { conversation } = verifiedCommand(
        await whatsappRequest<{
          conversation: WaConversationSummary;
        }>(`${base}/conversations/${encodeURIComponent(selected.id)}`, {
          method: "POST",
          body: JSON.stringify({
            kind: selected.status === "resolved" ? "reopen" : "resolve",
            clientId: crypto.randomUUID(),
            revision: selected.revision,
          }),
        }),
        selected.id,
      );
      if (mounted.current)
        setConversations((old) => mergeConversations(old, [conversation]));
    } catch (e) {
      if (mounted.current && selectedRef.current === selected.id)
        setMessageError(errorText(e));
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  };
  const refresh = () => {
    void loadConnections();
    void loadInbox();
    if (selectedRef.current) void loadMessages(selectedRef.current);
  };
  const visible = conversations.filter((c) =>
    `${c.customerName} ${c.customerPhone || ""}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <WhatsAppInboxView
      companyId={companyId}
      companyName={companyName}
      canSend={canSend}
      canManage={canManage}
      connections={connections}
      conversations={visible}
      selected={selected}
      messages={messages}
      loading={loading || connectionsLoading}
      messagesLoading={messagesLoading}
      error={connectionError || error}
      messageError={messageError}
      query={query}
      draft={selectedId ? drafts[selectedId] || "" : ""}
      quote={selectedId ? quotes[selectedId] || null : null}
      pending={selectedId ? pending[selectedId] || null : null}
      nextCursor={nextCursor}
      nextBefore={nextBefore}
      loadingMore={loadingMore}
      now={now}
      atBottom={atBottom}
      actionBusy={actionBusy}
      listRef={listRef}
      onQuery={setQuery}
      onSelect={selectConversation}
      onBack={() => selectConversation(null)}
      onDraft={(value) => {
        if (selectedId) setDrafts((old) => ({ ...old, [selectedId]: value }));
      }}
      onQuote={(message) => {
        if (selectedId && !pending[selectedId])
          setQuotes((old) => ({ ...old, [selectedId]: message }));
      }}
      onSend={() => void send()}
      onRetry={() => void send(true)}
      onRefresh={refresh}
      onMore={() => {
        if (nextCursor) void loadInbox(true);
      }}
      onOlder={() => {
        if (selectedId && nextBefore !== null && !loadingMore) {
          setLoadingMore(true);
          void loadMessages(selectedId, nextBefore);
        }
      }}
      onScroll={() => {
        const pane = listRef.current;
        if (pane) {
          const bottom =
            pane.scrollHeight - pane.scrollTop - pane.clientHeight < 70;
          atBottomRef.current = bottom;
          setAtBottom(bottom);
        }
      }}
      onLatest={() => {
        const pane = listRef.current;
        if (pane) pane.scrollTop = pane.scrollHeight;
        atBottomRef.current = true;
        setAtBottom(true);
      }}
      onResolve={() => void resolve()}
    />
  );
}
