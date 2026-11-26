"use client";
import { replyScenarios } from "@/lib/ai/scenarios";

export default function ReplyScenarios({
  message,
  disabled,
  onChoose,
}: {
  message: string;
  disabled?: boolean;
  onChoose: (question: string) => void;
}) {
  const selected = replyScenarios.find((item) => item.question === message);
  return (
    <fieldset className="ai-scenarios" disabled={disabled}>
      <legend>揀一個常見情境</legend>
      <div>
        {replyScenarios.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={selected?.id === item.id}
            onClick={() => onChoose(item.question)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p>
        {selected
          ? `檢查重點：${selected.check}`
          : "選擇後可以修改問題，再按生成試答。每次生成計入公司 AI 用量。"}
      </p>
    </fieldset>
  );
}
