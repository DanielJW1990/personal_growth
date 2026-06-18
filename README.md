# Fælles Opsparing

En lille, selvstændig web-app til at følge en delt opsparingskonto mellem **Daniel** og **Cecilie**.

## Kom i gang

Åbn `index.html` direkte i en browser (dobbeltklik). Ingen installation, ingen build, ingen server.

## Adgangskode

Appen er låst med en talkode (PIN), der indtastes på et numerisk tastatur: **241021**.
Koden huskes for den aktuelle browser-session. Bemærk: en kode i en ren statisk side er
kun en simpel spærre, ikke rigtig sikkerhed — den kan omgås af nogen, der kender
browserens udviklerværktøjer. Vil du have ægte beskyttelse og delt login, kræver det en
backend (se nedenfor).

## Funktioner

- **Samlet saldo** og **ejerskabs-dashboard** med doughnut-diagram, beløb i DKK og procenter.
- Tre adskilte ejere: **Daniel**, **Cecilie** og **Fælles**. Hver ejer vises separat —
  fælles midler tæller ikke med i Daniels eller Cecilies eget ejerskab.
- Beløbsfeltet formaterer automatisk med tusindtalsadskiller, mens du skriver
  (fx `100000` bliver til `100.000`).
- **Indsæt / hæv** penge med beløb, ejer og dato. Hævninger gemmes som negative poster.
- **Transaktionshistorik** der kan ses, redigeres og slettes.
- **Renteprojektion** (3,39 % p.a., simpel rente af nuværende saldo): pr. år / måned / dag,
  fordelt mellem ejerne efter deres andel.
- Dansk sprog og dansk talformat (`57.510,18 kr.` — komma som decimaltegn, punktum som tusindtalsadskiller).

## Valg truffet

| Emne | Valg |
|------|------|
| Teknologi | Ren HTML/CSS/JS i én fil |
| Datalagring | `localStorage` (på denne enhed/browser) |
| Startsaldo | 57.510,18 kr., placeret som **Fælles** |
| Rente | Simpel rente af nuværende saldo, 3,39 % p.a. (tilskrives ikke automatisk — vises live) |

## Data og enheder

Data gemmes i browserens `localStorage`. Det betyder:

- Data ligger **kun på denne enhed og i denne browser**. Det deles ikke automatisk.
- Tøm browserdata / brug inkognito = data forsvinder. Brug "Nulstil alle data" for bevidst at starte forfra.

### Hvis Cecilie skal bruge appen på sin egen enhed med synkroniserede data

Så er `localStorage` ikke nok — der skal en backend til, der gemmer data centralt. De enkleste muligheder:

1. **Backend-as-a-service (anbefales — mindst arbejde):** fx **Firebase Firestore** eller **Supabase**.
   Gratis niveau er rigeligt til to brugere. Giver realtids-synk og login uden at man selv drifter en server.
2. **Lille egen API + database:** fx en Node/Express- eller serverless-funktion med SQLite/Postgres,
   hostet på fx Vercel, Fly.io eller Railway. Mere kontrol, men man skal selv vedligeholde det.
3. **Delt fil-synk (letteste hack):** gem JSON i en delt mappe (iCloud/Dropbox/Google Drive).
   Virker, men håndterer ikke samtidige ændringer godt.

Til to personer der deler én konto er **Firebase eller Supabase** klart det bedste forhold mellem indsats og resultat:
man tilføjer et SDK, erstatter `load()`/`save()` med kald til databasen og får synk + simpelt login med det samme.
