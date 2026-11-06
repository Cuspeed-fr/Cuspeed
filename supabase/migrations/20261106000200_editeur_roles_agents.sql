-- Cuspeed : le compte du tableau de bord peut prendre les rôles des agents le temps d'un lot
-- (décision de Chris, 6 novembre 2026)
--
-- Les lots de fiches préparés par les agents s'exécutent avec « set local role agent_extracteur »
-- puis « set local role agent_verificateur » : les droits et la protection des lignes (RLS) des agents
-- s'appliquent alors comme si les agents écrivaient eux-mêmes (fiches créées au statut « a-verifier »
-- uniquement, pas de modification d'une fiche validée).
-- Dans l'éditeur SQL de Supabase, Chris est connecté avec le rôle « postgres ». Ce rôle a créé les
-- rôles des agents mais n'en est pas membre : la base refuse le changement de rôle
-- (« permission denied to set role »). On lui donne ce droit, et seulement ce droit.
--
-- Effet sur la sécurité :
-- - « postgres » est déjà propriétaire de toutes les tables : il ne gagne aucun pouvoir, il peut
--   seulement se restreindre volontairement aux droits d'un agent ;
-- - les agents ne gagnent rien : l'adhésion va de l'agent vers « postgres », jamais l'inverse ;
-- - « inherit false » (PostgreSQL 16 et plus) : « postgres » ne cumule pas les droits des agents,
--   il ne les prend qu'après un « set role » explicite ;
-- - lecteur_sauvegarde n'est pas concerné.

do $$
begin
  if not exists (select from pg_roles where rolname = 'postgres') then
    raise notice 'Rôle postgres absent : rien à faire';
    return;
  end if;
  if current_setting('server_version_num')::int >= 160000 then
    execute 'grant agent_extracteur   to postgres with inherit false, set true';
    execute 'grant agent_verificateur to postgres with inherit false, set true';
  else
    execute 'grant agent_extracteur   to postgres';
    execute 'grant agent_verificateur to postgres';
  end if;
end $$;
