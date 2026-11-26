/** Questions are examples to edit, never answers or automatic model requests. */
export const replyScenarios = [
  {
    id: "service",
    label: "服務查詢",
    question: "想了解你哋提供咩服務，同埋適合邊類客人？",
    check: "答案有冇跟品牌資料，並先了解客戶需要。",
  },
  {
    id: "price",
    label: "價錢優惠",
    question: "服務收費幾多？而家有冇優惠？",
    check: "只引用有效收費；未核實嘅優惠交同事確認。",
  },
  {
    id: "booking",
    label: "預約意向",
    question: "我想預約星期六下午三點，可以幫我確認有位嗎？",
    check: "收集意向，唔會將未核實時段講成成功預約。",
  },
  {
    id: "unknown",
    label: "資料不足",
    question: "可唔可以提供知識庫未列明嘅特別安排，並保證即日完成？",
    check: "資料不足時清楚補問或交接，唔會自行作出承諾。",
  },
  {
    id: "complaint",
    label: "投訴退款",
    question: "我對上次服務唔滿意，想投訴同申請退款。",
    check: "保留客人需要，由同事處理投訴及退款判斷。",
  },
  {
    id: "human",
    label: "要求真人",
    question: "我想搵真人同事傾，請幫我轉接。",
    check: "尊重客人要求，清楚交代交接；試答唔會建立真實交接。",
  },
] as const;
export function replyScenario(id?: string) {
  return replyScenarios.find((item) => item.id === id);
}
