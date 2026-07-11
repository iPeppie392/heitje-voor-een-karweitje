import { supabase } from "./supabase";

// Zet alles wat al lokaal op dit toestel stond eenmalig over naar een net aangemaakt gezin-account.
// Draait maar één keer per toestel — de aanroeper zet daarna S.migrated = true.
export async function migrateLocalStateToFamily(localState, familyId, newParentMemberId) {
  const idMap = {}; // lokale sleutel (bv "emma") -> nieuwe UUID

  for (const [localKey, m] of Object.entries(localState.members || {})) {
    if (m.role === "ouder") {
      // De ouder die net inlogde heeft al een member-rij (via create_family); alle andere
      // lokale "ouder"-profielen op dit toestel worden gewone extra members, geen apart account.
      idMap[localKey] = null;
      continue;
    }
    const { data, error } = await supabase.from("members").insert({
      family_id: familyId, name: m.name, avatar: m.avatar, age: m.age,
      role: m.role, streak: m.streak || 0, color: m.color,
      screentime_minutes: localState.screenBalances?.[localKey] || 0,
    }).select("id").single();
    if (error) throw error;
    idMap[localKey] = data.id;
  }
  // Zorg dat het eerste ouder-profiel op dit toestel naar de echte nieuwe ouder-member wijst.
  const firstParentKey = Object.entries(localState.members || {}).find(([, m]) => m.role === "ouder")?.[0];
  if (firstParentKey) idMap[firstParentKey] = newParentMemberId;

  for (const c of localState.chores || []) {
    await supabase.from("chores").insert({
      family_id: familyId, title: c.title, room: c.room, emoji: c.emoji, cents: c.cents,
      status: c.status, claimed_by: c.by ? idMap[c.by] : null, conditions: c.conditions || null,
    });
  }

  for (const [kidKey, g] of Object.entries(localState.goals || {})) {
    const kidId = idMap[kidKey];
    if (!kidId) continue;
    await supabase.from("goals").insert({
      family_id: familyId, kid_id: kidId, name: g.name, emoji: g.emoji,
      image_uri: g.imageUri, target: g.target, saved: g.saved, link: g.link, approved: g.approved,
    });
  }

  for (const [memberKey, cents] of Object.entries(localState.balances || {})) {
    if (!cents) continue;
    const memberId = idMap[memberKey];
    if (!memberId) continue;
    await supabase.from("ledger_entries").insert({
      family_id: familyId, member_id: memberId, cents,
      kind: "legacy_import", note: "Meegenomen vanaf lokaal toestel",
    });
  }

  for (const post of localState.feed || []) {
    await supabase.from("feed_posts").insert({
      family_id: familyId, who: post.who ? idMap[post.who] : null, title: post.title,
      cents: post.cents, before_uri: post.beforeUri, after_uri: post.afterUri, badge: post.badge,
      rx: post.rx || { "👏": 0, "🔥": 0, "❤️": 0 },
    });
  }

  for (const h of localState.homework || []) {
    const memberId = idMap[h.memberId];
    if (!memberId) continue;
    await supabase.from("homework_items").insert({
      family_id: familyId, member_id: memberId, title: h.title, subject: h.subject || null,
      due_date: h.dueDate, done: h.done, cents: h.cents ?? null, minutes: h.minutes ?? null,
      reward_approved: h.rewardApproved || false,
    });
  }

  for (const [kidKey, g] of Object.entries(localState.screenGoals || {})) {
    const kidId = idMap[kidKey];
    if (!kidId) continue;
    await supabase.from("screentime_goals").insert({
      family_id: familyId, kid_id: kidId, name: g.name, emoji: g.emoji,
      image_uri: g.imageUri, target_minutes: g.target, saved_minutes: g.saved, link: g.link, approved: g.approved,
    });
  }

  // Alleen bijwerken als het toestel al afweek van de nieuwe standaard (aan/minuten) —
  // anders blijft de nieuwe families-rij gewoon op zijn eigen standaard staan.
  const familyUpdates = {};
  if (localState.homeworkEnabled === false) familyUpdates.homework_enabled = false;
  if (localState.homeworkRewardMode === "money") familyUpdates.homework_reward_mode = "money";
  if (Object.keys(familyUpdates).length) {
    await supabase.from("families").update(familyUpdates).eq("id", familyId);
  }

  return idMap;
}
