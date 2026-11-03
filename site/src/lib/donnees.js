// Chargement des données publiques du site.
//
// Le site est construit à partir d'un dossier au format du miroir `data/`
// (voir docs/modele-de-donnees.md). En production, ce dossier est l'export des
// seules fiches validées (scripts/sauvegarder_vers_yaml.py --seulement-validees).
// Par sécurité, ce module refiltre quand même : il ne garde que les fiches au
// statut `validee` et ne recopie que les champs publics, nommés un par un.
// Les notes internes, les pistes et les sources surveillées ne sont jamais lues.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

/**
 * Dossier des données : variable CUSPEED_DATA, sinon le miroir data/ du dépôt.
 * Les commandes npm sont lancées depuis le dossier site/, d'où le « .. ».
 */
export function dossierDonnees() {
  return resolve(process.env.CUSPEED_DATA || join(process.cwd(), "..", "data"));
}

function lireYaml(chemin) {
  return parse(readFileSync(chemin, "utf8"));
}

/** Transforme un intitulé en adresse lisible : « DU Parodontologie » → « du-parodontologie ». */
export function enSlug(texte) {
  return String(texte)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Ne garde que les champs publics d'une fiche formation. */
function formationPublique(f) {
  return {
    id: f.id,
    slug: `${f.id.toLowerCase()}-${enSlug(f.intitule)}`,
    intitule: f.intitule,
    organisme: f.organisme,
    secteur: f.secteur,
    type: f.type,
    disciplines: Array.isArray(f.disciplines) ? [...f.disciplines] : [],
    format: f.format ?? null,
    duree: f.duree ?? null,
    volume_horaire_h: f.volume_horaire_h ?? null,
    tarif: {
      texte: f.tarif?.texte ?? null,
      euros: f.tarif?.euros ?? null,
      annee: f.tarif?.annee ?? null,
    },
    prerequis: f.prerequis ?? null,
    financement: Array.isArray(f.financement) ? [...f.financement] : [],
    url_officielle: f.url_officielle,
    sessions: (f.sessions ?? []).map((s) => ({
      lieu: s.lieu ?? null,
      debut: s.debut ?? null,
      fin: s.fin ?? null,
      inscriptions: s.inscriptions ?? null,
      places: s.places ?? null,
    })),
    derniere_verification: f.derniere_verification ?? null,
  };
}

function organismePublic(o) {
  return {
    id: o.id,
    slug: `${o.id.toLowerCase()}-${enSlug(o.nom)}`,
    nom: o.nom,
    type: o.type,
    ville: o.ville ?? null,
    site_web: o.site_web ?? null,
    page_catalogue: o.page_catalogue ?? null,
  };
}

function lieuPublic(l) {
  return {
    id: l.id,
    nom: l.nom,
    latitude: l.latitude ?? null,
    longitude: l.longitude ?? null,
    regroupement_carte: l.regroupement_carte ?? null,
  };
}

/**
 * Charge toutes les données publiques.
 * Lève une erreur (et fait donc échouer la construction) si une fiche validée
 * renvoie à un organisme, un lieu, un type ou une discipline inconnus, ou n'a pas
 * de source officielle : mieux vaut ne rien publier que publier une fiche bancale.
 */
const cache = new Map();

export function chargerDonnees(dossier = dossierDonnees()) {
  // Chaque page appelle cette fonction : on ne relit les fichiers qu'une fois par construction.
  if (!cache.has(dossier)) cache.set(dossier, lireDonnees(dossier));
  return cache.get(dossier);
}

function lireDonnees(dossier) {
  const referentiels = lireYaml(join(dossier, "referentiels.yaml"));
  const tousOrganismes = lireYaml(join(dossier, "organismes.yaml")) ?? [];
  const tousLieux = lireYaml(join(dossier, "lieux.yaml")) ?? [];

  const dossierFormations = join(dossier, "formations");
  if (!existsSync(dossierFormations)) {
    throw new Error(`Dossier introuvable : ${dossierFormations}`);
  }

  const formations = readdirSync(dossierFormations)
    .filter((nom) => nom.endsWith(".yaml"))
    .sort()
    .map((nom) => lireYaml(join(dossierFormations, nom)))
    .filter((f) => f && f.statut === "validee")
    .map(formationPublique);

  const organismesParId = new Map(tousOrganismes.map((o) => [o.id, organismePublic(o)]));
  const lieuxParId = new Map(tousLieux.map((l) => [l.id, lieuPublic(l)]));

  const erreurs = [];
  for (const f of formations) {
    if (!/^https?:\/\//.test(f.url_officielle ?? "")) erreurs.push(`${f.id} : source officielle absente`);
    if (!organismesParId.has(f.organisme)) erreurs.push(`${f.id} : organisme inconnu ${f.organisme}`);
    if (!referentiels.types?.[f.type]) erreurs.push(`${f.id} : type inconnu ${f.type}`);
    for (const d of f.disciplines) {
      if (!referentiels.disciplines?.[d]) erreurs.push(`${f.id} : discipline inconnue ${d}`);
    }
    for (const s of f.sessions) {
      if (s.lieu && !lieuxParId.has(s.lieu)) erreurs.push(`${f.id} : lieu inconnu ${s.lieu}`);
    }
  }
  if (erreurs.length) {
    throw new Error("Données incohérentes, construction arrêtée :\n" + erreurs.join("\n"));
  }

  // Seuls les organismes et lieux qui ont au moins une formation publiée sont exposés.
  const idsOrganismes = new Set(formations.map((f) => f.organisme));
  const idsLieux = new Set(formations.flatMap((f) => f.sessions.map((s) => s.lieu)).filter(Boolean));
  const organismes = [...organismesParId.values()].filter((o) => idsOrganismes.has(o.id));
  const lieux = [...lieuxParId.values()].filter((l) => idsLieux.has(l.id));

  return {
    referentiels: {
      disciplines: referentiels.disciplines ?? {},
      types: referentiels.types ?? {},
      types_universitaires: referentiels.types_universitaires ?? [],
      secteurs: referentiels.secteurs ?? {},
      formats: referentiels.formats ?? {},
      inscriptions: referentiels.inscriptions ?? {},
      financements: referentiels.financements ?? {},
      types_organisme: referentiels.types_organisme ?? {},
    },
    formations,
    organismes,
    lieux,
    organisme: (id) => organismesParId.get(id),
    lieu: (id) => lieuxParId.get(id),
  };
}

/** Villes d'une formation, sans doublon, dans l'ordre des sessions. */
export function villesDe(formation, donnees) {
  const noms = formation.sessions
    .map((s) => (s.lieu ? donnees.lieu(s.lieu)?.nom : null))
    .filter(Boolean);
  return [...new Set(noms)];
}

/** Regroupements de carte (ex. « Paris / IDF ») d'une formation. */
export function regroupementsDe(formation, donnees) {
  const noms = formation.sessions
    .map((s) => (s.lieu ? donnees.lieu(s.lieu)?.regroupement_carte : null))
    .filter(Boolean);
  return [...new Set(noms)];
}

/** Tarif lisible : « 3 200 € (2026-27) », le texte de la source, ou null. */
export function tarifLisible(tarif) {
  if (tarif?.euros != null) {
    const montant = new Intl.NumberFormat("fr-FR").format(tarif.euros);
    return tarif.annee ? `${montant} € (${tarif.annee})` : `${montant} €`;
  }
  return tarif?.texte ?? null;
}

/** Date AAAA-MM-JJ → « 2 novembre 2026 ». */
export function dateLisible(iso) {
  if (!iso) return null;
  const [a, m, j] = String(iso).split("-").map(Number);
  if (!a || !m || !j) return String(iso);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(a, m - 1, j)));
}
