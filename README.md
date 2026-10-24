# vouch.school

**Anonymous compliments from people at your school.** Students join their school, vote on 12 daily superlatives ("Most likely to build a unicorn startup 🦄") by tapping one of four classmates, and get an inbox of compliments. To unlock hints about *who* voted for them (gender → grade → first initial), they share a generated story card to Instagram. That card links back to `vouch.school/s/<code>`, which brings in new users.

- **Next.js 16** (App Router, Turbopack, `proxy.ts`) · **React 19** · **Tailwind CSS v4**
- **Supabase**: Postgres + RLS, Auth (email OTP), Storage (avatars)
- **Vercel**: Fluid Compute, region-pinned next to the database, dynamic OG/story images

---

## Table of contents

1. [How it works](#how-it-works)
2. [Repository structure](#repository-structure)
3. [Quick start (local)](#quick-start-local)
4. [Supabase setup: step by step](#supabase-setup-step-by-step)
5. [Security model and RLS](#security-model-and-rls)
6. [Deploy to Vercel](#deploy-to-vercel)
7. [Performance and caching](#performance-and-caching)
8. [The viral loop](#the-viral-loop)
9. [About "Log in with Instagram"](#about-log-in-with-instagram)
10. [Operations: adding schools and questions](#operations-adding-schools-and-questions)
11. [Scripts](#scripts)

---

## How it works

| Screen | Route | What happens |
| --- | --- | --- |
| Landing | `/` | Marketing page. Signed-in users are redirected to `/vote`. |
| Login | `/login` | Email → 6-digit OTP code (works inside Instagram's in-app browser). The emailed magic link works too. |
| Onboarding | `/onboarding` | Gamified 4 steps: pick school → claim `@instagram` + first name → grade + gender → optional photo. |
| Vote | `/vote` | One question + 4 random classmates in a 2×2 grid. Tap → vote recorded → next question appears (one round trip). Shuffle / Skip. Countdown when you're done for the day. |
| Inbox | `/inbox` | Trophies carousel (aggregate counts) + a feed: "A Junior guy voted you 'Best dressed'". Each item has a 🔒 **REVEAL** button. |
| Reveal modal | (sheet) | Renders your story card → **Share to Instagram Story** → hint unlocked via RPC. |
| Profile | `/me` | Avatar upload, edit @/name, stats, invite link (+50 aura per friend), log out, delete account. |
| Share landing | `/s/[code]` | Public page behind every story link. OG image, click tracking, "See who's voting for you" CTA (credits the referrer). |

---

## Repository structure

```
.
├── app/
│   ├── (app)/                    # authenticated + onboarded shell (bottom tab bar)
│   │   ├── layout.tsx            # guards: logged in → onboarded
│   │   ├── error.tsx
│   │   ├── vote/{page,loading}.tsx
│   │   ├── inbox/{page,loading}.tsx
│   │   └── me/page.tsx
│   ├── api/
│   │   ├── vote/route.ts         # hot path: cast_vote / skip_poll / get_next_round
│   │   └── og/poll/route.tsx     # 1080×1920 story + 1200×630 OG images
│   ├── auth/
│   │   ├── callback/route.ts     # PKCE code exchange
│   │   ├── confirm/route.ts      # token_hash verification (cross-browser magic links)
│   │   └── signout/route.ts
│   ├── login/page.tsx
│   ├── onboarding/page.tsx
│   ├── s/[code]/page.tsx         # share / invite landing
│   ├── page.tsx                  # landing
│   ├── layout.tsx · globals.css · manifest.ts · icon.svg · apple-icon.tsx
│   ├── robots.ts · sitemap.ts · not-found.tsx
├── components/
│   ├── auth/LoginForm.tsx
│   ├── onboarding/OnboardingFlow.tsx
│   ├── vote/VoteLoop.tsx
│   ├── inbox/{InboxFeed,RevealModal}.tsx
│   ├── me/{ProfileView,AvatarUploader}.tsx
│   └── ui/{Avatar,BottomNav,Countdown,InstagramIcon,Logo,SetupNotice,Toast}.tsx
├── lib/
│   ├── supabase/{client,server,proxy}.ts
│   ├── env.ts · session.ts · types.ts · format.ts · errors.ts
│   ├── emoji.ts · image.ts · haptics.ts · safe-next.ts · constants.ts
├── assets/
│   ├── fonts/Geist-{Black,Bold}.ttf   # for OG images
│   └── emoji/*.svg                    # bundled Twemoji (no CDN at render time)
├── supabase/
│   ├── migrations/20261024000000_vouch_init.sql   # schema, RLS, RPCs, storage
│   ├── seed.sql                                   # schools + question bank
│   └── templates/magic_link.html                  # OTP email template
├── scripts/
│   ├── test-db.mjs        # 83 security/behavior tests on real Postgres (PGlite)
│   ├── seed-demo.mjs      # fill "Vouch Demo High" with fake students
│   └── sync-emoji.mjs     # copy Twemoji SVGs used by questions
├── proxy.ts               # Next 16 Proxy (ex-middleware): session refresh + route gating
├── next.config.js         # caching headers, image optimization, file tracing
├── vercel.json            # Fluid Compute, region pin, function limits
└── .env.example
```

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local      # fill in your Supabase URL + publishable key
npm run test:db                 # optional: verify the schema & RLS on embedded Postgres
npm run dev                     # http://localhost:3000
```

Requirements: Node ≥ 20.9.

---

## Supabase setup: step by step

### 1. Create the project

Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). **Choose a region and remember it**, because Vercel must run in the same region (see [Deploy](#deploy-to-vercel)). `East US (N. Virginia)` pairs with Vercel's `iad1`.

### 2. Run the migration and seed

**Option A: SQL editor (no CLI).** Open **SQL Editor**, paste and run all of `supabase/migrations/20261024000000_vouch_init.sql`, then paste and run `supabase/seed.sql`.

**Option B: Supabase CLI.**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push                       # applies supabase/migrations/*
psql "$(npx supabase db url)" -f supabase/seed.sql   # or paste seed.sql in the SQL editor
```

The migration creates:

- tables `schools`, `profiles`, `question_bank`, `polls`, `votes`, `poll_skips`, `share_links`, `reveals`
- enums `reveal_type ('gender','grade','initial')`, `gender_identity`, `grade_level`, `poll_category`
- RLS policies on every table, column-level grants, and all RPCs
- a trigger that creates a `profiles` row for every new `auth.users` row
- the public `avatars` storage bucket and its policies

### 3. Configure Auth

**Authentication → Sign In / Providers → Email**

- ✅ Enable Email provider
- ✅ Confirm email: on
- Email OTP length: **6** (must match `OTP_LENGTH` in `components/auth/LoginForm.tsx`)
- Email OTP expiration: 3600s

**Authentication → URL Configuration**

- Site URL: `https://vouch.school`
- Redirect URLs (add all):
  - `https://vouch.school/**`
  - `https://*-<your-vercel-team>.vercel.app/**` (preview deployments)
  - `http://localhost:3000/**`

**Authentication → Emails → Templates.** Paste `supabase/templates/magic_link.html` into **both** "Magic Link" and "Confirm signup". It includes `{{ .Token }}` (the 6-digit code) and a token-hash link to `/auth/confirm`. The link works even when the email is opened in a different browser than the one that requested it, which matters for Instagram's in-app browser.

**Authentication → SMTP.** The built-in mailer is heavily rate-limited (a few emails per hour). Before launch, set up a custom SMTP provider (Resend, Postmark, SES) and raise **Rate Limits → emails per hour**.

**Optional, recommended: Project Settings → JWT Signing Keys → migrate to asymmetric keys.** `proxy.ts` uses `supabase.auth.getClaims()`, which verifies JWTs locally (no network hop) when asymmetric keys are on.

### 4. Get your keys

**Project Settings → API Keys**

| Env var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (or the legacy `anon` key, also accepted as `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | `sb_secret_…`. **Scripts only, never in the browser.** The app itself never uses it. |

### 5. Verify RLS (2 minutes)

Run these in the SQL editor. Each simulates a real signed-in student:

```sql
-- pretend to be a student (replace with a real auth.users id)
begin;
select set_config('request.jwt.claims', '{"sub":"<USER_UUID>","role":"authenticated"}', true);
set local role authenticated;

select * from public.votes;                 -- ERROR: permission denied  ✅ votes unreadable
select gender from public.profiles;         -- ERROR: permission denied  ✅ private column
select count(*) from public.profiles;       -- only your school          ✅ school isolation
select * from public.get_my_inbox();        -- your votes, no voter_id   ✅ anonymous
rollback;
```

Or run the automated suite against embedded Postgres: `npm run test:db` (83 checks).

### 6. (Optional) demo data

```bash
# .env.local needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY
npm run seed:demo                                   # 24 fake students at "Vouch Demo High"
# sign up yourself, onboard at Vouch Demo High, then:
npm run seed:demo -- --target you@example.com       # sends you 8 anonymous votes
```

---

## Security model and RLS

**Rule 1: votes are anonymous by construction, not by convention.**
`public.votes` has RLS enabled, **zero policies**, and every privilege revoked from `anon` and `authenticated`. No client can `select`, `insert`, `update` or `delete` a vote, not even their own. All access goes through `SECURITY DEFINER` functions that never return `voter_id`:

| RPC | Returns |
| --- | --- |
| `cast_vote(poll_id, nominee_id)` | validates (same school, poll open, not self, one per poll), records the vote, returns the **next round** |
| `get_my_inbox()` | votes you received: question, emoji, minute-truncated timestamp, unlocked hints. **No voter identity.** |
| `get_my_trophies()` | aggregate count per superlative |
| `get_nominee_vote_count(id)` | total count for a classmate (aggregate only) |
| `get_poll_results(poll_id)` | per-nominee counts, only after you've answered (no bandwagoning) |
| `unlock_reveal(code)` | the next hint tier, computed server-side from the voter's profile |

**Rule 2: everything is scoped to your school.**
`public.current_school_id()` (a `SECURITY DEFINER` helper, so policies don't recurse) backs the policies:

- `profiles`: you can read yourself plus onboarded classmates at your school
- `polls`: your school only
- `schools`: readable by any signed-in user (needed for the picker)
- `reveals`, `share_links`: owner only, and writes go through RPCs only

**Rule 3: column-level grants hide sensitive fields.** Classmates can read `id, instagram_handle, display_name, school_id, grade, avatar_url, vote_points`. `gender`, `invite_code`, `referred_by` and `inbox_seen_at` are owner-only via `get_my_profile()`. Users can update `display_name`, `instagram_handle` and `avatar_url` only. School, grade, gender and points are RPC-only, and **the school is locked once joined** so nobody can hop schools to snoop.

**Other hardening:**

- Schools with `domain_extension` (e.g. `wisc.edu`) require a matching auth email, subdomains included (`mail.wisc.edu`).
- `avatar_url` has a CHECK constraint that only allows `<your uid>/<file>` in our bucket. Arbitrary third-party URLs (tracking pixels, off-platform content) are rejected.
- Only the nominee earns points. Crediting voters would let classmates correlate point changes with incoming votes.
- Each share link unlocks at most one hint (`unique(share_link_id)`), and each vote has at most 3 hints.
- Every `SECURITY DEFINER` function pins `search_path = ''`. Execute is revoked from `public/anon/authenticated` and re-granted per function. Only `get_share_preview` and `track_share_click` are callable by `anon`.
- Never add `public.votes` to the `supabase_realtime` publication.
- Content is compliments-only: questions come from a curated `question_bank`, and there is no free text, DMs or comments.

---

## Deploy to Vercel

1. **Import** the repo at [vercel.com/new](https://vercel.com/new). The framework is auto-detected.
2. **Environment variables** (Production + Preview):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   NEXT_PUBLIC_SITE_URL=https://vouch.school
   ```
3. **Match regions.** Edit `vercel.json → "regions"` to the Vercel region closest to your Supabase region:

   | Supabase | Vercel |
   | --- | --- |
   | East US (N. Virginia) `us-east-1` | `iad1` *(default here)* |
   | East US (Ohio) `us-east-2` | `cle1` |
   | West US (N. California) `us-west-1` | `sfo1` |
   | West US (Oregon) `us-west-2` | `pdx1` |
   | Central EU (Frankfurt) | `fra1` |
   | West EU (London) | `lhr1` |
4. **Fluid Compute** is enabled via `"fluid": true`, so one warm instance serves many concurrent vote requests.
5. **Domain.** Add `vouch.school` (and `www.vouch.school` → redirect) under Project → Domains. Then update Supabase **Site URL** and **Redirect URLs** to match.
6. Deploy. 🚀

### Why there's no `runtime = 'edge'` on the voting loop

The spec asked for edge runtime on the voting hot path. **Next.js 16 deprecates the Edge Runtime** (`export const runtime = 'edge'`; see `node_modules/next/dist/docs/.../runtime.md`). For a database-bound loop it's also the slower choice: an edge function in Tokyo still has to cross the ocean to reach a database in Virginia on every vote. The setup here is what Vercel recommends today:

- **`proxy.ts`** (Next 16's replacement for middleware) runs in front of every page, refreshes the session cookie and does auth redirects with a local JWT check.
- **`/api/vote`** runs on Node.js with **Fluid Compute**, in the **same region as Postgres**. Each vote is exactly **one** SQL round trip: `cast_vote` validates, inserts and returns the next question and nominees in a single call.
- The client covers the remaining latency with a 420 ms "✓ voted" animation and preloads the next round's avatars.

---

## Performance and caching

| Asset | Strategy |
| --- | --- |
| `/_next/static/*` | content-hashed, `immutable` (Next/Vercel default) |
| `/_next/image` (avatars) | AVIF/WebP, `minimumCacheTTL` 30 days. Uploads are resized client-side to 512px JPEG (EXIF/GPS stripped). |
| `public/*` images and fonts | `max-age=86400, stale-while-revalidate=604800` (`next.config.js`) |
| `/api/og/poll` | `s-maxage=3600, stale-while-revalidate=86400` at the CDN. Fonts and emoji are read from disk once per instance (no CDN fetch at render). |
| `/api/vote` | `private, no-store` |
| Daily polls | Created lazily by the first request of the day per school, with deterministic ordering plus `ON CONFLICT DO NOTHING`, so concurrent first requests can't duplicate. No cron needed. |

Indexes: `votes(nominee_id, created_at desc)`, `votes(poll_id, nominee_id)`, `unique(poll_id, voter_id)`, `polls(school_id, active_until desc, sort_order)`, `profiles(school_id) where onboarded`, trigram index on `schools.name`.

---

## The viral loop

```
Inbox item ─► REVEAL ─► create_share_link(vote_id) ─► /api/og/poll?code=… (PNG pre-rendered into a File)
          ─► "Share to Instagram Story" ─► navigator.share({ files: [png] })  (link copied for the link sticker)
          ─► share resolves ─► unlock_reveal(code) ─► "It was a Sophomore guy"
Friend taps vouch.school/s/<code> ─► track_share_click ─► /login?ref=<code> ─► onboarding credits referrer +50
```

- The PNG is fetched **before** the tap, because iOS only allows `navigator.share()` during a user gesture.
- Browsers without file sharing (desktop, some in-app browsers) get a fallback: **Save card → post it → Copy link → "I posted it"**.
- Instagram has no web API to confirm that a story was posted, so the unlock happens when the share sheet completes. For a stricter gate, add `and v_link.clicks > 0` to `unlock_reveal`, which unlocks only after someone actually taps the link.
- Hints unlock progressively: **gender → grade → first initial** (`reveal_type` enum order). Each unlock needs a new share.

---

## About "Log in with Instagram"

Supabase Auth has **no Instagram provider**, and Meta shut down the Instagram Basic Display API (personal-account login) in December 2024. The remaining "Instagram API with Instagram Login" only supports Business/Creator accounts. So vouch uses:

- **Email OTP** as the login. Any email works, and school emails auto-verify the school (domain-locked schools *require* them).
- **Instagram handle claimed during onboarding** (unique, normalized). It's shown on vote cards and printed on share cards.

To make Instagram the primary identity later, the usual pattern is handle verification: show a one-time code, have the user DM it to `@vouch.school` (or put it in their bio), then confirm it via the Instagram Messaging API on a Business account.

---

## Operations: adding schools and questions

```sql
-- open school (typical high school)
insert into public.schools (name, city, timezone) values ('Bay View High School', 'Milwaukee, WI', 'America/Chicago');

-- college locked to its email domain
insert into public.schools (name, domain_extension, city, timezone)
values ('University of Minnesota', 'umn.edu', 'Minneapolis, MN', 'America/Chicago');

-- new question (positive only!)
insert into public.question_bank (question_text, category, emoji) values ('Best laugh in the hallway', 'funny', '😆');
-- then: node scripts/sync-emoji.mjs   (bundles the emoji for story cards)

-- retire a question
update public.question_bank set is_active = false where question_text = '…';
```

Polls drop at **local midnight** using `schools.timezone`. Each school gets 12 per day, and none repeat the previous day's questions.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server on `0.0.0.0:3000` |
| `npm run build` / `start` | production build / serve |
| `npm run lint` / `typecheck` | ESLint (flat config) / `tsc --noEmit` |
| `npm run test:db` | boots Postgres in WASM, applies migration + seed, runs 83 RLS/anonymity/flow tests |
| `npm run seed:demo` | creates demo students (needs `SUPABASE_SECRET_KEY`) |
| `node scripts/sync-emoji.mjs` | re-bundle Twemoji SVGs after adding questions |
| `/api/og/poll?demo=1` | (dev only) preview the story card with sample data |
