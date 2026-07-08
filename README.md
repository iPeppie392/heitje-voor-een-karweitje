<div align="center">

# 🧹✨ Heitje voor een Karweitje

### _Klusjes doen wordt iets waar kinderen zin in krijgen._

**Een gezins-app voor huishoudelijke klusjes en zakgeld.**
Kinderen pakken een klusje uit de pot, maken een voor- en na-foto als bewijs,
en verdienen echt zakgeld zodra een ouder het goedkeurt.

<br>

![Status](https://img.shields.io/badge/status-MVP%20testbuild-F59E0B?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-1F2430?style=for-the-badge)
![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?style=for-the-badge&logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![License](https://img.shields.io/badge/license-MIT-16A34A?style=for-the-badge)

<br>

`Open klusjespot` · `Foto-bewijs` · `Ouder keurt goed` · `Echt zakgeld` · `Spaardoel` · `Privé gezinsfeed`

</div>

---

## 📖 Inhoud

- [Wat is dit?](#-wat-is-dit)
- [Hoe het werkt](#-hoe-het-werkt)
- [Functies](#-functies)
- [Zo ziet het eruit](#-zo-ziet-het-eruit)
- [Kleuren](#-kleuren)
- [Aan de slag](#-aan-de-slag)
- [Onder de motorkap](#-onder-de-motorkap)
- [De demo-familie](#-de-demo-familie)
- [Regels van het product](#-regels-van-het-product)
- [Routekaart](#-routekaart)
- [Privacy vooraan](#-privacy-vooraan)
- [Licentie](#-licentie)

---

## 🎯 Wat is dit?

**Heitje voor een karweitje** is een Nederlandse uitdrukking. Het betekent: _een kleine
beloning voor een klein klusje_. Deze app maakt daar een moderne gezins-app van.

Het idee is simpel:

> Ouders zetten klusjes met een bedrag in een open pot.
> Kinderen kiezen zelf een klusje, maken het af en bewijzen het met foto's.
> Na goedkeuring van een ouder verdienen ze echt zakgeld — vrij te besteden of te sparen voor een doel.

Een privé gezinsfeed met reacties maakt meehelpen leuk, zoals de social apps die kinderen
al kennen — maar **zonder algoritme en zonder vreemden**.

> [!NOTE]
> **Status: MVP-testbuild.** Alle gegevens staan **lokaal op het toestel** (AsyncStorage).
> Synchroniseren tussen meerdere apparaten via een EU-backend is de volgende mijlpaal — zie de [Routekaart](#-routekaart).

---

## 🔄 Hoe het werkt

De hele reis van een klusje, van pot tot zakgeld:

```mermaid
flowchart LR
    A([📋 Ouder zet<br/>klusje in de pot]) --> B([🙋 Kind claimt<br/>het klusje])
    B --> C([📸 Voor-foto<br/>camera])
    C --> D([🧹 Kind doet<br/>het klusje])
    D --> E([📸 Na-foto<br/>camera])
    E --> F{👩‍👧 Ouder<br/>keurt?}
    F -->|✅ Goedgekeurd| G([💶 Kind kiest:<br/>sparen of houden])
    F -->|❌ Afgekeurd<br/>met reden| B
    G --> H([🎉 Feed-post<br/>+ confetti])

    style A fill:#F1EDFB,stroke:#7C3AED,color:#1F2430
    style F fill:#EFEAFB,stroke:#7C3AED,color:#1F2430
    style G fill:#F1EDFB,stroke:#7C3AED,color:#1F2430
    style H fill:#EDE7FB,stroke:#16A34A,color:#1F2430
```

**In woorden:**

1. 📋 Een ouder plaatst een klusje met een bedrag.
2. 🙋 Een kind pakt het klusje. Wie eerst is, mag het doen.
3. 🧹 Kind doet het klusje.
4. 📸 Kind mag **optioneel** een voor- en na-foto maken als bewijs (alleen camera). Zonder foto afronden mag ook.
5. 👩‍👧 Een ouder keurt goed — of af, altijd **met reden**.
6. 💶 Bij goedkeuring kiest het kind: **sparen** voor een doel of **houden** als vrij saldo.
7. 🎉 Het klusje verschijnt in de gezinsfeed, met confetti.

---

## ✨ Functies

| | Functie | Wat het doet |
|:-:|---|---|
| 🗂️ | **Open klusjespot** | Ouders zetten klusjes met een bedrag klaar. Kinderen claimen ze, wie eerst komt. |
| 📸 | **Foto-bewijs (optioneel)** | Kind mag voor- en na-foto's met de camera toevoegen als bewijs, of het klusje zonder foto afronden. Ouder keurt goed of af (met reden). |
| 🏠 | **Home page voor iedereen** | De feed is een echte startpagina: begroeting, tegels met open klusjes en te keuren, snelknop, gezinsstrip en de gezinsactiviteit. |
| 💶 | **Echt geld, geen echte betaling** | Saldo in de gezinsvaluta (€/£/$). Ouder betaalt fysiek uit en boekt het in de app. |
| 🐷 | **Digitale spaarpot** | Spaardoel met foto en streefbedrag. Per klusje kiest het kind: sparen of houden. |
| 🧒 | **Leeftijd-slimme app** | Junioren (<12) krijgen grote knoppen, meer emoji en een motivatiebalk. Tieners (12–18) een voortgangsring met percentages. Iedereen ziet echt geld. |
| 📱 | **Privé gezinsfeed** | Goedgekeurde klusjes worden posts met foto's en emoji-reacties. Alleen chronologisch, alleen familie. |
| 👨‍👩‍👧 | **Ouders zijn gelijk** | Elke ouder kan goedkeuren, beheren en uitbetalingen boeken. |
| 🚦 | **Gratis-limieten ingebouwd** | Max 5 actieve klusjes en 1 spaardoel per kind (de premium-opstapjes). |
| 🌙 | **Automatische donkere modus** | Volgt de systeeminstelling van de telefoon. |

---

## 📱 Zo ziet het eruit

> Er zijn nog geen echte screenshots. Hieronder een schets van de belangrijkste schermen.
> Zet later echte afbeeldingen in de map `assets/` en vervang deze schetsen.

<table>
<tr>
<td width="33%" valign="top">

**Klusjespot**
```
┌─────────────────┐
│  Klusjes 🧹     │
├─────────────────┤
│ 🍽️ Vaatwasser   │
│    Keuken €1,50 │
│    [ Pak dit ]  │
├─────────────────┤
│ 🛁 Badkamer     │
│    €4,00        │
│    [ Pak dit ]  │
├─────────────────┤
│ 🧹 Stofzuigen   │
│    €2,50        │
└─────────────────┘
```

</td>
<td width="33%" valign="top">

**Junior-doel**
```
┌─────────────────┐
│ 🧱 LEGO kraan   │
│                 │
│  Lekker bezig!  │
│  ▓▓▓▓░░░░░░     │
│                 │
│  €12,50 / €49,99│
└─────────────────┘
```

</td>
<td width="33%" valign="top">

**Tiener-doel**
```
┌─────────────────┐
│ 🎮 Nintendo     │
│                 │
│      ╭───╮      │
│      │38%│      │
│      ╰───╯      │
│  €22,80 / €59,99│
└─────────────────┘
```

</td>
</tr>
</table>

De junior-balk vult met woorden, nooit percentages:
`Net begonnen` → `Lekker bezig!` → `Over de helft!` → `Bijna!` → `GEHAALD! 🎉`

---

## 🎨 Kleuren

Wit en premium, met **één** accentkleur: violet. Ruime witruimte, ronde hoeken (16–24),
systeemletters. Het bedrag is altijd het grootste op zijn kaart.

**Lichte modus**

![bg](https://img.shields.io/badge/achtergrond-F6F4FB-F6F4FB?style=flat-square&labelColor=E9E6F2)
![accent](https://img.shields.io/badge/accent-7C3AED-7C3AED?style=flat-square)
![groen](https://img.shields.io/badge/goed-16A34A-16A34A?style=flat-square)
![amber](https://img.shields.io/badge/wacht-F59E0B-F59E0B?style=flat-square)
![rood](https://img.shields.io/badge/fout-EF4444-EF4444?style=flat-square)

**Donkere modus**

![bg](https://img.shields.io/badge/achtergrond-121016-121016?style=flat-square&labelColor=2A2434)
![accent](https://img.shields.io/badge/accent-9F67FF-9F67FF?style=flat-square)
![groen](https://img.shields.io/badge/goed-4ADE80-4ADE80?style=flat-square)
![amber](https://img.shields.io/badge/wacht-FBBF24-FBBF24?style=flat-square)
![rood](https://img.shields.io/badge/fout-F87171-F87171?style=flat-square)

---

## 🚀 Aan de slag

**Nodig vooraf:** [Node.js](https://nodejs.org/) 18+ en de gratis [Expo Go](https://expo.dev/go)-app op je telefoon.

```bash
npm install
npx expo install --fix   # zet de native versies gelijk aan je Expo SDK
npx expo start
```

Scan de QR-code met **Expo Go** (Android) of de **Camera-app** (iOS).
Kies een gezinslid en begin met testen. De demo-familie pas je aan in `src/store.js`.

---

## 🧩 Onder de motorkap

```mermaid
flowchart TD
    App[App.js<br/>schermen · klusjesflow · goedkeuring · modals]
    App --> Theme[src/theme.js<br/>kleuren · fmt geld]
    App --> Store[src/store.js<br/>demo-data · AsyncStorage]
    App --> Comp[src/components.js<br/>Card · Btn · Ring · JuniorBar · PhotoBox · Confetti]

    style App fill:#F1EDFB,stroke:#7C3AED,color:#1F2430
    style Theme fill:#FFFFFF,stroke:#E9E6F2,color:#1F2430
    style Store fill:#FFFFFF,stroke:#E9E6F2,color:#1F2430
    style Comp fill:#FFFFFF,stroke:#E9E6F2,color:#1F2430
```

| Bestand | Verantwoordelijk voor |
|---|---|
| `App.js` | Alle schermen, de klusjesflow, goedkeuring, toewijzing en modals |
| `src/theme.js` | Ontwerp-tokens (wit/premium, violet accent) en geldopmaak via `fmt()` |
| `src/store.js` | Startgegevens (demo-familie) + opslag op het toestel (AsyncStorage) |
| `src/components.js` | Card, Btn, Ring, JuniorBar, PhotoBox, Confetti |
| `app.json` | Expo-configuratie incl. camera-toestemmingen |

**Techniek:** Expo SDK 54 · React Native 0.81 · AsyncStorage · expo-image-picker · react-native-svg

---

## 👨‍👩‍👧‍👦 De demo-familie

De app start met een voorbeeldgezin, zodat je meteen kunt testen:

| Wie | | Leeftijd | Rol | Modus |
|---|:-:|:-:|---|---|
| Emma | 🦊 | 10 | kind | junior (motivatiebalk) |
| Daan | 🚀 | 14 | kind | tiener (voortgangsring) |
| Papa | 😎 | 42 | ouder | beheer + goedkeuren |
| Mama | 🌷 | 41 | ouder | beheer + goedkeuren |

**Voorbeeld-spaardoelen:** Emma spaart voor een LEGO Technic kraan 🧱 (€49,99, goedgekeurd),
Daan voor een Nintendo-game 🎮 (€59,99, nog niet goedgekeurd).

---

## 📏 Regels van het product

Deze regels zijn de kern. Ze mogen niet breken:

1. 💶 **Geld** staat opgeslagen in **centen** (hele getallen). De app verwerkt **nooit** echte betalingen — saldo is alleen boekhouding.
2. 🔒 **Privacy**: geen e-mailaccounts voor kinderen, geen tracking, geen advertenties in kind-schermen, foto's blijven in het gezin.
3. 🧒 **Leeftijd-slim**: onder 12 = junior (grote knoppen, motivatiebalk met woorden). 12–18 = tiener (ring met percentages).
4. 🐷 **Spaardoel**: winkellinks werken pas nadat een ouder het doel heeft goedgekeurd. Dat is de ouderlijke poort.
5. 📱 **Feed** is alleen chronologisch — nooit aanbevelingslogica.
6. 👨‍👩‍👧 **Ouders zijn gelijk**: elke ouder kan goedkeuren, beheren en uitbetalen.

---

## 🗺️ Routekaart

| | Stap | Wat |
|:-:|---|---|
| ⬜ | **1. EU-backend** | Supabase (Frankfurt) met beveiliging per gezin: echte sync, gezins-uitnodigingscodes, foto-opslag |
| ⬜ | **2. Meldingen** | Per gebruiker instelbaar (nieuw klusje, goedkeuring, reactie, dagelijkse herinnering) |
| ⬜ | **3. Huiswerkplanner** | Weekagenda met huiswerk en klusjes samen |
| ⬜ | **4. Verdienmodel** | Gratis met advertenties (alleen ouder-schermen) · Premium €0,99/mnd of €9,99 eenmalig |
| ⬜ | **5. Meer** | Maaltijdplanning, boodschappenlijsten, terugkerende schema's, gezinsstatistieken |

---

## 🛡️ Privacy vooraan

Geen accounts of e-mailadressen voor kinderen. Geen tracking. Geen advertenties in
kind-schermen. Foto's verlaten nooit het gezin. Winkellinks zitten achter ouderlijke
goedkeuring. De app verwerkt nooit echt geld.

---

## 📄 Licentie

MIT — zie [LICENSE](LICENSE).

<div align="center">
<br>
gemaakt met hulp van Fox 🦊
</div>
