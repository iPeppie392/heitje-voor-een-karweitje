// Design tokens — white/premium with a single violet accent (see project plan §4)
export const light = {
  bg: "#F6F4FB", card: "#FFFFFF", ink: "#1F2430", sub: "#5B6472",
  line: "#E9E6F2", accent: "#7C3AED", accentDk: "#5B21B6",
  soft: "#F1EDFB", green: "#16A34A", amber: "#F59E0B", chip: "#EFEAFB", danger: "#EF4444",
};

export const dark = {
  bg: "#121016", card: "#1C1824", ink: "#EDEAF4", sub: "#9A93AC",
  line: "#2A2434", accent: "#9F67FF", accentDk: "#C4A5FF",
  soft: "#241E31", green: "#4ADE80", amber: "#FBBF24", chip: "#2B2340", danger: "#F87171",
};

// Amounts are stored in cents; family currency is configurable (€ default)
export const fmt = (cents, cur = "€") =>
  `${cur} ${(cents / 100).toFixed(2).replace(".", cur === "€" ? "," : ".")}`;

// Junior motivation bar wording (under 12): no percentages, just encouragement
export const jrWord = (p) =>
  p >= 1 ? "GEHAALD! 🎉" : p >= 0.8 ? "Bijna!" : p >= 0.5 ? "Over de helft!"
  : p >= 0.25 ? "Lekker bezig!" : "Net begonnen";
