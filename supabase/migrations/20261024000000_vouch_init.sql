-- =============================================================================
--  vouch.school — initial schema
--
--  Design rules (read before editing):
--    1. Clients NEVER touch `votes` directly. The table has RLS enabled, zero
--       policies, and every privilege revoked from `anon` / `authenticated`.
--       All reads/writes go through SECURITY DEFINER RPCs that never return
--       `voter_id`. That is what makes votes anonymous.
--    2. Everything a student can see is scoped to their own school through
--       `public.current_school_id()`.
--    3. Sensitive profile columns (gender, invite_code, referred_by, ...) are
--       hidden with column-level grants; the owner reads them via
--       `public.get_my_profile()`.
--    4. Every SECURITY DEFINER function pins `search_path = ''` and uses fully
--       qualified names to prevent search_path hijacking.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.reveal_type as enum ('gender', 'grade', 'initial');
create type public.gender_identity as enum ('guy', 'girl', 'nonbinary');
create type public.grade_level as enum ('freshman', 'sophomore', 'junior', 'senior', 'grad');
create type public.poll_category as enum ('vibes', 'style', 'brains', 'hype', 'funny', 'kind', 'future');

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Short, URL-safe, unambiguous codes (no 0/o/1/l/i). Uses the random bytes of
-- gen_random_uuid() (core since PG13), skipping the fixed version/variant bits.
create or replace function public.gen_short_code(len integer default 8)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  bytes bytea;
  result text := '';
  i integer;
begin
  if len < 4 or len > 18 then
    raise exception 'gen_short_code: len must be between 4 and 18';
  end if;
  bytes := substring(uuid_send(gen_random_uuid()) from 1 for 6)
        || substring(uuid_send(gen_random_uuid()) from 1 for 6)
        || substring(uuid_send(gen_random_uuid()) from 1 for 6);
  for i in 0 .. len - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- schools
-- -----------------------------------------------------------------------------
create table public.schools (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  domain_extension  text,                       -- e.g. 'wisc.edu'. NULL = open enrollment (most high schools)
  city              text not null,
  student_count     integer not null default 0, -- students who have joined Vouch (trigger-maintained)
  timezone          text not null default 'America/Chicago', -- daily polls drop at local midnight
  created_at        timestamptz not null default now(),

  constraint schools_name_len          check (char_length(name) between 2 and 120),
  constraint schools_city_len          check (char_length(city) between 1 and 80),
  constraint schools_domain_format     check (domain_extension is null or domain_extension ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  constraint schools_student_count_pos check (student_count >= 0),
  constraint schools_domain_unique     unique (domain_extension),
  constraint schools_name_city_unique  unique (name, city)
);

create index schools_name_trgm_idx on public.schools using gin (name extensions.gin_trgm_ops);

comment on column public.schools.domain_extension is
  'If set, only users whose auth email ends with this domain (or a subdomain of it) may join.';

-- -----------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  instagram_handle  text,
  display_name      text,
  school_id         uuid references public.schools (id) on delete restrict,
  grade             public.grade_level,
  gender            public.gender_identity,
  avatar_url        text,  -- object path inside the public `avatars` bucket: '<user id>/<file>'
  vote_points       integer not null default 0,
  invite_code       text not null default public.gen_short_code(7),
  referred_by       uuid references public.profiles (id) on delete set null,
  inbox_seen_at     timestamptz not null default now(),
  onboarded_at      timestamptz,
  created_at        timestamptz not null default now(),

  constraint profiles_instagram_handle_format check (instagram_handle is null or instagram_handle ~ '^[a-z0-9._]{1,30}$'),
  constraint profiles_display_name_len        check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  -- Avatars may only point at the user's own folder in our bucket. This blocks
  -- arbitrary third-party URLs (IP-logging pixels, off-platform content).
  constraint profiles_avatar_own_folder       check (avatar_url is null or avatar_url ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,100}$')),
  constraint profiles_vote_points_pos         check (vote_points >= 0),
  constraint profiles_no_self_referral        check (referred_by is null or referred_by <> id),
  constraint profiles_onboarded_complete      check (
    onboarded_at is null
    or (school_id is not null and instagram_handle is not null and display_name is not null
        and grade is not null and gender is not null)
  ),
  constraint profiles_instagram_handle_unique unique (instagram_handle),
  constraint profiles_invite_code_unique      unique (invite_code)
);

create index profiles_school_onboarded_idx on public.profiles (school_id) where onboarded_at is not null;
create index profiles_referred_by_idx      on public.profiles (referred_by) where referred_by is not null;

-- -----------------------------------------------------------------------------
-- question_bank (curated, positive-only prompts; admin managed)
-- -----------------------------------------------------------------------------
create table public.question_bank (
  id             uuid primary key default gen_random_uuid(),
  question_text  text not null,
  category       public.poll_category not null,
  emoji          text not null default '✨',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),

  constraint question_bank_text_len  check (char_length(question_text) between 5 and 140),
  constraint question_bank_emoji_len check (char_length(emoji) between 1 and 16),
  constraint question_bank_text_unique unique (question_text)
);

-- -----------------------------------------------------------------------------
-- polls (one row per question per school per day)
-- -----------------------------------------------------------------------------
create table public.polls (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete cascade,
  question_id    uuid references public.question_bank (id) on delete set null,
  question_text  text not null,
  category       public.poll_category not null,
  emoji          text not null default '✨',
  poll_date      date not null,
  sort_order     smallint not null default 0,
  active_until   timestamptz not null,
  created_at     timestamptz not null default now(),

  constraint polls_question_text_len check (char_length(question_text) between 5 and 140),
  constraint polls_active_window     check (active_until > created_at)
);

create unique index polls_school_day_question_key on public.polls (school_id, poll_date, question_id);
create index polls_school_active_idx on public.polls (school_id, active_until desc, sort_order);

-- -----------------------------------------------------------------------------
-- votes (anonymous — never readable by clients)
-- -----------------------------------------------------------------------------
create table public.votes (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.polls (id) on delete cascade,
  voter_id    uuid not null references public.profiles (id) on delete cascade,
  nominee_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),

  constraint votes_no_self_vote     check (voter_id <> nominee_id),
  constraint votes_one_per_poll     unique (poll_id, voter_id)
);

create index votes_nominee_created_idx on public.votes (nominee_id, created_at desc);
create index votes_poll_nominee_idx    on public.votes (poll_id, nominee_id);
create index votes_voter_idx           on public.votes (voter_id);

-- -----------------------------------------------------------------------------
-- poll_skips (lets "skip" advance the loop without casting a vote)
-- -----------------------------------------------------------------------------
create table public.poll_skips (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  poll_id     uuid not null references public.polls (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, poll_id)
);

create index poll_skips_poll_idx on public.poll_skips (poll_id);

-- -----------------------------------------------------------------------------
-- share_links (short URLs: vouch.school/s/<code>)
-- -----------------------------------------------------------------------------
create table public.share_links (
  id          uuid primary key default gen_random_uuid(),
  code        text not null default public.gen_short_code(8),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  vote_id     uuid references public.votes (id) on delete set null,
  poll_id     uuid references public.polls (id) on delete set null,
  clicks      integer not null default 0,
  shared_at   timestamptz,
  created_at  timestamptz not null default now(),

  constraint share_links_code_unique unique (code),
  constraint share_links_clicks_pos  check (clicks >= 0)
);

create index share_links_user_vote_idx on public.share_links (user_id, vote_id, created_at desc);

-- -----------------------------------------------------------------------------
-- reveals (hints unlocked by sharing)
-- -----------------------------------------------------------------------------
create table public.reveals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  poll_id        uuid not null references public.polls (id) on delete cascade,
  vote_id        uuid not null references public.votes (id) on delete cascade,
  reveal_type    public.reveal_type not null,
  hint_value     text not null,
  share_link_id  uuid references public.share_links (id) on delete set null,
  unlocked_at    timestamptz not null default now(),

  constraint reveals_one_per_type_per_vote unique (vote_id, reveal_type),
  constraint reveals_one_per_share         unique (share_link_id)
);

create index reveals_user_unlocked_idx on public.reveals (user_id, unlocked_at desc);
create index reveals_poll_idx          on public.reveals (poll_id);

-- =============================================================================
-- Triggers
-- =============================================================================

-- Create an empty profile for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep schools.student_count in sync with onboarded members.
create or replace function public.sync_school_student_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.onboarded_at is not null and old.school_id is not null then
    update public.schools set student_count = greatest(student_count - 1, 0) where id = old.school_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.onboarded_at is not null and new.school_id is not null then
    update public.schools set student_count = student_count + 1 where id = new.school_id;
  end if;
  return null;
end;
$$;

create trigger profiles_sync_student_count
  after insert or delete or update of school_id, onboarded_at on public.profiles
  for each row execute function public.sync_school_student_count();

-- =============================================================================
-- RLS helper
-- =============================================================================

-- The caller's school. SECURITY DEFINER so policies on `profiles` can call it
-- without recursing into themselves.
create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id
  from public.profiles p
  where p.id = auth.uid() and p.onboarded_at is not null
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.schools       enable row level security;
alter table public.profiles      enable row level security;
alter table public.question_bank enable row level security;
alter table public.polls         enable row level security;
alter table public.votes         enable row level security;
alter table public.poll_skips    enable row level security;
alter table public.share_links   enable row level security;
alter table public.reveals       enable row level security;

-- schools: a public directory for signed-in users (needed by the school picker).
create policy "schools: readable by signed-in users"
  on public.schools for select to authenticated
  using (true);

-- profiles: yourself + onboarded classmates at your school. Nobody else.
create policy "profiles: read self"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: read classmates"
  on public.profiles for select to authenticated
  using (onboarded_at is not null and school_id = (select public.current_school_id()));

create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- polls: only your school's polls.
create policy "polls: read own school"
  on public.polls for select to authenticated
  using (school_id = (select public.current_school_id()));

-- votes: NO POLICIES ON PURPOSE. RLS enabled + zero policies = deny all.
-- question_bank, poll_skips: NO POLICIES ON PURPOSE (RPC-only).

-- share_links / reveals: owner can read their own rows; writes are RPC-only.
create policy "share_links: read own"
  on public.share_links for select to authenticated
  using (user_id = (select auth.uid()));

create policy "reveals: read own"
  on public.reveals for select to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- Table privileges (defense in depth on top of RLS)
-- =============================================================================
revoke all on all tables in schema public from anon, authenticated;

grant select on public.schools to authenticated;

-- Classmates can see the directory-safe columns only. gender / invite_code /
-- referred_by / inbox_seen_at are private (read them via get_my_profile()).
grant select (id, instagram_handle, display_name, school_id, grade, avatar_url, vote_points, onboarded_at, created_at)
  on public.profiles to authenticated;
-- Users may edit cosmetic fields only. school/grade/gender/points are RPC-only.
grant update (display_name, instagram_handle, avatar_url) on public.profiles to authenticated;

grant select on public.polls       to authenticated;
grant select on public.share_links to authenticated;
grant select on public.reveals     to authenticated;
-- votes, question_bank, poll_skips: no grants at all.

-- =============================================================================
-- RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- get_my_profile(): the caller's full profile, including private columns.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',               p.id,
    'email',            u.email,
    'instagram_handle', p.instagram_handle,
    'display_name',     p.display_name,
    'school_id',        p.school_id,
    'school_name',      s.name,
    'school_city',      s.city,
    'school_student_count', s.student_count,
    'grade',            p.grade,
    'gender',           p.gender,
    'avatar_url',       p.avatar_url,
    'vote_points',      p.vote_points,
    'invite_code',      p.invite_code,
    'onboarded',        p.onboarded_at is not null,
    'votes_received',   (select count(*) from public.votes v where v.nominee_id = p.id),
    'unread_count',     (select count(*) from public.votes v where v.nominee_id = p.id and v.created_at > p.inbox_seen_at),
    'friends_invited',  (select count(*) from public.profiles r where r.referred_by = p.id and r.onboarded_at is not null)
  )
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  left join auth.users u on u.id = p.id
  where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- search_schools(query): school picker. Flags schools that match the caller's
-- email domain (instant verification) and ones that require a school email.
-- ---------------------------------------------------------------------------
create or replace function public.search_schools(p_query text default '')
returns table (
  id uuid,
  name text,
  city text,
  student_count integer,
  requires_school_email boolean,
  email_domain text,
  email_matches boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2)) as domain
  ),
  scored as (
    select
      s.id, s.name, s.city, s.student_count,
      s.domain_extension is not null as requires_school_email,
      s.domain_extension as email_domain,
      (s.domain_extension is not null and (
         me.domain = s.domain_extension
         or right(me.domain, char_length(s.domain_extension) + 1) = '.' || s.domain_extension
      )) as email_matches
    from public.schools s, me
    where coalesce(btrim(p_query), '') = ''
       or s.name ilike '%' || btrim(p_query) || '%'
       or s.city ilike '%' || btrim(p_query) || '%'
  )
  select * from scored
  order by email_matches desc, student_count desc, name asc
  limit 25
$$;

-- ---------------------------------------------------------------------------
-- complete_onboarding(): join a school, claim an Instagram handle.
-- School is locked once set (prevents hopping schools to snoop).
-- ---------------------------------------------------------------------------
create or replace function public.complete_onboarding(
  p_school_id        uuid,
  p_instagram_handle text,
  p_display_name     text,
  p_grade            public.grade_level,
  p_gender           public.gender_identity,
  p_ref_code         text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles%rowtype;
  v_school    public.schools%rowtype;
  v_email     text;
  v_domain    text;
  v_handle    text;
  v_name      text;
  v_referrer  uuid;
  v_was_new   boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    insert into public.profiles (id) values (v_uid) returning * into v_profile;
  end if;
  v_was_new := v_profile.onboarded_at is null;

  select * into v_school from public.schools where id = p_school_id;
  if not found then
    raise exception 'school_not_found' using errcode = 'P0002';
  end if;

  if v_profile.school_id is not null and v_profile.school_id <> p_school_id then
    raise exception 'school_locked' using errcode = 'P0001';
  end if;

  if v_school.domain_extension is not null then
    select lower(u.email) into v_email from auth.users u where u.id = v_uid;
    v_domain := split_part(coalesce(v_email, ''), '@', 2);
    if not (
      v_domain = v_school.domain_extension
      or right(v_domain, char_length(v_school.domain_extension) + 1) = '.' || v_school.domain_extension
    ) then
      raise exception 'school_email_required'
        using errcode = 'P0001', detail = v_school.domain_extension;
    end if;
  end if;

  v_handle := lower(regexp_replace(btrim(coalesce(p_instagram_handle, '')), '^@+', ''));
  if v_handle !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'invalid_instagram_handle' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where instagram_handle = v_handle and id <> v_uid) then
    raise exception 'instagram_handle_taken' using errcode = '23505';
  end if;

  v_name := btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) not between 1 and 40 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  if p_grade is null or p_gender is null then
    raise exception 'grade_and_gender_required' using errcode = '22023';
  end if;

  -- Referral credit (first onboarding only).
  if v_was_new and v_profile.referred_by is null and p_ref_code is not null and p_ref_code ~ '^[a-z0-9]{4,18}$' then
    select sl.user_id into v_referrer from public.share_links sl where sl.code = p_ref_code;
    if v_referrer is null then
      select pr.id into v_referrer from public.profiles pr where pr.invite_code = p_ref_code;
    end if;
    if v_referrer = v_uid then
      v_referrer := null;
    end if;
  end if;

  update public.profiles
     set school_id        = p_school_id,
         instagram_handle = v_handle,
         display_name     = v_name,
         grade            = p_grade,
         gender           = p_gender,
         referred_by      = coalesce(referred_by, v_referrer),
         onboarded_at     = coalesce(onboarded_at, now())
   where id = v_uid;

  if v_was_new and v_referrer is not null then
    update public.profiles set vote_points = vote_points + 50 where id = v_referrer;
  end if;

  return public.get_my_profile();
exception
  when unique_violation then
    raise exception 'instagram_handle_taken' using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------------
-- ensure_daily_polls(): lazily materialize today's polls for a school.
-- Deterministic ordering (md5 of question+school+date) means concurrent
-- callers pick the same set; the unique index + ON CONFLICT dedupes.
-- Internal only — not granted to clients.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_daily_polls(p_school_id uuid, p_count integer default 12)
returns date
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_today  date;
  v_until  timestamptz;
begin
  select s.timezone into v_tz from public.schools s where s.id = p_school_id;
  if v_tz is null then
    raise exception 'school_not_found' using errcode = 'P0002';
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_until := ((v_today + 1)::timestamp at time zone v_tz);

  if not exists (select 1 from public.polls p where p.school_id = p_school_id and p.poll_date = v_today) then
    insert into public.polls (school_id, question_id, question_text, category, emoji, poll_date, sort_order, active_until)
    select p_school_id, q.id, q.question_text, q.category, q.emoji, v_today,
           (row_number() over (order by md5(q.id::text || p_school_id::text || v_today::text)))::smallint,
           v_until
    from public.question_bank q
    where q.is_active
      and q.id not in (
        select y.question_id from public.polls y
        where y.school_id = p_school_id and y.poll_date = v_today - 1 and y.question_id is not null
      )
    order by md5(q.id::text || p_school_id::text || v_today::text)
    limit p_count
    on conflict (school_id, poll_date, question_id) do nothing;
  end if;

  return v_today;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_next_round(): next unanswered poll + 4 random classmates.
-- ---------------------------------------------------------------------------
create or replace function public.get_next_round()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_school     uuid;
  v_tz         text;
  v_today      date;
  v_next_drop  timestamptz;
  v_poll       public.polls%rowtype;
  v_total      integer;
  v_answered   integer;
  v_classmates integer;
  v_nominees   jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.school_id into v_school from public.profiles p where p.id = v_uid and p.onboarded_at is not null;
  if v_school is null then
    raise exception 'onboarding_required' using errcode = 'P0001';
  end if;

  v_today := public.ensure_daily_polls(v_school);
  select s.timezone into v_tz from public.schools s where s.id = v_school;
  v_next_drop := ((v_today + 1)::timestamp at time zone v_tz);

  select count(*),
         count(*) filter (where exists (select 1 from public.votes v where v.poll_id = p.id and v.voter_id = v_uid)
                             or exists (select 1 from public.poll_skips k where k.poll_id = p.id and k.user_id = v_uid))
    into v_total, v_answered
  from public.polls p
  where p.school_id = v_school and p.active_until > now();

  select count(*) into v_classmates
  from public.profiles pr
  where pr.school_id = v_school and pr.onboarded_at is not null and pr.id <> v_uid;

  select p.* into v_poll
  from public.polls p
  where p.school_id = v_school
    and p.active_until > now()
    and not exists (select 1 from public.votes v where v.poll_id = p.id and v.voter_id = v_uid)
    and not exists (select 1 from public.poll_skips k where k.poll_id = p.id and k.user_id = v_uid)
  order by p.poll_date, p.sort_order, p.created_at, p.id
  limit 1;

  if not found then
    return jsonb_build_object(
      'poll', null,
      'nominees', '[]'::jsonb,
      'progress', jsonb_build_object('answered', v_answered, 'total', v_total),
      'classmates', v_classmates,
      'next_drop_at', v_next_drop
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id,
           'display_name', n.display_name,
           'instagram_handle', n.instagram_handle,
           'avatar_url', n.avatar_url,
           'grade', n.grade
         )), '[]'::jsonb)
    into v_nominees
  from (
    select pr.id, pr.display_name, pr.instagram_handle, pr.avatar_url, pr.grade
    from public.profiles pr
    where pr.school_id = v_school and pr.onboarded_at is not null and pr.id <> v_uid
    order by random()
    limit 4
  ) n;

  return jsonb_build_object(
    'poll', jsonb_build_object(
      'id', v_poll.id,
      'question_text', v_poll.question_text,
      'emoji', v_poll.emoji,
      'category', v_poll.category,
      'active_until', v_poll.active_until
    ),
    'nominees', v_nominees,
    'progress', jsonb_build_object('answered', v_answered, 'total', v_total),
    'classmates', v_classmates,
    'next_drop_at', v_next_drop
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- cast_vote(): validates everything server-side, records the vote, and
-- returns the next round in the same round trip. Idempotent per poll.
-- ---------------------------------------------------------------------------
create or replace function public.cast_vote(p_poll_id uuid, p_nominee_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_school       uuid;
  v_poll_school  uuid;
  v_active_until timestamptz;
  v_inserted     integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.school_id into v_school from public.profiles p where p.id = v_uid and p.onboarded_at is not null;
  if v_school is null then
    raise exception 'onboarding_required' using errcode = 'P0001';
  end if;

  select p.school_id, p.active_until into v_poll_school, v_active_until
  from public.polls p where p.id = p_poll_id;
  if v_poll_school is null or v_poll_school <> v_school then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;
  if v_active_until <= now() then
    raise exception 'poll_closed' using errcode = 'P0001';
  end if;

  if p_nominee_id = v_uid then
    raise exception 'cannot_vote_for_self' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles pr
    where pr.id = p_nominee_id and pr.school_id = v_school and pr.onboarded_at is not null
  ) then
    raise exception 'nominee_not_found' using errcode = 'P0002';
  end if;

  insert into public.votes (poll_id, voter_id, nominee_id)
  values (p_poll_id, v_uid, p_nominee_id)
  on conflict (poll_id, voter_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    -- Only the nominee earns points (crediting the voter would let classmates
    -- correlate point changes with incoming votes).
    update public.profiles set vote_points = vote_points + 10 where id = p_nominee_id;
    delete from public.poll_skips where poll_id = p_poll_id and user_id = v_uid;
  end if;

  return public.get_next_round();
end;
$$;

-- ---------------------------------------------------------------------------
-- skip_poll()
-- ---------------------------------------------------------------------------
create or replace function public.skip_poll(p_poll_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.polls p
    where p.id = p_poll_id and p.school_id = public.current_school_id()
  ) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  insert into public.poll_skips (user_id, poll_id) values (v_uid, p_poll_id)
  on conflict do nothing;

  return public.get_next_round();
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_inbox(): votes I received. NEVER exposes voter_id. Timestamps are
-- truncated to the minute to blunt timing correlation. Hints appear only once
-- unlocked via unlock_reveal().
-- ---------------------------------------------------------------------------
create or replace function public.get_my_inbox(p_limit integer default 60)
returns table (
  vote_id      uuid,
  poll_id      uuid,
  question_text text,
  emoji        text,
  category     public.poll_category,
  received_at  timestamptz,
  is_new       boolean,
  hints        jsonb,
  next_reveal  public.reveal_type
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id,
    v.poll_id,
    p.question_text,
    p.emoji,
    p.category,
    date_trunc('minute', v.created_at),
    v.created_at > me.inbox_seen_at,
    coalesce((
      select jsonb_object_agg(r.reveal_type, r.hint_value)
      from public.reveals r
      where r.vote_id = v.id and r.user_id = me.id
    ), '{}'::jsonb),
    (
      select t.rt
      from unnest(enum_range(null::public.reveal_type)) as t(rt)
      where not exists (select 1 from public.reveals r2 where r2.vote_id = v.id and r2.reveal_type = t.rt)
      order by t.rt
      limit 1
    )
  from public.profiles me
  join public.votes v on v.nominee_id = me.id
  join public.polls p on p.id = v.poll_id
  where me.id = auth.uid()
  order by v.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;

-- ---------------------------------------------------------------------------
-- get_my_trophies(): aggregate counts per superlative.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_trophies()
returns table (
  question_text text,
  emoji         text,
  category      public.poll_category,
  vote_count    bigint,
  last_received_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.question_text, min(p.emoji), min(p.category::text)::public.poll_category, count(*), date_trunc('day', max(v.created_at))
  from public.votes v
  join public.polls p on p.id = v.poll_id
  where v.nominee_id = auth.uid()
  group by p.question_text
  order by count(*) desc, max(v.created_at) desc
  limit 24
$$;

-- ---------------------------------------------------------------------------
-- get_nominee_vote_count(): total votes a classmate has received. Aggregate
-- only — no voter identities, no timestamps.
-- ---------------------------------------------------------------------------
create or replace function public.get_nominee_vote_count(p_nominee_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.votes v
  join public.profiles n on n.id = v.nominee_id
  where v.nominee_id = p_nominee_id
    and (n.id = auth.uid() or n.school_id = public.current_school_id())
$$;

-- ---------------------------------------------------------------------------
-- get_poll_results(): per-nominee aggregate counts for one poll at your
-- school. Only available after you've answered it (or it has closed) so
-- results can't bias your vote.
-- ---------------------------------------------------------------------------
create or replace function public.get_poll_results(p_poll_id uuid)
returns table (
  nominee_id       uuid,
  display_name     text,
  instagram_handle text,
  avatar_url       text,
  vote_count       bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.display_name, n.instagram_handle, n.avatar_url, count(*) as vote_count
  from public.polls p
  join public.votes v on v.poll_id = p.id
  join public.profiles n on n.id = v.nominee_id
  where p.id = p_poll_id
    and p.school_id = public.current_school_id()
    and (
      p.active_until <= now()
      or exists (select 1 from public.votes mv where mv.poll_id = p.id and mv.voter_id = auth.uid())
      or exists (select 1 from public.poll_skips ms where ms.poll_id = p.id and ms.user_id = auth.uid())
    )
  group by n.id, n.display_name, n.instagram_handle, n.avatar_url
  order by vote_count desc, n.display_name
  limit 10
$$;

-- ---------------------------------------------------------------------------
-- create_share_link(vote_id): returns a short code for /s/<code>.
-- Reuses an unused link for the same vote; each link unlocks at most one hint.
-- Pass NULL to get your personal invite code.
-- ---------------------------------------------------------------------------
create or replace function public.create_share_link(p_vote_id uuid default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_poll  uuid;
  v_code  text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_vote_id is null then
    select p.invite_code into v_code from public.profiles p where p.id = v_uid;
    return v_code;
  end if;

  select v.poll_id into v_poll from public.votes v where v.id = p_vote_id and v.nominee_id = v_uid;
  if v_poll is null then
    raise exception 'vote_not_found' using errcode = 'P0002';
  end if;

  select sl.code into v_code
  from public.share_links sl
  where sl.user_id = v_uid
    and sl.vote_id = p_vote_id
    and not exists (select 1 from public.reveals r where r.share_link_id = sl.id)
  order by sl.created_at desc
  limit 1;

  if v_code is null then
    insert into public.share_links (user_id, vote_id, poll_id)
    values (v_uid, p_vote_id, v_poll)
    returning code into v_code;
  end if;

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- unlock_reveal(code): called after the story share completes. Unlocks the
-- next hint tier (gender -> grade -> initial) for the vote behind the link.
-- ---------------------------------------------------------------------------
create or replace function public.unlock_reveal(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_link   public.share_links%rowtype;
  v_vote   public.votes%rowtype;
  v_voter  public.profiles%rowtype;
  v_type   public.reveal_type;
  v_hint   text;
  v_next   public.reveal_type;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_link from public.share_links sl
  where sl.code = p_code and sl.user_id = v_uid
  for update;
  if not found or v_link.vote_id is null then
    raise exception 'share_link_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.reveals r where r.share_link_id = v_link.id) then
    raise exception 'share_link_already_used' using errcode = 'P0001';
  end if;

  select * into v_vote from public.votes v where v.id = v_link.vote_id and v.nominee_id = v_uid;
  if not found then
    raise exception 'vote_not_found' using errcode = 'P0002';
  end if;

  select t.rt into v_type
  from unnest(enum_range(null::public.reveal_type)) as t(rt)
  where not exists (select 1 from public.reveals r where r.vote_id = v_vote.id and r.reveal_type = t.rt)
  order by t.rt
  limit 1;
  if v_type is null then
    raise exception 'all_hints_unlocked' using errcode = 'P0001';
  end if;

  select * into v_voter from public.profiles pr where pr.id = v_vote.voter_id;
  v_hint := case v_type
    when 'gender'  then coalesce(v_voter.gender::text, 'unknown')
    when 'grade'   then coalesce(v_voter.grade::text, 'unknown')
    when 'initial' then coalesce(upper(left(btrim(v_voter.display_name), 1)), '?')
  end;

  insert into public.reveals (user_id, poll_id, vote_id, reveal_type, hint_value, share_link_id)
  values (v_uid, v_vote.poll_id, v_vote.id, v_type, v_hint, v_link.id);

  update public.share_links set shared_at = coalesce(shared_at, now()) where id = v_link.id;

  select t.rt into v_next
  from unnest(enum_range(null::public.reveal_type)) as t(rt)
  where not exists (select 1 from public.reveals r where r.vote_id = v_vote.id and r.reveal_type = t.rt)
  order by t.rt
  limit 1;

  return jsonb_build_object(
    'vote_id', v_vote.id,
    'reveal_type', v_type,
    'hint_value', v_hint,
    'hints', (select jsonb_object_agg(r.reveal_type, r.hint_value) from public.reveals r where r.vote_id = v_vote.id),
    'next_reveal', v_next
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_share_preview(code): public data for /s/<code> and the OG image.
-- Callable by anon. Returns only what the sharer chose to post publicly.
-- ---------------------------------------------------------------------------
create or replace function public.get_share_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_code !~ '^[a-z0-9]{4,18}$' then null else coalesce(
    (
      select jsonb_build_object(
        'kind', 'vote',
        'code', sl.code,
        'question_text', p.question_text,
        'emoji', p.emoji,
        'school_name', s.name,
        'display_name', pr.display_name,
        'instagram_handle', pr.instagram_handle,
        'vote_count', (select count(*) from public.votes v where v.poll_id = sl.poll_id and v.nominee_id = sl.user_id)
      )
      from public.share_links sl
      join public.profiles pr on pr.id = sl.user_id
      left join public.polls p on p.id = sl.poll_id
      left join public.schools s on s.id = pr.school_id
      where sl.code = p_code
    ),
    (
      select jsonb_build_object(
        'kind', 'invite',
        'code', pr.invite_code,
        'question_text', null,
        'emoji', null,
        'school_name', s.name,
        'display_name', pr.display_name,
        'instagram_handle', pr.instagram_handle,
        'vote_count', (select count(*) from public.votes v where v.nominee_id = pr.id)
      )
      from public.profiles pr
      left join public.schools s on s.id = pr.school_id
      where pr.invite_code = p_code and pr.onboarded_at is not null
    )
  ) end
$$;

-- ---------------------------------------------------------------------------
-- track_share_click(code): count landing-page visits. Callable by anon.
-- ---------------------------------------------------------------------------
create or replace function public.track_share_click(p_code text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.share_links set clicks = clicks + 1
  where p_code ~ '^[a-z0-9]{4,18}$' and code = p_code
$$;

-- ---------------------------------------------------------------------------
-- mark_inbox_seen()
-- ---------------------------------------------------------------------------
create or replace function public.mark_inbox_seen()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profiles set inbox_seen_at = now() where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- delete_my_account(): hard delete. Cascades to profile, votes, reveals, links.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

-- =============================================================================
-- Function privileges: deny by default, then allow explicitly.
-- =============================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.current_school_id()                 to authenticated; -- used inside RLS policies
grant execute on function public.get_my_profile()                    to authenticated;
grant execute on function public.search_schools(text)                to authenticated;
grant execute on function public.complete_onboarding(uuid, text, text, public.grade_level, public.gender_identity, text) to authenticated;
grant execute on function public.get_next_round()                    to authenticated;
grant execute on function public.cast_vote(uuid, uuid)               to authenticated;
grant execute on function public.skip_poll(uuid)                     to authenticated;
grant execute on function public.get_my_inbox(integer)               to authenticated;
grant execute on function public.get_my_trophies()                   to authenticated;
grant execute on function public.get_nominee_vote_count(uuid)        to authenticated;
grant execute on function public.get_poll_results(uuid)              to authenticated;
grant execute on function public.create_share_link(uuid)             to authenticated;
grant execute on function public.unlock_reveal(text)                 to authenticated;
grant execute on function public.mark_inbox_seen()                   to authenticated;
grant execute on function public.delete_my_account()                 to authenticated;
grant execute on function public.get_share_preview(text)             to anon, authenticated;
grant execute on function public.track_share_click(text)             to anon, authenticated;
-- Internal only (no client grants): gen_short_code, ensure_daily_polls,
-- handle_new_user, sync_school_student_count.

-- =============================================================================
-- Storage: public avatars bucket, users write only to '<uid>/...'
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars: read own objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: upload to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: update own objects"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: delete own objects"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- NOTE: never add public.votes to the `supabase_realtime` publication.
