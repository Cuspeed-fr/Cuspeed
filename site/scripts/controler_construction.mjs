// Contrôle du site construit (dossier dist/), lancé automatiquement après `astro build`.
// Il échoue (code de sortie 1) si le site risque de publier ce qu'il ne doit pas :
//   - une fiche qui n'est pas au statut `validee` ;
//   - une note interne d'une fiche ;
//   - un script, une police ou une feuille de style chargés depuis un autre site ;
//   - quelque chose qui ressemble à un secret (adresse de base avec mot de passe, clé) ;
//   - une page sans titre, sans description ou sans adresse canonique, ou un titre ou une
//     description en double.
// Avec CUSPEED_PUBLICATION=1 (mise en ligne réelle), il refuse aussi les champs « [à compléter] ».
//
// Les fiches non validées et les notes à rechercher sont lues dans le dossier
// CUSPEED_DATA_CONTROLE s'il est indiqué, sinon dans le dossier de données du site.
// Pour la mise en ligne, le site est construit sur l'export des seules fiches validées :
// il faut alors pointer CUSPEED_DATA_CONTROLE vers le miroir complet (data/), sans quoi
// il n'y aurait rien à rechercher.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { dossierDonnees } from "../src/lib/donnees.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const DIST = process.argv[2] ?? join(ICI, "..", "dist");
const erreurs = [];

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

if (!existsSync(DIST)) {
  console.error(`Dossier construit introuvable : ${DIST}`);
  process.exit(1);
}

/** Décode les entités HTML courantes et réduit les espaces, pour comparer du texte à du HTML. */
function texteNormalise(contenu) {
  return String(contenu)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\\u003c/gi, "<") // JSON-LD échappé
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Fiches non publiables et notes internes, lues dans les données sources.
const donnees = process.env.CUSPEED_DATA_CONTROLE || dossierDonnees();
const nonPubliees = [];
const notes = [];
for (const nom of readdirSync(join(donnees, "formations")).filter((n) => n.endsWith(".yaml"))) {
  const f = parse(readFileSync(join(donnees, "formations", nom), "utf8"));
  if (f.statut !== "validee") nonPubliees.push(f.id);
  if (f.notes != null) {
    // Toute note, quel que soit son type ; les très courtes (« ok ») donneraient de fausses alertes.
    const texte = texteNormalise(typeof f.notes === "string" ? f.notes : JSON.stringify(f.notes)).trim();
    if (texte.length >= 8) notes.push({ id: f.id, texte });
  }
}

// À la mise en ligne, un contrôle sans miroir complet ne vérifierait rien : on le refuse.
if (process.env.CUSPEED_PUBLICATION === "1" && !process.env.CUSPEED_DATA_CONTROLE) {
  erreurs.push("CUSPEED_PUBLICATION=1 sans CUSPEED_DATA_CONTROLE : indiquer le miroir complet des données");
}

const SECRETS = [
  /postgres(ql)?:\/\/[^\s:"']+:[^\s@"']+@/i,
  /service_role/i,
  /sb_secret_[A-Za-z0-9]/,
  /eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/, // jeton JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
// Ressources chargées depuis un autre site : <script src>, <img src>, <iframe>, ou <link>
// de style, police, icône ou préchargement. Les liens canonique et plan du site sont permis.
const RESSOURCE_EXTERNE = [
  /<(script|img|iframe|source|audio|video)\b[^>]*\bsrc=["']?(https?:)?\/\//i,
  /<link\b(?=[^>]*\brel=["']?(stylesheet|preload|modulepreload|preconnect|dns-prefetch|icon|manifest))[^>]*\bhref=["']?(https?:)?\/\//i,
  /@import\s+url\(["']?(https?:)?\/\//i,
  /url\(["']?(https?:)?\/\//i,
];

const pages = fichiers(DIST);
const titres = new Map();
const descriptions = new Map();

for (const chemin of pages) {
  const nom = relative(DIST, chemin);
  if (!/\.(html|js|css|xml|txt|json)$/.test(chemin)) continue;
  const contenu = readFileSync(chemin, "utf8");

  for (const motif of SECRETS) {
    if (motif.test(contenu)) erreurs.push(`${nom} : contient un motif de secret (${motif})`);
  }
  const normalise = texteNormalise(contenu);
  for (const n of notes) {
    if (normalise.includes(n.texte)) erreurs.push(`${nom} : contient la note interne de ${n.id}`);
  }

  // Une fiche non validée ne doit apparaître nulle part (pages, plan du site, scripts…),
  // ni en adresse ni en référence.
  for (const id of nonPubliees) {
    if (new RegExp(`/formations/${id.toLowerCase()}-|\\b${id}\\b`, "i").test(contenu)) {
      erreurs.push(`${nom} : mentionne la fiche non validée ${id}`);
    }
  }
  if (!nom.endsWith(".html")) continue;
  if (RESSOURCE_EXTERNE.some((m) => m.test(contenu))) erreurs.push(`${nom} : charge une ressource depuis un autre site`);

  // Une page de redirection n'est pas une page de contenu : pas de contrôle de doublon.
  const redirection = /<meta http-equiv="refresh"/.test(contenu);

  const titre = contenu.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
  if (!titre) erreurs.push(`${nom} : pas de titre`);
  else if (!redirection) titres.set(titre, [...(titres.get(titre) ?? []), nom]);
  const description = contenu.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!description || description.length < 30) erreurs.push(`${nom} : description absente ou trop courte`);
  else if (!redirection && !/<meta name="robots" content="noindex"/.test(contenu)) {
    descriptions.set(description, [...(descriptions.get(description) ?? []), nom]);
  }
  if (!/<link rel="canonical"/.test(contenu)) erreurs.push(`${nom} : pas d'adresse canonique`);
  if (!/<html lang="fr"/.test(contenu)) erreurs.push(`${nom} : langue non déclarée`);
  if (process.env.CUSPEED_PUBLICATION === "1" && /\[à compléter/i.test(contenu)) {
    erreurs.push(`${nom} : contient encore un champ « [à compléter] »`);
  }
}

// Redirections : chaque page de redirection mène à une page qui existe, et le plan du site
// ne liste que des pages de contenu existantes (ni redirection, ni page absente).
const existe = (chemin) => existsSync(join(DIST, chemin.replace(/^\//, ""), "index.html"));
const estRedirection = (contenu) => /<meta\s+http-equiv=["']?refresh/i.test(contenu);
for (const chemin of pages.filter((p) => p.endsWith(".html"))) {
  const contenu = readFileSync(chemin, "utf8");
  if (!estRedirection(contenu)) continue;
  const nom = relative(DIST, chemin);
  // Lecture tolérante : « 0; url=… », « 0;url=… », guillemets simples ou doubles.
  const cible = contenu.match(/<meta\s+http-equiv=["']?refresh["']?\s+content=["']\s*\d+\s*;\s*url=([^"']+)["']/i)?.[1];
  if (!cible) {
    erreurs.push(`${nom} : redirection illisible`);
  } else if (!existe(cible)) {
    erreurs.push(`${nom} : redirige vers ${cible}, page absente`);
  } else if (estRedirection(readFileSync(join(DIST, cible.replace(/^\//, ""), "index.html"), "utf8"))) {
    erreurs.push(`${nom} : redirige vers ${cible}, qui est elle-même une redirection`);
  }
}
const plans = pages.filter((p) => /sitemap-\d+\.xml$/.test(p));
if (!plans.length || !plans.some((p) => /<loc>/.test(readFileSync(p, "utf8")))) {
  erreurs.push("plan du site absent ou vide (sitemap-N.xml)");
}
for (const plan of plans) {
  for (const [, url] of readFileSync(plan, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const chemin = new URL(url).pathname;
    if (!existe(chemin)) erreurs.push(`${relative(DIST, plan)} : ${chemin} absente du site`);
    else if (estRedirection(readFileSync(join(DIST, chemin, "index.html"), "utf8"))) {
      erreurs.push(`${relative(DIST, plan)} : ${chemin} est une redirection`);
    }
  }
}

for (const [titre, noms] of titres) {
  if (noms.length > 1) erreurs.push(`Titre en double « ${titre} » : ${noms.join(", ")}`);
}
for (const [description, noms] of descriptions) {
  if (noms.length > 1) erreurs.push(`Description en double « ${description.slice(0, 60)}… » : ${noms.join(", ")}`);
}

// Données de la carte interactive : seulement les champs prévus (jamais de note ni de champ inattendu).
{
  const chemin = join(DIST, "carte-donnees.json");
  if (!existsSync(chemin)) erreurs.push("carte-donnees.json absent");
  else {
    const carte = JSON.parse(readFileSync(chemin, "utf8"));
    const attendus = "points,organismes,formations,sansCoordonnees,sansLieu";
    if (Object.keys(carte).sort().join() !== attendus.split(",").sort().join()) {
      erreurs.push(`carte-donnees.json : champs inattendus (${Object.keys(carte).join(", ")})`);
    }
    const champsPoint = "id,nom,latitude,longitude,formations,organismes";
    for (const p of carte.points ?? []) {
      if (Object.keys(p).sort().join() !== champsPoint.split(",").sort().join()) {
        erreurs.push(`carte-donnees.json : point ${p.id} avec des champs inattendus`);
        break;
      }
    }
  }
}

const nbPages = pages.filter((p) => p.endsWith(".html")).length;
if (erreurs.length) {
  console.error(`Contrôle du site construit : ${erreurs.length} problème(s)\n- ` + erreurs.join("\n- "));
  process.exit(1);
}
console.log(`Contrôle du site construit : ${nbPages} pages, aucun problème (${nonPubliees.length} fiches non validées absentes).`);
