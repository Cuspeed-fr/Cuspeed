// Contrôle du site construit (dossier dist/), lancé automatiquement après `astro build`.
// Il échoue (code de sortie 1) si le site risque de publier ce qu'il ne doit pas :
//   - une fiche qui n'est pas au statut `validee` ;
//   - une note interne d'une fiche ;
//   - un script, une police ou une feuille de style chargés depuis un autre site ;
//   - quelque chose qui ressemble à un secret (adresse de base avec mot de passe, clé) ;
//   - une page sans titre, sans description ou sans adresse canonique, ou un titre en double.
// Avec CUSPEED_PUBLICATION=1 (mise en ligne réelle), il refuse aussi les champs « [à compléter] ».

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

// Fiches non publiables et notes internes, lues dans les données sources.
const donnees = dossierDonnees();
const nonPubliees = [];
const notes = [];
for (const nom of readdirSync(join(donnees, "formations")).filter((n) => n.endsWith(".yaml"))) {
  const f = parse(readFileSync(join(donnees, "formations", nom), "utf8"));
  if (f.statut !== "validee") nonPubliees.push(f.id);
  if (typeof f.notes === "string" && f.notes.trim().length >= 12) notes.push({ id: f.id, texte: f.notes.trim() });
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

for (const chemin of pages) {
  const nom = relative(DIST, chemin);
  if (!/\.(html|js|css|xml|txt|json)$/.test(chemin)) continue;
  const contenu = readFileSync(chemin, "utf8");

  for (const motif of SECRETS) {
    if (motif.test(contenu)) erreurs.push(`${nom} : contient un motif de secret (${motif})`);
  }
  for (const n of notes) {
    if (contenu.includes(n.texte)) erreurs.push(`${nom} : contient la note interne de ${n.id}`);
  }
  if (!nom.endsWith(".html")) continue;

  // Une fiche non validée ne doit apparaître ni en adresse ni en référence.
  for (const id of nonPubliees) {
    if (new RegExp(`/formations/${id.toLowerCase()}-|\\b${id}\\b`).test(contenu)) {
      erreurs.push(`${nom} : mentionne la fiche non validée ${id}`);
    }
  }
  if (RESSOURCE_EXTERNE.some((m) => m.test(contenu))) erreurs.push(`${nom} : charge une ressource depuis un autre site`);

  const titre = contenu.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
  if (!titre) erreurs.push(`${nom} : pas de titre`);
  else titres.set(titre, [...(titres.get(titre) ?? []), nom]);
  if (!/<meta name="description" content="[^"]{30,}"/.test(contenu)) erreurs.push(`${nom} : description absente ou trop courte`);
  if (!/<link rel="canonical"/.test(contenu)) erreurs.push(`${nom} : pas d'adresse canonique`);
  if (!/<html lang="fr"/.test(contenu)) erreurs.push(`${nom} : langue non déclarée`);
  if (process.env.CUSPEED_PUBLICATION === "1" && /\[à compléter/i.test(contenu)) {
    erreurs.push(`${nom} : contient encore un champ « [à compléter] »`);
  }
}

for (const [titre, noms] of titres) {
  if (noms.length > 1) erreurs.push(`Titre en double « ${titre} » : ${noms.join(", ")}`);
}

const nbPages = pages.filter((p) => p.endsWith(".html")).length;
if (erreurs.length) {
  console.error(`Contrôle du site construit : ${erreurs.length} problème(s)\n- ` + erreurs.join("\n- "));
  process.exit(1);
}
console.log(`Contrôle du site construit : ${nbPages} pages, aucun problème (${nonPubliees.length} fiches non validées absentes).`);
