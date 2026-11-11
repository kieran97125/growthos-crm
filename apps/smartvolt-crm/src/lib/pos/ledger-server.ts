import "server-only";
import { requireCompany } from "../saas/server";
import { requireProduct } from "../saas/products";
import { AccessError } from "../saas/identity";
import {
  ledgerCursor,
  ledgerPageSchema,
  ledgerRpcArgs,
  type LedgerQuery,
} from "./ledger-query";

export async function readLedger(companyId: string, query: LedgerQuery) {
  const access = await requireCompany(companyId);
  requireProduct(access.products, "pos");
  const { data, error } = await access.db.rpc(
    "sv_read_pos_ledger",
    ledgerRpcArgs(companyId, access.user.id, query),
  );
  if (error) {
    if (["access_denied", "product_not_purchased"].includes(error.message))
      throw new AccessError("你無權查閱此公司嘅 POS 帳簿。");
    if (error.message === "invalid_ledger_filter")
      throw new AccessError("查閱條件不正確，請重新選擇。", 400);
    throw new AccessError("暫時未能讀取交易帳簿，請稍後再試。", 503);
  }
  const page = ledgerPageSchema.parse(data);
  return { company: access.company, page, nextCursor: ledgerCursor(page) };
}
