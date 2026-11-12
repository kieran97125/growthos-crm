/** Platform identity only; client workspace identities belong to their own scope. */
export const BRAND = {
  name: "Convelta",
  title: "Convelta · AI CRM · Booking · POS",
  description:
    "Convelta：串連客戶通訊、預約管理、CRM、POS 與 AI 輔助，讓每段對話接到下一步。",
  operator: "SmartVolt 智威特",
  urls: {
    website: "https://convelta.io",
    app: "https://app.convelta.io",
  },
  auditFilename: "convelta-campaign-audit.csv",
  unsavedFilename: "convelta-unsaved-changes.json",
  colors: {
    accent: "#ffe600",
    onAccent: "#171918",
    royal: "#30322c",
    strong: "#171918",
    ink: "#171918",
    text: "#454943",
    muted: "#646b60",
    silver: "#c9cec0",
    silverLight: "#ffe600",
    line: "#e5e7df",
    divider: "#edf0e5",
    canvas: "#fafbf6",
    panel: "#fdfef8",
    tint: "#fffde9",
    selected: "#fff5a3",
  },
} as const;

export const BRAND_CSS = Object.fromEntries(
  Object.entries(BRAND.colors).map(([key, value]) => [`--kies-${key}`, value]),
);

/** Convelta's C and connection point share the icon's central maskable safe area. */
export const BRAND_MARK = {
  body: "M28.49 11.51A12 12 0 1 0 28.49 28.49L24.95 24.95A7 7 0 1 1 24.95 15.05Z",
} as const;
