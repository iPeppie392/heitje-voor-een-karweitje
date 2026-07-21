# Heitje — Google Play Console publicatie-checklist

Voorbereid 2026-07-21. Eerst Android; iOS pas als Android loopt.
Build-config staat klaar (`eas.json` production-profiel + `app.json`: package
`nl.heitje.karweitje`, AdMob-plugin). Hieronder alles om de Console-stappen in te vullen.

> ⚠️ Verifieer de Data Safety- en content-antwoorden tegen de actuele code vóór je ze
> indient. Dit document is een opzet, geen juridisch advies.

## 1. Store listing (Nederlands) — plak in Play Console
- **App-naam:** Heitje voor een karweitje
- **Korte beschrijving (≤80 tekens):** Klusjes, zakgeld & schermtijd voor het hele gezin — geen reclame bij kinderen.
- **Volledige beschrijving (concept):**
  Heitje is de gezellige app waarmee het hele gezin klusjes deelt, zakgeld bijhoudt en
  schermtijd verdient. Kinderen pakken klusjes op, leveren foto-bewijs in en sparen voor
  een doel. Ouders keuren goed en betalen later echt uit. Huiswerk is dé manier om
  schermtijd (of zakgeld) te verdienen.

  • Eén gezin, gesynchroniseerd op elk toestel — familie en vrienden erbij in één scan
  • Nooit reclame bij kinderen (tot 16 jaar) — een klein blokje zien alleen ouders
  • Geen echt geld in de app; ouders betalen zelf uit
  • Privacy by design: gegevens op EU-servers, geen tracking bij kinderen

  Gratis te gebruiken. Reclame-vrij kan voor €1 per maand of €9,99 per jaar.
- **Categorie:** Gezin / Productiviteit (Lifestyle). **Content rating:** zie §4.
- **Privacybeleid-URL:** https://heitje-voor-een-karweitje-five.vercel.app/privacy.html

## 2. Doelgroep & Families-policy (belangrijkste!)
- **Target audience:** gemengd publiek (kinderen én volwassenen) → selecteer het
  **Families**-programma / "Designed for Families".
- **Reclame:** alleen bij volwassenen (rol ouder, leeftijd ≥16 of onbekend), nóóit bij
  kinderen <16. AdMob is een *self-certified Ads SDK* (toegestaan). Instellen op
  **niet-gepersonaliseerde** advertenties, contentrating max "G/PG".
- Zie Google Play [Families-policy](https://play.google.com/console/about/programs/families/).

## 3. Data Safety-formulier — antwoorden
Verzamelde gegevens (alles versleuteld via HTTPS/Supabase EU-Frankfurt; verwijderen op
verzoek via peppie392@gmail.com):
| Gegeven | Doel | Verplicht |
|---|---|---|
| E-mailadres (ouder) | Account/aanmelden | ja |
| Naam, avatar, leeftijd, klusjes, saldo's, doelen | App-functie (gezinsbeheer) | optioneel |
| Foto's (camera-only) | Bewijs van klusjes, binnen eigen gezin | optioneel |
| Push-notificatie-token | Herinneringen | optioneel |
| Apparaat-/advertentie-ID | AdMob (niet-gepersonaliseerd, alleen bij volwassenen) | ja bij ads |

- Geen verkoop van gegevens aan derden. Geen eigen analytics-SDK (verifieer).

## 4. Content Rating (IARC-vragenlijst)
- Geweld/sekse/schokking/woorden: **nee**.
- Gebruikersgeneratiecontent: **ja** (foto's + gezinsfeed) — maar **niet openbaar**,
  alleen binnen het eigen gezin.
- Deelfuncties: **ja** (QR-uitnodigingen binnen gezin).
- Verwachte rating: **Iedereen / 3+**.

## 5. Permissions — rechtvaardigen
- `CAMERA`: foto-bewijs bij klusjes.
- `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS`: via expo-camera/expo-audio (geluidseffecten) —
  geen opname-functie voor de gebruiker.
- Notificaties: klusjes- en goedkeuringsherinneringen.

## 6. Technische checks (voor het bouwen)
- Target API-niveau: stel in op het actueel vereiste niveau (EAS/huidige SDK — verifieer).
- 16KB page-size: Expo/EAS pakt dit mee; alleen relevant bij foutmeldingen.

## 7. Stappen met jouw login (volgorde)
1. **Bouw:** inloggen op Expo → `eas build --platform android --profile production`
   (= ondertekende `.aab`).
2. **Play Console:** app aanmaken → store listing (§1) → Data Safety (§3) → Content
   Rating (§4) → Target audience = Families gemengd (§2).
3. **AdMob:** account koppelen; app-ID staat al in de app (`app.json`).
4. **Indienen:** `.aab` uploaden (of `eas submit`).
5. **Gesloten test** met ±12 testers (vereist voor nieuwe accounts) → daarna productie.

## Verdienmodel (bevestigd)
Freemium: gratis (met kleine ad bij ouders) + Premium **€1/maand** of **€9,99/jaar**
(beide abonnement; geen eenmalig/levenslang). Commissie 15% onder $1M/jaar.
