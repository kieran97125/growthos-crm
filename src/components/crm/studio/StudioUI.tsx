"use client";
import {
  ArrowRight,
  BellRing,
  Bot,
  Check,
  CirclePlay,
  Clock3,
  FileText,
  GitBranch,
  Hand,
  ListChecks,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Workflow,
} from "lucide-react";
import { NODE_META, type Kind } from "./model";
export const NODE_ICONS = {
  trigger: CirclePlay,
  intent: Sparkles,
  condition: GitBranch,
  answer: Bot,
  form: ListChecks,
  followup: FileText,
  review: UserRoundCheck,
  reminder: BellRing,
  handoff: Hand,
  message: MessageSquare,
  delay: Clock3,
  end: Check,
};
export function NodeGlyph({ kind, size = 17 }: { kind: Kind; size?: number }) {
  const Icon = NODE_ICONS[kind];
  return (
    <span className={`st-glyph st-tone-${NODE_META[kind].tone}`}>
      <Icon size={size} />
    </span>
  );
}
export function StudioStatus() {
  return (
    <span className="st-status">
      <ShieldCheck size={12} />
      設計示範 · 真實發送未啟用
    </span>
  );
}
export function StudioLoading() {
  return (
    <section className="st-loading">
      <Workflow size={28} />
      <span>正在開啟工作室…</span>
    </section>
  );
}
export function StageLabel({ children }: { children: string }) {
  return (
    <span className="st-stage-label">
      <ArrowRight size={11} />
      {children}
    </span>
  );
}
