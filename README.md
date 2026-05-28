# Frak'n Frak'r

Standalone browser game. Three.js voxel asteroid mining.

## Run locally

```bash
npm install
npm run dev        # iterate at http://localhost:3000
npm run build      # produce static export in ./out
npm run serve      # serve ./out at http://localhost:3000
```

## Ship to itch.io

1. `npm run build`
2. Zip the **contents** of `./out` (not the folder itself — `index.html` must be at the root of the zip).
3. On itch.io: create a new project, set kind = "HTML", upload the zip, check "This file will be played in the browser".
4. Set the embed viewport (e.g. 1280×720) and tick "Mobile friendly" if you want it playable on phones.

Saves live in `localStorage`. The optional global leaderboard uses Supabase (see below).

## Optional: online leaderboard (Supabase)

The game ships with a fully-functional local leaderboard out of the box. To layer
a global online board on top of it, create a Supabase project, run the SQL
below, and wire the env vars.

### 1. Create the table + policies

In the Supabase SQL editor for your project, run:

```sql
-- Initials are 3 uppercase alphanumeric chars (we pad with '-' if shorter).
create table public.leaderboard_entries (
  id         uuid        primary key default gen_random_uuid(),
  initials   text        not null,
  score      integer     not null,
  created_at timestamptz not null default now(),
  constraint initials_shape check (char_length(initials) = 3
                                   and initials ~ '^[A-Z0-9-]{3}$'),
  constraint score_nonneg check (score >= 0),
  -- Loose sanity ceiling; raise once you confirm legit scores climb past it.
  constraint score_sane check (score <= 10000000)
);

-- Sort/query index for "top N" reads.
create index leaderboard_entries_score_idx
  on public.leaderboard_entries (score desc, created_at asc);

-- Row Level Security: public read, public insert, no update, no delete.
alter table public.leaderboard_entries enable row level security;

create policy "Anyone can read the board"
  on public.leaderboard_entries for select
  using (true);

create policy "Anyone can insert a row"
  on public.leaderboard_entries for insert
  with check (
    score >= 0
    and score <= 10000000
    and char_length(initials) = 3
    and initials ~ '^[A-Z0-9-]{3}$'
  );
```

The anon key is safe to ship in the client bundle — RLS is what actually
protects the table.

### 2. Wire the env vars

Create `.env.local` at the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

Then restart `npm run dev`. The Leaderboards menu will show a `GLOBAL / LOCAL`
tab bar and end-of-run will post to both.

If those vars are unset (or the network is unreachable), the game silently
falls back to the local-only board — no error, no broken UI.

### 3. Local Erase Data does not touch the server

The "Erase All Data" option on the main menu wipes `localStorage` only. Global
leaderboard rows are server-side and unaffected. Manage them in the Supabase
dashboard if you need to prune entries.
