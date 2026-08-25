# Trøjesamlingen

Et privat, lukket katalog over min fodboldtrøjesamling, designet som en
webshop i stil med Como 1907's officielle shop — men **uden** priser, kurv
og betaling. Ren visning og katalogisering.

## Kom i gang

Åbn `index.html` direkte i en browser (dobbeltklik). Ingen installation,
ingen build, ingen server — samme princip som "Fælles Opsparing" i roden
af repoet.

## Adgangskode

Hele siten ligger bag ét fælles password-login (ingen brugerkonti):

> **\*Gunners2680** (stjernen er en del af koden)

Sæt kryds i "Husk mig på denne enhed" for at slippe for at taste koden
hver gang. "Log ud" i topmenuen låser igen.

Koden ligger kun som SHA-256-hash i koden. Skift den ved at køre

```bash
node -e "console.log(require('crypto').createHash('sha256').update('NY-KODE').digest('hex'))"
```

og indsætte resultatet i `PASS_HASH` øverst i `index.html`s script.
Bemærk: som i resten af repoet er et password i en ren statisk side en
simpel spærre, ikke rigtig sikkerhed — ægte beskyttelse kræver en backend.

## Sider

| Side | Indhold |
|------|---------|
| Login | Fælles adgangskode, valgfri "husk mig" |
| Forside | Hero-banner, statistik, filter-/sorteringslinje, produktgitter (evt. grupperet pr. klub som "kollektioner") |
| Detaljeside | Stort billede med miniature-karrusel, info-liste, badges, noter/historie |
| Administrér | Tilføj, redigér og slet trøjer via formular med billedupload — ingen kodeændringer nødvendige |

## Data pr. trøje

Klub · sæson · type (hjemme/ude/tredje/anden) · spillernavn og nummer ·
størrelse · autentisk/replica · signeret · flere billeder (forside,
bagside m.m.) · fritekstnoter.

Badges på kortene: **Autentisk** (mørkeblå), **Replica** (hvid),
**Signeret** (guld).

## Funktioner

- Fritekstsøgning + filtre på klub, sæson og type (også via topmenuen)
- Sortering: nyest/ældst tilføjet, klub (grupperet), sæson
- Statistik: antal trøjer, klubber, autentiske/replica, signerede samt
  fordeling pr. klub
- Kort skifter til billede nr. 2 ved hover (som en rigtig webshop)
- Responsivt design med burgermenu på mobil

## Datalagring — vigtigt

Trøjer og billeder gemmes i browserens **IndexedDB**, altså kun i den
browser og på den enhed, du sidder ved. Billeder komprimeres automatisk
(maks. 1600 px JPEG), så databasen ikke vokser unødigt.

Brug **Eksportér backup** på admin-siden jævnligt — det giver én
JSON-fil med alle trøjer *og* billeder. **Importér backup** på en anden
enhed flytter hele samlingen med — du vælger selv, om importen skal
*flettes* ind i det eksisterende (tilføj/opdatér) eller *erstatte* alt. Vil du have automatisk synkronisering mellem enheder, kræver
det en backend (fx Supabase, som beskrevet i rodens README).

## Design

Glas-æstetik inspireret af Apples Liquid Glass: hvert panel er baggrunds­sløring
plus mætning, et lag farvet glas, en lysere kant foroven og et diskret
spejlstrejf. **Glasset tones af trøjens klubfarve** — vælger du en Arsenal-trøje
bliver hele siden rød, en Brøndby-trøje gør den gul. Farven kommer fra en
indbygget klubtabel; ukendte klubber får en stabil tone udledt af navnet, og
hver enkelt trøje kan overstyre den med sit eget farvevalg i admin-formularen.

Typografi: **Bricolage Grotesque** til overskrifter, **Manrope** til brødtekst
og data (med tabulære tal). Lyst og mørkt tema følger systemet og kan skiftes
med ◐-knappen i topbjælken.

## Valg truffet

| Emne | Valg |
|------|------|
| Teknologi | Ren HTML/CSS/JS i én fil, ingen afhængigheder ud over webfonte |
| Datalagring | IndexedDB (trøjer + billed-blobs), backup via JSON-eksport/-import |
| Login | Fælles kode, SHA-256-hash, session- eller localStorage |
| Design | Liquid Glass: gennemfarvet glas pr. klub, flydende topbjælke, stablede hero-plader, 4:5-produktkort |
