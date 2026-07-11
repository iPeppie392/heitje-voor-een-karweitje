import { useState } from "react";
import { View, Text, TextInput, ActivityIndicator, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Card, Btn } from "../components";
import { migrateLocalStateToFamily } from "../migrate";

const inputStyle = (t) => ({
  borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12,
  fontSize: 15, color: t.ink, backgroundColor: t.card, marginBottom: 10,
});

// Ouder-only: "Gezin aanmaken" of "Ik heb een code" — verschijnt vanaf het profielkeuzescherm.
// localState wordt (indien aanwezig) een-op-een meegenomen naar het nieuwe gezin-account.
export default function FamilySetup({ t, jr, fam, localState, onDone, onCancel }) {
  const [mode, setMode] = useState(null); // "create" | "join" | null
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [parentName, setParentName] = useState("");
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();

  const hasLocalData = localState && (
    Object.keys(localState.members || {}).length > 0 ||
    (localState.chores || []).length > 0
  );

  async function ensureAccount() {
    try { await fam.signUp(email.trim(), password); }
    catch { await fam.signIn(email.trim(), password); }
  }

  async function doCreate() {
    if (!email.trim() || !password || !familyName.trim() || !parentName.trim()) {
      Alert.alert("Bijna klaar", "Vul e-mail, wachtwoord, gezinsnaam en je naam in.");
      return;
    }
    setBusy(true);
    try {
      await ensureAccount();
      const { family_id, member_id } = await fam.createFamily(familyName.trim(), localState?.cur || "€", parentName.trim(), "😎");
      if (hasLocalData) {
        await migrateLocalStateToFamily(localState, family_id, member_id);
      }
      onDone({ familyId: family_id, memberId: member_id, didMigrate: hasLocalData });
    } catch (e) {
      Alert.alert("Dat ging niet goed", e.message || "Probeer het nog eens.");
    } finally { setBusy(false); }
  }

  async function doJoin(scannedCode) {
    const useCode = (scannedCode ?? code).trim();
    if (!email.trim() || !password || !parentName.trim() || !useCode) {
      Alert.alert("Bijna klaar", "Vul e-mail, wachtwoord, je naam en de code in.");
      return;
    }
    setBusy(true);
    try {
      await ensureAccount();
      const { family_id, member_id } = await fam.redeemInvite(useCode, parentName.trim(), "😎");
      onDone({ familyId: family_id, memberId: member_id, didMigrate: false });
    } catch (e) {
      Alert.alert("Code werkt niet", "Deze code is onbekend, verlopen, of al gebruikt.");
    } finally { setBusy(false); }
  }

  function onBarcodeScanned({ data }) {
    if (busy) return;
    setScanning(false);
    const last = data.split("/").filter(Boolean).pop() || data;
    setCode(last);
    doJoin(last);
  }

  if (scanning) {
    if (!camPerm?.granted) {
      requestCamPerm();
      return (
        <Card t={t} style={{ margin: 16 }}>
          <Text style={{ color: t.ink }}>Camera-toestemming nodig om de QR-code te scannen…</Text>
          <Btn t={t} jr={jr} kind="ghost" onPress={() => setScanning(false)}>Annuleren</Btn>
        </Card>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onBarcodeScanned} />
        <Btn t={t} jr={jr} kind="ghost" onPress={() => setScanning(false)} style={{ margin: 16 }}>Annuleren</Btn>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      {!mode && (
        <>
          <Text style={{ fontSize: 22, fontWeight: "900", color: t.ink, marginBottom: 16, textAlign: "center" }}>
            Welkom bij Heitje 👋
          </Text>
          <Btn t={t} jr={jr} onPress={() => setMode("create")}>Gezin aanmaken</Btn>
          <View style={{ height: 10 }} />
          <Btn t={t} jr={jr} kind="ghost" onPress={() => setMode("join")}>Ik heb een code</Btn>
          {onCancel && (<><View style={{ height: 10 }} /><Btn t={t} jr={jr} kind="ghost" onPress={onCancel}>Later, ga lokaal verder</Btn></>)}
        </>
      )}

      {mode === "create" && (
        <Card t={t}>
          <Text style={{ fontWeight: "800", color: t.ink, marginBottom: 12, fontSize: 16 }}>Nieuw gezin</Text>
          <TextInput style={inputStyle(t)} placeholder="Jouw naam" placeholderTextColor={t.sub} value={parentName} onChangeText={setParentName} />
          <TextInput style={inputStyle(t)} placeholder="Gezinsnaam (bv. Familie Jansen)" placeholderTextColor={t.sub} value={familyName} onChangeText={setFamilyName} />
          <TextInput style={inputStyle(t)} placeholder="E-mail" placeholderTextColor={t.sub} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextInput style={inputStyle(t)} placeholder="Wachtwoord" placeholderTextColor={t.sub} secureTextEntry value={password} onChangeText={setPassword} />
          {hasLocalData && (
            <Text style={{ color: t.sub, fontSize: 12.5, marginBottom: 10 }}>
              Je bestaande klusjes, saldo en spaardoelen op dit toestel worden automatisch meegenomen.
            </Text>
          )}
          {busy ? <ActivityIndicator color={t.accent} /> : <Btn t={t} jr={jr} onPress={doCreate}>Gezin aanmaken</Btn>}
          <View style={{ height: 8 }} />
          <Btn t={t} jr={jr} kind="ghost" onPress={() => setMode(null)}>Terug</Btn>
        </Card>
      )}

      {mode === "join" && (
        <Card t={t}>
          <Text style={{ fontWeight: "800", color: t.ink, marginBottom: 12, fontSize: 16 }}>Bij een gezin voegen</Text>
          <TextInput style={inputStyle(t)} placeholder="Jouw naam" placeholderTextColor={t.sub} value={parentName} onChangeText={setParentName} />
          <TextInput style={inputStyle(t)} placeholder="E-mail" placeholderTextColor={t.sub} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextInput style={inputStyle(t)} placeholder="Wachtwoord" placeholderTextColor={t.sub} secureTextEntry value={password} onChangeText={setPassword} />
          <TextInput style={inputStyle(t)} placeholder="Code (bv. K7QX2P)" placeholderTextColor={t.sub} autoCapitalize="characters" value={code} onChangeText={setCode} />
          {busy ? <ActivityIndicator color={t.accent} /> : (
            <>
              <Btn t={t} jr={jr} onPress={() => doJoin()}>Code inwisselen</Btn>
              <View style={{ height: 8 }} />
              <Btn t={t} jr={jr} kind="ghost" onPress={() => setScanning(true)}>QR-code scannen</Btn>
            </>
          )}
          <View style={{ height: 8 }} />
          <Btn t={t} jr={jr} kind="ghost" onPress={() => setMode(null)}>Terug</Btn>
        </Card>
      )}
    </View>
  );
}
