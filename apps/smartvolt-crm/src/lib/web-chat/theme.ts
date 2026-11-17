export const chatPalettes = [
  { name: "寶藍", color: "#2457E7" },
  { name: "紫羅蘭", color: "#7C3AED" },
  { name: "玫瑰", color: "#BE185D" },
  { name: "珊瑚", color: "#E85D4A" },
  { name: "森林", color: "#166534" },
  { name: "翡翠", color: "#047857" },
  { name: "青綠", color: "#0F766E" },
  { name: "湖藍", color: "#0369A1" },
  { name: "琥珀", color: "#D97706" },
  { name: "暖金", color: "#B5944D" },
  { name: "深灰", color: "#334155" },
  { name: "墨黑", color: "#171717" },
] as const;
export function chatTheme(value: unknown) {
  const accent =
    typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value)
      ? value.toUpperCase()
      : "#2457E7";
  const rgb = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
  const linear = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const onAccent =
    (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05)
      ? "#000000"
      : "#FFFFFF";
  const tint =
    "#" +
    rgb
      .map((v) =>
        Math.round(v * 0.08 + 255 * 0.92)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  return { accent, onAccent, tint };
}
