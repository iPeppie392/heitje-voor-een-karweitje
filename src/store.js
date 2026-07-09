import AsyncStorage from "@react-native-async-storage/async-storage";

export const KEY = "heitje-state-v1";

// Demo family — edit names/ages in the Gezin tab of your fork, or here.
// UI mode is derived from age: junior (<12) gets the motivation bar,
// teens (12–18) get the progress ring with percentages.
export const DEFAULT_MEMBERS = {
  emma:   { name: "Emma", avatar: "🦊", age: 10, role: "kind",  streak: 6,  color: "#7C3AED" },
  daan:   { name: "Daan", avatar: "🚀", age: 14, role: "kind",  streak: 3,  color: "#0EA5E9" },
  wouter: { name: "Papa", avatar: "😎", age: 42, role: "ouder", streak: 12, color: "#16A34A" },
  mama:   { name: "Mama", avatar: "🌷", age: 41, role: "ouder", streak: 9,  color: "#F59E0B" },
};

export const DEFAULT_STATE = {
  cur: "€",
  members: DEFAULT_MEMBERS,
  balances: { emma: 0, daan: 0, wouter: 0, mama: 0 },
  chores: [
    { id: 1, title: "Vaatwasser uitruimen", room: "Keuken", emoji: "🍽️", cents: 150, status: "open", by: null },
    { id: 2, title: "Badkamer schoonmaken", room: "Badkamer", emoji: "🛁", cents: 400, status: "open", by: null,
      conditions: { note: "Vergeet de kranen en de spiegel niet.", checklist: ["Wastafel schoon", "Spiegel gepoetst", "Vloer gedweild"], photoRequired: true, deadline: "voor 18:00" } },
    { id: 3, title: "Stofzuigen beneden", room: "Woonkamer", emoji: "🧹", cents: 250, status: "open", by: null },
  ],
  goals: {
    emma: { name: "LEGO Technic kraan", emoji: "🧱", imageUri: null, target: 4999, saved: 0, link: "", approved: true },
    daan: { name: "Nintendo-game", emoji: "🎮", imageUri: null, target: 5999, saved: 0, link: "", approved: false },
  },
  feed: [],
  pendingAlloc: null, // { kid, cents, title }
  lastMe: null,       // laatst gekozen profiel op dit toestel → automatisch inloggen
};

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveState(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // best-effort persistence; ignore write errors in the test build
  }
}

export async function resetState() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
