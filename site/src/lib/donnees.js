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
import { sessionActive } from "./carte-moteur.js";

/**
 * Dossier des données : variable CUSPEED_DATA, sinon le miroir data/ du dépôt.
 * Les commandes npm sont lancées depuis le dossier site/, d'où le « .. ».
 */
export function dossierDonnees() {
  return resolve(process.env.CUSPEED_DATA || join(process.cwd(), "..", "data"));
}

/**
 * Registre des adresses publiées (site/adresses.json).
 * Une adresse de page, une fois publiée, ne change plus, même si l'intitulé change :
 * Google garde l'historique de la page et les liens partagés restent valides.
 * Format :
 *   formations / organismes : { "F0084": "f0084-du-parodontologie" }  adresse figée par identifiant
 *   anciennes : { "f0084-ancien-intitule": "F0084" }  anciennes adresses, redirigées vers l'actuelle
 * Les fiches absentes du registre reçoivent une adresse calculée ; `npm run figer-adresses`
 * les ajoute au registre (par pull request).
 */
export function fichierRegistre() {
  return resolve(process.env.CUSPEED_REGISTRE || join(process.cwd(), "adresses.json"));
}

export function lireRegistre(chemin = fichierRegistre()) {
  const vide = { formations: {}, organismes: {}, anciennes: {} };
  if (!existsSync(chemin)) return vide;
  const r = JSON.parse(readFileSync(chemin, "utf8"));
  return { formations: r.formations ?? {}, organismes: r.organismes ?? {}, anciennes: r.anciennes ?? {} };
}

/** Adresse calculée à partir de l'identifiant et du nom. */
export function adresseCalculee(id, nom) {
  return `${String(id).toLowerCase()}-${enSlug(nom)}`;
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
function formationPublique(f, registre) {
  return {
    id: f.id,
    slug: registre.formations[f.id] ?? adresseCalculee(f.id, f.intitule),
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
    // Remarque publique courte (champ ajouté le 5 novembre 2026, absent des anciennes copies)
    precisions: typeof f.precisions === "string" && f.precisions.trim() ? f.precisions.trim() : null,
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

/** Garde un lien seulement s'il est en http(s) (jamais « javascript: » ou autre). */
function lienSur(url) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) return null;
  try {
    return new URL(url.trim()).hostname ? url.trim() : null;
  } catch {
    return null;
  }
}

function organismePublic(o, registre) {
  // Une présentation n'est publiée que si Chris l'a validée (règle 1) ; sans le champ, rien n'est publié.
  const p = o.presentation_validee === true ? o : {};
  return {
    id: o.id,
    slug: registre.organismes[o.id] ?? adresseCalculee(o.id, o.nom),
    nom: o.nom,
    type: o.type,
    ville: o.ville ?? null,
    site_web: lienSur(o.site_web),
    page_catalogue: lienSur(o.page_catalogue),
    // Présentation (migration 20261114000100) : textes publiés tels qu'en base, équipe réduite à nom et rôle.
    presentation: texteOuNull(p.presentation, 700),
    histoire: texteOuNull(p.histoire, 2000),
    annee_creation: Number.isInteger(p.annee_creation) ? p.annee_creation : null,
    adresse: texteOuNull(p.adresse, 200),
    // Seuls le nom et le rôle d'un membre sortent du chargeur, quoi que contienne la donnée.
    equipe: Array.isArray(p.equipe)
      ? p.equipe
          .filter((m) => m && typeof m.nom === "string" && m.nom.trim())
          .slice(0, 40)
          .map((m) => ({ nom: m.nom.trim().slice(0, 120), role: texteOuNull(m.role, 160) }))
      : [],
    presentation_source: lienSur(p.presentation_source),
    presentation_verifiee_le: /^\d{4}-\d{2}-\d{2}/.test(String(p.presentation_verifiee_le ?? "")) ? String(p.presentation_verifiee_le).slice(0, 10) : null,
    presentation_par: p.presentation_par === "organisme" ? "organisme" : "cuspeed",
  };
}

function texteOuNull(t, max = Infinity) {
  return typeof t === "string" && t.trim() ? t.trim().slice(0, max) : null;
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

export function chargerDonnees(dossier = dossierDonnees(), registre = lireRegistre()) {
  // Chaque page appelle cette fonction : on ne relit les fichiers qu'une fois par construction.
  const cle = `${dossier}|${JSON.stringify(registre)}`;
  if (!cache.has(cle)) cache.set(cle, lireDonnees(dossier, registre));
  return cache.get(cle);
}

function lireDonnees(dossier, registre) {
  const referentiels = lireYaml(join(dossier, "referentiels.yaml"));
  const tousOrganismes = lireYaml(join(dossier, "organismes.yaml")) ?? [];
  const tousLieux = lireYaml(join(dossier, "lieux.yaml")) ?? [];

  const dossierFormations = join(dossier, "formations");
  if (!existsSync(dossierFormations)) {
    throw new Error(`Dossier introuvable : ${dossierFormations}`);
  }

  const fiches = readdirSync(dossierFormations)
    .filter((nom) => nom.endsWith(".yaml"))
    .sort()
    .map((nom) => lireYaml(join(dossierFormations, nom)))
    .filter(Boolean);
  // Identifiants de toutes les fiches, quel que soit leur statut : sert seulement à repérer
  // une ancienne adresse qui renverrait à un identifiant qui n'existe pas.
  const tousIds = new Set(fiches.map((f) => f.id));
  const formations = fiches.filter((f) => f.statut === "validee").map((f) => formationPublique(f, registre));

  const organismesParId = new Map(tousOrganismes.map((o) => [o.id, organismePublic(o, registre)]));
  const lieuxParId = new Map(tousLieux.map((l) => [l.id, lieuPublic(l)]));

  const erreurs = [];
  const vus = new Set();
  for (const f of formations) {
    if (vus.has(f.id)) erreurs.push(`${f.id} : identifiant en double`);
    vus.add(f.id);
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
  // Deux pages ne peuvent pas partager une adresse, et une ancienne adresse ne peut pas
  // être aussi l'adresse actuelle d'une page.
  const adresses = new Map();
  for (const f of formations) {
    if (adresses.has(f.slug)) erreurs.push(`${f.id} : adresse ${f.slug} déjà prise par ${adresses.get(f.slug)}`);
    adresses.set(f.slug, f.id);
  }
  const adressesOrganismes = new Map();
  for (const o of organismesParId.values()) {
    if (adressesOrganismes.has(o.slug)) erreurs.push(`${o.id} : adresse ${o.slug} déjà prise par ${adressesOrganismes.get(o.slug)}`);
    adressesOrganismes.set(o.slug, o.id);
  }
  for (const [ancienne, id] of Object.entries(registre.anciennes)) {
    if (adresses.has(ancienne)) erreurs.push(`ancienne adresse ${ancienne} (${id}) encore utilisée par ${adresses.get(ancienne)}`);
    // Une ancienne adresse ne peut pas prendre la forme d'une adresse courte (« f0084 »).
    if (/^f\d+$/.test(ancienne)) erreurs.push(`ancienne adresse ${ancienne} (${id}) : forme réservée aux adresses courtes`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(ancienne)) erreurs.push(`ancienne adresse ${ancienne} (${id}) : caractères non permis`);
    // L'export de publication ne contient que les fiches validées : un identifiant absent
    // peut être une fiche archivée. Simple avertissement, pas d'arrêt.
    if (!tousIds.has(id)) console.warn(`Ancienne adresse ${ancienne} : identifiant ${id} absent des données, ignorée.`);
  }
  if (erreurs.length) {
    throw new Error("Données incohérentes, construction arrêtée :\n" + erreurs.join("\n"));
  }

  // Redirections : adresse courte /formations/f0084/ et anciennes adresses, vers l'adresse
  // actuelle. Seulement pour les fiches publiées (une fiche retirée n'est jamais mentionnée).
  const parId = new Map(formations.map((f) => [f.id, f]));
  const redirections = [
    ...formations.map((f) => ({ de: f.id.toLowerCase(), vers: f })),
    ...Object.entries(registre.anciennes)
      .filter(([, id]) => parId.has(id))
      .map(([ancienne, id]) => ({ de: ancienne, vers: parId.get(id) })),
  ];
  const nonFigees = formations.filter((f) => !registre.formations[f.id]).map((f) => f.id);

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
    redirections,
    nonFigees,
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
  // Mêmes sessions que la carte : une session terminée ne compte plus (voir sessionActive).
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const noms = formation.sessions
    .filter((s) => sessionActive(s, aujourdhui))
    .map((s) => (s.lieu ? donnees.lieu(s.lieu)?.regroupement_carte : null))
    .filter(Boolean);
  return [...new Set(noms)];
}

/**
 * Tarif lisible, ou null s'il n'est pas renseigné (la page affiche alors « Non communiqué »).
 * Règle du 5 novembre 2026 : le tarif est repris tel que la source l'affiche. Le texte
 * (`tarif_texte`) porte ses mentions (HT, « à partir de », « TVA non applicable », formules) :
 * il est affiché tel quel, en priorité. Le montant seul (« 3 200 € (2026-27) ») ne sert que
 * s'il n'y a pas de texte.
 */
export function tarifLisible(tarif) {
  const texte = typeof tarif?.texte === "string" ? tarif.texte.trim() : "";
  if (texte) return texte;
  if (tarif?.euros != null) {
    const montant = new Intl.NumberFormat("fr-FR").format(tarif.euros);
    return tarif.annee ? `${montant} € (${tarif.annee})` : `${montant} €`;
  }
  return null;
}

/**
 * Prises en charge d'une formation (DPC, FIFPL, OPCO, CPF), dans l'ordre du référentiel.
 * Libellé du référentiel, ou le code en majuscules si le référentiel ne le connaît pas encore.
 */
export function aidesDe(formation, referentiels) {
  const libelles = referentiels?.financements ?? {};
  const ordre = Object.keys(libelles);
  const rang = (c) => (ordre.includes(c) ? ordre.indexOf(c) : ordre.length);
  return [...new Set(formation.financement ?? [])]
    .sort((a, b) => rang(a) - rang(b))
    .map((c) => libelles[c] ?? String(c).toUpperCase());
}

/** Coupe un texte à `max` caractères au plus, à la fin d'un mot, avec « … ». */
export function couper(texte, max) {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max - 1);
  const fin = coupe.lastIndexOf(" ");
  return (fin > max * 0.6 ? coupe.slice(0, fin) : coupe).replace(/[\s.,;:–-]+$/, "") + "…";
}

/** Date du jour à Paris, au format AAAA-MM-JJ (le site est construit à l'avance). */
export function dateDuJour() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
}

/**
 * Sessions à afficher : les éditions passées sont retirées de l'affichage, mais restent en base.
 * Une session est passée quand sa date de fin (ou, à défaut, de début) est antérieure à aujourd'hui.
 * Une session sans aucune date est gardée : on ne sait pas si elle est passée.
 * Les dates sont au format AAAA-MM-JJ, qui se compare bien comme du texte.
 */
export function sessionsAVenir(formation, aujourdhui = dateDuJour()) {
  return (formation.sessions ?? []).filter((s) => {
    const repere = s.fin ?? s.debut;
    return !repere || String(repere) >= aujourdhui;
  });
}

/**
 * Sessions à venir dans l'ordre chronologique : celles qui ont une date de début d'abord
 * (de la plus proche à la plus lointaine), puis celles sans date, dans l'ordre de la fiche.
 */
export function sessionsTriees(formation, aujourdhui = dateDuJour()) {
  const sessions = sessionsAVenir(formation, aujourdhui);
  const datees = sessions.filter((s) => s.debut).sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
  return [...datees, ...sessions.filter((s) => !s.debut)];
}

/**
 * Prochaine session d'une formation : { debut, fin, ville, inscriptions }, ou null.
 * C'est la première session qui n'a pas encore commencé (début aujourd'hui ou plus tard).
 * Une session déjà commencée reste sur la fiche, mais n'est pas « la prochaine » ; une
 * session sans date de début non plus (« Dates non publiées »).
 */
export function prochaineSession(formation, donnees, aujourdhui = dateDuJour()) {
  const s = sessionsTriees(formation, aujourdhui).find((x) => x.debut && String(x.debut) >= aujourdhui);
  if (!s) return null;
  return {
    debut: String(s.debut),
    fin: s.fin ? String(s.fin) : null,
    ville: s.lieu ? donnees.lieu(s.lieu)?.nom ?? null : null,
    inscriptions: s.inscriptions ?? null,
  };
}

/** Date AAAA-MM-JJ → « 12 janv. 2027 » (cartes de la liste, frise des sessions). */
export function dateCourte(iso) {
  if (!iso) return null;
  const [a, m, j] = String(iso).split("-").map(Number);
  if (!a || !m || !j) return String(iso);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(a, m - 1, j)));
}

/** Date AAAA-MM-JJ → « 2 novembre 2026 ». */
export function dateLisible(iso) {
  if (!iso) return null;
  const [a, m, j] = String(iso).split("-").map(Number);
  if (!a || !m || !j) return String(iso);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(a, m - 1, j)));
}
