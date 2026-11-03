// Tests du site, lancés par `npm test` (exécuteur de tests intégré à Node, sans dépendance).
// Ils portent sur ce qui compte le plus : ne jamais publier une fiche non validée ni une note interne.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { chargerDonnees, enSlug, tarifLisible, dateLisible, villesDe } from "../src/lib/donnees.js";
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
