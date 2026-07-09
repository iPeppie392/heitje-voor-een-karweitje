import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert,
  SafeAreaView, useColorScheme, KeyboardAvoidingView, Platform, Linking,
} from "react-native";

const LEGAL_BASE = "https://heitje-voor-een-karweitje-five.vercel.app";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { light, dark, fmt as fmt0 } from "./src/theme";
import { loadState, saveState, resetState, DEFAULT_STATE } from "./src/store";
import { Card, Btn, Chip, Amount, PhotoBox, Ring, JuniorBar, Confetti } from "./src/components";

const FREE_CHORE_LIMIT = 5; // free tier: max active chores (premium: unlimited)

export default function App() {
  const scheme = useColorScheme();
  const t = scheme === "dark" ? dark : light;

  const [loaded, setLoaded] = useState(false);
  const [booted, setBooted] = useState(false);
  const [S, setS] = useState(DEFAULT_STATE);
  const [me, setMe] = useState(null); // active profile on this device
  const [tab, setTab] = useState("feed");
  const [confetti, setConfetti] = useState(false);
  const [choreModal, setChoreModal] = useState(false);
  const [goalModal, setGoalModal] = useState(false);
  const [rejectFor, setRejectFor] = useState(null); // chore id being rejected

  useEffect(() => { loadState().then(s => { setS(s); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) saveState(S); }, [S, loaded]);
  // Automatisch inloggen: open meteen bij het laatst gekozen profiel op dit toestel
  useEffect(() => {
    if (loaded && !booted) {
      setBooted(true);
      if (S.lastMe && S.members[S.lastMe]) setMe(S.lastMe);
    }
  }, [loaded, booted, S]);

  // Profiel kiezen op de inlogpagina — onthoudt de keuze voor de volgende keer
  const pick = (k) => { setMe(k); patch({ lastMe: k }); };

  const fmt = (c) => fmt0(c, S.cur);
  const M = me ? S.members[me] : null;
  const role = M?.role;
  const jr = role === "kind" && M.age < 12; // junior (<12): motivation bar; teen: ring with %
  const boom = () => { setConfetti(false); setTimeout(() => setConfetti(true), 30); setTimeout(() => setConfetti(false), 2200); };
  const patch = (p) => setS(s => ({ ...s, ...p }));

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Camera", "Geef cameratoegang om bewijsfoto's te maken."); return null; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.4, allowsEditing: false });
    return res.canceled ? null : res.assets[0].uri;
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
    return res.canceled ? null : res.assets[0].uri;
  };

  const addFeed = (post) =>
    setS(s => ({ ...s, feed: [{ id: Date.now(), time: new Date().toISOString(), rx: { "👏": 0, "🔥": 0, "❤️": 0 }, ...post }, ...s.feed] }));

  const react = (id, e) =>
    setS(s => ({ ...s, feed: s.feed.map(p => p.id === id ? { ...p, rx: { ...p.rx, [e]: p.rx[e] + 1 } } : p) }));

  // ----- Chore flow -----
  const setChore = (id, up) => setS(s => ({ ...s, chores: s.chores.map(c => c.id === id ? { ...c, ...up } : c) }));

  // Voorwaarden: checklist afvinken en of alles klaar is
  const condChecklist = (c) => c.conditions?.checklist || [];
  const allChecked = (c) => condChecklist(c).every((_, i) => !!c.checked?.[i]);
  const toggleCheck = (c, i) => setChore(c.id, { checked: condChecklist(c).map((_, j) => j === i ? !(c.checked?.[i]) : !!c.checked?.[j]) });

  const claim = (c) => setChore(c.id, { status: "claimed", by: me, checked: condChecklist(c).map(() => false) });

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

  const approve = (c) => {
    boom();
    addFeed({ who: c.by, title: c.title, cents: c.cents, beforeUri: c.beforeUri, afterUri: c.afterUri });
    setS(s => {
      const chores = s.chores.filter(x => x.id !== c.id);
      if (s.members[c.by].role === "kind") {
        return { ...s, chores, pendingAlloc: { kid: c.by, cents: c.cents, title: c.title } };
      }
      return { ...s, chores, balances: { ...s.balances, [c.by]: s.balances[c.by] + c.cents } };
    });
  };

  const doReject = (id, reason) => { setChore(id, { status: "rejected", reason: reason || "Nog niet af" }); setRejectFor(null); };

  const allocate = (toGoal) => {
    const { kid, cents } = S.pendingAlloc;
    if (toGoal && S.goals[kid]) {
      const g = S.goals[kid], newSaved = g.saved + cents;
      setS(s => ({ ...s, pendingAlloc: null, goals: { ...s.goals, [kid]: { ...g, saved: newSaved } } }));
      if (newSaved >= g.target) {
        boom();
        addFeed({ who: kid, badge: `🎉 SPAARDOEL BEREIKT: ${g.name}!` });
        Alert.alert("DOEL BEREIKT! 🎉", "Papa en mama: tijd om te kopen 🛒");
      }
    } else {
      setS(s => ({ ...s, pendingAlloc: null, balances: { ...s.balances, [kid]: s.balances[kid] + cents } }));
    }
  };

  const payout = (kid) => {
    Alert.alert("Uitbetalen", `${fmt(S.balances[kid])} aan ${S.members[kid].name} uitbetaald (buiten de app)?`, [
      { text: "Annuleren", style: "cancel" },
      { text: "Ja, registreer", onPress: () => {
          addFeed({ who: kid, badge: `💶 Zakgeld uitbetaald: ${fmt(S.balances[kid])}` });
          setS(s => ({ ...s, balances: { ...s.balances, [kid]: 0 } }));
        } },
    ]);
  };

  const approveGoal = (kid) =>
    setS(s => ({ ...s, goals: { ...s.goals, [kid]: { ...s.goals[kid], approved: true } } }));

  // ----- UI helpers -----
  const kids = Object.keys(S.members).filter(k => S.members[k].role === "kind");
  const waiting = S.chores.filter(c => c.status === "waiting");
  const active = S.chores.filter(c => true);
  const myGoal = role === "kind" ? S.goals[me] : null;

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

  if (!me) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
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
                  {m.role === "kind" ? `Kind · ${m.age} jaar` : "Ouder"}{k === S.lastMe ? " · laatst gebruikt" : ""}</Text>
              </View>
              <Text style={{ fontSize: 20, color: t.sub }}>›</Text>
            </TouchableOpacity>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 20 }}>
            <TouchableOpacity onPress={() => Linking.openURL(`${LEGAL_BASE}/privacy.html`)}>
              <Text style={{ color: t.sub, fontSize: 12, textDecorationLine: "underline" }}>Privacybeleid</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(`${LEGAL_BASE}/voorwaarden.html`)}>
              <Text style={{ color: t.sub, fontSize: 12, textDecorationLine: "underline" }}>Voorwaarden</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  const GoalCard = ({ kid, own }) => {
    const g = S.goals[kid];
    const m = S.members[kid];
    if (!g) {
      return kid === me ? (
        <Card t={t} onPress={() => setGoalModal(true)} style={{ marginBottom: 12, alignItems: "center", borderStyle: "dashed" }}>
          <Text style={{ fontSize: 26 }}>🐷</Text>
          <Text style={{ fontWeight: "800", fontSize: 15, color: t.ink }}>＋ Spaardoel aanmaken</Text>
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
            ? <Btn t={t} small kind="success" onPress={() => approveGoal(kid)}>Keur goed ✓</Btn> : null}
        </View>
      </Card>
    );
  };

  // ----- Home / dashboard (het pronkstuk) -----
  const Feed = () => {
    const openCount = S.chores.filter(c => c.status === "open").length;
    const totalSaved = Object.values(S.goals).reduce((a, g) => a + (g?.saved || 0), 0);
    const doneCount = S.feed.filter(p => !p.badge).length;
    const topSaverKey = Object.entries(S.balances).sort((a, b) => b[1] - a[1])[0]?.[0];
    const activeChoreOf = (k) => S.chores.find(c => c.by === k && c.status !== "open");
    const ordered = Object.entries(S.members).slice()
      .sort((a, b) => (a[0] === me ? -1 : b[0] === me ? 1 : 0) || (S.balances[b[0]] - S.balances[a[0]]));

    const Tile = ({ icon, value, label, onPress, hot }) => (
      <Card t={t} onPress={onPress} style={{ flex: 1, paddingVertical: 15, alignItems: "flex-start" }}>
        <Text style={{ fontSize: 19 }}>{icon}</Text>
        <Text style={{ fontSize: 23, fontWeight: "900", color: hot ? t.accent : t.ink, marginTop: 5, letterSpacing: -0.5 }}>{value}</Text>
        <Text style={{ fontSize: 11.5, fontWeight: "700", color: t.sub, marginTop: 1 }}>{label}</Text>
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

    const shortcuts = role === "kind"
      ? [
          { icon: "🧹", label: "Klusjes", on: () => setTab("klusjes") },
          { icon: "🐷", label: "Sparen", on: () => setTab("sparen") },
          { icon: "👨‍👩‍👧", label: "Gezin", on: () => setTab("gezin") },
          { icon: "🔄", label: "Wissel", on: () => setMe(null) },
        ]
      : [
          { icon: "➕", label: "Nieuw klus", on: () => { if (active.length >= FREE_CHORE_LIMIT) { Alert.alert("Premium ✨", `Gratis: max ${FREE_CHORE_LIMIT} actieve klusjes.`); } else setChoreModal(true); } },
          { icon: "✅", label: "Keuren", on: () => setTab("klusjes") },
          { icon: "💶", label: "Uitbetalen", on: () => setTab("gezin") },
          { icon: "🐷", label: "Sparen", on: () => setTab("sparen") },
          { icon: "👨‍👩‍👧", label: "Gezin", on: () => setTab("gezin") },
          { icon: "🔄", label: "Wissel", on: () => setMe(null) },
        ];

    const MemberCard = ({ k, m }) => {
      const bal = S.balances[k];
      const g = m.role === "kind" ? S.goals[k] : null;
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
            <Amount t={t} size={20}>{fmt(bal)}</Amount>
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
          <View style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 28 }}>{M.avatar}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 22, letterSpacing: -0.5 }}>Hoi {M.name}! 👋</Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5, fontWeight: "700" }}>🔥 {M.streak} dagen streak</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16 }}>
          <View>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>MIJN SALDO</Text>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 40, letterSpacing: -1.5, marginTop: 2 }}>{fmt(S.balances[me])}</Text>
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

      {/* SNELKOPPELINGEN */}
      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>SNELKOPPELINGEN</Text>
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
      </View>

      {/* IEDEREEN IN HET GEZIN */}
      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>IEDEREEN IN HET GEZIN</Text>
      {ordered.map(([k, m]) => <MemberCard key={k} k={k} m={m} />)}
      <View style={{ height: 4 }} />

      {/* Mijn klusjes (kind) — direct af te ronden vanaf de home */}
      {role === "kind" && S.chores.some(c => c.by === me && c.status !== "open") ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10, marginTop: 6 }}>MIJN KLUSJES</Text>
          {S.chores.filter(c => c.by === me && c.status !== "open").map(c => <ChoreCard key={c.id} c={c} />)}
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

  const Chores = () => (
    <>
      {role === "ouder" && waiting.length > 0 ? (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>GOED TE KEUREN</Text>
          {waiting.map(c => <ChoreCard key={c.id} c={c} />)}
        </>
      ) : null}
      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginVertical: 10 }}>
        {role === "kind" ? (jr ? "KLUSJES — PAK ZE! 🙌" : "OPEN POOL — CLAIM ZE SNEL") : `IN DE POOL (${active.length}/${FREE_CHORE_LIMIT} gratis)`}</Text>
      {S.chores.filter(c => c.status !== "waiting" || role === "kind").map(c => <ChoreCard key={c.id} c={c} />)}
      {role === "ouder" ? (
        <Btn t={t} kind="ghost" onPress={() => {
          if (active.length >= FREE_CHORE_LIMIT) {
            Alert.alert("Premium ✨", `Gratis: max ${FREE_CHORE_LIMIT} actieve klusjes. Onbeperkt + wekelijks herhalen = Premium (€ 0,99/mnd).`);
          } else setChoreModal(true);
        }}>＋ Nieuw klusje in de pool</Btn>
      ) : null}
    </>
  );

  const Sparen = () => (
    <>
      {role === "kind" ? (
        <>
          <GoalCard kid={me} own />
          {S.goals[me] ? (
            <Card t={t} style={{ marginBottom: 14, alignItems: "center", borderStyle: "dashed" }}
              onPress={() => Alert.alert("Premium ✨", "Tweede spaardoel? Dat kan met Premium (€ 0,99/mnd) — vraag papa of mama!")}>
              <Text style={{ fontSize: 24 }}>🔒</Text>
              <Text style={{ fontWeight: "800", color: t.ink, fontSize: 15 }}>＋ Tweede spaardoel</Text>
              <Text style={{ fontSize: 13, color: t.sub, marginTop: 2 }}>Gratis: 1 doel · meer met Premium</Text>
            </Card>
          ) : null}
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>SPAARDOELEN VAN HET GEZIN</Text>
          {kids.filter(k => k !== me).map(k => <GoalCard key={k} kid={k} />)}
        </>
      ) : (
        <>
          <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>SPAARDOELEN VAN DE KINDEREN</Text>
          {kids.map(k => <GoalCard key={k} kid={k} />)}
        </>
      )}
      <Text style={{ fontSize: 12, color: t.sub, paddingVertical: 12 }}>
        Nieuw doel: kies een foto en doelbedrag. Papa of mama keurt het doel eerst goed — pas dan gaat de winkellink open (parental gate).</Text>
    </>
  );

  const Gezin = () => (
    <>
      <Text style={{ fontWeight: "800", fontSize: 13, color: t.sub, letterSpacing: 1, marginBottom: 10 }}>SALDO PER GEZINSLID</Text>
      {Object.entries(S.balances).sort((a, b) => b[1] - a[1]).map(([k, v], i) => {
        const m = S.members[k];
        return (
          <Card t={t} key={k} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ fontWeight: "800", width: 20, color: i === 0 ? t.amber : t.sub }}>{i + 1}</Text>
              <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: t.soft,
                alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 22 }}>{m.avatar}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 15, color: t.ink }}>{m.name} {i === 0 && v > 0 ? "👑" : ""}</Text>
                <Text style={{ fontSize: 12, color: t.sub }}>🔥 {m.streak} dagen streak
                  {m.role === "kind" ? ` · ${m.age < 12 ? "Junior" : "Tiener"}` : ""}</Text>
              </View>
              <Amount t={t} size={24}>{fmt(v)}</Amount>
            </View>
            {role === "ouder" && m.role === "kind" && v > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Btn t={t} small kind="ghost" onPress={() => payout(k)}>💶 Uitbetaald — registreer</Btn>
              </View>
            ) : null}
          </Card>
        );
      })}

      {role === "ouder" ? (
        <Card t={t} style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 10 }}>💱 Gezinsvaluta</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["€", "£", "$"].map(c => (
              <TouchableOpacity key={c} onPress={() => patch({ cur: c })} style={{ flex: 1, borderRadius: 12,
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
        <Text style={{ fontWeight: "700", fontSize: 14, color: t.ink, marginBottom: 8 }}>⚙️ Testversie</Text>
        <Text style={{ fontSize: 12, color: t.sub, marginBottom: 10 }}>
          Data staat lokaal op dit toestel (nog geen synchronisatie tussen telefoons — dat komt met de Supabase-backend).
          Weergave per kind: junior (motivatiebalk) onder 12, tiener (ring met %) vanaf 12 — automatisch via leeftijd.</Text>
        <Text style={{ fontSize: 11.5, color: t.sub, marginBottom: 10, lineHeight: 16 }}>
          ⚠️ Disclaimer: testversie, "as-is", zonder garanties. Bedragen zijn geen echt geld — de app verwerkt geen
          betalingen. Uitbetalen en aankopen doet de ouder zelf. Gebruik op eigen risico. Zie de voorwaarden.</Text>
        <Btn t={t} small kind="danger" onPress={() =>
          Alert.alert("Demo resetten", "Alle lokale data wissen?", [
            { text: "Annuleren", style: "cancel" },
            { text: "Wissen", style: "destructive", onPress: async () => { await resetState(); setS(DEFAULT_STATE); setMe(null); } },
          ])}>Demo-data resetten</Btn>
        <View style={{ flexDirection: "row", gap: 18, marginTop: 14 }}>
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

  const tabs = [
    { id: "feed", label: "Feed", icon: "🏠", C: Feed },
    { id: "klusjes", label: "Klusjes", icon: "✅", C: Chores },
    { id: "sparen", label: "Sparen", icon: "🐷", C: Sparen },
    { id: "gezin", label: "Gezin", icon: "👨‍👩‍👧‍👦", C: Gezin },
  ];
  const Screen = tabs.find(x => x.id === tab)?.C || Feed;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Confetti show={confetti} />

      {/* Header — prominent logo + profielwissel */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 40, fontWeight: "900", color: t.ink, letterSpacing: -2 }}>
            Heit<Text style={{ color: t.accent }}>je</Text></Text>
          <Text style={{ fontSize: 15, fontWeight: "800", color: t.accent, letterSpacing: 0.2, marginTop: -3 }}>
            voor een karweitje</Text>
        </View>
        <Chip t={t} big>💰 {fmt(S.balances[me])}</Chip>
        <TouchableOpacity onPress={() => setMe(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6,
          backgroundColor: t.soft, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingLeft: 8, paddingRight: 11, paddingVertical: 6 }}>
          <Text style={{ fontSize: 18 }}>{M.avatar}</Text>
          <Text style={{ fontSize: 12.5, fontWeight: "800", color: t.ink }}>{M.name} ▾</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <Screen />
      </ScrollView>

      {/* Tab bar */}
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderColor: t.line, backgroundColor: t.card,
        paddingTop: 8, paddingBottom: 6 }}>
        {tabs.map(x => (
          <TouchableOpacity key={x.id} onPress={() => setTab(x.id)} style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <Text style={{ fontSize: 19 }}>{x.icon}</Text>
            <Text style={{ fontSize: 10.5, fontWeight: tab === x.id ? "800" : "600",
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

      {/* Allocation modal: shown to the kid whose chore was approved */}
      <Modal visible={!!S.pendingAlloc && me === S.pendingAlloc?.kid} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(10,5,25,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ textAlign: "center", fontWeight: "800", fontSize: jr ? 20 : 17, color: t.ink }}>
              {jr ? "Gelukt! 🎉🎉" : "Goedgekeurd! 🎉"}</Text>
            <Text style={{ textAlign: "center", fontWeight: "900", fontSize: jr ? 46 : 40, color: t.accent,
              marginVertical: 6, letterSpacing: -1 }}>+{S.pendingAlloc ? fmt(S.pendingAlloc.cents) : ""}</Text>
            <Text style={{ textAlign: "center", fontSize: jr ? 15 : 13, color: t.sub, marginBottom: 18 }}>
              {jr ? "Waar gaat het heen? 🤔" : `${S.pendingAlloc?.title || ""} — waar gaat het heen?`}</Text>
            <View style={{ gap: 10 }}>
              {S.goals[S.pendingAlloc?.kid] ? (
                <Btn t={t} jr={jr} onPress={() => allocate(true)}>
                  🐷 {jr ? "Sparen!" : `Naar mijn spaardoel (${S.goals[S.pendingAlloc?.kid]?.name})`}</Btn>
              ) : null}
              <Btn t={t} jr={jr} kind="ghost" onPress={() => allocate(false)}>💸 {jr ? "Zelf houden!" : "Naar vrij saldo"}</Btn>
            </View>
          </View>
        </View>
      </Modal>

      <AddChoreModal t={t} visible={choreModal} onClose={() => setChoreModal(false)}
        onAdd={(chore) => { setS(s => ({ ...s, chores: [...s.chores, chore] })); setChoreModal(false); }} />
      <AddGoalModal t={t} visible={goalModal} onClose={() => setGoalModal(false)} pickImage={pickImage}
        onAdd={(goal) => { setS(s => ({ ...s, goals: { ...s.goals, [me]: goal } })); setGoalModal(false); }} />
      <RejectModal t={t} choreId={rejectFor} onClose={() => setRejectFor(null)} onReject={doReject} />
    </SafeAreaView>
  );
}

// ---------- Modals ----------
function Sheet({ t, visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: "rgba(10,5,25,0.55)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
          <Text style={{ fontWeight: "800", fontSize: 17, color: t.ink, marginBottom: 14 }}>{title}</Text>
          {children}
          <TouchableOpacity onPress={onClose} style={{ alignItems: "center", padding: 12 }}>
            <Text style={{ color: t.sub, fontWeight: "700" }}>Annuleren</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const inputStyle = (t) => ({ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12,
  color: t.ink, marginBottom: 10, fontSize: 15 });

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
    if (!title.trim() || !cents || cents <= 0) { Alert.alert("Vul een titel en een geldig bedrag in"); return; }
    const checklist = checklistText.split("\n").map(s => s.trim()).filter(Boolean);
    const conditions = (note.trim() || checklist.length || photoReq || deadline.trim())
      ? { note: note.trim(), checklist, photoRequired: photoReq, deadline: deadline.trim() }
      : null;
    onAdd({ id: Date.now(), title: title.trim(), room: room.trim() || "Huis", emoji: "🧽", cents, status: "open", by: null, conditions });
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
    if (!name.trim() || !target || target <= 0) { Alert.alert("Vul een naam en een geldig doelbedrag in"); return; }
    onAdd({ name: name.trim(), emoji: "🎁", imageUri: uri, target, saved: 0, link: "", approved: false });
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
