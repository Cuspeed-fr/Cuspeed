-- Cuspeed : champ public « précisions » sur les fiches formation (décision de Chris, 5 novembre 2026)
--
-- Une courte remarque utile au praticien, affichée sur la fiche : partenariat avec une autre faculté,
-- lieu délocalisé, organisation (« clinique le lundi »)… Jusqu'ici ces remarques
-- avaient été rangées par erreur dans « duree ». Contrairement à « notes » (interne, jamais publié),
-- ce champ est public : il ne doit contenir que des informations tirées de la source officielle.

alter table public.formations
  add column precisions text
  check (precisions is null or (length(trim(precisions)) > 0 and length(precisions) <= 200));

comment on column public.formations.precisions is
  'Remarque publique courte (200 caractères au plus), tirée de la source officielle. Publiée sur le site.';

-- Le public (le site, clé anon) lit les colonnes une par une : on ajoute celle-ci, les notes restent cachées.
grant select (precisions) on public.formations to anon, authenticated;

-- Les propositions de changement peuvent porter sur ce champ.
alter table public.propositions drop constraint propositions_champ_check;
alter table public.propositions add constraint propositions_champ_check
  check (champ in ('intitule','duree','volume_horaire_h','tarif_texte','tarif_euros','tarif_annee',
                   'prerequis','url_officielle','format','notes','precisions'));
