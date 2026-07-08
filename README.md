# Heitje voor een karweitje

*A pocket-money & chores app for families — turn housework into something kids actually want to do.*

**Heitje voor een karweitje** (Dutch idiom, roughly *"a quarter for a chore"*) is a family app where kids claim chores from an open pool, submit before/after photo proof, and earn real pocket money after a parent approves. Earnings go to free-to-spend balance or to a **savings goal** with a big product photo and progress display. A private family feed — reactions included — makes helping out feel like the social apps kids already love, but with zero algorithm and zero strangers.

> **Status: MVP test build.** All data is stored **locally on the device** (AsyncStorage). Multi-device sync via an EU-hosted Supabase backend is the next milestone — see [Roadmap](#roadmap).

## Features

- **Open chore pool** — parents post chores with a money amount; kids claim them first-come, first-served
- **Photo proof** — kids take real before/after photos with the camera; parents approve or reject (with a reason)
- **Real currency, no real payments** — balances are displayed in the family currency (€/£/$, configurable); parents pay out physically and register it in the app
- **Digital piggy bank** — savings goals with a photo and target amount; kids choose per approved chore: save or keep. New goals require parent approval, which also acts as the parental gate for shop links
- **Age-aware UI** — juniors (under 12) get bigger buttons, more emoji and a filling motivation bar (*Net begonnen → Lekker bezig! → Over de helft! → Bijna! → GEHAALD! 🎉*); teens (12–18) get a progress ring with percentages. Everyone sees real amounts
- **Private family feed** — approved chores appear as posts with photos and emoji reactions; goal completions become celebration posts. Chronological only, family only
- **Equal parents** — every parent can approve, manage and register payouts
- **Free-tier limits built in** — max 5 active chores and 1 savings goal per kid (the premium upsell points from the product plan)
- **Automatic dark mode** — follows the system setting

## Getting started

Prerequisites: [Node.js](https://nodejs.org/) 18+ and the free [Expo Go](https://expo.dev/go) app on your phone.

```bash
npm install
npx expo install --fix   # aligns native package versions with your Expo SDK
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). Pick a family member profile and start testing — the demo family (Emma 10, Daan 14, two parents) can be edited in `src/store.js`.

## Project structure

```
App.js               # screens, chore flow, approval, allocation, modals
src/theme.js         # design tokens (white/premium, violet accent), currency formatting
src/store.js         # seed data + AsyncStorage persistence
src/components.js    # Card, Btn, Ring, JuniorBar, PhotoBox, Confetti
app.json             # Expo config incl. camera permissions
```

## Tech stack

Expo SDK 53 · React Native · AsyncStorage · expo-image-picker · react-native-svg

## Roadmap

1. **EU-hosted backend** — Supabase (Frankfurt) with Row Level Security per family: real multi-device sync, family invite codes, photo storage
2. **Push notifications** — per-user configurable (new chores, approvals, reactions, daily reminder)
3. **Homework planner** — weekly agenda combining homework blocks and chores
4. **Monetization** — free with ads (parent accounts only, non-personalized in the EU) · Premium €0.99/month or €9.99 lifetime via RevenueCat
5. **Meal planning & shopping lists**, recurring room-maintenance schedules, family statistics

## Privacy by design

No accounts or e-mail addresses for kids, no tracking, no ads in kid views, photos never leave the family, shop links locked behind parent approval. The app never processes real money.

## License

MIT — see [LICENSE](LICENSE).
