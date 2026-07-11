import AsyncStorage from "@react-native-async-storage/async-storage";
import { uid } from "./id";

export const KEY = "heitje-state-v1";

// Demo family — edit names/ages in the Gezin tab of your fork, or here.
// UI mode is derived from age: junior (<12) gets the motivation bar,
// teens (12–18) get the progress ring with percentages.
export const DEFAULT_MEMBERS = {
  emma:   { name: "Emma", avatar: "🦊", age: 10, role: "kind",  streak: 6,  color: "#7C3AED" },
  daan:   { name: "Daan", avatar: "🚀", age: 14, role: "kind",  streak: 3,  color: "#0EA5E9" },
  wouter: { name: "Vader", avatar: "😎", age: 42, role: "ouder", streak: 12, color: "#16A34A" },
  mama:   { name: "Moeder", avatar: "🌷", age: 41, role: "ouder", streak: 9,  color: "#F59E0B" },
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
    emma: { id: uid(), name: "LEGO Technic kraan", emoji: "🧱", imageUri: null, target: 4999, saved: 0, link: "", approved: true },
    daan: { id: uid(), name: "Nintendo-game", emoji: "🎮", imageUri: null, target: 5999, saved: 0, link: "", approved: false },
  },
  feed: [],
  lastMe: null,       // laatst gekozen profiel op dit toestel → automatisch inloggen
  setupDone: false,   // heeft dit toestel de welkom-wizard (echte namen invoeren) al doorlopen?

  // Fase 1 — backend/gezin-koppeling. Blijven allemaal null/false zolang er geen
  // gezin-account is aangemaakt: de app werkt dan gewoon zoals altijd, 100% lokaal.
  familyId: null,        // Supabase family-id zodra dit toestel aan een gezin-account hangt
  cloudMemberId: null,    // de member-rij van DIT ouder-profiel in dat gezin
  migrated: false,        // is bestaande lokale data al een keer overgezet naar de cloud?
  premiumUnlocked: false, // true na een geldige gratis premium-code (fase 6b) of later een echte aankoop

  // Fase 7 — reclame (alleen ooit in ouder-weergaven, nooit bij kinderen).
  adStyle: "bottom-block", // "bottom-block" | "startup-then-free" | "top-bottom-standard"

  // Fase 4 — uiterlijk & gevoel. Per toestel ingesteld, geldt voor het hele gezin op dat toestel.
  themeChoice: "paars",   // "paars" | "blauw" | "groen" | "amber" — zie src/theme.js THEMES
  themeOverride: null,    // null = automatisch (systeeminstelling), of "light" | "dark"
  radiusScale: 1,         // 0.7–1.3, instelbaar via slider ("afronding")
  textScale: 1,           // 0.9–1.15, instelbaar via slider ("tekstgrootte")

  // Fase 5 — onboarding & hulp.
  tourEnabled: true,      // eerste-keer tour-guide + het (i)-knopje aan/uit
  tourSeen: false,        // is de eerste-keer tour al een keer doorlopen op dit toestel?
};

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const state = { ...DEFAULT_STATE, ...JSON.parse(raw) };
    // Toestellen die dit spaardoel al vóór de invoering van `id` lokaal hadden staan
    // (nooit hersynct via de wizard of AddGoalModal, die `id` allebei altijd zetten)
    // zouden anders voorgoed een id-loos doel houden — en cloud-sync ervan negeren.
    for (const key of Object.keys(state.goals || {})) {
      if (!state.goals[key].id) state.goals[key] = { ...state.goals[key], id: uid() };
    }
    return state;
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
