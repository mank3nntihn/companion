-- Travel Buddy – Grundschema
-- Unterkünfte, Tickets (Flüge, Fähren, Busse …) und angehängte Dokumente.
-- Zugriff nur für eingeloggte Nutzer, deren E-Mail in public.members steht.

-- ---------------------------------------------------------------------------
-- Mitglieder (Allowlist)
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  email       text primary key check (email = lower(email)),
  name        text,
  created_at  timestamptz not null default now()
);

alter table public.members enable row level security;

create schema if not exists private;
grant usage on schema private to authenticated;

-- Hilfsfunktion im internen Schema, nicht über die API aufrufbar
create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

drop policy if exists "members read" on public.members;
create policy "members read" on public.members
  for select to authenticated using ((select private.is_member()));

-- ---------------------------------------------------------------------------
-- Unterkünfte
-- ---------------------------------------------------------------------------
create table if not exists public.stays (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  platform           text not null default 'other'
                       check (platform in ('booking','airbnb','agoda','hostelworld','direct','other')),
  booking_url        text,
  address            text,
  check_in           date not null,
  check_out          date not null,
  check_in_time      text,           -- z. B. "ab 14:00"
  check_out_time     text,           -- z. B. "bis 11:00"
  confirmation_code  text,
  price              numeric(12,2),
  currency           text default 'EUR',
  paid               boolean not null default false,
  contact            text,           -- Telefon / WhatsApp des Hosts
  notes              text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint stays_dates check (check_out >= check_in)
);

create index if not exists stays_check_in_idx on public.stays (check_in);

-- ---------------------------------------------------------------------------
-- Tickets / Transporte
-- Zeiten werden als lokale Uhrzeit + Zeitzone des Ortes gespeichert,
-- damit "09:00 ab Phuket" immer 09:00 Thai-Zeit bleibt.
-- ---------------------------------------------------------------------------
create table if not exists public.transports (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null default 'ferry'
                        check (kind in ('flight','ferry','bus','train','taxi','other')),
  title               text,            -- optional, z. B. "Speedboat nach Koh Phi Phi"
  carrier             text,            -- Airline / Fährgesellschaft
  number              text,            -- Flugnummer o. Ä.
  from_place          text not null,
  to_place            text not null,
  departure_location  text,            -- Pier, Terminal, Treffpunkt
  arrival_location    text,
  departure_local     timestamp not null,
  departure_tz        text not null default 'Asia/Bangkok',
  arrival_local       timestamp,
  arrival_tz          text,
  be_there_minutes    integer check (be_there_minutes is null or be_there_minutes between 0 and 600),
  confirmation_code   text,
  booking_url         text,
  seats               text,
  baggage             text,
  notes               text,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists transports_departure_idx on public.transports (departure_local);

-- ---------------------------------------------------------------------------
-- Dokumente (Tickets, Buchungsbestätigungen, Boarding Pässe)
-- Datei liegt im privaten Storage-Bucket "documents".
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  transport_id  uuid references public.transports(id) on delete cascade,
  stay_id       uuid references public.stays(id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  label         text,                  -- z. B. "Robin", "Boarding Pass"
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint documents_one_parent check (num_nonnulls(transport_id, stay_id) = 1)
);

create index if not exists documents_transport_idx on public.documents (transport_id);
create index if not exists documents_stay_idx on public.documents (stay_id);

-- ---------------------------------------------------------------------------
-- updated_at automatisch pflegen
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stays_touch on public.stays;
create trigger stays_touch before update on public.stays
  for each row execute function public.touch_updated_at();

drop trigger if exists transports_touch on public.transports;
create trigger transports_touch before update on public.transports
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: alles nur für Mitglieder
-- ---------------------------------------------------------------------------
alter table public.stays      enable row level security;
alter table public.transports enable row level security;
alter table public.documents  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['stays','transports','documents'] loop
    execute format('drop policy if exists "members all" on public.%I', t);
    execute format(
      'create policy "members all" on public.%I for all to authenticated
         using ((select private.is_member()))
         with check ((select private.is_member()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: privater Bucket für Dokumente (max. 20 MB pro Datei)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "documents members select" on storage.objects;
create policy "documents members select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (select private.is_member()));

drop policy if exists "documents members insert" on storage.objects;
create policy "documents members insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (select private.is_member()));

drop policy if exists "documents members update" on storage.objects;
create policy "documents members update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (select private.is_member()));

drop policy if exists "documents members delete" on storage.objects;
create policy "documents members delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (select private.is_member()));

-- ---------------------------------------------------------------------------
-- Eure beiden Google-E-Mail-Adressen eintragen (kleingeschrieben), z. B.:
-- insert into public.members (email, name) values
--   ('du@gmail.com', 'Robin'),
--   ('sie@gmail.com', '…');
-- ---------------------------------------------------------------------------
