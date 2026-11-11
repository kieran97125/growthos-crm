"use client";
import { useState } from "react";
import Link from "next/link";
import { DemoProvider } from "@/lib/demo/Provider";
import { createAppState } from "@/lib/demo/state";
import { AIProvider } from "@/lib/demo/AIConnection";
import { PreviewIdentity } from "@/lib/saas/CompanyProvider";
import {
  ConversationWorkspace,
  type WorkspaceView,
} from "@/components/crm/conversations/ConversationWorkspace";
import { BRANDS, TEAM } from "@/components/crm/conversations/model";
const companies = [
  {
    id: "preview-aurora",
    name: "Aurora Wellness",
    brandNames: ["Aurora Studio", "Aurora Care"],
  },
  {
    id: "preview-harbour",
    name: "Harbour Living",
    brandNames: ["Harbour Studio", "Harbour Care"],
  },
];
export default function Preview({
  view,
  contact,
  conversation,
}: {
  view: WorkspaceView;
  contact?: string;
  conversation?: string;
}) {
  const [createdAt] = useState(() => Date.now());
  const [companyId, setCompany] = useState(companies[0].id);
  const company = companies.find((c) => c.id === companyId)!;
  const scope = {
    companyId,
    companyName: company.name,
    brands: BRANDS.map((b, i) => ({ ...b, name: company.brandNames[i] })),
    team: [...TEAM],
  };
  const initial = createAppState(createdAt);
  initial.scope = scope;
  if (initial.pos) initial.pos.companyId = companyId;
  initial.inbox.contacts.forEach((c) => {
    c.clientId = companyId;
  });
  initial.inbox.conversations.forEach((c) => {
    c.clientId = companyId;
  });
  initial.studio.flows.forEach((f) => {
    f.clientId = companyId;
  });
  initial.studio.articles.forEach((a) => {
    a.clientId = companyId;
  });
  return (
    <div className="sv-preview-shell">
      <div className="sv-company-toolbar">
        <Link href="/login">← 公司登入</Link>
        <strong>示範工作空間</strong>
        <label>
          切換示範公司{" "}
          <select
            aria-label="切換示範公司"
            value={companyId}
            onChange={(e) => setCompany(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <span>虛構資料 · 此瀏覽器儲存 · 未接真實渠道</span>
      </div>
      <PreviewIdentity key={companyId} scope={scope}>
        <DemoProvider
          initialState={initial}
          storageKey={`smartvolt:preview:${companyId}:v1`}
        >
          <AIProvider>
            <ConversationWorkspace
              initialView={view}
              initialContact={contact}
              initialConversation={conversation}
            />
          </AIProvider>
        </DemoProvider>
      </PreviewIdentity>
    </div>
  );
}
