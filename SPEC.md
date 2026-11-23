# Cricket Scorer — SPEC.md

> **Status:** APPROVED (with amendments) — Phase 2 next.
> **Date:** 2026-11-22

---

## 1  Overview

A mobile-first, offline-first cricket scoring PWA for casual weekend matches.
Scores are recorded on the phone, stored locally in IndexedDB, and pushed
one-way to a MongoDB Atlas backend when connectivity is available.

No auth, no ads, no professional-cricket features.  One repo, one deployable
service.

---

## 2  Tech Stack

| Layer | Choice |
|---|---|
| Client framework | React 18 + Vite |
| Styling | Tailwind CSS 3 |
| Offline DB | Dexie.js (IndexedDB) |
| PWA | vite-plugin-pwa (Workbox, precache app shell) |
| Server | Express 4 (Node ≥ 18) |
| Database | MongoDB Atlas via Mongoose 8 |
| Connection string | `MONGODB_URI` env var only — never hardcoded |
| Deploy target | Render free tier (single web service) |

No Firebase, no third-party backend, no signup/login, no extra cloud services.

---

## 3  Project Structure

```
cricket-scorer/
├── package.json                  # Root scripts, concurrently
├── .env.example                  # MONGODB_URI=mongodb+srv://...
├── .gitignore
├── README.md
├── SPEC.md
│
├── client/
│   ├── package.json              # "type": "module", React, Vite, Tailwind, Dexie
│   ├── index.html
│   ├── vite.config.js            # proxy /api → Express in dev
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   ├── manifest.json         # PWA manifest
│   │   └── icons/                # 192×192, 512×512
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css             # @tailwind directives
│       ├── engine/
│       │   ├── engine.js         # Pure scoring engine (zero framework deps)
│       │   ├── engine.test.js    # node:test unit tests
│       │   └── constants.js      # Enums, default rule presets
│       ├── db/
│       │   ├── db.js             # Dexie schema & singleton
│       │   └── operations.js     # CRUD helpers (players, matches, balls)
│       ├── sync/
│       │   └── sync.js           # Push logic, retry, backoff
│       ├── hooks/                # useMatch, usePlayers, useSync, etc.
│       ├── components/
│       │   ├── PlayerPool/       # Add/edit/list players
│       │   ├── MatchSetup/       # Configure & start a match
│       │   ├── Scoring/          # Live scoring screen
│       │   ├── MatchList/        # Resume / view past matches
│       │   └── common/           # Buttons, modals, badges
│       ├── pages/
│       │   ├── HomePage.jsx
│       │   ├── PlayersPage.jsx
│       │   ├── NewMatchPage.jsx
│       │   ├── ScoringPage.jsx
│       │   └── SummaryPage.jsx
│       └── utils/
│           ├── csv.js            # CSV export (scorecard + career)
│           └── helpers.js        # UUID, formatting, Levenshtein
│
└── server/
    ├── index.js                  # Express entry — serves API + built client
    ├── db.js                     # Mongoose connection
    ├── models/
    │   ├── Player.js
    │   ├── Match.js
    │   └── Ball.js
    ├── routes/
    │   ├── sync.js               # POST /api/sync/push
    │   └── health.js             # GET /api/health
    └── middleware/
        └── requireAdmin.js       # Placeholder: calls next()
```

### Dev / build scripts (root `package.json`)

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `concurrently "npm run dev:client" "npm run dev:server"` | Client on :5173, server on :3000 |
| `npm run dev:client` | `cd client && npx vite` | Vite dev server |
| `npm run dev:server` | `node --watch server/index.js` | Express with auto-reload |
| `npm run build` | `cd client && npm run build` | Produces `client/dist/` |
| `npm start` | `node server/index.js` | Production: Express serves dist + API |
| `npm test` | `node --test client/src/engine/*.test.js` | Engine unit tests |

Render config: **build** `npm install && cd client && npm install && npm run build`,
**start** `npm start`.

---

## 4  Data Models

### 4.1  Player

| Field | Type | Notes |
|---|---|---|
| `_id` | String (UUID) | Generated on client via `crypto.randomUUID()` |
| `name` | String | Trimmed, unique (case-insensitive) |
| `isGuest` | Number (0 \| 1) | `1` = excluded from career stats |
| `createdAt` | Date | |
| `updatedAt` | Date | |

Client-side only: `synced` (Number 0 \| 1, Dexie column).

> **Dexie rule:** Never index booleans. All flag fields stored as `0` / `1`
> in IndexedDB (`synced`, `isGuest`, `isDeleted`).  Mongoose schemas use
> `Boolean` on the server; the sync layer converts between the two.

**Duplicate prevention:** Before saving, lowercase-trim and reject exact matches.
Warn (but allow) when Levenshtein distance ≤ 2 to an existing name.

**Guest → permanent:** A "Make Permanent" action sets `isGuest = 0` and
marks the record unsynced (`synced = 0`) so the change is pushed.

### 4.2  Match

| Field | Type | Notes |
|---|---|---|
| `_id` | String (UUID) | Client-generated |
| `team1` | `{ name, playerIds: [UUID] }` | Ordered roster |
| `team2` | `{ name, playerIds: [UUID] }` | |
| `rules` | Object (see §5) | Frozen at match creation |
| `battingFirstTeamKey` | `'team1'` \| `'team2'` | |
| `status` | Enum | `setup` · `innings1` · `innings2` · `completed` · `abandoned` |
| `result` | Object \| null | `{ winner, margin, summary }` |
| `createdAt` | Date | |
| `updatedAt` | Date | |

Client-side only: `synced` (Number 0 | 1).

### 4.3  Ball / Event

Each entry is an immutable event.  The full match state is derived by
replaying all non-deleted events for a match in `sequence` order
(**event-sourced**).

Events come in two kinds: **delivery** (a ball bowled) and **swap** (manual
strike swap by the scorer).

| Field | Type | Notes |
|---|---|---|
| `_id` | String (UUID) | |
| `matchId` | String (UUID) | FK → Match |
| `innings` | 1 \| 2 | |
| `sequence` | Number | Auto-incrementing within (matchId, innings) |
| `type` | `'delivery'` \| `'swap'` | See below |
| `isDeleted` | Number (0 \| 1) | **Soft-delete for undo** (see §6.7) |
| `timestamp` | ISO String | |

**Delivery-only fields** (present when `type === 'delivery'`):

| Field | Type | Notes |
|---|---|---|
| `batsmanId` | String (UUID) | Striker at time of delivery |
| `nonStrikerId` | String (UUID) \| **null** | **null when in last-man mode** |
| `bowlerId` | String (UUID) | |
| `legal` | Boolean | `false` for wide / no-ball (when reBowled is true per rules) |
| `runsOffBat` | Number | Credited to batsman (always 0 for wide, bye, legbye) |
| `extraType` | `'none'` \| `'wide'` \| `'noball'` \| `'bye'` \| `'legbye'` | |
| `extraRuns` | Number | Penalty + any additional extra runs |
| `isFreeHit` | Boolean | Was this delivery a free-hit ball? |
| `wicket` | Object \| null | `{ type, playerOutId, fielderId? }` |

**Swap-only fields** (present when `type === 'swap'`):

| Field | Type | Notes |
|---|---|---|
| `batsmanId` | String (UUID) | Striker **before** the swap (for readability) |
| `nonStrikerId` | String (UUID) | Non-striker **before** the swap |

Client-side only: `synced` (Number 0 | 1).

> **`isDeleted` rationale:** Undo must never hard-delete a ball that has
> already been synced to the server.  Instead, undo sets `isDeleted = 1` and
> marks the record unsynced (`synced = 0`).  The next sync push upserts the
> updated record on the server, where it is also marked deleted.  The scoring
> engine and all Dexie queries **filter out** `isDeleted = 1` events.

**`nonStrikerId` is nullable:** This is the key schema-level support for the
last-man rule.  When only one batsman remains, `nonStrikerId` is recorded as
`null`, signalling last-man mode.

**`type: 'swap'`:** Manual strike swap is a first-class event stored in the
event list.  It is replayed by the engine (flips striker / non-striker) and
included in undo (undoing a swap reverses it).  This keeps the event log the
single source of truth and makes swap auditable.

---

## 5  Match Rules Configuration

All rules are set per match at setup time and stored inside the match document
so historical matches always preserve their own rules.

```js
rules: {
  oversPerInnings: Number,       // ≥ 1
  playersPerSide:  Number,       // ≥ 1

  wide: {
    runs:     Number,            // penalty runs (0, 1, or custom)
    reBowled: Boolean,           // default true
  },
  noBall: {
    runs:     Number,            // penalty runs (0, 1, or custom)
    reBowled: Boolean,           // default true
    freeHit:  Boolean,           // default false
  },
  byesEnabled:   Boolean,        // default true
  legByesEnabled: Boolean,       // default true

  lastManBatsAlone: Boolean,     // default true
}
```

### Defaults for the user's group

| Rule | Default |
|---|---|
| Wide penalty | **0 runs** |
| Wide re-bowled | **yes** |
| No-ball penalty | **0 runs** |
| No-ball re-bowled | **yes** |
| No-ball free hit | **no** |
| Byes | enabled |
| Leg-byes | enabled |
| Last man bats alone | **ON** |

The setup screen pre-fills these defaults but every value is editable.

---

## 6  Scoring Engine Design

### 6.1  Principles

- **Pure module** in `client/src/engine/engine.js` — zero React, zero Dexie,
  zero DOM dependencies.  Importable by both browser (via Vite) and
  `node --test`.
- **Event-sourced:** given `(matchRules, orderedNonDeletedEvents[])` → full
  current state.  No mutable singletons.  Totals are never stored; always
  derived.  Events with `isDeleted = 1` are excluded before replay.
- Exported as pure functions (not a class with hidden state).

### 6.2  Core function: `computeInningsState(rules, events, teamPlayerIds, bowlingPlayerIds)`

Takes the match rules, the ordered list of **non-deleted** events (both
`'delivery'` and `'swap'` types), the batting team player IDs, and the bowling
team player IDs.  Returns:

```js
{
  runs:           Number,
  wickets:        Number,
  legalBalls:     Number,       // completed legal deliveries
  oversText:      String,       // "3.4"
  currentOver:    Number,       // 0-indexed
  ballInOver:     Number,       // next ball (1-6, resets after legal 6)

  strikerId:      UUID,
  nonStrikerId:   UUID | null,  // null in last-man mode
  isLastManMode:  Boolean,

  currentBowlerId:  UUID | null, // set at over start
  previousBowlerId: UUID | null, // cannot bowl the next over (unless 1-player side)

  needBowlerSelection:  Boolean, // true when over just ended
  needBatsmanSelection: Boolean, // true when wicket just fell (not in last-man transition)
  isFreeHitNext:        Boolean,

  batsmanStats:  Map<UUID, { runs, balls, fours, sixes, isOut, dismissal }>,
  bowlerStats:   Map<UUID, { overs, legalBalls, runs, wickets, maidens, wides, noBalls }>,

  extras:        { wides, noBalls, byes, legByes, total },
  thisOverBalls: [ { description, chipClass } ],  // for the ball-chip display
  fallOfWickets: [ { wicketNum, runs, oversText, batsmanId } ],

  inningsStatus: 'live' | 'allOut' | 'oversComplete' | 'targetChased',

  // 2nd innings only:
  target:        Number | null,
  runsNeeded:    Number | null,
  ballsRemaining: Number | null,
  requiredRate:  Number | null,
  currentRunRate: Number,
}
```

### 6.3  Strike rotation rules

| Scenario | Action in normal mode | Action in last-man mode |
|---|---|---|
| Odd runs off bat (1, 3, 5) | Swap striker / non-striker | **No change** |
| Even runs off bat (0, 2, 4, 6) | No change | No change |
| End of over (6 legal balls) | Swap striker / non-striker | **No change** |
| Wide with 0 additional runs | No change | No change |
| Wide/NB with odd physical runs | Swap | **No change** |
| Bye / leg-bye with odd runs | Swap | **No change** |

In last-man mode, the lone batsman faces **every** delivery regardless.

### 6.4  Innings termination

| Condition | Rule |
|---|---|
| **All out (lastManBatsAlone ON)** | `wickets === playersPerSide` |
| **All out (lastManBatsAlone OFF)** | `wickets === playersPerSide - 1` |
| **Overs complete** | `legalBalls === oversPerInnings × 6` |
| **Target chased (2nd innings)** | `runs >= target` (innings ends immediately) |

### 6.5  Wicket types & bowler credit

| Type | Bowler gets credit? |
|---|---|
| Bowled | Yes |
| Caught | Yes |
| LBW | Yes |
| Stumped | Yes |
| Hit Wicket | Yes |
| Run Out | **No** |
| Retired Out | **No** |

> **No Retired Hurt.** Only "Retired Out" exists (counts as a wicket, bowler
> not credited).  "Retired Hurt" has been removed from the spec.

### 6.6  Free hit

When `rules.noBall.freeHit` is ON:

- The delivery immediately after a no-ball is a free hit.
- On a free hit, the only valid dismissal is **Run Out**.  The engine rejects
  other wicket types on free-hit deliveries.
- If the free-hit delivery is itself a wide or no-ball, the *next* delivery
  remains a free hit.
- Strike changes on a free hit follow normal rotation rules.

### 6.7  Undo (soft-delete)

Undo never hard-deletes records.  Instead:

1. Find the last event (highest `sequence` in the current innings) where
   `isDeleted = 0`.
2. Set `isDeleted = 1` and `synced = 0` on that record.
3. The UI re-runs `computeInningsState` on the remaining non-deleted events.

Because the event is kept in Dexie (and later upserted on the server with
`isDeleted: true`), already-synced balls are never lost — the server receives
the soft-delete flag on the next push.

The engine receives only non-deleted events, so state derivation is unchanged
and **always correct** — including across the last-man boundary: soft-deleting
the wicket event that triggered last-man mode causes the engine to re-derive
normal two-batsman state with the correct striker/non-striker.

Undoing a `'swap'` event works identically: set `isDeleted = 1`, re-derive.

Undo is unlimited (can go back to event 1) and in-order only.

**UI:** No confirmation dialog on any undo (including wicket undos).  Show a
brief "Undone" toast instead.

---

## 7  Last-Man-Batting Rule (complete specification)

### 7.1  Definition

There is **no joker**.  When `lastManBatsAlone` is ON and the number of
wickets fallen reaches `playersPerSide − 1`, the sole remaining batsman
continues batting **alone**.

### 7.2  State transitions

```
Normal mode                           Last-man mode
(≥ 2 batsmen remain)                  (exactly 1 batsman remains)
   │                                       │
   │── wicket falls ──────────────────────▶│  (when wickets = pps − 1)
   │                                       │
   │◀── undo that wicket ─────────────────│  (restores non-striker)
   │                                       │
   │                                       │── last man dismissed ──▶ ALL OUT
```

### 7.3  Mechanics in last-man mode

- `nonStrikerId` is `null`.  The lone batsman is always `strikerId`.
- **No strike rotation** — odd runs and end-of-over do nothing.
- Runs are credited to the batsman (or extras) normally.
- All dismissal types are valid (bowled, caught, LBW, run out, stumped, hit
  wicket).
- When dismissed: `wickets = playersPerSide` → innings ends (all out).

### 7.4  UI rules (strict)

| Element | Normal mode | Last-man mode |
|---|---|---|
| Striker row | ✅ shown, with `*` | ✅ shown, **no** `*` |
| Non-striker row | ✅ shown | ❌ **hidden** |
| Swap-strike button | ✅ shown | ❌ **hidden** |
| "Pick next batsman" prompt after wicket | ✅ shown | ❌ **skipped** |
| "Last Man Bats Alone" banner | — | ✅ **shown** |

### 7.5  Edge cases

| `playersPerSide` | Behaviour |
|---|---|
| **1** | Last-man mode from ball one (`0 wickets = 1 − 1`). Solo batsman, no non-striker, no rotation. 1 wicket ends innings. |
| **2** | Normal for ball one (2 batsmen). First wicket → last-man mode. 2nd wicket → all out. |
| **N** | Normal until `N − 1` wickets, then last-man. `N` wickets → all out. |

### 7.6  `lastManBatsAlone = false`

Standard cricket: innings ends at `playersPerSide − 1` wickets because two
batsmen are required.  The engine never enters last-man mode.

### 7.7  Bowling exception for 1-player sides

If the bowling side has only 1 player, that bowler is permitted to bowl
consecutive overs.  The "pick different bowler" constraint is waived.

---

## 8  UI Screens & Flows

### 8.1  Home page

- **New Match** button (→ Match Setup)
- **Resume Match** — list of in-progress matches, tap to continue scoring
- **Players** — manage the player pool
- **Match History** — completed matches with scorecards
- Sync status indicator (top-right)

### 8.2  Players page

- Searchable list of all players, tagged `Permanent` / `Guest`.
- **Add Player**: name input + permanent/guest toggle.
  - Duplicate check: exact case-insensitive match → blocked.
  - Similar name (Levenshtein ≤ 2) → warning dialog, user can proceed.
- **Quick-add guest** also available inline during match setup.
- **Make Permanent** button on each guest (one tap).
- No delete while the player appears in any match.

### 8.3  Match Setup page

1. Team names (free text, defaults "Team 1" / "Team 2").
2. Players per side (number input, ≥ 1).
3. Overs per innings (number input, ≥ 1).
4. Pick team 1 players from pool (multi-select list, exactly `playersPerSide`).
   Quick-add guest inline.
5. Pick team 2 players from pool (same).
6. Choose who bats first.
7. Rules section (pre-filled with group defaults, all editable):
   - Wide runs / re-bowled
   - No-ball runs / re-bowled / free hit
   - Byes / leg-byes enabled
   - Last Man Bats Alone toggle
8. **Start Match** → creates the Match + transitions to Scoring page.
   On start the scorer picks **opening striker, non-striker, and opening bowler**
   from the respective rosters.

### 8.4  Scoring page (most critical screen)

**Goal: faster than pen and paper.  One hand, full sunlight.**

#### Layout (top → bottom, mobile portrait)

```
┌──────────────────────────────────┐
│  Team Name         120/4  (12.3) │  ← score / wickets (overs)
│  RR: 9.73    Target: 156         │  ← run rate; target in 2nd inn.
├──────────────────────────────────┤
│  🏏  Striker*       45  (28)     │  ← name, runs (balls)
│      Non-striker    12  (15)     │  ← hidden in last-man mode
│  ⚾  Bowler         2-0-18-1     │  ← O-M-R-W
├──────────────────────────────────┤
│  This over: ● 1 W 2 •           │  ← ball chips
├──────────────────────────────────┤
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  │  0 │ │  1 │ │  2 │ │  3 │    │  ← run buttons (big)
│  └────┘ └────┘ └────┘ └────┘    │
│  ┌────────┐ ┌──────────────┐    │
│  │   4    │ │      6       │    │  ← boundary buttons (highlighted)
│  └────────┘ └──────────────┘    │
│  ┌──────┐ ┌──────┐ ┌────────┐  │
│  │ Wide │ │  NB  │ │  More  │  │  ← extra buttons
│  └──────┘ └──────┘ └────────┘  │
│  ┌──────────────┐ ┌──────────┐  │
│  │   WICKET 🔴  │ │   UNDO   │  │  ← action buttons
│  └──────────────┘ └──────────┘  │
│       ⇄ Swap Strike             │  ← hidden in last-man mode
└──────────────────────────────────┘
```

#### Interactions

| Action | Flow |
|---|---|
| **0–3, 4, 6** | One tap → ball recorded, state updates instantly |
| **Wide** | One tap → records wide + penalty. If additional runs taken (rare), use **More → Wide + N** |
| **No-ball** | One tap → records NB + penalty with 0 off bat. If runs off bat, use **More → NB + N** |
| **More** | Flyover panel: Bye, Leg-bye, 5 runs, Wide+N, NB+N |
| **Wicket** | Step 1: pick dismissal type. Step 2: pick fielder (if applicable). Step 3: pick next batsman from pool — **skipped** when entering last-man mode (nobody left) or when already in last-man mode (innings ends). |
| **Undo** | One tap → soft-deletes last event (`isDeleted = 1`), re-derives state. Shows "Undone" toast (no confirmation dialog, even for wickets). |
| **Swap Strike** | One tap → inserts a `type: 'swap'` event into the event list (auditable, undoable). Hidden in last-man mode. |
| **End of over** | Auto-detected after 6 legal balls → modal: pick next bowler (list, same bowler blocked). |
| **Innings end** | Auto-detected → summary screen → start 2nd innings (pick openers + bowler) or show match result. |

#### UX polish

- High-contrast dark theme, large touch targets (min 48px).
- Haptic feedback via `navigator.vibrate(10)` on button press (if supported).
- "Last Man Bats Alone" amber banner appears when last-man mode activates.
- 2nd innings shows: target, runs needed, balls remaining, required run rate.
- Resume: on app open, if a match is `innings1` or `innings2`, go straight to
  the Scoring page with full state restored from Dexie balls.

### 8.5  Match Summary page

- Full batting scorecard (name, dismissal description, R, B, 4s, 6s, SR).
- Full bowling scorecard (name, O, M, R, W, Econ).
- Extras breakdown, fall of wickets.
- Result banner.
- **Export CSV** button (works offline).
- **Make Permanent** button on any guest player in this match.

---

## 9  Offline Storage (Dexie / IndexedDB)

### 9.1  Schema

```js
db.version(1).stores({
  players: '_id, name, isGuest, updatedAt, synced',
  matches: '_id, status, updatedAt, synced',
  events:  '_id, matchId, innings, sequence, isDeleted, synced',
});
```

> **Index types:** `synced`, `isGuest`, and `isDeleted` are stored as `0` / `1`
> (Number), never Boolean.  Dexie does not reliably index booleans.

### 9.2  Guarantees

- **Everything works at zero network.**  No loading spinners for local data.
- Service worker (via vite-plugin-pwa, Workbox `precacheAndRoute`) caches the
  entire app shell on first visit.  Subsequent visits open instantly offline.
- IndexedDB operations are fast and synchronous from the UI perspective
  (Dexie returns promises, but they resolve from local storage).
- The `synced` flag is updated only after a successful server push response.
- All queries for active events filter `isDeleted = 0` (or omit deleted rows).

---

## 10  Server + MongoDB

### 10.1  Express setup (`server/index.js`)

```
1. Load .env (dotenv)
2. Connect Mongoose to MONGODB_URI
3. Mount routes:
   - GET  /api/health           → { status: 'ok', db: 'connected'|'disconnected' }
   - POST /api/sync/push        → (requireAdmin middleware) upsert players, matches, balls
4. Serve client/dist/ as static
5. SPA fallback: all other GET → client/dist/index.html
6. Listen on PORT (default 3000)
```

### 10.2  Mongoose models

Mirror the client models (§4) with the client-generated UUID as `_id`.

**Player:** `{ _id, name, isGuest, createdAt, updatedAt }`

**Match:** `{ _id, team1, team2, rules, battingFirstTeamKey, status, result, createdAt, updatedAt }`
  - `rules` is a free-form sub-document preserving the exact match rules
    including `lastManBatsAlone`.

**Ball:** `{ _id, matchId, innings, sequence, type, isDeleted, batsmanId, nonStrikerId, bowlerId, legal, runsOffBat, extraType, extraRuns, isFreeHit, wicket, timestamp }`
  - `nonStrikerId` explicitly accepts `null`.
  - `type` is `'delivery'` or `'swap'`.
  - `isDeleted` is `Boolean` (server-side).  The sync layer converts from
    client `0`/`1` to server `true`/`false`.

### 10.3  POST /api/sync/push

```
Request body (JSON, max 5 MB):
{
  players: [ PlayerDoc, ... ],
  matches: [ MatchDoc, ... ],
  events:  [ EventDoc, ... ]    // includes soft-deleted events (isDeleted: true)
}

Logic:
- For each player:  upsert by _id (updateOne with upsert:true)
- For each match:   upsert by _id
- For each event:   upsert by _id (soft-deleted events are upserted normally)
- All upserts are idempotent: re-pushing the same UUID never creates duplicates.

Response 200:
{
  accepted: { players: [id,...], matches: [id,...], events: [id,...] }
}

Error 400: validation failure (details in response body).
Error 500: DB error.
```

### 10.4  `requireAdmin` middleware

```js
// Placeholder — currently passes through.
// Auth can be added here later (PIN, token, etc.)
function requireAdmin(req, res, next) { next(); }
```

Applied to: `POST /api/sync/push` and any future write endpoints.

### 10.5  Validation & safety

- `express.json({ limit: '5mb' })` — reject oversized payloads.
- Validate array structure and required fields before upserting.
- Helmet for basic security headers (optional but recommended).
- No CORS needed (same origin).

---

## 11  Sync Behaviour (Client)

### 11.1  Trigger points

1. **App open** — push any unsynced records.
2. **`online` event** — push when connectivity is restored.
3. **After each ball is recorded** — debounced push (5-second delay) so data
   trickles to the server in near-real-time when online, without blocking
   scoring.

### 11.2  Push logic

```
1. Query Dexie: all records where synced === 0.
2. POST /api/sync/push with { players, matches, events }.
   (Includes soft-deleted events so the server learns about undos.)
3. On 200: mark each accepted id as synced (synced = 1) in Dexie.
4. On error: retry with exponential backoff (2s, 4s, 8s, … up to 60s).
5. Timeout: 60 seconds per request (Render cold-start tolerance).
6. Never block the scoring UI while syncing.
```

### 11.3  Status indicator

Small pill in the app header:

| State | Display |
|---|---|
| All synced | 🟢 "Synced" |
| N records pending | 🟡 "3 pending" |
| Offline / error | 🔴 "Offline" |

---

## 12  CSV Export

Works fully offline from local Dexie data.

### 12.1  Match scorecard CSV

Generated from the Summary page.  Sections:

1. **Match info:** teams, date, rules, result.
2. **1st innings batting:** Batsman, Dismissal, R, B, 4s, 6s, SR.
3. **1st innings bowling:** Bowler, O, M, R, W, Econ.
4. **1st innings extras & FOW.**
5. **2nd innings** — same layout.

### 12.2  Career stats CSV

Generated from the Players page.  One row per permanent player:

`Name, Matches, Innings, Runs, HS, Avg, SR, 100s, 50s, 4s, 6s, Overs, Mdns,
RunsConceded, Wkts, BBI, BowlAvg, Econ`

Stats are computed by replaying all Ball events for all completed matches,
excluding guest players.

### 12.3  Implementation

Use `Blob` + `URL.createObjectURL` + an `<a download>` link.  No server call
needed.

---

## 13  PWA Setup

| Requirement | Implementation |
|---|---|
| Installable | `manifest.json` with `name`, `short_name`, `icons`, `start_url`, `display: standalone`, `theme_color` |
| Offline | vite-plugin-pwa with Workbox `precacheAndRoute` for app shell (HTML, JS, CSS, icons) |
| Update | `prompt` strategy — show a "New version available" banner |
| Icons | 192×192 and 512×512 PNG |

---

## 14  What Is NOT Built

| Excluded | Why |
|---|---|
| Auth / PIN / admin panel | Later phase — `requireAdmin` placeholder is in place |
| Viewer / dashboard pages | Later phase |
| Pull sync (server → client) | One-way push only |
| DLS, wagon wheel, partnerships, commentary | Professional features, out of scope |
| Joker mode | Replaced entirely by last-man rule |
| Super over / tiebreaker | Not needed for casual |
| Maximum overs per bowler | Not enforced in casual matches |
| Multi-innings (Test format) | Only 2 innings (one per team) |

---

## 15  Assumptions & Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | **Retired Out only** | "Retired Out" is a wicket (counts as dismissal, bowler not credited). There is **no** "Retired Hurt" — it has been removed entirely. |
| 2 | **Batting order** | Free pick: scorer selects any available batsman when a wicket falls. No pre-set batting order. |
| 3 | **Runs off a wide** | All runs on a wide are extras (never credited to batsman). Strike swaps if odd physical runs taken (normal mode only). |
| 4 | **Runs off a no-ball** | Penalty runs → extras. Runs off bat → credited to batsman. If batsman doesn't hit it and runs are taken, those runs are recorded as no-ball extras (simplification: we don't split NB-penalty from NB-byes for casual cricket). |
| 5 | **Byes on a wide** | Not possible. A wide is a wide — any runs scored are wide extras. |
| 6 | **Run out in last-man mode** | Valid. The lone batsman can be run out (e.g. attempting a second run). Innings ends. |
| 7 | **Swap strike is an event** | Manual strike swap inserts a `type: 'swap'` event into the event list. The engine replays it (flips striker/non-striker). It is included in undo (soft-deleted like any other event). This keeps the event log the single source of truth. |
| 8 | **Overthrows** | Modelled as additional runs on the same delivery. The scorer taps the total runs scored (e.g. batsman runs 1 + 4 overthrows = tap 5 or use More → 5). |
| 9 | **Quick-add guest during match** | Available during match setup roster selection AND during "pick next batsman" prompt (adds to pool as guest, selects them). |
| 10 | **Tie** | If scores are level when the 2nd innings ends (all out or overs complete), result = "Match Tied". |
| 11 | **Strike rotation on wicket ball** | If runs were scored on the same delivery as a wicket (e.g. run out attempting 2nd run after completing 1 run), the completed runs are credited and strike position is derived from odd/even completed runs before the new batsman enters. |
| 12 | **Wide penalty = 0 and reBowled = true** | The ball is simply voided and re-bowled with no run penalty. It still appears in the event log (for undo) and shows as "Wd" in the over chips. |
| 13 | **End of innings transition** | Auto-triggered → summary overlay → scorer taps "Start 2nd Innings" → picks openers + bowler → scoring resumes. No manual "End Innings" button (but an "Abandon Match" option exists in the menu). |
| 14 | **Ball-in-over numbering** | Each legal ball increments `ballInOver` (1 through 6). Illegals don't increment it. The sequence counter always increments. `computeInningsState` derives `currentOver` and `ballInOver` from the legal ball count. |
| 15 | **Free hit on a wide** | If a free-hit delivery is a wide, the penalty (per rules) is applied, the ball is re-bowled, and the **next delivery is still a free hit**. |
| 16 | **Undo never hard-deletes** | Undo sets `isDeleted = 1` and `synced = 0`. The record stays in Dexie and syncs to the server as a normal upsert. The engine ignores `isDeleted = 1` events. |
| 17 | **Dexie flag encoding** | All indexed boolean-like fields (`synced`, `isGuest`, `isDeleted`) are stored as `0` / `1` (Number) in IndexedDB. Dexie does not reliably index booleans. The Mongoose server models use native `Boolean`; the sync layer converts. |

---

## 16  Build Phases

Each phase ends with a deliverable I can test.  I will **stop and wait for
approval** after each.

| Phase | Deliverable | Key files |
|---|---|---|
| ✅ **1 — SPEC.md** | This document | `SPEC.md` |
| **2 — Scoring engine + tests** | `engine.js` + passing `engine.test.js`, runnable with `npm test`. No UI. | `client/src/engine/*` |
| **3 — Full offline app** | Player pool + match setup + scoring screen + Dexie storage. Fully functional in airplane mode. | `client/` |
| **4 — Server + MongoDB** | Express + Mongoose + `POST /api/sync/push` tested against a real Atlas cluster. | `server/` |
| **5 — Client sync** | Sync logic + status indicator. Push works end-to-end. | `client/src/sync/` |
| **6 — Polish** | CSV export + PWA install polish (manifest, icons, service worker). | Throughout |

---

## 17  Engine Unit Test Plan (Phase 2)

The following test cases will be implemented in `client/src/engine/engine.test.js`:

### Normal batting
- Strike rotates on odd runs (1, 3, 5)
- Strike stays on even runs (0, 2, 4, 6)
- End of over swaps strike

### Swap event
- A `type: 'swap'` event flips striker and non-striker
- Swap after odd runs: compound rotation is correct
- Swap is rejected in last-man mode (engine throws)

### Extras variants
- Wide: penalty applied per rules, ball is re-bowled (not legal), no strike change
- Wide with 0 penalty (group default): ball voided, re-bowled, 0 runs added
- No-ball: penalty applied, ball re-bowled, runs off bat credited to batsman
- Bye: runs go to extras, strike swaps on odd
- Leg-bye: same as bye
- Extras disabled: bye/legbye buttons unavailable, engine rejects if extraType is bye/legbye

### Free hit
- Free hit set after a no-ball (when freeHit rule is ON)
- Only run-out is valid on free hit; other wickets rejected
- Free hit persists through another wide/NB

### Wickets
- Each dismissal type recorded correctly
- Bowler credited for bowled/caught/lbw/stumped/hit-wicket
- Bowler NOT credited for run-out/retired-out
- Next batsman replaces dismissed player at correct end

### Over & innings boundaries
- Over ends after 6 legal balls
- Previous bowler blocked from bowling next over
- Innings ends on overs complete
- Innings ends on all-out

### Last-man-batting rule
- Last-man mode triggers at `wickets = playersPerSide − 1`
- `nonStrikerId` becomes `null` in last-man mode
- **No strike rotation on odd runs** in last-man mode
- **No strike rotation at end of over** in last-man mode
- Last man dismissed → innings ends (all out at `playersPerSide` wickets)
- `lastManBatsAlone = false` → innings ends at `playersPerSide − 1` wickets
- Edge: `playersPerSide = 1` → last-man from ball one
- Edge: `playersPerSide = 2` → last-man after first wicket

### Undo (soft-delete)
- Undo sets `isDeleted = 1` on the last active event, state re-derived correctly
- Undo a **synced** event: `isDeleted = 1` + `synced = 0`, record stays in DB
- Undo across last-man boundary: **non-striker restored, rotation resumes**
- Undo a wicket: batsman un-dismissed, stats reverted, **no confirmation dialog** (toast only)
- Undo a swap event: swap is reversed, striker/non-striker restored
- Multiple sequential undos back to event 1

### Second innings
- Target calculated correctly (1st innings runs + 1)
- Innings ends immediately when target reached
- Required rate displayed correctly
- Tie when scores level at end of 2nd innings

---

*End of SPEC.md — awaiting approval to proceed to Phase 2 (scoring engine + unit tests).*
