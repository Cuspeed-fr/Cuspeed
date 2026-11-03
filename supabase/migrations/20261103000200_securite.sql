-- Cuspeed : droits, protection des lignes (RLS), journal automatique
-- Principe : seul Chris (propriétaire de la base, via le tableau de bord) publie ou modifie une fiche validée.

-- Rôles des agents : sans accès tant qu'un mot de passe n'est pas défini à la main (jamais dans le dépôt).
do $$ begin
  if not exists (select from pg_roles where rolname = 'agent_extracteur') then create role agent_extracteur nologin; end if;
  if not exists (select from pg_roles where rolname = 'agent_verificateur') then create role agent_verificateur nologin; end if;
  if not exists (select from pg_roles where rolname = 'lecteur_sauvegarde') then create role lecteur_sauvegarde nologin; end if;
end $$;

-- Accès au schéma (sans effet sur les tables, fermées ci-dessous)
grant usage on schema public to anon, authenticated, agent_extracteur, agent_verificateur, lecteur_sauvegarde;

-- Tout est fermé par défaut ---------------------------------------------------------------------
alter table public.disciplines            enable row level security;
alter table public.types_formation        enable row level security;
alter table public.organismes             enable row level security;
alter table public.lieux                  enable row level security;
alter table public.formations             enable row level security;
alter table public.formation_disciplines  enable row level security;
alter table public.sessions               enable row level security;
alter table public.pistes                 enable row level security;
alter table public.surveillance           enable row level security;
alter table public.propositions           enable row level security;
alter table public.verifications          enable row level security;
alter table public.journal                enable row level security;

revoke all on all tables    in schema public from anon, authenticated, agent_extracteur, agent_verificateur, lecteur_sauvegarde;
revoke all on all sequences in schema public from anon, authenticated, agent_extracteur, agent_verificateur, lecteur_sauvegarde;

-- Public (le site) : lecture seule des fiches validées, sans les notes internes -------------------
grant select on public.disciplines, public.types_formation, public.organismes, public.lieux to anon, authenticated;
grant select (id, intitule, organisme_id, secteur, type, format, duree, volume_horaire_h, tarif_texte, tarif_euros,
              tarif_annee, prerequis, financement, url_officielle, statut, derniere_verification)
  on public.formations to anon, authenticated;
grant select on public.formation_disciplines, public.sessions to anon, authenticated;

create policy lecture_publique on public.disciplines     for select to anon, authenticated using (true);
create policy lecture_publique on public.types_formation for select to anon, authenticated using (true);
create policy lecture_publique on public.organismes      for select to anon, authenticated using (true);
create policy lecture_publique on public.lieux           for select to anon, authenticated using (true);
create policy lecture_publique on public.formations      for select to anon, authenticated using (statut = 'validee');
create policy lecture_publique on public.formation_disciplines for select to anon, authenticated
  using (exists (select 1 from public.formations f where f.id = formation_id and f.statut = 'validee'));
create policy lecture_publique on public.sessions for select to anon, authenticated
  using (exists (select 1 from public.formations f where f.id = formation_id and f.statut = 'validee'));

-- Agent extracteur : crée des fiches « à vérifier », propose des changements, jamais de publication --
grant select on public.disciplines, public.types_formation, public.organismes, public.lieux, public.formations,
                public.formation_disciplines, public.sessions, public.pistes, public.surveillance,
                public.propositions, public.verifications to agent_extracteur;
grant insert on public.organismes, public.lieux to agent_extracteur;
grant insert, update on public.formations, public.pistes, public.surveillance to agent_extracteur;
grant insert, update, delete on public.formation_disciplines, public.sessions to agent_extracteur;
grant insert on public.propositions to agent_extracteur;
grant usage on sequence public.seq_formation to agent_extracteur;
grant usage on all sequences in schema public to agent_extracteur;

create policy ecriture on public.organismes for insert to agent_extracteur with check (true);
create policy ecriture on public.lieux for insert to agent_extracteur with check (true);

create policy creation on public.formations for insert to agent_extracteur with check (statut = 'a-verifier');
create policy modification on public.formations for update to agent_extracteur
  using (statut = 'a-verifier') with check (statut = 'a-verifier');

create policy ecriture on public.formation_disciplines for all to agent_extracteur
  using (exists (select 1 from public.formations f where f.id = formation_id and f.statut = 'a-verifier'))
  with check (exists (select 1 from public.formations f where f.id = formation_id and f.statut = 'a-verifier'));

create policy ecriture on public.sessions for all to agent_extracteur
  using (exists (select 1 from public.formations f where f.id = formation_id and f.statut = 'a-verifier'))
  with check (exists (select 1 from public.formations f where f.id = formation_id and f.statut = 'a-verifier'));

create policy tout on public.pistes       for all to agent_extracteur using (true) with check (true);
create policy tout on public.surveillance for all to agent_extracteur using (true) with check (true);
create policy depot   on public.propositions  for insert to agent_extracteur with check (statut = 'en-attente');

-- Agent vérificateur : lit tout, écrit uniquement son avis ------------------------------------------
grant select on public.disciplines, public.types_formation, public.organismes, public.lieux, public.formations,
                public.formation_disciplines, public.sessions, public.pistes, public.surveillance,
                public.propositions, public.verifications to agent_verificateur;
grant insert on public.verifications to agent_verificateur;
grant usage on all sequences in schema public to agent_verificateur;

create policy depot   on public.verifications         for insert to agent_verificateur with check (true);

-- Copie nocturne : lecture seule de tout, journal compris ------------------------------------------
grant select on all tables in schema public to lecteur_sauvegarde;

-- Lecture interne : les agents et la copie nocturne voient tout (notes incluses), le journal seulement pour la copie
do $$
declare t text;
begin
  foreach t in array array['disciplines','types_formation','organismes','lieux','formations','formation_disciplines',
                           'sessions','pistes','surveillance','propositions','verifications'] loop
    execute format('create policy lecture_interne on public.%I for select to agent_extracteur, agent_verificateur, lecteur_sauvegarde using (true)', t);
  end loop;
end $$;
create policy lecture_interne on public.journal for select to lecteur_sauvegarde using (true);

-- Date de modification ---------------------------------------------------------------------------
create function public.maj_modifie_le() returns trigger language plpgsql as $$
begin new.modifie_le := now(); return new; end $$;
revoke all on function public.maj_modifie_le() from public, anon, authenticated;
create trigger formations_modifie_le before update on public.formations
  for each row execute function public.maj_modifie_le();

-- Journal automatique : qui a changé quoi, quand ----------------------------------------------------
create function public.journaliser() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  anc jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  nou jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  src jsonb := coalesce(nou, anc);
begin
  insert into public.journal (table_nom, ligne_id, action, avant, apres, auteur)
  values (tg_table_name,
          coalesce(src->>'id', (src->>'formation_id') || '/' || coalesce(src->>'discipline', '')),
          tg_op, anc, nou, current_user);
  return null;
end $$;
revoke all on function public.journaliser() from public, anon, authenticated;

create trigger journal_organismes  after insert or update or delete on public.organismes             for each row execute function public.journaliser();
create trigger journal_lieux       after insert or update or delete on public.lieux                  for each row execute function public.journaliser();
create trigger journal_formations  after insert or update or delete on public.formations             for each row execute function public.journaliser();
create trigger journal_disciplines after insert or update or delete on public.formation_disciplines  for each row execute function public.journaliser();
create trigger journal_sessions    after insert or update or delete on public.sessions               for each row execute function public.journaliser();
create trigger journal_propositions after insert or update or delete on public.propositions          for each row execute function public.journaliser();

-- Accepter une proposition (Chris seul : exécution refusée à tous les autres rôles) ---------------
create function public.appliquer_proposition(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.propositions%rowtype;
  t text;
begin
  select * into p from public.propositions where id = p_id and statut = 'en-attente';
  if not found then raise exception 'Proposition % introuvable ou déjà traitée', p_id; end if;
  select format_type(atttypid, atttypmod) into t
    from pg_attribute where attrelid = 'public.formations'::regclass and attname = p.champ;
  execute format('update public.formations set %I = $1::%s, derniere_verification = current_date where id = $2', p.champ, t)
    using p.nouvelle_valeur, p.formation_id;
  update public.propositions set statut = 'acceptee', decide_le = now() where id = p_id;
end $$;
revoke all on function public.appliquer_proposition(bigint) from public, anon, authenticated, agent_extracteur, agent_verificateur;

create function public.refuser_proposition(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update public.propositions set statut = 'refusee', decide_le = now() where id = p_id and statut = 'en-attente';
$$;
revoke all on function public.refuser_proposition(bigint) from public, anon, authenticated, agent_extracteur, agent_verificateur;
