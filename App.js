import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert,
  SafeAreaView, useColorScheme, KeyboardAvoidingView, Platform, Linking,
  Animated, Image, useWindowDimensions, Share,
} from "react-native";

const LEGAL_BASE = "https://heitje-voor-een-karweitje-five.vercel.app";
import { StatusBar } from "expo-status-bar";
import * as StoreReview from "expo-store-review";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import * as ImagePicker from "expo-image-picker";
import QRCode from "react-native-qrcode-svg";
import { CameraView, useCameraPermissions } from "expo-camera";
import { light, buildTheme, THEMES, THEME_CHOICES, fmt as fmt0 } from "./src/theme";
import Slider from "@react-native-community/slider";
import { loadState, saveState, resetState, DEFAULT_STATE, DEFAULT_MEMBERS } from "./src/store";
import { Card, Btn, Chip, Amount, PhotoBox, Ring, JuniorBar, Confetti, AdSlot } from "./src/components";
import { useFamily } from "./src/useFamily";
import { push, pullFamilyState, flushPendingWrites, clearPendingWrites } from "./src/sync";
import { uid } from "./src/id";
import { registerForPushToken, sendPushNotification } from "./src/notifications";
import FamilySetup from "./src/screens/FamilySetup";

const FREE_CHORE_LIMIT = 1; // free tier: max active chores (premium: unlimited)
const FREE_GOAL_LIMIT = 2;  // free tier: max spaardoelen per kind (premium: onbeperkt) — standaard "Speelgoed" + "Sparen"

// Twee standaard spaardoelen die elk nieuw kind meteen krijgt: één gericht doel
// ("Speelgoed", met winkellink-goedkeuring) en één open, algemeen doel ("Sparen",
// altijd al goedgekeurd — er is geen link waar een ouder toestemming voor moet geven).
const defaultGoals = () => ([
  { id: uid(), name: "Speelgoed", emoji: "🎁", imageUri: null, target: 1500, saved: 0, link: "", approved: true },
  { id: uid(), name: "Sparen", emoji: "🐷", imageUri: null, target: 5000, saved: 0, link: "", approved: true },
]);

// Kandidaat-snelkoppelingen per rol voor Home — icon/label hier op één plek, zodat het
// aanpas-lijstje (Sheet) en de knoppen zelf (in Feed) nooit uit de pas kunnen lopen.
const SHORTCUT_ITEMS = {
  kind: [
    { key: "klusjes", icon: "🧹", label: "Klusjes" },
    { key: "sparen", icon: "🐷", label: "Sparen" },
    { key: "gezin", icon: "👨‍👩‍👧", label: "Gezin" },
    { key: "wissel", icon: "🔄", label: "Wissel" },
  ],
  ouder: [
    { key: "nieuwklus", icon: "➕", label: "Nieuw klus" },
    { key: "keuren", icon: "🧐", label: "Keuren" },
    { key: "uitbetalen", icon: "💶", label: "Uitbetalen" },
    { key: "sparen", icon: "🐷", label: "Sparen" },
    { key: "gezin", icon: "👨‍👩‍👧", label: "Gezin" },
    { key: "wissel", icon: "🔄", label: "Wissel" },
  ],
};
const APP_VERSION = "0.2.0";
const BG_LIGHT = require("./assets/bg-light.png");
const BG_DARK = require("./assets/bg-dark.png");

// react-native-web's eigen Alert.alert() is een complete no-op (geen window.alert/confirm,
// helemaal niets) — zonder dit zou elke melding en elke bevestiging-voor-verwijderen
// stil niets doen op de website-versie van de app. Zelfde aanroep-vorm als Alert.alert,
// dus overal drop-in vervangen. Op een telefoon (Expo Go/native) gebruikt dit gewoon
// de echte, native Alert.alert.
function alertX(title, message, buttons) {
  if (Platform.OS !== "web") { Alert.alert(title, message, buttons); return; }
  const text = message ? `${title}\n\n${message}` : title;
  if (!buttons || buttons.length <= 1) { window.alert(text); buttons?.[0]?.onPress?.(); return; }
  const proceed = window.confirm(text);
  const btn = buttons.find(b => (proceed ? b.style !== "cancel" : b.style === "cancel"));
  btn?.onPress?.();
}

// Streak = aantal opeenvolgende dagen (incl. vandaag) met minstens één goedgekeurd
// klusje. Puur afgeleid uit de feed in plaats van een eigen datumveld bij te houden —
// scheelt een aparte kolom/migratie, en staat vanzelf in sync met wat al gesynchroniseerd
// wordt. Telt terug vanaf vandaag, stopt bij de eerste gemiste dag.
function computeStreak(feed, memberId) {
  const days = new Set(feed.filter(p => p.who === memberId && !p.badge).map(p => p.time.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

const CHORE_MILESTONES = [10, 25, 50, 100];

// Bonus-avatars die vrijkomen bij een klusjes-mijlpaal — bovenop de altijd-beschikbare
// KID_AVATARS-lijst (verderop in dit bestand). Dieren blijven neutraal genoeg voor zowel
// een jong kind als een tiener van 17, dus geen "kinderachtige" stijlbreuk.
const BONUS_AVATARS = { 10: "🐲", 25: "🦉", 50: "🦋", 100: "🐬" };

// Heitje's mascotte: bewust géén nieuw illustratie-personage, gewoon de vos-emoji die al
// in de merknaam/avatars zit, en bewust ALLEEN voor junior kinderen (<12) — de app bedient
// ook tieners tot 17, en een opdringerig mascottekaartje zou voor hen als kinderachtig
// aanvoelen. Voor teens en ouders verschijnt dit kaartje daarom helemaal niet.
const MASCOT_TIPS = [
  "Elke dag een klusje maakt je streak sterker! 🔥",
  "Spaardoel bijna bereikt? Ga zo door! 🐷",
  "Een klusje goed afmaken voelt best trots. 💪",
  "Heitje de vos duimt voor je vandaag! 🤞",
  "Streak vasthouden: elke dag telt, ook een klein klusje!",
];

const NEIGHBOR_JOB_STATUS_LABEL = {
  open: "⏳ Nog niet gestart",
  in_progress: "🚶 Bezig",
  awaiting_approval: "📋 Wacht op goedkeuring",
  approved: "🎉 Goedgekeurd!",
  declined: "❌ Afgewezen",
};

const PAYOUT_DAYS = [
  { v: 1, l: "Ma" }, { v: 2, l: "Di" }, { v: 3, l: "Wo" }, { v: 4, l: "Do" },
  { v: 5, l: "Vr" }, { v: 6, l: "Za" }, { v: 0, l: "Zo" },
];

// Kamer/titel-trefwoorden → passend emoji, zodat een nieuw klusje niet standaard
// dezelfde spons krijgt. Simpele keyword-match, geen aparte picker-UI nodig.
const CHORE_EMOJI_RULES = [
  { match: /keuken|afwas|vaatwasser|koken/i, emoji: "🍽️" },
  { match: /badkamer|douche|wc|toilet/i, emoji: "🛁" },
  { match: /slaapkamer|bed/i, emoji: "🛏️" },
  { match: /tuin|planten|gras/i, emoji: "🌳" },
  { match: /hond|kat|dier|huisdier/i, emoji: "🐾" },
  { match: /was(machine)?|strijk/i, emoji: "🧺" },
  { match: /vuilnis|afval|prullenbak/i, emoji: "🗑️" },
  { match: /boodschap/i, emoji: "🛒" },
  { match: /raam|ramen/i, emoji: "🪟" },
  { match: /auto/i, emoji: "🚗" },
  { match: /woonkamer|stof|zuig|dweil/i, emoji: "🧹" },
];
function suggestChoreEmoji(title, room) {
  const text = `${title} ${room}`;
  for (const rule of CHORE_EMOJI_RULES) if (rule.match.test(text)) return rule.emoji;
  return "🧽";
}

export default function App() {
  // Reactief i.p.v. één keer bij het laden vastgelegd — op mobiel web verandert de
  // zichtbare viewporthoogte terwijl je scrolt (de adresbalk klapt in/uit), een
  // bevroren waarde hier gaf precies de gemelde bug: de achtergrond (en daarmee de
  // rest van de pagina) schoof/verschoof tijdens het scrollen op een telefoon.
  const { height: winH } = useWindowDimensions();
  const scheme = useColorScheme();
  const [loaded, setLoaded] = useState(false);
  const [booted, setBooted] = useState(false);
  const [S, setS] = useState(DEFAULT_STATE);
  const isDark = S.themeOverride ? S.themeOverride === "dark" : scheme === "dark";
  const t = buildTheme({ themeChoice: S.themeChoice, dark: isDark, radiusScale: S.radiusScale, textScale: S.textScale });
  const [me, setMe] = useState(null); // active profile on this device
  const [pinPrompt, setPinPrompt] = useState(null); // { key, mode: "set"|"enter" } — pincode-gate vóór een ouderprofiel
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [tab, setTab] = useState("feed");
  const [confetti, setConfetti] = useState(false);
  const [choreModal, setChoreModal] = useState(false);
  const [goalModal, setGoalModal] = useState(false);
  const [screenGoalModal, setScreenGoalModal] = useState(false);
  const [homeworkModal, setHomeworkModal] = useState(false);
  const [timerInput, setTimerInput] = useState("");
  const [rejectFor, setRejectFor] = useState(null); // chore id being rejected
  const [familySetupOpen, setFamilySetupOpen] = useState(false);
  // "Later, ga lokaal verder" op het gezin-aanmaken-scherm zette je terug op het
  // "Wie ben jij?"-scherm, waar dezelfde verleidelijke "Gezin aanmaken of koppelen"-
  // link meteen weer klaarstond — voelde als een lus zonder uitweg. Na één keer
  // "later" kiezen verbergen we die link voor de rest van deze sessie.
  const [familySetupDismissed, setFamilySetupDismissed] = useState(false);
  const [inviteCode, setInviteCode] = useState(null);
  const [guestInviteCode, setGuestInviteCode] = useState(null);
  const [hostInviteCode, setHostInviteCode] = useState(null);
  const [kidModal, setKidModal] = useState(false);
  const [qrKid, setQrKid] = useState(null); // key van kind waarvan de deel-QR getoond wordt
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [parentModal, setParentModal] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [giftModal, setGiftModal] = useState(false);
  const [startupAdDismissed, setStartupAdDismissed] = useState(false); // alleen voor deze sessie
  const [tourStep, setTourStep] = useState(0);
  const [tourForced, setTourForced] = useState(false); // (i)-knop of "opnieuw bekijken" negeert tourSeen
  const [pricingForced, setPricingForced] = useState(false); // "Bekijk prijzen opnieuw" in Instellingen
  const [shortcutsSheet, setShortcutsSheet] = useState(false); // ✏️-knop bij SNELKOPPELINGEN op Home
  const scrollY = useRef(new Animated.Value(0)).current; // achtergrond-parallax op het hoofdscherm
  // Optimistische saldo-delta's per lid die lokaal al zijn doorgevoerd maar in de cloud
  // nog moeten landen. Beschermen een recente bijschrijving tegen overschrijven door een
  // cloud-pull die vóór de bevestiging van de ledger-regel binnenkomt.
  const pendingDeltas = useRef({});
  // Sla een saldo-wijziging op die lokaal al is doorgevoerd maar in de cloud nog moet
  // landen. Bij de volgende cloud-pull wordt deze delta bij de cloud-balances opgeteld,
  // totdat de cloud de wijziging bevestigt (na de time-out vertrouwen we de cloud weer).
  const addPendingDelta = (memberId, cents) => {
    if (!memberId || !cents) return;
    const pd = pendingDeltas.current;
    const prev = pd[memberId];
    pd[memberId] = { cents: (prev?.cents || 0) + cents, until: Date.now() + 15000 };
  };

  // Bij opstarten altijd de opgeslagen staat laden. Op het web mag een URL-parameter
  // (?demo=1) NOOIT lokale gegevens wissen — anders raakt een echt gezin alles kwijt
  // door zo'n link te openen. Nieuwe bezoekers zonder opgeslagen data starten automatisch
  // bij de demofamilie (loadState → DEFAULT_STATE).
  useEffect(() => {
    loadState().then(s => { setS(s); setLoaded(true); });
  }, []);
  useEffect(() => { if (loaded) saveState(S); }, [S, loaded]);

  // Fase 1 — gezin-account (optioneel): zonder .env-config doet dit niets en blijft
  // de app 100% lokaal, precies zoals nu. Zie src/supabase.js / src/useFamily.js.
  const fam = useFamily({
    familyId: S.familyId,
    onCloudState: (cloud) => setS(s => {
      const merged = { ...s, ...cloud };
      // Bescherm recente optimistic saldo-wijzigingen: een cloud-pull die vóór de
      // bevestiging van de ledger-regel komt, zou het zojuist opgehoogde saldo anders
      // meteen weer verlagen. Tel nog-geldige delta's bij de cloud-balances op en
      // ruim verlopen delta's op.
      const now = Date.now();
      const pd = pendingDeltas.current;
      const base = { ...(cloud.balances || s.balances) };
      let changed = false;
      for (const m of Object.keys(pd)) {
        if (pd[m].until > now) {
          if (base[m] !== undefined) { base[m] = (base[m] || 0) + pd[m].cents; changed = true; }
        } else { delete pd[m]; changed = true; }
      }
      if (changed) merged.balances = base;
      return merged;
    }),
  });
  const onFamilySetupDone = async ({ familyId, memberId, didMigrate }) => {
    // Eerst de cloud-data ophalen en in S zetten, en pas dán me/lastMe wijzigen —
    // anders is S.members nog de oude (lokale) set op het moment dat me al op het
    // nieuwe cloud-uuid staat, en zet het vangnet (regel hieronder) me meteen weer
    // terug op null (dezelfde bug-klasse als de eerdere witte-scherm-crash).
    let cloud = {};
    try { cloud = await pullFamilyState(familyId); } catch { /* volgende realtime-pull haalt dit alsnog op */ }
    setS(s => ({ ...s, ...cloud, familyId, cloudMemberId: memberId, migrated: S.migrated || didMigrate, lastMe: memberId }));
    setFamilySetupOpen(false);
    setMe(memberId);
  };
  // Automatisch inloggen: open meteen bij het laatst gekozen profiel op dit toestel.
  // Veiligheidscheck: een toestel dat al eerder eigen namen/klusjes had (van vóór de
  // wizard bestond) mag de welkom-wizard NOOIT alsnog laten zien — dat zou hun data
  // overschrijven. Alleen een echt kale, ongewijzigde demo-installatie krijgt de wizard.
  useEffect(() => {
    if (loaded && !booted) {
      setBooted(true);
      if (S.lastMe && S.members[S.lastMe]) setMe(S.lastMe);
    }
  }, [loaded, booted, S]);

  // Vangnet: als het gekozen profiel niet meer bestaat (bijv. na demo-reset of
  // een gezinswissel), terug naar het profielkeuzescherm in plaats van te crashen.
  useEffect(() => {
    if (me && !S.members[me]) setMe(null);
  }, [me, S.members]);

  // Pushmeldingen: dit toestel registreren bij het actieve profiel, zodat andere
  // gezinsleden een melding kunnen sturen. Geeft stil `null` terug op web, in een
  // simulator, zonder toestemming, of zolang er nog geen EAS-project gekoppeld is —
  // zie src/notifications.js.
  useEffect(() => {
    if (!me || !S.familyId || !fam.backendConfigured) return;
    registerForPushToken().then(token => {
      if (token && token !== S.members[me]?.push_token) push.updateMember(me, { push_token: token });
    });
  }, [me, S.familyId, fam.backendConfigured]);

  // Streak verversen zodra dit profiel actief wordt — vangt de "dag gemist"-situatie op.
  // Zonder dit zou een oude streak blijven staan totdat het kind weer een klusje
  // goedkeurt, wat dan een onterecht hoog getal zou tonen.
  useEffect(() => {
    if (!me || S.members[me]?.role !== "kind") return;
    const newStreak = computeStreak(S.feed, me);
    if (newStreak !== S.members[me].streak) {
      setS(s => ({ ...s, members: { ...s.members, [me]: { ...s.members[me], streak: newStreak } } }));
      if (S.familyId && fam.backendConfigured) push.updateMember(me, { streak: newStreak });
    }
  }, [me, S.feed]);

  // Profiel kiezen op de inlogpagina — onthoudt de keuze voor de volgende keer.
  // Een ouderprofiel zit achter een pincode: zonder dit kon een kind met één tik
  // naar het ouderprofiel wisselen en zelf klusjes/spaardoelen goedkeuren — dat
  // ondermijnt de hele "ouderlijke goedkeuring"-belofte van de app. Eerste keer
  // dat een ouderprofiel gekozen wordt wordt de pincode ingesteld i.p.v. gevraagd.
  const pick = (k) => {
    const m = S.members[k];
    if (m?.role === "ouder") {
      setPinPrompt({ key: k, mode: S.parentPin ? "enter" : "set" });
      return;
    }
    setMe(k); patch({ lastMe: k });
  };

  // Afhandeling van de pincode-modal: instellen (eerste keer) of controleren.
  const closePinPrompt = () => { setPinPrompt(null); setPinValue(""); setPinConfirm(""); };
  const submitPin = () => {
    if (!pinPrompt) return;
    if (pinPrompt.mode === "set") {
      if (pinValue.length !== 4) { alertX("Kies 4 cijfers", "Vul een pincode van precies 4 cijfers in."); return; }
      if (pinValue !== pinConfirm) { alertX("Pincodes komen niet overeen", "Typ dezelfde 4 cijfers nog een keer."); setPinConfirm(""); return; }
      const k = pinPrompt.key;
      patch({ parentPin: pinValue });
      closePinPrompt();
      setMe(k); patch({ lastMe: k });
    } else {
      if (pinValue !== S.parentPin) { alertX("Onjuiste pincode", "Probeer het opnieuw."); setPinValue(""); return; }
      const k = pinPrompt.key;
      closePinPrompt();
      setMe(k); patch({ lastMe: k });
    }
  };

  // Eén gedeelde modal-JSX (i.p.v. 'm dubbel te definiëren) — gebruikt zowel op het
  // "Wie ben jij?"-scherm (voor !me) als vanuit Instellingen (pincode wijzigen, als
  // ouder al ingelogd is), dus buiten beide early-returns gedefinieerd.
  const pinGateModal = (
    <Modal visible={!!pinPrompt} transparent animationType="fade" onRequestClose={closePinPrompt}>
      <View style={{ flex: 1, backgroundColor: "rgba(10,5,25,0.55)", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: t.card, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340 }}>
          <Text style={{ fontSize: 36, textAlign: "center", marginBottom: 8 }}>🔒</Text>
          <Text style={{ fontWeight: "900", fontSize: 18, color: t.ink, textAlign: "center", marginBottom: 6 }}>
            {pinPrompt?.mode === "set" ? "Stel een pincode in" : "Voer de pincode in"}
          </Text>
          <Text style={{ fontSize: 13, color: t.sub, textAlign: "center", marginBottom: 16 }}>
            {pinPrompt?.mode === "set"
              ? "Kies een pincode van 4 cijfers om het ouderprofiel te beveiligen — zonder deze code kan een kind niet zelf als ouder inloggen."
              : "Deze pincode is nodig om als ouder in te loggen."}
          </Text>
          <TextInput
            value={pinValue}
            onChangeText={(v) => setPinValue(v.replace(/[^0-9]/g, "").slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder="••••"
            placeholderTextColor={t.sub}
            autoFocus
            style={[inputStyle(t), { textAlign: "center", fontSize: 24, letterSpacing: 8 }]}
          />
          {pinPrompt?.mode === "set" && (
            <TextInput
              value={pinConfirm}
              onChangeText={(v) => setPinConfirm(v.replace(/[^0-9]/g, "").slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="Nogmaals ••••"
              placeholderTextColor={t.sub}
              style={[inputStyle(t), { textAlign: "center", fontSize: 24, letterSpacing: 8, marginTop: 10 }]}
            />
          )}
          <View style={{ marginTop: 16 }}>
            <Btn t={t} onPress={submitPin}>{pinPrompt?.mode === "set" ? "Pincode instellen" : "Inloggen"}</Btn>
          </View>
          <TouchableOpacity onPress={closePinPrompt} style={{ alignItems: "center", padding: 12 }}>
            <Text style={{ color: t.sub, fontWeight: "700", fontSize: 13 }}>Annuleren</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const fmt = (c) => fmt0(c, S.cur);
  const fmtMin = (m) => `${m} min`;
  const M = me ? S.members[me] : null;
  const role = M?.role;
  const jr = role === "kind" && M.age < 12; // junior (<12): motivation bar; teen: ring with %
  const boom = () => { setConfetti(false); setTimeout(() => setConfetti(true), 30); setTimeout(() => setConfetti(false), 2200); };
  const patch = (p) => setS(s => ({ ...s, ...p }));

  // Rondleiding: standaard aan, eenmalig bij de eerste keer inloggen, en op elk moment
  // terug te zien via het ⓘ-knopje of "Bekijk de rondleiding opnieuw" in Instellingen.
  const TOUR_STEPS = useMemo(() => {
    const steps = [
      { icon: "🏠", title: "Welkom bij Heitje!", body: jr
        ? "Heitje voor een karweitje is een app voor het hele gezin: jij doet klusjes in huis, maakt er een foto van, en verdient zakgeld zodra papa of mama het goedkeurt. Dit scherm is je Home — hier zie je je klusjes en hoeveel je al hebt verdiend!"
        : role === "ouder"
          ? "Heitje voor een karweitje helpt jullie gezin klusjes en zakgeld eerlijk te regelen: kinderen claimen klusjes uit een pool, maken een voor/na-foto, en jij keurt het resultaat goed voordat het zakgeld vrijkomt. Dit scherm is je Home — een overzicht van openstaande klusjes, wie er nog goedkeuring wacht, en het gezinssaldo."
          : "Heitje voor een karweitje is een app voor het hele gezin: je pakt klusjes uit een pool, maakt er een foto van, en verdient zakgeld zodra het is goedgekeurd. Dit scherm is je Home — een overzicht van je klusjes en saldo." },
      { icon: "✅", title: "Klusjes", body: jr
        ? "Hier pak je klusjes. Doe de klus, maak een foto, en vraag het aan papa of mama!"
        : "Hier staan alle klusjes: open, in uitvoering, en klaar om goed te keuren." },
      { icon: "🐷", title: "Sparen", body: "Hier zie je spaardoelen en hoe dichtbij je al bent." },
      { icon: "👨‍👩‍👧‍👦", title: "Gezin", body: role === "ouder"
        ? "Hier zie je het saldo per kind, betaal je uit, en voeg je een nieuw kind toe."
        : "Hier zie je hoeveel iedereen in het gezin heeft gespaard." },
    ];
    if (role === "ouder") steps.push({ icon: "⚙️", title: "Instellingen", body:
      "Hier kies je een kleurthema, licht of donker, en pas je tekstgrootte en afronding aan." });
    return steps;
  }, [role, jr]);
  const showTour = !!me && S.tourEnabled && (tourForced || !S.tourSeen);
  const showAds = role === "ouder" && (M?.age == null || M.age >= 16) && !S.premiumUnlocked; // nooit bij kinderen <16 (harde regel)

  // Uitgebreide, doorzoekbare uitleg — het ⓘ-knopje opent dit (los van de korte rondleiding).
  const HELP_TOPICS = useMemo(() => {
    const topics = [
      { icon: "🏠", title: "Home", body: "Je startscherm: een overzicht van openstaande klusjes, je saldo (bij ouders: het gezinssaldo dat nog uitbetaald moet worden), en de gezinsactiviteit onderaan." },
      { icon: "✅", title: "Klusjes claimen", body: "Kinderen tikken op 'Claimen' bij een openstaand klusje in de pool. Daarna is het klusje van jou totdat je het afrondt of het wordt afgekeurd." },
      { icon: "📸", title: "Foto's bij een klusje", body: "Sommige klusjes vragen een voor- en na-foto als bewijs. Dat zie je aan het camera-icoontje bij het klusje. Foto's worden nooit gedeeld buiten je gezin." },
      { icon: "📝", title: "Voorwaarden & checklist", body: "Een ouder kan bij het aanmaken van een klusje een checklist, een deadline en een notitie toevoegen. Het kind moet alle punten afvinken voordat het klusje afgerond kan worden." },
      { icon: "🧐", title: "Goedkeuren & afkeuren", body: "Alleen ouders keuren klusjes goed of af. Bij afkeuren moet je altijd een reden opgeven, zodat het kind weet wat er nog moet gebeuren." },
      { icon: "🐷", title: "Sparen", body: "Elk kind kan één spaardoel instellen met een naam, bedrag en optioneel een foto. Een ouder moet het doel eerst goedkeuren voordat de winkellink aanklikbaar wordt (ouderlijke poort)." },
      { icon: "📚", title: "Huiswerk", body: "Een agenda per gezinslid. Standaard verdien je er schermtijd (in minuten) mee — een ouder kan bij Instellingen wisselen naar geld, of de hele Huiswerk-tab uitzetten voor kinderen. Per taak stelt een ouder zelf, stilletjes, een beloning in; kinderen krijgen daar zelf geen invoerveld voor." },
      { icon: "⏱️", title: "Schermtijd sparen & gebruiken", body: "Verdiende minuten staan bij Sparen. Daar kun je ook een schermtijd-spaardoel instellen (naast je geld-spaardoel) en een timer starten: de gekozen minuten gaan er meteen af van je tegoed, ook als je eerder stopt." },
      { icon: "💰", title: "Zakgeld & uitbetalen", body: "De app rekent alleen in cijfers — er gaat nooit echt geld door de app. Zodra je je kind fysiek hebt uitbetaald (contant, tikkie, etc.), registreer je dat bij Gezin → 'Uitbetaald — registreer'." },
      { icon: "👨‍👩‍👧‍👦", title: "Ouders verdienen geen zakgeld", body: "Ouders maken en beheren klusjes, maar kunnen ze niet zelf claimen of uitvoeren — alleen kinderen verdienen zakgeld." },
      { icon: "👶", title: "Nieuw kind toevoegen", body: "Bij Gezin → '👶 Nieuw kind' vul je een naam, avatar en geboortedatum in (dag, maand, jaar). De geboortedatum wordt alleen gebruikt om de leeftijd te berekenen en daarna nergens opgeslagen." },
      { icon: "🧑‍🤝‍🧑", title: "Nieuwe ouder toevoegen", body: "Bij Gezin → '🧑‍🤝‍🧑 Nieuwe ouder' voeg je een tweede ouder toe op dit toestel (naam, avatar, geboortedatum optioneel). Wil die ouder ook op een eigen toestel inloggen? Gebruik dan 'Gezin delen' met een code/QR." },
      { icon: "✕", title: "Gezinslid verwijderen", body: "Bij Gezin staat een ✕ naast elk kind en elke ouder. Zo kan je de demo-namen (Emma, Daan, Vader, Moeder) verwijderen zodra je zelf echte gezinsleden hebt toegevoegd. Er moet altijd minstens één ouder overblijven." },
      { icon: "🔗", title: "Kind delen via QR", body: "Bij Gezin staat onder elk kind '🔗 Delen als QR' — laat de andere ouder dit scannen bij '👶 Nieuw kind → 📷 Scan QR' om dat kind in één keer op hun toestel te zetten, zonder alles opnieuw in te typen." },
      { icon: "🎁", title: "Bijdrage van familie", body: "Bij Gezin → '🎁 Bijdrage familie' maak je een deelbaar verzoekje voor opa, oma of een tante, dat je zelf verstuurt via WhatsApp/sms/mail. Zodra het bedrag er echt is, registreer je het met één tik." },
      { icon: "🔗", title: "Gezin delen (QR/code)", body: "Een ouder kan bij Gezin een uitnodigingscode of QR-code maken zodat een tweede ouder zich bij hetzelfde gezin-account kan aansluiten. Vereist een gezin-account (zie 'Gezin-account')." },
      { icon: "☁️", title: "Gezin-account", body: "Standaard werkt de app volledig lokaal op één toestel. Wil je met meerdere ouders/toestellen synchroniseren? Maak dan een gezin-account aan via het inlogscherm of de Gezin-tab." },
      { icon: "🎨", title: "Thema", body: "Bij Instellingen kies je uit een paar doordachte kleurthema's (paars, blauw, groen, amber) — geen losse kleuren, om het premium-gevoel te bewaren." },
      { icon: "🌗", title: "Licht of donker", body: "Bij Instellingen kies je Automatisch (volgt je toestel), Licht, of Donker." },
      { icon: "🔠", title: "Tekstgrootte & afronding", body: "Twee sliders bij Instellingen waarmee je de tekst iets groter/kleiner en de hoeken iets ronder/hoekiger kan maken." },
      { icon: "🧭", title: "Rondleiding", body: "Een korte uitleg die de eerste keer automatisch verschijnt. Zet 'm uit bij Instellingen, of bekijk 'm opnieuw via het ⓘ-knopje of de knop in Instellingen." },
      { icon: "✨", title: "Premium & gratis codes", body: "Gratis: max 5 actieve klusjes per keer. Heb je een gratis code gekregen? Vul die in bij Instellingen → Premium om die limiet op te heffen." },
      { icon: "📢", title: "Reclame", body: "Reclame komt nooit in beeld bij kinderen. Bij Instellingen kies je hoe je 'm als ouder wilt zien — nog niet actief, want dat vereist eerst een AdMob-account." },
      { icon: "📮", title: "Feedback geven", body: "Bij Instellingen → 'Stuur feedback' open je je mail-app, voorgeadresseerd aan het Heitje-team." },
      { icon: "🔄", title: "Van profiel wisselen", body: "Tik op je naam rechtsboven om terug te gaan naar het profielkeuzescherm." },
      { icon: "💱", title: "Gezinsvaluta", body: "Bij Gezin kies je €, £ of $ — geldt voor het hele gezin." },
    ];
    return topics;
  }, []);
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickShareOpen, setQuickShareOpen] = useState(false);
  const [shareCard, setShareCard] = useState(null); // { headline, kidName, kidAvatar } | null
  const [shareShowName, setShareShowName] = useState(false); // privacy: standaard GEEN kindnaam op de gedeelde afbeelding
  const shareCardRef = useRef(null);
  const [helpQuery, setHelpQuery] = useState("");
  const filteredHelp = HELP_TOPICS.filter(h =>
    !helpQuery.trim() || (h.title + " " + h.body).toLowerCase().includes(helpQuery.trim().toLowerCase()));
  const closeTour = () => { patch({ tourSeen: true }); setTourForced(false); setTourStep(0); };

  // Nieuw kind lokaal toevoegen (en meesynchroniseren als er al een gezin-account is).
  // Krijgt meteen 2 standaard spaardoelen (Speelgoed + Sparen, zie defaultGoals())
  // — zonder dat zou de sparen-keuze bij een afgerond klusje geen echte optie hebben.
  // Twee profielen met exact dezelfde naam zijn op het "Wie ben jij?"-scherm
  // amper te onderscheiden (alleen een klein rol-label) — dat voorkomen we hier.
  const nameTaken = (name) => Object.values(S.members).some(m => m.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addKid = (kid) => {
    if (nameTaken(kid.name)) { alertX("Naam al in gebruik", `Er is al iemand in dit gezin die ${kid.name} heet. Kies een andere naam (bijv. met achternaam of bijnaam).`); return; }
    const key = uid();
    const goals = defaultGoals();
    setS(s => ({ ...s, members: { ...s.members, [key]: kid }, balances: { ...s.balances, [key]: 0 }, goals: { ...s.goals, [key]: goals } }));
    setKidModal(false);
    if (S.familyId && fam.backendConfigured) {
      push.upsertMember(S.familyId, {
        id: key, name: kid.name, avatar: kid.avatar, age: kid.age, role: "kind", color: kid.color,
      });
      for (const goal of goals) {
        push.upsertGoal(S.familyId, key, {
          id: goal.id, name: goal.name, emoji: goal.emoji, image_uri: goal.imageUri,
          target: goal.target, saved: goal.saved, link: goal.link, approved: goal.approved,
        });
      }
    }
  };

  // Extra ouder lokaal toevoegen (geen eigen inlog-account — dat is alleen nodig als
  // deze ouder ook op een ánder toestel wil inloggen, via Gezin delen/QR).
  const addParent = (parent) => {
    if (nameTaken(parent.name)) { alertX("Naam al in gebruik", `Er is al iemand in dit gezin die ${parent.name} heet. Kies een andere naam.`); return; }
    const key = uid();
    setS(s => ({ ...s, members: { ...s.members, [key]: parent }, balances: { ...s.balances, [key]: 0 } }));
    setParentModal(false);
    if (S.familyId && fam.backendConfigured) {
      push.upsertMember(S.familyId, {
        id: key, name: parent.name, avatar: parent.avatar, age: parent.age, role: "ouder", color: parent.color,
      });
    }
  };

  // Een kind mag zelf zijn eigen avatar wijzigen — basis-set altijd beschikbaar, plus
  // bonus-avatars die vrijkomen via klusjes-mijlpalen (zie BONUS_AVATARS/milestonesSeen).
  const changeAvatar = (newAvatar) => {
    setS(s => ({ ...s, members: { ...s.members, [me]: { ...s.members[me], avatar: newAvatar } } }));
    if (S.familyId && fam.backendConfigured) push.updateMember(me, { avatar: newAvatar });
    setAvatarPickerOpen(false);
  };

  // Gezinslid verwijderen — met bevestiging, en een vangnet zodat er altijd
  // minstens één ouder overblijft. Klusjes die dit lid geclaimd had gaan terug open.
  const removeMember = (key) => {
    const m = S.members[key];
    if (!m) return;
    if (m.role === "ouder" && Object.values(S.members).filter(x => x.role === "ouder").length <= 1) {
      alertX("Kan niet verwijderen", "Er moet minstens één ouder in het gezin blijven.");
      return;
    }
    alertX(`${m.name} verwijderen?`, "Dit kan niet ongedaan gemaakt worden.", [
      { text: "Annuleren", style: "cancel" },
      { text: "Verwijderen", style: "destructive", onPress: () => {
        setS(s => {
          const members = { ...s.members }; delete members[key];
          const balances = { ...s.balances }; delete balances[key];
          const goals = { ...s.goals }; delete goals[key];
          const chores = s.chores.map(c => c.by === key ? { ...c, status: "open", by: null } : c);
          return { ...s, members, balances, goals, chores };
        });
        // Niet hard verwijderen in de cloud — dat zou via de foreign keys ook de hele
        // zakgeld-geschiedenis van dit lid wegvagen. Alleen "archived" markeren, zodat
        // een volgende pull dit lid niet stiekem weer lokaal terugzet.
        if (S.familyId && fam.backendConfigured) push.updateMember(key, { archived: true });
      } },
    ]);
  };

  // Klusje-van-buitenaf: een gast (opa/oma/oom/tante/vriend) stelt dit voor. Landt
  // altijd eerst als "pending" in chore_offers — nooit direct in de echte klusjes-pool,
  // dat vereist expliciete goedkeuring van een ouder (zie decideChoreOffer).
  const submitChoreOffer = ({ title, room, emoji, cents, note }) => {
    const id = uid();
    const offer = { id, offeredBy: me, title, room: room || null, emoji: emoji || null, cents, note: note || null, status: "pending" };
    setS(s => ({ ...s, choreOffers: [...s.choreOffers, offer] }));
    if (S.familyId && fam.backendConfigured) {
      push.upsertChoreOffer(S.familyId, {
        id, offered_by: me, title, room: room || null, emoji: emoji || null, cents, note: note || null,
      });
      for (const parent of Object.values(S.members).filter(m => m.role === "ouder")) {
        if (parent.push_token) sendPushNotification(parent.push_token, "Klusje aangeboden van buitenaf",
          `${M?.name || "Iemand"} stelt voor: ${title}`);
      }
    }
  };

  // Ouder keurt een voorstel goed/af. De RPC zet 'm bij goedkeuring server-side
  // atomair om in een echt klusje (chores) — dat komt via de eerstvolgende realtime-
  // pull binnen, hier alleen optimistisch de status van het voorstel zelf bijwerken
  // (nooit lokaal alvast een chore-rij verzinnen, dat zou kunnen dubbelen).
  const decideChoreOffer = (offerId, decision) => {
    const offer = S.choreOffers.find(o => o.id === offerId);
    setS(s => ({ ...s, choreOffers: s.choreOffers.map(o => o.id === offerId ? { ...o, status: decision } : o) }));
    if (S.familyId && fam.backendConfigured) {
      push.decideChoreOffer(offerId, decision);
      const guest = offer ? S.members[offer.offeredBy] : null;
      if (guest?.push_token) {
        sendPushNotification(guest.push_token,
          decision === "approved" ? "Klusje goedgekeurd! 🎉" : "Klusje niet goedgekeurd",
          decision === "approved" ? `"${offer.title}" staat nu in de klusjespool.` : `"${offer.title}" is deze keer niet doorgegaan.`);
      }
    }
  };

  // Buurtklusjes: een kind werkt voor iemand buiten het gezin (host-rol, uitgenodigd
  // door een ouder voor precies dat ene kind). Dubbele goedkeuring (host + ouder) en de
  // uiteindelijke credit naar de "extern verdiend"-pot gebeuren atomair server-side (zie
  // sql/008_neighbor_jobs.sql) — hier alleen optimistisch de eigen velden bijwerken en
  // vertrouwen op de eerstvolgende realtime-pull voor de definitieve status, zelfde
  // patroon als decideChoreOffer hierboven (nooit lokaal de serverlogica nadoen).
  const submitNeighborJob = ({ title, cents, recurring }) => {
    const childId = S.members[me]?.hostChildId;
    if (!childId) return;
    const id = uid();
    const job = { id, childId, hostId: me, title, cents, status: "open", recurring: !!recurring };
    setS(s => ({ ...s, neighborJobs: [...s.neighborJobs, job] }));
    if (S.familyId && fam.backendConfigured) {
      push.createNeighborJob(S.familyId, { id, child_id: childId, host_id: me, title, cents, recurring: !!recurring });
      for (const parent of Object.values(S.members).filter(m => m.role === "ouder")) {
        if (parent.push_token) sendPushNotification(parent.push_token, "Nieuw buurtklusje",
          `${M?.name || "Iemand"} biedt ${S.members[childId]?.name || "een kind"} een klusje aan: ${title}`);
      }
    }
  };

  const checkinNeighborJob = async (jobId) => {
    const uri = await takePhoto();
    if (!uri) return;
    setS(s => ({ ...s, neighborJobs: s.neighborJobs.map(j => j.id === jobId
      ? { ...j, status: "in_progress", checkInUri: uri, checkInAt: new Date().toISOString() } : j) }));
    if (S.familyId && fam.backendConfigured) push.checkinNeighborJob(jobId, uri);
  };

  const checkoutNeighborJob = async (jobId) => {
    const uri = await takePhoto();
    if (!uri) return;
    const job = S.neighborJobs.find(j => j.id === jobId);
    setS(s => ({ ...s, neighborJobs: s.neighborJobs.map(j => j.id === jobId
      ? { ...j, status: "awaiting_approval", checkOutUri: uri, checkOutAt: new Date().toISOString() } : j) }));
    if (S.familyId && fam.backendConfigured) {
      push.checkoutNeighborJob(jobId, uri);
      const host = job ? S.members[job.hostId] : null;
      if (host?.push_token) sendPushNotification(host.push_token, "Klusje uitgecheckt", `"${job.title}" is klaar gemeld — keur 'm goed.`);
      for (const parent of Object.values(S.members).filter(m => m.role === "ouder")) {
        if (parent.push_token) sendPushNotification(parent.push_token, "Buurtklusje wacht op jouw goedkeuring", `"${job?.title}" is klaar gemeld.`);
      }
    }
  };

  // De "goedgekeurd!"-melding aan het kind mag pas als dit ECHT de tweede/laatste
  // goedkeuring is (de ander had al goedgekeurd) — anders zou het kind bij een eenzijdige
  // goedkeuring al te vroeg denken dat het bedrag binnen is.
  const decideNeighborJobAsHost = (jobId, decision) => {
    const job = S.neighborJobs.find(j => j.id === jobId);
    setS(s => ({ ...s, neighborJobs: s.neighborJobs.map(j => j.id === jobId
      ? { ...j, status: decision === "declined" ? "declined" : j.status,
          hostApprovedAt: decision === "approved" ? new Date().toISOString() : j.hostApprovedAt }
      : j) }));
    if (S.familyId && fam.backendConfigured) {
      push.hostApproveNeighborJob(jobId, decision);
      const kid = job ? S.members[job.childId] : null;
      if (decision === "declined") {
        for (const parent of Object.values(S.members).filter(m => m.role === "ouder")) {
          if (parent.push_token) sendPushNotification(parent.push_token, "Buurtklusje afgewezen", `De host heeft "${job?.title}" niet goedgekeurd.`);
        }
      } else if (job?.parentApprovedAt && kid?.push_token) {
        sendPushNotification(kid.push_token, "Buurtklusje goedgekeurd! 🎉", `"${job.title}" is goedgekeurd — het bedrag staat klaar.`);
      }
    }
  };

  const decideNeighborJobAsParent = (jobId, decision) => {
    const job = S.neighborJobs.find(j => j.id === jobId);
    setS(s => ({ ...s, neighborJobs: s.neighborJobs.map(j => j.id === jobId
      ? { ...j, status: decision === "declined" ? "declined" : j.status,
          parentApprovedAt: decision === "approved" ? new Date().toISOString() : j.parentApprovedAt }
      : j) }));
    if (S.familyId && fam.backendConfigured) {
      push.parentApproveNeighborJob(jobId, decision);
      const kid = job ? S.members[job.childId] : null;
      const host = job ? S.members[job.hostId] : null;
      if (decision === "declined") {
        if (host?.push_token) sendPushNotification(host.push_token, "Buurtklusje afgewezen", `Een ouder heeft "${job?.title}" niet goedgekeurd.`);
      } else if (job?.hostApprovedAt && kid?.push_token) {
        sendPushNotification(kid.push_token, "Buurtklusje goedgekeurd! 🎉", `"${job.title}" is goedgekeurd — het bedrag staat klaar.`);
      }
    }
  };

  const mergeExternalEarnings = (childId) => {
    const amount = S.members[childId]?.externalEarnedCents || 0;
    if (!amount) return;
    alertX("Samenvoegen met saldo", `${fmt(amount)} extern verdiend samenvoegen met het gewone saldo van ${S.members[childId]?.name}?`, [
      { text: "Annuleren", style: "cancel" },
      { text: "Ja, samenvoegen", onPress: async () => {
          setS(s => ({ ...s,
            members: { ...s.members, [childId]: { ...s.members[childId], externalEarnedCents: 0 } },
            balances: { ...s.balances, [childId]: (s.balances[childId] || 0) + amount },
          }));
          await push.mergeExternalEarnings(childId);
        } },
    ]);
  };

  // Gratis premium-code inwisselen (fase 6b) — vereist een gezin-account, want de code
  // wordt server-side bijgehouden zodat 'ie niet oneindig herbruikt kan worden.
  const redeemPromo = async () => {
    if (!S.familyId) { alertX("Eerst een gezin-account", "Maak eerst een gezin-account aan (Gezin-tab) om een code in te wisselen."); return; }
    if (!promoInput.trim()) return;
    try {
      const ok = await fam.redeemPromoCode(promoInput.trim());
      if (ok) { patch({ premiumUnlocked: true }); setPromoInput(""); alertX("Gelukt! ✨", "Premium is ontgrendeld voor jullie gezin."); }
      else alertX("Code werkt niet", "Onbekend, verlopen, of al gebruikt.");
    } catch { alertX("Dat ging niet goed", "Probeer het nog eens."); }
  };

  // Externe bijdrage handmatig registreren nadat een ouder 'm echt heeft ontvangen.
  const receiveGift = (kidKey, cents, giver) => {
    setS(s => ({ ...s, balances: { ...s.balances, [kidKey]: (s.balances[kidKey] || 0) + cents } }));
    addFeed({ who: kidKey, badge: `🎁 Bijdrage van ${giver}: ${fmt(cents)}` });
    setGiftModal(false);
    if (S.familyId && fam.backendConfigured) {
      push.addLedgerEntry(S.familyId, { member_id: kidKey, cents, kind: "manual_adjustment", note: `Bijdrage van ${giver}` });
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { alertX("Camera", "Geef cameratoegang om bewijsfoto's te maken."); return null; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.4, allowsEditing: false });
    return res.canceled ? null : res.assets[0].uri;
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
    return res.canceled ? null : res.assets[0].uri;
  };

  const addFeed = (post) => {
    const id = uid();
    const time = new Date().toISOString();
    const rx = { "👏": 0, "🔥": 0, "❤️": 0 };
    setS(s => ({ ...s, feed: [{ id, time, rx, ...post }, ...s.feed] }));
    if (S.familyId && fam.backendConfigured) {
      push.addFeedPost(S.familyId, {
        id, who: post.who ?? null, title: post.title ?? null, cents: post.cents ?? null,
        before_uri: post.beforeUri ?? null, after_uri: post.afterUri ?? null, badge: post.badge ?? null, rx,
      });
    }
  };

  // Vuurt eenmalig een feed-badge af zodra een kind een klusjes-mijlpaal (10/25/50/100)
  // haalt — hergebruikt het bestaande badge-feedbericht-patroon (zie SPAARDOEL BEREIKT
  // hieronder). doneCount wordt door de aanroeper meegegeven omdat S.feed op dat moment
  // de zojuist toegevoegde klus nog niet bevat (setS is niet synchroon).
  const checkChoreMilestones = (kidId, doneCount) => {
    const seen = S.milestonesSeen[kidId] || [];
    const hit = CHORE_MILESTONES.find(n => doneCount >= n && !seen.includes(n));
    if (!hit) return;
    addFeed({ who: kidId, badge: `🏆 ${hit} klusjes gedaan!` });
    setS(s => ({ ...s, milestonesSeen: { ...s.milestonesSeen, [kidId]: [...(s.milestonesSeen[kidId] || []), hit] } }));
    maybeAskForReview();
  };

  // Vraagt de native store-review-popup (Apple/Google) — alleen aan ouders (zij
  // hebben het account), alleen op een positief moment (mijlpaal/spaardoel/uitbetaling),
  // en met een ruime lokale afkoeltijd zodat het nooit als opdringerig aanvoelt. Apple
  // begrenst dit sowieso al tot 3x/jaar op OS-niveau; deze afkoeltijd blijft daar ruim onder.
  const REVIEW_COOLDOWN_DAYS = 120;
  const maybeAskForReview = async () => {
    if (role !== "ouder") return;
    const last = S.reviewPromptAskedAt ? new Date(S.reviewPromptAskedAt).getTime() : 0;
    if (Date.now() - last < REVIEW_COOLDOWN_DAYS * 86400000) return;
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;
    setS(s => ({ ...s, reviewPromptAskedAt: new Date().toISOString() }));
    StoreReview.requestReview();
  };

  // Deelbare mijlpaal-kaart (Strava/Life360-stijl groei via social proof, i.p.v. een
  // verwijs-bonus die als spam kan voelen) — GEEN beloning gekoppeld aan delen, en de
  // kindnaam staat er standaard NIET op (privacy: expliciete opt-in via de schakelaar
  // in het deel-scherm, zie shareShowName hieronder).
  const shareCardImage = async () => {
    try {
      const uri = await captureRef(shareCardRef, { format: "png", quality: 0.95 });
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = uri; a.download = "heitje-mijlpaal.png"; a.click();
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Deel dit moment" });
      }
    } catch {
      alertX("Dat ging niet goed", "Kon de afbeelding niet maken. Probeer het nog eens.");
    }
  };

  const react = (id, e) => {
    const post = S.feed.find(p => p.id === id);
    if (!post) return;
    const rx = { ...post.rx, [e]: post.rx[e] + 1 };
    setS(s => ({ ...s, feed: s.feed.map(p => p.id === id ? { ...p, rx } : p) }));
    if (S.familyId && fam.backendConfigured) push.updateFeedPost(id, { rx });
  };

  // ----- Chore flow -----
  // Centrale patch-helper — alle klusje-statuswijzigingen (claim, foto's, afronden,
  // afkeuren, checklist) lopen hierdoorheen, dus krijgen de cloud-sync in één keer mee.
  const setChore = (id, up) => {
    setS(s => ({ ...s, chores: s.chores.map(c => c.id === id ? { ...c, ...up } : c) }));
    if (S.familyId && fam.backendConfigured) {
      const values = {};
      for (const [k, v] of Object.entries(up)) {
        if (k === "by") values.claimed_by = v;
        else if (k === "reason") values.reject_reason = v;
        else if (k === "beforeUri") values.before_uri = v;
        else if (k === "afterUri") values.after_uri = v;
        else values[k] = v;
      }
      push.updateChore(id, values);
    }
    // Klusje klaar gemeld — elke ouder met een pushtoken een melding sturen dat er
    // iets op ze wacht (dekt zowel submitNoPhoto als photoAfter, die allebei hier
    // doorheen lopen).
    if (up.status === "waiting") {
      const chore = S.chores.find(c => c.id === id);
      for (const parent of Object.values(S.members).filter(m => m.role === "ouder")) {
        if (parent.push_token) {
          sendPushNotification(parent.push_token, "Klusje wacht op goedkeuring",
            `${chore?.title || "Een klusje"} is klaar gemeld.`, { choreId: id });
        }
      }
    }
  };

  // Voorwaarden: checklist afvinken en of alles klaar is
  const condChecklist = (c) => c.conditions?.checklist || [];
  const allChecked = (c) => condChecklist(c).every((_, i) => !!c.checked?.[i]);
  const toggleCheck = (c, i) => setChore(c.id, { checked: condChecklist(c).map((_, j) => j === i ? !(c.checked?.[i]) : !!c.checked?.[j]) });

  // Ouders verdienen geen zakgeld — de UI toont de claim-knop al alleen aan kinderen,
  // dit is de extra ondergrens zodat het ook via een andere weg nooit kan.
  const claim = (c) => { if (role !== "kind") return; setChore(c.id, { status: "claimed", by: me, checked: condChecklist(c).map(() => false) }); };

  const photoBefore = async (c) => {
    const uri = await takePhoto();
    if (uri) setChore(c.id, { status: "before", beforeUri: uri });
  };

  const photoAfter = async (c) => {
    const uri = await takePhoto();
    if (uri) setChore(c.id, { status: "waiting", afterUri: uri });
  };

  // Klaar melden zonder foto — foto's zijn optioneel geworden
  const submitNoPhoto = (c) => setChore(c.id, { status: "waiting" });

  // Een klusje van een kind blijft na goedkeuring op status "approved" staan totdat
  // het kind kiest sparen/saldo (allocate hieronder) — bewust GEEN lokaal-only
  // pendingAlloc meer: dat veld synchroniseerde nooit naar de cloud, dus op een ander
  // toestel dan waar goedgekeurd werd, kwam het verdiende bedrag nergens terecht. Door
  // dit aan het klusje zelf te hangen (dat al wél synct) werkt de keuze op elk toestel.
  const approve = async (c) => {
    addFeed({ who: c.by, title: c.title, cents: c.cents, beforeUri: c.beforeUri, afterUri: c.afterUri });
    const isKid = S.members[c.by]?.role === "kind";
    if (isKid) {
      setChore(c.id, { status: "approved" });
      // Direct bijschrijven op het vrije saldo — dit is de kernbelofte "zakgeld
      // wordt automatisch bijgehouden". Het kind kan het geld hierna nog naar een
      // spaardoel verplaatsen (zie allocate()), maar dat mag het bijschrijven zelf
      // niet blokkeren: anders blijft "Gezinssaldo"/"Samen gespaard" op €0,00 staan
      // totdat het kind toevallig zelf inlogt en kiest.
      setS(s => ({ ...s, balances: { ...s.balances, [c.by]: (s.balances[c.by] || 0) + c.cents } }));
      addPendingDelta(c.by, c.cents); // beschermt dit bedrag tegen een te vroege cloud-pull
      if (S.familyId && fam.backendConfigured) {
        push.addLedgerEntry(S.familyId, { member_id: c.by, cents: c.cents, kind: "chore_reward", chore_id: c.id });
        flushPendingWrites(); // direct achter de bijschrijving aan, zodat de cloud snel klopt
      }
      const kid = S.members[c.by];
      if (kid?.push_token) {
        sendPushNotification(kid.push_token, "Goedgekeurd! 🎉",
          `"${c.title}" is goedgekeurd — kies sparen of saldo.`, { choreId: c.id });
      }
      // Streak/mijlpalen bijwerken alsof de zojuist toegevoegde feed-post er al in zit
      // (addFeed hierboven is nog niet doorgekomen in deze S — setS is niet synchroon).
      const newStreak = computeStreak([{ time: new Date().toISOString(), who: c.by }, ...S.feed], c.by);
      if (newStreak !== kid?.streak) {
        setS(s => ({ ...s, members: { ...s.members, [c.by]: { ...s.members[c.by], streak: newStreak } } }));
        if (S.familyId && fam.backendConfigured) push.updateMember(c.by, { streak: newStreak });
      }
      const doneCount = S.feed.filter(p => p.who === c.by && !p.badge).length + 1;
      checkChoreMilestones(c.by, doneCount);
    } else {
      // Ouders verdienen normaal geen zakgeld (UI blokkeert dit al) — dit pad is
      // defensief, geen keuze-moment nodig, dus meteen als "allocated" afronden.
      setS(s => ({ ...s, chores: s.chores.filter(x => x.id !== c.id), balances: { ...s.balances, [c.by]: s.balances[c.by] + c.cents } }));
      addPendingDelta(c.by, c.cents);
      if (S.familyId && fam.backendConfigured) {
        push.updateChore(c.id, { status: "approved", allocated: true });
        push.addLedgerEntry(S.familyId, { member_id: c.by, cents: c.cents, kind: "chore_reward", chore_id: c.id });
        flushPendingWrites();
      }
    }
  };

  const doReject = (id, reason) => {
    const c = S.chores.find(x => x.id === id);
    setChore(id, { status: "rejected", reason: reason || "Nog niet af" });
    setRejectFor(null);
    const kid = c ? S.members[c.by] : null;
    if (kid?.push_token) {
      sendPushNotification(kid.push_token, "Nog niet goedgekeurd",
        reason || "Nog niet af — probeer het opnieuw.", { choreId: id });
    }
  };

  // Het klusje (van wie dan ook, op welk toestel dan ook) dat op de keuze sparen/saldo
  // wacht — vervangt het oude lokale-only S.pendingAlloc.
  const awaitingAllocation = S.chores.find(c => c.by === me && c.status === "approved" && !c.allocated);

  // goalId: welk van de (meestal 2) spaardoelen van dit kind krijgt het bedrag —
  // null betekent "algemeen saldo" (alleen nog een vangnet voor het randgeval dat
  // een kind écht geen enkel spaardoel heeft, bijv. via een oude/kapotte cloud-sync).
  const allocate = (goalId) => {
    if (!awaitingAllocation) return;
    if (role === "kind") boom(); // kind viert het verdiende bedrag direct bij het kiezen van sparen/spaardoel
    const { id: choreId, by: kid, cents, title } = awaitingAllocation;
    const kidGoals = S.goals[kid] || [];
    const idx = goalId ? kidGoals.findIndex(x => x.id === goalId) : -1;
    if (goalId && idx === -1 && kidGoals.length) return; // onbekend doel-id, niet stilzwijgend het verkeerde doel raken
    if (goalId) {
      const isNew = idx === -1;
      const g = isNew ? { id: uid(), name: "Speelgoed", emoji: "🎁", imageUri: null, target: 1500, saved: 0, link: "", approved: true } : kidGoals[idx];
      const newSaved = g.saved + cents;
      const newGoals = isNew ? [...kidGoals, { ...g, saved: newSaved }] : kidGoals.map((x, i) => i === idx ? { ...x, saved: newSaved } : x);
      // Het bedrag staat sinds approve() al op het vrije saldo — hier verhuist het
      // alleen naar het spaardoel (saldo omlaag, goal.saved omhoog), er komt geen
      // nieuw geld bij.
      setS(s => ({ ...s, goals: { ...s.goals, [kid]: newGoals }, balances: { ...s.balances, [kid]: s.balances[kid] - cents }, chores: s.chores.filter(x => x.id !== choreId) }));
      addFeed({ who: kid, badge: `🐷 ${fmt(cents)} gespaard voor ${g.name}` });
      if (S.familyId && fam.backendConfigured) {
        if (isNew) {
          push.upsertGoal(S.familyId, kid, {
            id: g.id, name: g.name, emoji: g.emoji, image_uri: g.imageUri,
            target: g.target, saved: newSaved, link: g.link, approved: g.approved,
          });
        } else if (g.id) push.updateGoal(g.id, { saved: newSaved });
        // Tegenboeking van de chore_reward-entry die approve() al aanmaakte — het geld
        // verlaat het vrije saldo en gaat naar het spaardoel (dat los van de ledger wordt bijgehouden).
        push.addLedgerEntry(S.familyId, { member_id: kid, cents: -cents, kind: "manual_adjustment", chore_id: choreId });
        push.updateChore(choreId, { allocated: true });
        flushPendingWrites();
      }
      addPendingDelta(kid, -cents); // geld verhuist naar het spaardoel — beschermt tegen te vroege pull
      if (newSaved >= g.target) {
        boom();
        addFeed({ who: kid, badge: `🎉 SPAARDOEL BEREIKT: ${g.name}!` });
        alertX("DOEL BEREIKT! 🎉", "Papa en mama: tijd om te kopen 🛒");
        maybeAskForReview();
      }
    } else {
      // Geld staat al op het vrije saldo sinds approve() — hier alleen het klusje
      // als afgehandeld markeren, geen tweede keer bijschrijven.
      setS(s => ({ ...s, chores: s.chores.filter(x => x.id !== choreId) }));
      addFeed({ who: kid, badge: `💶 ${fmt(cents)} gespaard (vrij saldo)` });
      if (S.familyId && fam.backendConfigured) {
        push.updateChore(choreId, { allocated: true });
        flushPendingWrites();
      }
    }
  };

  const payout = (kid) => {
    alertX("Uitbetalen", `${fmt(S.balances[kid])} aan ${S.members[kid].name} uitbetaald (buiten de app)?`, [
      { text: "Annuleren", style: "cancel" },
      { text: "Ja, registreer", onPress: () => {
          // Bedrag pas ophalen op het moment van bevestigen (via de setS-updater, dus
          // altijd de meest actuele stand) — niet het bedrag van toen de dialoog
          // opende, dat kon intussen al achterhaald zijn door een klusje dat via een
          // ander toestel is goedgekeurd terwijl deze dialoog nog open stond.
          let paidCents = 0;
          setS(s => {
            paidCents = s.balances[kid] || 0;
            return { ...s, balances: { ...s.balances, [kid]: 0 } };
          });
          addFeed({ who: kid, badge: `💶 Zakgeld uitbetaald: ${fmt(paidCents)}` });
          if (S.familyId && fam.backendConfigured && paidCents) {
            push.addLedgerEntry(S.familyId, { member_id: kid, cents: -paidCents, kind: "payout" });
          }
          if (paidCents) maybeAskForReview();
        } },
    ]);
  };

  const approveGoal = (kid, goalId) => {
    setS(s => ({ ...s, goals: { ...s.goals, [kid]: (s.goals[kid] || []).map(g => g.id === goalId ? { ...g, approved: true } : g) } }));
    const g = (S.goals[kid] || []).find(x => x.id === goalId);
    if (S.familyId && fam.backendConfigured && g?.id) push.updateGoal(g.id, { approved: true });
    const member = S.members[kid];
    if (member?.push_token && g) {
      sendPushNotification(member.push_token, "Spaardoel goedgekeurd! 🐷",
        `De winkellink voor "${g.name}" staat nu open.`, { goalId: g.id });
    }
  };

  // ----- Huiswerk -----
  const addHomework = (item) => {
    setS(s => ({ ...s, homework: [...s.homework, item] }));
    setHomeworkModal(false);
    if (S.familyId && fam.backendConfigured) {
      push.upsertHomework(S.familyId, {
        id: item.id, member_id: item.memberId, title: item.title, subject: item.subject || null,
        due_date: item.dueDate, done: false, cents: item.cents ?? null, minutes: item.minutes ?? null,
      });
    }
  };

  const toggleHomeworkDone = (h) => {
    const done = !h.done;
    setS(s => ({ ...s, homework: s.homework.map(x => x.id === h.id ? { ...x, done } : x) }));
    if (S.familyId && fam.backendConfigured) push.updateHomework(h.id, { done });
    // Alleen een melding sturen als er een beloning aan hangt en het net is afgevinkt —
    // anders krijgen ouders bij elk kaal huiswerk-vinkje een melding.
    if (done && (h.cents || h.minutes)) {
      for (const parent of Object.values(S.members).filter(m => m.role === "ouder")) {
        if (parent.push_token) {
          sendPushNotification(parent.push_token, "Huiswerk wacht op goedkeuring",
            `${h.title} is afgerond.`, { homeworkId: h.id });
        }
      }
    }
  };

  // Geen sparen/saldo-keuze zoals bij klusjes — huiswerkbeloning gaat direct naar het
  // saldo/tegoed, bewust een kleinere stap dan de klusjes-flow. Vertakt op welke van de
  // twee valuta's aan dit item hangt (nooit allebei).
  const approveHomeworkReward = (h) => {
    if (h.minutes) {
      setS(s => ({
        ...s,
        homework: s.homework.map(x => x.id === h.id ? { ...x, rewardApproved: true } : x),
        screenBalances: { ...s.screenBalances, [h.memberId]: (s.screenBalances[h.memberId] || 0) + h.minutes },
      }));
      if (S.familyId && fam.backendConfigured) {
        push.updateHomework(h.id, { reward_approved: true });
        push.adjustScreentime(h.memberId, h.minutes);
      }
      const member = S.members[h.memberId];
      if (member?.push_token) {
        sendPushNotification(member.push_token, "Schermtijd goedgekeurd! 🎉",
          `${fmtMin(h.minutes)} voor "${h.title}" staat op je tegoed.`, { homeworkId: h.id });
      }
      return;
    }
    setS(s => ({
      ...s,
      homework: s.homework.map(x => x.id === h.id ? { ...x, rewardApproved: true } : x),
      balances: { ...s.balances, [h.memberId]: s.balances[h.memberId] + h.cents },
    }));
    if (S.familyId && fam.backendConfigured) {
      push.updateHomework(h.id, { reward_approved: true });
      push.addLedgerEntry(S.familyId, { member_id: h.memberId, cents: h.cents, kind: "homework_reward", note: `Huiswerk: ${h.title}` });
    }
    const member = S.members[h.memberId];
    if (member?.push_token) {
      sendPushNotification(member.push_token, "Huiswerkgeld goedgekeurd! 🎉",
        `${fmt(h.cents)} voor "${h.title}" staat op je saldo.`, { homeworkId: h.id });
    }
  };

  // ----- Schermtijd: spaardoel + timer -----
  const approveScreenGoal = (kid) => {
    setS(s => ({ ...s, screenGoals: { ...s.screenGoals, [kid]: { ...s.screenGoals[kid], approved: true } } }));
    const g = S.screenGoals[kid];
    if (S.familyId && fam.backendConfigured && g?.id) push.updateScreenGoal(g.id, { approved: true });
  };

  const [screenTimer, setScreenTimer] = useState(null); // { totalSeconds, remaining } — puur lokaal, niet bewaard
  const startScreenTimer = (minutes) => {
    const bal = S.screenBalances[me] || 0;
    if (minutes <= 0 || minutes > bal) return;
    setS(s => ({ ...s, screenBalances: { ...s.screenBalances, [me]: bal - minutes } }));
    if (S.familyId && fam.backendConfigured) push.adjustScreentime(me, -minutes);
    setScreenTimer({ totalSeconds: minutes * 60, remaining: minutes * 60 });
  };
  useEffect(() => {
    if (!screenTimer || screenTimer.remaining <= 0) return;
    const t0 = setTimeout(() => {
      setScreenTimer(s => s ? { ...s, remaining: s.remaining - 1 } : s);
    }, 1000);
    return () => clearTimeout(t0);
  }, [screenTimer]);
  useEffect(() => {
    if (screenTimer && screenTimer.remaining <= 0) {
      boom();
      alertX("Tijd is op! ⏰", "Je schermtijd is verbruikt.");
      setScreenTimer(null);
    }
  }, [screenTimer?.remaining]);

  // ----- UI helpers -----
  const kids = Object.keys(S.members).filter(k => S.members[k].role === "kind");
  const guests = Object.keys(S.members).filter(k => S.members[k].role === "gast");
  const hosts = Object.keys(S.members).filter(k => S.members[k].role === "host");
  const waiting = S.chores.filter(c => c.status === "waiting");
  const active = S.chores.filter(c => true);
  const myGoals = role === "kind" ? (S.goals[me] || []) : [];
  const myGoal = myGoals[0] || null; // primair doel — gebruikt voor de compacte hero/dashboard-previews

  const Progress = ({ pct, uri, emoji, big }) => jr
    ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, width: "100%" }}>
        <View style={{ width: big ? 96 : 72, height: big ? 96 : 72, borderRadius: 20, overflow: "hidden" }}>
          <PhotoBox t={t} uri={uri} emoji={emoji} h={big ? 96 : 72} r={20} />
        </View>
        <View style={{ flex: 1 }}><JuniorBar t={t} pct={pct} big={big} /></View>
      </View>
    )
    : <Ring t={t} pct={pct} uri={uri} emoji={emoji} size={big ? 170 : 118} />;

  // ----- Profile picker (first launch / switch) -----
  if (!loaded) return <View style={{ flex: 1, backgroundColor: light.bg }} />;

  // Zolang de gezinsleden nog exact de ongewijzigde demo-set zijn (Emma/Daan/Vader/Moeder),
  // is er verplicht eerst een echte ouder aan te maken — ongeacht lastMe/setupDone, want
  // anders blijven mensen voor altijd met demo-namen zitten. De wizard vervangt de demo-set
  // volledig; `onComplete` reset ook `me`/`lastMe` zodat er nooit naar een verdwenen profiel
  // verwezen wordt (dat gaf ooit de witte-scherm-crash).
  const stillDemoData = JSON.stringify(S.members) === JSON.stringify(DEFAULT_MEMBERS);
  if (stillDemoData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <WelcomeWizard t={t} onComplete={(members, balances, goals) => {
          // Een echte verse start: ook de demo-klusjes/spaardoelen/feed weg, niet
          // alleen de demo-namen — anders blijft "Vaatwasser uitruimen" van Emma/Daan
          // gewoon in de pool staan voor een gezin dat nog nooit klusjes had. Elk kind
          // krijgt hier al wel zijn eigen 2 standaard spaardoelen mee (zie defaultGoals()).
          setS(s => ({ ...s, members, balances, chores: [], goals: goals || {}, feed: [], screenGoals: {},
            setupDone: true, lastMe: null }));
          setMe(null);
        }} />
      </SafeAreaView>
    );
  }

  if (!me) {
    if (familySetupOpen) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <StatusBar style={isDark ? "light" : "dark"} />
          <FamilySetup t={t} jr={false} fam={fam} localState={S} onDone={onFamilySetupDone}
            onCancel={() => { setFamilySetupOpen(false); setFamilySetupDismissed(true); }} />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
          <Text style={{ fontSize: 52, fontWeight: "900", color: t.ink, letterSpacing: -2 }}>
            Heit<Text style={{ color: t.accent }}>je</Text></Text>
          <Text style={{ fontSize: 18, fontWeight: "800", color: t.accent, marginBottom: 26 }}>voor een karweitje</Text>
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.ink }}>Wie ben jij?</Text>
          <Text style={{ fontSize: 13, color: t.sub, marginBottom: 16 }}>Tik op je naam. Je blijft daarna ingelogd op dit toestel.</Text>
          {Object.entries(S.members).map(([k, m]) => (
            <TouchableOpacity key={k} onPress={() => pick(k)} style={{ backgroundColor: t.card, borderWidth: 1,
              borderColor: k === S.lastMe ? t.accent : t.line, borderRadius: 18, padding: 16, marginBottom: 10, flexDirection: "row",
              alignItems: "center", gap: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: t.soft, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 26 }}>{m.avatar}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 17, color: t.ink }}>{m.name}</Text>
                <Text style={{ fontSize: 12.5, color: t.sub }}>
                  {m.role === "kind" ? `Kind · ${m.age} jaar` : m.role === "gast" ? "Gast" : "Ouder"}{k === S.lastMe ? " · laatst gebruikt" : ""}</Text>
              </View>
              <Text style={{ fontSize: 20, color: t.sub }}>›</Text>
            </TouchableOpacity>
          ))}
          {fam.backendConfigured && !S.familyId && !familySetupDismissed ? (
            <TouchableOpacity onPress={() => setFamilySetupOpen(true)} style={{ marginTop: 8, alignItems: "center" }}>
              <Text style={{ color: t.accent, fontWeight: "800", fontSize: 13.5 }}>
                👨‍👩‍👧‍👦 Gezin aanmaken of koppelen met een code</Text>
            </TouchableOpacity>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 20 }}>
            <TouchableOpacity onPress={() => Linking.openURL(`${LEGAL_BASE}/privacy.html`)}>
              <Text style={{ color: t.sub, fontSize: 12, textDecorationLine: "underline" }}>Privacybeleid</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(`${LEGAL_BASE}/voorwaarden.html`)}>
              <Text style={{ color: t.sub, fontSize: 12, textDecorationLine: "underline" }}>Voorwaarden</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        {pinGateModal}
      </SafeAreaView>
    );
  }

  // Eerlijke uitleg over kosten en reclame — alleen relevant voor een ouder (kinderen
  // hebben nooit reclame of kosten, zie PricingIntro zelf), dus pas hier tonen i.p.v.
  // vóór de profielkiezer. Zo begint een kind altijd meteen met "Wie ben jij?" i.p.v.
  // met een scherm over abonnementen. Eenmalig per toestel, via Instellingen opnieuw te bekijken.
  if (role === "ouder" && (!S.pricingSeen || pricingForced)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <PricingIntro t={t} onContinue={() => { patch({ pricingSeen: true }); setPricingForced(false); }} />
      </SafeAreaView>
    );
  }

  // Host (bv. de buurvrouw, uitgenodigd voor precies één kind) krijgt een losstaand,
  // minimaal scherm — geen toegang tot de rest van het gezin. Alleen: klusjes aanbieden
  // aan dat ene kind + zelf goedkeuren na uitchecken.
  if (role === "host") {
    const childName = S.members[M?.hostChildId]?.name;
    const myJobs = S.neighborJobs.filter(j => j.hostId === me).slice().reverse();
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <HostView t={t} M={M} fmt={fmt} childName={childName} myJobs={myJobs}
          onSubmit={submitNeighborJob} onDecide={decideNeighborJobAsHost} />
      </SafeAreaView>
    );
  }

  // Gast (opa/oma/oom/tante/vriend, uitgenodigd via een privé-code) krijgt een
  // losstaand, minimaal scherm — geen toegang tot Home/Klusjes/Sparen/Huiswerk/Gezin/
  // Instellingen. Alleen: klusje voorstellen + eigen voorstellen terugzien.
  if (role === "gast") {
    const myOffers = S.choreOffers.filter(o => o.offeredBy === me).slice().reverse();
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <GastView t={t} M={M} fmt={fmt} myOffers={myOffers} onSubmit={submitChoreOffer} />
      </SafeAreaView>
    );
  }

  // ----- Chore card -----
  const ChoreCard = ({ c }) => {
    const mine = c.by === me;
    const cd = c.conditions;
    const interactive = mine && (c.status === "claimed" || c.status === "before" || c.status === "rejected");
    const canFinish = allChecked(c);
    return (
      <Card t={t} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: jr ? 54 : 46, height: jr ? 54 : 46, borderRadius: 14, backgroundColor: t.soft,
            alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: jr ? 28 : 22 }}>{c.emoji || "🧽"}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: jr ? 16 : 15, color: t.ink }}>{c.title}</Text>
            <Text style={{ fontSize: 12, color: t.sub }}>{c.room}</Text>
            {c.offeredBy ? (
              <Text style={{ fontSize: 11, color: t.accent, marginTop: 2 }}>
                🎗️ Aangeboden door {S.members[c.offeredBy]?.name || "een gast"}</Text>
            ) : null}
          </View>
          <Amount t={t} size={jr ? 24 : 22}>{fmt(c.cents)}</Amount>
        </View>

        {(c.status === "waiting" || c.status === "rejected") && (c.beforeUri || c.afterUri) ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <PhotoBox t={t} uri={c.beforeUri} label="VOOR" />
            <PhotoBox t={t} uri={c.afterUri} label="NA" />
          </View>
        ) : null}

        {cd ? (
          <View style={{ marginTop: 10, backgroundColor: t.soft, borderRadius: 14, padding: 12, gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: t.sub }}>VOORWAARDEN VAN PAPA/MAMA</Text>
            {cd.note ? <Text style={{ fontSize: 13, color: t.ink }}>📝 {cd.note}</Text> : null}
            {cd.deadline ? <Text style={{ fontSize: 13, color: t.ink, fontWeight: "700" }}>⏰ Klaar voor: {cd.deadline}</Text> : null}
            {cd.photoRequired ? <Text style={{ fontSize: 13, color: t.ink }}>📸 Foto verplicht bij deze klus</Text> : null}
            {cd.checklist?.length ? cd.checklist.map((item, i) => {
              const on = !!c.checked?.[i];
              const inner = (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                    borderColor: on ? t.green : t.line, backgroundColor: on ? t.green : "transparent",
                    alignItems: "center", justifyContent: "center" }}>
                    {on ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900" }}>✓</Text> : null}
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, color: t.ink, textDecorationLine: on ? "line-through" : "none" }}>{item}</Text>
                </View>
              );
              return interactive
                ? <TouchableOpacity key={i} onPress={() => toggleCheck(c, i)}>{inner}</TouchableOpacity>
                : <View key={i}>{inner}</View>;
            }) : null}
          </View>
        ) : null}

        <View style={{ marginTop: 10 }}>
          {c.status === "open" && role === "kind" &&
            <Btn t={t} jr={jr} small={!jr} onPress={() => claim(c)}>{jr ? "Pak 'm! 🙌" : "Claimen"}</Btn>}
          {c.status === "open" && role === "ouder" &&
            <Text style={{ fontSize: 13, color: t.sub }}>Staat open in de pool</Text>}
          {c.status === "claimed" && (mine
            ? (!canFinish
                ? <Text style={{ fontSize: 13, color: t.sub, fontWeight: "700" }}>Vink eerst alle punten hierboven af ✔️</Text>
                : cd?.photoRequired
                  ? <Btn t={t} jr={jr} small={!jr} kind="success" onPress={() => photoAfter(c)}>{jr ? "📸 Maak foto & klaar!" : "📸 Maak foto & rond af"}</Btn>
                  : <View style={{ gap: 8 }}>
                      <Btn t={t} jr={jr} small={!jr} kind="success" onPress={() => submitNoPhoto(c)}>{jr ? "✅ Klaar! Laat kijken" : "✅ Klaar — vraag goedkeuring"}</Btn>
                      <Btn t={t} jr={jr} small={!jr} kind="ghost" onPress={() => photoBefore(c)}>📸 Foto's maken (mag ook)</Btn>
                    </View>)
            : <Text style={{ fontSize: 13, color: t.sub }}>Geclaimd door {S.members[c.by]?.name}</Text>)}
          {c.status === "before" && (mine
            ? (!canFinish
                ? <Text style={{ fontSize: 13, color: t.sub, fontWeight: "700" }}>Vink eerst alle punten hierboven af ✔️</Text>
                : <View style={{ gap: 8 }}>
                    <Btn t={t} jr={jr} small={!jr} kind="success" onPress={() => photoAfter(c)}>{jr ? "📸 Klaar! Foto erna" : "📸 Klaar — na-foto maken"}</Btn>
                    {!cd?.photoRequired ? <Btn t={t} jr={jr} small={!jr} kind="ghost" onPress={() => submitNoPhoto(c)}>Klaar zonder na-foto</Btn> : null}
                  </View>)
            : <Text style={{ fontSize: 13, color: t.sub }}>{S.members[c.by]?.name} is bezig</Text>)}
          {c.status === "waiting" && role === "kind" &&
            <Text style={{ fontSize: jr ? 14 : 13, color: t.sub }}>
              {mine ? (jr ? "Papa of mama kijkt ⏳" : "Wacht op goedkeuring ⏳") : `${S.members[c.by]?.name} wacht op goedkeuring`}</Text>}
          {c.status === "waiting" && role === "ouder" && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Btn t={t} small kind="success" onPress={() => approve(c)}>Goedkeuren ✓</Btn>
              <Btn t={t} small kind="danger" onPress={() => setRejectFor(c.id)}>Afkeuren…</Btn>
            </View>
          )}
          {c.status === "rejected" && (mine && role === "kind"
            ? <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, color: t.danger, fontWeight: "700" }}>Afgekeurd: "{c.reason}"</Text>
                {!canFinish
                  ? <Text style={{ fontSize: 13, color: t.sub, fontWeight: "700" }}>Vink eerst alle punten hierboven af ✔️</Text>
                  : cd?.photoRequired
                    ? <Btn t={t} jr={jr} small={!jr} kind="success" onPress={() => photoAfter(c)}>📸 Foto & opnieuw indienen</Btn>
                    : <>
                        <Btn t={t} jr={jr} small={!jr} kind="success" onPress={() => submitNoPhoto(c)}>{jr ? "✅ Opnieuw klaar!" : "✅ Opnieuw indienen"}</Btn>
                        <Btn t={t} jr={jr} small={!jr} kind="ghost" onPress={() => photoAfter(c)}>📸 Nieuwe na-foto</Btn>
                      </>}
              </View>
            : <Text style={{ fontSize: 13, color: t.sub }}>Afgekeurd: "{c.reason}"</Text>)}
        </View>
      </Card>
    );
  };

  // ----- Goal card -----
  // Neemt tegenwoordig één spaardoel-object direct aan (i.p.v. het via `kid` op te
  // zoeken) — de aanroeper (Sparen-tab/MemberCard) loopt over S.goals[kid], dat nu
  // een LIJST van doelen is (max FREE_GOAL_LIMIT gratis), niet meer één object.
  const GoalCard = ({ goal, kid, own }) => {
    const g = goal;
    const m = S.members[kid];
    const pct = g.saved / g.target;
    if (own) {
      return (
        <Card t={t} style={{ marginBottom: 12, alignItems: "center", padding: 24 }}>
          <Progress pct={pct} uri={g.imageUri} emoji={g.emoji} big />
          <Text style={{ fontWeight: "800", fontSize: jr ? 20 : 18, color: t.ink, marginTop: 18 }}>{g.name}</Text>
          <Amount t={t} size={jr ? 48 : 44}>{fmt(g.saved)}</Amount>
          <Text style={{ fontSize: 16, fontWeight: "700", color: t.sub, marginTop: 4 }}>
            van {fmt(g.target)}{!jr && g.saved < g.target ? ` · nog ${fmt(g.target - g.saved)}` : ""}</Text>
          {g.saved >= g.target ? (
            <Text style={{ marginTop: 10, fontWeight: "800", color: t.green, fontSize: 16, textAlign: "center" }}>
              Doel bereikt! 🎉 Tijd om te kopen 🛒</Text>
          ) : null}
          <View style={{ marginTop: 12 }}>
            {g.approved
              ? <Chip t={t}>🔗 Link open — doel goedgekeurd ✓</Chip>
              : <Chip t={t} color={t.amber}>⏳ Wacht op goedkeuring — link op slot 🔒</Chip>}
          </View>
        </Card>
      );
    }
    return (
      <Card t={t} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden" }}>
            <PhotoBox t={t} uri={g.imageUri} emoji={g.emoji} h={64} r={16} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink }}>{m.avatar} {m.name} · {g.name}</Text>
            <Amount t={t}>{fmt(g.saved)} <Text style={{ fontSize: 13, color: t.sub, fontWeight: "700" }}>/ {fmt(g.target)}</Text></Amount>
            <View style={{ marginTop: 6 }}>
              {jr ? <JuniorBar t={t} pct={pct} /> : (
                <View style={{ height: 8, borderRadius: 999, backgroundColor: t.soft }}>
                  <View style={{ width: `${Math.min(100, pct * 100)}%`, height: "100%", borderRadius: 999, backgroundColor: t.accent }} />
                </View>
              )}
            </View>
            {!g.approved ? <Text style={{ fontSize: 12, color: t.amber, fontWeight: "700", marginTop: 6 }}>⏳ Doel wacht op goedkeuring</Text> : null}
          </View>
          {role === "ouder" && !g.approved
            ? <Btn t={t} small kind="success" onPress={() => approveGoal(kid, g.id)}>Keur goed ✓</Btn> : null}
        </View>
      </Card>
    );
  };

  // Spiegelt GoalCard, maar dan voor het schermtijd-spaardoel (los tegoed, losse tabel) —
  // een gratis gezin mag naast het geld-spaardoel ook hier één spaardoel hebben ("extra").
  const ScreenGoalCard = ({ kid, own }) => {
    const g = S.screenGoals[kid];
    const m = S.members[kid];
    if (!g) {
      return kid === me ? (
        <Card t={t} onPress={() => setScreenGoalModal(true)} style={{ marginBottom: 12, alignItems: "center", borderStyle: "dashed" }}>
          <Text style={{ fontSize: 26 }}>🎮</Text>
          <Text style={{ fontWeight: "800", fontSize: 15, color: t.ink }}>＋ Schermtijd-spaardoel</Text>
          <Text style={{ fontSize: 13, color: t.sub, marginTop: 2 }}>Papa of mama keurt het daarna goed</Text>
        </Card>
      ) : null;
    }
    const pct = g.saved / g.target;
    if (own) {
      return (
        <Card t={t} style={{ marginBottom: 12, alignItems: "center", padding: 24 }}>
          <Progress pct={pct} uri={g.imageUri} emoji={g.emoji} big />
          <Text style={{ fontWeight: "800", fontSize: jr ? 20 : 18, color: t.ink, marginTop: 18 }}>{g.name}</Text>
          <Amount t={t} size={jr ? 48 : 44}>{fmtMin(g.saved)}</Amount>
          <Text style={{ fontSize: 16, fontWeight: "700", color: t.sub, marginTop: 4 }}>
            van {fmtMin(g.target)}{!jr && g.saved < g.target ? ` · nog ${fmtMin(g.target - g.saved)}` : ""}</Text>
          {g.saved >= g.target ? (
            <Text style={{ marginTop: 10, fontWeight: "800", color: t.green, fontSize: 16, textAlign: "center" }}>
              Doel bereikt! 🎉</Text>
          ) : null}
          <View style={{ marginTop: 12 }}>
            {g.approved
              ? <Chip t={t}>🔗 Doel goedgekeurd ✓</Chip>
              : <Chip t={t} color={t.amber}>⏳ Wacht op goedkeuring</Chip>}
          </View>
        </Card>
      );
    }
    return (
      <Card t={t} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden" }}>
            <PhotoBox t={t} uri={g.imageUri} emoji={g.emoji || "🎮"} h={64} r={16} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink }}>{m.avatar} {m.name} · {g.name}</Text>
            <Amount t={t}>{fmtMin(g.saved)} <Text style={{ fontSize: 13, color: t.sub, fontWeight: "700" }}>/ {fmtMin(g.target)}</Text></Amount>
            <View style={{ marginTop: 6 }}>
              {jr ? <JuniorBar t={t} pct={pct} /> : (
                <View style={{ height: 8, borderRadius: 999, backgroundColor: t.soft }}>
                  <View style={{ width: `${Math.min(100, pct * 100)}%`, height: "100%", borderRadius: 999, backgroundColor: t.accent }} />
                </View>
              )}
            </View>
            {!g.approved ? <Text style={{ fontSize: 12, color: t.amber, fontWeight: "700", marginTop: 6 }}>⏳ Doel wacht op goedkeuring</Text> : null}
          </View>
          {role === "ouder" && !g.approved
            ? <Btn t={t} small kind="success" onPress={() => approveScreenGoal(kid)}>Keur goed ✓</Btn> : null}
        </View>
      </Card>
    );
  };

  // ----- Home / dashboard (het pronkstuk) -----
  const Feed = () => {
    const openCount = S.chores.filter(c => c.status === "open").length;
    const totalSaved = Object.values(S.goals).reduce((a, list) => a + (list || []).reduce((b, g) => b + (g?.saved || 0), 0), 0);
    const doneCount = S.feed.filter(p => !p.badge).length;
    const kidBalances = Object.entries(S.balances).filter(([k]) => S.members[k]?.role === "kind");
    const topSaverKey = kidBalances.sort((a, b) => b[1] - a[1])[0]?.[0];
    const familyBalance = kidBalances.reduce((sum, [, v]) => sum + v, 0);
    // Vast wekelijks uitbetaal-moment (BusyKid-achtig "payday"-ritueel) — puur een
    // herinnering, geen automatische transactie: de app rekent nooit zelf geld uit.
    const isPayoutDay = role === "ouder" && familyBalance > 0 && new Date().getDay() === (S.payoutDay ?? 5);
    const mascotTip = MASCOT_TIPS[new Date().getDate() % MASCOT_TIPS.length];
    // "approved" is geen weergavestatus (dat is de keuze-modal hierboven) — anders
    // blijft een kaartje hier hangen zonder passende statustekst zolang het kind nog
    // niet gekozen heeft waar het bedrag heen gaat.
    const activeChoreOf = (k) => S.chores.find(c => c.by === k && c.status !== "open" && c.status !== "approved");
    const ordered = Object.entries(S.members).filter(([, m]) => m.role !== "gast")
      .sort((a, b) => (a[0] === me ? -1 : b[0] === me ? 1 : 0) || (S.balances[b[0]] - S.balances[a[0]]));

    const Tile = ({ icon, value, label, onPress, hot }) => (
      <Card t={t} onPress={onPress} style={{ flex: 1, minWidth: 0, paddingVertical: 15, paddingHorizontal: 10, alignItems: "flex-start" }}>
        <Text style={{ fontSize: 19 }}>{icon}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 23, fontWeight: "900", color: hot ? t.accent : t.ink, marginTop: 5, letterSpacing: -0.5 }}>{value}</Text>
        <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: "700", color: t.sub, marginTop: 1 }}>{label}</Text>
      </Card>
    );

    const Shortcut = ({ icon, label, onPress }) => (
      <TouchableOpacity onPress={onPress} style={{ width: 72, alignItems: "center", gap: 6 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: t.soft,
          borderWidth: 1, borderColor: t.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 24 }}>{icon}</Text>
        </View>
        <Text style={{ fontSize: 11, fontWeight: "700", color: t.sub, textAlign: "center" }} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    );

    const SHORTCUT_ACTIONS = {
      klusjes: () => setTab("klusjes"),
      sparen: () => setTab("sparen"),
      gezin: () => setTab("gezin"),
      wissel: () => setMe(null),
      nieuwklus: () => { if (!S.premiumUnlocked && active.length >= FREE_CHORE_LIMIT) { alertX("Premium ✨", `Gratis: max ${FREE_CHORE_LIMIT} actieve klusjes.`); } else setChoreModal(true); },
      keuren: () => setTab("klusjes"),
      uitbetalen: () => setTab("gezin"),
    };
    const shortcutsAll = SHORTCUT_ITEMS[role === "kind" ? "kind" : "ouder"]
      .map(s => ({ ...s, on: SHORTCUT_ACTIONS[s.key] }));
    const shortcuts = shortcutsAll.filter(s => !(S.hiddenShortcuts || []).includes(s.key));

    const MemberCard = ({ k, m }) => {
      const bal = S.balances[k];
      const g = m.role === "kind" ? (S.goals[k] || [])[0] : null; // compacte preview: het eerste doel
      const active = activeChoreOf(k);
      const isMe = k === me;
      const statusText = active ? ({ claimed: "is bezig", before: "is bezig 📸",
        waiting: "wacht op goedkeuring ⏳", rejected: "doet klus opnieuw" }[active.status]) : null;
      return (
        <Card t={t} onPress={() => setTab("gezin")} style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: m.color }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: m.color + "22",
              borderWidth: 2, borderColor: m.color, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 24 }}>{m.avatar}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 16, color: t.ink }}>
                {m.name}{isMe ? " · jij" : ""}{k === topSaverKey && bal > 0 ? " 👑" : ""}</Text>
              <Text style={{ fontSize: 12, color: t.sub }}>
                {m.role === "kind" ? `Kind · ${m.age} jr` : "Ouder"} · 🔥 {m.streak}</Text>
            </View>
            {m.role === "kind" ? <Amount t={t} size={20}>{fmt(bal)}</Amount> : null}
          </View>
          {g ? (
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: t.sub, fontWeight: "700" }} numberOfLines={1}>{g.emoji} {g.name}</Text>
                <Text style={{ fontSize: 12, color: t.sub, fontWeight: "800" }}>{fmt(g.saved)} / {fmt(g.target)}</Text>
              </View>
              <View style={{ height: 8, borderRadius: 999, backgroundColor: t.soft }}>
                <View style={{ width: `${Math.min(100, (g.saved / g.target) * 100)}%`, height: "100%", borderRadius: 999, backgroundColor: m.color }} />
              </View>
              {!g.approved ? <Text style={{ fontSize: 11, color: t.amber, fontWeight: "700", marginTop: 4 }}>⏳ doel wacht op goedkeuring</Text> : null}
            </View>
          ) : null}
          {active ? (
            <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: t.soft, borderRadius: 12, padding: 10 }}>
              <Text style={{ fontSize: 16 }}>{active.emoji || "🧽"}</Text>
              <Text style={{ flex: 1, fontSize: 12.5, color: t.ink }}>
                <Text style={{ fontWeight: "800" }}>{active.title}</Text> — {statusText}</Text>
              <Amount t={t} size={15}>{fmt(active.cents)}</Amount>
            </View>
          ) : null}
        </Card>
      );
    };

    return (
    <>
      {/* HERO — saldo + begroeting */}
      <Card t={t} style={{ marginBottom: 14, backgroundColor: t.accent, borderColor: t.accent, padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {role === "kind" ? (
            <TouchableOpacity onPress={() => setAvatarPickerOpen(true)}
              accessibilityRole="button" accessibilityLabel="Avatar wijzigen"
              style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 28 }}>{M.avatar}</Text></TouchableOpacity>
          ) : (
            <View style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 28 }}>{M.avatar}</Text></View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "900", fontSize: 22, letterSpacing: -0.5 }}>Hoi {M.name}! 👋</Text>
            <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5, fontWeight: "700" }}>🔥 {M.streak} dagen streak</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16 }}>
          <View>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>
              {role === "kind" ? "MIJN SALDO" : "GEZINSSALDO (nog uit te betalen)"}</Text>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 40, letterSpacing: -1.5, marginTop: 2 }}>
              {fmt(role === "kind" ? S.balances[me] : familyBalance)}</Text>
          </View>
          {role === "kind" && myGoal ? (
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "800" }}>SPAARDOEL</Text>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>{Math.round((myGoal.saved / myGoal.target) * 100)}% 🐷</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 12, lineHeight: 18 }}>
          {role === "kind"
            ? (jr ? "Er staan klusjes klaar. Pak ze en verdien zakgeld! 🙌"
                  : `${openCount} ${openCount === 1 ? "klusje staat" : "klusjes staan"} in de pool. Claim ze snel!`)
            : waiting.length ? `${waiting.length} ${waiting.length === 1 ? "klus wacht" : "klussen wachten"} op jouw goedkeuring.`
                             : "Alles is goedgekeurd. Top! ✨"}</Text>
      </Card>

      {isPayoutDay ? (
        <Card t={t} onPress={() => setTab("gezin")} style={{ marginBottom: 14, borderWidth: 2, borderColor: t.amber }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 22 }}>🎉</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 14, color: t.ink }}>Het is uitbetaaldag!</Text>
              <Text style={{ fontSize: 12, color: t.sub }}>Tijd om het zakgeld van deze week uit te betalen.</Text>
            </View>
          </View>
        </Card>
      ) : null}

      {jr ? (
        <Card t={t} style={{ marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 26 }}>🦊</Text>
          <Text style={{ flex: 1, fontSize: 13, color: t.ink, fontWeight: "600" }}>{mascotTip}</Text>
        </Card>
      ) : null}

      {/* SNELKOPPELINGEN */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1 }}>SNELKOPPELINGEN</Text>
        <TouchableOpacity onPress={() => setShortcutsSheet(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13 }}>✏️</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }} style={{ marginBottom: 14 }}>
        {shortcuts.map((s, i) => <Shortcut key={i} icon={s.icon} label={s.label} onPress={s.on} />)}
      </ScrollView>

      {/* FAMILIE-STATS */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
        <Tile icon="🧹" value={openCount} label="Open klusjes" onPress={() => setTab("klusjes")} hot={openCount > 0} />
        {role === "ouder"
          ? <Tile icon="⏳" value={waiting.length} label="Te keuren" onPress={() => setTab("klusjes")} hot={waiting.length > 0} />
          : <Tile icon="🔥" value={M.streak} label="Streak" />}
        <Tile icon="🐷" value={fmt(totalSaved)} label="Samen gespaard" onPress={() => setTab("sparen")} />
        {role === "kind" && (S.homeworkRewardMode === "minutes" || (S.screenBalances[me] || 0) > 0) ? (
          <Tile icon="⏱️" value={fmtMin(S.screenBalances[me] || 0)} label="Schermtijd" onPress={() => setTab("sparen")} />
        ) : null}
      </View>

      {/* IEDEREEN IN HET GEZIN */}
      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>IEDEREEN IN HET GEZIN</Text>
      {ordered.map(([k, m]) => <MemberCard key={k} k={k} m={m} />)}
      <View style={{ height: 4 }} />

      {/* Mijn klusjes (kind) — direct af te ronden vanaf de home */}
      {role === "kind" && S.chores.some(c => c.by === me && c.status !== "open" && c.status !== "approved") ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10, marginTop: 6 }}>MIJN KLUSJES</Text>
          {S.chores.filter(c => c.by === me && c.status !== "open" && c.status !== "approved").map(c => <ChoreCard key={c.id} c={c} />)}
        </>
      ) : null}

      {/* Te keuren (ouder) — direct goedkeuren vanaf de home */}
      {role === "ouder" && waiting.length ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10, marginTop: 6 }}>TE KEUREN</Text>
          {waiting.map(c => <ChoreCard key={c.id} c={c} />)}
        </>
      ) : null}

      {/* Eigen spaardoel groot (kind) */}
      {role === "kind" && myGoal ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10, marginTop: 6 }}>MIJN SPAARDOEL</Text>
          <Card t={t} onPress={() => setTab("sparen")} style={{ marginBottom: 14, alignItems: "center", padding: 22 }}>
            <Progress pct={myGoal.saved / myGoal.target} uri={myGoal.imageUri} emoji={myGoal.emoji} big />
            <Text style={{ fontWeight: "800", fontSize: jr ? 19 : 17, color: t.ink, marginTop: 14 }}>{myGoal.name}</Text>
            <Amount t={t} size={jr ? 40 : 36}>{fmt(myGoal.saved)}</Amount>
            <Text style={{ fontSize: 14, fontWeight: "700", color: t.sub, marginTop: 2 }}>
              van {fmt(myGoal.target)}{myGoal.saved < myGoal.target ? ` · nog ${fmt(myGoal.target - myGoal.saved)}` : " · GEHAALD! 🎉"}</Text>
          </Card>
        </>
      ) : null}

      {/* Activiteit */}
      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10, marginTop: 6 }}>GEZINSACTIVITEIT</Text>
      {S.feed.length === 0 ? (
        <Card t={t}><Text style={{ textAlign: "center", color: t.sub, fontSize: 14, padding: 8 }}>
          Nog niks gebeurd. Zodra iemand een klus afrondt, zie je het hier! 🎉</Text></Card>
      ) : S.feed.map(p => {
        const m = S.members[p.who];
        return (
          <Card t={t} key={p.id} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: t.soft,
                alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 20 }}>{m.avatar}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink }}>{m.name}</Text>
                <Text style={{ fontSize: 12, color: t.sub }}>{new Date(p.time).toLocaleString("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
              {p.cents ? <Amount t={t}>+{fmt(p.cents)}</Amount> : null}
            </View>
            {p.badge ? (
              <View style={{ marginTop: 12, backgroundColor: t.soft, borderRadius: 14, padding: 16, alignItems: "center" }}>
                <Text style={{ fontWeight: "800", fontSize: 16, color: t.accentDk, textAlign: "center" }}>{p.badge}</Text>
                {role === "ouder" && (p.badge.includes("klusjes gedaan!") || p.badge.includes("SPAARDOEL BEREIKT")) ? (
                  <TouchableOpacity onPress={() => { setShareShowName(false); setShareCard({ headline: p.badge.replace(/^[^\s]+\s/, ""), kidName: m.name, kidAvatar: m.avatar }); }}
                    style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: t.accent }}>📤 Deel dit moment</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <>
                <Text style={{ marginTop: 12, fontWeight: "700", fontSize: 15, color: t.ink }}>{p.title}</Text>
                {(p.beforeUri || p.afterUri) ? (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <PhotoBox t={t} uri={p.beforeUri} label="VOOR" />
                    <PhotoBox t={t} uri={p.afterUri} label="NA" />
                  </View>
                ) : (
                  <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.soft, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 20 }}>✅</Text>
                    <Text style={{ fontSize: 13, color: t.sub, fontWeight: "700" }}>Klus afgerond zonder foto</Text>
                  </View>
                )}
              </>
            )}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              {Object.entries(p.rx).map(([e, n]) => (
                <TouchableOpacity key={e} onPress={() => react(p.id, e)} style={{ backgroundColor: t.soft,
                  borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 13, color: t.ink }}>{e} {n > 0 ? n : ""}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        );
      })}
      <Text style={{ textAlign: "center", color: t.sub, fontSize: 12, padding: 14 }}>
        Alleen echt gezinsnieuws — geen algoritme. 💜</Text>
    </>
    );
  };

  const pendingOffers = S.choreOffers.filter(o => o.status === "pending");
  const neighborJobsAwaitingParent = S.neighborJobs.filter(j => j.status === "awaiting_approval" && !j.parentApprovedAt);
  const myNeighborJobs = S.neighborJobs.filter(j => j.childId === me && j.status !== "declined");

  const Chores = () => (
    <>
      {role === "ouder" && pendingOffers.length > 0 ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>AANGEBODEN VAN BUITENAF</Text>
          {pendingOffers.map(o => (
            <Card t={t} key={o.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: t.soft,
                  alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 22 }}>{o.emoji || "🎁"}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{o.title}</Text>
                  <Text style={{ fontSize: 12, color: t.sub }}>
                    Van {S.members[o.offeredBy]?.name || "een gast"}{o.room ? ` · ${o.room}` : ""}</Text>
                  {o.note ? <Text style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{o.note}</Text> : null}
                </View>
                <Amount t={t} size={20}>{fmt(o.cents)}</Amount>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}><Btn t={t} small onPress={() => decideChoreOffer(o.id, "approved")}>Goedkeuren ✓</Btn></View>
                <View style={{ flex: 1 }}><Btn t={t} small kind="ghost" onPress={() => decideChoreOffer(o.id, "declined")}>Afwijzen</Btn></View>
              </View>
            </Card>
          ))}
        </>
      ) : null}
      {role === "ouder" && neighborJobsAwaitingParent.length > 0 ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>
            BUURTKLUSJES — WACHT OP JOUW GOEDKEURING</Text>
          {neighborJobsAwaitingParent.map(j => (
            <Card t={t} key={j.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{j.title}{j.recurring ? " 🔁" : ""}</Text>
                  <Text style={{ fontSize: 12, color: t.sub }}>
                    {S.members[j.childId]?.name || "?"} · voor {S.members[j.hostId]?.name || "een host"}
                    {j.hostApprovedAt ? " · host keurde al goed ✓" : ""}</Text>
                </View>
                <Amount t={t} size={20}>{fmt(j.cents)}</Amount>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <PhotoBox t={t} uri={j.checkInUri} label="AANKOMST" />
                <PhotoBox t={t} uri={j.checkOutUri} label="VERTREK" />
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}><Btn t={t} small onPress={() => decideNeighborJobAsParent(j.id, "approved")}>Goedkeuren ✓</Btn></View>
                <View style={{ flex: 1 }}><Btn t={t} small kind="ghost" onPress={() => decideNeighborJobAsParent(j.id, "declined")}>Afwijzen</Btn></View>
              </View>
            </Card>
          ))}
        </>
      ) : null}
      {role === "ouder" && waiting.length > 0 ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>GOED TE KEUREN</Text>
          {waiting.map(c => <ChoreCard key={c.id} c={c} />)}
        </>
      ) : null}
      {role === "kind" && myNeighborJobs.length > 0 ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>MIJN BUURTKLUSJES</Text>
          {myNeighborJobs.map(j => (
            <Card t={t} key={j.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{j.title}{j.recurring ? " 🔁" : ""}</Text>
                  <Text style={{ fontSize: 12, color: t.sub }}>
                    Voor {S.members[j.hostId]?.name || "een host"} · {NEIGHBOR_JOB_STATUS_LABEL[j.status]}</Text>
                </View>
                <Amount t={t} size={20}>{fmt(j.cents)}</Amount>
              </View>
              {j.status === "open" ? (
                <View style={{ marginTop: 10 }}>
                  <Btn t={t} small onPress={() => checkinNeighborJob(j.id)}>📸 Inchecken (aankomst)</Btn>
                </View>
              ) : j.status === "in_progress" ? (
                <>
                  <View style={{ marginTop: 10 }}><PhotoBox t={t} uri={j.checkInUri} label="AANKOMST" /></View>
                  <View style={{ marginTop: 10 }}>
                    <Btn t={t} small onPress={() => checkoutNeighborJob(j.id)}>📸 Uitchecken (klaar)</Btn>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <PhotoBox t={t} uri={j.checkInUri} label="AANKOMST" />
                  <PhotoBox t={t} uri={j.checkOutUri} label="VERTREK" />
                </View>
              )}
            </Card>
          ))}
        </>
      ) : null}
      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginVertical: 10 }}>
        {role === "kind" ? (jr ? "KLUSJES — PAK ZE! 🙌" : "OPEN POOL — CLAIM ZE SNEL")
          : S.premiumUnlocked ? `IN DE POOL (${active.length}, onbeperkt ✨)` : `IN DE POOL (${active.length}/${FREE_CHORE_LIMIT} gratis)`}</Text>
      {(() => {
        const poolChores = S.chores.filter(c => (c.status !== "waiting" || role === "kind") && c.status !== "approved");
        return poolChores.length ? poolChores.map(c => <ChoreCard key={c.id} c={c} />) : (
          <Text style={{ fontSize: 13, color: t.sub, marginBottom: 12 }}>
            {role === "kind" ? "Nog geen klusjes in de pool. Kom later terug! 🧹" : "Nog geen klusjes. Voeg er hieronder eentje toe. 🧹"}
          </Text>
        );
      })()}
      {role === "ouder" ? (
        <Btn t={t} kind="ghost" onPress={() => {
          if (!S.premiumUnlocked && active.length >= FREE_CHORE_LIMIT) {
            alertX("Premium ✨", `Gratis: max ${FREE_CHORE_LIMIT} actieve klusjes. Onbeperkt + wekelijks herhalen = Premium (€ 0,99/mnd).`);
          } else setChoreModal(true);
        }}>＋ Nieuw klusje in de pool</Btn>
      ) : null}
    </>
  );

  const showScreenSection = S.homeworkRewardMode === "minutes" || (S.screenBalances[me] || 0) > 0
    || Object.values(S.screenBalances || {}).some(v => v > 0);

  const ScreenTimer = () => {
    const bal = S.screenBalances[me] || 0;
    if (screenTimer) {
      const mm = String(Math.floor(screenTimer.remaining / 60)).padStart(2, "0");
      const ss = String(screenTimer.remaining % 60).padStart(2, "0");
      return (
        <Card t={t} style={{ marginBottom: 12, alignItems: "center", padding: 24 }}>
          <Text style={{ fontSize: 40, fontWeight: "900", color: t.accent, letterSpacing: -1 }}>{mm}:{ss}</Text>
          <Text style={{ fontSize: 13, color: t.sub, marginTop: 6 }}>Schermtijd loopt — veel plezier! 🎮</Text>
        </Card>
      );
    }
    return (
      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>⏱️ Schermtijd gebruiken</Text>
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
          Tegoed: {fmtMin(bal)}. Kies hoeveel minuten je nu gebruikt — dat gaat er meteen af (op is op).</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput style={[inputStyle(t), { flex: 1, marginBottom: 0 }]} placeholder="Minuten" placeholderTextColor={t.sub}
            keyboardType="number-pad" value={timerInput} onChangeText={setTimerInput} />
          <Btn t={t} onPress={() => { const n = parseInt(timerInput, 10); if (n > 0 && n <= bal) { startScreenTimer(n); setTimerInput(""); } else alertX("Kies een geldig aantal minuten", `Je hebt ${fmtMin(bal)} tegoed.`); }}>Start</Btn>
        </View>
      </Card>
    );
  };

  const Sparen = () => (
    <>
      {role === "kind" ? (
        <>
          {/* Verdiend geld en schermtijd eerst, duidelijk bovenaan — de "extra doel
              toevoegen"-upsell-kaartjes en de doelen van andere gezinsleden komen
              bewust pas daaronder. Gratis: 2 geld-doelen (Speelgoed + Sparen, zie
              defaultGoals()); een 3e/4e zit achter Premium. */}
          {myGoals.map(g => <GoalCard key={g.id} goal={g} kid={me} own />)}
          {showScreenSection ? (
            <>
              <ScreenTimer />
              <ScreenGoalCard kid={me} own />
            </>
          ) : null}

          {myGoals.length < FREE_GOAL_LIMIT ? (
            <Card t={t} onPress={() => setGoalModal(true)} style={{ marginBottom: 14, alignItems: "center", borderStyle: "dashed" }}>
              <Text style={{ fontSize: 24 }}>🐷</Text>
              <Text style={{ fontWeight: "800", color: t.ink, fontSize: 15 }}>＋ Spaardoel aanmaken</Text>
              <Text style={{ fontSize: 13, color: t.sub, marginTop: 2 }}>Papa of mama keurt het daarna goed</Text>
            </Card>
          ) : (
            <Card t={t} style={{ marginBottom: 14, alignItems: "center", borderStyle: "dashed" }}
              onPress={() => alertX("Premium ✨", "Een 3e of 4e geld-spaardoel? Dat kan met Premium (€ 0,99/mnd) — vraag papa of mama!")}>
              <Text style={{ fontSize: 24 }}>🔒</Text>
              <Text style={{ fontWeight: "800", color: t.ink, fontSize: 15 }}>＋ Nog een geld-spaardoel</Text>
              <Text style={{ fontSize: 13, color: t.sub, marginTop: 2 }}>Gratis: {FREE_GOAL_LIMIT} geld-doelen · meer met Premium</Text>
            </Card>
          )}
          {showScreenSection && S.screenGoals[me] ? (
            <Card t={t} style={{ marginBottom: 14, alignItems: "center", borderStyle: "dashed" }}
              onPress={() => alertX("Premium ✨", "Tweede schermtijd-spaardoel? Dat kan met Premium (€ 0,99/mnd) — vraag papa of mama!")}>
              <Text style={{ fontSize: 24 }}>🔒</Text>
              <Text style={{ fontWeight: "800", color: t.ink, fontSize: 15 }}>＋ Tweede schermtijd-spaardoel</Text>
              <Text style={{ fontSize: 13, color: t.sub, marginTop: 2 }}>Gratis: 1 schermtijd-doel · meer met Premium</Text>
            </Card>
          ) : null}
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>SPAARDOELEN VAN HET GEZIN</Text>
          {kids.filter(k => k !== me).flatMap(k => (S.goals[k] || []).map(g => <GoalCard key={g.id} goal={g} kid={k} />))}
        </>
      ) : (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>SPAARDOELEN VAN DE KINDEREN</Text>
          {kids.flatMap(k => (S.goals[k] || []).map(g => <GoalCard key={g.id} goal={g} kid={k} />))}
          {showScreenSection ? (
            <>
              <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10, marginTop: 6 }}>SCHERMTIJD-SPAARDOELEN</Text>
              {kids.map(k => <ScreenGoalCard key={k} kid={k} />)}
            </>
          ) : null}
        </>
      )}
      <Text style={{ fontSize: 12, color: t.sub, paddingVertical: 12 }}>
        Nieuw doel: kies een foto en doelbedrag. Papa of mama keurt het doel eerst goed — pas dan gaat de winkellink open.</Text>
    </>
  );

  // ----- Huiswerk -----
  const WEEKDAY_LABELS = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];
  const formatDueDate = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return `${WEEKDAY_LABELS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  };

  const HomeworkCard = ({ h }) => {
    const m = S.members[h.memberId];
    const mine = h.memberId === me;
    const canToggle = role === "ouder" || mine;
    // Een item heeft óf cents óf minutes (nooit allebei) — welke van de twee er is
    // bepaalt alleen het label/icoontje, de rest van de logica is identiek.
    const reward = h.cents != null ? { amount: fmt(h.cents), icon: "💰" }
      : h.minutes != null ? { amount: fmtMin(h.minutes), icon: "⏱️" } : null;
    return (
      <Card t={t} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity disabled={!canToggle} onPress={() => toggleHomeworkDone(h)}
            style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2,
              borderColor: h.done ? t.green : t.line, backgroundColor: h.done ? t.green : "transparent",
              alignItems: "center", justifyContent: "center" }}>
            {h.done ? <Text style={{ color: "#fff", fontWeight: "900" }}>✓</Text> : null}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink, textDecorationLine: h.done ? "line-through" : "none" }}>
              {h.title}</Text>
            <Text style={{ fontSize: 12, color: t.sub }}>
              {h.subject ? `${h.subject} · ` : ""}{formatDueDate(h.dueDate)}{role === "ouder" && !mine ? ` · ${m?.name || ""}` : ""}</Text>
          </View>
          {reward ? <Amount t={t} size={16}>{reward.amount}</Amount> : null}
        </View>
        {reward && h.done && !h.rewardApproved && role === "ouder" ? (
          <View style={{ marginTop: 10 }}>
            <Btn t={t} small kind="success" onPress={() => approveHomeworkReward(h)}>Goedkeuren ✓</Btn>
          </View>
        ) : reward && h.done && !h.rewardApproved ? (
          <View style={{ marginTop: 8 }}><Chip t={t} color={t.amber}>⏳ Wacht op goedkeuring</Chip></View>
        ) : reward && !h.done ? (
          <View style={{ marginTop: 8 }}><Chip t={t} color={t.amber}>{reward.icon} Verdien {reward.amount} zodra het af is</Chip></View>
        ) : reward && h.rewardApproved ? (
          <View style={{ marginTop: 8 }}><Chip t={t}>✅ {reward.amount} toegekend</Chip></View>
        ) : null}
      </Card>
    );
  };

  const Huiswerk = () => {
    const sorted = [...S.homework].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const mine = sorted.filter(h => h.memberId === me);
    const others = sorted.filter(h => h.memberId !== me);
    return (
      <>
        {role === "ouder" ? (
          <>
            <Btn t={t} kind="ghost" onPress={() => setHomeworkModal(true)}>＋ Huiswerk toevoegen</Btn>
            <View style={{ height: 12 }} />
          </>
        ) : (
          <Text style={{ fontSize: 12, color: t.sub, marginBottom: 12 }}>Vraag een ouder om huiswerk voor je toe te voegen. 📚</Text>
        )}
        {role === "kind" ? (
          <>
            {mine.length ? mine.map(h => <HomeworkCard key={h.id} h={h} />) : (
              <Text style={{ fontSize: 13, color: t.sub, marginBottom: 12 }}>Nog geen huiswerk gepland. 📚</Text>
            )}
          </>
        ) : (
          <>
            <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>HUISWERK VAN DE KINDEREN</Text>
            {[...mine, ...others].length ? [...mine, ...others].map(h => <HomeworkCard key={h.id} h={h} />) : (
              <Text style={{ fontSize: 13, color: t.sub, marginBottom: 12 }}>Nog geen huiswerk gepland.</Text>
            )}
          </>
        )}
        <Text style={{ fontSize: 12, color: t.sub, paddingVertical: 12 }}>
          Een ouder kan per taak stilletjes een beloning instellen ({S.homeworkRewardMode === "minutes" ? "schermtijd" : "geld"}
          , via Instellingen om te wisselen) — dat zie je hier pas zodra het is toegevoegd.</Text>
      </>
    );
  };

  const Gezin = () => (
    <>
      {role === "ouder" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <View style={{ flex: 1, minWidth: 130 }}><Btn t={t} small kind="ghost" onPress={() => setKidModal(true)}>👶 Nieuw kind</Btn></View>
          <View style={{ flex: 1, minWidth: 130 }}><Btn t={t} small kind="ghost" onPress={() => setParentModal(true)}>🧑‍🤝‍🧑 Nieuwe ouder</Btn></View>
          <View style={{ flex: 1, minWidth: 130 }}><Btn t={t} small kind="ghost" onPress={() => setGiftModal(true)}>🎁 Bijdrage familie</Btn></View>
        </View>
      ) : null}

      {role === "ouder" ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>OUDERS</Text>
          {Object.entries(S.members).filter(([, m]) => m.role === "ouder").map(([k, m]) => (
            <Card t={t} key={k} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: t.soft,
                  alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 22 }}>{m.avatar}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{m.name}{k === me ? " · jij" : ""}</Text>
                  <Text style={{ fontSize: 12, color: t.sub }}>Ouder</Text>
                </View>
                <TouchableOpacity onPress={() => removeMember(k)} style={{ padding: 6 }}
                  accessibilityRole="button" accessibilityLabel={`${m.name} verwijderen`}>
                  <Text style={{ color: t.danger, fontWeight: "800", fontSize: 13 }}>✕</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {role === "ouder" ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>
            GASTEN — KLUSJES VAN BUITENAF</Text>
          {guests.length === 0 ? (
            <Text style={{ fontSize: 12, color: t.sub, marginBottom: 12 }}>
              Nog geen gasten uitgenodigd. Opa, oma, een oom/tante of familievriend kan zo een klusje
              voorstellen — jij keurt het altijd eerst goed voordat het zichtbaar wordt.</Text>
          ) : guests.map((k) => {
            const m = S.members[k];
            return (
              <Card t={t} key={k} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: t.soft,
                    alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 22 }}>{m.avatar}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{m.name}</Text>
                    <Text style={{ fontSize: 12, color: t.sub }}>Gast</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeMember(k)} style={{ padding: 6 }}
                    accessibilityRole="button" accessibilityLabel={`${m.name} verwijderen`}>
                    <Text style={{ color: t.danger, fontWeight: "800", fontSize: 13 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })}
          {fam.backendConfigured && S.familyId ? (
            <Card t={t} style={{ marginBottom: 12 }}>
              <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 10 }}>🧓 Gast uitnodigen</Text>
              {guestInviteCode ? (
                <View style={{ alignItems: "center" }}>
                  <View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 10 }}>
                    <QRCode value={`${LEGAL_BASE}/join/${guestInviteCode}`} size={140} />
                  </View>
                  <Text style={{ fontWeight: "900", fontSize: 22, letterSpacing: 3, color: t.ink, marginBottom: 6 }}>{guestInviteCode}</Text>
                  <Text style={{ fontSize: 12, color: t.sub, textAlign: "center" }}>
                    Geldig 24 uur. Laat de gast scannen, of de code intypen bij "Ik heb een code".</Text>
                </View>
              ) : (
                <Btn t={t} small onPress={async () => {
                  try { setGuestInviteCode(await fam.createInvite(S.familyId, "gast")); }
                  catch { alertX("Dat ging niet goed", "Probeer het nog eens."); }
                }}>Uitnodiging maken voor een gast</Btn>
              )}
            </Card>
          ) : null}
        </>
      ) : null}

      {role === "ouder" ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>
            HOSTS — BUURTKLUSJES VAN BUITENAF</Text>
          {hosts.length === 0 ? (
            <Text style={{ fontSize: 12, color: t.sub, marginBottom: 12 }}>
              Nog geen hosts uitgenodigd. Een host (bv. de buurvrouw) mag klusjes aanbieden aan
              precies één kind — check-in/check-out met foto, en jij keurt elk klusje ook zelf goed.</Text>
          ) : hosts.map((k) => {
            const m = S.members[k];
            return (
              <Card t={t} key={k} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: t.soft,
                    alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 22 }}>{m.avatar}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{m.name}</Text>
                    <Text style={{ fontSize: 12, color: t.sub }}>Host · voor {S.members[m.hostChildId]?.name || "?"}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeMember(k)} style={{ padding: 6 }}
                    accessibilityRole="button" accessibilityLabel={`${m.name} verwijderen`}>
                    <Text style={{ color: t.danger, fontWeight: "800", fontSize: 13 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })}
          {fam.backendConfigured && S.familyId ? (
            <Card t={t} style={{ marginBottom: 12 }}>
              <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 10 }}>🏡 Host uitnodigen</Text>
              {hostInviteCode ? (
                <View style={{ alignItems: "center" }}>
                  <View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 10 }}>
                    <QRCode value={`${LEGAL_BASE}/join/${hostInviteCode}`} size={140} />
                  </View>
                  <Text style={{ fontWeight: "900", fontSize: 22, letterSpacing: 3, color: t.ink, marginBottom: 6 }}>{hostInviteCode}</Text>
                  <Text style={{ fontSize: 12, color: t.sub, textAlign: "center" }}>
                    Geldig 24 uur. Laat de host scannen, of de code intypen bij "Ik heb een code".</Text>
                </View>
              ) : kids.length === 0 ? (
                <Text style={{ fontSize: 12, color: t.sub }}>Voeg eerst een kind toe voordat je een host kan uitnodigen.</Text>
              ) : (
                <>
                  <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
                    Voor welk kind? De host mag daarna alleen klusjes aanbieden aan en zien van dit ene kind.</Text>
                  {kids.map(k => (
                    <View key={k} style={{ marginBottom: 6 }}>
                      <Btn t={t} small kind="ghost" onPress={async () => {
                        try { setHostInviteCode(await fam.createInvite(S.familyId, "host", k)); }
                        catch { alertX("Dat ging niet goed", "Probeer het nog eens."); }
                      }}>{S.members[k].avatar} Voor {S.members[k].name}</Btn>
                    </View>
                  ))}
                </>
              )}
            </Card>
          ) : null}
        </>
      ) : null}

      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>SALDO PER KIND</Text>
      {Object.entries(S.balances).filter(([k]) => S.members[k]?.role === "kind").sort((a, b) => b[1] - a[1]).map(([k, v], i) => {
        const m = S.members[k];
        return (
          <Card t={t} key={k} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ fontWeight: "800", width: 20, color: i === 0 ? t.amber : t.sub }}>{i + 1}</Text>
              <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: t.soft,
                alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 22 }}>{m.avatar}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{m.name} {i === 0 && v > 0 ? "👑" : ""}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: t.sub }}>🔥 {m.streak}
                  {m.role === "kind" ? ` · ${m.age < 12 ? "Junior" : "Tiener"}` : ""}</Text>
              </View>
              <Amount t={t} size={24}>{fmt(v)}</Amount>
              {role === "ouder" ? (
                <TouchableOpacity onPress={() => removeMember(k)} style={{ padding: 6 }}
                  accessibilityRole="button" accessibilityLabel={`${m.name} verwijderen`}>
                  <Text style={{ color: t.danger, fontWeight: "800", fontSize: 13 }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {role === "ouder" && m.role === "kind" && v > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Btn t={t} small kind="ghost" onPress={() => payout(k)}>💶 Uitbetaald — registreer</Btn>
              </View>
            ) : null}
            {role === "ouder" && m.role === "kind" && (m.externalEarnedCents || 0) > 0 ? (
              <View style={{ marginTop: 10, backgroundColor: t.soft, borderRadius: 12, padding: 10 }}>
                <Text style={{ fontSize: 12, color: t.sub, marginBottom: 6 }}>
                  🏡 Extern verdiend (buurtklusjes): <Text style={{ fontWeight: "800", color: t.ink }}>{fmt(m.externalEarnedCents)}</Text></Text>
                <Btn t={t} small onPress={() => mergeExternalEarnings(k)}>Samenvoegen met saldo</Btn>
              </View>
            ) : null}
            {role === "ouder" && m.role === "kind" ? (
              <View style={{ marginTop: 10 }}>
                <Btn t={t} small kind="ghost" onPress={() => setQrKid(k)}>🔗 Delen als QR (naar ander toestel)</Btn>
              </View>
            ) : null}
          </Card>
        );
      })}

      {role === "ouder" && fam.backendConfigured ? (
        <Card t={t} style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 10 }}>👨‍👩‍👧‍👦 Gezin delen</Text>
          {!S.familyId ? (
            <>
              <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
                Koppel dit toestel aan een gezin-account om samen met een andere ouder te synchroniseren.</Text>
              <Btn t={t} small onPress={() => setFamilySetupOpen(true)}>Gezin aanmaken of koppelen</Btn>
            </>
          ) : inviteCode ? (
            <View style={{ alignItems: "center" }}>
              <View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 10 }}>
                <QRCode value={`${LEGAL_BASE}/join/${inviteCode}`} size={140} />
              </View>
              <Text style={{ fontWeight: "900", fontSize: 22, letterSpacing: 3, color: t.ink, marginBottom: 6 }}>{inviteCode}</Text>
              <Text style={{ fontSize: 12, color: t.sub, textAlign: "center" }}>
                Geldig 24 uur. Laat de andere ouder scannen of de code intypen bij "Ik heb een code".</Text>
            </View>
          ) : (
            <Btn t={t} small onPress={async () => {
              try { setInviteCode(await fam.createInvite(S.familyId)); }
              catch { alertX("Dat ging niet goed", "Probeer het nog eens."); }
            }}>Uitnodiging maken voor een 2e ouder</Btn>
          )}
        </Card>
      ) : null}

      {role === "ouder" ? (
        <Card t={t} style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 10 }}>💱 Gezinsvaluta</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["€", "£", "$"].map(c => (
              <TouchableOpacity key={c} onPress={() => { patch({ cur: c }); if (S.familyId && fam.backendConfigured) push.updateFamily(S.familyId, { currency: c }); }} style={{ flex: 1, borderRadius: 12,
                paddingVertical: 12, alignItems: "center", backgroundColor: S.cur === c ? t.accent : t.soft }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: S.cur === c ? "#fff" : t.ink }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 12, color: t.sub, marginTop: 8 }}>
            De app verwerkt geen echt geld: uitbetalen doe je zelf en registreer je hier. Ouders zijn volledig gelijkwaardig.</Text>
        </Card>
      ) : null}

      <Card t={t}>
        {role === "ouder" && (
          <>
            <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 8 }}>ℹ️ Over deze app</Text>
            <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
              Zonder gezin-account staan je gegevens veilig op dit toestel. Met een gezin-account (zie "Gezin delen"
              hierboven) synchroniseer je tussen apparaten via een beveiligde server. Kinderen onder 12 zien een
              motivatiebalk, vanaf 12 een ring met percentage.</Text>
            <Text style={{ fontSize: 11.5, color: t.sub, marginBottom: 10, lineHeight: 16 }}>
              Deze app verwerkt géén echte betalingen. Bedragen zijn alleen boekhouding: uitbetalen doe je als ouder
              zelf, buiten de app om. Zie de voorwaarden.</Text>
            <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginTop: 14, marginBottom: 8 }}>🗑 Gegevens wissen</Text>
            <Btn t={t} small kind="danger" onPress={() =>
              alertX("Reset dit apparaat", "Alle gegevens op dit apparaat wissen en opnieuw beginnen? De cloud-data van het gezin blijft bewaard voor andere apparaten.", [
                { text: "Annuleren", style: "cancel" },
                { text: "Resetten", style: "destructive", onPress: async () => {
                  await resetState();
                  await clearPendingWrites();
                  setMe(null);
                  setS({ ...DEFAULT_STATE, familyId: null, cloudMemberId: null, lastMe: null, migrated: false });
                } },
              ])}>Reset dit apparaat</Btn>
            <View style={{ height: 8 }} />
            {S.familyId ? (
              <Btn t={t} small kind="danger" onPress={() =>
                alertX("Heel gezin wissen", "LET OP: hiermee verwijder je alle gegevens van het HELE gezin, ook in de cloud, voor iedereen op elk apparaat. Dit kan niet ongedaan worden gemaakt.", [
                  { text: "Annuleren", style: "cancel" },
                  { text: "Alles wissen", style: "destructive", onPress: async () => {
                    try {
                      if (S.familyId && fam.backendConfigured) {
                        await fam.deleteFamily(S.familyId);
                        await fam.signOut();
                      }
                    } catch (e) {
                      console.warn("Cloud-wissen mislukt:", e?.message);
                      alertX("Cloud-wissen (deels) mislukt", "De lokale gegevens zijn gewist. De cloud-data kon niet volledig worden verwijderd — probeer het later opnieuw.");
                    }
                    await resetState();
                    await clearPendingWrites();
                    setMe(null);
                    setS({ ...DEFAULT_STATE, familyId: null, cloudMemberId: null, lastMe: null, migrated: false });
                  } },
                ])}>Heel gezin wissen (cloud)</Btn>
            ) : null}
          </>
        )}
        <View style={{ flexDirection: "row", gap: 18, marginTop: role === "ouder" ? 14 : 0 }}>
          <TouchableOpacity onPress={() => Linking.openURL(`${LEGAL_BASE}/privacy.html`)}>
            <Text style={{ color: t.accent, fontWeight: "700", fontSize: 13 }}>Privacybeleid ↗</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(`${LEGAL_BASE}/voorwaarden.html`)}>
            <Text style={{ color: t.accent, fontWeight: "700", fontSize: 13 }}>Gebruiksvoorwaarden ↗</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </>
  );

  // ----- Instellingen (alleen ouders) -----
  const Instellingen = () => (
    <>
      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 10 }}>🎨 Thema</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {THEME_CHOICES.map(key => (
            <TouchableOpacity key={key} onPress={() => patch({ themeChoice: key })}
              style={{ alignItems: "center", gap: 6 }}>
              <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: THEMES[key].swatch,
                borderWidth: S.themeChoice === key ? 3 : 0, borderColor: t.ink }} />
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: t.sub }}>{THEMES[key].label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 10 }}>🌗 Licht of donker</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[{ v: null, l: "Automatisch" }, { v: "light", l: "Licht" }, { v: "dark", l: "Donker" }].map(o => (
            <TouchableOpacity key={o.l} onPress={() => patch({ themeOverride: o.v })} style={{ flex: 1, borderRadius: 12,
              paddingVertical: 12, alignItems: "center", backgroundColor: S.themeOverride === o.v ? t.accent : t.soft }}>
              <Text style={{ fontSize: 12.5, fontWeight: "800", color: S.themeOverride === o.v ? "#fff" : t.ink }}>{o.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>🔠 Tekstgrootte</Text>
        <Slider minimumValue={0.9} maximumValue={1.15} value={S.textScale} onSlidingComplete={v => patch({ textScale: v })}
          minimumTrackTintColor={t.accent} maximumTrackTintColor={t.line} thumbTintColor={t.accent} />
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginTop: 14, marginBottom: 4 }}>⬜ Afronding van hoeken</Text>
        <Slider minimumValue={0.7} maximumValue={1.3} value={S.radiusScale} onSlidingComplete={v => patch({ radiusScale: v })}
          minimumTrackTintColor={t.accent} maximumTrackTintColor={t.line} thumbTintColor={t.accent} />
      </Card>

      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>🧭 Rondleiding</Text>
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
          Laat nieuwe gezinsleden bij hun eerste keer een korte rondleiding zien.</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Btn t={t} small kind={S.tourEnabled ? "primary" : "ghost"} onPress={() => patch({ tourEnabled: true })}>Aan</Btn>
          <Btn t={t} small kind={!S.tourEnabled ? "primary" : "ghost"} onPress={() => patch({ tourEnabled: false })}>Uit</Btn>
        </View>
        <View style={{ marginTop: 10 }}>
          <Btn t={t} small kind="ghost" onPress={() => { setTourStep(0); setTourForced(true); }}>Bekijk de rondleiding opnieuw</Btn>
        </View>
      </Card>

      {role === "ouder" && (
        <Card t={t} style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>🔒 Pincode ouderprofiel</Text>
          <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
            Deze pincode is nodig om als ouder in te loggen, zodat een kind niet zelf kan wisselen naar het ouderprofiel.</Text>
          <Btn t={t} small kind="ghost" onPress={() => setPinPrompt({ key: me, mode: "set" })}>
            {S.parentPin ? "Pincode wijzigen" : "Pincode instellen"}</Btn>
        </Card>
      )}

      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>💶 Reclame & kosten</Text>
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
          Kinderen altijd gratis en zonder reclame. Ouders en gasten: gratis met reclame, of reclamevrij voor een klein bedrag.</Text>
        <Btn t={t} small kind="ghost" onPress={() => setPricingForced(true)}>Bekijk prijzen opnieuw</Btn>
      </Card>

      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>📅 Uitbetaaldag</Text>
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
          Op deze dag krijg je op Home een herinnering als er nog zakgeld klaarstaat om uit te betalen.</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {PAYOUT_DAYS.map(d => (
            <Btn key={d.v} t={t} small kind={(S.payoutDay ?? 5) === d.v ? "primary" : "ghost"} onPress={() => patch({ payoutDay: d.v })}>{d.l}</Btn>
          ))}
        </View>
      </Card>

      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>📚 Huiswerk voor kinderen</Text>
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
          Zet uit om de hele Huiswerk-tab voor kinderen te verbergen. Jij blijft 'm als ouder gewoon zien.</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Btn t={t} small kind={S.homeworkEnabled ? "primary" : "ghost"} onPress={() => {
            patch({ homeworkEnabled: true });
            if (S.familyId && fam.backendConfigured) push.updateFamily(S.familyId, { homework_enabled: true });
          }}>Aan</Btn>
          <Btn t={t} small kind={!S.homeworkEnabled ? "primary" : "ghost"} onPress={() => {
            patch({ homeworkEnabled: false });
            if (S.familyId && fam.backendConfigured) push.updateFamily(S.familyId, { homework_enabled: false });
          }}>Uit</Btn>
        </View>
      </Card>

      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>⏱️ Beloningsvorm voor huiswerk</Text>
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
          Standaard verdienen kinderen schermtijd in minuten met huiswerk. Je kunt dit voor het hele
          gezin wisselen naar geld — per taak stel jij daarna zelf, stilletjes, een bedrag of aantal
          minuten in; kinderen krijgen daar zelf geen invoerveld voor.</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Btn t={t} small kind={S.homeworkRewardMode === "minutes" ? "primary" : "ghost"} onPress={() => {
            patch({ homeworkRewardMode: "minutes" });
            if (S.familyId && fam.backendConfigured) push.updateFamily(S.familyId, { homework_reward_mode: "minutes" });
          }}>⏱️ Minuten</Btn>
          <Btn t={t} small kind={S.homeworkRewardMode === "money" ? "primary" : "ghost"} onPress={() => {
            patch({ homeworkRewardMode: "money" });
            if (S.familyId && fam.backendConfigured) push.updateFamily(S.familyId, { homework_reward_mode: "money" });
          }}>💶 Geld</Btn>
        </View>
      </Card>

      {!S.premiumUnlocked ? (
        <Card t={t} style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>📢 Reclame</Text>
          <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
            Reclame komt alleen ooit in beeld bij ouders, nooit bij kinderen. Hoe wil je het zien?
            (Nog niet actief — dat vereist eerst een AdMob-account.)</Text>
          {[
            { v: "bottom-block", l: "Vast blokje onderaan iedere pagina" },
            { v: "startup-then-free", l: "Eén langere ad bij opstarten, dan even reclamevrij" },
            { v: "top-bottom-standard", l: "Standaard blok boven én onder" },
          ].map(o => (
            <TouchableOpacity key={o.v} onPress={() => patch({ adStyle: o.v })} style={{ flexDirection: "row",
              alignItems: "center", gap: 10, paddingVertical: 8 }}>
              <View style={{ width: 18, height: 18, borderRadius: 999, borderWidth: 2, borderColor: t.accent,
                alignItems: "center", justifyContent: "center" }}>
                {S.adStyle === o.v ? <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: t.accent }} /> : null}
              </View>
              <Text style={{ fontSize: 13, color: t.ink, flex: 1 }}>{o.l}</Text>
            </TouchableOpacity>
          ))}
        </Card>
      ) : null}

      <Card t={t} style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>✨ Premium</Text>
        {S.premiumUnlocked ? (
          <Text style={{ fontSize: 13, color: t.green, fontWeight: "700" }}>Premium is actief voor jullie gezin. Onbeperkt klusjes!</Text>
        ) : (
          <>
            <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
              Heb je een gratis code gekregen? Vul die hier in.</Text>
            <TextInput style={inputStyle(t)} placeholder="Code" placeholderTextColor={t.sub} autoCapitalize="characters"
              value={promoInput} onChangeText={setPromoInput} />
            <Btn t={t} small onPress={redeemPromo}>Code inwisselen</Btn>
          </>
        )}
      </Card>

      <Card t={t}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 4 }}>📮 Feedback & contact</Text>
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
          Vraag, probleem, of goed idee? Stuur het ons — we lezen alles mee.</Text>
        <Btn t={t} small kind="ghost" onPress={() => Linking.openURL(
          `mailto:heitjevooreenkarweitje@protonmail.com?subject=${encodeURIComponent("Feedback Heitje voor een karweitje (v" + APP_VERSION + ")")}`
        )}>✉️ Stuur feedback</Btn>
      </Card>
    </>
  );

  const tabs = [
    { id: "feed", label: "Home", icon: "🏠", C: Feed },
    { id: "klusjes", label: "Klusjes", icon: "✅", C: Chores },
    { id: "sparen", label: "Sparen", icon: "🐷", C: Sparen },
    { id: "huiswerk", label: "Huiswerk", icon: "📚", C: Huiswerk,
      hiddenFor: (r) => r === "kind" && !S.homeworkEnabled },
    { id: "gezin", label: "Gezin", icon: "👨‍👩‍👧‍👦", C: Gezin },
    { id: "instellingen", label: "Instellingen", icon: "⚙️", C: Instellingen,
      hiddenFor: (r) => r !== "ouder" },
  ];
  const visibleTabs = tabs.filter(x => !x.hiddenFor || !x.hiddenFor(role));
  const tabAllowed = (id) => visibleTabs.some(x => x.id === id);
  const Screen = tabAllowed(tab) ? (tabs.find(x => x.id === tab)?.C || Feed) : Feed;

  // Parallax: de achtergrond schuift trager dan de kaarten mee — geeft het "zwevende
  // voorgrond over achtergrond"-gevoel. Blijft binnen de eigen afbeelding (clamp), dus
  // nooit een lege rand, ook niet bij heel lang scrollen.
  const bgTranslate = scrollY.interpolate({
    inputRange: [0, winH * 1.5],
    outputRange: [0, -(winH * 0.5)],
    extrapolate: "clamp",
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Confetti show={confetti && role === "kind"} />

      <Animated.Image source={isDark ? BG_DARK : BG_LIGHT} resizeMode="cover" pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, width: "100%", height: winH * 1.5,
          opacity: isDark ? 0.5 : 0.32, transform: [{ translateY: bgTranslate }] }} />

      {/* Header — prominent logo + profielwissel, zelfde afronding als de rest van de balken/kaarten */}
      <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginTop: 6, marginBottom: 6,
        paddingHorizontal: 20, paddingVertical: 10, gap: 10, backgroundColor: t.card, borderWidth: 1,
        borderColor: t.line, borderRadius: t.radius ?? 20 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 40, fontWeight: "900", color: t.ink, letterSpacing: -2 }}>
            Heit<Text style={{ color: t.accent }}>je</Text></Text>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "800", color: t.accent, letterSpacing: 0.2, marginTop: -3 }}>
            voor een karweitje</Text>
        </View>
        {role === "ouder" && fam.backendConfigured && S.familyId ? (
          <TouchableOpacity onPress={() => setQuickShareOpen(true)} style={{ width: 34, height: 34,
            borderRadius: 999, backgroundColor: t.soft, borderWidth: 1, borderColor: t.line,
            alignItems: "center", justifyContent: "center" }}
            accessibilityRole="button" accessibilityLabel="QR-code delen">
            <Text style={{ fontSize: 15 }}>🔲</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => setHelpOpen(true)} style={{ width: 34, height: 34,
          borderRadius: 999, backgroundColor: t.soft, borderWidth: 1, borderColor: t.line,
          alignItems: "center", justifyContent: "center" }}
          accessibilityRole="button" accessibilityLabel="Hulp openen">
          <Text style={{ fontSize: 15, fontWeight: "900", color: t.accent }}>ⓘ</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMe(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6,
          backgroundColor: t.soft, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingLeft: 8, paddingRight: 11, paddingVertical: 6 }}
          accessibilityRole="button" accessibilityLabel="Van profiel wisselen">
          <Text style={{ fontSize: 18 }}>{M.avatar}</Text>
          <Text style={{ fontSize: 12.5, fontWeight: "800", color: t.ink }}>{M.name} ▾</Text>
        </TouchableOpacity>
      </View>

      {showAds && S.adStyle === "startup-then-free" && !startupAdDismissed ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <AdSlot t={t} />
          <TouchableOpacity onPress={() => setStartupAdDismissed(true)} style={{ alignItems: "center", padding: 8 }}>
            <Text style={{ color: t.sub, fontWeight: "700", fontSize: 12 }}>✕ Doorgaan (even reclamevrij)</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {showAds && S.adStyle === "top-bottom-standard" ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}><AdSlot t={t} style={{ paddingVertical: 10 }} /></View>
      ) : null}

      <Animated.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}>
        <Screen />
      </Animated.ScrollView>

      {/* Advertentie blijft vast onderaan (niet mee-scrollen met de content) */}
      {showAds && (S.adStyle === "bottom-block" || S.adStyle === "top-bottom-standard") ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}><AdSlot t={t} /></View>
      ) : null}

      {/* Tab bar — ruimere aanraakzone en groter contrast tussen actief/inactief,
          was te klein/onduidelijk op een echte telefoon. */}
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderColor: t.line, backgroundColor: t.card,
        paddingTop: 10, paddingBottom: 10 }}>
        {visibleTabs.map(x => (
          <TouchableOpacity key={x.id} onPress={() => setTab(x.id)} hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="tab" accessibilityLabel={x.label} accessibilityState={{ selected: tab === x.id }}
            style={{ flex: 1, alignItems: "center", gap: 3, paddingVertical: 4, minHeight: 52,
              backgroundColor: tab === x.id ? t.soft : "transparent", borderRadius: 14, marginHorizontal: 3 }}>
            <Text style={{ fontSize: 23 }}>{x.icon}</Text>
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: tab === x.id ? "800" : "600",
              color: tab === x.id ? t.accent : t.sub }}>{x.label}</Text>
            {x.id === "klusjes" && role === "ouder" && waiting.length > 0 ? (
              <View style={{ position: "absolute", top: -2, right: "26%", backgroundColor: t.danger,
                borderRadius: 999, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{waiting.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {/* Allocation modal: shown to the kid whose chore was approved — werkt op elk
          toestel waar dit kind inlogt, want awaitingAllocation komt uit S.chores (dat
          al synct), niet meer uit een lokaal-only veld. */}
      <Modal visible={!!awaitingAllocation} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(10,5,25,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ textAlign: "center", fontWeight: "800", fontSize: jr ? 20 : 17, color: t.ink }}>
              {jr ? "Gelukt! 🎉🎉" : "Goedgekeurd! 🎉"}</Text>
            <Text style={{ textAlign: "center", fontWeight: "900", fontSize: jr ? 46 : 40, color: t.accent,
              marginVertical: 6, letterSpacing: -1 }}>+{awaitingAllocation ? fmt(awaitingAllocation.cents) : ""}</Text>
            <Text style={{ textAlign: "center", fontSize: jr ? 15 : 13, color: t.sub, marginBottom: 18 }}>
              {jr ? "Waar gaat het heen? 🤔" : `${awaitingAllocation?.title || ""} — waar gaat het heen?`}</Text>
            <View style={{ gap: 10 }}>
              {myGoals.length ? myGoals.map((g, i) => (
                <Btn key={g.id} t={t} jr={jr} kind={i === 0 ? "primary" : "ghost"} onPress={() => allocate(g.id)}>
                  {g.emoji} {jr ? (g.name.toLowerCase() === "sparen" ? "Gewoon sparen!" : `Sparen voor ${g.name}!`) : `Naar ${g.name}`}</Btn>
              )) : (
                <Btn t={t} jr={jr} onPress={() => allocate(null)}>🐷 {jr ? "Gewoon sparen!" : "Algemeen sparen"}</Btn>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <AddChoreModal t={t} visible={choreModal} onClose={() => setChoreModal(false)}
        onAdd={(chore) => {
          setS(s => ({ ...s, chores: [...s.chores, chore] }));
          setChoreModal(false);
          if (S.familyId && fam.backendConfigured) {
            push.upsertChore(S.familyId, {
              id: chore.id, title: chore.title, room: chore.room, emoji: chore.emoji, cents: chore.cents,
              status: chore.status, claimed_by: chore.by, conditions: chore.conditions || null,
            });
          }
        }} />
      <AddGoalModal t={t} visible={goalModal} onClose={() => setGoalModal(false)} pickImage={pickImage}
        onAdd={(goal) => {
          setS(s => ({ ...s, goals: { ...s.goals, [me]: [...(s.goals[me] || []), goal] } }));
          setGoalModal(false);
          if (S.familyId && fam.backendConfigured) {
            push.upsertGoal(S.familyId, me, {
              id: goal.id, name: goal.name, emoji: goal.emoji, image_uri: goal.imageUri,
              target: goal.target, saved: goal.saved, link: goal.link, approved: goal.approved,
            });
          }
        }} />
      <AddScreenGoalModal t={t} visible={screenGoalModal} onClose={() => setScreenGoalModal(false)} pickImage={pickImage}
        onAdd={(goal) => {
          setS(s => ({ ...s, screenGoals: { ...s.screenGoals, [me]: goal } }));
          setScreenGoalModal(false);
          if (S.familyId && fam.backendConfigured) {
            push.upsertScreenGoal(S.familyId, me, {
              id: goal.id, name: goal.name, emoji: goal.emoji, image_uri: goal.imageUri,
              target_minutes: goal.target, saved_minutes: goal.saved, link: goal.link, approved: goal.approved,
            });
          }
        }} />
      <AddHomeworkModal t={t} visible={homeworkModal} onClose={() => setHomeworkModal(false)}
        role={role} me={me} kids={kids} members={S.members} rewardMode={S.homeworkRewardMode}
        onAdd={addHomework} />
      <RejectModal t={t} choreId={rejectFor} onClose={() => setRejectFor(null)} onReject={doReject} />
      <AddKidModal t={t} visible={kidModal} onClose={() => setKidModal(false)} onAdd={addKid} />
      <AddParentModal t={t} visible={parentModal} onClose={() => setParentModal(false)} onAdd={addParent} />

      <Sheet t={t} visible={!!qrKid} onClose={() => setQrKid(null)} title={`🔗 ${S.members[qrKid]?.name || ""} delen`}>
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 14, textAlign: "center" }}>
          Laat de andere ouder dit scannen bij "👶 Nieuw kind → 📷 Scan QR" om {S.members[qrKid]?.name} in één keer op hun toestel te zetten.</Text>
        {qrKid ? (
          <View style={{ alignItems: "center", marginBottom: 10 }}>
            <View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 12 }}>
              <QRCode value={JSON.stringify({ heitjeKid: 1, name: S.members[qrKid].name, avatar: S.members[qrKid].avatar, age: S.members[qrKid].age })} size={200} />
            </View>
          </View>
        ) : null}
      </Sheet>
      <Sheet t={t} visible={quickShareOpen} onClose={() => setQuickShareOpen(false)} title="🔲 Snel delen — 2e ouder">
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 14, textAlign: "center" }}>
          Laat de andere ouder dit scannen of de code intypen bij "Ik heb een code" om mee te doen aan dit gezin.
          Meer deel-opties (kind delen, gast/host uitnodigen) staan bij Gezin.</Text>
        {inviteCode ? (
          <View style={{ alignItems: "center" }}>
            <View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 10 }}>
              <QRCode value={`${LEGAL_BASE}/join/${inviteCode}`} size={200} />
            </View>
            <Text style={{ fontWeight: "900", fontSize: 22, letterSpacing: 3, color: t.ink, marginBottom: 6 }}>{inviteCode}</Text>
            <Text style={{ fontSize: 12, color: t.sub, textAlign: "center" }}>Geldig 24 uur.</Text>
          </View>
        ) : (
          <Btn t={t} onPress={async () => {
            try { setInviteCode(await fam.createInvite(S.familyId)); }
            catch { alertX("Dat ging niet goed", "Probeer het nog eens."); }
          }}>Uitnodiging maken voor een 2e ouder</Btn>
        )}
      </Sheet>
      <Sheet t={t} visible={!!shareCard} onClose={() => setShareCard(null)} title="📤 Deel dit moment">
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 14, textAlign: "center" }}>
          Een leuk plaatje om te delen — geen account of aankoop nodig voor wie het ziet.</Text>
        {shareCard ? (
          <>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View ref={shareCardRef} collapsable={false} style={{ width: 300, aspectRatio: 1, borderRadius: 24,
                backgroundColor: t.accent, alignItems: "center", justifyContent: "center", padding: 24 }}>
                <Text style={{ fontSize: 54, marginBottom: 10 }}>🏆</Text>
                <Text style={{ fontSize: 21, fontWeight: "900", color: "#fff", textAlign: "center" }}>{shareCard.headline}</Text>
                {shareShowName ? (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "rgba(255,255,255,0.85)", marginTop: 10, textAlign: "center" }}>
                    {shareCard.kidAvatar} {shareCard.kidName}</Text>
                ) : null}
                <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.25)", width: "100%", alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "900", color: "#fff" }}>Heitje voor een karweitje</Text>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.7)", marginTop: 2 }}>heitjevooreenkarweitje.eu</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShareShowName(v => !v)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: t.accent,
                alignItems: "center", justifyContent: "center", backgroundColor: shareShowName ? t.accent : "transparent" }}>
                {shareShowName ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900" }}>✓</Text> : null}
              </View>
              <Text style={{ fontSize: 13, color: t.sub, fontWeight: "700" }}>Naam van {shareCard.kidName} op de kaart tonen</Text>
            </TouchableOpacity>
            <Btn t={t} onPress={shareCardImage}>📤 Delen</Btn>
          </>
        ) : null}
      </Sheet>
      <Sheet t={t} visible={avatarPickerOpen} onClose={() => setAvatarPickerOpen(false)} title="🦊 Avatar kiezen">
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 14 }}>
          Extra avatars komen vrij bij een klusjes-mijlpaal (10, 25, 50, 100 klusjes).</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {[...KID_AVATARS, ...Object.entries(BONUS_AVATARS)
            .filter(([n]) => (S.milestonesSeen[me] || []).includes(Number(n)))
            .map(([, a]) => a)].map((a, i) => (
            <TouchableOpacity key={i} onPress={() => changeAvatar(a)} style={{ width: 52, height: 52, borderRadius: 999,
              alignItems: "center", justifyContent: "center", backgroundColor: t.soft,
              borderWidth: M?.avatar === a ? 2 : 0, borderColor: t.accent }}>
              <Text style={{ fontSize: 24 }}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Sheet>
      <Sheet t={t} visible={shortcutsSheet} onClose={() => setShortcutsSheet(false)} title="✏️ Snelkoppelingen aanpassen">
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 14 }}>
          Kies welke snelkoppelingen op Home staan. Zet iets uit dat je toch al onderin de tabbalk hebt.</Text>
        {SHORTCUT_ITEMS[role === "kind" ? "kind" : "ouder"].map(s => {
          const hidden = (S.hiddenShortcuts || []).includes(s.key);
          return (
            <View key={s.key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }}>{s.label}</Text>
              </View>
              <Btn t={t} small kind={hidden ? "ghost" : "primary"} onPress={() => {
                const next = hidden
                  ? (S.hiddenShortcuts || []).filter(k => k !== s.key)
                  : [...(S.hiddenShortcuts || []), s.key];
                patch({ hiddenShortcuts: next });
              }}>{hidden ? "Verborgen" : "Zichtbaar"}</Btn>
            </View>
          );
        })}
      </Sheet>
      <GiftModal t={t} visible={giftModal} onClose={() => setGiftModal(false)} cur={S.cur}
        kids={Object.entries(S.members).filter(([, m]) => m.role === "kind")} onRegister={receiveGift} />

      <Modal visible={showTour} transparent animationType="fade" onRequestClose={closeTour}>
        <View style={{ flex: 1, backgroundColor: "rgba(10,5,25,0.55)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: t.card, borderRadius: 24, padding: 24, width: "100%", maxWidth: 360 }}>
            <Text style={{ fontSize: 40, textAlign: "center", marginBottom: 10 }}>{TOUR_STEPS[tourStep]?.icon}</Text>
            <Text style={{ fontWeight: "900", fontSize: 19, color: t.ink, textAlign: "center", marginBottom: 8 }}>
              {TOUR_STEPS[tourStep]?.title}</Text>
            <Text style={{ fontSize: 14, color: t.sub, textAlign: "center", lineHeight: 20, marginBottom: 18 }}>
              {TOUR_STEPS[tourStep]?.body}</Text>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 18 }}>
              {TOUR_STEPS.map((_, i) => (
                <View key={i} style={{ width: 7, height: 7, borderRadius: 999,
                  backgroundColor: i === tourStep ? t.accent : t.line }} />
              ))}
            </View>
            <Btn t={t} onPress={() => tourStep < TOUR_STEPS.length - 1 ? setTourStep(s => s + 1) : closeTour()}>
              {tourStep < TOUR_STEPS.length - 1 ? "Volgende" : "Klaar!"}</Btn>
            <TouchableOpacity onPress={closeTour} style={{ alignItems: "center", padding: 12 }}>
              <Text style={{ color: t.sub, fontWeight: "700", fontSize: 13 }}>Sla over</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={familySetupOpen} animationType="slide" onRequestClose={() => setFamilySetupOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <FamilySetup t={t} jr={false} fam={fam} localState={S} onDone={onFamilySetupDone} onCancel={() => setFamilySetupOpen(false)} />
        </SafeAreaView>
      </Modal>

      <Modal visible={helpOpen} animationType="slide" onRequestClose={() => setHelpOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontWeight: "900", fontSize: 20, color: t.ink, flex: 1 }}>Hulp & uitleg</Text>
            <TouchableOpacity onPress={() => setHelpOpen(false)}>
              <Text style={{ color: t.accent, fontWeight: "800", fontSize: 15 }}>Sluiten</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
            <TextInput style={inputStyle(t)} placeholder="Zoek een optie (bijv. 'foto', 'thema', 'code')…"
              placeholderTextColor={t.sub} value={helpQuery} onChangeText={setHelpQuery} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0 }}>
            {filteredHelp.length === 0 ? (
              <Text style={{ color: t.sub, textAlign: "center", marginTop: 20 }}>Niets gevonden voor "{helpQuery}".</Text>
            ) : filteredHelp.map((h, i) => (
              <Card t={t} key={i} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <Text style={{ fontSize: 20 }}>{h.icon}</Text>
                  <Text style={{ fontWeight: "800", fontSize: 15, color: t.ink }}>{h.title}</Text>
                </View>
                <Text style={{ fontSize: 13, color: t.sub, lineHeight: 19 }}>{h.body}</Text>
              </Card>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      {pinGateModal}
    </SafeAreaView>
  );
}

// ---------- Modals ----------
function Sheet({ t, visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: "rgba(10,5,25,0.55)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
            <Text style={{ fontWeight: "800", fontSize: 17, color: t.ink, marginBottom: 14 }}>{title}</Text>
            {children}
            <TouchableOpacity onPress={onClose} style={{ alignItems: "center", padding: 12 }}>
              <Text style={{ color: t.sub, fontWeight: "700" }}>Annuleren</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const inputStyle = (t) => ({ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12,
  color: t.ink, marginBottom: 10, fontSize: 15 });

// Allereerste pagina, vóór de profielkeuze — eerlijke uitleg over reclame en kosten,
// zodat niemand achteraf voor een verrassing komt te staan. Eenmalig per toestel.
function PricingIntro({ t, onContinue }) {
  const Row = ({ icon, title, body }) => (
    <Card t={t} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: t.soft,
          borderWidth: 1, borderColor: t.line, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Text style={{ fontSize: 23 }}>{icon}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", fontSize: 15, color: t.ink, marginBottom: 4 }}>{title}</Text>
          <Text style={{ fontSize: 13, color: t.sub, lineHeight: 19 }}>{body}</Text>
        </View>
      </View>
    </Card>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48, flexGrow: 1 }}>
      <View style={{ alignItems: "center", marginBottom: 28 }}>
        <Text style={{ fontSize: 34, fontWeight: "900", color: t.ink, letterSpacing: -1.5 }}>
          Heit<Text style={{ color: t.accent }}>je</Text></Text>
        <Text style={{ fontSize: 13, fontWeight: "800", color: t.accent, letterSpacing: 0.2, marginTop: -2 }}>
          voor een karweitje</Text>
      </View>

      <View style={{ alignItems: "center", marginBottom: 24 }}>
        <View style={{ backgroundColor: t.soft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: t.accent }}>💶 VOORDAT JE BEGINT</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: "900", color: t.ink, textAlign: "center", marginBottom: 6 }}>
          Hoe Heitje betaald wordt</Text>
        <Text style={{ fontSize: 13.5, color: t.sub, textAlign: "center", lineHeight: 19 }}>
          Precies hoe reclame en kosten werken. Geen verrassingen achteraf.</Text>
      </View>

      <Row icon="🧒" title="Kinderen: altijd gratis, nooit reclame"
        body="Een kindprofiel ziet nooit advertenties en heeft nooit kosten — geen uitzondering, geen instelling die dit ooit kan veranderen." />
      <Row icon="👨‍👩‍👧" title="Ouders: gratis met reclame, of reclamevrij"
        body="Als ouder zie je af en toe een klein, duidelijk gemarkeerd advertentieblokje. Reclame helemaal weg kan voor € 0,99 per maand, of eenmalig € 9,99. (Binnenkort beschikbaar in de app.)" />
      <Row icon="🧓" title="Gasten van buitenaf: zelfde principe"
        body="Opa, oma, een oom/tante of vriend die als gast een klusje voorstelt, ziet ook af en toe reclame — of kiest voor reclamevrij voor € 0,99 per maand. (Binnenkort beschikbaar.)" />

      <View style={{ marginTop: 12, marginBottom: 24 }}>
        <Btn t={t} onPress={onContinue}>Begrepen, verder →</Btn>
      </View>

      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 12 }}>
        <TouchableOpacity onPress={() => Linking.openURL(`${LEGAL_BASE}/privacy.html`)}>
          <Text style={{ color: t.sub, fontSize: 12, textDecorationLine: "underline" }}>Privacybeleid</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(`${LEGAL_BASE}/voorwaarden.html`)}>
          <Text style={{ color: t.sub, fontSize: 12, textDecorationLine: "underline" }}>Voorwaarden</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// Losstaand, minimaal scherm voor een host (bv. de buurvrouw) — uitgenodigd door een
// ouder voor precies één kind. Ziet nooit de rest van het gezin (feed/saldo's/foto's),
// alleen zijn eigen buurtklusjes voor dat ene kind: aanmaken + goedkeuren na uitchecken.
function HostView({ t, M, fmt, childName, myJobs, onSubmit, onDecide }) {
  const [title, setTitle] = useState("");
  const [euros, setEuros] = useState("");
  const [recurring, setRecurring] = useState(false);
  const submit = () => {
    const cents = Math.round(parseFloat(euros.replace(",", ".")) * 100);
    if (!title.trim() || !cents || cents <= 0) { alertX("Vul een titel en een geldig bedrag in"); return; }
    onSubmit({ title: title.trim(), cents, recurring });
    setTitle(""); setEuros(""); setRecurring(false);
  };
  const STATUS_LABEL = (j) => {
    if (j.status === "open") return "⏳ Nog niet gestart";
    if (j.status === "in_progress") return "🚶 Bezig (ingecheckt)";
    if (j.status === "awaiting_approval") return j.hostApprovedAt ? "✅ Jij hebt goedgekeurd — wacht op een ouder" : "📋 Klaar gemeld — jouw goedkeuring nodig";
    if (j.status === "approved") return "🎉 Goedgekeurd en uitbetaald";
    return "❌ Afgewezen";
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "900", color: t.ink, marginBottom: 4 }}>Hoi {M?.name}! 👋</Text>
      <Text style={{ fontSize: 13, color: t.sub, marginBottom: 20 }}>
        Je bent uitgenodigd om klusjes aan te bieden aan {childName || "dit kind"}. Je ziet verder
        niets anders van dit gezin — geen andere klusjes, saldo's of foto's.</Text>

      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>NIEUW KLUSJE AANBIEDEN</Text>
      <TextInput style={inputStyle(t)} placeholder="Titel (bijv. Gras maaien)" placeholderTextColor={t.sub}
        value={title} onChangeText={setTitle} />
      <TextInput style={inputStyle(t)} placeholder="Bedrag (bijv. 5,00)" placeholderTextColor={t.sub}
        keyboardType="decimal-pad" value={euros} onChangeText={setEuros} />
      <TouchableOpacity onPress={() => setRecurring(v => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: recurring ? t.accent : t.line,
          backgroundColor: recurring ? t.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
          {recurring ? <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900" }}>✓</Text> : null}
        </View>
        <Text style={{ fontSize: 14, color: t.ink, fontWeight: "700" }}>🔁 Terugkerend klusje</Text>
      </TouchableOpacity>
      {recurring ? (
        <Text style={{ fontSize: 12, color: t.sub, marginTop: -6, marginBottom: 12 }}>
          Na elke goedkeuring verschijnt dit klusje automatisch weer open te staan.</Text>
      ) : null}
      <Btn t={t} onPress={submit}>Aanbieden aan {childName || "het kind"}</Btn>

      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginTop: 26, marginBottom: 10 }}>
        MIJN BUURTKLUSJES</Text>
      {myJobs.length === 0 ? (
        <Text style={{ fontSize: 13, color: t.sub }}>Nog geen klusjes aangeboden.</Text>
      ) : myJobs.map((j) => (
        <Card t={t} key={j.id} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{j.title}{j.recurring ? " 🔁" : ""}</Text>
              <Text style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{STATUS_LABEL(j)}</Text>
            </View>
            <Amount t={t} size={18}>{fmt(j.cents)}</Amount>
          </View>
          {j.status === "awaiting_approval" && !j.hostApprovedAt ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><Btn t={t} small onPress={() => onDecide(j.id, "approved")}>Goedkeuren ✓</Btn></View>
              <View style={{ flex: 1 }}><Btn t={t} small kind="ghost" onPress={() => onDecide(j.id, "declined")}>Afwijzen</Btn></View>
            </View>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

// Losstaand, minimaal scherm voor een gast (opa/oma/oom/tante/vriend) — geen toegang
// tot de rest van de app, alleen een klusje voorstellen en de eigen voorstellen terugzien.
function GastView({ t, M, fmt, myOffers, onSubmit }) {
  const [title, setTitle] = useState("");
  const [room, setRoom] = useState("");
  const [euros, setEuros] = useState("");
  const [note, setNote] = useState("");
  const submit = () => {
    const cents = Math.round(parseFloat(euros.replace(",", ".")) * 100);
    if (!title.trim() || !cents || cents <= 0) { alertX("Vul een titel en een geldig bedrag in"); return; }
    onSubmit({ title: title.trim(), room: room.trim() || null, emoji: suggestChoreEmoji(title, room), cents, note: note.trim() || null });
    setTitle(""); setRoom(""); setEuros(""); setNote("");
    alertX("Verstuurd! ✅", "Een ouder keurt je voorstel eerst goed voordat het een echt klusje wordt.");
  };
  const STATUS_LABEL = { pending: "⏳ In behandeling", approved: "✅ Goedgekeurd", declined: "❌ Afgewezen" };
  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "900", color: t.ink, marginBottom: 4 }}>Hoi {M?.name}! 👋</Text>
      <Text style={{ fontSize: 13, color: t.sub, marginBottom: 20 }}>
        Je bent uitgenodigd om een klusje voor te stellen. Een ouder keurt het altijd eerst goed
        voordat het een echt klusje wordt.</Text>

      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>KLUSJE VOORSTELLEN</Text>
      <TextInput style={inputStyle(t)} placeholder="Titel (bijv. Boodschappen doen)" placeholderTextColor={t.sub}
        value={title} onChangeText={setTitle} />
      <TextInput style={inputStyle(t)} placeholder="Kamer/plek (optioneel)" placeholderTextColor={t.sub}
        value={room} onChangeText={setRoom} />
      <TextInput style={inputStyle(t)} placeholder="Voorgesteld bedrag (bijv. 2,50)" placeholderTextColor={t.sub}
        keyboardType="decimal-pad" value={euros} onChangeText={setEuros} />
      <TextInput style={inputStyle(t)} placeholder="Notitie (optioneel)" placeholderTextColor={t.sub}
        value={note} onChangeText={setNote} />
      <Btn t={t} onPress={submit}>Voorstellen — ouder keurt goed</Btn>

      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginTop: 26, marginBottom: 10 }}>
        MIJN VOORSTELLEN</Text>
      {myOffers.length === 0 ? (
        <Text style={{ fontSize: 13, color: t.sub }}>Nog niets voorgesteld.</Text>
      ) : myOffers.map((o) => (
        <Card t={t} key={o.id} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{o.title}</Text>
              {o.room ? <Text style={{ fontSize: 12, color: t.sub }}>{o.room}</Text> : null}
            </View>
            <Amount t={t} size={18}>{fmt(o.cents)}</Amount>
          </View>
          <Text style={{ fontSize: 12, color: t.sub, marginTop: 6 }}>{STATUS_LABEL[o.status] || o.status}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

function AddChoreModal({ t, visible, onClose, onAdd }) {
  const [title, setTitle] = useState("");
  const [room, setRoom] = useState("");
  const [euros, setEuros] = useState("");
  const [note, setNote] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const [deadline, setDeadline] = useState("");
  const [photoReq, setPhotoReq] = useState(false);
  const submit = () => {
    const cents = Math.round(parseFloat(euros.replace(",", ".")) * 100);
    if (!title.trim() || !cents || cents <= 0) { alertX("Vul een titel en een geldig bedrag in"); return; }
    const checklist = checklistText.split("\n").map(s => s.trim()).filter(Boolean);
    const conditions = (note.trim() || checklist.length || photoReq || deadline.trim())
      ? { note: note.trim(), checklist, photoRequired: photoReq, deadline: deadline.trim() }
      : null;
    const roomTrimmed = room.trim() || "Huis";
    onAdd({ id: uid(), title: title.trim(), room: roomTrimmed, emoji: suggestChoreEmoji(title, roomTrimmed), cents, status: "open", by: null, conditions });
    setTitle(""); setRoom(""); setEuros(""); setNote(""); setChecklistText(""); setDeadline(""); setPhotoReq(false);
  };
  return (
    <Sheet t={t} visible={visible} onClose={onClose} title="＋ Nieuw klusje">
      <TextInput style={inputStyle(t)} placeholder="Titel (bijv. Vaatwasser uitruimen)" placeholderTextColor={t.sub}
        value={title} onChangeText={setTitle} />
      <TextInput style={inputStyle(t)} placeholder="Kamer (bijv. Keuken)" placeholderTextColor={t.sub}
        value={room} onChangeText={setRoom} />
      <TextInput style={inputStyle(t)} placeholder="Bedrag (bijv. 1,50)" placeholderTextColor={t.sub}
        keyboardType="decimal-pad" value={euros} onChangeText={setEuros} />

      <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.5, color: t.sub, marginTop: 4, marginBottom: 8 }}>VOORWAARDEN (optioneel)</Text>
      <TextInput style={inputStyle(t)} placeholder="Instructie (bijv. Vergeet de hoekjes niet)" placeholderTextColor={t.sub}
        value={note} onChangeText={setNote} />
      <TextInput style={[inputStyle(t), { height: 92, textAlignVertical: "top" }]} multiline
        placeholder={"Checklist — één punt per regel (bijv. Tafel afnemen / Stoelen recht / Vloer vegen)"} placeholderTextColor={t.sub}
        value={checklistText} onChangeText={setChecklistText} />
      <TextInput style={inputStyle(t)} placeholder="Deadline (bijv. voor 18:00 of vandaag)" placeholderTextColor={t.sub}
        value={deadline} onChangeText={setDeadline} />
      <TouchableOpacity onPress={() => setPhotoReq(v => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: photoReq ? t.accent : t.line,
          backgroundColor: photoReq ? t.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
          {photoReq ? <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900" }}>✓</Text> : null}
        </View>
        <Text style={{ fontSize: 14, color: t.ink, fontWeight: "700" }}>📸 Foto verplicht bij deze klus</Text>
      </TouchableOpacity>

      <Btn t={t} onPress={submit}>In de pool zetten</Btn>
    </Sheet>
  );
}

function AddGoalModal({ t, visible, onClose, onAdd, pickImage }) {
  const [name, setName] = useState("");
  const [euros, setEuros] = useState("");
  const [uri, setUri] = useState(null);
  const submit = () => {
    const target = Math.round(parseFloat(euros.replace(",", ".")) * 100);
    if (!name.trim() || !target || target <= 0) { alertX("Vul een naam en een geldig doelbedrag in"); return; }
    onAdd({ id: uid(), name: name.trim(), emoji: "🎁", imageUri: uri, target, saved: 0, link: "", approved: false });
    setName(""); setEuros(""); setUri(null);
  };
  return (
    <Sheet t={t} visible={visible} onClose={onClose} title="🐷 Nieuw spaardoel">
      <TextInput style={inputStyle(t)} placeholder="Waar spaar je voor?" placeholderTextColor={t.sub}
        value={name} onChangeText={setName} />
      <TextInput style={inputStyle(t)} placeholder="Doelbedrag (bijv. 49,99)" placeholderTextColor={t.sub}
        keyboardType="decimal-pad" value={euros} onChangeText={setEuros} />
      <View style={{ marginBottom: 10 }}>
        <Btn t={t} kind="ghost" onPress={async () => { const u = await pickImage(); if (u) setUri(u); }}>
          {uri ? "🖼️ Foto gekozen ✓ (tik om te wijzigen)" : "🖼️ Kies een foto (optioneel)"}</Btn>
      </View>
      <Btn t={t} onPress={submit}>Aanmaken — papa/mama keurt goed</Btn>
    </Sheet>
  );
}

function AddScreenGoalModal({ t, visible, onClose, onAdd, pickImage }) {
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("");
  const [uri, setUri] = useState(null);
  const submit = () => {
    const target = parseInt(minutes, 10);
    if (!name.trim() || !target || target <= 0) { alertX("Vul een naam en een geldig aantal minuten in"); return; }
    onAdd({ id: uid(), name: name.trim(), emoji: "🎮", imageUri: uri, target, saved: 0, link: "", approved: false });
    setName(""); setMinutes(""); setUri(null);
  };
  return (
    <Sheet t={t} visible={visible} onClose={onClose} title="🎮 Nieuw schermtijd-spaardoel">
      <TextInput style={inputStyle(t)} placeholder="Waar spaar je voor? (bijv. een filmavond)" placeholderTextColor={t.sub}
        value={name} onChangeText={setName} />
      <TextInput style={inputStyle(t)} placeholder="Doel in minuten (bijv. 120)" placeholderTextColor={t.sub}
        keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
      <View style={{ marginBottom: 10 }}>
        <Btn t={t} kind="ghost" onPress={async () => { const u = await pickImage(); if (u) setUri(u); }}>
          {uri ? "🖼️ Foto gekozen ✓ (tik om te wijzigen)" : "🖼️ Kies een foto (optioneel)"}</Btn>
      </View>
      <Btn t={t} onPress={submit}>Aanmaken — papa/mama keurt goed</Btn>
    </Sheet>
  );
}

function AddHomeworkModal({ t, visible, onClose, onAdd, role, me, kids, members, rewardMode }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [euros, setEuros] = useState("");
  const [minutes, setMinutes] = useState("");
  const [forKid, setForKid] = useState(role === "ouder" ? (kids[0] || null) : me);
  // Deze modal blijft gemount zolang de app open is (RN Modal verbergt 'm alleen) — als
  // er nog geen kinderen waren op het moment van de allereerste render, blijft forKid
  // anders voorgoed null hangen, ook als er later wél een kind wordt toegevoegd.
  useEffect(() => {
    if (role === "ouder" && (!forKid || !kids.includes(forKid))) setForKid(kids[0] || null);
  }, [kids.join(",")]);
  const submit = () => {
    if (role !== "ouder") { alertX("Niet toegestaan", "Alleen een ouder kan huiswerk toevoegen."); return; }
    if (role === "ouder" && kids.length === 0) { alertX("Nog geen kinderen in het gezin", "Voeg eerst een kind toe bij Gezin, dan kun je huiswerk toewijzen."); return; }
    if (!title.trim()) { alertX("Vul een titel in"); return; }
    const memberId = role === "ouder" ? forKid : me;
    if (!memberId) { alertX("Kies voor welk kind dit huiswerk is"); return; }
    const now = new Date();
    const y = parseInt(year, 10) || now.getFullYear();
    const m = parseInt(month, 10) || (now.getMonth() + 1);
    const d = parseInt(day, 10) || now.getDate();
    const dueDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // Het beloningsveld bestaat alleen voor een ouder — een kind dat zijn eigen huiswerk
    // aanmaakt ziet dit nooit, in geen van beide standen (zie CLAUDE.md-eis: discreet,
    // door de ouder bepaald — geldt voor minuten net zo goed als voor geld).
    let cents = null, mins = null;
    if (role === "ouder") {
      if (rewardMode === "money" && euros.trim()) {
        const parsed = Math.round(parseFloat(euros.replace(",", ".")) * 100);
        if (parsed > 0) cents = parsed;
      } else if (rewardMode === "minutes" && minutes.trim()) {
        const parsed = parseInt(minutes, 10);
        if (parsed > 0) mins = parsed;
      }
    }
    onAdd({ id: uid(), memberId, title: title.trim(), subject: subject.trim() || null, dueDate, done: false, cents, minutes: mins, rewardApproved: false });
    setTitle(""); setSubject(""); setDay(""); setMonth(""); setYear(""); setEuros(""); setMinutes("");
  };
  return (
    <Sheet t={t} visible={visible} onClose={onClose} title="📚 Nieuw huiswerk">
      {role === "ouder" && kids.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.5, color: t.sub, marginBottom: 8 }}>
            VOOR WELK KIND?</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {kids.map(k => (
              <TouchableOpacity key={k} onPress={() => setForKid(k)} style={{ paddingHorizontal: 12, paddingVertical: 8,
                borderRadius: 999, backgroundColor: forKid === k ? t.accent : t.soft, borderWidth: 2,
                borderColor: forKid === k ? t.accent : "transparent" }}>
                <Text style={{ color: forKid === k ? "#fff" : t.ink, fontWeight: "700", fontSize: 13 }}>
                  {members[k]?.avatar} {members[k]?.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : role === "ouder" ? (
        <Text style={{ fontSize: 13, color: t.sub, marginBottom: 14 }}>
          Nog geen kinderen in het gezin — voeg er eerst een toe bij Gezin.</Text>
      ) : null}
      <TextInput style={inputStyle(t)} placeholder="Titel (bijv. Rekenen blz. 24)" placeholderTextColor={t.sub}
        value={title} onChangeText={setTitle} />
      <TextInput style={inputStyle(t)} placeholder="Vak (optioneel)" placeholderTextColor={t.sub}
        value={subject} onChangeText={setSubject} />
      <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.5, color: t.sub, marginTop: 4, marginBottom: 8 }}>
        VOOR WANNEER (leeg = vandaag)</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput style={[inputStyle(t), { flex: 1 }]} placeholder="Dag" placeholderTextColor={t.sub}
          keyboardType="number-pad" value={day} onChangeText={setDay} />
        <TextInput style={[inputStyle(t), { flex: 1 }]} placeholder="Maand" placeholderTextColor={t.sub}
          keyboardType="number-pad" value={month} onChangeText={setMonth} />
        <TextInput style={[inputStyle(t), { flex: 1 }]} placeholder="Jaar" placeholderTextColor={t.sub}
          keyboardType="number-pad" value={year} onChangeText={setYear} />
      </View>
      {role === "ouder" && rewardMode === "money" ? (
        <TextInput style={inputStyle(t)} placeholder="Beloning (optioneel, bijv. 1,00)" placeholderTextColor={t.sub}
          keyboardType="decimal-pad" value={euros} onChangeText={setEuros} />
      ) : role === "ouder" && rewardMode === "minutes" ? (
        <TextInput style={inputStyle(t)} placeholder="Schermtijd in minuten (optioneel, bijv. 20)" placeholderTextColor={t.sub}
          keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
      ) : null}
      <Btn t={t} onPress={submit}>Toevoegen</Btn>
    </Sheet>
  );
}

function RejectModal({ t, choreId, onClose, onReject }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet t={t} visible={!!choreId} onClose={onClose} title="Afkeuren — waarom?">
      <TextInput style={inputStyle(t)} placeholder="Reden (bijv. Hoekjes vergeten)" placeholderTextColor={t.sub}
        value={reason} onChangeText={setReason} />
      <Btn t={t} kind="danger" onPress={() => { onReject(choreId, reason.trim()); setReason(""); }}>Afkeuren met reden</Btn>
    </Sheet>
  );
}

const KID_AVATARS = ["🦊", "🐸", "🐼", "🦄", "🐵", "🐯", "🐧", "🦁", "🐨", "🐰"];

// Nieuw kind toevoegen. Vraagt de geboortedatum om de leeftijd te berekenen, maar
// bewaart die geboortedatum zelf nergens — privacy by design, alleen de leeftijd blijft over.
function AddKidModal({ t, visible, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(KID_AVATARS[0]);
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [scanning, setScanning] = useState(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();

  const computeAge = () => {
    const d = parseInt(day, 10), m = parseInt(month, 10), y = parseInt(year, 10);
    if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1990) return null;
    const birth = new Date(y, m - 1, d);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const hadBirthdayThisYear = now.getMonth() > birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    if (!hadBirthdayThisYear) age--;
    return age >= 0 && age <= 17 ? age : null;
  };

  const submit = () => {
    if (!name.trim()) { alertX("Vul een naam in"); return; }
    const age = computeAge();
    if (age === null) { alertX("Geboortedatum onjuist", "Vul een geldige geboortedatum in (0–17 jaar)."); return; }
    onAdd({ name: name.trim(), avatar, age, role: "kind", streak: 0, color: "#7C3AED" });
    setName(""); setAvatar(KID_AVATARS[0]); setDay(""); setMonth(""); setYear("");
  };

  // Kind toevoegen door de "Delen als QR"-code van een ander toestel te scannen — geen
  // account nodig, gewoon de naam/avatar/leeftijd rechtstreeks overnemen.
  const onBarcodeScanned = ({ data }) => {
    if (!scanning) return;
    setScanning(false);
    try {
      const parsed = JSON.parse(data);
      if (!parsed.heitjeKid || !parsed.name) throw new Error("geen Heitje-kind-QR");
      onAdd({ name: parsed.name, avatar: parsed.avatar || KID_AVATARS[0], age: parsed.age ?? null, role: "kind", streak: 0, color: "#7C3AED" });
    } catch {
      alertX("Geen geldige QR-code", "Dit is geen QR-code van 'Delen als QR' bij een kind.");
    }
  };

  if (scanning) {
    return (
      <Sheet t={t} visible={visible} onClose={() => { setScanning(false); onClose(); }} title="📷 QR-code scannen">
        {!camPerm?.granted ? (
          <>
            <Text style={{ color: t.sub, marginBottom: 12 }}>Camera-toestemming nodig om te scannen.</Text>
            <Btn t={t} onPress={requestCamPerm}>Toestemming geven</Btn>
          </>
        ) : (
          <View style={{ height: 340, borderRadius: 16, overflow: "hidden", marginBottom: 12 }}>
            <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onBarcodeScanned} />
          </View>
        )}
        <Btn t={t} kind="ghost" onPress={() => setScanning(false)}>Annuleren</Btn>
      </Sheet>
    );
  }

  return (
    <Sheet t={t} visible={visible} onClose={onClose} title="👶 Nieuw kind toevoegen">
      <View style={{ marginBottom: 14 }}>
        <Btn t={t} small kind="ghost" onPress={() => setScanning(true)}>📷 Scan QR van ander toestel</Btn>
      </View>
      <TextInput style={inputStyle(t)} placeholder="Naam" placeholderTextColor={t.sub} value={name} onChangeText={setName} />
      <Text style={{ fontSize: 12, color: t.sub, marginBottom: 6, fontWeight: "700" }}>Avatar</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {KID_AVATARS.map(a => (
          <TouchableOpacity key={a} onPress={() => setAvatar(a)} style={{ width: 40, height: 40, borderRadius: 999,
            backgroundColor: t.soft, borderWidth: avatar === a ? 2 : 0, borderColor: t.accent,
            alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20 }}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: t.sub, marginBottom: 6, fontWeight: "700" }}>
        Geboortedatum (alleen om de leeftijd te berekenen — wordt niet opgeslagen)</Text>
      <TextInput style={inputStyle(t)} placeholder="Dag (bijv. 15)" placeholderTextColor={t.sub}
        keyboardType="number-pad" maxLength={2} value={day} onChangeText={setDay} />
      <TextInput style={inputStyle(t)} placeholder="Maand (bijv. 3)" placeholderTextColor={t.sub}
        keyboardType="number-pad" maxLength={2} value={month} onChangeText={setMonth} />
      <TextInput style={inputStyle(t)} placeholder="Jaar (bijv. 2015)" placeholderTextColor={t.sub}
        keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} />
      <Btn t={t} onPress={submit}>Toevoegen</Btn>
    </Sheet>
  );
}

// Betaalverzoek voor externe familie (opa/oma/tante) — fase 6a. De app verwerkt zelf
// nooit geld: dit maakt alleen een deelbaar berichtje, de ouder verstuurt het zelf via
// WhatsApp/sms/mail en registreert het bedrag pas als het er echt is.
function GiftModal({ t, visible, onClose, kids, cur, onRegister }) {
  const [kidKey, setKidKey] = useState(null);
  const [euros, setEuros] = useState("");
  const [giver, setGiver] = useState("");

  const cents = Math.round(parseFloat((euros || "0").replace(",", ".")) * 100) || 0;
  const kidName = kidKey ? kids.find(([k]) => k === kidKey)?.[1]?.name : null;

  const message = kidName
    ? `Hoi! ${kidName} heeft goed geholpen in huis en zou het superleuk vinden als je een bijdrage stuurt${cents ? ` van ${fmt0(cents, cur)}` : ""}. Dat mag via Tikkie, een overschrijving, of contant — deze app verwerkt zelf geen betalingen, dus stuur het gewoon zoals jij dat altijd doet. Dankjewel! 💜`
    : "";

  const share = async () => {
    if (!kidKey) { alertX("Kies eerst een kind"); return; }
    try { await Share.share({ message }); } catch {}
  };

  const register = () => {
    if (!kidKey || !cents) { alertX("Kies een kind en vul een bedrag in"); return; }
    onRegister(kidKey, cents, giver.trim() || "Familie");
    setKidKey(null); setEuros(""); setGiver("");
  };

  return (
    <Sheet t={t} visible={visible} onClose={onClose} title="🎁 Bijdrage van familie">
      <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
        Voor opa, oma, tante — iedereen buiten het gezin die iets wil geven. Geen geld door de app, alleen een deelbaar verzoek.</Text>
      <Text style={{ fontSize: 12, color: t.sub, marginBottom: 6, fontWeight: "700" }}>Voor welk kind?</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {kids.map(([k, m]) => (
          <TouchableOpacity key={k} onPress={() => setKidKey(k)} style={{ flexDirection: "row", alignItems: "center", gap: 6,
            paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999,
            backgroundColor: kidKey === k ? t.accent : t.soft }}>
            <Text style={{ fontSize: 16 }}>{m.avatar}</Text>
            <Text style={{ fontWeight: "700", fontSize: 13, color: kidKey === k ? "#fff" : t.ink }}>{m.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={inputStyle(t)} placeholder={`Bedrag (bijv. 10,00 ${cur})`} placeholderTextColor={t.sub}
        keyboardType="decimal-pad" value={euros} onChangeText={setEuros} />
      <TextInput style={inputStyle(t)} placeholder="Van wie? (optioneel, bijv. Opa Henk)" placeholderTextColor={t.sub}
        value={giver} onChangeText={setGiver} />
      <Btn t={t} kind="ghost" onPress={share}>📤 Deel verzoek</Btn>
      <View style={{ height: 10 }} />
      <Btn t={t} kind="success" onPress={register}>✅ Ontvangen — registreer bedrag</Btn>
    </Sheet>
  );
}

const PARENT_AVATARS = ["😎", "🌷", "🧑", "👩", "👨", "🧔"];

// Nieuwe (mede-)ouder lokaal toevoegen. Geboortedatum is optioneel — de app heeft geen
// leeftijdsafhankelijke weergave voor ouders, dus een leeg of onjuist ingevulde datum
// blokkeert het toevoegen niet (alleen bij kinderen is de leeftijd verplicht, want die
// bepaalt junior/tiener-weergave).
function AddParentModal({ t, visible, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(PARENT_AVATARS[0]);
  const [day, setDay] = useState(""); const [month, setMonth] = useState(""); const [year, setYear] = useState("");
  const submit = () => {
    if (!name.trim()) { alertX("Vul een naam in"); return; }
    const age = computeAgeFromDate(day, month, year, 120);
    onAdd({ name: name.trim(), avatar, age, role: "ouder", streak: 0, color: "#7C3AED" });
    setName(""); setAvatar(PARENT_AVATARS[0]); setDay(""); setMonth(""); setYear("");
  };
  return (
    <Sheet t={t} visible={visible} onClose={onClose} title="🧑‍🤝‍🧑 Nieuwe ouder toevoegen">
      <TextInput style={inputStyle(t)} placeholder="Naam" placeholderTextColor={t.sub} value={name} onChangeText={setName} />
      <Text style={{ fontSize: 12, color: t.sub, marginBottom: 6, fontWeight: "700" }}>Avatar</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {PARENT_AVATARS.map(a => (
          <TouchableOpacity key={a} onPress={() => setAvatar(a)} style={{ width: 40, height: 40, borderRadius: 999,
            backgroundColor: t.soft, borderWidth: avatar === a ? 2 : 0, borderColor: t.accent,
            alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20 }}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: t.sub, marginBottom: 6, fontWeight: "700" }}>
        Geboortedatum (optioneel — wordt niet opgeslagen)</Text>
      <TextInput style={inputStyle(t)} placeholder="Dag (bijv. 15)" placeholderTextColor={t.sub}
        keyboardType="number-pad" maxLength={2} value={day} onChangeText={setDay} />
      <TextInput style={inputStyle(t)} placeholder="Maand (bijv. 3)" placeholderTextColor={t.sub}
        keyboardType="number-pad" maxLength={2} value={month} onChangeText={setMonth} />
      <TextInput style={inputStyle(t)} placeholder="Jaar (bijv. 1985)" placeholderTextColor={t.sub}
        keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} />
      <Btn t={t} onPress={submit}>Toevoegen</Btn>
    </Sheet>
  );
}

function computeAgeFromDate(day, month, year, maxAge = 17) {
  const d = parseInt(day, 10), m = parseInt(month, 10), y = parseInt(year, 10);
  const now = new Date();
  if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < now.getFullYear() - 120) return null;
  const birth = new Date(y, m - 1, d);
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear = now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age--;
  return age >= 0 && age <= maxAge ? age : null;
}

const KID_COLORS = ["#7C3AED", "#0EA5E9", "#F59E0B", "#EC4899", "#16A34A", "#EF4444"];

// Allereerste keer opstarten: meteen de echte namen invoeren
// in plaats van de demo-namen (Emma/Daan/Papa/Mama) te houden.
function WelcomeWizard({ t, onComplete }) {
  const [parentName, setParentName] = useState("");
  const [parentAvatar, setParentAvatar] = useState(PARENT_AVATARS[0]);
  const [kids, setKids] = useState([]); // [{name, avatar, age}]
  const [kidName, setKidName] = useState("");
  const [kidAvatar, setKidAvatar] = useState(KID_AVATARS[0]);
  const [day, setDay] = useState(""); const [month, setMonth] = useState(""); const [year, setYear] = useState("");

  // Twee profielen met exact dezelfde naam zijn op het "Wie ben jij?"-scherm amper
  // te onderscheiden — dat voorkomen we hier al bij het invullen van het formulier.
  const nameTaken = (name) => {
    const n = name.trim().toLowerCase();
    return n === parentName.trim().toLowerCase() || kids.some(k => k.name.trim().toLowerCase() === n);
  };

  const addKidToList = () => {
    if (!kidName.trim()) { alertX("Vul een naam in voor dit kind"); return; }
    if (nameTaken(kidName)) { alertX("Naam al in gebruik", `Er zit al iemand met de naam ${kidName.trim()} in het lijstje. Kies een andere naam.`); return; }
    const age = computeAgeFromDate(day, month, year);
    if (age === null) { alertX("Geboortedatum onjuist", "Vul een geldige geboortedatum in (0–17 jaar)."); return; }
    setKids(ks => [...ks, { name: kidName.trim(), avatar: kidAvatar, age }]);
    setKidName(""); setKidAvatar(KID_AVATARS[(kids.length + 1) % KID_AVATARS.length]); setDay(""); setMonth(""); setYear("");
  };

  const finish = () => {
    if (!parentName.trim()) { alertX("Vul jouw naam in"); return; }
    // Een kind kan al ingevuld staan (naam + geboortedatum) zonder dat op
    // "+ Kind toevoegen aan lijst" is getikt — dat veld hier stilzwijgend laten
    // vallen voelt als "mijn invoer is weg". In plaats daarvan het kind alsnog
    // meenemen, of duidelijk maken wat er nog mist.
    let finalKids = kids;
    if (kidName.trim()) {
      if (nameTaken(kidName)) { alertX("Naam al in gebruik", `Er zit al iemand met de naam ${kidName.trim()} in het lijstje. Kies een andere naam.`); return; }
      const age = computeAgeFromDate(day, month, year);
      if (age === null) {
        alertX("Geboortedatum onjuist", `Vul een geldige geboortedatum in voor ${kidName.trim()}, of tik eerst op "+ Kind toevoegen aan lijst".`);
        return;
      }
      finalKids = [...kids, { name: kidName.trim(), avatar: kidAvatar, age }];
    }
    const members = {}; const balances = {}; const goals = {};
    const parentKey = uid();
    members[parentKey] = { name: parentName.trim(), avatar: parentAvatar, age: null, role: "ouder", streak: 0, color: "#7C3AED" };
    balances[parentKey] = 0;
    finalKids.forEach((k, i) => {
      const key = uid();
      members[key] = { name: k.name, avatar: k.avatar, age: k.age, role: "kind", streak: 0, color: KID_COLORS[i % KID_COLORS.length] };
      balances[key] = 0;
      goals[key] = defaultGoals();
    });
    onComplete(members, balances, goals);
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: "900", color: t.ink, marginBottom: 6 }}>Wie zit er in het gezin?</Text>
      <Text style={{ fontSize: 13, color: t.sub, marginBottom: 18 }}>Vul jullie echte namen in — je kan later altijd nog iemand toevoegen.</Text>

      <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 8 }}>Jouw naam (ouder)</Text>
      <TextInput style={inputStyle(t)} placeholder="Bijv. Wouter" placeholderTextColor={t.sub} value={parentName} onChangeText={setParentName} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
        {PARENT_AVATARS.map(a => (
          <TouchableOpacity key={a} onPress={() => setParentAvatar(a)} style={{ width: 40, height: 40, borderRadius: 999,
            backgroundColor: t.soft, borderWidth: parentAvatar === a ? 2 : 0, borderColor: t.accent,
            alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20 }}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 8 }}>Kinderen toevoegen (optioneel hier)</Text>
      {kids.map((k, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: t.soft,
          borderRadius: 12, padding: 10, marginBottom: 8 }}>
          <Text style={{ fontSize: 18 }}>{k.avatar}</Text>
          <Text style={{ flex: 1, fontWeight: "700", color: t.ink }}>{k.name} · {k.age} jr</Text>
          <TouchableOpacity onPress={() => setKids(ks => ks.filter((_, j) => j !== i))}>
            <Text style={{ color: t.danger, fontWeight: "700" }}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      <Card t={t} style={{ marginBottom: 20 }}>
        <TextInput style={inputStyle(t)} placeholder="Naam van kind" placeholderTextColor={t.sub} value={kidName} onChangeText={setKidName} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {KID_AVATARS.map(a => (
            <TouchableOpacity key={a} onPress={() => setKidAvatar(a)} style={{ width: 36, height: 36, borderRadius: 999,
              backgroundColor: t.card, borderWidth: kidAvatar === a ? 2 : 0, borderColor: t.accent,
              alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 17 }}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{ fontSize: 11.5, color: t.sub, marginBottom: 6, fontWeight: "700" }}>
          Geboortedatum (alleen voor de leeftijd — wordt niet opgeslagen)</Text>
        <TextInput style={inputStyle(t)} placeholder="Dag (bijv. 15)" placeholderTextColor={t.sub}
          keyboardType="number-pad" maxLength={2} value={day} onChangeText={setDay} />
        <TextInput style={inputStyle(t)} placeholder="Maand (bijv. 3)" placeholderTextColor={t.sub}
          keyboardType="number-pad" maxLength={2} value={month} onChangeText={setMonth} />
        <TextInput style={[inputStyle(t), { marginBottom: 10 }]} placeholder="Jaar (bijv. 2015)" placeholderTextColor={t.sub}
          keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} />
        <Btn t={t} small kind="ghost" onPress={addKidToList}>➕ Kind toevoegen aan lijst</Btn>
      </Card>

      <Btn t={t} onPress={finish}>Klaar, we beginnen! 🎉</Btn>
    </ScrollView>
  );
}
