"use client";
import Preview from "./preview/Preview";
import type { WorkspaceView } from "@/components/crm/conversations/ConversationWorkspace";
export default function DemoApp({ view }: { view: WorkspaceView }) {
  return <Preview view={view} />;
}
