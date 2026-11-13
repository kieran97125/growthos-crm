import { test } from "node:test";
import assert from "node:assert/strict";
import {
  workspaceLocation,
  crmSections,
} from "../src/components/workspace/navigation";
import manifest from "../src/app/manifest";
import { BRAND } from "../src/lib/brand";
const company = "synthetic-company";
test("unified inbox and each CRM module resolve one stable navigation section", () => {
  for (const [path, search, expected] of [
    ["/crm", "?provider=whatsapp&thread=synthetic", "inbox"],
    ["/crm", "?view=flows", "flows"],
    ["/crm", "?view=bot", "knowledge"],
    ["/crm", "?view=broadcasts", "broadcasts"],
    ["/crm/customers", "", "customers"],
    ["/crm/operations", "?tab=followups", "operations"],
    ["/crm/ai", "", "ai"],
    ["/crm/meta", "", "settings"],
    ["/settings/whatsapp", "", "settings"],
  ]) {
    const route = workspaceLocation(
      company,
      ["crm", "pos"],
      `/company/${company}${path}`,
      search,
    );
    assert.equal(route.product, "crm");
    assert.equal(route.section, expected);
    assert.equal(crmSections.filter((s) => s.id === route.section).length, 1);
  }
});
test("POS-only settings and ledger retain the independent POS product", () => {
  assert.equal(
    workspaceLocation(company, ["pos"], `/company/${company}/settings`, "")
      .product,
    "pos",
  );
  assert.equal(
    workspaceLocation(company, ["crm", "pos"], `/company/${company}/ledger`, "")
      .product,
    "pos",
  );
  assert.equal(
    workspaceLocation(company, ["crm"], `/company/${company}/crm/ai`, "")
      .product,
    "crm",
  );
});
test("installed-app icons use new explicit paths instead of previously cached icon URLs", () => {
  const value = manifest();
  assert.equal(value.theme_color, "#2457e7");
  assert.equal(value.name, "Convelta");
  for (const icon of value.icons!) {
    assert.ok(icon.src.includes(BRAND.iconVersion));
    assert.notEqual(icon.src, "/icon/192");
    assert.notEqual(icon.src, "/icon/512");
  }
  assert.ok(value.icons!.some((icon) => icon.purpose === "maskable"));
});
