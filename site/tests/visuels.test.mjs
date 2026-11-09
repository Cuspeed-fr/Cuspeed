// Dessins des disciplines et logos des organismes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as lireYaml } from "yaml";
import { VISUELS, visuelDe } from "../src/lib/visuels.js";

const ICI = dirname(fileURLToPath(import.meta.url));

test("visuels : un dessin pour chaque discipline du référentiel, sans script", () => {
  const ref = lireYaml(readFileSync(join(ICI, "..", "..", "data", "referentiels.yaml"), "utf8"));
  for (const code of Object.keys(ref.disciplines)) {
    assert.ok(VISUELS[code], `pas de dessin pour la discipline ${code}`);
    assert.ok(["bleu", "lime", "marine"].includes(VISUELS[code].ton));
  }
  for (const [code, v] of Object.entries(VISUELS)) {
    // Seulement des formes SVG simples : ni script, ni gestionnaire d'événement, ni lien.
    assert.doesNotMatch(v.dessin, /<script|\son\w+=|href|url\(/i, code);
    assert.match(v.dessin, /^<(path|rect|circle|g)\b/, code);
  }
});

test("visuels : première discipline connue, sinon une dent", () => {
  assert.equal(visuelDe(["paro", "implanto"]).code, "paro");
  assert.equal(visuelDe(["inconnue", "endo"]).code, "endo");
  assert.equal(visuelDe([]).code, "dent");
  assert.equal(visuelDe(undefined).code, "dent");
});

test("logos : fichier nommé par l'identifiant de l'organisme, svg préféré, autres fichiers ignorés", async () => {
  const racine = mkdtempSync(join(tmpdir(), "cuspeed-logos-"));
  mkdirSync(join(racine, "public", "logos"), { recursive: true });
  for (const nom of ["O001.png", "O021.webp", "notes.txt", "O9.png", "O002.gif", "O003.exe"]) {
    writeFileSync(join(racine, "public", "logos", nom), "x");
  }
  writeFileSync(join(racine, "public", "logos", "O001.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"></svg>');
  // PNG minimal : signature, puis largeur 300 et hauteur 100 dans l'en-tête IHDR.
  const png = Buffer.alloc(24);
  png.writeUInt32BE(300, 16);
  png.writeUInt32BE(100, 20);
  writeFileSync(join(racine, "public", "logos", "O005.png"), png);
  const avant = process.cwd();
  process.chdir(racine);
  try {
    const { logoDe, logoInfo } = await import(`../src/lib/logos.js?essai=${Date.now()}`);
    assert.equal(logoDe("O001"), "/logos/O001.svg");
    assert.equal(logoInfo("O001").ratio, 3);
    assert.equal(logoInfo("O005").ratio, 3);
    assert.equal(logoInfo("O021").ratio, null);
    assert.equal(logoDe("o021"), "/logos/O021.webp");
    assert.equal(logoDe("O002"), null);
    assert.equal(logoDe("O003"), null);
    assert.equal(logoDe("O004"), null);
  } finally {
    process.chdir(avant);
  }
});
