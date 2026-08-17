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
-- Le tabelle sono CHIUSE alla chiave anon: nessuna policy per quel ruolo, né in
-- lettura né in scrittura. Il browser scrive solo attraverso le funzioni RPC
-- definite più sotto, che validano i dati.
--
-- Perché non permettere l'insert diretto: PostgREST esegue gli upsert come
-- INSERT ... ON CONFLICT e gli update come UPDATE ... WHERE, e in entrambi i casi
-- Postgres pretende anche una policy di SELECT. Concederla significherebbe
-- rendere leggibili a chiunque le risposte di tutti.
--
-- La lettura resta riservata agli utenti autenticati (il facilitatore, creato a
-- mano in Authentication → Users).

alter table public.participants enable row level security;
alter table public.sessions     enable row level security;
alter table public.answers      enable row level security;

-- Policy della prima versione dello schema, se presenti: non servono più.
drop policy if exists "participants insert anon" on public.participants;
drop policy if exists "sessions insert anon"     on public.sessions;
drop policy if exists "sessions update open"     on public.sessions;
drop policy if exists "answers insert anon"      on public.answers;
drop policy if exists "answers update anon"      on public.answers;

drop policy if exists "participants select auth" on public.participants;
create policy "participants select auth" on public.participants
  for select to authenticated using (true);

drop policy if exists "sessions select auth" on public.sessions;
create policy "sessions select auth" on public.sessions
  for select to authenticated using (true);

drop policy if exists "answers select auth" on public.answers;
create policy "answers select auth" on public.answers
  for select to authenticated using (true);

grant usage on schema public to anon, authenticated;
revoke insert, update, delete on public.participants from anon;
revoke insert, update, delete on public.sessions     from anon;
revoke insert, update, delete on public.answers      from anon;
grant select on public.participants, public.sessions, public.answers to authenticated;

-- --------------------------------------------------------- API di scrittura
-- Funzioni SECURITY DEFINER: girano con i privilegi del proprietario, quindi
-- scrivono sulle tabelle chiuse, ma solo dopo aver validato gli argomenti.

create or replace function public.register_participant(p_first text, p_last text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  p_first := btrim(coalesce(p_first, ''));
  p_last  := btrim(coalesce(p_last, ''));

  if char_length(p_first) < 2 or char_length(p_last) < 2 then
    raise exception 'nome e cognome sono obbligatori (almeno due caratteri)' using errcode = '22023';
  end if;

  insert into participants (first_name, last_name)
  values (left(p_first, 80), left(p_last, 80))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.start_session(
  p_participant uuid,
  p_items       text[],
  p_user_agent  text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from participants where id = p_participant) then
    raise exception 'partecipante inesistente' using errcode = '23503';
  end if;

  if p_items is null or array_length(p_items, 1) is distinct from 12 then
    raise exception 'la sessione deve contenere 12 item' using errcode = '22023';
  end if;

  insert into sessions (participant_id, item_ids, user_agent)
  values (p_participant, p_items, left(coalesce(p_user_agent, ''), 300))
  returning id into v_id;

  return v_id;
end;
$$;

/* Una risposta per volta, salvata mentre il partecipante compila. */
create or replace function public.save_answer(
  p_session   uuid,
  p_item      text,
  p_dimension text,
  p_value     smallint,
  p_position  smallint default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from sessions where id = p_session and completed_at is null) then
    raise exception 'sessione inesistente o già conclusa' using errcode = '22023';
  end if;

  insert into answers (session_id, item_id, dimension, value, position)
  values (p_session, upper(btrim(p_item)), upper(btrim(p_dimension)), p_value, p_position)
  on conflict (session_id, item_id) do update
    set value = excluded.value,
        position = excluded.position,
        answered_at = now();
end;
$$;

/* Tutte le risposte in un colpo: [{"item_id":"C1","dimension":"COMP","value":3,"position":1}, ...] */
create or replace function public.save_answers(p_session uuid, p_answers jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
begin
  if not exists (select 1 from sessions where id = p_session and completed_at is null) then
    raise exception 'sessione inesistente o già conclusa' using errcode = '22023';
  end if;

  for r in
    select * from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb))
      as x(item_id text, dimension text, value smallint, "position" smallint)
  loop
    insert into answers (session_id, item_id, dimension, value, position)
    values (p_session, upper(btrim(r.item_id)), upper(btrim(r.dimension)), r.value, r."position")
    on conflict (session_id, item_id) do update
      set value = excluded.value,
          position = excluded.position,
          answered_at = now();
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

/* Chiusura: ammessa una sola volta per sessione. */
create or replace function public.complete_session(
  p_session   uuid,
  p_total     smallint,
  p_band      text,
  p_dim_means jsonb,
  p_alerts    text[]
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update sessions
     set total = p_total,
         band = p_band,
         dim_means = p_dim_means,
         alerts = p_alerts,
         completed_at = now(),
         updated_at = now()
   where id = p_session
     and completed_at is null;

  if not found then
    raise exception 'sessione inesistente o già conclusa' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.register_participant(text, text) from public;
revoke all on function public.start_session(uuid, text[], text) from public;
revoke all on function public.save_answer(uuid, text, text, smallint, smallint) from public;
revoke all on function public.save_answers(uuid, jsonb) from public;
revoke all on function public.complete_session(uuid, smallint, text, jsonb, text[]) from public;

grant execute on function public.register_participant(text, text) to anon, authenticated;
grant execute on function public.start_session(uuid, text[], text) to anon, authenticated;
grant execute on function public.save_answer(uuid, text, text, smallint, smallint) to anon, authenticated;
grant execute on function public.save_answers(uuid, jsonb) to anon, authenticated;
grant execute on function public.complete_session(uuid, smallint, text, jsonb, text[]) to anon, authenticated;

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
