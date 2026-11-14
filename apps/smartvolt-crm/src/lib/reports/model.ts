export type ReportPage = {
  coverageFrom: string;
  hasPos: boolean;
  canManageCosts: boolean;
  brands: { id: string; name: string }[];
  query: {
    from: string;
    to: string;
    asOf: string;
    brand: string;
    mode: "period" | "cohort";
  };
  metrics: {
    inquiries: number;
    customers: number;
    confirmed: number;
    attended: number;
    baselineUnknown: number;
    receiptsCents: number | null;
    refundsCents: number | null;
    unassociated: number;
  };
  trend: { day: string; inquiries: number; confirmed: number }[];
  channels: { channel: string; inquiries: number }[];
  staff: {
    id: string;
    name: string;
    replies: number;
    response_minutes: number;
  }[];
  campaignTotal: number;
  nextCampaign: string | null;
  nextEvent: string | null;
  campaigns: {
    id: string;
    name: string;
    created_at: string;
    recipients: number;
    delivered: number;
    replied: number;
    optouts: number;
    confirmed: number;
    attended: number;
    net_cents: number | null;
    cost_cents: number | null;
    cost_source: string | null;
    cost_revision: number | null;
  }[];
  events: {
    id: string;
    source_key: string;
    source_version: string;
    kind: string;
    occurred_at: string | null;
    observed_at: string;
    amount_cents: number | null;
    baseline: boolean;
    product: string;
  }[];
};
export const outcomeNames: Record<string, string> = {
  confirmed: "確認預約",
  cancelled: "取消預約",
  attended: "到店紀錄",
  payment: "核實收款",
  refund: "核實退款",
  purchase: "全額付款",
};
export const reportMoney = (cents: number | null) =>
  cents === null
    ? "—"
    : new Intl.NumberFormat("zh-HK", {
        style: "currency",
        currency: "HKD",
      }).format(cents / 100);
