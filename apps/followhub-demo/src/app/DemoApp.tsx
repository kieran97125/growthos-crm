"use client";
import { DemoProvider } from "@/lib/demo/Provider";
import { AIProvider } from "@/lib/demo/AIConnection";
import {
  ConversationWorkspace,
  type WorkspaceView,
} from "@/components/crm/conversations/ConversationWorkspace";
export default function DemoApp({ view }: { view: WorkspaceView }) {
  return (
    <DemoProvider>
      <AIProvider>
        <ConversationWorkspace initialView={view} />
      </AIProvider>
    </DemoProvider>
  );
}
