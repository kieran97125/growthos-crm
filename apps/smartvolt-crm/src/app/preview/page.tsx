import Preview from "./Preview";
import type { WorkspaceView } from "@/components/crm/conversations/ConversationWorkspace";
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    studio?: string;
    contact?: string;
    conversation?: string;
  }>;
}) {
  const q = await searchParams;
  const input = q.view ?? q.studio;
  const view: WorkspaceView = [
    "inbox",
    "flows",
    "bot",
    "broadcasts",
    "experience",
    "pos",
  ].includes(input ?? "")
    ? (input as WorkspaceView)
    : "inbox";
  return (
    <Preview view={view} contact={q.contact} conversation={q.conversation} />
  );
}
