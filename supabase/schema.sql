-- ============================================================================
-- Auto-assessment competenze AI — schema Supabase
-- Da eseguire una volta nel SQL Editor del progetto (o via `supabase db push`).
-- Idempotente: si può rilanciare senza errori.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------- tabelle

create table if not exists public.participants (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name   text not null check (char_length(btrim(last_name))  between 1 and 80),
  created_at  timestamptz not null default now()
);

comment on table public.participants is
  'Registrazione partecipante: solo nome e cognome, nessuna autenticazione.';

create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants(id) on delete cascade,
  item_ids        text[] not null,               -- item estratti, nell'ordine mostrato
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,                   -- null = questionario non concluso
  total           smallint check (total between 12 and 48),
  band            text,
  dim_means       jsonb,                         -- {"COMP":3.00,"USO":4.00,...}
  alerts          text[],                        -- {uso_oltre_verifica,gap_responsabilita}
  user_agent      text
);

comment on table public.sessions is
  'Una riga per compilazione. Resta con completed_at null se il questionario viene abbandonato.';

create table if not exists public.answers (
  session_id   uuid not null references public.sessions(id) on delete cascade,
  item_id      text not null,                    -- C1..C6, U1..U6, V1..V6, R1..R6, S1..S6
  dimension    text not null check (dimension in ('COMP','USO','VAL','RESP','SVIL')),
  value        smallint not null check (value between 1 and 4),
  position     smallint,                         -- posizione nella lista mostrata (1-12)
  answered_at  timestamptz not null default now(),
  primary key (session_id, item_id)              -- chiave dell'upsert progressivo
);

comment on table public.answers is
  'Risposte salvate mentre il partecipante compila: upsert su (session_id, item_id).';

create index if not exists sessions_participant_idx on public.sessions (participant_id);
create index if not exists sessions_started_idx     on public.sessions (started_at desc);
create index if not exists sessions_completed_idx   on public.sessions (completed_at);
create index if not exists answers_item_idx         on public.answers (item_id);

-- Ogni scrittura sulle risposte tiene aggiornato updated_at della sessione:
-- serve a distinguere un abbandono vero da una compilazione ancora in corso.
create or replace function public.touch_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sessions set updated_at = now() where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists answers_touch_session on public.answers;
create trigger answers_touch_session
  after insert or update on public.answers
  for each row execute function public.touch_session();

-- ------------------------------------------------------------------- RLS
-- Il browser usa la chiave anon (pubblica per progetto): può SCRIVERE i propri
-- dati ma non LEGGERE nulla. La lettura è riservata agli utenti autenticati
-- (il facilitatore, creato a mano in Authentication → Users).

alter table public.participants enable row level security;
alter table public.sessions     enable row level security;
alter table public.answers      enable row level security;

-- partecipanti: registrazione libera, lettura solo autenticata
drop policy if exists "participants insert anon" on public.participants;
create policy "participants insert anon" on public.participants
  for insert to anon, authenticated with check (true);

drop policy if exists "participants select auth" on public.participants;
create policy "participants select auth" on public.participants
  for select to authenticated using (true);

-- sessioni: creazione libera; aggiornabili finché non sono concluse
drop policy if exists "sessions insert anon" on public.sessions;
create policy "sessions insert anon" on public.sessions
  for insert to anon, authenticated with check (completed_at is null);

drop policy if exists "sessions update open" on public.sessions;
create policy "sessions update open" on public.sessions
  for update to anon, authenticated using (completed_at is null);

drop policy if exists "sessions select auth" on public.sessions;
create policy "sessions select auth" on public.sessions
  for select to authenticated using (true);

-- risposte: insert e upsert liberi (l'id sessione è un uuid non indovinabile)
drop policy if exists "answers insert anon" on public.answers;
create policy "answers insert anon" on public.answers
  for insert to anon, authenticated with check (true);

drop policy if exists "answers update anon" on public.answers;
create policy "answers update anon" on public.answers
  for update to anon, authenticated using (true);

drop policy if exists "answers select auth" on public.answers;
create policy "answers select auth" on public.answers
  for select to authenticated using (true);

grant usage on schema public to anon, authenticated;
grant insert                on public.participants to anon, authenticated;
grant insert, update        on public.sessions     to anon, authenticated;
grant insert, update        on public.answers      to anon, authenticated;
grant select on public.participants, public.sessions, public.answers to authenticated;

-- ------------------------------------------------------- viste di comodo
-- Per le query dalla dashboard: la pagina facilitatore calcola da sé gli
-- aggregati, queste viste servono a chi guarda i dati con SQL.

create or replace view public.v_sessioni_complete with (security_invoker = true) as
  select s.id,
         p.first_name || ' ' || p.last_name as partecipante,
         s.started_at, s.completed_at, s.total, s.band, s.dim_means, s.alerts
  from public.sessions s
  join public.participants p on p.id = s.participant_id
  where s.completed_at is not null
  order by s.completed_at desc;

create or replace view public.v_medie_item with (security_invoker = true) as
  select a.item_id,
         a.dimension,
         count(*)                    as risposte,
         round(avg(a.value)::numeric, 2) as media
  from public.answers a
  join public.sessions s on s.id = a.session_id
  where s.completed_at is not null
  group by a.item_id, a.dimension
  order by media asc;

grant select on public.v_sessioni_complete, public.v_medie_item to authenticated;
