-- Cuspeed : propositions de changement étendues aux prises en charge, au type, aux disciplines et aux
-- sessions (campagne de complétion des fiches, 8 novembre 2026)
--
-- Jusqu'ici, une fiche publiée ne pouvait recevoir de proposition que sur ses champs texte et nombre.
-- Les dates de session, les prises en charge (DPC, FIFPL, OPCO, CPF), le type et les disciplines
-- restaient donc vides sur les fiches publiées, même quand la source officielle les donne.
--
-- Ce qui change :
-- - un agent peut proposer `financement`, `type`, `disciplines` et `sessions` (comme les autres champs :
--   dépôt seulement, Chris décide) ;
-- - `appliquer_proposition` (Chris seul) sait appliquer ces champs :
--     financement : tableau texte, ex. {dpc,fifpl}
--     type        : code de type, ex. du
--     disciplines : tableau texte, ex. {paro,implanto} — remplace la liste de la fiche
--     sessions    : tableau JSON, ex. [{"lieu":"L-LILLE","debut":"2027-01-15","fin":null,
--                   "inscriptions":"ouvertes","places":12}] — remplace les sessions de la fiche
--   Les contraintes habituelles s'appliquent (code inconnu, session qui finit avant de commencer,
--   lieu inexistant) : une proposition invalide échoue sans rien modifier. En plus :
--     disciplines vide ou absente : refusée (une fiche a toujours au moins une discipline) ;
--     sessions : doit être un tableau JSON ; chaque session n'a que les clés lieu, debut, fin,
--     inscriptions, places, et au moins un lieu ou une date ; « [] » (explicite) retire toutes les
--     sessions ; une valeur absente est refusée.
-- - Droits inchangés : les agents, le public et lecteur_sauvegarde ne peuvent pas appliquer une
--   proposition. Seuls le propriétaire (Chris, tableau de bord) et le rôle service_role de Supabase
--   (que la règle 8 interdit aux agents) en ont le droit ; on retire aussi ce dernier droit ci-dessous.

alter table public.propositions drop constraint propositions_champ_check;
alter table public.propositions add constraint propositions_champ_check
  check (champ in ('intitule','duree','volume_horaire_h','tarif_texte','tarif_euros','tarif_annee',
                   'prerequis','url_officielle','format','notes','precisions',
                   'financement','type','disciplines','sessions'));

create or replace function public.appliquer_proposition(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.propositions%rowtype;
  t text;
  v jsonb;
  s jsonb;
begin
  select * into p from public.propositions where id = p_id and statut = 'en-attente' for update;
  if not found then raise exception 'Proposition % introuvable ou déjà traitée', p_id; end if;

  if p.champ = 'disciplines' then
    if p.nouvelle_valeur is null or cardinality(p.nouvelle_valeur::text[]) = 0 then
      raise exception 'Proposition % : une fiche garde au moins une discipline (valeur vide refusée)', p_id;
    end if;
    delete from public.formation_disciplines where formation_id = p.formation_id;
    insert into public.formation_disciplines (formation_id, discipline)
      select distinct p.formation_id, d from unnest(p.nouvelle_valeur::text[]) as d;
    update public.formations set derniere_verification = current_date where id = p.formation_id;

  elsif p.champ = 'sessions' then
    if p.nouvelle_valeur is null then
      raise exception 'Proposition % : sessions absentes (pour tout retirer, proposer explicitement [])', p_id;
    end if;
    v := p.nouvelle_valeur::jsonb;
    if jsonb_typeof(v) <> 'array' then
      raise exception 'Proposition % : les sessions doivent être un tableau JSON', p_id;
    end if;
    for s in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(s) <> 'object'
         or exists (select 1 from jsonb_object_keys(s) k
                     where k not in ('lieu', 'debut', 'fin', 'inscriptions', 'places')) then
        raise exception 'Proposition % : session mal formée % (clés permises : lieu, debut, fin, inscriptions, places)', p_id, s;
      end if;
      if coalesce(s->>'lieu', s->>'debut', s->>'fin') is null then
        raise exception 'Proposition % : session sans lieu ni date %', p_id, s;
      end if;
    end loop;
    delete from public.sessions where formation_id = p.formation_id;
    insert into public.sessions (formation_id, lieu_id, debut, fin, inscriptions, places)
      select p.formation_id, x.lieu, x.debut, x.fin, coalesce(x.inscriptions, 'a-renseigner'), x.places
        from jsonb_to_recordset(v) as x(lieu text, debut date, fin date, inscriptions text, places integer);
    update public.formations set derniere_verification = current_date where id = p.formation_id;

  else
    select format_type(atttypid, atttypmod) into t
      from pg_attribute where attrelid = 'public.formations'::regclass and attname = p.champ;
    execute format('update public.formations set %I = $1::%s, derniere_verification = current_date where id = $2',
                   p.champ, t)
      using p.nouvelle_valeur, p.formation_id;
  end if;

  update public.propositions set statut = 'acceptee', decide_le = now() where id = p_id;
end $$;
revoke all on function public.appliquer_proposition(bigint)
  from public, anon, authenticated, agent_extracteur, agent_verificateur;
-- service_role (clé d'administration de Supabase, interdite aux agents) n'a pas à accepter de proposition.
do $$ begin
  if exists (select from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.appliquer_proposition(bigint) from service_role';
    execute 'revoke all on function public.refuser_proposition(bigint) from service_role';
  end if;
end $$;
