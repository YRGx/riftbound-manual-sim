## Riftbound Manual Simulator (Baseline)

Manual-first tabletop client inspired by DuelingBook but tailored for Riftbound. Two authenticated Supabase users can create or join a room, manually move cards between zones, adjust life, and keep a synced log while spectators watch.

### Tech Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4 (using the `@tailwindcss/postcss` preset)
- Supabase Auth, Postgres, Realtime
- `@supabase/supabase-js` + `@supabase/ssr`

### Core Features

- Email/password auth with auto-created profiles
- Protected lobby with host/join/spectate controls
- Unique match codes, spectator toggle, placeholder 40-card decks
- Match state stored as JSONB, synced via Supabase Realtime
- Manual controls: draw, shuffle, mulligan, drag between zones, life +/- , end turn
- Match event log persisted in `match_events`

---

## Getting Started

### 1. Environment

Create `.env.local` with the Supabase credentials for your project:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The service role key is only used on server route handlers.

### 2. Install & Run

```bash
npm install
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000). You will be redirected to `/auth` for email/password login/creation.

---

## Database & Supabase

Apply the baseline schema in `supabase/migrations/0001_baseline.sql` using the Supabase SQL editor or your preferred migration runner. It creates:

- `profiles` (auto-filled via trigger on `auth.users`)
- `matches`
- `match_state`
- `match_events`

Row Level Security policies ensure:

- Only players (or any authenticated user if spectators are allowed) can read match info/state/logs
- Only service-role routes mutate matches/state/events (clients never write directly)

The stored JSON structure inside `match_state.state` matches:

```json
{
	"players": {
		"p1": { "id": "uuid", "life": 20, "zones": { "deck": [], "hand": [], "battlefield": [], "discard": [] } },
		"p2": { "id": "uuid", "life": 20, "zones": { "deck": [], "hand": [], "battlefield": [], "discard": [] } }
	},
	"turn": "p1",
	"phase": "main",
	"createdAt": "ISO_STRING"
}
```

Each new match seeds both decks with 40 placeholder cards (`Card 1`, `Card 2`, ...).

---

## Application Flow

1. **Auth (`/auth`)** – Client-side Supabase auth page with sign-in/sign-up toggle. Successful auth routes to `/lobby`.
2. **Lobby (`/lobby`)** – Server component ensures session, lists the user’s matches, and exposes client controls to host/join/spectate. Match creation/joining calls `/api/match/*` server routes.
3. **Match Room (`/match/[code]`)** – Server component preloads match, state, and recent events. Client component subscribes to Supabase Realtime for `match_state` + `match_events` and drives UI interactions (drag/drop, buttons). All mutations POST to `/api/match/[code]/action`.

---

## Deployment Notes

- Set the same env vars on the hosting platform (Vercel, Fly, etc.).
- Ensure Supabase Realtime is enabled for `match_state` and `match_events` tables.
- Consider locking down service-role routes further via rate limiting / middleware before production.

---

## Next Steps / Ideas

1. Chat panel + voice integration hooks for table talk.
2. Custom decks per profile (upload + save lists).
3. Granular permissions (allow temporary control over opponent cards).
4. Persistent log export + replay tooling.
5. Mobile-friendly layout + gestures.
