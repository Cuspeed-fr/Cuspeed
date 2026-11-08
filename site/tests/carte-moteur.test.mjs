import { test } from "node:test";
import assert from "node:assert/strict";
import {
  construirePoints, creerIndex, elementsVisibles, contenuDansEmprise, compter, sessionActive,
} from "../src/lib/carte-moteur.js";

const lieux = {
  "L-LILLE": { id: "L-LILLE", nom: "Lille", latitude: 50.63, longitude: 3.06 },
  "L-ARRAS": { id: "L-ARRAS", nom: "Arras", latitude: 50.29, longitude: 2.78 },
  "L-PARIS": { id: "L-PARIS", nom: "Paris", latitude: 48.86, longitude: 2.35 },
  "L-VIDE": { id: "L-VIDE", nom: "Sans coordonnées", latitude: null, longitude: null },
};
const donnees = (formations) => ({ formations, lieu: (id) => lieux[id] });
const f = (id, organisme, ...sessions) => ({
  id, organisme, sessions: sessions.map((l) => (typeof l === "string" ? { lieu: l } : l)),
});

test("une formation dans deux villes d'un même groupe compte pour une seule", () => {
  const d = donnees([f("F1", "O1", "L-LILLE", "L-ARRAS"), f("F2", "O1", "L-LILLE")]);
  const { points } = construirePoints(d, "2026-11-08");
  const index = creerIndex(points, { rayon: 200 });
  const els = elementsVisibles(index, [-5, 41, 10, 51.5], 4);
  const groupe = els.find((e) => e.type === "groupe");
  assert.ok(groupe);
  assert.equal(groupe.formations.size, 2);
  assert.equal(groupe.organismes.size, 1);
});

test("lieux sans coordonnées et fiches sans lieu sont comptés à part", () => {
  const d = donnees([f("F1", "O1", "L-VIDE"), f("F2", "O1"), f("F3", "O2", "L-PARIS")]);
  const r = construirePoints(d, "2026-11-08");
  assert.deepEqual([...r.sansCoordonnees], ["F1"]);
  assert.deepEqual([...r.sansLieu], ["F2"]);
  assert.equal(r.points.length, 1);
});

test("une session terminée est ignorée, une session sans date est gardée", () => {
  assert.equal(sessionActive({ fin: "2026-01-01" }, "2026-11-08"), false);
  assert.equal(sessionActive({}, "2026-11-08"), true);
  assert.equal(sessionActive({ debut: "2026-12-01" }, "2026-11-08"), true);
});

test("l'emprise ne garde que les lieux visibles et leurs comptes distincts", () => {
  const d = donnees([f("F1", "O1", "L-LILLE", "L-PARIS"), f("F2", "O2", "L-PARIS")]);
  const { points } = construirePoints(d, "2026-11-08");
  const nord = contenuDansEmprise(points, [2, 50, 4, 51]);
  assert.deepEqual([...nord.formations], ["F1"]);
  const tout = contenuDansEmprise(points, [-5, 41, 10, 51.5]);
  assert.equal(tout.formations.size, 2);
  assert.equal(tout.organismes.size, 2);
});

test("compter fait une union, pas une somme", () => {
  const c = compter([{ formations: ["F1", "F2"], organismes: ["O1"] }, { formations: ["F2"], organismes: ["O1"] }]);
  assert.equal(c.formations.size, 2);
  assert.equal(c.organismes.size, 1);
});

test("performance : 3 000 formations, regroupement sous 500 ms", () => {
  const nombreLieux = 300;
  const lx = {};
  for (let i = 0; i < nombreLieux; i++) {
    lx[`L${i}`] = { id: `L${i}`, nom: `V${i}`, latitude: 42 + (i % 20) * 0.45, longitude: -4 + Math.floor(i / 20) * 0.7 };
  }
  const formations = Array.from({ length: 3000 }, (_, i) => f(`F${i}`, `O${i % 100}`, `L${i % nombreLieux}`, `L${(i * 7) % nombreLieux}`));
  const d = { formations, lieu: (id) => lx[id] };
  const t = Date.now();
  const { points } = construirePoints(d, "2026-11-08");
  const index = creerIndex(points);
  const els = elementsVisibles(index, [-5, 41, 10, 51.5], 5);
  assert.ok(Date.now() - t < 500);
  assert.ok(els.length > 0);
});

import { regroupementsDe } from "../src/lib/donnees.js";

test("la liste et la carte ignorent les mêmes sessions terminées", () => {
  const lx = { A: { regroupement_carte: "Lille" }, B: { regroupement_carte: "Paris" } };
  const d = { lieu: (id) => lx[id] };
  const fiche = { sessions: [{ lieu: "A", fin: "2020-01-01" }, { lieu: "B" }] };
  assert.deepEqual(regroupementsDe(fiche, d), ["Paris"]);
});

test("après reconstruction de l'index, un groupe se retrouve par ses lieux, pas par son ancien identifiant", () => {
  const d = donnees([f("F1", "O1", "L-LILLE", "L-ARRAS"), f("F2", "O2", "L-PARIS")]);
  const { points } = construirePoints(d, "2026-11-08");
  const emprise = [-5, 41, 10, 51.5];
  const cle = (els) => els.filter((e) => e.type === "groupe").map((e) => e.lieux.slice().sort().join(",")).sort();
  const a = cle(elementsVisibles(creerIndex(points, { rayon: 200 }), emprise, 4));
  const b = cle(elementsVisibles(creerIndex([...points].reverse(), { rayon: 200 }), emprise, 4));
  assert.deepEqual(a, b);
});
