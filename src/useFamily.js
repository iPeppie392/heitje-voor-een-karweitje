import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase, backendConfigured } from "./supabase";
import { pullFamilyState, subscribeFamilyRealtime, flushPendingWrites } from "./sync";

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // geen O/0/I/1 — voorkomt verwarring bij intypen
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Enige plek in de app die weet dat er een backend bestaat. Zonder .env-config
// (backendConfigured === false) doet deze hook niets — de app blijft 100% lokaal.
export function useFamily({ familyId, onCloudState }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(backendConfigured);
  const unsubRef = useRef(null);

  useEffect(() => {
    if (!backendConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    const appStateSub = AppState.addEventListener("change", (s) => { if (s === "active") flushPendingWrites(); });
    return () => { sub.subscription.unsubscribe(); appStateSub.remove(); };
  }, []);

  useEffect(() => {
    if (!backendConfigured || !session || !familyId) return;
    let cancelled = false;
    pullFamilyState(familyId).then((state) => { if (!cancelled) onCloudState(state); }).catch(() => {});
    unsubRef.current = subscribeFamilyRealtime(familyId, () => {
      pullFamilyState(familyId).then((state) => { if (!cancelled) onCloudState(state); }).catch((e) => console.warn("Cloud-pull mislukt:", e?.message));
    });
    return () => { cancelled = true; unsubRef.current?.(); };
  }, [session, familyId]);

  const signUp = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  // Verwijdert een heel gezin (cascade ruimt alle gezins-tabellen). Alleen een ouder van
  // dat gezin mag dit — gecheckt server-side in de RPC delete_family().
  const deleteFamily = useCallback(async (familyId) => {
    const { error } = await supabase.rpc("delete_family", { p_family_id: familyId });
    if (error) throw error;
  }, []);

  const createFamily = useCallback(async (familyName, currency, parentName, parentAvatar) => {
    const { data, error } = await supabase.rpc("create_family", {
      family_name: familyName, currency, parent_name: parentName, parent_avatar: parentAvatar,
    });
    if (error) throw error;
    return data[0]; // { family_id, member_id }
  }, []);

  // childId: alleen relevant bij role="host" — bindt de uitnodiging aan één specifiek
  // kind, zodat de host na het inwisselen alleen dat kind mag zien/voor werken.
  const createInvite = useCallback(async (familyId, role = "ouder", childId = null) => {
    const code = randomCode();
    const { data: memberRow } = await supabase.from("members")
      .select("id").eq("family_id", familyId).eq("auth_user_id", session?.user?.id).single();
    const { error } = await supabase.from("family_invites").insert({
      family_id: familyId, code, created_by: memberRow?.id, role, child_member_id: childId,
    });
    if (error) throw error;
    return code;
  }, [session]);

  const redeemInvite = useCallback(async (code, parentName, parentAvatar) => {
    const { data, error } = await supabase.rpc("redeem_invite", {
      invite_code: code.trim().toUpperCase(), parent_name: parentName, parent_avatar: parentAvatar,
    });
    if (error) throw error;
    return data[0]; // { family_id, member_id, role } — role komt pas hierna, server-geverifieerd
  }, []);

  const redeemPromoCode = useCallback(async (code) => {
    const { data, error } = await supabase.rpc("redeem_promo_code", { promo_code: code.trim() });
    if (error) throw error;
    return !!data; // true = ontgrendeld, false = code onbekend/verlopen/vol
  }, []);

  return { backendConfigured, session, loading, signUp, signIn, signOut, deleteFamily, createFamily, createInvite, redeemInvite, redeemPromoCode };
}
