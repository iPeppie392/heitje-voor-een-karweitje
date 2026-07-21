# Compliance-overzicht — Google "Designed for Families" & Apple

Bijgehouden logboek voor het Data-veiligheid-formulier in Google Play Console en het
App Privacy-formulier in App Store Connect. Laatst bijgewerkt: 2026-07-21.

## 1. Welke data verzamelen we, en van wie?

| Data | Van wie | Waarom | Opgeslagen? |
|---|---|---|---|
| Naam | Kind + ouder | Weergave in de app | Ja (Supabase, EU/Frankfurt) |
| Avatar (emoji) | Kind + ouder | Weergave | Ja |
| Leeftijd (geheel getal) | Kind | Junior/tiener-weergave bepalen | Ja — **geboortedatum zelf wordt nooit opgeslagen**, alleen de berekende leeftijd (zie `AddKidModal` in App.js) |
| E-mailadres + wachtwoord | Alleen ouder | Inloggen (Supabase Auth) | Ja, alleen voor ouders — kinderen hebben nooit een eigen account of e-mailadres |
| Foto's (voor/na klusje, spaardoel) | Kind of ouder | Bewijs van klusje / spaardoel-afbeelding | Ja, alleen binnen het eigen gezin, nooit gedeeld |
| Klusjes, saldo, spaardoelen | Gezin | Kernfunctie van de app | Ja |

**Nooit verzameld:** locatie, contacten, apparaat-ID's voor tracking/advertentie-profilering, browsegeschiedenis, biometrische data.

## 2. Delen met derden

Geen. Geen enkel dataveld wordt verkocht of gedeeld met derde partijen. Foto's en gegevens blijven binnen het eigen gezin (afgedwongen via Row Level Security op `family_id`, zie `sql/001_init.sql`).

Toekomstige uitzondering (nog niet actief): advertenties via Google AdMob ("Designed for Families"-gecertificeerd), alleen zichtbaar in **ouder**-weergaven, **niet-gepersonaliseerd** (`requestNonPersonalizedAdsOnly: true` in `src/AdSlot.js`) — nooit bij kinderen. Bij activeren route via het Families-advertentie-pool in Play Console.

**Ouder-poorten:** account aanmaken / gezin koppelen (`FamilySetup`) is afgeschermd met een ouder-poort (typ "OUDER") — een kind kan niet zomaar een e-mailadres/wachtwoord invoeren. Ook reset, sign-out, QR-delen, feedback en store-review zijn ouder-only.

## 3. Age gate

Bij het toevoegen van een kind (`AddKidModal`) wordt om een geboortedatum gevraagd, puur om eenmalig de leeftijd te berekenen. Die geboortedatum wordt na de berekening direct weggegooid — alleen het resultaat (leeftijd 0–17) wordt opgeslagen. Dit bepaalt de junior- (<12) of tiener-weergave (12–18).

## 4. Reclame — Child-Directed Treatment

- Reclame komt **nooit** voor bij kinderen tot 16 jaar (afgedwongen in code: `showAds = role === "ouder" && (M?.age == null || M.age >= 16) && !premiumUnlocked`, App.js).
- Zodra een echt advertentienetwerk gekoppeld wordt: Google AdMob via het "Designed for Families"-gecertificeerde netwerk, **niet-gepersonaliseerd** op alle aanvragen, met doelgroep in Play Console inclusief kinderen (Families-advertentie-pool).
- Niet-gepersonaliseerde advertenties in de EU (AVG/GDPR-vereiste).

## 5. Content & taalgebruik

Geen geweld, enge content, of expliciet taalgebruik — de hele app bestaat uit huishoudelijke klusjes en zakgeld. Geen door gebruikers gegenereerde open tekstvelden die misbruikt kunnen worden richting kinderen (feed-reacties zijn vaste emoji-knoppen, geen vrije tekst).

## 6. Techniek & bèta-testen

- Managed Expo-project (geen eigen `/android`/`/ios`-mappen tot een EAS-build); versienummers via `app.json`: `expo.version`, `expo.ios.buildNumber`, `expo.android.versionCode` — ophogen bij elke store-inzending.
- Voor een Android App Bundle (`.aab`) en een gesloten bèta-test (14-dagen-eis, min. 12 testers sinds dec. 2024) is een EAS Build + een echt Google Play Console-account nodig — dat kan alleen de app-eigenaar zelf opzetten.

## Nog te doen (vereist accounts die alleen de eigenaar kan aanmaken)

- [ ] Apple Developer-account + App Store Connect privacy-formulier invullen
- [ ] Google Play Console-account + "Designed for Families"-aanmelding + Data-veiligheid-formulier invullen (deze tabel als basis gebruiken)
- [ ] AdMob-account + Families-certificering, vóór reclame daadwerkelijk actief wordt
- [ ] EAS Build opzetten voor een echte `.aab`/`.ipa` en de gesloten bèta-testgroep
