import React, { useState } from "react";
import { View, Text } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

// Echte AdMob-code (zie app.json voor de App ID). Werkt alleen in een EAS-build (dev
// client of productie) — NIET in Expo Go, want daar zit de native module niet in.
// require() i.p.v. een top-level import, zodat een ontbrekende native module in Expo Go
// de hele bundel niet laat crashen. Web heeft een eigen bestand (AdSlot.web.js) dat deze
// package helemaal niet importeert — Metro's web-bundler kan dit pakket niet bundelen
// (het gebruikt React Native-interne modules die op web niet bestaan).
const AD_UNIT_ID_REAL = "ca-app-pub-3747360356393074/4176289970";
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let BannerAd = null, BannerAdSize = null, TestIds = null;
if (!inExpoGo) {
  try {
    const mobileAds = require("react-native-google-mobile-ads");
    BannerAd = mobileAds.BannerAd;
    BannerAdSize = mobileAds.BannerAdSize;
    TestIds = mobileAds.TestIds;
    // Reclame komt hier alleen ooit in ouder-weergaven (harde regel, elders al afgedwongen) —
    // toch expliciet ook hier tegen Google zeggen dat dit geen kind-gerichte content is.
    mobileAds.default().setRequestConfiguration({
      maxAdContentRating: mobileAds.MaxAdContentRating.G,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    }).then(() => mobileAds.default().initialize()).catch(() => {});
  } catch { BannerAd = null; }
}
// Tijdens ontwikkelen (dev client) altijd Google's testadvertentie tonen, nooit de echte —
// zelf op je eigen advertentie klikken tijdens testen kan je AdMob-account laten flaggen.
const AD_UNIT_ID = __DEV__ ? TestIds?.BANNER : AD_UNIT_ID_REAL;

// Vangnet: als de native banner-view onverwacht faalt te renderen, toon de placeholder
// in plaats van de app te laten crashen.
class AdErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// Reclame-plek — ALLEEN ooit gebruikt in ouder-weergaven, nooit bij kinderen (harde regel,
// afgedwongen door de aanroeper in App.js). Toont een echte AdMob-banner zodra dat kan
// (EAS-build, niet Expo Go); valt anders terug op een nette placeholder in dezelfde
// stijl als de rest van de app.
export const AdSlot = ({ t, style }) => {
  const [failed, setFailed] = useState(false);
  const placeholder = (
    <View style={[{ backgroundColor: t.soft, borderRadius: t.radius ?? 20, borderWidth: 1,
      borderColor: t.line, borderStyle: "dashed", paddingVertical: 18, alignItems: "center" }, style]}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: t.sub, letterSpacing: 0.5 }}>ADVERTENTIE</Text>
      <Text style={{ fontSize: 11, color: t.sub, marginTop: 3 }}>(nog niet actief — alleen ouder-weergaven)</Text>
    </View>
  );
  if (!BannerAd || failed) return placeholder;
  return (
    <AdErrorBoundary fallback={placeholder}>
      <View style={[{ alignItems: "center" }, style]}>
        <BannerAd unitId={AD_UNIT_ID} size={BannerAdSize.BANNER} onAdFailedToLoad={() => setFailed(true)} />
      </View>
    </AdErrorBoundary>
  );
};
