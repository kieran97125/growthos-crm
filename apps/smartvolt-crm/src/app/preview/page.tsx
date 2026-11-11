import Preview from "./Preview";
import type { WorkspaceView } from "@/components/crm/conversations/ConversationWorkspace";
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; studio?: string }>;
}) {
  const q = await searchParams;
  const input = q.view ?? q.studio;
  const view: WorkspaceView = [
    "inbox",
    "flows",
    "bot",
    "broadcasts",
    "experience",
  ].includes(input ?? "")
    ? (input as WorkspaceView)
    : "inbox";
  return <Preview view={view} />;
}
