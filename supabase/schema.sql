create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('member', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.reservation_status as enum ('reserved', 'waitlist');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  phone text not null check (phone ~ '^01[0-9]{8,9}$'),
  role public.user_role not null default 'member',
  pass_balance integer not null default 8 check (pass_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles alter column pass_balance set default 8;

create table if not exists public.lesson_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null unique,
  instructor text not null,
  capacity integer not null default 1,
  duration_minutes integer not null default 60,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lesson_slots add column if not exists duration_minutes integer;
update public.lesson_slots
set duration_minutes = 60
where duration_minutes is null;
alter table public.lesson_slots alter column duration_minutes set default 60;
alter table public.lesson_slots alter column duration_minutes set not null;
alter table public.lesson_slots drop constraint if exists lesson_slots_duration_minutes_range;
alter table public.lesson_slots
  add constraint lesson_slots_duration_minutes_range check (duration_minutes in (30, 60));

alter table public.lesson_slots drop constraint if exists lesson_slots_capacity_check;
alter table public.lesson_slots drop constraint if exists lesson_slots_capacity_range;
update public.lesson_slots
set capacity = least(greatest(capacity, 1), 3);
alter table public.lesson_slots
  add constraint lesson_slots_capacity_range check (capacity between 1 and 3);

create table if not exists public.fixed_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  slot_hour smallint not null check (slot_hour between 0 and 23),
  slot_minute smallint not null default 0 check (slot_minute in (0, 30)),
  instructor text not null,
  lesson_capacity integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fixed_lessons add column if not exists slot_minute smallint;
update public.fixed_lessons
set slot_minute = 0
where slot_minute is null;
alter table public.fixed_lessons alter column slot_minute set default 0;
alter table public.fixed_lessons alter column slot_minute set not null;
alter table public.fixed_lessons drop constraint if exists fixed_lessons_slot_minute_range;
alter table public.fixed_lessons
  add constraint fixed_lessons_slot_minute_range check (slot_minute in (0, 30));

alter table public.fixed_lessons add column if not exists lesson_capacity integer;
update public.fixed_lessons
set lesson_capacity = 1
where lesson_capacity is null;
update public.fixed_lessons
set lesson_capacity = least(greatest(lesson_capacity, 1), 3);
alter table public.fixed_lessons alter column lesson_capacity set default 1;
alter table public.fixed_lessons alter column lesson_capacity set not null;
alter table public.fixed_lessons drop constraint if exists fixed_lessons_lesson_capacity_range;
alter table public.fixed_lessons
  add constraint fixed_lessons_lesson_capacity_range check (lesson_capacity between 1 and 3);

create table if not exists public.member_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_capacity integer not null default 1 check (lesson_capacity between 1 and 3),
  total_count integer not null default 8 check (total_count > 0),
  remaining_count integer not null default 8 check (remaining_count >= 0),
  is_active boolean not null default true,
  purchased_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.member_passes (user_id, lesson_capacity, total_count, remaining_count, is_active)
select
  p.id,
  1,
  greatest(p.pass_balance, 8),
  p.pass_balance,
  true
from public.profiles p
where p.role = 'member'
  and not exists (
    select 1
    from public.member_passes mp
    where mp.user_id = p.id
      and mp.is_active = true
  );

create table if not exists public.lesson_absences (
  id uuid primary key default gen_random_uuid(),
  fixed_lesson_id uuid not null references public.fixed_lessons(id) on delete cascade,
  slot_id uuid not null references public.lesson_slots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reservations'
      and column_name = 'slot_id'
      and data_type <> 'uuid'
  ) then
    drop table public.reservations cascade;
  end if;
end $$;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.lesson_slots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.reservation_status not null,
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.lesson_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_slot_id uuid not null references public.lesson_slots(id) on delete cascade,
  target_slot_id uuid not null references public.lesson_slots(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);

create table if not exists public.lesson_assignment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot_id uuid not null references public.lesson_slots(id) on delete cascade,
  request_type text not null check (request_type in ('extra_lesson', 'free_swim')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);

create table if not exists public.lesson_feedbacks (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.lesson_slots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  feedback_text text not null default '' check (char_length(feedback_text) <= 100),
  media_path text,
  media_type text check (media_type in ('image', 'video')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (media_path is null and media_type is null)
    or (media_path is not null and media_type is not null)
  ),
  check (nullif(btrim(feedback_text), '') is not null or media_path is not null)
);

create table if not exists public.special_lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  image_path text,
  starts_at timestamptz not null,
  instructor text not null default '',
  duration_minutes integer not null default 60 check (duration_minutes between 30 and 240),
  capacity integer not null check (capacity between 1 and 99),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.special_lessons add column if not exists description text;
update public.special_lessons
set description = ''
where description is null;
alter table public.special_lessons alter column description set default '';
alter table public.special_lessons alter column description set not null;
alter table public.special_lessons drop constraint if exists special_lessons_description_length;
alter table public.special_lessons
  add constraint special_lessons_description_length check (char_length(description) <= 300);

alter table public.special_lessons add column if not exists image_path text;
alter table public.special_lessons add column if not exists instructor text;
update public.special_lessons
set instructor = ''
where instructor is null;
alter table public.special_lessons alter column instructor set default '';
alter table public.special_lessons alter column instructor set not null;

alter table public.special_lessons add column if not exists duration_minutes integer;
update public.special_lessons
set duration_minutes = 60
where duration_minutes is null;
alter table public.special_lessons alter column duration_minutes set default 60;
alter table public.special_lessons alter column duration_minutes set not null;
alter table public.special_lessons drop constraint if exists special_lessons_duration_minutes_range;
alter table public.special_lessons
  add constraint special_lessons_duration_minutes_range check (duration_minutes between 30 and 240);

alter table public.special_lessons add column if not exists is_active boolean;
update public.special_lessons
set is_active = true
where is_active is null;
alter table public.special_lessons alter column is_active set default true;
alter table public.special_lessons alter column is_active set not null;

alter table public.special_lessons add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.special_lessons add column if not exists updated_at timestamptz;
update public.special_lessons
set updated_at = created_at
where updated_at is null;
alter table public.special_lessons alter column updated_at set default now();
alter table public.special_lessons alter column updated_at set not null;

create table if not exists public.special_lesson_registrations (
  id uuid primary key default gen_random_uuid(),
  special_lesson_id uuid not null references public.special_lessons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'waitlisted', 'approved', 'rejected', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);

create table if not exists public.pass_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notices alter column created_by drop not null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'notices'
      and constraint_name = 'notices_created_by_fkey'
  ) then
    alter table public.notices drop constraint notices_created_by_fkey;
  end if;
end $$;

alter table public.notices
  add constraint notices_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

insert into storage.buckets (id, name, public)
values ('notice-images', 'notice-images', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('special-lesson-images', 'special-lesson-images', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('lesson-feedback', 'lesson-feedback', false)
on conflict (id) do update set public = excluded.public;

drop index if exists reservations_one_confirmed_slot;
drop index if exists member_passes_one_active_pass;
drop index if exists fixed_lessons_one_active_member_slot;

create unique index if not exists reservations_one_member_slot
  on public.reservations(slot_id, user_id)
  where canceled_at is null;

create unique index if not exists member_passes_one_active_pass
  on public.member_passes(user_id)
  where is_active = true;

create unique index if not exists fixed_lessons_one_active_member_slot
  on public.fixed_lessons(user_id, weekday, slot_hour, slot_minute)
  where is_active = true;

drop index if exists fixed_lessons_one_active_slot;
drop index if exists fixed_lessons_weekday_hour;

create unique index if not exists lesson_absences_one_active_lesson_slot
  on public.lesson_absences(fixed_lesson_id, slot_id)
  where canceled_at is null;

create index if not exists lesson_slots_starts_at
  on public.lesson_slots(starts_at);

create index if not exists fixed_lessons_member_active
  on public.fixed_lessons(user_id, is_active);

create index if not exists fixed_lessons_weekday_hour
  on public.fixed_lessons(weekday, slot_hour, slot_minute)
  where is_active = true;

create index if not exists lesson_absences_slot_active
  on public.lesson_absences(slot_id)
  where canceled_at is null;

create index if not exists reservations_member_status
  on public.reservations(user_id, status);

create index if not exists reservations_slot_status
  on public.reservations(slot_id, status, created_at);

create unique index if not exists lesson_change_requests_one_pending_user
  on public.lesson_change_requests(user_id)
  where status = 'pending';

create index if not exists lesson_change_requests_status_created_at
  on public.lesson_change_requests(status, created_at desc);

create index if not exists lesson_change_requests_user_created_at
  on public.lesson_change_requests(user_id, created_at desc);

create unique index if not exists lesson_assignment_requests_one_pending_slot
  on public.lesson_assignment_requests(user_id, slot_id, request_type)
  where status = 'pending';

create index if not exists lesson_assignment_requests_status_created_at
  on public.lesson_assignment_requests(status, created_at desc);

create index if not exists lesson_assignment_requests_user_created_at
  on public.lesson_assignment_requests(user_id, created_at desc);

create unique index if not exists lesson_feedbacks_one_member_slot
  on public.lesson_feedbacks(slot_id, user_id);

create index if not exists lesson_feedbacks_user_created_at
  on public.lesson_feedbacks(user_id, created_at desc);

create index if not exists lesson_feedbacks_slot_created_at
  on public.lesson_feedbacks(slot_id, created_at desc);

create index if not exists special_lessons_starts_at
  on public.special_lessons(starts_at);

create unique index if not exists special_lesson_registrations_one_active_user
  on public.special_lesson_registrations(special_lesson_id, user_id)
  where status in ('pending', 'waitlisted', 'approved');

create index if not exists special_lesson_registrations_lesson_created_at
  on public.special_lesson_registrations(special_lesson_id, created_at);

create index if not exists special_lesson_registrations_user_created_at
  on public.special_lesson_registrations(user_id, created_at desc);

create index if not exists pass_transactions_user_created_at
  on public.pass_transactions(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists lesson_slots_set_updated_at on public.lesson_slots;
create trigger lesson_slots_set_updated_at
before update on public.lesson_slots
for each row execute function public.set_updated_at();

drop trigger if exists fixed_lessons_set_updated_at on public.fixed_lessons;
create trigger fixed_lessons_set_updated_at
before update on public.fixed_lessons
for each row execute function public.set_updated_at();

drop trigger if exists member_passes_set_updated_at on public.member_passes;
create trigger member_passes_set_updated_at
before update on public.member_passes
for each row execute function public.set_updated_at();

drop trigger if exists notices_set_updated_at on public.notices;
create trigger notices_set_updated_at
before update on public.notices
for each row execute function public.set_updated_at();

drop trigger if exists lesson_change_requests_set_updated_at on public.lesson_change_requests;
create trigger lesson_change_requests_set_updated_at
before update on public.lesson_change_requests
for each row execute function public.set_updated_at();

drop trigger if exists lesson_assignment_requests_set_updated_at on public.lesson_assignment_requests;
create trigger lesson_assignment_requests_set_updated_at
before update on public.lesson_assignment_requests
for each row execute function public.set_updated_at();

drop trigger if exists lesson_feedbacks_set_updated_at on public.lesson_feedbacks;
create trigger lesson_feedbacks_set_updated_at
before update on public.lesson_feedbacks
for each row execute function public.set_updated_at();

drop trigger if exists special_lessons_set_updated_at on public.special_lessons;
create trigger special_lessons_set_updated_at
before update on public.special_lessons
for each row execute function public.set_updated_at();

drop trigger if exists special_lesson_registrations_set_updated_at on public.special_lesson_registrations;
create trigger special_lesson_registrations_set_updated_at
before update on public.special_lesson_registrations
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.active_member_lesson_capacity(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select mp.lesson_capacity
      from public.member_passes mp
      where mp.user_id = p_user_id
        and mp.is_active = true
      order by mp.purchased_at desc
      limit 1
    ),
    1
  )::integer;
$$;

create or replace function public.assert_lesson_slot_can_accept_member(
  p_slot_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_slot public.lesson_slots%rowtype;
  target_capacity integer;
  occupied_count integer;
  min_occupied_capacity integer;
  effective_capacity integer;
begin
  select *
  into current_slot
  from public.lesson_slots
  where id = p_slot_id
    and is_active = true;

  if not found then
    raise exception '수업 시간을 확인할 수 없습니다.';
  end if;

  target_capacity := public.active_member_lesson_capacity(p_user_id);

  with occupied_members as (
    select fl.user_id
    from public.fixed_lessons fl
    where fl.is_active = true
      and fl.weekday = extract(isodow from current_slot.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_hour = extract(hour from current_slot.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_minute = extract(minute from current_slot.starts_at at time zone 'Asia/Seoul')::integer
      and fl.user_id <> p_user_id
      and not exists (
        select 1
        from public.lesson_absences la
        where la.fixed_lesson_id = fl.id
          and la.slot_id = current_slot.id
          and la.canceled_at is null
      )
    union
    select r.user_id
    from public.reservations r
    where r.slot_id = current_slot.id
      and r.status = 'reserved'
      and r.canceled_at is null
      and r.user_id <> p_user_id
  )
  select
    count(*)::integer,
    min(public.active_member_lesson_capacity(user_id))::integer
  into occupied_count, min_occupied_capacity
  from occupied_members;

  effective_capacity := least(target_capacity, coalesce(min_occupied_capacity, target_capacity));

  if occupied_count + 1 > effective_capacity then
    raise exception '해당 시간에는 선택한 회원의 결제 상품으로 더 배정할 수 없습니다.';
  end if;
end;
$$;

create or replace function public.sync_member_pass_balance(
  p_user_id uuid,
  p_balance integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_passes
  set
    remaining_count = p_balance,
    total_count = greatest(total_count, p_balance),
    updated_at = now()
  where user_id = p_user_id
    and is_active = true;

  if not found then
    insert into public.member_passes (user_id, lesson_capacity, total_count, remaining_count, is_active)
    values (p_user_id, 1, greatest(p_balance, 8), p_balance, true);
  end if;
end;
$$;

create or replace function public.instructor_for_slot(p_starts_at timestamptz)
returns text
language sql
immutable
as $$
  select case
    when extract(isodow from p_starts_at at time zone 'Asia/Seoul') in (6, 7) then
      case when extract(hour from p_starts_at at time zone 'Asia/Seoul') <= 13 then '신준혁' else '이혜원' end
    when extract(hour from p_starts_at at time zone 'Asia/Seoul') <= 8 then '김성대'
    when extract(hour from p_starts_at at time zone 'Asia/Seoul') <= 16 then '이민기'
    when extract(hour from p_starts_at at time zone 'Asia/Seoul') <= 18 then '대표님'
    else '한승빈'
  end;
$$;

create or replace function public.default_instructor_for_fixed_lesson(
  p_weekday integer,
  p_slot_hour integer,
  p_slot_minute integer
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  existing_instructor text;
  today_kst date := (now() at time zone 'Asia/Seoul')::date;
  reference_date date;
  reference_starts_at timestamptz;
begin
  select s.instructor
  into existing_instructor
  from public.lesson_slots s
  where s.is_active = true
    and s.starts_at >= now()
    and extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer = p_weekday
    and extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer = p_slot_hour
    and extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer = p_slot_minute
  order by s.starts_at asc
  limit 1;

  if existing_instructor is not null then
    return existing_instructor;
  end if;

  reference_date := today_kst + (((p_weekday - extract(isodow from today_kst)::integer + 7) % 7)::integer);
  reference_starts_at := make_timestamptz(
    extract(year from reference_date)::integer,
    extract(month from reference_date)::integer,
    extract(day from reference_date)::integer,
    p_slot_hour,
    p_slot_minute,
    0,
    'Asia/Seoul'
  );

  return public.instructor_for_slot(reference_starts_at);
end;
$$;

create or replace function public.sync_lesson_slots(
  p_start_date date default (now() at time zone 'Asia/Seoul')::date,
  p_days integer default 28
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if p_days < 1 or p_days > 90 then
    raise exception '생성할 수업 기간은 1일에서 90일 사이여야 합니다.';
  end if;

  with target_days as (
    select generate_series(p_start_date, p_start_date + (p_days - 1), interval '1 day')::date as slot_date
  ),
  default_times as (
    select
      slot_date,
      unnest(
        case
          when extract(isodow from slot_date) in (6, 7) then array[9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
          else array[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
        end
      ) as slot_hour,
      0 as slot_minute
    from target_days
  ),
  fixed_times as (
    select distinct
      td.slot_date,
      fl.slot_hour::integer as slot_hour,
      fl.slot_minute::integer as slot_minute
    from target_days td
    join public.fixed_lessons fl
      on fl.weekday = extract(isodow from td.slot_date)::integer
      and fl.is_active = true
  ),
  target_times as (
    select slot_date, slot_hour, slot_minute from default_times
    union
    select slot_date, slot_hour, slot_minute from fixed_times
  ),
  built_slots as (
    select
      slot_date,
      slot_hour,
      slot_minute,
      make_timestamptz(
        extract(year from slot_date)::integer,
        extract(month from slot_date)::integer,
        extract(day from slot_date)::integer,
        slot_hour,
        slot_minute,
        0,
        'Asia/Seoul'
      ) as starts_at
    from target_times
  ),
  inserted as (
    insert into public.lesson_slots (starts_at, instructor, capacity, duration_minutes)
    select
      bs.starts_at,
      public.instructor_for_slot(bs.starts_at),
      1,
      60
    from built_slots bs
    on conflict (starts_at) do nothing
    returning 1
  )
  select count(*) into inserted_count from inserted;

  return inserted_count;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_balance integer := 8;
begin
  insert into public.profiles (id, email, name, phone, role, pass_balance)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), '회원'),
    regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'),
    'member',
    initial_balance
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    phone = excluded.phone;

  insert into public.pass_transactions (user_id, amount, balance_after, reason, created_by)
  values (new.id, initial_balance, initial_balance, 'initial_grant', null)
  on conflict do nothing;

  insert into public.member_passes (user_id, lesson_capacity, total_count, remaining_count, is_active)
  values (new.id, 1, initial_balance, initial_balance, true)
  on conflict (user_id) where is_active = true
  do update set
    remaining_count = excluded.remaining_count,
    total_count = excluded.total_count,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.member_passes enable row level security;
alter table public.lesson_slots enable row level security;
alter table public.fixed_lessons enable row level security;
alter table public.lesson_absences enable row level security;
alter table public.reservations enable row level security;
alter table public.lesson_change_requests enable row level security;
alter table public.lesson_assignment_requests enable row level security;
alter table public.lesson_feedbacks enable row level security;
alter table public.special_lessons enable row level security;
alter table public.special_lesson_registrations enable row level security;
alter table public.pass_transactions enable row level security;
alter table public.notices enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "Admins can read profiles" on public.profiles;
create policy "Admins can read profiles"
on public.profiles for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Users can update own basic profile" on public.profiles;
create policy "Users can update own basic profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_user_role());

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
on public.profiles for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Users can read own member passes" on public.member_passes;
create policy "Users can read own member passes"
on public.member_passes for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read member passes" on public.member_passes;
create policy "Admins can read member passes"
on public.member_passes for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Admins can manage member passes" on public.member_passes;
create policy "Admins can manage member passes"
on public.member_passes for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Authenticated users can read active lesson slots" on public.lesson_slots;
create policy "Authenticated users can read active lesson slots"
on public.lesson_slots for select
to authenticated
using (is_active = true);

drop policy if exists "Admins can manage lesson slots" on public.lesson_slots;
create policy "Admins can manage lesson slots"
on public.lesson_slots for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Users can read own fixed lessons" on public.fixed_lessons;
create policy "Users can read own fixed lessons"
on public.fixed_lessons for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read fixed lessons" on public.fixed_lessons;
create policy "Admins can read fixed lessons"
on public.fixed_lessons for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Admins can manage fixed lessons" on public.fixed_lessons;
create policy "Admins can manage fixed lessons"
on public.fixed_lessons for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Users can read own lesson absences" on public.lesson_absences;
create policy "Users can read own lesson absences"
on public.lesson_absences for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read lesson absences" on public.lesson_absences;
create policy "Admins can read lesson absences"
on public.lesson_absences for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Users can read own reservations" on public.reservations;
create policy "Users can read own reservations"
on public.reservations for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read reservations" on public.reservations;
create policy "Admins can read reservations"
on public.reservations for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Users can read own lesson change requests" on public.lesson_change_requests;
create policy "Users can read own lesson change requests"
on public.lesson_change_requests for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read lesson change requests" on public.lesson_change_requests;
create policy "Admins can read lesson change requests"
on public.lesson_change_requests for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Users can read own lesson assignment requests" on public.lesson_assignment_requests;
create policy "Users can read own lesson assignment requests"
on public.lesson_assignment_requests for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read lesson assignment requests" on public.lesson_assignment_requests;
create policy "Admins can read lesson assignment requests"
on public.lesson_assignment_requests for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Users can read own lesson feedbacks" on public.lesson_feedbacks;
create policy "Users can read own lesson feedbacks"
on public.lesson_feedbacks for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read lesson feedbacks" on public.lesson_feedbacks;
create policy "Admins can read lesson feedbacks"
on public.lesson_feedbacks for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Authenticated users can read active special lessons" on public.special_lessons;
create policy "Authenticated users can read active special lessons"
on public.special_lessons for select
to authenticated
using (is_active = true);

drop policy if exists "Admins can manage special lessons" on public.special_lessons;
create policy "Admins can manage special lessons"
on public.special_lessons for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Users can read own special lesson registrations" on public.special_lesson_registrations;
create policy "Users can read own special lesson registrations"
on public.special_lesson_registrations for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read special lesson registrations" on public.special_lesson_registrations;
create policy "Admins can read special lesson registrations"
on public.special_lesson_registrations for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Users can read own pass transactions" on public.pass_transactions;
create policy "Users can read own pass transactions"
on public.pass_transactions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read pass transactions" on public.pass_transactions;
create policy "Admins can read pass transactions"
on public.pass_transactions for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Anyone authenticated can read notices" on public.notices;
create policy "Anyone authenticated can read notices"
on public.notices for select
to authenticated
using (true);

drop policy if exists "Admins can insert notices" on public.notices;
create policy "Admins can insert notices"
on public.notices for insert
to authenticated
with check (public.current_user_role() = 'admin' and created_by = auth.uid());

drop policy if exists "Admins can update notices" on public.notices;
create policy "Admins can update notices"
on public.notices for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Admins can delete notices" on public.notices;
create policy "Admins can delete notices"
on public.notices for delete
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Authenticated users can read notice images" on storage.objects;
create policy "Authenticated users can read notice images"
on storage.objects for select
to authenticated
using (bucket_id = 'notice-images');

drop policy if exists "Admins can upload notice images" on storage.objects;
create policy "Admins can upload notice images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'notice-images' and public.current_user_role() = 'admin');

drop policy if exists "Admins can update notice images" on storage.objects;
create policy "Admins can update notice images"
on storage.objects for update
to authenticated
using (bucket_id = 'notice-images' and public.current_user_role() = 'admin')
with check (bucket_id = 'notice-images' and public.current_user_role() = 'admin');

drop policy if exists "Admins can delete notice images" on storage.objects;
create policy "Admins can delete notice images"
on storage.objects for delete
to authenticated
using (bucket_id = 'notice-images' and public.current_user_role() = 'admin');

drop policy if exists "Authenticated users can read special lesson images" on storage.objects;
create policy "Authenticated users can read special lesson images"
on storage.objects for select
to authenticated
using (bucket_id = 'special-lesson-images');

drop policy if exists "Admins can upload special lesson images" on storage.objects;
create policy "Admins can upload special lesson images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'special-lesson-images' and public.current_user_role() = 'admin');

drop policy if exists "Admins can update special lesson images" on storage.objects;
create policy "Admins can update special lesson images"
on storage.objects for update
to authenticated
using (bucket_id = 'special-lesson-images' and public.current_user_role() = 'admin')
with check (bucket_id = 'special-lesson-images' and public.current_user_role() = 'admin');

drop policy if exists "Admins can delete special lesson images" on storage.objects;
create policy "Admins can delete special lesson images"
on storage.objects for delete
to authenticated
using (bucket_id = 'special-lesson-images' and public.current_user_role() = 'admin');

drop policy if exists "Users can read own lesson feedback media" on storage.objects;
create policy "Users can read own lesson feedback media"
on storage.objects for select
to authenticated
using (
  bucket_id = 'lesson-feedback'
  and (
    public.current_user_role() = 'admin'
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "Admins can upload lesson feedback media" on storage.objects;
create policy "Admins can upload lesson feedback media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'lesson-feedback' and public.current_user_role() = 'admin');

drop policy if exists "Admins can update lesson feedback media" on storage.objects;
create policy "Admins can update lesson feedback media"
on storage.objects for update
to authenticated
using (bucket_id = 'lesson-feedback' and public.current_user_role() = 'admin')
with check (bucket_id = 'lesson-feedback' and public.current_user_role() = 'admin');

drop policy if exists "Admins can delete lesson feedback media" on storage.objects;
create policy "Admins can delete lesson feedback media"
on storage.objects for delete
to authenticated
using (bucket_id = 'lesson-feedback' and public.current_user_role() = 'admin');

drop function if exists public.get_lesson_slots_snapshot(date, integer);

create or replace function public.get_lesson_slots_snapshot(
  p_start_date date default (now() at time zone 'Asia/Seoul')::date,
  p_days integer default 28
)
returns table (
  slot_id uuid,
  starts_at timestamptz,
  instructor text,
  capacity integer,
  duration_minutes integer,
  is_active boolean,
  fixed_lesson_id uuid,
  fixed_lesson_capacity integer,
  fixed_user_id uuid,
  fixed_user_name text,
  absence_user_id uuid,
  absence_user_name text,
  absence_created_at timestamptz,
  substitute_user_id uuid,
  substitute_user_name text,
  substitute_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  perform public.sync_lesson_slots(p_start_date, p_days);
  is_admin := public.current_user_role() = 'admin';

  return query
    with base_slots as (
      select
        s.id,
        s.starts_at,
        s.instructor,
        s.capacity,
        s.duration_minutes,
        s.is_active
      from public.lesson_slots s
      where (s.starts_at at time zone 'Asia/Seoul')::date >= p_start_date
        and (s.starts_at at time zone 'Asia/Seoul')::date < p_start_date + p_days
    ),
    fixed_group_capacity as (
      select
        bs.id as slot_id,
        coalesce(min(public.active_member_lesson_capacity(fl.user_id)), bs.capacity, 1)::integer as capacity
      from base_slots bs
      left join public.fixed_lessons fl
        on fl.weekday = extract(isodow from bs.starts_at at time zone 'Asia/Seoul')::integer
        and fl.slot_hour = extract(hour from bs.starts_at at time zone 'Asia/Seoul')::integer
        and fl.slot_minute = extract(minute from bs.starts_at at time zone 'Asia/Seoul')::integer
        and fl.is_active = true
      group by bs.id, bs.capacity
    ),
    fixed_rows as (
      select
        bs.id as slot_id,
        bs.starts_at,
        bs.instructor,
        fgc.capacity,
        bs.duration_minutes,
        bs.is_active,
        fl.id as fixed_lesson_id,
        public.active_member_lesson_capacity(fl.user_id)::integer as fixed_lesson_capacity,
        case
          when is_admin or fl.user_id = auth.uid() then fl.user_id
          else null
        end as fixed_user_id,
        case
          when is_admin or fl.user_id = auth.uid() then fp.name
          else '고정 수업'
        end as fixed_user_name,
        case
          when la.id is null then null
          when is_admin or la.user_id = auth.uid() then la.user_id
          else null
        end as absence_user_id,
        case
          when la.id is null then null
          when is_admin or la.user_id = auth.uid() then ap.name
          else '고정 회원'
        end as absence_user_name,
        la.created_at as absence_created_at,
        null::uuid as substitute_user_id,
        null::text as substitute_user_name,
        null::timestamptz as substitute_created_at
      from base_slots bs
      join public.fixed_lessons fl
        on fl.weekday = extract(isodow from bs.starts_at at time zone 'Asia/Seoul')::integer
        and fl.slot_hour = extract(hour from bs.starts_at at time zone 'Asia/Seoul')::integer
        and fl.slot_minute = extract(minute from bs.starts_at at time zone 'Asia/Seoul')::integer
        and fl.is_active = true
      join fixed_group_capacity fgc on fgc.slot_id = bs.id
      left join public.profiles fp on fp.id = fl.user_id
      left join public.lesson_absences la
        on la.fixed_lesson_id = fl.id
        and la.slot_id = bs.id
        and la.canceled_at is null
      left join public.profiles ap on ap.id = la.user_id
    ),
    substitute_rows as (
      select
        bs.id as slot_id,
        bs.starts_at,
        bs.instructor,
        fgc.capacity,
        bs.duration_minutes,
        bs.is_active,
        null::uuid as fixed_lesson_id,
        null::integer as fixed_lesson_capacity,
        null::uuid as fixed_user_id,
        null::text as fixed_user_name,
        null::uuid as absence_user_id,
        null::text as absence_user_name,
        null::timestamptz as absence_created_at,
        case
          when is_admin or r.user_id = auth.uid() then r.user_id
          else null
        end as substitute_user_id,
        case
          when is_admin or r.user_id = auth.uid() then rp.name
          else '대체 예약 완료'
        end as substitute_user_name,
        r.created_at as substitute_created_at
      from base_slots bs
      join public.reservations r
        on r.slot_id = bs.id
        and r.status = 'reserved'
        and r.canceled_at is null
      join fixed_group_capacity fgc on fgc.slot_id = bs.id
      join public.profiles rp on rp.id = r.user_id
    ),
    empty_rows as (
      select
        bs.id as slot_id,
        bs.starts_at,
        bs.instructor,
        fgc.capacity,
        bs.duration_minutes,
        bs.is_active,
        null::uuid as fixed_lesson_id,
        null::integer as fixed_lesson_capacity,
        null::uuid as fixed_user_id,
        null::text as fixed_user_name,
        null::uuid as absence_user_id,
        null::text as absence_user_name,
        null::timestamptz as absence_created_at,
        null::uuid as substitute_user_id,
        null::text as substitute_user_name,
        null::timestamptz as substitute_created_at
      from base_slots bs
      join fixed_group_capacity fgc on fgc.slot_id = bs.id
      where not exists (
          select 1
          from public.fixed_lessons fl
          where fl.weekday = extract(isodow from bs.starts_at at time zone 'Asia/Seoul')::integer
            and fl.slot_hour = extract(hour from bs.starts_at at time zone 'Asia/Seoul')::integer
            and fl.slot_minute = extract(minute from bs.starts_at at time zone 'Asia/Seoul')::integer
            and fl.is_active = true
        )
        and not exists (
          select 1
          from public.reservations r
          where r.slot_id = bs.id
            and r.status = 'reserved'
            and r.canceled_at is null
        )
    )
    select * from fixed_rows
    union all
    select * from substitute_rows
    union all
    select * from empty_rows
    order by starts_at asc, fixed_lesson_id nulls last, substitute_created_at nulls last;
end;
$$;

drop function if exists public.get_member_summaries();

create or replace function public.get_member_summaries()
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  role public.user_role,
  pass_balance integer,
  lesson_capacity integer,
  pass_total_count integer,
  pass_remaining_count integer,
  fixed_lesson_count integer,
  absence_count integer,
  substitute_reservation_count integer,
  reserved_count integer,
  waitlist_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  return query
    select
      p.id,
      p.name,
      p.email,
      p.phone,
      p.role,
      p.pass_balance,
      coalesce(mp.lesson_capacity, 1)::integer as lesson_capacity,
      coalesce(mp.total_count, greatest(p.pass_balance, 8))::integer as pass_total_count,
      coalesce(mp.remaining_count, p.pass_balance)::integer as pass_remaining_count,
      coalesce(fl.fixed_lesson_count, 0)::integer as fixed_lesson_count,
      coalesce(la.absence_count, 0)::integer as absence_count,
      coalesce(rr.substitute_reservation_count, 0)::integer as substitute_reservation_count,
      coalesce(rr.substitute_reservation_count, 0)::integer as reserved_count,
      0::integer as waitlist_count,
      p.created_at
    from public.profiles p
    left join public.member_passes mp
      on mp.user_id = p.id
      and mp.is_active = true
    left join (
      select user_id, count(*)::integer as fixed_lesson_count
      from public.fixed_lessons
      where is_active = true
      group by user_id
    ) fl on fl.user_id = p.id
    left join (
      select user_id, count(*)::integer as absence_count
      from public.lesson_absences
      where canceled_at is null
      group by user_id
    ) la on la.user_id = p.id
    left join (
      select user_id, count(*)::integer as substitute_reservation_count
      from public.reservations
      where status = 'reserved' and canceled_at is null
      group by user_id
    ) rr on rr.user_id = p.id
    order by p.created_at desc;
end;
$$;

drop function if exists public.get_my_fixed_lessons();

create or replace function public.get_my_fixed_lessons()
returns table (
  id uuid,
  weekday integer,
  slot_hour integer,
  slot_minute integer,
  instructor text,
  lesson_capacity integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    fl.id,
    fl.weekday::integer,
    fl.slot_hour::integer,
    fl.slot_minute::integer,
    fl.instructor,
    public.active_member_lesson_capacity(fl.user_id)::integer
  from public.fixed_lessons fl
  where fl.user_id = auth.uid()
    and fl.is_active = true
  order by fl.weekday asc, fl.slot_hour asc, fl.slot_minute asc;
$$;

drop function if exists public.set_lesson_slot_capacity(integer, integer, integer, text);
drop function if exists public.upsert_fixed_lesson(uuid, integer, integer, text);
drop function if exists public.upsert_fixed_lesson(uuid, integer, integer, text, integer);
drop function if exists public.upsert_fixed_lesson(uuid, integer, integer, integer, text);
drop function if exists public.upsert_fixed_lesson(uuid, integer, integer, integer, text, integer);
drop table if exists public.lesson_slot_settings;

create or replace function public.upsert_fixed_lesson(
  p_user_id uuid,
  p_weekday integer,
  p_slot_hour integer,
  p_slot_minute integer,
  p_instructor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  lesson_id uuid;
  target_capacity integer;
  effective_capacity integer;
  active_fixed_count integer;
  min_existing_capacity integer;
  effective_instructor text;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_weekday < 1 or p_weekday > 7 or p_slot_hour < 0 or p_slot_hour > 23 or p_slot_minute not in (0, 30) then
    raise exception '고정 수업 요일과 시간을 확인해주세요.';
  end if;

  target_capacity := public.active_member_lesson_capacity(p_user_id);
  effective_instructor := coalesce(
    nullif(trim(coalesce(p_instructor, '')), ''),
    public.default_instructor_for_fixed_lesson(p_weekday, p_slot_hour, p_slot_minute)
  );

  select
    count(*)::integer,
    min(public.active_member_lesson_capacity(user_id))::integer
  into active_fixed_count, min_existing_capacity
  from public.fixed_lessons
  where weekday = p_weekday
    and slot_hour = p_slot_hour
    and slot_minute = p_slot_minute
    and is_active = true
    and user_id <> p_user_id;

  effective_capacity := least(target_capacity, coalesce(min_existing_capacity, target_capacity));

  if active_fixed_count + 1 > effective_capacity then
    raise exception '해당 시간에는 이 수업 상품으로 더 배정할 수 없습니다.';
  end if;

  insert into public.fixed_lessons (user_id, weekday, slot_hour, slot_minute, instructor, lesson_capacity)
  values (p_user_id, p_weekday, p_slot_hour, p_slot_minute, effective_instructor, target_capacity)
  on conflict (user_id, weekday, slot_hour, slot_minute) where is_active = true
  do update set
    instructor = excluded.instructor,
    lesson_capacity = target_capacity,
    updated_at = now()
  returning id into lesson_id;

  update public.lesson_slots
  set
    capacity = (
      select coalesce(min(public.active_member_lesson_capacity(fl.user_id)), 1)::integer
      from public.fixed_lessons fl
      where fl.weekday = p_weekday
        and fl.slot_hour = p_slot_hour
        and fl.slot_minute = p_slot_minute
        and fl.is_active = true
    ),
    updated_at = now()
  where is_active = true
    and starts_at >= now()
    and extract(isodow from starts_at at time zone 'Asia/Seoul')::integer = p_weekday
    and extract(hour from starts_at at time zone 'Asia/Seoul')::integer = p_slot_hour
    and extract(minute from starts_at at time zone 'Asia/Seoul')::integer = p_slot_minute;

  return lesson_id;
end;
$$;

drop function if exists public.update_fixed_lesson(uuid, integer, integer, text, integer);
drop function if exists public.update_fixed_lesson(uuid, integer, integer, integer, text);
drop function if exists public.update_fixed_lesson(uuid, integer, integer, integer, text, integer);
drop function if exists public.cancel_fixed_lesson(uuid);

create or replace function public.update_fixed_lesson(
  p_fixed_lesson_id uuid,
  p_weekday integer,
  p_slot_hour integer,
  p_slot_minute integer,
  p_instructor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_lesson public.fixed_lessons%rowtype;
  target_capacity integer;
  active_fixed_count integer;
  min_existing_capacity integer;
  effective_capacity integer;
  effective_instructor text;
  canceled_reservation record;
  next_balance integer;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_fixed_lesson_id is null then
    raise exception '수정할 고정 수업을 확인해주세요.';
  end if;

  if p_weekday < 1 or p_weekday > 7 or p_slot_hour < 0 or p_slot_hour > 23 or p_slot_minute not in (0, 30) then
    raise exception '고정 수업 요일과 시간을 확인해주세요.';
  end if;

  select *
  into current_lesson
  from public.fixed_lessons
  where id = p_fixed_lesson_id
    and is_active = true
  for update;

  if not found then
    raise exception '수정할 고정 수업을 찾을 수 없습니다.';
  end if;

  target_capacity := public.active_member_lesson_capacity(current_lesson.user_id);
  effective_instructor := coalesce(
    nullif(trim(coalesce(p_instructor, '')), ''),
    public.default_instructor_for_fixed_lesson(p_weekday, p_slot_hour, p_slot_minute)
  );

  select
    count(*)::integer,
    min(public.active_member_lesson_capacity(user_id))::integer
  into active_fixed_count, min_existing_capacity
  from public.fixed_lessons
  where weekday = p_weekday
    and slot_hour = p_slot_hour
    and slot_minute = p_slot_minute
    and is_active = true
    and id <> p_fixed_lesson_id;

  effective_capacity := least(target_capacity, coalesce(min_existing_capacity, target_capacity));

  if active_fixed_count + 1 > effective_capacity then
    raise exception '해당 시간에는 이 수업 상품으로 더 배정할 수 없습니다.';
  end if;

  update public.fixed_lessons
  set
    weekday = p_weekday,
    slot_hour = p_slot_hour,
    slot_minute = p_slot_minute,
    instructor = effective_instructor,
    lesson_capacity = target_capacity,
    updated_at = now()
  where id = p_fixed_lesson_id;

  update public.lesson_absences la
  set canceled_at = now()
  where la.fixed_lesson_id = p_fixed_lesson_id
    and la.canceled_at is null
    and exists (
      select 1
      from public.lesson_slots s
      where s.id = la.slot_id
        and s.is_active = true
        and s.starts_at >= now()
        and (
          extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer <> p_weekday
          or extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer <> p_slot_hour
          or extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer <> p_slot_minute
        )
    );

  for canceled_reservation in
    with affected_slots as (
      select s.id
      from public.lesson_slots s
      where s.is_active = true
        and s.starts_at >= now()
        and extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.weekday
        and extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.slot_hour
        and extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.slot_minute
    ),
    active_absence_counts as (
      select
        la.slot_id,
        count(*)::integer as active_absence_count
      from public.lesson_absences la
      join public.fixed_lessons fl on fl.id = la.fixed_lesson_id
      where la.slot_id in (select id from affected_slots)
        and la.canceled_at is null
        and fl.is_active = true
      group by la.slot_id
    ),
    active_reservations as (
      select
        r.id,
        r.user_id,
        r.slot_id,
        row_number() over (partition by r.slot_id order by r.created_at desc) as reservation_order
      from public.reservations r
      where r.slot_id in (select id from affected_slots)
        and r.status = 'reserved'
        and r.canceled_at is null
    )
    select ar.id, ar.user_id
    from active_reservations ar
    left join active_absence_counts aac on aac.slot_id = ar.slot_id
    where ar.reservation_order > coalesce(aac.active_absence_count, 0)
  loop
    update public.reservations
    set canceled_at = now()
    where id = canceled_reservation.id;

    update public.profiles
    set pass_balance = pass_balance + 1
    where id = canceled_reservation.user_id
    returning pass_balance into next_balance;

    perform public.sync_member_pass_balance(canceled_reservation.user_id, next_balance);

    insert into public.pass_transactions (user_id, amount, balance_after, reason, reservation_id, created_by)
    values (canceled_reservation.user_id, 1, next_balance, 'admin_reservation_canceled', canceled_reservation.id, auth.uid());
  end loop;

  update public.lesson_slots s
  set
    capacity = (
      select coalesce(min(public.active_member_lesson_capacity(fl.user_id)), 1)::integer
      from public.fixed_lessons fl
      where fl.weekday = extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer
        and fl.slot_hour = extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer
        and fl.slot_minute = extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer
        and fl.is_active = true
    ),
    updated_at = now()
  where s.is_active = true
    and s.starts_at >= now()
    and (
      (
        extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.weekday
        and extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.slot_hour
        and extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.slot_minute
      )
      or (
        extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer = p_weekday
        and extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer = p_slot_hour
        and extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer = p_slot_minute
      )
    );

  return p_fixed_lesson_id;
end;
$$;

create or replace function public.cancel_fixed_lesson(p_fixed_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_lesson public.fixed_lessons%rowtype;
  canceled_reservation record;
  next_balance integer;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_fixed_lesson_id is null then
    raise exception '취소할 고정 수업을 확인해주세요.';
  end if;

  select *
  into current_lesson
  from public.fixed_lessons
  where id = p_fixed_lesson_id
    and is_active = true
  for update;

  if not found then
    raise exception '취소할 고정 수업을 찾을 수 없습니다.';
  end if;

  update public.fixed_lessons
  set
    is_active = false,
    updated_at = now()
  where id = p_fixed_lesson_id;

  update public.lesson_absences la
  set canceled_at = now()
  where la.fixed_lesson_id = p_fixed_lesson_id
    and la.canceled_at is null
    and exists (
      select 1
      from public.lesson_slots s
      where s.id = la.slot_id
        and s.is_active = true
        and s.starts_at >= now()
    );

  for canceled_reservation in
    with affected_slots as (
      select s.id
      from public.lesson_slots s
      where s.is_active = true
        and s.starts_at >= now()
        and extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.weekday
        and extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.slot_hour
    ),
    active_absence_counts as (
      select
        la.slot_id,
        count(*)::integer as active_absence_count
      from public.lesson_absences la
      join public.fixed_lessons fl on fl.id = la.fixed_lesson_id
      where la.slot_id in (select id from affected_slots)
        and la.canceled_at is null
        and fl.is_active = true
      group by la.slot_id
    ),
    active_reservations as (
      select
        r.id,
        r.user_id,
        r.slot_id,
        row_number() over (partition by r.slot_id order by r.created_at desc) as reservation_order
      from public.reservations r
      where r.slot_id in (select id from affected_slots)
        and r.status = 'reserved'
        and r.canceled_at is null
    )
    select ar.id, ar.user_id
    from active_reservations ar
    left join active_absence_counts aac on aac.slot_id = ar.slot_id
    where ar.reservation_order > coalesce(aac.active_absence_count, 0)
  loop
    update public.reservations
    set canceled_at = now()
    where id = canceled_reservation.id;

    update public.profiles
    set pass_balance = pass_balance + 1
    where id = canceled_reservation.user_id
    returning pass_balance into next_balance;

    perform public.sync_member_pass_balance(canceled_reservation.user_id, next_balance);

    insert into public.pass_transactions (user_id, amount, balance_after, reason, reservation_id, created_by)
    values (canceled_reservation.user_id, 1, next_balance, 'admin_reservation_canceled', canceled_reservation.id, auth.uid());
  end loop;

  update public.lesson_slots s
  set
    capacity = (
      select coalesce(min(public.active_member_lesson_capacity(fl.user_id)), 1)::integer
      from public.fixed_lessons fl
      where fl.weekday = current_lesson.weekday
        and fl.slot_hour = current_lesson.slot_hour
        and fl.slot_minute = current_lesson.slot_minute
        and fl.is_active = true
    ),
    updated_at = now()
  where s.is_active = true
    and s.starts_at >= now()
    and extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.weekday
    and extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.slot_hour
    and extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer = current_lesson.slot_minute;
end;
$$;

create or replace function public.update_lesson_slot_instructor(
  p_slot_id uuid,
  p_instructor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_slot_id is null then
    raise exception '수업 시간을 확인할 수 없습니다.';
  end if;

  if length(trim(coalesce(p_instructor, ''))) = 0 then
    raise exception '강사명을 입력해주세요.';
  end if;

  update public.lesson_slots
  set
    instructor = trim(p_instructor),
    updated_at = now()
  where id = p_slot_id
    and is_active = true;

  if not found then
    raise exception '수업 시간을 확인할 수 없습니다.';
  end if;
end;
$$;

drop function if exists public.create_lesson_slot(date, integer, text);
drop function if exists public.create_lesson_slot(date, integer, text, integer);
drop function if exists public.create_lesson_slot(date, integer, text, integer, integer);
drop function if exists public.create_lesson_slot(date, integer, integer, text, integer, integer);
drop function if exists public.update_lesson_slot_details(uuid, text, integer);
drop function if exists public.update_lesson_slot_details(uuid, text, integer, integer);
drop function if exists public.cancel_lesson_slot(uuid);

create or replace function public.create_lesson_slot(
  p_slot_date date,
  p_slot_hour integer,
  p_slot_minute integer,
  p_instructor text,
  p_duration_minutes integer default 60,
  p_capacity integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_starts_at timestamptz;
  slot_id uuid;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_slot_date is null or p_slot_hour < 0 or p_slot_hour > 23 or p_slot_minute not in (0, 30) then
    raise exception '추가할 수업 날짜와 시간을 확인해주세요.';
  end if;

  if length(trim(coalesce(p_instructor, ''))) = 0 then
    raise exception '담당 강사를 입력해주세요.';
  end if;

  if p_capacity < 1 or p_capacity > 3 then
    raise exception '수업 정원은 1명에서 3명 사이여야 합니다.';
  end if;

  if p_duration_minutes not in (30, 60) then
    raise exception '수업 종류는 30분 또는 1시간만 선택할 수 있습니다.';
  end if;

  slot_starts_at := make_timestamptz(
    extract(year from p_slot_date)::integer,
    extract(month from p_slot_date)::integer,
    extract(day from p_slot_date)::integer,
    p_slot_hour,
    p_slot_minute,
    0,
    'Asia/Seoul'
  );

  if slot_starts_at <= now() then
    raise exception '지난 시간에는 수업을 추가할 수 없습니다.';
  end if;

  insert into public.lesson_slots (starts_at, instructor, capacity, duration_minutes, is_active)
  values (slot_starts_at, trim(p_instructor), p_capacity, p_duration_minutes, true)
  on conflict (starts_at) do update
  set
    instructor = excluded.instructor,
    capacity = excluded.capacity,
    duration_minutes = excluded.duration_minutes,
    is_active = true,
    updated_at = now()
  returning id into slot_id;

  return slot_id;
end;
$$;

create or replace function public.update_lesson_slot_details(
  p_slot_id uuid,
  p_instructor text,
  p_duration_minutes integer,
  p_capacity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_slot public.lesson_slots%rowtype;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_slot_id is null then
    raise exception '변경할 수업을 확인해주세요.';
  end if;

  if length(trim(coalesce(p_instructor, ''))) = 0 then
    raise exception '담당 강사를 입력해주세요.';
  end if;

  if p_capacity < 1 or p_capacity > 3 then
    raise exception '수업 정원은 1명에서 3명 사이여야 합니다.';
  end if;

  if p_duration_minutes not in (30, 60) then
    raise exception '수업 종류는 30분 또는 1시간만 선택할 수 있습니다.';
  end if;

  select *
  into current_slot
  from public.lesson_slots
  where id = p_slot_id
    and is_active = true
  for update;

  if not found then
    raise exception '변경할 수업을 찾을 수 없습니다.';
  end if;

  if current_slot.starts_at <= now() then
    raise exception '지난 수업은 변경할 수 없습니다.';
  end if;

  update public.lesson_slots
  set
    instructor = trim(p_instructor),
    duration_minutes = p_duration_minutes,
    capacity = p_capacity,
    updated_at = now()
  where id = p_slot_id;
end;
$$;

create or replace function public.cancel_lesson_slot(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_slot public.lesson_slots%rowtype;
  canceled_reservation record;
  next_balance integer;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_slot_id is null then
    raise exception '닫을 수업을 확인해주세요.';
  end if;

  select *
  into current_slot
  from public.lesson_slots
  where id = p_slot_id
    and is_active = true
  for update;

  if not found then
    raise exception '닫을 수업을 찾을 수 없습니다.';
  end if;

  if current_slot.starts_at <= now() then
    raise exception '지난 수업은 닫을 수 없습니다.';
  end if;

  update public.lesson_change_requests
  set
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where status = 'pending'
    and (source_slot_id = p_slot_id or target_slot_id = p_slot_id);

  update public.lesson_absences
  set canceled_at = now()
  where slot_id = p_slot_id
    and canceled_at is null;

  for canceled_reservation in
    select id, user_id
    from public.reservations
    where slot_id = p_slot_id
      and status = 'reserved'
      and canceled_at is null
  loop
    update public.reservations
    set canceled_at = now()
    where id = canceled_reservation.id;

    update public.profiles
    set pass_balance = pass_balance + 1
    where id = canceled_reservation.user_id
    returning pass_balance into next_balance;

    perform public.sync_member_pass_balance(canceled_reservation.user_id, next_balance);

    insert into public.pass_transactions (user_id, amount, balance_after, reason, reservation_id, created_by)
    values (canceled_reservation.user_id, 1, next_balance, 'admin_lesson_slot_canceled', canceled_reservation.id, auth.uid());
  end loop;

  update public.lesson_slots
  set
    is_active = false,
    updated_at = now()
  where id = p_slot_id;
end;
$$;

drop function if exists public.admin_assign_lesson_reservation(uuid, uuid);
drop function if exists public.admin_cancel_lesson_reservation(uuid, uuid);

create or replace function public.admin_assign_lesson_reservation(
  p_slot_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_slot public.lesson_slots%rowtype;
  target_profile public.profiles%rowtype;
  existing_reservation public.reservations%rowtype;
  new_reservation_id uuid;
  next_balance integer;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_slot_id is null or p_user_id is null then
    raise exception '배정할 수업과 회원을 확인해주세요.';
  end if;

  select *
  into current_slot
  from public.lesson_slots
  where id = p_slot_id
    and is_active = true
  for update;

  if not found then
    raise exception '열려있는 수업을 찾을 수 없습니다.';
  end if;

  if current_slot.starts_at <= now() then
    raise exception '지난 수업에는 회원을 배정할 수 없습니다.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = p_user_id
    and role = 'member'
  for update;

  if not found then
    raise exception '배정할 회원을 찾을 수 없습니다.';
  end if;

  if target_profile.pass_balance <= 0 then
    raise exception '남은 횟수권이 없는 회원입니다.';
  end if;

  if exists (
    select 1
    from public.fixed_lessons fl
    where fl.user_id = p_user_id
      and fl.is_active = true
      and fl.weekday = extract(isodow from current_slot.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_hour = extract(hour from current_slot.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_minute = extract(minute from current_slot.starts_at at time zone 'Asia/Seoul')::integer
  ) then
    raise exception '이미 해당 시간에 고정 수업이 있는 회원입니다.';
  end if;

  select *
  into existing_reservation
  from public.reservations
  where slot_id = p_slot_id
    and user_id = p_user_id
    and status = 'reserved'
    and canceled_at is null;

  if found then
    return existing_reservation.id;
  end if;

  perform public.assert_lesson_slot_can_accept_member(p_slot_id, p_user_id);

  insert into public.reservations (slot_id, user_id, status)
  values (p_slot_id, p_user_id, 'reserved')
  returning id into new_reservation_id;

  update public.profiles
  set pass_balance = pass_balance - 1
  where id = p_user_id
  returning pass_balance into next_balance;

  perform public.sync_member_pass_balance(p_user_id, next_balance);

  insert into public.pass_transactions (user_id, amount, balance_after, reason, reservation_id, created_by)
  values (p_user_id, -1, next_balance, 'admin_lesson_assigned', new_reservation_id, auth.uid());

  return new_reservation_id;
end;
$$;

create or replace function public.admin_cancel_lesson_reservation(
  p_slot_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_slot public.lesson_slots%rowtype;
  existing_reservation public.reservations%rowtype;
  next_balance integer;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_slot_id is null or p_user_id is null then
    raise exception '취소할 수업과 회원을 확인해주세요.';
  end if;

  select *
  into current_slot
  from public.lesson_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception '수업을 찾을 수 없습니다.';
  end if;

  if current_slot.starts_at <= now() then
    raise exception '지난 수업의 배정은 취소할 수 없습니다.';
  end if;

  select *
  into existing_reservation
  from public.reservations
  where slot_id = p_slot_id
    and user_id = p_user_id
    and status = 'reserved'
    and canceled_at is null
  for update;

  if not found then
    raise exception '취소할 배정 예약을 찾을 수 없습니다.';
  end if;

  update public.reservations
  set canceled_at = now()
  where id = existing_reservation.id;

  update public.profiles
  set pass_balance = pass_balance + 1
  where id = p_user_id
  returning pass_balance into next_balance;

  perform public.sync_member_pass_balance(p_user_id, next_balance);

  insert into public.pass_transactions (user_id, amount, balance_after, reason, reservation_id, created_by)
  values (p_user_id, 1, next_balance, 'admin_lesson_assignment_canceled', existing_reservation.id, auth.uid());
end;
$$;

drop function if exists public.create_lesson_change_request(uuid);
drop function if exists public.cancel_lesson_change_request(uuid);
drop function if exists public.review_lesson_change_request(uuid, boolean);
drop function if exists public.get_lesson_change_requests();

create or replace function public.create_lesson_change_request(p_target_slot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
  target_slot public.lesson_slots%rowtype;
  source_slot_id uuid;
  active_absence_count integer;
  reservation_count integer;
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  perform public.sync_lesson_slots((now() at time zone 'Asia/Seoul')::date, 28);

  select *
  into current_profile
  from public.profiles
  where id = auth.uid();

  if not found then
    raise exception '회원 정보를 확인할 수 없습니다.';
  end if;

  if current_profile.role = 'admin' then
    raise exception '관리자는 변경 요청을 만들 수 없습니다.';
  end if;

  if exists (
    select 1
    from public.lesson_change_requests lcr
    where lcr.user_id = auth.uid()
      and lcr.status = 'pending'
  ) then
    raise exception '이미 승인 대기 중인 변경 요청이 있습니다.';
  end if;

  select *
  into target_slot
  from public.lesson_slots
  where id = p_target_slot_id
    and is_active = true
  for update;

  if not found or target_slot.starts_at <= now() then
    raise exception '변경 요청할 수업 시간을 확인해주세요.';
  end if;

  select s.id
  into source_slot_id
  from public.lesson_slots s
  join public.fixed_lessons fl
    on fl.weekday = extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer
    and fl.slot_hour = extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer
    and fl.slot_minute = extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer
    and fl.user_id = auth.uid()
    and fl.is_active = true
  where s.is_active = true
    and s.starts_at > now()
    and not exists (
      select 1
      from public.lesson_absences la
      where la.fixed_lesson_id = fl.id
        and la.slot_id = s.id
        and la.canceled_at is null
    )
  order by s.starts_at asc
  limit 1;

  if source_slot_id is null then
    raise exception '변경 요청할 다음 고정수업이 없습니다.';
  end if;

  if source_slot_id = p_target_slot_id then
    raise exception '같은 수업으로는 변경 요청할 수 없습니다.';
  end if;

  if exists (
    select 1
    from public.fixed_lessons fl
    where fl.user_id = auth.uid()
      and fl.is_active = true
      and fl.weekday = extract(isodow from target_slot.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_hour = extract(hour from target_slot.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_minute = extract(minute from target_slot.starts_at at time zone 'Asia/Seoul')::integer
  ) then
    raise exception '본인의 고정수업 시간으로는 변경 요청할 수 없습니다.';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.user_id = auth.uid()
      and r.slot_id = p_target_slot_id
      and r.status = 'reserved'
      and r.canceled_at is null
  ) then
    raise exception '이미 신청한 수업입니다.';
  end if;

  select count(*)::integer
  into active_absence_count
  from public.lesson_absences la
  where la.slot_id = p_target_slot_id
    and la.canceled_at is null;

  select count(*)::integer
  into reservation_count
  from public.reservations r
  where r.slot_id = p_target_slot_id
    and r.status = 'reserved'
    and r.canceled_at is null;

  if active_absence_count = 0 or reservation_count >= active_absence_count then
    raise exception '변경 요청할 수 있는 빈자리가 아닙니다.';
  end if;

  perform public.assert_lesson_slot_can_accept_member(p_target_slot_id, auth.uid());

  insert into public.lesson_change_requests (user_id, source_slot_id, target_slot_id)
  values (auth.uid(), source_slot_id, p_target_slot_id)
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.cancel_lesson_change_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  update public.lesson_change_requests
  set status = 'canceled'
  where id = p_request_id
    and user_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception '취소할 변경 요청을 찾을 수 없습니다.';
  end if;
end;
$$;

create or replace function public.review_lesson_change_request(
  p_request_id uuid,
  p_approved boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.lesson_change_requests%rowtype;
  target_slot public.lesson_slots%rowtype;
  source_fixed_lesson_id uuid;
  active_absence_count integer;
  reservation_count integer;
  inserted_reservation_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  select *
  into request_row
  from public.lesson_change_requests
  where id = p_request_id
  for update;

  if not found or request_row.status <> 'pending' then
    raise exception '처리할 변경 요청을 찾을 수 없습니다.';
  end if;

  if not p_approved then
    update public.lesson_change_requests
    set
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = p_request_id;

    return 'rejected';
  end if;

  select *
  into target_slot
  from public.lesson_slots
  where id = request_row.target_slot_id
    and is_active = true
  for update;

  if not found or target_slot.starts_at <= now() then
    raise exception '요청한 변경 대상 수업을 확인할 수 없습니다.';
  end if;

  select fl.id
  into source_fixed_lesson_id
  from public.lesson_slots s
  join public.fixed_lessons fl
    on fl.weekday = extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer
    and fl.slot_hour = extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer
    and fl.slot_minute = extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer
    and fl.user_id = request_row.user_id
    and fl.is_active = true
  where s.id = request_row.source_slot_id
    and s.is_active = true;

  if source_fixed_lesson_id is null then
    raise exception '회원의 원래 고정수업을 확인할 수 없습니다.';
  end if;

  select count(*)::integer
  into active_absence_count
  from public.lesson_absences la
  where la.slot_id = request_row.target_slot_id
    and la.canceled_at is null;

  select count(*)::integer
  into reservation_count
  from public.reservations r
  where r.slot_id = request_row.target_slot_id
    and r.status = 'reserved'
    and r.canceled_at is null;

  if active_absence_count = 0 or reservation_count >= active_absence_count then
    raise exception '요청한 변경 대상 자리가 더 이상 비어있지 않습니다.';
  end if;

  perform public.assert_lesson_slot_can_accept_member(request_row.target_slot_id, request_row.user_id);

  insert into public.lesson_absences (fixed_lesson_id, slot_id, user_id)
  values (source_fixed_lesson_id, request_row.source_slot_id, request_row.user_id)
  on conflict do nothing;

  insert into public.reservations (slot_id, user_id, status)
  values (request_row.target_slot_id, request_row.user_id, 'reserved')
  on conflict do nothing
  returning id into inserted_reservation_id;

  if inserted_reservation_id is null then
    raise exception '이미 해당 수업에 신청되어 있습니다.';
  end if;

  update public.lesson_change_requests
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_request_id;

  return 'approved';
end;
$$;

create or replace function public.get_lesson_change_requests()
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  source_slot_id uuid,
  source_starts_at timestamptz,
  source_instructor text,
  target_slot_id uuid,
  target_starts_at timestamptz,
  target_instructor text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  is_admin := public.current_user_role() = 'admin';

  return query
    select
      lcr.id,
      lcr.user_id,
      p.name as user_name,
      lcr.source_slot_id,
      ss.starts_at as source_starts_at,
      ss.instructor as source_instructor,
      lcr.target_slot_id,
      ts.starts_at as target_starts_at,
      ts.instructor as target_instructor,
      lcr.status,
      lcr.created_at,
      lcr.reviewed_at,
      rp.name as reviewed_by_name
    from public.lesson_change_requests lcr
    join public.profiles p on p.id = lcr.user_id
    join public.lesson_slots ss on ss.id = lcr.source_slot_id
    join public.lesson_slots ts on ts.id = lcr.target_slot_id
    left join public.profiles rp on rp.id = lcr.reviewed_by
    where (is_admin or lcr.user_id = auth.uid())
      and (lcr.status = 'pending' or lcr.created_at >= now() - interval '30 days')
    order by
      case when lcr.status = 'pending' then 0 else 1 end,
      lcr.created_at desc;
end;
$$;

drop function if exists public.create_lesson_assignment_request(uuid, text);
drop function if exists public.cancel_lesson_assignment_request(uuid);
drop function if exists public.review_lesson_assignment_request(uuid, boolean);
drop function if exists public.get_lesson_assignment_requests();
drop function if exists public.slot_has_assignment(uuid);
drop function if exists public.lesson_slot_has_member(uuid, uuid);
drop function if exists public.upsert_lesson_feedback(uuid, uuid, text, text, text);
drop function if exists public.get_lesson_feedbacks();
drop function if exists public.get_lesson_feedback_targets(integer);
drop function if exists public.create_special_lesson(text, text, timestamptz, text, integer, integer);
drop function if exists public.create_special_lesson(text, text, timestamptz, text, integer, integer, text);
drop function if exists public.apply_special_lesson(uuid);
drop function if exists public.cancel_special_lesson_registration(uuid);
drop function if exists public.review_special_lesson_registration(uuid, boolean);
drop function if exists public.get_special_lessons();
drop function if exists public.get_special_lesson_registrations();

create or replace function public.slot_has_assignment(p_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lesson_slots s
    join public.fixed_lessons fl
      on fl.weekday = extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_hour = extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_minute = extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer
      and fl.is_active = true
    where s.id = p_slot_id
  )
  or exists (
    select 1
    from public.reservations r
    where r.slot_id = p_slot_id
      and r.status = 'reserved'
      and r.canceled_at is null
  );
$$;

create or replace function public.create_lesson_assignment_request(
  p_slot_id uuid,
  p_request_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
  target_slot public.lesson_slots%rowtype;
  normalized_type text := coalesce(p_request_type, '');
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if normalized_type not in ('extra_lesson', 'free_swim') then
    raise exception '신청 종류를 확인해주세요.';
  end if;

  perform public.sync_lesson_slots((now() at time zone 'Asia/Seoul')::date, 28);

  select *
  into current_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found or current_profile.role <> 'member' then
    raise exception '회원 계정으로만 신청할 수 있습니다.';
  end if;

  select *
  into target_slot
  from public.lesson_slots
  where id = p_slot_id
  for update;

  if not found or target_slot.starts_at <= now() then
    raise exception '신청할 수업 시간을 확인해주세요.';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.user_id = auth.uid()
      and r.slot_id = p_slot_id
      and r.status = 'reserved'
      and r.canceled_at is null
  ) then
    raise exception '이미 배정된 시간입니다.';
  end if;

  if exists (
    select 1
    from public.lesson_assignment_requests lar
    where lar.user_id = auth.uid()
      and lar.slot_id = p_slot_id
      and lar.request_type = normalized_type
      and lar.status = 'pending'
  ) then
    raise exception '이미 승인 대기 중인 신청입니다.';
  end if;

  if public.slot_has_assignment(p_slot_id) then
    raise exception '이미 다른 회원이 배정된 시간입니다.';
  end if;

  if normalized_type = 'extra_lesson' then
    if not target_slot.is_active then
      raise exception '추가 수업은 열려있는 수업만 신청할 수 있습니다.';
    end if;

    if current_profile.pass_balance <= 0 then
      raise exception '남은 횟수권이 없습니다.';
    end if;

    perform public.assert_lesson_slot_can_accept_member(p_slot_id, auth.uid());
  else
    if target_slot.is_active then
      raise exception '자유수영은 수업이 닫힌 시간만 신청할 수 있습니다.';
    end if;
  end if;

  insert into public.lesson_assignment_requests (user_id, slot_id, request_type)
  values (auth.uid(), p_slot_id, normalized_type)
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.cancel_lesson_assignment_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  update public.lesson_assignment_requests
  set status = 'canceled'
  where id = p_request_id
    and user_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception '취소할 신청을 찾을 수 없습니다.';
  end if;
end;
$$;

create or replace function public.review_lesson_assignment_request(
  p_request_id uuid,
  p_approved boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.lesson_assignment_requests%rowtype;
  target_slot public.lesson_slots%rowtype;
  target_profile public.profiles%rowtype;
  new_reservation_id uuid;
  next_balance integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  select *
  into request_row
  from public.lesson_assignment_requests
  where id = p_request_id
  for update;

  if not found or request_row.status <> 'pending' then
    raise exception '처리할 신청을 찾을 수 없습니다.';
  end if;

  if not p_approved then
    update public.lesson_assignment_requests
    set
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = p_request_id;

    return 'rejected';
  end if;

  select *
  into target_slot
  from public.lesson_slots
  where id = request_row.slot_id
  for update;

  if not found or target_slot.starts_at <= now() then
    raise exception '신청한 시간을 확인할 수 없습니다.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = request_row.user_id
    and role = 'member'
  for update;

  if not found then
    raise exception '신청 회원을 확인할 수 없습니다.';
  end if;

  if public.slot_has_assignment(request_row.slot_id) then
    raise exception '이미 다른 회원이 배정된 시간입니다.';
  end if;

  if request_row.request_type = 'extra_lesson' then
    if not target_slot.is_active then
      raise exception '추가 수업 대상 시간이 더 이상 열려있지 않습니다.';
    end if;

    if target_profile.pass_balance <= 0 then
      raise exception '회원의 남은 횟수권이 없습니다.';
    end if;

    perform public.assert_lesson_slot_can_accept_member(request_row.slot_id, request_row.user_id);
  else
    if target_slot.is_active then
      raise exception '자유수영 대상 시간이 더 이상 닫혀있지 않습니다.';
    end if;
  end if;

  insert into public.reservations (slot_id, user_id, status)
  values (request_row.slot_id, request_row.user_id, 'reserved')
  on conflict do nothing
  returning id into new_reservation_id;

  if new_reservation_id is null then
    raise exception '이미 해당 시간에 배정되어 있습니다.';
  end if;

  if request_row.request_type = 'extra_lesson' then
    update public.profiles
    set pass_balance = pass_balance - 1
    where id = request_row.user_id
    returning pass_balance into next_balance;

    perform public.sync_member_pass_balance(request_row.user_id, next_balance);

    insert into public.pass_transactions (user_id, amount, balance_after, reason, reservation_id, created_by)
    values (request_row.user_id, -1, next_balance, 'extra_lesson_request_approved', new_reservation_id, auth.uid());
  end if;

  update public.lesson_assignment_requests
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_request_id;

  update public.lesson_assignment_requests
  set
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id <> p_request_id
    and slot_id = request_row.slot_id
    and status = 'pending';

  return 'approved';
end;
$$;

create or replace function public.get_lesson_assignment_requests()
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  slot_id uuid,
  starts_at timestamptz,
  instructor text,
  request_type text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  is_admin := public.current_user_role() = 'admin';

  return query
    select
      lar.id,
      lar.user_id,
      p.name as user_name,
      lar.slot_id,
      s.starts_at,
      s.instructor,
      lar.request_type,
      lar.status,
      lar.created_at,
      lar.reviewed_at,
      rp.name as reviewed_by_name
    from public.lesson_assignment_requests lar
    join public.profiles p on p.id = lar.user_id
    join public.lesson_slots s on s.id = lar.slot_id
    left join public.profiles rp on rp.id = lar.reviewed_by
    where (is_admin or lar.user_id = auth.uid())
      and (lar.status = 'pending' or lar.created_at >= now() - interval '30 days')
    order by
      case when lar.status = 'pending' then 0 else 1 end,
      lar.created_at desc;
end;
$$;

create or replace function public.lesson_slot_has_member(
  p_slot_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lesson_slots s
    join public.fixed_lessons fl
      on fl.weekday = extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_hour = extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_minute = extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer
      and fl.is_active = true
      and fl.user_id = p_user_id
    where s.id = p_slot_id
      and not exists (
        select 1
        from public.lesson_absences la
        where la.fixed_lesson_id = fl.id
          and la.slot_id = s.id
          and la.canceled_at is null
      )
  )
  or exists (
    select 1
    from public.reservations r
    where r.slot_id = p_slot_id
      and r.user_id = p_user_id
      and r.status = 'reserved'
      and r.canceled_at is null
  );
$$;

create or replace function public.upsert_lesson_feedback(
  p_slot_id uuid,
  p_user_id uuid,
  p_feedback_text text,
  p_media_path text,
  p_media_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_slot public.lesson_slots%rowtype;
  existing_feedback public.lesson_feedbacks%rowtype;
  normalized_text text := left(coalesce(p_feedback_text, ''), 100);
  normalized_media_path text := nullif(btrim(coalesce(p_media_path, '')), '');
  normalized_media_type text := nullif(btrim(coalesce(p_media_type, '')), '');
  feedback_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_slot_id is null or p_user_id is null then
    raise exception '수업과 회원을 확인해주세요.';
  end if;

  if char_length(coalesce(p_feedback_text, '')) > 100 then
    raise exception '피드백 글은 100자 이내로 입력해주세요.';
  end if;

  if normalized_media_path is not null and normalized_media_type not in ('image', 'video') then
    raise exception '첨부 파일 종류를 확인해주세요.';
  end if;

  select *
  into target_slot
  from public.lesson_slots
  where id = p_slot_id;

  if not found then
    raise exception '수업 시간을 찾을 수 없습니다.';
  end if;

  if target_slot.starts_at + (target_slot.duration_minutes || ' minutes')::interval > now() then
    raise exception '수업이 끝난 뒤 피드백을 등록할 수 있습니다.';
  end if;

  if not public.lesson_slot_has_member(p_slot_id, p_user_id) then
    raise exception '해당 수업에 배정된 회원이 아닙니다.';
  end if;

  select *
  into existing_feedback
  from public.lesson_feedbacks
  where slot_id = p_slot_id
    and user_id = p_user_id;

  if nullif(btrim(normalized_text), '') is null
    and normalized_media_path is null
    and (not found or existing_feedback.media_path is null) then
    raise exception '사진, 동영상 또는 피드백 글을 입력해주세요.';
  end if;

  insert into public.lesson_feedbacks (slot_id, user_id, feedback_text, media_path, media_type, created_by)
  values (p_slot_id, p_user_id, normalized_text, normalized_media_path, normalized_media_type, auth.uid())
  on conflict (slot_id, user_id) do update
  set
    feedback_text = excluded.feedback_text,
    media_path = coalesce(excluded.media_path, public.lesson_feedbacks.media_path),
    media_type = coalesce(excluded.media_type, public.lesson_feedbacks.media_type),
    created_by = auth.uid(),
    updated_at = now()
  returning id into feedback_id;

  return feedback_id;
end;
$$;

create or replace function public.get_lesson_feedbacks()
returns table (
  id uuid,
  slot_id uuid,
  user_id uuid,
  user_name text,
  starts_at timestamptz,
  instructor text,
  feedback_text text,
  media_path text,
  media_type text,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  is_admin := public.current_user_role() = 'admin';

  return query
    select
      lf.id,
      lf.slot_id,
      lf.user_id,
      p.name as user_name,
      s.starts_at,
      s.instructor,
      lf.feedback_text,
      lf.media_path,
      lf.media_type,
      cp.name as created_by_name,
      lf.created_at,
      lf.updated_at
    from public.lesson_feedbacks lf
    join public.lesson_slots s on s.id = lf.slot_id
    join public.profiles p on p.id = lf.user_id
    left join public.profiles cp on cp.id = lf.created_by
    where (is_admin or lf.user_id = auth.uid())
      and s.starts_at >= now() - interval '90 days'
    order by s.starts_at desc, lf.updated_at desc;
end;
$$;

create or replace function public.get_lesson_feedback_targets(p_days integer default 14)
returns table (
  slot_id uuid,
  starts_at timestamptz,
  instructor text,
  duration_minutes integer,
  user_id uuid,
  user_name text,
  feedback_id uuid,
  feedback_text text,
  media_path text,
  media_type text,
  feedback_created_at timestamptz,
  feedback_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_days < 1 or p_days > 60 then
    raise exception '조회 기간은 1일에서 60일 사이여야 합니다.';
  end if;

  perform public.sync_lesson_slots((now() at time zone 'Asia/Seoul')::date, 1);

  return query
    with ended_slots as (
      select s.*
      from public.lesson_slots s
      where s.starts_at >= now() - (p_days || ' days')::interval
        and s.starts_at + (s.duration_minutes || ' minutes')::interval <= now()
    ),
    assigned_members as (
      select
        s.id as slot_id,
        s.starts_at,
        s.instructor,
        s.duration_minutes,
        fl.user_id,
        p.name as user_name
      from ended_slots s
      join public.fixed_lessons fl
        on fl.weekday = extract(isodow from s.starts_at at time zone 'Asia/Seoul')::integer
        and fl.slot_hour = extract(hour from s.starts_at at time zone 'Asia/Seoul')::integer
        and fl.slot_minute = extract(minute from s.starts_at at time zone 'Asia/Seoul')::integer
        and fl.is_active = true
      join public.profiles p on p.id = fl.user_id
      where not exists (
        select 1
        from public.lesson_absences la
        where la.fixed_lesson_id = fl.id
          and la.slot_id = s.id
          and la.canceled_at is null
      )
      union
      select
        s.id as slot_id,
        s.starts_at,
        s.instructor,
        s.duration_minutes,
        r.user_id,
        p.name as user_name
      from ended_slots s
      join public.reservations r
        on r.slot_id = s.id
        and r.status = 'reserved'
        and r.canceled_at is null
      join public.profiles p on p.id = r.user_id
    )
    select
      am.slot_id,
      am.starts_at,
      am.instructor,
      am.duration_minutes,
      am.user_id,
      am.user_name,
      lf.id as feedback_id,
      lf.feedback_text,
      lf.media_path,
      lf.media_type,
      lf.created_at as feedback_created_at,
      lf.updated_at as feedback_updated_at
    from assigned_members am
    left join public.lesson_feedbacks lf
      on lf.slot_id = am.slot_id
      and lf.user_id = am.user_id
    order by
      case when lf.id is null then 0 else 1 end,
      am.starts_at desc,
      am.user_name asc;
end;
$$;

create or replace function public.create_special_lesson(
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_instructor text,
  p_duration_minutes integer,
  p_capacity integer,
  p_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  lesson_id uuid;
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_description text := left(coalesce(p_description, ''), 300);
  normalized_instructor text := btrim(coalesce(p_instructor, ''));
  normalized_image_path text := nullif(btrim(coalesce(p_image_path, '')), '');
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if normalized_title = '' then
    raise exception '특별수업명을 입력해주세요.';
  end if;

  if p_starts_at is null or p_starts_at <= now() then
    raise exception '특별수업 일시를 확인해주세요.';
  end if;

  if p_duration_minutes not between 30 and 240 then
    raise exception '수업 시간은 30분에서 240분 사이여야 합니다.';
  end if;

  if p_capacity not between 1 and 99 then
    raise exception '모집 인원은 1명에서 99명 사이여야 합니다.';
  end if;

  insert into public.special_lessons (title, description, image_path, starts_at, instructor, duration_minutes, capacity, created_by)
  values (normalized_title, normalized_description, normalized_image_path, p_starts_at, normalized_instructor, p_duration_minutes, p_capacity, auth.uid())
  returning id into lesson_id;

  return lesson_id;
end;
$$;

create or replace function public.apply_special_lesson(p_special_lesson_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
  target_lesson public.special_lessons%rowtype;
  queue_position integer;
  next_status text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = auth.uid();

  if not found or current_profile.role <> 'member' then
    raise exception '회원 계정으로만 신청할 수 있습니다.';
  end if;

  select *
  into target_lesson
  from public.special_lessons
  where id = p_special_lesson_id
    and is_active = true
  for update;

  if not found or target_lesson.starts_at <= now() then
    raise exception '신청할 특별수업을 확인해주세요.';
  end if;

  if exists (
    select 1
    from public.special_lesson_registrations slr
    where slr.special_lesson_id = p_special_lesson_id
      and slr.user_id = auth.uid()
      and slr.status in ('pending', 'waitlisted', 'approved')
  ) then
    raise exception '이미 신청한 특별수업입니다.';
  end if;

  select count(*)::integer + 1
  into queue_position
  from public.special_lesson_registrations slr
  where slr.special_lesson_id = p_special_lesson_id
    and slr.status in ('pending', 'waitlisted', 'approved');

  next_status := case when queue_position <= target_lesson.capacity then 'pending' else 'waitlisted' end;

  insert into public.special_lesson_registrations (special_lesson_id, user_id, status)
  values (p_special_lesson_id, auth.uid(), next_status);

  return next_status;
end;
$$;

create or replace function public.cancel_special_lesson_registration(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  update public.special_lesson_registrations
  set status = 'canceled'
  where id = p_registration_id
    and user_id = auth.uid()
    and status in ('pending', 'waitlisted');

  if not found then
    raise exception '취소할 특별수업 신청을 찾을 수 없습니다.';
  end if;
end;
$$;

create or replace function public.review_special_lesson_registration(
  p_registration_id uuid,
  p_approved boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_registration public.special_lesson_registrations%rowtype;
  target_lesson public.special_lessons%rowtype;
  approved_count integer;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  select *
  into target_registration
  from public.special_lesson_registrations
  where id = p_registration_id
  for update;

  if not found or target_registration.status not in ('pending', 'waitlisted') then
    raise exception '처리할 특별수업 신청을 찾을 수 없습니다.';
  end if;

  if not p_approved then
    update public.special_lesson_registrations
    set
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = p_registration_id;

    return 'rejected';
  end if;

  select *
  into target_lesson
  from public.special_lessons
  where id = target_registration.special_lesson_id
    and is_active = true
  for update;

  if not found then
    raise exception '특별수업을 찾을 수 없습니다.';
  end if;

  if exists (
    select 1
    from public.special_lesson_registrations earlier
    where earlier.special_lesson_id = target_registration.special_lesson_id
      and earlier.status in ('pending', 'waitlisted')
      and (
        earlier.created_at < target_registration.created_at
        or (earlier.created_at = target_registration.created_at and earlier.id < target_registration.id)
      )
  ) then
    raise exception '선착순 앞 신청자부터 승인해주세요.';
  end if;

  select count(*)::integer
  into approved_count
  from public.special_lesson_registrations
  where special_lesson_id = target_registration.special_lesson_id
    and status = 'approved';

  if approved_count >= target_lesson.capacity then
    raise exception '모집 인원이 이미 마감되었습니다.';
  end if;

  update public.special_lesson_registrations
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_registration_id;

  return 'approved';
end;
$$;

create or replace function public.get_special_lessons()
returns table (
  id uuid,
  title text,
  description text,
  image_path text,
  starts_at timestamptz,
  instructor text,
  duration_minutes integer,
  capacity integer,
  is_active boolean,
  application_count integer,
  approved_count integer,
  my_registration_id uuid,
  my_status text,
  my_queue_position integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  is_admin := public.current_user_role() = 'admin';

  return query
    with ranked_registrations as (
      select
        slr.*,
        row_number() over (partition by slr.special_lesson_id order by slr.created_at asc, slr.id asc)::integer as queue_position
      from public.special_lesson_registrations slr
      where slr.status in ('pending', 'waitlisted', 'approved')
    ),
    lesson_counts as (
      select
        rr.special_lesson_id,
        count(*)::integer as application_count,
        count(*) filter (where rr.status = 'approved')::integer as approved_count
      from ranked_registrations rr
      group by rr.special_lesson_id
    )
    select
      sl.id,
      sl.title,
      sl.description,
      sl.image_path,
      sl.starts_at,
      sl.instructor,
      sl.duration_minutes,
      sl.capacity,
      sl.is_active,
      coalesce(lc.application_count, 0)::integer as application_count,
      coalesce(lc.approved_count, 0)::integer as approved_count,
      mine.id as my_registration_id,
      case
        when mine.id is null then null
        when mine.status = 'approved' then 'approved'
        when mine.queue_position <= sl.capacity then 'pending'
        else 'waitlisted'
      end as my_status,
      mine.queue_position as my_queue_position,
      sl.created_at
    from public.special_lessons sl
    left join lesson_counts lc on lc.special_lesson_id = sl.id
    left join ranked_registrations mine
      on mine.special_lesson_id = sl.id
      and mine.user_id = auth.uid()
    where sl.is_active = true
      and (is_admin or sl.starts_at >= now())
    order by sl.starts_at asc;
end;
$$;

create or replace function public.get_special_lesson_registrations()
returns table (
  id uuid,
  special_lesson_id uuid,
  special_lesson_title text,
  starts_at timestamptz,
  instructor text,
  capacity integer,
  user_id uuid,
  user_name text,
  status text,
  queue_position integer,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  is_admin := public.current_user_role() = 'admin';

  return query
    with ranked_registrations as (
      select
        slr.*,
        row_number() over (
          partition by slr.special_lesson_id
          order by slr.created_at asc, slr.id asc
        )::integer as queue_position
      from public.special_lesson_registrations slr
      where slr.status in ('pending', 'waitlisted', 'approved')
    )
    select
      rr.id,
      rr.special_lesson_id,
      sl.title as special_lesson_title,
      sl.starts_at,
      sl.instructor,
      sl.capacity,
      rr.user_id,
      p.name as user_name,
      case
        when rr.status = 'approved' then 'approved'
        when rr.queue_position <= sl.capacity then 'pending'
        else 'waitlisted'
      end as status,
      rr.queue_position,
      rr.created_at,
      rr.reviewed_at,
      rp.name as reviewed_by_name
    from ranked_registrations rr
    join public.special_lessons sl on sl.id = rr.special_lesson_id
    join public.profiles p on p.id = rr.user_id
    left join public.profiles rp on rp.id = rr.reviewed_by
    where sl.is_active = true
      and (is_admin or rr.user_id = auth.uid())
      and (is_admin or sl.starts_at >= now() - interval '30 days')
    order by sl.starts_at asc, rr.queue_position asc;
end;
$$;

create or replace function public.enforce_fixed_lesson_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  member_count integer;
  allowed_count integer;
begin
  if TG_OP in ('INSERT', 'UPDATE') and new.is_active = true then
    select
      count(*)::integer,
      min(public.active_member_lesson_capacity(fl.user_id))::integer
    into member_count, allowed_count
    from public.fixed_lessons fl
    where fl.is_active = true
      and fl.weekday = new.weekday
      and fl.slot_hour = new.slot_hour
      and fl.slot_minute = new.slot_minute;

    if member_count > allowed_count then
      raise exception '해당 시간의 고정 수업 인원이 초과되었습니다. 요일 %, 시간 %:%, 현재 %명, 허용 %명입니다.',
        new.weekday,
        new.slot_hour,
        new.slot_minute,
        member_count,
        allowed_count;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists fixed_lessons_capacity_guard on public.fixed_lessons;
create constraint trigger fixed_lessons_capacity_guard
after insert or update on public.fixed_lessons
deferrable initially immediate
for each row execute function public.enforce_fixed_lesson_capacity();

create or replace function public.get_notices()
returns table (
  id uuid,
  title text,
  body text,
  image_path text,
  author text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.title,
    n.body,
    n.image_path,
    coalesce(p.name, '관리자') as author,
    n.created_at
  from public.notices n
  left join public.profiles p on p.id = n.created_by
  order by n.created_at desc;
$$;

create or replace function public.create_notice(
  p_title text,
  p_body text,
  p_image_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_notice_id uuid;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 or length(trim(coalesce(p_body, ''))) = 0 then
    raise exception '공지 제목과 내용을 입력해주세요.';
  end if;

  insert into public.notices (title, body, image_path, created_by)
  values (trim(p_title), trim(p_body), nullif(trim(coalesce(p_image_path, '')), ''), auth.uid())
  returning id into new_notice_id;

  return new_notice_id;
end;
$$;

create or replace function public.get_pass_transactions(p_user_id uuid default null)
returns table (
  id uuid,
  user_id uuid,
  amount integer,
  balance_after integer,
  reason text,
  reservation_id uuid,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_user_id uuid := coalesce(p_user_id, auth.uid());
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if coalesce(public.current_user_role()::text, '') <> 'admin' and target_user_id <> auth.uid() then
    raise exception '권한이 없습니다.';
  end if;

  return query
    select
      pt.id,
      pt.user_id,
      pt.amount,
      pt.balance_after,
      pt.reason,
      pt.reservation_id,
      pt.created_by,
      pt.created_at
    from public.pass_transactions pt
    where pt.user_id = target_user_id
    order by pt.created_at desc;
end;
$$;

create or replace function public.adjust_member_pass(
  p_user_id uuid,
  p_amount integer,
  p_reason text default 'admin_adjustment'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_balance integer;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_amount = 0 then
    raise exception '변경 횟수를 확인해주세요.';
  end if;

  update public.profiles
  set pass_balance = pass_balance + p_amount
  where id = p_user_id
    and role = 'member'
    and pass_balance + p_amount >= 0
  returning pass_balance into next_balance;

  if next_balance is null then
    raise exception '회원 또는 잔여 횟수를 확인해주세요.';
  end if;

  perform public.sync_member_pass_balance(p_user_id, next_balance);

  insert into public.pass_transactions (user_id, amount, balance_after, reason, created_by)
  values (p_user_id, p_amount, next_balance, p_reason, auth.uid());

  return next_balance;
end;
$$;

drop function if exists public.update_member_pass_product(uuid, integer);

create or replace function public.update_member_pass_product(
  p_user_id uuid,
  p_lesson_capacity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_lesson_capacity < 1 or p_lesson_capacity > 3 then
    raise exception '수업 상품은 1:1, 1:2, 1:3 중 하나여야 합니다.';
  end if;

  select pass_balance
  into current_balance
  from public.profiles
  where id = p_user_id
    and role = 'member';

  if current_balance is null then
    raise exception '회원을 확인해주세요.';
  end if;

  insert into public.member_passes (user_id, lesson_capacity, total_count, remaining_count, is_active, created_by)
  values (p_user_id, p_lesson_capacity, greatest(current_balance, 8), current_balance, true, auth.uid())
  on conflict (user_id) where is_active = true
  do update set
    lesson_capacity = excluded.lesson_capacity,
    updated_at = now();

  update public.fixed_lessons
  set
    lesson_capacity = p_lesson_capacity,
    updated_at = now()
  where user_id = p_user_id
    and is_active = true;
end;
$$;

drop function if exists public.toggle_reservation(text);

create or replace function public.toggle_fixed_lesson_absence(p_slot_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
  current_slot public.lesson_slots%rowtype;
  current_fixed_lesson public.fixed_lessons%rowtype;
  existing_absence public.lesson_absences%rowtype;
  active_absence_count integer;
  substitute_count integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_slot_id is null then
    raise exception '예약 시간을 확인할 수 없습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_slot_id::text));

  select *
  into current_slot
  from public.lesson_slots
  where id = p_slot_id and is_active = true
  for update;

  if not found then
    raise exception '예약 시간을 확인할 수 없습니다.';
  end if;

  if current_slot.starts_at <= now() then
    raise exception '지난 수업은 예약할 수 없습니다.';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception '회원 정보를 확인할 수 없습니다.';
  end if;

  if current_profile.role = 'admin' then
    raise exception '관리자는 결석 처리할 수 없습니다.';
  end if;

  select *
  into current_fixed_lesson
  from public.fixed_lessons
  where user_id = auth.uid()
    and is_active = true
    and weekday = extract(isodow from current_slot.starts_at at time zone 'Asia/Seoul')::integer
    and slot_hour = extract(hour from current_slot.starts_at at time zone 'Asia/Seoul')::integer
    and slot_minute = extract(minute from current_slot.starts_at at time zone 'Asia/Seoul')::integer
  for update;

  if not found then
    raise exception '본인의 고정 수업만 결석 처리할 수 있습니다.';
  end if;

  select *
  into existing_absence
  from public.lesson_absences
  where fixed_lesson_id = current_fixed_lesson.id
    and slot_id = p_slot_id
    and user_id = auth.uid()
    and canceled_at is null;

  if found then
    select count(*)::integer
    into active_absence_count
    from public.lesson_absences
    where slot_id = p_slot_id
      and canceled_at is null;

    select count(*)::integer
    into substitute_count
    from public.reservations
    where slot_id = p_slot_id
      and status = 'reserved'
      and canceled_at is null;

    if substitute_count >= active_absence_count then
      raise exception '이미 다른 회원이 대체 예약한 수업은 결석 취소할 수 없습니다.';
    end if;

    update public.lesson_absences
    set canceled_at = now()
    where id = existing_absence.id;

    return 'absenceCanceled';
  end if;

  insert into public.lesson_absences (fixed_lesson_id, slot_id, user_id)
  values (current_fixed_lesson.id, p_slot_id, auth.uid());

  return 'absenceCreated';
end;
$$;

create or replace function public.toggle_open_slot_reservation(p_slot_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
  current_slot public.lesson_slots%rowtype;
  existing_reservation public.reservations%rowtype;
  has_own_fixed_lesson boolean;
  active_absence_count integer;
  substitute_count integer;
  new_reservation_id uuid;
  next_balance integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_slot_id is null then
    raise exception '예약 시간을 확인할 수 없습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_slot_id::text));

  select *
  into current_slot
  from public.lesson_slots
  where id = p_slot_id and is_active = true
  for update;

  if not found then
    raise exception '예약 시간을 확인할 수 없습니다.';
  end if;

  if current_slot.starts_at <= now() then
    raise exception '지난 수업은 예약할 수 없습니다.';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception '회원 정보를 확인할 수 없습니다.';
  end if;

  if current_profile.role = 'admin' then
    raise exception '관리자는 예약할 수 없습니다.';
  end if;

  select *
  into existing_reservation
  from public.reservations
  where slot_id = p_slot_id
    and user_id = auth.uid()
    and status = 'reserved'
    and canceled_at is null;

  if found then
    update public.reservations
    set canceled_at = now()
    where id = existing_reservation.id;

    update public.profiles
    set pass_balance = pass_balance + 1
    where id = auth.uid()
    returning pass_balance into next_balance;

    perform public.sync_member_pass_balance(auth.uid(), next_balance);

    insert into public.pass_transactions (user_id, amount, balance_after, reason, reservation_id, created_by)
    values (auth.uid(), 1, next_balance, 'substitute_canceled', existing_reservation.id, auth.uid());

    return 'substituteCanceled';
  end if;

  select exists (
    select 1
    from public.fixed_lessons fl
    where fl.user_id = auth.uid()
      and fl.is_active = true
      and fl.weekday = extract(isodow from current_slot.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_hour = extract(hour from current_slot.starts_at at time zone 'Asia/Seoul')::integer
      and fl.slot_minute = extract(minute from current_slot.starts_at at time zone 'Asia/Seoul')::integer
  )
  into has_own_fixed_lesson;

  if has_own_fixed_lesson then
    raise exception '본인의 고정 수업은 결석 처리로 열어주세요.';
  end if;

  select count(*)::integer
  into active_absence_count
  from public.lesson_absences la
  join public.fixed_lessons fl on fl.id = la.fixed_lesson_id
  where la.slot_id = p_slot_id
    and la.canceled_at is null
    and fl.is_active = true
    and fl.weekday = extract(isodow from current_slot.starts_at at time zone 'Asia/Seoul')::integer
    and fl.slot_hour = extract(hour from current_slot.starts_at at time zone 'Asia/Seoul')::integer
    and fl.slot_minute = extract(minute from current_slot.starts_at at time zone 'Asia/Seoul')::integer;

  if active_absence_count = 0 then
    raise exception '아직 열린 수업이 아닙니다.';
  end if;

  select count(*)::integer
  into substitute_count
  from public.reservations
  where slot_id = p_slot_id
    and status = 'reserved'
    and canceled_at is null;

  if substitute_count >= active_absence_count then
    raise exception '이미 대체 예약이 마감되었습니다.';
  end if;

  if current_profile.pass_balance <= 0 then
    raise exception '남은 횟수가 없습니다.';
  end if;

  perform public.assert_lesson_slot_can_accept_member(p_slot_id, auth.uid());

  insert into public.reservations (slot_id, user_id, status)
  values (p_slot_id, auth.uid(), 'reserved')
  returning id into new_reservation_id;

  update public.profiles
  set pass_balance = pass_balance - 1
  where id = auth.uid()
  returning pass_balance into next_balance;

  perform public.sync_member_pass_balance(auth.uid(), next_balance);

  insert into public.pass_transactions (user_id, amount, balance_after, reason, reservation_id, created_by)
  values (auth.uid(), -1, next_balance, 'substitute_reserved', new_reservation_id, auth.uid());

  return 'substituteReserved';
end;
$$;

create or replace function public.toggle_reservation(p_slot_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.toggle_open_slot_reservation(p_slot_id);
end;
$$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select on public.member_passes to authenticated;
grant select on public.lesson_slots to authenticated;
grant select on public.fixed_lessons to authenticated;
grant select on public.lesson_absences to authenticated;
grant select on public.reservations to authenticated;
grant select on public.lesson_change_requests to authenticated;
grant select on public.lesson_assignment_requests to authenticated;
grant select on public.lesson_feedbacks to authenticated;
grant select on public.special_lessons to authenticated;
grant select on public.special_lesson_registrations to authenticated;
grant select on public.pass_transactions to authenticated;
grant select on public.notices to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.get_lesson_slots_snapshot(date, integer) to authenticated;
grant execute on function public.get_member_summaries() to authenticated;
grant execute on function public.get_my_fixed_lessons() to authenticated;
grant execute on function public.upsert_fixed_lesson(uuid, integer, integer, integer, text) to authenticated;
grant execute on function public.update_fixed_lesson(uuid, integer, integer, integer, text) to authenticated;
grant execute on function public.cancel_fixed_lesson(uuid) to authenticated;
grant execute on function public.update_lesson_slot_instructor(uuid, text) to authenticated;
grant execute on function public.create_lesson_slot(date, integer, integer, text, integer, integer) to authenticated;
grant execute on function public.update_lesson_slot_details(uuid, text, integer, integer) to authenticated;
grant execute on function public.cancel_lesson_slot(uuid) to authenticated;
grant execute on function public.admin_assign_lesson_reservation(uuid, uuid) to authenticated;
grant execute on function public.admin_cancel_lesson_reservation(uuid, uuid) to authenticated;
grant execute on function public.create_lesson_change_request(uuid) to authenticated;
grant execute on function public.cancel_lesson_change_request(uuid) to authenticated;
grant execute on function public.review_lesson_change_request(uuid, boolean) to authenticated;
grant execute on function public.get_lesson_change_requests() to authenticated;
grant execute on function public.create_lesson_assignment_request(uuid, text) to authenticated;
grant execute on function public.cancel_lesson_assignment_request(uuid) to authenticated;
grant execute on function public.review_lesson_assignment_request(uuid, boolean) to authenticated;
grant execute on function public.get_lesson_assignment_requests() to authenticated;
grant execute on function public.upsert_lesson_feedback(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.get_lesson_feedbacks() to authenticated;
grant execute on function public.get_lesson_feedback_targets(integer) to authenticated;
grant execute on function public.create_special_lesson(text, text, timestamptz, text, integer, integer, text) to authenticated;
grant execute on function public.apply_special_lesson(uuid) to authenticated;
grant execute on function public.cancel_special_lesson_registration(uuid) to authenticated;
grant execute on function public.review_special_lesson_registration(uuid, boolean) to authenticated;
grant execute on function public.get_special_lessons() to authenticated;
grant execute on function public.get_special_lesson_registrations() to authenticated;
grant execute on function public.get_notices() to authenticated;
grant execute on function public.create_notice(text, text, text) to authenticated;
grant execute on function public.get_pass_transactions(uuid) to authenticated;
grant execute on function public.adjust_member_pass(uuid, integer, text) to authenticated;
grant execute on function public.update_member_pass_product(uuid, integer) to authenticated;
grant execute on function public.toggle_fixed_lesson_absence(uuid) to authenticated;
grant execute on function public.toggle_open_slot_reservation(uuid) to authenticated;
grant execute on function public.toggle_reservation(uuid) to authenticated;
