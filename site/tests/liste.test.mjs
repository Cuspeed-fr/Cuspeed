import { test } from "node:test";
import assert from "node:assert/strict";
import { compterParOrganisme, texteResultat } from "../src/lib/liste.js";

test("comptage par organisme : seules les formations retenues comptent", () => {
  const c = compterParOrganisme([
    { organisme: "O001", retenue: true },
    { organisme: "O001", retenue: true },
    { organisme: "O002", retenue: false },
    { organisme: "O003", retenue: true },
  ]);
  assert.equal(c.get("O001"), 2);
  assert.equal(c.has("O002"), false);
  assert.equal(c.get("O003"), 1);
});

test("compteur : accords et mode", () => {
  assert.equal(texteResultat("formations", 3, 1), "1 formation");
  assert.equal(texteResultat("formations", 3, 12), "12 formations");
  assert.equal(texteResultat("organismes", 1, 1), "1 organisme · 1 formation");
  assert.equal(texteResultat("organismes", 30, 160), "30 organismes · 160 formations");
});
