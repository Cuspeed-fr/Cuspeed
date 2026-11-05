-- Cuspeed : discipline « Gestion & management du cabinet » et prises en charge OPCO et CPF
-- (décisions de Chris, 5 novembre 2026 au soir)
--
-- 1. Les formations sur les ressources humaines, le management, la gestion financière et l'organisation
--    du cabinet n'entraient dans aucune discipline existante. Elles sont rangées sous le code `gestion`.
--    Seule une ligne du référentiel est ajoutée : le public lit déjà toutes les disciplines, et
--    l'extracteur peut ranger une fiche à vérifier dans n'importe quelle discipline existante.
--    « on conflict do nothing » : la ligne n'est pas recréée si elle existe déjà.
--
-- 2. Le champ `financement` (affiché « Éligible aux aides » sur le site) accepte, en plus du DPC et du
--    FIFPL, l'OPCO (par exemple OPCO EP) et le CPF. Uniquement si la source officielle l'écrit.
--
-- Aucun droit ne change. Le miroir data/referentiels.yaml recevra la discipline à la copie suivante.

insert into public.disciplines (code, libelle)
values ('gestion', 'Gestion & management du cabinet')
on conflict (code) do nothing;

-- Contrainte créée par 20261103000100_schema.sql (nom attribué par PostgreSQL : formations_financement_check).
alter table public.formations drop constraint formations_financement_check;
alter table public.formations add constraint formations_financement_check
  check (financement <@ array['dpc','fifpl','opco','cpf']);
