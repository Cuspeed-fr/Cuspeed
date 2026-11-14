-- Présentation des organismes (demande de Chris, 14 novembre 2026).
-- La page d'un organisme montre, en plus de ses formations : un court paragraphe descriptif, son logo
-- (fichier site/public/logos/), son équipe, son année de création et son histoire.
-- Aujourd'hui, ces textes sont rédigés par Cuspeed d'après le site officiel de l'organisme (source citée,
-- date de vérification) et validés par Chris. Plus tard (V2), l'organisme qui crée son compte pourra
-- les tenir lui-même : `presentation_par` indique qui a écrit la présentation.
-- Données publiques : uniquement ce que l'organisme publie lui-même. L'équipe se limite au nom et au rôle
-- affichés par l'organisme (pas de photo, pas de coordonnées personnelles) ; retrait sur simple demande.

alter table public.organismes
  add column presentation              text check (presentation is null or char_length(presentation) between 40 and 700),
  add column histoire                  text check (histoire is null or char_length(histoire) between 40 and 2000),
  add column annee_creation            smallint check (annee_creation is null or annee_creation between 1800 and 2100),
  add column adresse                   text check (adresse is null or char_length(adresse) <= 200),
  add column equipe                    jsonb check (equipe is null or (jsonb_typeof(equipe) = 'array' and jsonb_array_length(equipe) <= 40)),
  add column presentation_source       text check (presentation_source is null or presentation_source ~ '^https?://'),
  add column presentation_verifiee_le  date,
  add column presentation_par          text not null default 'cuspeed' check (presentation_par in ('cuspeed', 'organisme'));

-- Chaque membre de l'équipe : {"nom": "...", "role": "..."} (rôle facultatif), rien d'autre.
create or replace function public.equipe_valide(e jsonb) returns boolean
language sql immutable as $$
  select e is null or not exists (
    select 1 from jsonb_array_elements(e) m
    where jsonb_typeof(m) <> 'object'
       or not (m ? 'nom') or jsonb_typeof(m -> 'nom') <> 'string' or char_length(m ->> 'nom') not between 2 and 120
       or (m ? 'role' and (jsonb_typeof(m -> 'role') <> 'string' or char_length(m ->> 'role') > 160))
       or exists (select 1 from jsonb_object_keys(m) k where k not in ('nom', 'role'))
  )
$$;
alter table public.organismes add constraint organismes_equipe_valide check (public.equipe_valide(equipe));

-- Une présentation publiée cite toujours sa source (règle 3 du projet) et sa date de vérification.
alter table public.organismes add constraint organismes_presentation_sourcee check (
  (presentation is null and histoire is null and equipe is null and annee_creation is null)
  or presentation_par = 'organisme'
  or (presentation_source is not null and presentation_verifiee_le is not null)
);

comment on column public.organismes.presentation is 'Court paragraphe descriptif (40 à 700 caractères), rédigé d''après le site officiel, jamais copié d''un site tiers.';
comment on column public.organismes.histoire is 'Histoire de l''organisme (40 à 2000 caractères), d''après le site officiel.';
comment on column public.organismes.equipe is 'Équipe publiée par l''organisme : [{"nom": "...", "role": "..."}], sans photo ni coordonnées.';
comment on column public.organismes.presentation_par is 'cuspeed (rédigée par Cuspeed, source citée) ou organisme (tenue par l''organisme lui-même, V2).';
