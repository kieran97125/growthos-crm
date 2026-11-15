import { BookOpen } from "lucide-react";
import type { MessageEvidence } from "@/lib/coaching/model";
export default function Evidence({
  messages,
  knowledge = [],
}: {
  messages: MessageEvidence[];
  knowledge?: { sourceId: string; quote: string }[];
}) {
  if (!messages.length && !knowledge.length) return null;
  return (
    <details className="coach-evidence">
      <summary>
        <BookOpen size={12} aria-hidden="true" />
        查看依據 · {messages.length + knowledge.length}
      </summary>
      {messages.map((item, index) => (
        <blockquote key={`${item.messageId}:${index}`}>{item.quote}</blockquote>
      ))}
      {!!knowledge.length && <p className="coach-muted">品牌知識</p>}
      {knowledge.map((item, index) => (
        <blockquote key={`${item.sourceId}:${index}`}>{item.quote}</blockquote>
      ))}
    </details>
  );
}
