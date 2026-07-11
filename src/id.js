// UUID v4, client-gegenereerd — wordt zowel de lokale sleutel als de Postgres-id,
// zodat er nooit een aparte vertaling tussen "lokale id" en "cloud-id" nodig is.
// Steunt op crypto.getRandomValues, dat al gepolyfilld wordt door
// react-native-get-random-values (zie bovenaan src/supabase.js).
export function uid() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
