# Porto + Braga · 8.–11. oktober 2026

Mobilvenlig rejseguide til fem venner. Erstatter PDF-guiden. Statisk site: ingen build, ingen backend.

```
porto/
  index.html        skal
  style.css         design
  app.js            al logik (vanilla JS)
  trip.json         ALT indhold – ret her, ikke i koden
  assets/img/       de fire Wikimedia Commons-fotos (CC BY-SA)
  assets/fonts/     Fraunces + Inter (SIL OFL), selvhostet
  assets/vendor/    Leaflet 1.9.4 + Tesseract.js 6 (kvitteringsscanner, hentes kun ved brug)
  tools/encrypt-secret.mjs   krypterer navne + bookingreference
```

## Ret indhold

Åbn `trip.json` og ret teksten. Tider under `days[].items[]` har to felter:
`time` er det, der vises (fx `"15.45–16.45"`), og `start`/`end` (`"HH:MM"`, Porto-tid) bruges af "I dag"-visningen.

Kortmarkører ligger i `map.points` (lat/lng er omtrentlige; Maps-linket er det præcise).

## Adgangskode og følsomme oplysninger

Siden har en simpel adgangskode-skærm. Det er ikke rigtig sikkerhed, den holder bare tilfældige besøgende ude.
Fulde navne og bookingreference står **ikke** i klartekst nogen steder i repoet: de ligger krypteret i
`trip.json → secret` (AES-GCM, nøgle afledt af koden med PBKDF2). Koden er ikke skrevet i repoet.

Skift kode eller ret navne:

1. Opret `porto/secret.local.json` (ignoreres af git):
   ```json
   { "bookingRef": "…", "names": { "Claus": "…", "Anders": "…", "Patrick": "…", "Alexander": "…", "Daniel": "…" } }
   ```
2. Kør `node porto/tools/encrypt-secret.mjs NYKODE` (kræver Node 18+).
3. Commit `trip.json`. Koden er ikke versalfølsom.

## Lokal preview

`fetch` og Web Crypto virker ikke fra `file://`, så brug en lille server:

```sh
cd porto && python3 -m http.server 8000
# åbn http://localhost:8000
```

Test "I dag" med en falsk tid: `http://localhost:8000/?now=2026-10-09T16:00:00+01:00`

## Deploy

**GitHub Pages** (gratis):
1. Merge branchen til `main`.
2. GitHub → *Settings → Pages → Build and deployment*: Source = *Deploy from a branch*, Branch = `main`, mappe = `/ (root)`.
3. Efter et minut ligger guiden på `https://<brugernavn>.github.io/personal_growth/porto/`.

**Netlify** (alternativ): *Add new site → Deploy manually*, og træk mappen `porto/` ind. Eller forbind repoet og sæt *Publish directory* til `porto`.

## Licenser

- Fotos: Wikimedia Commons, CC BY-SA 3.0/4.0, kreditering vises ved hvert foto og i bunden af siden.
- Kort: © OpenStreetMap-bidragydere. Leaflet: BSD-2 (`assets/vendor/leaflet/LICENSE`).
- Skrifttyper: SIL Open Font License (`assets/fonts/`).
- Tesseract.js og tesseract.js-core: Apache 2.0 (`assets/vendor/tesseract/`). Engelsk sprogdata fra `@tesseract.js-data/eng`.
