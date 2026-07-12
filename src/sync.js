import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const QUEUE_KEY = "heitje-pending-writes-v1";

// ---- Vertaling: Supabase-rijen -> dezelfde vorm die App.js al gebruikt ----
export function rowsToLocalShape({ members, chores, goals, feedPosts, homeworkItems, screenGoals, choreOffers, neighborJobs, balances, family }) {
  // Verwijderde gezinsleden worden nooit hard gewist (dat zou hun hele zakgeld-
  // geschiedenis meeslepen via de foreign keys) — alleen gemarkeerd als "archived".
  // Die horen hier nergens meer in de lokale state te verschijnen.
  const activeMembers = members.filter((m) => !m.archived);

  const membersById = {};
  const screenBalancesById = {};
  for (const m of activeMembers) {
    membersById[m.id] = {
      name: m.name, avatar: m.avatar, age: m.age, role: m.role,
      streak: m.streak, color: m.color, push_token: m.push_token ?? null,
      hostChildId: m.host_child_id ?? null, externalEarnedCents: m.external_earned_cents || 0,
    };
    screenBalancesById[m.id] = m.screentime_minutes || 0;
  }

  const balancesById = {};
  for (const m of activeMembers) balancesById[m.id] = 0;
  for (const b of balances) if (b.member_id in balancesById) balancesById[b.member_id] = b.balance_cents;

  // Een goedgekeurd klusje waarvan het kind al gekozen heeft (sparen/saldo) is
  // helemaal afgerond — hoeft nergens in de app nog te verschijnen. Klusjes die nog
  // op die keuze wachten (approved, nog niet allocated) blijven wel staan, zodat het
  // kind de keuze op ELK toestel kan afronden.
  const choresOut = chores
    .filter((c) => !(c.status === "approved" && c.allocated))
    .map((c) => ({
      id: c.id, title: c.title, room: c.room, emoji: c.emoji, cents: c.cents,
      status: c.status, by: c.claimed_by, conditions: c.conditions,
      checked: c.checked, beforeUri: c.before_uri, afterUri: c.after_uri,
      reason: c.reject_reason, allocated: c.allocated, offeredBy: c.offered_by,
    }));

  // Klusjes-van-buitenaf: een gast ziet (via RLS) toch al alleen zijn eigen voorstellen,
  // een ouder ziet ze allemaal — hier gewoon kaal doorgeven, geen extra filtering nodig.
  const choreOffersOut = (choreOffers || []).map((o) => ({
    id: o.id, offeredBy: o.offered_by, title: o.title, room: o.room, emoji: o.emoji,
    cents: o.cents, note: o.note, status: o.status,
  }));

  // Buurtklusjes: net als chore_offers hierboven kaal doorgeven — RLS regelt al dat een
  // host alleen zijn eigen jobs terugkrijgt, een ouder/kind ziet ze allemaal.
  const neighborJobsOut = (neighborJobs || []).map((j) => ({
    id: j.id, childId: j.child_id, hostId: j.host_id, title: j.title, cents: j.cents, status: j.status,
    checkInUri: j.check_in_uri, checkInAt: j.check_in_at, checkOutUri: j.check_out_uri, checkOutAt: j.check_out_at,
    hostApprovedAt: j.host_approved_at, parentApprovedAt: j.parent_approved_at,
  }));

  const goalsById = {};
  for (const g of goals) {
    goalsById[g.kid_id] = {
      id: g.id, name: g.name, emoji: g.emoji, imageUri: g.image_uri,
      target: g.target, saved: g.saved, link: g.link, approved: g.approved,
    };
  }

  const screenGoalsById = {};
  for (const g of (screenGoals || [])) {
    screenGoalsById[g.kid_id] = {
      id: g.id, name: g.name, emoji: g.emoji, imageUri: g.image_uri,
      target: g.target_minutes, saved: g.saved_minutes, link: g.link, approved: g.approved,
    };
  }

  const feedOut = feedPosts.map((f) => ({
    id: f.id, who: f.who, title: f.title, cents: f.cents,
    beforeUri: f.before_uri, afterUri: f.after_uri, badge: f.badge,
    rx: f.rx, time: f.created_at,
  }));

  // Huiswerk: kale doorgave, geen filtering — "af + beloning toegekend" is een normale
  // eindstatus van een planner-item (het hoort in de agenda te blijven staan), anders dan
  // een afgehandeld klusje dat nergens meer hoeft te verschijnen.
  const homeworkOut = (homeworkItems || []).map((h) => ({
    id: h.id, memberId: h.member_id, title: h.title, subject: h.subject,
    dueDate: h.due_date, done: h.done, cents: h.cents, minutes: h.minutes, rewardApproved: h.reward_approved,
  }));

  return {
    members: membersById, balances: balancesById, chores: choresOut, goals: goalsById, feed: feedOut,
    homework: homeworkOut, screenBalances: screenBalancesById, screenGoals: screenGoalsById,
    choreOffers: choreOffersOut, neighborJobs: neighborJobsOut,
    cur: family?.currency, premiumUnlocked: !!family?.premium_unlocked,
    homeworkEnabled: family?.homework_enabled !== false, homeworkRewardMode: family?.homework_reward_mode || "minutes",
  };
}

export async function pullFamilyState(familyId) {
  const [members, chores, goals, feedPosts, homeworkItems, screenGoals, choreOffers, neighborJobs, balances, family] = await Promise.all([
    supabase.from("members").select("*").eq("family_id", familyId),
    supabase.from("chores").select("*").eq("family_id", familyId),
    supabase.from("goals").select("*").eq("family_id", familyId),
    supabase.from("feed_posts").select("*").eq("family_id", familyId).order("created_at", { ascending: false }).limit(200),
    supabase.from("homework_items").select("*").eq("family_id", familyId),
    supabase.from("screentime_goals").select("*").eq("family_id", familyId),
    supabase.from("chore_offers").select("*").eq("family_id", familyId),
    supabase.from("neighbor_jobs").select("*").eq("family_id", familyId),
    supabase.from("member_balances").select("*").eq("family_id", familyId),
    supabase.from("families").select("*").eq("id", familyId).single(),
  ]);
  for (const r of [members, chores, goals, feedPosts, balances, family]) if (r.error) throw r.error;
  // homework_items/screentime_goals/chore_offers/neighbor_jobs bestaan pas zodra
  // sql/005/006/007/008 gedraaid zijn — tot die migraties gedraaid zijn, mag een
  // ontbrekende tabel de rest van de sync niet breken.
  return rowsToLocalShape({
    members: members.data, chores: chores.data, goals: goals.data,
    feedPosts: feedPosts.data, homeworkItems: homeworkItems.error ? [] : homeworkItems.data,
    screenGoals: screenGoals.error ? [] : screenGoals.data,
    choreOffers: choreOffers.error ? [] : choreOffers.data,
    neighborJobs: neighborJobs.error ? [] : neighborJobs.data,
    balances: balances.data, family: family.data,
  });
}

export function subscribeFamilyRealtime(familyId, onChange) {
  const channel = supabase
    .channel(`family:${familyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chores", filter: `family_id=eq.${familyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "goals", filter: `family_id=eq.${familyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `family_id=eq.${familyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries", filter: `family_id=eq.${familyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts", filter: `family_id=eq.${familyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "homework_items", filter: `family_id=eq.${familyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "screentime_goals", filter: `family_id=eq.${familyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "chore_offers", filter: `family_id=eq.${familyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "neighbor_jobs", filter: `family_id=eq.${familyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "families", filter: `id=eq.${familyId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---- Schrijven: elke functie faalt stil naar de wachtrij, nooit blokkerend voor de UI ----
async function enqueue(op) {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue = raw ? JSON.parse(raw) : [];
  queue.push({ ...op, at: Date.now() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function run(table, action, payload) {
  try {
    let q = supabase.from(table);
    if (action === "insert") q = q.insert(payload);
    else if (action === "update") q = q.update(payload.values).match(payload.match);
    else if (action === "delete") q = q.delete().match(payload.match);
    const { error } = await q;
    if (error) throw error;
  } catch (e) {
    await enqueue({ table, action, payload });
  }
}

// Voor mutaties die geen gewone insert/update/delete zijn (bv. een atomaire delta via
// een Postgres-functie) — zelfde stille-wachtrij-garantie als run(), anders zou een
// offline RPC-aanroep voor altijd verloren gaan i.p.v. later alsnog te lukken.
async function runRpc(fn, args) {
  try {
    const { error } = await supabase.rpc(fn, args);
    if (error) throw error;
  } catch (e) {
    await enqueue({ type: "rpc", fn, args });
  }
}

export const push = {
  upsertChore: (familyId, chore) => run("chores", "insert", { family_id: familyId, ...chore }),
  updateChore: (id, values) => run("chores", "update", { values, match: { id } }),
  upsertGoal: (familyId, kidId, goal) => run("goals", "insert", { family_id: familyId, kid_id: kidId, ...goal }),
  updateGoal: (id, values) => run("goals", "update", { values, match: { id } }),
  addLedgerEntry: (familyId, entry) => run("ledger_entries", "insert", { family_id: familyId, ...entry }),
  addFeedPost: (familyId, post) => run("feed_posts", "insert", { family_id: familyId, ...post }),
  updateFeedPost: (id, values) => run("feed_posts", "update", { values, match: { id } }),
  upsertMember: (familyId, member) => run("members", "insert", { family_id: familyId, ...member }),
  updateMember: (id, values) => run("members", "update", { values, match: { id } }),
  upsertHomework: (familyId, item) => run("homework_items", "insert", { family_id: familyId, ...item }),
  updateHomework: (id, values) => run("homework_items", "update", { values, match: { id } }),
  updateFamily: (id, values) => run("families", "update", { values, match: { id } }),
  upsertScreenGoal: (familyId, kidId, goal) => run("screentime_goals", "insert", { family_id: familyId, kid_id: kidId, ...goal }),
  updateScreenGoal: (id, values) => run("screentime_goals", "update", { values, match: { id } }),
  adjustScreentime: (memberId, delta) => runRpc("adjust_screentime", { p_member_id: memberId, p_delta: delta }),
  upsertChoreOffer: (familyId, offer) => run("chore_offers", "insert", { family_id: familyId, ...offer }),
  decideChoreOffer: (offerId, decision) => runRpc("approve_chore_offer", { p_offer_id: offerId, p_decision: decision }),
  createNeighborJob: (familyId, job) => run("neighbor_jobs", "insert", { family_id: familyId, ...job }),
  checkinNeighborJob: (jobId, photoUri) => runRpc("checkin_neighbor_job", { p_job_id: jobId, p_photo_uri: photoUri }),
  checkoutNeighborJob: (jobId, photoUri) => runRpc("checkout_neighbor_job", { p_job_id: jobId, p_photo_uri: photoUri }),
  hostApproveNeighborJob: (jobId, decision) => runRpc("host_approve_neighbor_job", { p_job_id: jobId, p_decision: decision }),
  parentApproveNeighborJob: (jobId, decision) => runRpc("parent_approve_neighbor_job", { p_job_id: jobId, p_decision: decision }),
  mergeExternalEarnings: (childId) => runRpc("merge_external_earnings", { p_child_id: childId }),
};

export async function flushPendingWrites() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return;
  const queue = JSON.parse(raw);
  if (!queue.length) return;
  const remaining = [];
  for (const op of queue) {
    try {
      if (op.type === "rpc") {
        const { error } = await supabase.rpc(op.fn, op.args);
        if (error) throw error;
        continue;
      }
      let q = supabase.from(op.table);
      if (op.action === "insert") q = q.insert(op.payload);
      else if (op.action === "update") q = q.update(op.payload.values).match(op.payload.match);
      else if (op.action === "delete") q = q.delete().match(op.payload.match);
      const { error } = await q;
      if (error) throw error;
    } catch {
      remaining.push(op);
    }
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}
