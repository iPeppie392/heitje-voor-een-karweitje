import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, Image, Animated, Dimensions } from "react-native";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { createAudioPlayer } from "expo-audio";
import { jrWord } from "./theme";

// Eén gedeelde geluidsspeler voor alle knoppen in de app (niet per knop opnieuw aanmaken —
// dat zou tientallen native speler-instanties tegelijk geven op een druk scherm).
let tapPlayer = null;
try { tapPlayer = createAudioPlayer(require("../assets/sounds/tap.wav")); } catch { tapPlayer = null; }

// AdSlot zit in een eigen bestand met een .web.js-variant: Metro's webbundelaar kan
// react-native-google-mobile-ads niet bundelen (gebruikt React Native-interne modules
// die op web niet bestaan) — een losse module per platform lost dat op, een if-check
// in dit bestand was niet genoeg (Metro bundelt alle require()'s statisch, ongeacht
// runtime-conditie). Zie src/AdSlot.js / src/AdSlot.web.js.
export { AdSlot } from "./AdSlot";

export const Card = ({ t, children, style, onPress }) => {
  const inner = (
    <View style={[{ backgroundColor: t.card, borderRadius: t.radius ?? 20, padding: 16, borderWidth: 1,
      borderColor: t.line }, style]}>{children}</View>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.85} onPress={onPress}>{inner}</TouchableOpacity> : inner;
};

// Klein, subtiel drukgevoel op elke knop in de app: iets kleiner worden bij aanraken
// (net genoeg om "aanraakbaar" te voelen, niet overdreven), een zachte trilling en een
// heel kort tikje geluid. Faalt altijd stil (try/catch) — een knop mag nooit crashen
// omdat een geluid of trilling niet beschikbaar is (bijv. op web).
export const Btn = ({ t, children, onPress, kind = "primary", small, jr }) => {
  const kinds = {
    primary: { backgroundColor: t.accent, color: "#fff" },
    ghost: { backgroundColor: t.soft, color: t.accent },
    danger: { backgroundColor: "transparent", color: t.sub, borderWidth: 1, borderColor: t.line },
    success: { backgroundColor: t.green, color: "#fff" },
  };
  const k = kinds[kind];
  const ts = t.textScale || 1;
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  };
  const handlePress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    try { tapPlayer?.seekTo?.(0); tapPlayer?.play?.(); } catch {}
    onPress?.();
  };

  return (
    <Pressable onPress={handlePress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={{ transform: [{ scale }],
        backgroundColor: k.backgroundColor, borderWidth: k.borderWidth || 0, borderColor: k.borderColor,
        borderRadius: 999, paddingVertical: jr ? 14 : small ? 9 : 12, paddingHorizontal: jr ? 22 : small ? 14 : 18,
        alignItems: "center" }}>
        <Text style={{ color: k.color, fontWeight: "800", fontSize: Math.round((jr ? 17 : small ? 13 : 15) * ts) }}>{children}</Text>
      </Animated.View>
    </Pressable>
  );
};

export const Chip = ({ t, children, color, big }) => (
  <View style={{ backgroundColor: t.chip, borderRadius: 999, paddingVertical: big ? 6 : 4,
    paddingHorizontal: big ? 14 : 10 }}>
    <Text style={{ color: color || t.accent, fontWeight: "800", fontSize: Math.round((big ? 16 : 13) * (t.textScale || 1)) }}>{children}</Text>
  </View>
);

export const Amount = ({ t, children, size = 22 }) => (
  <Text style={{ fontWeight: "900", fontSize: Math.round(size * (t.textScale || 1)), color: t.accent, letterSpacing: -0.5 }}>{children}</Text>
);

// Photo/emoji tile used for chore proof and goal images
export const PhotoBox = ({ t, uri, emoji, label, h = 110, r = 14 }) => (
  <View style={{ flex: 1, height: h, borderRadius: r, overflow: "hidden", backgroundColor: t.soft,
    alignItems: "center", justifyContent: "center" }}>
    {uri
      ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      : <Text style={{ fontSize: h / 3 }}>{emoji || "📷"}</Text>}
    {label ? (
      <View style={{ position: "absolute", top: 8, left: 8, backgroundColor: "rgba(0,0,0,0.45)",
        borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{label}</Text>
      </View>
    ) : null}
  </View>
);

// Teen/parent progress: ring with percentage
export const Ring = ({ t, pct, size = 128, uri, emoji }) => {
  const r = (size - 14) / 2, c = 2 * Math.PI * r;
  const p = Math.min(1, pct);
  return (
    <View style={{ width: size, height: size + 10 }}>
      <View style={{ position: "absolute", top: 10, left: 10, right: 10, bottom: 10 + 10,
        borderRadius: 999, overflow: "hidden", backgroundColor: t.soft,
        alignItems: "center", justifyContent: "center" }}>
        {uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
             : <Text style={{ fontSize: size / 3 }}>{emoji}</Text>}
      </View>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.line} strokeWidth={7} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.accent} strokeWidth={7} fill="none"
          strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={{ position: "absolute", bottom: 0, alignSelf: "center", backgroundColor: t.accent,
        borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{Math.min(100, Math.round(p * 100))}%</Text>
      </View>
    </View>
  );
};

// Junior progress: filling motivation bar with words, no percentages
export const JuniorBar = ({ t, pct, big }) => {
  const p = Math.min(1, pct);
  return (
    <View>
      <Text style={{ fontWeight: "900", fontSize: big ? 22 : 15, marginBottom: 6,
        color: p >= 1 ? t.green : t.accent, textAlign: big ? "center" : "left" }}>{jrWord(p)}</Text>
      <View style={{ height: big ? 26 : 18, borderRadius: 999, backgroundColor: t.soft,
        borderWidth: 1, borderColor: t.line, overflow: "hidden" }}>
        <View style={{ width: `${p * 100}%`, height: "100%", borderRadius: 999,
          backgroundColor: p >= 1 ? t.green : t.accent }} />
      </View>
    </View>
  );
};

// Lightweight confetti burst
const Piece = ({ i, color }) => {
  const v = useRef(new Animated.Value(0)).current;
  const H = Dimensions.get("window").height;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1600 + (i % 5) * 120, delay: (i % 10) * 60,
      useNativeDriver: true }).start();
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-20, H + 40] });
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${360 + i * 30}deg`] });
  return (
    <Animated.View style={{ position: "absolute", top: 0, left: `${(i * 61) % 100}%`,
      width: 8 + (i % 3) * 3, height: 12, borderRadius: 2, backgroundColor: color,
      transform: [{ translateY }, { rotate }] }} />
  );
};

export const Confetti = ({ show }) => {
  if (!show) return null;
  const cols = ["#7C3AED", "#F59E0B", "#16A34A", "#EC4899", "#0EA5E9"];
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }}>
      {Array.from({ length: 40 }).map((_, i) => <Piece key={i} i={i} color={cols[i % cols.length]} />)}
    </View>
  );
};
