"use client";

import { useRef, useState, type ComponentProps } from "react";
import { Globe2, MessagesSquare } from "lucide-react";
import UnifiedInbox from "./UnifiedInbox";
import WebChatInbox from "@/components/web-chat/WebChatInbox";

/** The company inbox keeps channel drafts alive when operators switch sources. */
export default function InboxChannels(
  props: ComponentProps<typeof UnifiedInbox> & { actorId: string },
) {
  const startsOnWebsite = props.initialProvider === "website";
  const [channel, setChannel] = useState<"social" | "website">(
    startsOnWebsite ? "website" : "social",
  );
  const [websiteVisited, setWebsiteVisited] = useState(startsOnWebsite);
  const positions = useRef({
    social: {
      provider: startsOnWebsite ? "" : (props.initialProvider ?? ""),
      thread: startsOnWebsite ? "" : (props.initialThread ?? ""),
    },
    website: {
      provider: "website",
      thread: startsOnWebsite ? (props.initialThread ?? "") : "",
    },
  });

  function choose(next: "social" | "website") {
    if (next === channel) return;
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
          onClick={() => choose("website")}
        >
          <Globe2 size={16} aria-hidden="true" />
          網站訊息
        </button>
      </nav>
      <div className="iq-channel-pane" hidden={channel !== "social"}>
        <UnifiedInbox {...props} active={channel === "social"} />
      </div>
      {websiteVisited && (
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
