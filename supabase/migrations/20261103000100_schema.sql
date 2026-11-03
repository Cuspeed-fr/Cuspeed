-- Cuspeed : schéma de la base (Supabase, région Paris)
-- Un identifiant ne change jamais et n'est jamais réutilisé ; une formation disparue passe au statut 'archivee'.

-- Référentiels (valeurs autorisées) -------------------------------------------------------------
create table public.disciplines (
  code    text primary key,
  libelle text not null
);

create table public.types_formation (
  code           text primary key,
  libelle        text not null,
  universitaire  boolean not null default false
);

-- Organismes, lieux ------------------------------------------------------------------------------
create table public.organismes (
  id                 text primary key check (id ~ '^O[0-9]{3,}$'),
  nom                text not null,
  type               text not null check (type in ('universite','societe-savante','industriel','organisme-prive')),
  ville              text,
  site_web           text check (site_web is null or site_web ~ '^https?://'),
  page_catalogue     text check (page_catalogue is null or page_catalogue ~ '^https?://'),
  fiche_revendiquee  boolean not null default false
);

create table public.lieux (
  id                  text primary key check (id ~ '^L-[A-Z0-9-]+$'),
  nom                 text not null,
  adresse             text,
  latitude            numeric(8,5) check (latitude  between -90  and 90),
  longitude           numeric(8,5) check (longitude between -180 and 180),
  regroupement_carte  text
);

-- Formations -------------------------------------------------------------------------------------
create sequence public.seq_formation;

create table public.formations (
  id                     text primary key default ('F' || lpad(nextval('public.seq_formation')::text, 4, '0'))
                         check (id ~ '^F[0-9]{4,}$'),
  intitule               text not null check (length(trim(intitule)) > 0),
  organisme_id           text not null references public.organismes(id),
  secteur                text not null check (secteur in ('universitaire','prive')),
  type                   text not null references public.types_formation(code),
  format                 text check (format in ('presentiel','hybride','en-ligne')),
  duree                  text,
  volume_horaire_h       numeric(6,1) check (volume_horaire_h is null or volume_horaire_h > 0),
  tarif_texte            text,
  tarif_euros            numeric(9,2) check (tarif_euros is null or tarif_euros >= 0),
  tarif_annee            text,
  prerequis              text,
  financement            text[] not null default '{}' check (financement <@ array['dpc','fifpl']),
  url_officielle         text not null check (url_officielle ~ '^https?://'),
  statut                 text not null default 'a-verifier' check (statut in ('a-verifier','validee','archivee')),
  derniere_verification  date,
  notes                  text,            -- interne, jamais publié
  cree_le                timestamptz not null default now(),
  modifie_le             timestamptz not null default now()
);
create index formations_organisme_idx on public.formations(organisme_id);
create index formations_statut_idx on public.formations(statut);

create table public.formation_disciplines (
  formation_id  text not null references public.formations(id) on delete cascade,
  discipline    text not null references public.disciplines(code),
  primary key (formation_id, discipline)
);

create table public.sessions (
  id            bigint generated always as identity primary key,
  formation_id  text not null references public.formations(id) on delete cascade,
  lieu_id       text references public.lieux(id),
  debut         date,
  fin           date,
  inscriptions  text not null default 'a-renseigner'
                check (inscriptions in ('a-renseigner','ouvertes','complet','fermees','annoncee')),
  places        integer check (places is null or places >= 0),
  check (debut is null or fin is null or fin >= debut)
);
create index sessions_formation_idx on public.sessions(formation_id);

-- Veille et pistes -------------------------------------------------------------------------------
create table public.pistes (
  id             text primary key check (id ~ '^P[0-9]{4,}$'),
  intitule       text not null,
  organisme      text,
  ville          text,
  categorie      text,
  url_piste      text,
  url_officielle text,
  repere_sur     text,
  statut         text not null default 'À vérifier',
  notes          text
);

create table public.surveillance (
  id                     bigint generated always as identity primary key,
  url                    text not null unique check (url ~ '^https?://'),
  organisme_id           text references public.organismes(id),
  type                   text not null check (type in ('page','pdf')),
  derniere_verification  date,
  empreinte              text,
  fiabilite              text
);

-- File de validation -----------------------------------------------------------------------------
-- Un agent ne modifie jamais une fiche publiée : il dépose une proposition que Chris accepte ou refuse.
create table public.propositions (
  id               bigint generated always as identity primary key,
  formation_id     text not null references public.formations(id),
  champ            text not null check (champ in ('intitule','duree','volume_horaire_h','tarif_texte','tarif_euros',
                                                  'tarif_annee','prerequis','url_officielle','format','notes')),
  ancienne_valeur  text,
  nouvelle_valeur  text,
  source_url       text not null check (source_url ~ '^https?://'),
  motif            text,
  auteur           text not null default current_user,
  statut           text not null default 'en-attente' check (statut in ('en-attente','acceptee','refusee')),
  cree_le          timestamptz not null default now(),
  decide_le        timestamptz
);
create index propositions_statut_idx on public.propositions(statut);

create table public.verifications (
  id            bigint generated always as identity primary key,
  formation_id  text not null references public.formations(id),
  avis          text not null check (avis in ('conforme','a-corriger','source-introuvable')),
  details       text,
  verificateur  text not null default current_user,
  cree_le       timestamptz not null default now()
);

-- Journal des modifications (rempli automatiquement, voir migration suivante) -------------------
create table public.journal (
  id          bigint generated always as identity primary key,
  table_nom   text not null,
  ligne_id    text,
  action      text not null,
  avant       jsonb,
  apres       jsonb,
  auteur      text not null,
  cree_le     timestamptz not null default now()
);
create index journal_ligne_idx on public.journal(table_nom, ligne_id);
