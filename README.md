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
| Datalagring | `localStorage`, eller **Supabase** når konfigureret (synk på tværs af enheder) |
| Startsaldo | 57.510,18 kr., placeret som **Fælles** |
| Rente | Simpel rente af nuværende saldo, 3,39 % p.a. (tilskrives ikke automatisk — vises live) |

## Datalagring og synkronisering

Appen har to tilstande, valgt automatisk:

- **Uden konfiguration:** data gemmes kun i browserens `localStorage` — altså kun på den
  enhed og browser, du sidder ved. Det deles ikke mellem enheder.
- **Med Supabase konfigureret:** data gemmes centralt i skyen og deles live mellem alle
  enheder (Daniel og Cecilie ser de samme tal). `localStorage` bruges så som lokal cache.

### Slå synkronisering til (Supabase — gratis)

1. Opret en gratis konto på **https://supabase.com** og lav et nyt projekt
   (vælg en europæisk region, fx *Frankfurt*; gem databasekoden et sikkert sted).
2. Når projektet er klar: åbn **SQL Editor** og kør:

   ```sql
   create table if not exists public.transactions (
     id     text primary key,
     amount numeric not null,
     owner  text not null,
     note   text default '',
     date   timestamptz not null,
     seed   boolean default false
   );

   alter table public.transactions enable row level security;

   -- Åben læse/skrive-adgang for den offentlige anon-nøgle.
   create policy "anon all" on public.transactions
     for all to anon using (true) with check (true);

   -- Live-opdatering på tværs af enheder
   alter publication supabase_realtime add table public.transactions;
   ```

3. Gå til **Project Settings → API** og kopiér **Project URL** og **anon public**-nøglen.
4. Indsæt de to værdier øverst i `index.html` i `SUPABASE_URL` og `SUPABASE_ANON_KEY`
   (eller send dem til udvikleren, som indsætter dem). Push, og begge enheder synkroniserer.

En lille statuslinje under titlen viser “☁︎ Synkroniseret”, når skyen er forbundet.

### Sikkerhed — vigtigt

Med opsætningen ovenfor er `anon`-nøglen indlejret i den offentlige side, og adgangs­politikken
tillader læsning/skrivning for alle med nøglen. PIN-koden i appen er kun en simpel spærre.
Det er en praktisk afvejning for et lille privat værktøj til to personer — men det er **ikke**
ægte, individuel adgangskontrol. Vil I have rigtig beskyttelse (kun jer to, med login), kræver
det **Supabase Auth** (e-mail-login) plus strammere row-level-security-politikker.
