#!/usr/bin/env node
/**
 * Database test-suite for vouch.school.
 *
 * Boots a real Postgres (PGlite / WASM — no Docker needed), stubs the small
 * part of Supabase that the migration depends on (auth schema, roles,
 * storage), applies the migration + seed, then exercises the security model
 * as real `anon` / `authenticated` users.
 *
 *   npm run test:db
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migration = readFileSync(join(root, 'supabase/migrations/20261024000000_vouch_init.sql'), 'utf8')
const seed = readFileSync(join(root, 'supabase/seed.sql'), 'utf8')

// Minimal stand-in for what Supabase provisions before your migrations run.
const SUPABASE_STUBS = /* sql */ `
  create schema if not exists extensions;
  create schema if not exists auth;
  create schema if not exists storage;

  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    created_at timestamptz default now()
  );

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;

  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
    name text, owner uuid
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;

  grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;

  -- Supabase's default privileges: new public objects are granted to the API roles.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

const db = await PGlite.create({ extensions: { pg_trgm } })

let passed = 0
let failed = 0
function ok(cond, name) {
  if (cond) {
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } else {
    failed++
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`)
  }
}
async function rejects(fn, pattern, name) {
  try {
    await fn()
    ok(false, `${name} (expected error matching ${pattern})`)
  } catch (e) {
    const matched = pattern.test(e.message)
    if (!matched) console.log(`      got: ${e.message}`)
    ok(matched, name)
  }
}

/** Run `fn` inside a transaction as a given role/user, like PostgREST does. */
async function as(user, fn) {
  return db.transaction(async (tx) => {
    if (user === 'anon') {
      await tx.exec(`set local role anon; select set_config('request.jwt.claim.sub', '', true); select set_config('request.jwt.claims', '{}', true);`)
    } else {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [
        user.id,
        JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' }),
      ])
      await tx.exec('set local role authenticated')
    }
    return fn(tx)
  })
}

console.log('\nvouch.school — database tests\n')

console.log('setup')
await db.exec(SUPABASE_STUBS)
await db.exec(migration)
ok(true, 'migration applied')
await db.exec(seed)
await db.exec(seed) // idempotent
const { rows: schoolRows } = await db.query(`select id, name from public.schools`)
const school = (n) => schoolRows.find((s) => s.name === n).id
ok(schoolRows.length >= 20, `seed is idempotent (${schoolRows.length} schools)`)
const { rows: qb } = await db.query(`select count(*)::int as n from public.question_bank`)
ok(qb[0].n >= 60, `question bank seeded (${qb[0].n} prompts)`)

const DEMO = school('Vouch Demo High')
const UWM = school('University of Wisconsin–Milwaukee')
const RUFUS = school('Rufus King International High School')

async function createUser(email) {
  const { rows } = await db.query(`insert into auth.users (email) values ($1) returning id, email`, [email])
  return rows[0]
}

const students = []
const roster = [
  ['ava@gmail.com', 'ava.k', 'Ava', 'junior', 'girl'],
  ['ben@gmail.com', 'ben_r', 'Ben', 'sophomore', 'guy'],
  ['cam@gmail.com', 'cam.lee', 'Cam', 'senior', 'nonbinary'],
  ['dev@gmail.com', 'dev.p', 'Dev', 'junior', 'guy'],
  ['eli@gmail.com', 'eli.w', 'Eli', 'freshman', 'girl'],
]
for (const [email, handle, name, grade, gender] of roster) {
  const u = await createUser(email)
  u.handle = handle
  u.name = name
  u.grade = grade
  u.gender = gender
  students.push(u)
}
const [ava, ben, cam, dev, eli] = students
const outsider = await createUser('olly@gmail.com')
const uwmStudent = await createUser('pat@uwm.edu')
const uwmSubdomain = await createUser('quinn@mail.uwm.edu')

console.log('\nauth trigger + onboarding')
{
  const { rows } = await db.query(`select count(*)::int as n from public.profiles`)
  ok(rows[0].n === 8, 'handle_new_user created a profile for every auth user')
}

for (const s of students) {
  await as(s, (tx) =>
    tx.query(`select public.complete_onboarding($1, $2, $3, $4, $5)`, [DEMO, '@' + s.handle.toUpperCase(), s.name, s.grade, s.gender]),
  )
}
{
  const { rows } = await db.query(`select instagram_handle from public.profiles where id = $1`, [ava.id])
  ok(rows[0].instagram_handle === 'ava.k', 'handles are normalized (strip @, lowercase)')
  const { rows: sc } = await db.query(`select student_count from public.schools where id = $1`, [DEMO])
  ok(sc[0].student_count === 5, 'student_count trigger counted 5 members')
}
await as(outsider, (tx) => tx.query(`select public.complete_onboarding($1, 'olly', 'Olly', 'junior', 'guy')`, [RUFUS]))

await rejects(
  () => as(outsider, (tx) => tx.query(`select public.complete_onboarding($1, 'olly', 'Olly', 'junior', 'guy')`, [DEMO])),
  /school_locked/,
  'school is locked once joined',
)
await rejects(
  () => as(outsider, (tx) => tx.query(`select public.complete_onboarding($1, 'ava.k', 'Olly', 'junior', 'guy')`, [RUFUS])),
  /instagram_handle_taken/,
  'instagram handles are unique',
)
await rejects(
  () => as(uwmStudent, (tx) => tx.query(`select public.complete_onboarding($1, 'pat', 'Pat', 'junior', 'guy')`, [school('Marquette University')])),
  /school_email_required/,
  'domain-locked school rejects non-matching email',
)
await rejects(
  () => as(uwmStudent, (tx) => tx.query(`select public.complete_onboarding($1, 'not a handle!', 'Pat', 'junior', 'guy')`, [UWM])),
  /invalid_instagram_handle/,
  'invalid handles rejected',
)
await as(uwmStudent, (tx) => tx.query(`select public.complete_onboarding($1, 'pat.uwm', 'Pat', 'grad', 'girl')`, [UWM]))
await as(uwmSubdomain, (tx) => tx.query(`select public.complete_onboarding($1, 'quinn', 'Quinn', 'senior', 'guy')`, [UWM]))
ok(true, 'matching school email (incl. subdomain mail.uwm.edu) can join')

{
  const res = await as(uwmStudent, (tx) =>
    tx.query(`select name, email_matches, requires_school_email from public.search_schools('')`),
  )
  ok(res.rows[0].name === 'University of Wisconsin–Milwaukee' && res.rows[0].email_matches, 'search_schools ranks email-matched school first')
  const res2 = await as(ava, (tx) => tx.query(`select name from public.search_schools('marq')`))
  ok(res2.rows.length >= 1 && res2.rows.every((r) => /marq/i.test(r.name)), 'search_schools filters by name')
}

console.log('\nRLS: school isolation + private columns')
{
  const res = await as(ava, (tx) => tx.query(`select id, school_id from public.profiles`))
  ok(res.rows.length === 5 && res.rows.every((r) => r.school_id === DEMO), 'students only see profiles at their own school')
  const res2 = await as(outsider, (tx) => tx.query(`select id from public.profiles`))
  ok(res2.rows.length === 1 && res2.rows[0].id === outsider.id, 'other-school student sees only themself')
  await rejects(() => as(ava, (tx) => tx.query(`select gender from public.profiles`)), /permission denied/, 'gender column is not readable by clients')
  await rejects(() => as(ava, (tx) => tx.query(`select * from public.profiles`)), /permission denied/, 'select * on profiles is denied (column grants)')
  await rejects(() => as(ava, (tx) => tx.query(`update public.profiles set vote_points = 999999 where id = $1`, [ava.id])), /permission denied/, 'cannot edit own vote_points')
  await rejects(() => as(ava, (tx) => tx.query(`update public.profiles set school_id = $2 where id = $1`, [ava.id, RUFUS])), /permission denied/, 'cannot change school directly')
  const upd = await as(ava, (tx) => tx.query(`update public.profiles set display_name = 'Ava K' where id = $1`, [ben.id]))
  ok(upd.affectedRows === 0, "cannot edit someone else's profile")
  const upd2 = await as(ava, (tx) => tx.query(`update public.profiles set display_name = 'Ava' where id = $1`, [ava.id]))
  ok(upd2.affectedRows === 1, 'can edit own display_name')
  await rejects(
    () => as(ava, (tx) => tx.query(`update public.profiles set avatar_url = 'https://evil.example/pixel.png' where id = $1`, [ava.id])),
    /profiles_avatar_own_folder/,
    'avatar_url cannot point at third-party hosts',
  )
  await as(ava, (tx) => tx.query(`update public.profiles set avatar_url = $2 where id = $1`, [ava.id, `${ava.id}/avatar-1.webp`]))
  ok(true, 'avatar_url accepts own storage path')
  const me = await as(ava, (tx) => tx.query(`select public.get_my_profile() as p`))
  ok(me.rows[0].p.gender === 'girl' && me.rows[0].p.invite_code?.length === 7, 'get_my_profile returns private fields to owner')
}

console.log('\nvoting loop')
let round = (await as(ava, (tx) => tx.query(`select public.get_next_round() as r`))).rows[0].r
ok(round.poll && round.poll.question_text, `get_next_round returned a poll: "${round.poll.question_text}"`)
ok(round.progress.total === 12 && round.progress.answered === 0, 'daily polls generated (12) lazily')
ok(round.nominees.length === 4 && round.nominees.every((n) => n.id !== ava.id), '4 nominees, never yourself')
ok(round.nominees.every((n) => !('gender' in n)), 'nominee payload excludes gender')
{
  // Concurrency/idempotency of daily generation
  await as(ben, (tx) => tx.query(`select public.get_next_round()`))
  const { rows } = await db.query(`select count(*)::int as n from public.polls where school_id = $1`, [DEMO])
  ok(rows[0].n === 12, 'repeat calls do not duplicate daily polls')
}
const firstPoll = round.poll.id
round = (await as(ava, (tx) => tx.query(`select public.cast_vote($1, $2) as r`, [firstPoll, ben.id]))).rows[0].r
ok(round.poll && round.poll.id !== firstPoll && round.progress.answered === 1, 'cast_vote returns the NEXT round in one round trip')
{
  const again = (await as(ava, (tx) => tx.query(`select public.cast_vote($1, $2) as r`, [firstPoll, cam.id]))).rows[0].r
  const { rows } = await db.query(`select nominee_id from public.votes where poll_id = $1 and voter_id = $2`, [firstPoll, ava.id])
  ok(rows.length === 1 && rows[0].nominee_id === ben.id && again.progress.answered === 1, 'double-voting is a no-op (one vote per poll)')
}
await rejects(() => as(ava, (tx) => tx.query(`select public.cast_vote($1, $2)`, [round.poll.id, ava.id])), /cannot_vote_for_self/, 'cannot vote for yourself')
await rejects(() => as(ava, (tx) => tx.query(`select public.cast_vote($1, $2)`, [round.poll.id, outsider.id])), /nominee_not_found/, 'cannot vote for another school')
await rejects(() => as(outsider, (tx) => tx.query(`select public.cast_vote($1, $2)`, [round.poll.id, ben.id])), /poll_not_found/, "cannot vote in another school's poll")
{
  const skipped = (await as(ava, (tx) => tx.query(`select public.skip_poll($1) as r`, [round.poll.id]))).rows[0].r
  ok(skipped.poll.id !== round.poll.id && skipped.progress.answered === 2, 'skip_poll advances the loop')
}
// More votes for Ben from several classmates
const benVoters = [cam, dev, eli]
for (const v of benVoters) {
  const r = (await as(v, (tx) => tx.query(`select public.get_next_round() as r`))).rows[0].r
  await as(v, (tx) => tx.query(`select public.cast_vote($1, $2)`, [r.poll.id, ben.id]))
}
{
  const { rows } = await db.query(`select vote_points from public.profiles where id = $1`, [ben.id])
  ok(rows[0].vote_points === 40, 'nominee earns points (+10/vote)')
  const { rows: v } = await db.query(`select vote_points from public.profiles where id = $1`, [cam.id])
  ok(v[0].vote_points === 0, 'voters earn nothing (no correlation leak)')
}

console.log('\nanonymity')
await rejects(() => as(ben, (tx) => tx.query(`select * from public.votes`)), /permission denied/, 'authenticated cannot SELECT votes')
await rejects(() => as(ben, (tx) => tx.query(`select voter_id from public.votes where nominee_id = $1`, [ben.id])), /permission denied/, 'cannot read voter_id even for own votes')
await rejects(() => as('anon', (tx) => tx.query(`select * from public.votes`)), /permission denied/, 'anon cannot SELECT votes')
await rejects(
  () => as(ben, (tx) => tx.query(`insert into public.votes (poll_id, voter_id, nominee_id) values ($1, $2, $3)`, [firstPoll, cam.id, ben.id])),
  /permission denied/,
  'cannot INSERT votes directly (no forging votes as others)',
)
await rejects(() => as(ben, (tx) => tx.query(`delete from public.votes`)), /permission denied/, 'cannot DELETE votes')
await rejects(() => as(ben, (tx) => tx.query(`select public.ensure_daily_polls($1)`, [DEMO])), /permission denied/, 'internal functions are not callable')
let inbox
{
  inbox = (await as(ben, (tx) => tx.query(`select * from public.get_my_inbox()`))).rows
  ok(inbox.length === 4, 'inbox lists 4 received votes')
  ok(inbox.every((r) => !('voter_id' in r) && !('nominee_id' in r)), 'inbox rows carry no voter identity')
  ok(inbox.every((r) => new Date(r.received_at).getSeconds() === 0), 'inbox timestamps truncated to the minute')
  ok(inbox.every((r) => r.next_reveal === 'gender' && Object.keys(r.hints).length === 0), 'hints locked by default')
  ok(inbox.every((r) => r.is_new), 'new votes are flagged unread')
  const cnt = (await as(ava, (tx) => tx.query(`select public.get_nominee_vote_count($1) as n`, [ben.id]))).rows[0].n
  ok(Number(cnt) === 4, 'aggregate vote count available to classmates')
  const cntOut = (await as(outsider, (tx) => tx.query(`select public.get_nominee_vote_count($1) as n`, [ben.id]))).rows[0].n
  ok(Number(cntOut) === 0, 'aggregate vote count hidden from other schools')
  const results = (await as(ava, (tx) => tx.query(`select * from public.get_poll_results($1)`, [firstPoll]))).rows
  ok(results.length === 1 && results[0].nominee_id === ben.id && Number(results[0].vote_count) >= 1 && !('voter_id' in results[0]), 'poll results are aggregates only')
  const early = (await as(ben, (tx) => // ben hasn't voted on anything yet
    tx.query(`select * from public.get_poll_results($1)`, [firstPoll]))).rows
  ok(early.length === 0, "poll results hidden until you've answered")
  const trophies = (await as(ben, (tx) => tx.query(`select * from public.get_my_trophies()`))).rows
  ok(trophies.length >= 1 && trophies.reduce((a, t) => a + Number(t.vote_count), 0) === 4, 'trophies aggregate counts')
  await as(ben, (tx) => tx.query(`select public.mark_inbox_seen()`))
  const after = (await as(ben, (tx) => tx.query(`select * from public.get_my_inbox()`))).rows
  ok(after.every((r) => !r.is_new), 'mark_inbox_seen clears unread')
}

console.log('\nviral loop: share links + reveals')
{
  const avaVote = inbox.find((r) => true) // most recent
  const target = (await db.query(`select voter_id from public.votes where id = $1`, [avaVote.vote_id])).rows[0].voter_id
  const voter = students.find((s) => s.id === target)

  await rejects(() => as(ava, (tx) => tx.query(`select public.create_share_link($1)`, [avaVote.vote_id])), /vote_not_found/, "cannot create a share link for someone else's vote")

  const code1 = (await as(ben, (tx) => tx.query(`select public.create_share_link($1) as c`, [avaVote.vote_id]))).rows[0].c
  const code1b = (await as(ben, (tx) => tx.query(`select public.create_share_link($1) as c`, [avaVote.vote_id]))).rows[0].c
  ok(/^[a-z0-9]{8}$/.test(code1) && code1 === code1b, 'share link created and reused until spent')

  const preview = (await as('anon', (tx) => tx.query(`select public.get_share_preview($1) as p`, [code1]))).rows[0].p
  ok(preview.kind === 'vote' && preview.school_name === 'Vouch Demo High' && preview.question_text, 'anon can load share preview (for /s/<code> + OG image)')
  ok(!JSON.stringify(preview).includes(voter.id) && !('voter_id' in preview), 'share preview leaks no voter identity')
  await as('anon', (tx) => tx.query(`select public.track_share_click($1)`, [code1]))
  const clicks = (await db.query(`select clicks from public.share_links where code = $1`, [code1])).rows[0].clicks
  ok(clicks === 1, 'anon click tracking works')
  await rejects(() => as('anon', (tx) => tx.query(`select public.get_my_inbox()`)), /permission denied/, 'anon cannot call authenticated RPCs')

  await rejects(() => as(ava, (tx) => tx.query(`select public.unlock_reveal($1)`, [code1])), /share_link_not_found/, "cannot spend someone else's share link")

  const r1 = (await as(ben, (tx) => tx.query(`select public.unlock_reveal($1) as r`, [code1]))).rows[0].r
  ok(r1.reveal_type === 'gender' && r1.hint_value === voter.gender && r1.next_reveal === 'grade', `1st share unlocks gender ("${r1.hint_value}")`)
  await rejects(() => as(ben, (tx) => tx.query(`select public.unlock_reveal($1)`, [code1])), /share_link_already_used/, 'a share link unlocks at most one hint')

  const code2 = (await as(ben, (tx) => tx.query(`select public.create_share_link($1) as c`, [avaVote.vote_id]))).rows[0].c
  ok(code2 !== code1, 'a fresh link is issued after one is spent')
  const r2 = (await as(ben, (tx) => tx.query(`select public.unlock_reveal($1) as r`, [code2]))).rows[0].r
  ok(r2.reveal_type === 'grade' && r2.hint_value === voter.grade, `2nd share unlocks grade ("${r2.hint_value}")`)
  const code3 = (await as(ben, (tx) => tx.query(`select public.create_share_link($1) as c`, [avaVote.vote_id]))).rows[0].c
  const r3 = (await as(ben, (tx) => tx.query(`select public.unlock_reveal($1) as r`, [code3]))).rows[0].r
  ok(r3.reveal_type === 'initial' && r3.hint_value === voter.name[0] && r3.next_reveal === null, `3rd share unlocks initial ("${r3.hint_value}")`)
  const code4 = (await as(ben, (tx) => tx.query(`select public.create_share_link($1) as c`, [avaVote.vote_id]))).rows[0].c
  await rejects(() => as(ben, (tx) => tx.query(`select public.unlock_reveal($1)`, [code4])), /all_hints_unlocked/, 'no more than 3 hints per vote')

  const row = (await as(ben, (tx) => tx.query(`select * from public.get_my_inbox()`))).rows.find((r) => r.vote_id === avaVote.vote_id)
  ok(row.hints.gender && row.hints.grade && row.hints.initial && row.next_reveal === null, 'inbox shows unlocked hints')
  const rv = (await as(ben, (tx) => tx.query(`select reveal_type from public.reveals`))).rows
  ok(rv.length === 3, 'owner can read own reveals')
  const rvOther = (await as(ava, (tx) => tx.query(`select * from public.reveals`))).rows
  ok(rvOther.length === 0, "cannot read other users' reveals")
  await rejects(
    () => as(ben, (tx) => tx.query(`insert into public.reveals (user_id, poll_id, vote_id, reveal_type, hint_value) values ($1, $2, $3, 'gender', 'x')`, [ben.id, firstPoll, avaVote.vote_id])),
    /permission denied/,
    'cannot forge reveals directly',
  )
}

console.log('\nreferrals')
{
  const benInvite = (await as(ben, (tx) => tx.query(`select public.create_share_link(null) as c`))).rows[0].c
  const before = (await db.query(`select vote_points from public.profiles where id = $1`, [ben.id])).rows[0].vote_points
  const newbie = await createUser('nia@gmail.com')
  await as(newbie, (tx) => tx.query(`select public.complete_onboarding($1, 'nia', 'Nia', 'freshman', 'girl', $2)`, [DEMO, benInvite]))
  const after = (await db.query(`select vote_points from public.profiles where id = $1`, [ben.id])).rows[0].vote_points
  ok(after === before + 50, 'referrer earns +50 when invitee onboards')
  await as(newbie, (tx) => tx.query(`select public.complete_onboarding($1, 'nia', 'Nia', 'freshman', 'girl', $2)`, [DEMO, benInvite]))
  const after2 = (await db.query(`select vote_points from public.profiles where id = $1`, [ben.id])).rows[0].vote_points
  ok(after2 === after, 'referral credit is only granted once')
  const invPrev = (await as('anon', (tx) => tx.query(`select public.get_share_preview($1) as p`, [benInvite]))).rows[0].p
  ok(invPrev.kind === 'invite' && invPrev.instagram_handle === 'ben_r', 'invite codes resolve on /s/<code>')
  const bad = (await as('anon', (tx) => tx.query(`select public.get_share_preview($1) as p`, ["x' or 1=1 --"]))).rows[0].p
  ok(bad === null, 'malformed codes return null')
}

console.log('\nstorage policies')
{
  await as(ava, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ava.id}/a.webp`]))
  ok(true, 'can upload into own avatar folder')
  await rejects(
    () => as(ava, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ben.id}/a.webp`])),
    /row-level security/,
    "cannot upload into someone else's folder",
  )
}

console.log('\nday rollover')
{
  // Expire today's polls and confirm the next call generates a fresh set.
  await db.query(`update public.polls set active_until = now() - interval '1 second', created_at = now() - interval '1 day', poll_date = poll_date - 1 where school_id = $1`, [DEMO])
  const r = (await as(ava, (tx) => tx.query(`select public.get_next_round() as r`))).rows[0].r
  const { rows } = await db.query(`select count(*)::int as n from public.polls where school_id = $1 and active_until > now()`, [DEMO])
  ok(r.poll && rows[0].n === 12 && r.progress.answered === 0, 'new day => fresh 12 polls, progress reset')
  const { rows: overlap } = await db.query(
    `select count(*)::int as n from public.polls a join public.polls b on a.question_id = b.question_id
     where a.school_id = $1 and b.school_id = $1 and a.poll_date = b.poll_date + 1`, [DEMO])
  ok(overlap[0].n === 0, "today's questions never repeat yesterday's")
  await rejects(() => as(ava, (tx) => tx.query(`select public.cast_vote($1, $2)`, [firstPoll, ben.id])), /poll_closed/, 'expired polls reject votes')
}

console.log('\naccount deletion')
{
  await as(eli, (tx) => tx.query(`select public.delete_my_account()`))
  const { rows } = await db.query(`select count(*)::int as n from public.profiles where id = $1`, [eli.id])
  const { rows: v } = await db.query(`select count(*)::int as n from public.votes where voter_id = $1`, [eli.id])
  const { rows: sc } = await db.query(`select student_count from public.schools where id = $1`, [DEMO])
  ok(rows[0].n === 0 && v[0].n === 0, 'delete_my_account cascades profile + votes')
  ok(sc[0].student_count === 5, 'student_count decremented on delete')
}

console.log('\nservice role (scripts / admin)')
{
  const r = await db.transaction(async (tx) => {
    await tx.exec('set local role service_role')
    await tx.query(`select public.ensure_daily_polls($1)`, [RUFUS])
    return tx.query(`select count(*)::int as n from public.votes`)
  })
  ok(r.rows[0].n > 0, 'service_role can read votes + call internal functions (seed script)')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
await db.close()
process.exit(failed ? 1 : 0)
