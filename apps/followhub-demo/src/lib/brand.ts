/** Platform identity only; client workspace identities belong to their own scope. */
export const BRAND = {
  name: "KiesTECH",
  title: "KiesTECH · 客戶對話工作台",
  auditFilename: "kiestech-campaign-audit.csv",
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

/** The K stays inside the central maskable safe area at every icon size. */
export const K_MARK = {
  stem: "M10 10H16V30H10Z",
  upper: "M17 20L25 10H32L24 20Z",
  lower: "M17 20H24L32 30H25Z",
} as const;
