# WHOOP MCP-server

En liten, avhengighetsfri **MCP-server** (Model Context Protocol) som gir en AI-assistent
(Claude Code, Claude Desktop, Cursor m.fl.) tilgang til dine **WHOOP**-data: søvn, recovery,
strain/sykluser, treningsøkter og profil. Bygget mot **WHOOP API v2**.

Serveren er skrevet i ren Node.js (ingen npm-avhengigheter) og snakker MCP over stdio.

## Verktøy som eksponeres

| Verktøy | Hva det henter |
|---|---|
| `whoop_get_recovery` | Recovery-score %, hvilepuls, HRV, SpO₂, hudtemperatur |
| `whoop_get_sleep` | Søvnlengde, søvnfaser, søvnytelse %, respirasjonsrate, søvnbehov |
| `whoop_get_sleep_by_id` | Én enkelt søvnøkt via id |
| `whoop_get_cycles` | Fysiologiske sykluser (dagsstrain, snittpuls, energi) |
| `whoop_get_recovery_for_cycle` | Recovery knyttet til en bestemt syklus |
| `whoop_get_workouts` | Treningsøkter (sport, strain, puls, distanse, energi) |
| `whoop_get_profile` | Grunnleggende brukerprofil |
| `whoop_get_body_measurement` | Høyde, vekt, maks puls |

Samlings-verktøyene støtter parametrene `limit` (1–25), `start`/`end` (ISO 8601) og `nextToken` (paginering).

## Oppsett (én gang)

### 1. Lag en WHOOP-utviklerapp

1. Gå til <https://developer.whoop.com> og logg inn med WHOOP-kontoen din.
2. Opprett en app (**Create App**). Velg scopes:
   `read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement offline`.
3. Legg til en **Redirect URI**: `http://localhost:8099/callback`.
4. Kopiér **Client ID** og **Client Secret**.

### 2. Sett credentials

Kopiér `.env.example` til `.env` og fyll inn:

```bash
cp .env.example .env
# rediger WHOOP_CLIENT_ID og WHOOP_CLIENT_SECRET
```

### 3. Autoriser (henter refresh-token)

Kjør autorisasjonshjelperen på en maskin med nettleser:

```bash
cd whoop-mcp
# last inn .env i miljøet, f.eks.:
export $(grep -v '^#' .env | xargs)
npm run auth
```

Åpne URL-en som skrives ut, godkjenn tilgang i WHOOP, og tokenene lagres i
`whoop-mcp/.tokens.json`. Refresh-tokenet skrives også ut, i tilfelle du vil bruke det
headless (som `WHOOP_REFRESH_TOKEN`).

> WHOOP roterer refresh-tokens: hver fornyelse gir et nytt token. Derfor foretrekkes
> `.tokens.json` — serveren skriver det roterte tokenet tilbake dit automatisk.

## Bruk med Claude Code

Dette repoet inneholder allerede en prosjekt-scoped `.mcp.json` i rota som registrerer
serveren. Claude Code spør om godkjenning første gang du åpner prosjektet. Sett disse
miljøvariablene der du starter Claude Code (eller som secrets i webmiljøet):

```bash
export WHOOP_CLIENT_ID=...
export WHOOP_CLIENT_SECRET=...
# valgfritt, for headless:
export WHOOP_REFRESH_TOKEN=...
```

Deretter kan du be assistenten om f.eks. «hent søvnen og recovery-en min for denne uka».

### Manuell registrering (andre MCP-klienter)

Claude Desktop / Cursor (`claude_desktop_config.json` e.l.):

```json
{
  "mcpServers": {
    "whoop": {
      "command": "node",
      "args": ["/absolutt/sti/til/personal_growth/whoop-mcp/src/server.js"],
      "env": {
        "WHOOP_CLIENT_ID": "din-client-id",
        "WHOOP_CLIENT_SECRET": "din-client-secret"
      }
    }
  }
}
```

## Røyktest

Uten credentials kan du bekrefte at protokollen svarer:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node src/server.js
```

Du skal se `initialize`-svaret og listen med åtte verktøy.

## Merk om skyøkter (Claude Code på web)

Claude Code-webøkter kjører i en midlertidig container: `.tokens.json` overlever **ikke**
mellom økter. For jevnlig bruk fra web, legg `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` og
`WHOOP_REFRESH_TOKEN` inn som miljø-secrets i miljøets innstillinger. For lokal bruk
(Claude Desktop / lokal Claude Code) er `.tokens.json` den enkleste og mest robuste veien,
fordi den håndterer token-rotasjon automatisk.

## Sikkerhet

`.env` og `.tokens.json` er git-ignorert og skal aldri committes. Tokenene gir lesetilgang
til dine WHOOP-helsedata — behandle dem som passord.
