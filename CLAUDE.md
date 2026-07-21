# CLAUDE.md — Project context for Claude Code

## What this is

**Heitje voor een karweitje** (working title) — a family chores & pocket-money app.
Kids claim chores from an open pool, submit before/after photo proof via the camera,
and earn pocket money after parent approval. Earnings go to free balance or a savings
goal. Private family feed with reactions. Expo (React Native) MVP test build with
local-only storage (AsyncStorage).

Owner: Wouter. Language of the product: Dutch first, English second (i18n planned).

## Run & test

```bash
npm install
npx expo install --fix
npx expo start        # scan QR with Expo Go
```

There is no test suite yet. Verify changes by running in Expo Go.

## Structure

- `App.js` — all screens, chore flow, approvals, allocation, modals
- `src/theme.js` — design tokens + `fmt()` currency formatting
- `src/store.js` — seed data (demo family) + AsyncStorage persistence
- `src/components.js` — Card, Btn, Chip, Ring, JuniorBar, PhotoBox, Confetti
- `assets/` — app-icoon (`icon.png`), Android adaptive (`adaptive-icon.png`), splash (`splash-icon.png`)
- `public/` — statische juridische pagina's (`privacy.html`, `voorwaarden.html`), meegekopieerd naar de web-build

## App store / store-readiness

- App-ID (bundle/package) = `nl.heitje.karweitje` (het oude `com.example.*` werd geweigerd).
- Icoon + splash staan in `assets/` (violet, bezem 🧹). Vervang gerust door eigen ontwerp.
- Privacybeleid + voorwaarden staan online via de web-build: `/privacy.html` en `/voorwaarden.html`;
  in de app gelinkt vanuit het Gezin-scherm (`LEGAL_BASE` in `App.js`).
- Kinderbescherming geldt app-breed (kinderen onder 12 gebruiken de app): geen tracking, geen
  advertenties bij kinderen, ouderlijke poort. UI verschilt per leeftijd (junior <12 / tiener 12–18).
- Native builds naar de stores vereisen EAS Build + betaalde developer-accounts (nog niet gedaan).

## Product rules (do not break these)

1. **Money**: all amounts are stored in **cents** (integers). Family currency symbol is
   configurable (€/£/$), formatted via `fmt()` in `src/theme.js`. The app NEVER processes
   real payments — balances are bookkeeping only; parents pay out physically and register it.
2. **Age-aware UI**: kids under 12 = "junior" (bigger buttons, more emoji, shorter Dutch
   copy, filling motivation bar with words: Net begonnen → Lekker bezig! → Over de helft! →
   Bijna! → GEHAALD! 🎉 — never percentages). Kids 12–18 = "teen" (progress ring WITH
   percentages). Everyone always sees real money amounts. Mode derives from `age` in
   `src/store.js` (parent override planned).
3. **Chore flow**: open pool → kid claims → work → submit for approval → parent approves
   (or rejects WITH a reason) → kid chooses: save (goal) or keep (free balance) → feed post
   + confetti. **Photos are OPTIONAL**: the kid may add before/after photos (camera only, no
   gallery) as proof, or finish without any photo at every stage. Feed posts without photos
   show a "klus afgerond zonder foto" note instead of the photo pair.
   **Conditions (voorwaarden)**: a parent can attach optional `conditions` to a chore when
   creating it: `{ note, checklist[], photoRequired, deadline }`. The kid must tick every
   checklist item before the "klaar" button appears (enforced, stored in `chore.checked`),
   and if `photoRequired` the no-photo path is hidden. `deadline` is shown as info (not
   auto-enforced). Parents also see the conditions read-only when approving.
4. **Savings goals**: require parent approval before any shop link becomes tappable
   (this is the parental gate). Goal reached = confetti + feed post + parent alert.
5. **Privacy**: no kid e-mail accounts, no tracking, no ads in kid views, photos stay in
   the family. Feed is chronological only — never add recommendation logic.
6. **Free-tier limits** (premium upsell points): max 1 active chore, 2 savings goals per
   kid (no photo cap in code). Premium: €1/month or €9.99 eenmalig (one-time), via RevenueCat
   at store launch — **no lifetime option**. Ads show only to adults (role `ouder`, age unknown
   or ≥16); never to under-16s or kids.
7. **Parents are equals**: every parent can approve, manage, and register payouts.
9. **Login / auto-login**: no real accounts yet. The welcome screen is the profile picker; the
   chosen profile is stored in `S.lastMe` and the app auto-opens to it on next launch (local,
   this device). Real "Sign in with Apple/Google" needs the backend + paid dev accounts (later).
   Home shows the current user's active chores (kid) and the to-approve list (parent) as full,
   actionable ChoreCards, plus stat tiles, quick action, savings goal, family strip and activity.
8. **Design**: white/premium, ONE accent color (violet #7C3AED), generous whitespace,
   radius 16–24, system fonts, automatic dark mode. Amounts are the largest element on
   their card. Energy comes from micro-interactions (confetti, streaks), not busy visuals.

## Roadmap (in order)

1. Supabase backend (EU region **Frankfurt** only) — Postgres + Auth + Realtime + Storage,
   Row Level Security on `family_id`; parent registers with e-mail (+ Sign in with Apple),
   kids join via family code/QR without e-mail.
2. Push notifications via Expo Notifications — per-user configurable.
3. Homework planner (weekly agenda, per-member colors).
4. Monetization: AdMob banners in PARENT views only (non-personalized in EU),
   RevenueCat for premium.
5. "Buurtklusjes" (v2.0, needs backend): invited externals do chores via a RESTRICTED
   guest profile (own chores + own earnings only — never the family feed/balances/photos);
   kid's own parent must approve each host up front; location = check-in/check-out
   moments only (no continuous tracking, visible only to the kid's own parents);
   DOUBLE approval (host + own parent); external earnings land in a separate
   "extern verdiend" pot that a parent merges into the balance. Friends and family
   18+ who join pay the same premium as the parents (€1/month or €9.99 eenmalig, the
   same way) — no separate add-on price.

## Conventions

- Keep Dutch UI copy; junior copy shorter and with more emoji than teen copy.
- New persistent fields: extend `DEFAULT_STATE` in `src/store.js` (merged on load).
- Prefer extending existing components over adding dependencies.
- Commit style: conventional commits (`feat:`, `fix:`, `docs:`), English messages.
