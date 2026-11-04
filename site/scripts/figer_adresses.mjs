// Ajoute au registre site/adresses.json l'adresse des fiches et organismes publiés qui n'y
// sont pas encore. N'en modifie jamais une existante : une adresse publiée ne change plus.
// Usage (depuis site/) : npm run figer-adresses, puis pull request avec le fichier modifié.
//
// Pour renommer volontairement une adresse (rare) : remplacer l'entrée dans « formations »
// et ajouter l'ancienne dans « anciennes » ; elle sera redirigée vers la nouvelle.

import { writeFileSync } from "node:fs";
import { chargerDonnees, lireRegistre, fichierRegistre, dossierDonnees } from "../src/lib/donnees.js";

const chemin = fichierRegistre();
const registre = lireRegistre(chemin);
const donnees = chargerDonnees(dossierDonnees(), registre);

let ajouts = 0;
for (const f of donnees.formations) {
  if (!registre.formations[f.id]) {
    registre.formations[f.id] = f.slug;
    ajouts++;
  }
}
for (const o of donnees.organismes) {
  if (!registre.organismes[o.id]) {
    registre.organismes[o.id] = o.slug;
    ajouts++;
  }
}

const trier = (objet) => Object.fromEntries(Object.entries(objet).sort(([a], [b]) => a.localeCompare(b)));
const contenu = {
  _lisez_moi:
    "Adresses publiées : ne jamais modifier une entrée existante sans ajouter l'ancienne dans « anciennes ». Voir site/README.md.",
  formations: trier(registre.formations),
  organismes: trier(registre.organismes),
  anciennes: trier(registre.anciennes),
};
writeFileSync(chemin, JSON.stringify(contenu, null, 2) + "\n");
console.log(`${ajouts} adresse(s) ajoutée(s) au registre ${chemin}.`);
