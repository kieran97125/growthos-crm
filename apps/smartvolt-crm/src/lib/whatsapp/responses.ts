/** Client-safe transport types. Private provider identities, evidence and credentials stay server-side. */
export type WaConnectionSummary = {
  id: string;
  companyId: string;
  brandId: string;
  appId: string;
  accountId: string;
  messagingAccountId: string | null;
  phoneNumberId: string;
  displayPhone: string | null;
  state: "configured" | "active" | "disabled";
  webhookVerifiedAt: string | null;
  lastInboundAt: number | null;
  createdAt: string;
  webhookUrl: string;
};
export type WaConversationSummary = {
  id: string;
  connectionId: string;
  contactId: string;
  brandId: string;
  customerName: string;
  customerPhone: string | null;
  status: "open" | "resolved";
  unreadCount: number;
  lastInboundAt: number | null;
  lastMessageAt: number | null;
  revision: number;
  lastMessagePreview: string;
  hasAdReferral: boolean;
};
export type WaMessageState =
  | "dispatching"
  | "accepted"
  | "unknown"
  | "sent"
  | "delivered"
  | "read"
  | "failed";
export type WaMessageSummary = {
  id: string;
  seq: number;
  direction: "incoming" | "outgoing" | "note";
  body: string;
  messageType: string;
  providerAt: number | null;
  createdAt: string;
  authorName: string | null;
  state: WaMessageState;
  /** Provider receipt time in milliseconds, independent from message creation. */
  statusAt?: number | null;
  errorCode: string | null;
  replyTo: string | null;
};
export type WaConnectionsResponse = {
  connections: WaConnectionSummary[];
  encryptionReady: boolean;
  brands: { id: string; name: string }[];
  canManage: boolean;
};
export type WaInboxResponse = {
  conversations: WaConversationSummary[];
  nextCursor: string | null;
};
export type WaMessagesResponse = {
  conversation: WaConversationSummary;
  messages: WaMessageSummary[];
  nextBefore: number | null;
};
export type WaSendResponse = {
  message: WaMessageSummary;
  state: WaMessageState;
  dispatch: boolean;
  warning?: string;
};
export type WaSaveConnectionResponse = {
  connection: WaConnectionSummary;
  webhookUrl: string;
  verifyToken: string;
};
