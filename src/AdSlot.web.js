import React from "react";
import { View, Text } from "react-native";

// AdMob heeft geen webversie — hier blijft het altijd de nette placeholder,
// zelfde stijl als de rest van de app. Zie AdSlot.js voor de echte banner op native.
export const AdSlot = ({ t, style }) => (
  <View style={[{ backgroundColor: t.soft, borderRadius: t.radius ?? 20, borderWidth: 1,
    borderColor: t.line, borderStyle: "dashed", paddingVertical: 18, alignItems: "center" }, style]}>
    <Text style={{ fontSize: 11, fontWeight: "800", color: t.sub, letterSpacing: 0.5 }}>ADVERTENTIE</Text>
    <Text style={{ fontSize: 11, color: t.sub, marginTop: 3 }}>(nog niet actief — alleen ouder-weergaven)</Text>
  </View>
);
