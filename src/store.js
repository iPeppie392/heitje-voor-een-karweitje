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
    // per kind een LIJST van spaardoelen (niet meer één object) — gratis: max 2
    // (zie FREE_GOAL_LIMIT in App.js), 3e/4e zit achter Premium.
    emma: [
      { id: uid(), name: "LEGO Technic kraan", emoji: "🧱", imageUri: null, target: 4999, saved: 0, link: "", approved: true },
      { id: uid(), name: "Sparen", emoji: "🐷", imageUri: null, target: 5000, saved: 0, link: "", approved: true },
    ],
    daan: [
      { id: uid(), name: "Nintendo-game", emoji: "🎮", imageUri: null, target: 5999, saved: 0, link: "", approved: false },
      { id: uid(), name: "Sparen", emoji: "🐷", imageUri: null, target: 5000, saved: 0, link: "", approved: true },
    ],
  },
  feed: [],
  homework: [],                    // huiswerk-items, per gezinslid (memberId-veld erin)
  homeworkEnabled: true,           // ouder-schakelaar — uit = hele Huiswerk-tab verborgen voor kinderen
  homeworkRewardMode: "minutes",   // "minutes" | "money" — gezinsbrede beloningsvorm, standaard minuten
  screenBalances: { emma: 0, daan: 0, wouter: 0, mama: 0 }, // schermtijd-tegoed in minuten, per lid
  screenGoals: {},                 // spaardoel in minuten, per kind — los van het geld-spaardoel
  choreOffers: [],                 // klusjes voorgesteld door gasten (opa/oma/etc.), wacht op ouder-goedkeuring
  neighborJobs: [],                 // buurtklusjes: een kind werkt voor iemand buiten het gezin (host-rol)
  hiddenShortcuts: ["sparen", "gezin"], // welke Home-snelkoppelingen dit toestel verborgen heeft (ze staan al onderin de tabbalk)
  lastMe: null,       // laatst gekozen profiel op dit toestel → automatisch inloggen
  setupDone: false,   // heeft dit toestel de welkom-wizard (echte namen invoeren) al doorlopen?
  pricingSeen: false, // heeft dit toestel de kosten/reclame-uitleg (eerste pagina) al gezien?
  milestonesSeen: {}, // per kind: welke klusjes-mijlpalen (10/25/50/100) al als badge getoond zijn
  payoutDay: 5,        // dag (0=zo..6=za) waarop Home een uitbetaal-herinnering toont, standaard vrijdag

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
  // Standaard altijd donker starten, ongeacht systeeminstelling — een kind/ouder kan dit
  // nog steeds zelf wijzigen naar Licht of Automatisch bij Instellingen.
  themeOverride: "dark",  // null = automatisch (systeeminstelling), of "light" | "dark"
  radiusScale: 1,         // 0.7–1.3, instelbaar via slider ("afronding")
  textScale: 1,           // 0.9–1.15, instelbaar via slider ("tekstgrootte")

  // Fase 5 — onboarding & hulp.
  tourEnabled: true,      // eerste-keer tour-guide + het (i)-knopje aan/uit
  tourSeen: false,        // is de eerste-keer tour al een keer doorlopen op dit toestel?

  reviewPromptAskedAt: null, // ISO-datum van de laatste native store-review-vraag op dit toestel (device-only, niet gesynct)
};

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const state = { ...DEFAULT_STATE, ...JSON.parse(raw) };
    // Toestellen van vóór de meerdere-spaardoelen-update hadden `goals[kid]` als
    // ÉÉN object staan (i.p.v. een lijst) — die hier omzetten naar een 1-lange lijst,
    // anders verdwijnt dat bestaande doel voorgoed uit beeld. Meteen ook `id` invullen
    // voor toestellen die dit doel al vóór de invoering van `id` lokaal hadden staan
    // (nooit hersynct via de wizard of AddGoalModal, die `id` allebei altijd zetten) —
    // zouden anders voorgoed een id-loos doel houden en cloud-sync ervan negeren.
    for (const key of Object.keys(state.goals || {})) {
      const v = state.goals[key];
      const arr = Array.isArray(v) ? v : (v ? [v] : []);
      state.goals[key] = arr.map(g => g.id ? g : { ...g, id: uid() });
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
