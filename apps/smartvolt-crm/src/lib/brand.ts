/** Platform identity only; client workspace identities belong to their own scope. */
export const BRAND = {
  name: "SmartVolt",
  title: "SmartVolt CRM · 客戶對話工作台",
  auditFilename: "smartvolt-campaign-audit.csv",
  colors: {
    royal: "#2457e7",
    strong: "#1a43bc",
    ink: "#15233b",
    text: "#34445e",
    muted: "#52617a",
    silver: "#b9c5d8",
    silverLight: "#cbd7ef",
    line: "#dce3ee",
    divider: "#e8edf5",
    canvas: "#f4f7fc",
    panel: "#f8fafd",
    tint: "#eaf0ff",
    selected: "#dce7ff",
  },
} as const;

export const BRAND_CSS = Object.fromEntries(
  Object.entries(BRAND.colors).map(([key, value]) => [`--kies-${key}`, value]),
);

/** SmartVolt mark remains inside the central maskable safe area at every size. */
export const K_MARK = {
  stem: "M12 10H30V15H17V18H27V30H9V25H22V22H12Z",
  upper: "M27 9L23 17H29L25 25L34 14H28L31 9Z",
  lower: "M9 10H12V15H9Z",
} as const;
