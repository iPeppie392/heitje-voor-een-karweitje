# CONTEXT.md — Projectcontext

Dit bestand geeft de volledige achtergrond van het project, voor mensen.
Het is het menselijke tegenhanger van `CLAUDE.md` (dat is voor Claude Code).

---

## 🎯 De visie

**Heitje voor een karweitje** maakt van huishoudelijke klusjes iets waar kinderen
zin in krijgen. Niet door straf of plicht, maar door eigenaarschap, bewijs en een
kleine echte beloning.

De kern in één zin:

> Kinderen pakken zelf klusjes uit een open pot, bewijzen het met foto's, en verdienen
> echt zakgeld na goedkeuring van een ouder — vrij te besteden of te sparen voor een doel.

---

## ❓ Het probleem

- Klusjes in huis voelen voor kinderen als een opgelegde plicht.
- Ouders moeten steeds herinneren, controleren en discussiëren.
- Zakgeld en klusjes zijn losgekoppeld; de link tussen inzet en beloning is vaag.
- Bestaande beloningsapps zijn vaak vol met tracking, advertenties of vreemden.

## 💡 De oplossing

- **Open pot**: kinderen kiezen zelf, dat geeft eigenaarschap.
- **Foto-bewijs**: voor- en na-foto's maken controle simpel en eerlijk.
- **Echte beloning**: het bedrag staat centraal, gekoppeld aan het klusje.
- **Spaardoel**: sparen voor iets tastbaars motiveert langer dan los saldo.
- **Privé feed**: het sociale plezier van meehelpen, zonder algoritme of vreemden.

---

## 👥 Voor wie

- **Kinderen 6–18 jaar**, opgesplitst in twee modi:
  - **Junior (<12)**: grote knoppen, veel emoji, korte tekst, motivatiebalk met woorden.
  - **Tiener (12–18)**: voortgangsring met percentages, rustiger taal.
- **Ouders**: zetten klusjes klaar, keuren goed of af, boeken uitbetalingen. Alle ouders zijn gelijk.

De app is **Nederlands-eerst**. Engels en verdere talen (i18n) komen later.

---

## 🔄 Hoe het werkt (de klusjesflow)

1. Ouder plaatst een klusje met titel, ruimte, emoji en bedrag → status `open`.
2. Kind claimt het klusje → status `geclaimd`, gekoppeld aan dat kind.
3. Kind doet het klusje. Foto's zijn **optioneel**: het kind mag een voor- en na-foto
   (alleen camera, geen galerij) toevoegen als bewijs, of zonder foto afronden.
4. Kind meldt het klusje klaar → status `wacht op goedkeuring`.
5. Ouder beoordeelt:
   - ✅ **Goedkeuren** → kind kiest: **sparen** (naar doel) of **houden** (vrij saldo).
   - ❌ **Afkeuren** → altijd **met reden**; klusje gaat terug.
6. Goedgekeurd klusje wordt een **feed-post** met confetti.

---

## 🧱 Architectuur

Expo (React Native) MVP-testbuild. Alle data staat **lokaal op het toestel** (AsyncStorage).
Er is nog geen backend en nog geen synchronisatie tussen apparaten.

```
App.js               schermen · klusjesflow · goedkeuring · toewijzing · modals
src/theme.js         ontwerp-tokens (wit/premium, violet accent) + fmt() geldopmaak
src/store.js         startgegevens (demo-familie) + AsyncStorage-opslag
src/components.js     Card · Btn · Chip · Ring · JuniorBar · PhotoBox · Confetti
app.json             Expo-config incl. camera-toestemmingen
```

**Techniek:** Expo SDK 54 · React Native 0.81 · AsyncStorage · expo-image-picker · react-native-svg

---

## 🗃️ Datamodel (hoofdlijnen)

Opgeslagen onder één sleutel in AsyncStorage. Nieuwe velden worden bij het laden samengevoegd
met `DEFAULT_STATE` (zie `src/store.js`).

| Onderdeel | Inhoud |
|---|---|
| `members` | Gezinsleden: naam, avatar (emoji), leeftijd, rol (`kind`/`ouder`), streak, kleur |
| `balances` | Vrij saldo per lid, in **centen** |
| `chores` | Klusjes: id, titel, ruimte, emoji, `cents`, `status`, door wie geclaimd, optionele `conditions` ({note, checklist[], photoRequired, deadline}) en `checked[]` (afvink-stand) |
| `goals` | Spaardoel per kind: naam, emoji, foto, `target`, `saved`, winkellink, `approved` |
| `feed` | Chronologische posts (goedgekeurde klusjes, behaalde doelen) |

> **Geld staat altijd in centen** (hele getallen). Opmaak via `fmt()` in `src/theme.js`.
> De valuta (€/£/$) is instelbaar. De app verwerkt **nooit** echte betalingen.

---

## 🎨 Ontwerpprincipes

- Wit en premium. **Eén** accentkleur: violet (`#7C3AED` licht, `#9F67FF` donker).
- Ruime witruimte, ronde hoeken (16–24), systeemletters.
- Automatische donkere modus (volgt de systeeminstelling).
- Het **bedrag** is het grootste element op zijn kaart.
- Energie komt uit micro-interacties (confetti, streaks), niet uit drukke beelden.

---

## 📏 Productregels (mogen niet breken)

1. **Geld** in centen; nooit echte betalingen — saldo is boekhouding.
2. **Privacy**: geen kind-e-mail, geen tracking, geen advertenties in kind-schermen, foto's blijven in het gezin.
3. **Leeftijd-slim**: junior <12 (motivatiebalk met woorden), tiener 12–18 (ring met percentages).
4. **Spaardoel**: winkellink werkt pas na goedkeuring ouder (de ouderlijke poort).
5. **Feed**: alleen chronologisch, nooit aanbevelingslogica.
6. **Gratis-limieten**: max 5 actieve klusjes, 1 spaardoel per kind, 10 bewijsfoto's per week.
7. **Ouders zijn gelijk**: elke ouder kan goedkeuren, beheren en uitbetalen.

---

## 🗺️ Routekaart (op volgorde)

1. **Supabase-backend** — EU-regio **Frankfurt**. Postgres + Auth + Realtime + Storage,
   beveiliging per `family_id`. Ouder registreert met e-mail (+ Sign in with Apple);
   kinderen doen mee via gezinscode/QR zonder e-mail.
2. **Push-meldingen** via Expo Notifications, per gebruiker instelbaar.
3. **Huiswerkplanner** — weekagenda, kleur per lid.
4. **Verdienmodel** — advertenties alleen in ouder-schermen (niet-gepersonaliseerd in de EU);
   premium via RevenueCat.
5. **Buurtklusjes** (v2.0, vereist backend) — genodigde externen klussen via een beperkt
   gastprofiel; dubbele goedkeuring (gastheer + eigen ouder); externe verdiensten in een
   aparte pot die een ouder samenvoegt.

---

## 🔐 Privacy vooraan

Geen accounts of e-mailadressen voor kinderen. Geen tracking. Geen advertenties in
kind-schermen. Foto's verlaten nooit het gezin. Winkellinks achter ouderlijke goedkeuring.
De app verwerkt nooit echt geld. De toekomstige backend staat uitsluitend in de EU.

---

## 🧑‍💻 Conventies voor bijdragen

- Nederlandse UI-tekst behouden; junior-tekst korter en met meer emoji dan tiener-tekst.
- Nieuwe blijvende velden: uitbreiden in `DEFAULT_STATE` (`src/store.js`).
- Liever bestaande componenten uitbreiden dan nieuwe afhankelijkheden toevoegen.
- Commit-stijl: conventional commits (`feat:`, `fix:`, `docs:`), Engelse berichten.

---

_Eigenaar: Wouter. Gemaakt met hulp van Fox 🦊_
