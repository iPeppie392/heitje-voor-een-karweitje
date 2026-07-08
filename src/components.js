import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Image, Animated, Dimensions } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { jrWord } from "./theme";

export const Card = ({ t, children, style, onPress }) => {
  const inner = (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 16, borderWidth: 1,
      borderColor: t.line }, style]}>{children}</View>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.85} onPress={onPress}>{inner}</TouchableOpacity> : inner;
};

export const Btn = ({ t, children, onPress, kind = "primary", small, jr }) => {
  const kinds = {
    primary: { backgroundColor: t.accent, color: "#fff" },
    ghost: { backgroundColor: t.soft, color: t.accent },
    danger: { backgroundColor: "transparent", color: t.sub, borderWidth: 1, borderColor: t.line },
    success: { backgroundColor: t.green, color: "#fff" },
  };
  const k = kinds[kind];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{
      backgroundColor: k.backgroundColor, borderWidth: k.borderWidth || 0, borderColor: k.borderColor,
      borderRadius: 999, paddingVertical: jr ? 14 : small ? 9 : 12, paddingHorizontal: jr ? 22 : small ? 14 : 18,
      alignItems: "center" }}>
      <Text style={{ color: k.color, fontWeight: "800", fontSize: jr ? 17 : small ? 13 : 15 }}>{children}</Text>
    </TouchableOpacity>
  );
};

export const Chip = ({ t, children, color, big }) => (
  <View style={{ backgroundColor: t.chip, borderRadius: 999, paddingVertical: big ? 6 : 4,
    paddingHorizontal: big ? 14 : 10 }}>
    <Text style={{ color: color || t.accent, fontWeight: "800", fontSize: big ? 16 : 13 }}>{children}</Text>
  </View>
);

export const Amount = ({ t, children, size = 22 }) => (
  <Text style={{ fontWeight: "900", fontSize: size, color: t.accent, letterSpacing: -0.5 }}>{children}</Text>
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
