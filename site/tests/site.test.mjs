// Tests du site, lancés par `npm test` (exécuteur de tests intégré à Node, sans dépendance).
// Ils portent sur ce qui compte le plus : ne jamais publier une fiche non validée ni une note interne.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { chargerDonnees, enSlug, tarifLisible, aidesDe, dateLisible, villesDe } from "../src/lib/donnees.js";
import { pointsCarte, projeter } from "../src/lib/carte.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const JEU = join(ICI, "jeu-essai");

/** Copie le jeu d'essai dans un dossier temporaire pour pouvoir l'abîmer sans risque. */
function copieDuJeu() {
  const dossier = mkdtempSync(join(tmpdir(), "cuspeed-test-"));
  cpSync(JEU, dossier, { recursive: true });
  return dossier;
}

test("seules les fiches validées sont chargées", () => {
  const d = chargerDonnees(JEU);
  assert.deepEqual(d.formations.map((f) => f.id), ["F9001"]);
});

test("aucune note interne ni aucun statut ne sort du chargeur", () => {
  const d = chargerDonnees(JEU);
  const texte = JSON.stringify(d.formations);
  assert.ok(!texte.includes("NOTE-INTERNE"), "une note interne a fuité");
  for (const f of d.formations) {
    assert.equal("notes" in f, false);
    assert.equal("statut" in f, false);
  }
});

test("les précisions publiques sont chargées, et absentes elles valent null", () => {
  const d = chargerDonnees(JEU);
  assert.equal(d.formations[0].precisions, "Clinique le lundi (essai)");
  const dossier = copieDuJeu();
  try {
    const chemin = join(dossier, "formations", "F9001-du-essai.yaml");
    writeFileSync(chemin, readFileSync(chemin, "utf8").replace(/^precisions:.*\n/m, ""));
    assert.equal(chargerDonnees(dossier).formations[0].precisions, null);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test("un organisme sans fiche publiée n'est pas exposé", () => {
  const d = chargerDonnees(JEU);
  assert.deepEqual(d.organismes.map((o) => o.id), ["O001"]);
  assert.deepEqual(d.lieux.map((l) => l.id), ["L-ARRAS"]);
});

test("la construction s'arrête si une fiche validée renvoie à un organisme inconnu", () => {
  const dossier = copieDuJeu();
  const chemin = join(dossier, "formations", "F9001-du-essai.yaml");
  writeFileSync(chemin, readFileSync(chemin, "utf8").replace("organisme: O001", "organisme: O999"));
  assert.throws(() => chargerDonnees(dossier), /organisme inconnu O999/);
  rmSync(dossier, { recursive: true, force: true });
});

test("la construction s'arrête si une fiche validée n'a pas de source officielle", () => {
  const dossier = copieDuJeu();
  const chemin = join(dossier, "formations", "F9001-du-essai.yaml");
  writeFileSync(chemin, readFileSync(chemin, "utf8").replace("url_officielle: https://exemple.invalid/du-paro", "url_officielle: null"));
  assert.throws(() => chargerDonnees(dossier), /source officielle absente/);
  rmSync(dossier, { recursive: true, force: true });
});

test("adresses lisibles et stables", () => {
  assert.equal(enSlug("DU Parodontologie médicale & chirurgicale"), "du-parodontologie-medicale-et-chirurgicale");
  assert.equal(enSlug("  Prothèse – réhabilitation  "), "prothese-rehabilitation");
  const d = chargerDonnees(JEU);
  assert.equal(d.formations[0].slug, "f9001-du-parodontologie-d-essai");
});

test("tarifs, dates et villes lisibles", () => {
  assert.equal(tarifLisible({ euros: 3200, annee: "2026-27" }).replace(/\s/g, " "), "3 200 € (2026-27)");
  assert.equal(tarifLisible({ euros: null, texte: "Sur devis" }), "Sur devis");
  assert.equal(tarifLisible({ euros: null, texte: null }), null);
  assert.equal(dateLisible("2026-11-02"), "2 novembre 2026");
  assert.equal(dateLisible(null), null);
  const d = chargerDonnees(JEU);
  assert.deepEqual(villesDe(d.formations[0], d), ["Arras"]);
});

test("le tarif affiché est le texte de la source, tel quel (règle du 5 novembre 2026)", () => {
  // Le texte porte les mentions de la source : il passe avant le montant.
  assert.equal(tarifLisible({ texte: "1 200 € HT", euros: 1200, annee: null }), "1 200 € HT");
  assert.equal(tarifLisible({ texte: "À partir de 800 € (TVA non applicable)", euros: null }), "À partir de 800 € (TVA non applicable)");
  assert.equal(tarifLisible({ texte: "2 800 €/an (2025-26)", euros: 2800, annee: "2025-26" }), "2 800 €/an (2025-26)");
  // Sans texte, le montant ; sans rien, null (la fiche affiche « Non communiqué »).
  assert.equal(tarifLisible({ texte: null, euros: 1500, annee: null }).replace(/\s/g, " "), "1 500 €");
  assert.equal(tarifLisible({ texte: "  ", euros: null, annee: null }), null);
  assert.equal(tarifLisible(undefined), null);
});

test("prises en charge : libellés du référentiel, dans son ordre, et code en majuscules sinon", () => {
  const ref = { financements: { dpc: "DPC", fifpl: "FIFPL", opco: "OPCO", cpf: "CPF" } };
  assert.deepEqual(aidesDe({ financement: ["cpf", "dpc", "opco"] }, ref), ["DPC", "OPCO", "CPF"]);
  assert.deepEqual(aidesDe({ financement: ["opco"] }, { financements: { dpc: "DPC" } }), ["OPCO"]);
  assert.deepEqual(aidesDe({ financement: [] }, ref), []);
  const d = chargerDonnees(JEU);
  assert.deepEqual(aidesDe(d.formations[0], d.referentiels), ["DPC"]);
});

test("une discipline ajoutée au référentiel (« gestion ») est acceptée sans changer le code", () => {
  const dossier = copieDuJeu();
  try {
    const fiche = join(dossier, "formations", "F9001-du-essai.yaml");
    writeFileSync(fiche, readFileSync(fiche, "utf8").replace("disciplines:\n- paro", "disciplines:\n- paro\n- gestion"));
    // Tant que le référentiel ne la connaît pas, la construction s'arrête.
    assert.throws(() => chargerDonnees(dossier), /discipline inconnue gestion/);
    const ref = join(dossier, "referentiels.yaml");
    writeFileSync(ref, readFileSync(ref, "utf8").replace("disciplines:\n", "disciplines:\n  gestion: Gestion & management du cabinet\n"));
    const d = chargerDonnees(dossier);
    assert.deepEqual(d.formations[0].disciplines, ["paro", "gestion"]);
    assert.equal(d.referentiels.disciplines.gestion, "Gestion & management du cabinet");
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test("la carte place un regroupement sur la ville qui porte son nom", () => {
  const points = pointsCarte([
    { nom: "Aix-en-Provence", latitude: 43.53, longitude: 5.45, regroupement_carte: "Marseille" },
    { nom: "Marseille", latitude: 43.29, longitude: 5.37, regroupement_carte: "Marseille" },
    { nom: "En ligne", latitude: null, longitude: null, regroupement_carte: null },
  ]);
  assert.equal(points.length, 1);
  assert.deepEqual([points[0].x, points[0].y], projeter(5.37, 43.29));
});

test("le contrôle de construction repère une fiche non validée et une note interne", () => {
  const dist = mkdtempSync(join(tmpdir(), "cuspeed-dist-"));
  const page = (corps, titre) =>
    `<!doctype html><html lang="fr"><head><title>${titre}</title>` +
    `<meta name="description" content="Une description suffisamment longue pour le test."/>` +
    `<link rel="canonical" href="https://cuspeed.fr/"/></head><body>${corps}</body></html>`;
  writeFileSync(join(dist, "index.html"), page("Tout va bien", "Accueil"));
  writeFileSync(join(dist, "sitemap-0.xml"), "<urlset><url><loc>https://cuspeed.fr/</loc></url></urlset>");
  const script = join(ICI, "..", "scripts", "controler_construction.mjs");
  const lancer = () =>
    spawnSync(process.execPath, [script, dist], { env: { ...process.env, CUSPEED_DATA: JEU }, encoding: "utf8" });

  assert.equal(lancer().status, 0, "un site propre doit passer");

  mkdirSync(join(dist, "fuite"));
  writeFileSync(join(dist, "fuite", "index.html"), page('<a href="/formations/f9002-cursus/">F9002</a>', "Fuite"));
  let r = lancer();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /fiche non validée F9002/);

  writeFileSync(join(dist, "fuite", "index.html"), page("NOTE-INTERNE-SECRETE-F9001 ne doit jamais sortir", "Fuite"));
  r = lancer();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /note interne de F9001/);

  writeFileSync(join(dist, "fuite", "index.html"), page('<script src="https://exemple.invalid/x.js"></script>', "Fuite"));
  r = lancer();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ressource depuis un autre site/);

  rmSync(dist, { recursive: true, force: true });
});

// --- Cas relevés par la relecture de la pull request n°1 ---

/** Lance le contrôle de construction sur un dossier dist/ et un jeu de données donnés. */
function controler(dist, donnees) {
  const script = join(ICI, "..", "scripts", "controler_construction.mjs");
  return spawnSync(process.execPath, [script, dist], {
    env: { ...process.env, CUSPEED_DATA: donnees, CUSPEED_DATA_CONTROLE: "" },
    encoding: "utf8",
  });
}
const pageTest = (corps, titre = "Page", description = "Une description suffisamment longue pour le test.") =>
  `<!doctype html><html lang="fr"><head><title>${titre}</title>` +
  `<meta name="description" content="${description}"/>` +
  `<link rel="canonical" href="https://cuspeed.fr/"/></head><body>${corps}</body></html>`;

test("une note interne échappée en HTML ou en JSON est quand même repérée", () => {
  const donnees = copieDuJeu();
  const chemin = join(donnees, "formations", "F9001-du-essai.yaml");
  writeFileSync(
    chemin,
    readFileSync(chemin, "utf8").replace(/^notes:.*$/m, `notes: "L'organisme <hésite> & \\"revoit\\" le tarif"`),
  );
  const dist = mkdtempSync(join(tmpdir(), "cuspeed-dist-"));
  writeFileSync(join(dist, "index.html"), pageTest("L&#39;organisme &lt;hésite&gt; &amp; &quot;revoit&quot; le tarif"));
  let r = controler(dist, donnees);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /note interne de F9001/);

  writeFileSync(join(dist, "index.html"), pageTest(`<script type="application/ld+json">{"d":"L'organisme \\u003chésite> & \\"revoit\\" le tarif"}</script>`));
  r = controler(dist, donnees);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /note interne de F9001/);
  rmSync(dist, { recursive: true, force: true });
  rmSync(donnees, { recursive: true, force: true });
});

test("une note qui n'est pas du texte est aussi recherchée", () => {
  const donnees = copieDuJeu();
  const chemin = join(donnees, "formations", "F9001-du-essai.yaml");
  writeFileSync(chemin, readFileSync(chemin, "utf8").replace(/^notes:.*$/m, "notes: 123456789"));
  const dist = mkdtempSync(join(tmpdir(), "cuspeed-dist-"));
  writeFileSync(join(dist, "index.html"), pageTest("Référence 123456789"));
  const r = controler(dist, donnees);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /note interne de F9001/);
  rmSync(dist, { recursive: true, force: true });
  rmSync(donnees, { recursive: true, force: true });
});

test("une fiche non validée est repérée aussi dans le plan du site XML", () => {
  const dist = mkdtempSync(join(tmpdir(), "cuspeed-dist-"));
  writeFileSync(join(dist, "index.html"), pageTest("Accueil"));
  writeFileSync(join(dist, "sitemap-0.xml"), "<urlset><url><loc>https://cuspeed.fr/formations/f9002-cursus/</loc></url></urlset>");
  const r = controler(dist, JEU);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /sitemap-0\.xml : mentionne la fiche non validée F9002/);
  rmSync(dist, { recursive: true, force: true });
});

test("deux pages avec la même description sont refusées", () => {
  const dist = mkdtempSync(join(tmpdir(), "cuspeed-dist-"));
  writeFileSync(join(dist, "index.html"), pageTest("Un", "Page un"));
  mkdirSync(join(dist, "deux"));
  writeFileSync(join(dist, "deux", "index.html"), pageTest("Deux", "Page deux"));
  const r = controler(dist, JEU);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Description en double/);
  rmSync(dist, { recursive: true, force: true });
});

test("deux fiches validées avec le même identifiant arrêtent la construction", () => {
  const dossier = copieDuJeu();
  cpSync(join(dossier, "formations", "F9001-du-essai.yaml"), join(dossier, "formations", "F9001-doublon.yaml"));
  assert.throws(() => chargerDonnees(dossier), /F9001 : identifiant en double/);
  rmSync(dossier, { recursive: true, force: true });
});

test("un lien d'organisme qui n'est pas en http(s) n'est pas publié", () => {
  const dossier = copieDuJeu();
  const chemin = join(dossier, "organismes.yaml");
  writeFileSync(chemin, readFileSync(chemin, "utf8").replace("site_web: https://exemple.invalid/", "site_web: javascript:alert(1)"));
  const d = chargerDonnees(dossier);
  assert.equal(d.organisme("O001").site_web, null);
  rmSync(dossier, { recursive: true, force: true });
});

// --- Adresses stables (registre site/adresses.json) ---

import { couper, lireRegistre } from "../src/lib/donnees.js";

test("une adresse figée ne change pas quand l'intitulé change", () => {
  const dossier = copieDuJeu();
  const chemin = join(dossier, "formations", "F9001-du-essai.yaml");
  writeFileSync(chemin, readFileSync(chemin, "utf8").replace("intitule: DU Parodontologie d'essai", "intitule: DU Parodontie renommé"));
  const registre = { formations: { F9001: "f9001-du-parodontologie-d-essai" }, organismes: {}, anciennes: {} };
  const d = chargerDonnees(dossier, registre);
  assert.equal(d.formations[0].slug, "f9001-du-parodontologie-d-essai");
  assert.equal(d.formations[0].intitule, "DU Parodontie renommé");
  rmSync(dossier, { recursive: true, force: true });
});

test("adresse courte et anciennes adresses redirigent vers l'adresse actuelle", () => {
  const registre = {
    formations: { F9001: "f9001-nouvelle" },
    organismes: {},
    anciennes: { "f9001-ancienne": "F9001", "f9002-cursus-a-verifier": "F9002" },
  };
  const d = chargerDonnees(JEU, registre);
  const r = Object.fromEntries(d.redirections.map((x) => [x.de, x.vers.slug]));
  assert.deepEqual(r, { f9001: "f9001-nouvelle", "f9001-ancienne": "f9001-nouvelle" });
  // F9002 n'est pas validée : aucune redirection ne la mentionne.
  assert.ok(!JSON.stringify(d.redirections).includes("F9002"));
});

test("une ancienne adresse encore utilisée arrête la construction", () => {
  const registre = { formations: {}, organismes: {}, anciennes: { "f9001-du-parodontologie-d-essai": "F9001" } };
  assert.throws(() => chargerDonnees(JEU, registre), /encore utilisée/);
});

test("deux fiches ne peuvent pas partager une adresse figée", () => {
  const dossier = copieDuJeu();
  const chemin = join(dossier, "formations", "F9003-archivee.yaml");
  writeFileSync(chemin, readFileSync(chemin, "utf8").replace("statut: archivee", "statut: validee"));
  const registre = { formations: { F9001: "meme-adresse", F9003: "meme-adresse" }, organismes: {}, anciennes: {} };
  assert.throws(() => chargerDonnees(dossier, registre), /déjà prise/);
  rmSync(dossier, { recursive: true, force: true });
});

test("le registre du dépôt couvre toutes les fiches validées du miroir", () => {
  const registre = lireRegistre(join(ICI, "..", "adresses.json"));
  const d = chargerDonnees(join(ICI, "..", "..", "data"), registre);
  assert.deepEqual(d.nonFigees, [], "lancer « npm run figer-adresses » et proposer le registre par pull request");
});

test("les descriptions sont coupées proprement", () => {
  assert.equal(couper("court", 160), "court");
  const long = "mot ".repeat(60).trim();
  const c = couper(long, 160);
  assert.ok(c.length <= 160);
  assert.ok(c.endsWith("mot…"));
});

test("sur une adresse de test, robots.txt interdit tout aux moteurs", async () => {
  const { GET } = await import("../src/pages/robots.txt.js");
  const site = new URL("https://cuspeed.fr");
  process.env.CUSPEED_ESSAI = "1";
  assert.match(await GET({ site }).text(), /Disallow: \//);
  delete process.env.CUSPEED_ESSAI;
  const normal = await GET({ site }).text();
  assert.match(normal, /Allow: \//);
  assert.match(normal, /Sitemap: https:\/\/cuspeed\.fr\/sitemap-index\.xml/);
});

// --- Garde-fous complémentaires (relecture de la pull request n°2) ---

test("deux organismes ne peuvent pas partager une adresse figée", () => {
  const registre = { formations: {}, organismes: { O001: "meme", O002: "meme" }, anciennes: {} };
  assert.throws(() => chargerDonnees(JEU, registre), /O002 : adresse meme déjà prise par O001/);
});

test("une ancienne adresse ne peut pas imiter une adresse courte ni contenir n'importe quoi", () => {
  assert.throws(
    () => chargerDonnees(JEU, { formations: {}, organismes: {}, anciennes: { f9001: "F9001" } }),
    /forme réservée aux adresses courtes/,
  );
  assert.throws(
    () => chargerDonnees(JEU, { formations: {}, organismes: {}, anciennes: { "../a": "F9001" } }),
    /caractères non permis/,
  );
});

test("le contrôle refuse une redirection vers une page absente et une redirection dans le plan du site", () => {
  const dist = mkdtempSync(join(tmpdir(), "cuspeed-dist-"));
  writeFileSync(join(dist, "index.html"), pageTest("Accueil"));
  mkdirSync(join(dist, "formations", "f9001"), { recursive: true });
  const redirection = (vers) =>
    `<!doctype html><html lang="fr"><head><meta http-equiv="refresh" content="0; url=${vers}">` +
    `<link rel="canonical" href="https://cuspeed.fr${vers}"><title>Redirection</title>` +
    `<meta name="description" content="Cette adresse renvoie vers une autre fiche du site."></head><body></body></html>`;
  writeFileSync(join(dist, "formations", "f9001", "index.html"), redirection("/formations/absente/"));
  let r = controler(dist, JEU);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /redirige vers \/formations\/absente\/, page absente/);

  writeFileSync(join(dist, "formations", "f9001", "index.html"), redirection("/"));
  writeFileSync(join(dist, "sitemap-0.xml"), "<urlset><url><loc>https://cuspeed.fr/formations/f9001/</loc></url></urlset>");
  r = controler(dist, JEU);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/formations\/f9001\/ est une redirection/);
  rmSync(dist, { recursive: true, force: true });
});

test("le contrôle refuse un plan du site absent, une chaîne de redirections et une redirection illisible", () => {
  const dist = mkdtempSync(join(tmpdir(), "cuspeed-dist-"));
  writeFileSync(join(dist, "index.html"), pageTest("Accueil"));
  let r = controler(dist, JEU);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /plan du site absent ou vide/);

  writeFileSync(join(dist, "sitemap-0.xml"), "<urlset><url><loc>https://cuspeed.fr/</loc></url></urlset>");
  const redir = (vers, forme = `0; url=${vers}`) =>
    `<!doctype html><html lang="fr"><head><meta http-equiv="refresh" content="${forme}">` +
    `<link rel="canonical" href="https://cuspeed.fr${vers}"><title>R</title>` +
    `<meta name="description" content="Cette adresse renvoie vers une autre fiche du site."></head><body></body></html>`;
  for (const d of ["a", "b"]) mkdirSync(join(dist, d));
  writeFileSync(join(dist, "a", "index.html"), redir("/b/"));
  writeFileSync(join(dist, "b", "index.html"), redir("/"));
  r = controler(dist, JEU);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a\/index.html : redirige vers \/b\/, qui est elle-même une redirection/);

  writeFileSync(join(dist, "a", "index.html"), redir("/absente/", "0;url=/absente/"));
  r = controler(dist, JEU);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /redirige vers \/absente\/, page absente/);

  writeFileSync(join(dist, "a", "index.html"), redir("/", "0"));
  r = controler(dist, JEU);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /redirection illisible/);
  rmSync(dist, { recursive: true, force: true });
});
