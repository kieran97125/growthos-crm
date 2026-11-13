export const replyGoals = {
  answer: {
    label: "解答問題",
    instruction:
      "Answer the actual question directly, then offer one relevant next step.",
  },
  book: {
    label: "引導預約",
    instruction:
      "Help the customer take one small step toward a booking: address their actual concern first, then ask one useful scheduling or service-preference question. Never pressure them or claim a slot is available/confirmed.",
  },
  objection: {
    label: "回應猶豫",
    instruction:
      "Identify and acknowledge the stated hesitation. Explain only verified benefits or policies, ask a gentle clarifying question, and never invent discounts, urgency or guarantees.",
  },
  follow_up: {
    label: "再次跟進",
    instruction:
      "Write a considerate follow-up tied to the actual conversation and unresolved need. Make it easy to reply, avoid guilt or repeated pressure, and do not pretend the person promised anything.",
  },
  empathy: {
    label: "安撫客人",
    instruction:
      "Acknowledge the customer's specific frustration without admitting unverified facts. Explain what staff can verify next. Do not promise refunds, clinical outcomes or completed actions.",
  },
  concise: {
    label: "精簡潤飾",
    instruction:
      "Provide a short, natural Cantonese reply to the latest message, keeping essential verified facts and one clear next step. Do not change the meaning or add new promises.",
  },
} as const;
export type ReplyGoal = keyof typeof replyGoals;
