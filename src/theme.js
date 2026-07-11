// Design tokens — white/premium, één accentkleur per gekozen thema (zie project plan §4)
// THEMES: een paar doordachte, complete kleurthema's (geen vrije RGB-keuze — dat breekt
// de premium-uitstraling). Elk thema heeft precies dezelfde tokens, dus componenten
// hoeven nooit te weten welk thema actief is.
export const THEMES = {
  paars: {
    light: {
      bg: "#F6F4FB", card: "#FFFFFF", ink: "#1F2430", sub: "#5B6472",
      line: "#E9E6F2", accent: "#7C3AED", accentDk: "#5B21B6",
      soft: "#F1EDFB", green: "#16A34A", amber: "#F59E0B", chip: "#EFEAFB", danger: "#EF4444",
    },
    dark: {
      bg: "#121016", card: "#1C1824", ink: "#EDEAF4", sub: "#9A93AC",
      line: "#2A2434", accent: "#9F67FF", accentDk: "#C4A5FF",
      soft: "#241E31", green: "#4ADE80", amber: "#FBBF24", chip: "#2B2340", danger: "#F87171",
    },
    label: "Paars", swatch: "#7C3AED",
  },
  blauw: {
    light: {
      bg: "#F3F6FD", card: "#FFFFFF", ink: "#1B2333", sub: "#57657C",
      line: "#E3EAF7", accent: "#2563EB", accentDk: "#1D4ED8",
      soft: "#EAF0FC", green: "#16A34A", amber: "#F59E0B", chip: "#E3ECFC", danger: "#EF4444",
    },
    dark: {
      bg: "#10151F", card: "#182130", ink: "#E9EEF7", sub: "#8FA0B8",
      line: "#243044", accent: "#5B9BFF", accentDk: "#8FBBFF",
      soft: "#1B2536", green: "#4ADE80", amber: "#FBBF24", chip: "#1F2C42", danger: "#F87171",
    },
    label: "Blauw", swatch: "#2563EB",
  },
  groen: {
    light: {
      bg: "#F3FAF5", card: "#FFFFFF", ink: "#1B2A22", sub: "#54685C",
      line: "#E1F0E6", accent: "#059669", accentDk: "#047857",
      soft: "#E9F6EE", green: "#16A34A", amber: "#F59E0B", chip: "#E1F3E8", danger: "#EF4444",
    },
    dark: {
      bg: "#0F1813", card: "#16221B", ink: "#E7F3EB", sub: "#8DAA97",
      line: "#20342A", accent: "#34D399", accentDk: "#6EE7B7",
      soft: "#182821", green: "#4ADE80", amber: "#FBBF24", chip: "#1B2E24", danger: "#F87171",
    },
    label: "Groen", swatch: "#059669",
  },
  amber: {
    light: {
      bg: "#FBF6EF", card: "#FFFFFF", ink: "#2B2116", sub: "#6B5B45",
      line: "#F0E4CE", accent: "#D97706", accentDk: "#B45309",
      soft: "#F6EEDC", green: "#16A34A", amber: "#F59E0B", chip: "#F3E8CF", danger: "#EF4444",
    },
    dark: {
      bg: "#1A140C", card: "#241C12", ink: "#F4ECDD", sub: "#B7A488",
      line: "#33291A", accent: "#FBBF24", accentDk: "#FDE68A",
      soft: "#2A2115", green: "#4ADE80", amber: "#FBBF24", chip: "#2E2415", danger: "#F87171",
    },
    label: "Amber", swatch: "#D97706",
  },
};

export const THEME_CHOICES = Object.keys(THEMES); // ["paars","blauw","groen","amber"]

// Backwards compatible: bestaande imports van {light, dark} blijven het paarse thema geven.
export const light = THEMES.paars.light;
export const dark = THEMES.paars.dark;

// Bouwt het uiteindelijke thema-object dat door de app gebruikt wordt, inclusief de
// instellingen-sliders (tekstgrootte / afronding) — components lezen t.radius / t.textScale
// met een veilige standaardwaarde als een scherm ze niet doorgeeft.
export function buildTheme({ themeChoice = "paars", dark: isDark = false, radiusScale = 1, textScale = 1 } = {}) {
  const palette = THEMES[themeChoice] || THEMES.paars;
  const base = isDark ? palette.dark : palette.light;
  return { ...base, radiusScale, textScale, radius: Math.round(18 * radiusScale) };
}

// Amounts are stored in cents; family currency is configurable (€ default)
export const fmt = (cents, cur = "€") =>
  `${cur} ${(cents / 100).toFixed(2).replace(".", cur === "€" ? "," : ".")}`;

// Junior motivation bar wording (under 12): no percentages, just encouragement
export const jrWord = (p) =>
  p >= 1 ? "GEHAALD! 🎉" : p >= 0.8 ? "Bijna!" : p >= 0.5 ? "Over de helft!"
  : p >= 0.25 ? "Lekker bezig!" : "Net begonnen";
