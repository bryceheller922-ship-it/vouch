#!/usr/bin/env node
/**
 * Fill "Vouch Demo High" with fake students so you can try the voting loop and
 * inbox on a fresh project.
 *
 *   npm run seed:demo                                  # 24 demo students
 *   npm run seed:demo -- --count 40
 *   npm run seed:demo -- --target you@example.com      # + send you ~8 votes
 *
 * `--target` must be an account that has already finished onboarding at
 * Vouch Demo High. Uses SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) —
 * server-side only, never ship it to the browser.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const COUNT = Math.min(Number(arg('count', 24)), 200)
const TARGET = arg('target', null)

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const FIRST = ['Ava', 'Ben', 'Cam', 'Dev', 'Eli', 'Fia', 'Gus', 'Hana', 'Ivy', 'Jay', 'Kai', 'Lena', 'Milo', 'Nia', 'Omar', 'Pia', 'Quinn', 'Rae', 'Sam', 'Tess', 'Uma', 'Vic', 'Wes', 'Xan', 'Yara', 'Zoe']
const GRADES = ['freshman', 'sophomore', 'junior', 'senior']
const GENDERS = ['guy', 'girl', 'nonbinary']
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

async function findUserByEmail(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

const { data: school, error: schoolErr } = await db.from('schools').select('id, name').eq('name', 'Vouch Demo High').single()
if (schoolErr || !school) {
  console.error('Vouch Demo High not found. Run supabase/seed.sql first.')
  process.exit(1)
}

console.log(`Seeding ${COUNT} students into ${school.name}…`)
const demoIds = []
for (let i = 0; i < COUNT; i++) {
  const email = `demo+${i}@vouch.school`
  let user
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true })
  if (error) {
    user = await findUserByEmail(email)
    if (!user) throw error
  } else user = data.user

  const name = `${FIRST[i % FIRST.length]}${i >= FIRST.length ? ` ${String.fromCharCode(65 + Math.floor(i / FIRST.length))}.` : ''}`
  const { error: upErr } = await db
    .from('profiles')
    .update({
      school_id: school.id,
      display_name: name,
      instagram_handle: `vouch.demo.${i}`,
      grade: pick(GRADES),
      gender: pick(GENDERS),
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', user.id)
  if (upErr) throw upErr
  demoIds.push(user.id)
  process.stdout.write('.')
}
console.log(`\n✓ ${demoIds.length} demo students ready`)

if (TARGET) {
  const target = await findUserByEmail(TARGET)
  if (!target) throw new Error(`No auth user with email ${TARGET}`)
  const { data: profile } = await db.from('profiles').select('id, school_id, onboarded_at').eq('id', target.id).single()
  if (!profile?.onboarded_at || profile.school_id !== school.id) {
    throw new Error(`${TARGET} must finish onboarding at ${school.name} first`)
  }

  const { error: pollErr } = await db.rpc('ensure_daily_polls', { p_school_id: school.id })
  if (pollErr) throw pollErr
  const { data: polls } = await db.from('polls').select('id').eq('school_id', school.id).gt('active_until', new Date().toISOString())

  const votes = []
  const voters = [...demoIds].sort(() => Math.random() - 0.5).slice(0, 8)
  voters.forEach((voter, i) => votes.push({ poll_id: polls[i % polls.length].id, voter_id: voter, nominee_id: target.id }))
  const { error: voteErr, count } = await db
    .from('votes')
    .upsert(votes, { onConflict: 'poll_id,voter_id', ignoreDuplicates: true, count: 'exact' })
  if (voteErr) throw voteErr

  const { data: me } = await db.from('profiles').select('vote_points').eq('id', target.id).single()
  await db.from('profiles').update({ vote_points: (me?.vote_points ?? 0) + (count ?? votes.length) * 10 }).eq('id', target.id)
  console.log(`✓ sent ${count ?? votes.length} anonymous votes to ${TARGET}. Open /inbox`)
}
