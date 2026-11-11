"use client";
import { createContext, useContext } from "react";
import type { useDemo } from "@/lib/demo/Provider";
import type { useIdentity } from "@/lib/saas/CompanyProvider";
import type {
  Appointment,
  CatalogItem,
  Order,
  PosCommand,
  PosState,
  Resource,
} from "@/lib/pos/model";
export type Section =
  "today" | "calendar" | "cashier" | "packages" | "transactions" | "settings";
export type Dialog =
  | { kind: "appointment"; appointment?: Appointment; start?: string }
  | { kind: "appointment-detail"; id: string }
  | { kind: "customer" }
  | { kind: "customer-detail"; id: string; brandId?: string }
  | { kind: "payment"; id: string }
  | { kind: "receipt"; id: string }
  | { kind: "refund"; id: string }
  | { kind: "reverse"; id: string }
  | { kind: "catalog"; item?: CatalogItem }
  | { kind: "resource"; resource?: Resource }
  | { kind: "void"; id: string };
export type PosUI = {
  workspace: ReturnType<typeof useDemo>;
  identity: ReturnType<typeof useIdentity>;
  pos: PosState;
  brand: string;
  customer: string;
  setCustomer: (id: string) => void;
  date: string;
  run: (command: PosCommand, message?: string) => boolean;
  open: (dialog: Dialog | null) => void;
  customerDetails: (contactId?: string, brandId?: string) => void;
  checkout: (appointment?: Appointment, order?: Order) => void;
  customerName: (id: string) => string;
};
export const PosContext = createContext<PosUI | null>(null);
export function usePos() {
  const value = useContext(PosContext);
  if (!value) throw Error("POS context unavailable");
  return value;
}
export const newId = () => crypto.randomUUID();
export const statusLabels: Record<Appointment["status"], string> = {
  pending: "待確認",
  confirmed: "已確認",
  checked_in: "已到店",
  completed: "已完成",
  no_show: "未到店",
  cancelled: "已取消",
};
export const kindLabels = { service: "服務", package: "套票", product: "商品" };
