-- Travel Buddy Extras: Dokumente-Safe, Notfall-Kontakte, Merkliste, To-dos.

-- ---------------------------------------------------------------------------
-- Dokumente-Safe (Pass, Visum, Versicherung, Impfpass …)
-- Die Bilder/PDFs hängen wie bei Tickets in public.documents.
-- ---------------------------------------------------------------------------
create table if not exists public.travel_docs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null default 'other'
                check (category in ('passport','visa','insurance','health','license','other')),
  owner       text,                 -- für wen, z. B. "Robin", "beide"
  number      text,                 -- Dokument-/Policennummer (optional)
  expires_on  date,
  notes       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

alter table public.documents add column if not exists travel_doc_id uuid references public.travel_docs(id) on delete cascade;
create index if not exists documents_travel_doc_idx on public.documents (travel_doc_id);
alter table public.documents drop constraint if exists documents_one_parent;
alter table public.documents add constraint documents_one_parent
  check (num_nonnulls(transport_id, stay_id, travel_doc_id) = 1);

-- ---------------------------------------------------------------------------
-- Eigene Notfall-Kontakte (Versicherung, Botschaft, Bank-Sperrnummer …)
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  phone       text,
  note        text,
  sort        integer not null default 100,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Merkliste: Orte, die man sich ansehen möchte, pro Insel/Stadt
-- ---------------------------------------------------------------------------
create table if not exists public.places (
  id          uuid primary key default gen_random_uuid(),
  area        text not null,        -- Ort/Insel, z. B. "Koh Tao"
  name        text not null,
  category    text not null default 'other'
                check (category in ('beach','food','activity','sight','other')),
  url         text,
  note        text,
  done        boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- To-dos, optional an eine Fahrt oder Unterkunft gehängt
-- ---------------------------------------------------------------------------
create table if not exists public.todos (
  id            uuid primary key default gen_random_uuid(),
  text          text not null,
  done          boolean not null default false,
  due_on        date,
  transport_id  uuid references public.transports(id) on delete cascade,
  stay_id       uuid references public.stays(id) on delete cascade,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists todos_transport_idx on public.todos (transport_id);
create index if not exists todos_stay_idx on public.todos (stay_id);

-- ---------------------------------------------------------------------------
-- Zugriff: wie überall nur für freigeschaltete Mitglieder
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['travel_docs','contacts','places','todos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "members all" on public.%I', t);
    execute format(
      'create policy "members all" on public.%I for all to authenticated
         using ((select private.is_member()))
         with check ((select private.is_member()))', t);
  end loop;
end $$;
