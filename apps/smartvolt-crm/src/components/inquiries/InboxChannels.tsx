"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import type { WebChatReadiness } from "@/lib/web-chat/model";
import { Globe2, MessagesSquare } from "lucide-react";
import UnifiedInbox from "./UnifiedInbox";
import WebChatInbox from "@/components/web-chat/WebChatInbox";

/** The company inbox keeps channel drafts alive when operators switch sources. */
export default function InboxChannels(
  props: ComponentProps<typeof UnifiedInbox> & {
    actorId: string;
    websiteReadiness: WebChatReadiness;
  },
) {
  const websiteReady = props.websiteReadiness === "ready";
  const fromWebsite = props.initialProvider === "website";
  const startsOnWebsite = websiteReady && fromWebsite;
  const socialProps = fromWebsite ? {
    ...props,
    initialProvider: undefined,
    initialThread: undefined,
    initialCustomer: undefined,
    initialQueue: undefined,
  } : props;
  const [selectedChannel, setChannel] = useState<"social" | "website">(
    startsOnWebsite ? "website" : "social",
  );
  const channel = websiteReady ? selectedChannel : "social";
  const [websiteVisited, setWebsiteVisited] = useState(startsOnWebsite);
  const positions = useRef({
    social: {
      provider: socialProps.initialProvider ?? "",
      thread: socialProps.initialThread ?? "",
    },
    website: {
      provider: "website",
      thread: startsOnWebsite ? (props.initialThread ?? "") : "",
    },
  });

  useEffect(() => {
    if (websiteReady || !fromWebsite) return;
    const url = new URL(window.location.href);
    for (const key of ["provider", "thread", "contact", "queue"])
      url.searchParams.delete(key);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [websiteReady, fromWebsite]);

  function choose(next: "social" | "website") {
    if ((next === "website" && !websiteReady) || next === channel) return;
    setChannel(next);
    if (next === "website") setWebsiteVisited(true);
    const url = new URL(window.location.href);
    positions.current[channel] = {
      provider: url.searchParams.get("provider") ?? "",
      thread: url.searchParams.get("thread") ?? "",
    };
    for (const key of ["thread", "provider", "contact"])
      url.searchParams.delete(key);
    const position = positions.current[next];
    if (position.provider) url.searchParams.set("provider", position.provider);
    if (position.thread) url.searchParams.set("thread", position.thread);
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  return (
    <div className="iq-inbox-channels">
      <nav className="iq-channel-tabs" aria-label="收件匣來源">
        <button
          type="button"
          aria-pressed={channel === "social"}
          onClick={() => choose("social")}
        >
          <MessagesSquare size={16} aria-hidden="true" />
          社交訊息
        </button>
        <button
          type="button"
          aria-pressed={channel === "website"}
          disabled={!websiteReady}
          title={!websiteReady ? (props.websiteReadiness === "pending" ? "網站聊天準備中" : "網站聊天暫時未能使用") : undefined}
          onClick={() => choose("website")}
        >
          <Globe2 size={16} aria-hidden="true" />
          網站訊息
          {!websiteReady && (
            <small role="status">{props.websiteReadiness === "pending" ? "準備中" : "暫未開放"}</small>
          )}
        </button>
      </nav>
      <div className="iq-channel-pane" hidden={channel !== "social"}>
        <UnifiedInbox {...socialProps} active={channel === "social"} />
      </div>
      {websiteReady && websiteVisited && (
        <div className="iq-channel-pane" hidden={channel !== "website"}>
          <WebChatInbox
            key={props.companyId}
            companyId={props.companyId}
            actorId={props.actorId}
            initialThreadId={startsOnWebsite ? props.initialThread : undefined}
            active={channel === "website"}
          />
        </div>
      )}
    </div>
  );
}

