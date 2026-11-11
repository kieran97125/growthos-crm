import DemoApp from "./DemoApp";
import type { WorkspaceView } from "@/components/crm/conversations/ConversationWorkspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const v = q.view ?? q.studio;
  const view: WorkspaceView = [
    "inbox",
    "flows",
    "bot",
    "broadcasts",
    "experience",
  ].includes(String(v))
    ? (v as WorkspaceView)
    : "experience";
  return <DemoApp view={view} />;
}
