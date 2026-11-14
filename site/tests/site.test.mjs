// Tests du site, lancés par `npm test` (exécuteur de tests intégré à Node, sans dépendance).
// Ils portent sur ce qui compte le plus : ne jamais publier une fiche non validée ni une note interne.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { chargerDonnees, enSlug, tarifLisible, aidesDe, sessionsAVenir, dateLisible, villesDe } from "../src/lib/donnees.js";
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

test("les éditions passées sont retirées de l'affichage, pas des données", () => {
  const f = {
    sessions: [
      { lieu: "L-ARRAS", debut: "2025-09-01", fin: "2026-06-30" }, // passée
      { lieu: "L-ARRAS", debut: "2026-09-01", fin: "2027-06-30" }, // à venir
      { lieu: "L-ARRAS", debut: "2026-10-01", fin: "2026-11-06" }, // finit aujourd'hui : gardée
      { lieu: "L-ARRAS", debut: "2025-01-10", fin: null },         // sans fin, début passé : retirée
      { lieu: "L-ARRAS", debut: null, fin: null },                  // sans date : gardée
    ],
  };
  const a = sessionsAVenir(f, "2026-11-06");
  assert.equal(a.length, 3);
  assert.deepEqual(a.map((s) => s.debut), ["2026-09-01", "2026-10-01", null]);
  assert.equal(f.sessions.length, 5, "les données d'origine ne sont pas modifiées");
  // La page d'une formation dont toutes les sessions sont passées n'affiche plus rien.
  assert.equal(sessionsAVenir({ sessions: [{ debut: "2024-01-01", fin: "2024-06-01" }] }, "2026-11-06").length, 0);
  // Le chargeur garde bien toutes les sessions (le filtre est à l'affichage).
  const d = chargerDonnees(JEU);
  assert.equal(d.formations[0].sessions.length, 1);
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

// --- Recherche, cartes et fiches (pull request site/ux-recherche-et-fiches) ---

import { prochaineSession, dateCourte, sessionsTriees } from "../src/lib/donnees.js";
import { readdirSync } from "node:fs";

test("prochaine session : la première qui n'a pas commencé, avec sa ville", () => {
  const donnees = { lieu: (id) => ({ "L-ARRAS": { nom: "Arras" }, "L-LILLE": { nom: "Lille" } })[id] };
  const f = {
    sessions: [
      { lieu: "L-ARRAS", debut: "2026-09-01", fin: "2027-06-30", inscriptions: "fermees" }, // commencée
      { lieu: "L-LILLE", debut: "2027-03-10", fin: null, inscriptions: "ouvertes" },
      { lieu: "L-ARRAS", debut: "2027-01-14", fin: "2027-01-15", inscriptions: null },
      { lieu: "L-ARRAS", debut: null, fin: null }, // sans date
    ],
  };
  assert.deepEqual(prochaineSession(f, donnees, "2026-11-06"), {
    debut: "2027-01-14",
    fin: "2027-01-15",
    ville: "Arras",
    inscriptions: null,
  });
  // Ordre de la frise : chronologique, sans date à la fin, éditions passées retirées.
  assert.deepEqual(sessionsTriees(f, "2026-11-06").map((s) => s.debut), ["2026-09-01", "2027-01-14", "2027-03-10", null]);
  // Aucune session datée à venir : pas de prochaine session.
  assert.equal(prochaineSession({ sessions: [{ lieu: "L-ARRAS", debut: null }] }, donnees, "2026-11-06"), null);
  assert.equal(prochaineSession({ sessions: [] }, donnees, "2026-11-06"), null);
  assert.equal(dateCourte("2027-01-14"), "14 janv. 2027");
  assert.equal(dateCourte(null), null);
});

/**
 * Construit le site une fois, sur un jeu d'essai élargi à 30 fiches validées (inventées),
 * plus la fiche non validée F9002 et sa note interne, pour vérifier le HTML produit.
 */
let construit = null;
function siteConstruit() {
  if (construit) return construit;
  const donnees = copieDuJeu();
  const modele = readFileSync(join(donnees, "formations", "F9001-du-essai.yaml"), "utf8");
  for (let i = 1; i <= 29; i++) {
    const id = `F${9100 + i}`;
    let fiche = modele
      .replace("id: F9001", `id: ${id}`)
      .replace("intitule: DU Parodontologie d'essai", `intitule: DU Essai numéro ${i}`)
      .replace(/^notes:.*$/m, `notes: NOTE-INTERNE-SECRETE-${id} ne doit jamais sortir`);
    // Une fiche avec une session qui commence plus tard : « Prochaine session » sur sa carte.
    if (i === 1) fiche = fiche.replace("debut: '2026-09-01'", "debut: '2099-01-14'").replace("fin: '2027-06-30'", "fin: '2099-06-30'");
    // Une fiche publiée chez O002, organisme sans présentation : sa page existe et reste sobre.
    if (i === 2) fiche = fiche.replace("organisme: O001", "organisme: O002");
    writeFileSync(join(donnees, "formations", `${id}.yaml`), fiche);
  }
  // Médias d'essai pour O001 : une bannière, deux photos valides et trois entrées invalides à ignorer.
  const medias = join(donnees, "medias");
  mkdirSync(join(medias, "O001"), { recursive: true });
  for (const f of ["banniere.jpg", "tp-1.jpg", "tp-2.webp", "script.svg"]) writeFileSync(join(medias, "O001", f), "x");
  writeFileSync(join(medias, "O001", "medias.json"), JSON.stringify({
    banniere: { fichier: "banniere.jpg", alt: "Salle de travaux pratiques", credit: "© Université d'Essai" },
    photos: [
      { fichier: "tp-1.jpg", alt: "Atelier de chirurgie", credit: "© Université d'Essai" },
      { fichier: "tp-2.webp", alt: "Amphithéâtre" },
      { fichier: "absente.jpg", alt: "Fichier absent" },
      { fichier: "script.svg", alt: "Format refusé" },
      { fichier: "../../secret.jpg", alt: "Chemin interdit" },
      { fichier: "tp-1.jpg" },
    ],
  }));
  const sortie = mkdtempSync(join(tmpdir(), "cuspeed-construit-"));
  const astro = join(ICI, "..", "node_modules", ".bin", "astro");
  const r = spawnSync(astro, ["build", "--outDir", sortie], {
    cwd: join(ICI, ".."),
    env: { ...process.env, CUSPEED_DATA: donnees, CUSPEED_MEDIAS: medias, CUSPEED_REGISTRE: join(donnees, "registre-absent.json"), ASTRO_TELEMETRY_DISABLED: "1" },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `la construction du jeu d'essai a échoué :\n${r.stderr}\n${r.stdout.slice(-2000)}`);
  construit = { sortie, donnees, lire: (chemin) => readFileSync(join(sortie, chemin), "utf8") };
  return construit;
}

/** Les cartes de la liste d'accueil, une chaîne HTML par carte. */
function cartesAccueil(html) {
  const liste = html.slice(html.indexOf('id="liste"'), html.indexOf('id="liste-organismes"'));
  return liste.split('<li class="fiche-resume"').slice(1);
}

test("accueil : liste des organismes (mode Organismes de la carte), un lien par organisme", () => {
  const { lire } = siteConstruit();
  const html = lire("index.html");
  const bloc = html.slice(html.indexOf('id="liste-organismes"'), html.indexOf('id="aucun"'));
  assert.match(bloc, /\bhidden\b/, "la liste des organismes est masquée par défaut");
  const cartes = bloc.split('<li class="organisme-resume"').slice(1);
  assert.ok(cartes.length > 0);
  for (const carte of cartes) {
    assert.match(carte, /data-id="O\d{3,}"/);
    const liens = [...carte.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
    assert.equal(liens.length, 1);
    assert.match(liens[0], /^\/organismes\/[a-z0-9-]+\/$/);
  }
  // Chaque carte de formation porte son organisme, pour le comptage par organisme.
  for (const carte of cartesAccueil(html)) assert.match(carte, /data-organisme="O\d{3,}"/);
});

test("accueil : toute la liste est dans la page, affichée par paquets de 24 avec « Afficher plus »", () => {
  const { lire } = siteConstruit();
  const html = lire("index.html");
  // Sans JavaScript, tout est là (30 cartes) ; le script n'en montre que 24 à la fois.
  assert.equal(cartesAccueil(html).length, 30);
  assert.match(html, /<button[^>]*id="plus"[^>]*>Afficher 24 formations de plus<\/button>/);
  assert.match(html, /id="compteur"[^>]*>24 sur 30 formations affichées</);
  // Le champ de recherche du haut de page fonctionne aussi sans JavaScript (formulaire GET).
  assert.match(html, /<form class="recherche-heros"[^>]*action="\/#recherche"[^>]*method="get"/);
  assert.match(html, /<input[^>]*id="q-heros"[^>]*name="q"/);
  // Le script de la page est un fichier du site (aucune ressource d'un autre site).
  assert.doesNotMatch(html, /<script[^>]*src="https?:/);
});

test("accueil : chaque carte n'a qu'un seul lien, vers la fiche", () => {
  const { lire } = siteConstruit();
  for (const carte of cartesAccueil(lire("index.html"))) {
    const liens = [...carte.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
    assert.equal(liens.length, 1, `carte avec ${liens.length} liens : ${carte.slice(0, 200)}`);
    assert.match(liens[0], /^\/formations\/f\d+-[a-z0-9-]+\/$/);
  }
});

test("accueil : prochaine session et badge « Éligible aux aides » sur les cartes", () => {
  const { lire } = siteConstruit();
  const cartes = cartesAccueil(lire("index.html"));
  const avecSession = cartes.find((c) => c.includes("DU Essai numéro 1<"));
  assert.match(avecSession, /data-debuts="2099-01-14"/);
  assert.match(avecSession, /Prochaine session :<\/span> <b>14 janv\. 2099<\/b>, Arras/);
  // Une session déjà commencée n'est pas « la prochaine » : la carte affiche la ville seule.
  const enCours = cartes.find((c) => c.includes("DU Parodontologie d&#39;essai<") || c.includes("DU Parodontologie d'essai<"));
  assert.doesNotMatch(enCours, /Prochaine session/);
  assert.match(enCours, /class="r-lieu"/);
  // F9001 est finançable DPC dans le jeu d'essai.
  assert.match(enCours, /<p class="badge-aides">Éligible aux aides : DPC<\/p>/);
});

test("accueil : formations avec une session à venir en tête de liste, dates à venir sur la carte", () => {
  const { lire } = siteConstruit();
  const cartes = cartesAccueil(lire("index.html"));
  // La seule fiche du jeu d'essai qui a une session à venir passe avant les autres (sinon alphabétique).
  assert.match(cartes[0], /DU Essai numéro 1</);
  assert.match(cartes[0], /data-debuts="2099-01-14"/);
  // Les autres suivent l'ordre alphabétique et n'ont pas de date à venir.
  const autres = cartes.slice(1).map((c) => c.match(/<h3><a[^>]*>([^<]+)</)[1]);
  assert.deepEqual(autres, [...autres].sort((a, b) => a.localeCompare(b, "fr")));
  for (const c of cartes.slice(1)) assert.doesNotMatch(c, /data-debuts=/);
});

test("accueil : outils Trier, Filtrer et Carte sous la recherche, sans la partie Méthode", () => {
  const { lire } = siteConstruit();
  const html = lire("index.html");
  const outils = html.slice(html.indexOf('class="outils"'), html.indexOf('id="panneau-filtres"'));
  assert.match(outils, /<select name="tri"/);
  assert.match(outils, /<option value=""[^>]*>Sessions à venir d(&#39;|')abord<\/option>/);
  assert.match(outils, /<option value="alpha"[^>]*>Ordre alphabétique<\/option>/);
  assert.match(outils, /id="bouton-filtres"[^>]*aria-controls="panneau-filtres"/);
  assert.match(outils, /id="bouton-carte"[^>]*aria-controls="colonne-carte"/);
  // Chaque outil a son icône (dessin décoratif, ignoré par les lecteurs d'écran).
  assert.equal([...outils.matchAll(/<svg class="icone"[^>]*aria-hidden="true"/g)].length, 3);
  assert.match(html, /id="disposition"[^>]*data-carte="auto"/);
  assert.match(html, /id="colonne-carte"/);
  assert.doesNotMatch(html, /titre-methode|Des fiches fiables, reliées à leur source/);
  assert.doesNotMatch(html, /relevés sur les sites officiels des facultés/);
});

test("visuels : dessins définis une fois par page, chaque carte y renvoie, sans lien de plus", () => {
  const { lire } = siteConstruit();
  const html = lire("index.html");
  assert.equal([...html.matchAll(/class="sprite-visuels"/g)].length, 1);
  const definis = new Set([...html.matchAll(/<symbol id="(v-[a-z]+)"/g)].map((m) => m[1]));
  for (const carte of cartesAccueil(html)) {
    const m = carte.match(/class="visuel[^"]*"[^>]*aria-hidden="true"[^>]*>\s*<svg[^>]*><use href="#(v-[a-z]+)"/);
    assert.ok(m, "carte sans visuel");
    assert.ok(definis.has(m[1]), `dessin ${m[1]} non défini dans la page`);
  }
});

test("fiche : bouton « Voir la page officielle » collant et frise des sessions", () => {
  const { sortie, lire } = siteConstruit();
  const dossier = readdirSync(join(sortie, "formations")).find((n) => n.startsWith("f9101-"));
  const html = lire(join("formations", dossier, "index.html"));
  assert.match(html, /<div class="action-collante"[^>]*>\s*<a class="bouton"[^>]*href="https:\/\/exemple\.invalid\/du-paro"/);
  assert.match(html, /<ol class="frise"/);
  assert.match(html, /<time datetime="2099-01-14"[^>]*>14 janv\. 2099<\/time>/);
  assert.match(html, /Inscriptions ouvertes/);
});

test("site construit : aucune note interne ni fiche non validée dans le HTML", () => {
  const { sortie } = siteConstruit();
  const tous = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tous(join(d, e.name)) : [join(d, e.name)]));
  const pages = tous(sortie).filter((p) => /\.(html|js|css|xml)$/.test(p));
  assert.ok(pages.length > 30);
  for (const p of pages) {
    const contenu = readFileSync(p, "utf8");
    assert.doesNotMatch(contenu, /NOTE-INTERNE/, `note interne dans ${p}`);
    assert.doesNotMatch(contenu, /F9002|f9002|Cursus implantologie à vérifier/, `fiche non validée dans ${p}`);
  }
  assert.ok(!readdirSync(join(sortie, "formations")).some((n) => n.startsWith("f9003")), "la fiche archivée n'est pas publiée");
});


test("page d'un organisme : présentation, chiffres clés, équipe, histoire et source", () => {
  const { lire, sortie } = siteConstruit();
  const d = chargerDonnees(JEU);
  const o = d.organismes.find((x) => x.id === "O001");
  assert.equal(o.annee_creation, 1970);
  assert.deepEqual(o.equipe, [{ nom: "Pr Jeanne Essai", role: "Responsable pédagogique" }, { nom: "Dr Paul Test", role: null }]);
  // L'adresse de la page dépend du registre utilisé à la construction : on la retrouve par l'identifiant.
  const dossier = readdirSync(join(sortie, "organismes")).find((n) => n.startsWith("o001-"));
  const html = lire(`organismes/${dossier}/index.html`);
  assert.match(html, /<p class="org-chapo"[^>]*>Faculté d(&#39;|')essai qui forme/);
  assert.match(html, /Créé en <strong class="chiffres"[^>]*>1970<\/strong>/);
  assert.match(html, /<h2 id="equipe-titre"[^>]*>Équipe<\/h2>/);
  assert.match(html, /Pr Jeanne Essai/);
  assert.match(html, /<h2 id="histoire-titre"[^>]*>Histoire<\/h2>/);
  assert.match(html, /Présentation rédigée par Cuspeed d(&#39;|')après/);
  assert.match(html, /href="https:\/\/exemple\.invalid\/a-propos"/);
  assert.match(html, /"foundingDate":"1970"/);
});

test("page d'un organisme sans présentation : « Présentation à venir », pas de bloc vide", () => {
  const { donnees } = siteConstruit();
  const sans = chargerDonnees(donnees).organismes.find((x) => x.id === "O002");
  assert.ok(sans && !sans.presentation && sans.equipe.length === 0);
  const { lire, sortie } = siteConstruit();
  const dossier = readdirSync(join(sortie, "organismes")).find((n) => n.startsWith(sans.id.toLowerCase() + "-"));
  const html = lire(`organismes/${dossier}/index.html`);
  assert.match(html, /Présentation à venir/);
  assert.doesNotMatch(html, /id="equipe-titre"/);
  assert.doesNotMatch(html, /id="histoire-titre"/);
});

test("équipe : seuls le nom et le rôle sortent du chargeur ; présentation non validée jamais publiée", () => {
  const dossier = copieDuJeu();
  const chemin = join(dossier, "organismes.yaml");
  const texte = readFileSync(chemin, "utf8").replace(
    "  - nom: Dr Paul Test\n",
    "  - nom: Dr Paul Test\n    telephone: 06 00 00 00 00\n    email: paul@exemple.invalid\n    photo: https://exemple.invalid/p.jpg\n",
  );
  writeFileSync(chemin, texte);
  let o = chargerDonnees(dossier).organismes.find((x) => x.id === "O001");
  assert.deepEqual(o.equipe.map((m) => Object.keys(m).sort()), [["nom", "role"], ["nom", "role"]]);
  assert.ok(!JSON.stringify(o).includes("paul@exemple"));
  assert.ok(!JSON.stringify(o).includes("06 00 00"));
  // Seconde copie : le chargeur garde en mémoire les données déjà lues dans un dossier.
  const dossier2 = copieDuJeu();
  writeFileSync(join(dossier2, "organismes.yaml"), texte.replace("  presentation_validee: true\n", "  presentation_validee: false\n"));
  o = chargerDonnees(dossier2).organismes.find((x) => x.id === "O001");
  rmSync(dossier2, { recursive: true, force: true });
  assert.equal(o.presentation, null);
  assert.equal(o.histoire, null);
  assert.deepEqual(o.equipe, []);
  rmSync(dossier, { recursive: true, force: true });
});

test("page d'un organisme : bannière et photos fournies, entrées invalides ignorées ; rien sans médias", () => {
  const { lire, sortie } = siteConstruit();
  const avec = lire(`organismes/${readdirSync(join(sortie, "organismes")).find((n) => n.startsWith("o001-"))}/index.html`);
  assert.match(avec, /<figure class="org-banniere"[^>]*>\s*<img src="\/medias\/O001\/banniere\.jpg" alt="Salle de travaux pratiques"/);
  assert.match(avec, /id="photos-titre"[^>]*>Photos/);
  assert.equal((avec.match(/<li[^>]*><figure[^>]*><a href="\/medias\/O001\//g) || []).length, 2);
  for (const interdit of ["absente.jpg", "script.svg", "secret.jpg", "Format refusé"]) assert.ok(!avec.includes(interdit), interdit);
  const sans = lire(`organismes/${readdirSync(join(sortie, "organismes")).find((n) => n.startsWith("o002-"))}/index.html`);
  assert.doesNotMatch(sans, /org-banniere"|id="photos-titre"/);
});

test("nettoyage du site construit pour les tests", () => {
  if (!construit) return;
  rmSync(construit.sortie, { recursive: true, force: true });
  rmSync(construit.donnees, { recursive: true, force: true });
});
