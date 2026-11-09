import { ConversationWorkspace } from "@/components/crm/conversations/ConversationWorkspace";

export default async function CrmDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ studio?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialView =
    params.studio === "flows" || params.studio === "bot"
      ? params.studio
      : "inbox";
  return <ConversationWorkspace mode="demo" initialView={initialView} />;
}
