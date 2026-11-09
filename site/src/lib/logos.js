// Logos des organismes, fournis par Chris (avec l'accord de chaque organisme) dans
// site/public/logos/, nommés par l'identifiant de l'organisme : O001.svg, O021.png, O038.webp…
// Un organisme sans fichier n'a simplement pas de logo affiché. Lu une fois, à la construction.
import { readdirSync } from "node:fs";
import { join } from "node:path";

// La construction est lancée depuis le dossier site/ (npm run build, tests) : le chemin part de là,
// car ce fichier est déplacé dans le dossier de construction (import.meta.url n'y est plus fiable).
const DOSSIER = join(process.cwd(), "public", "logos");
const FORMATS = ["svg", "webp", "png", "jpg", "jpeg"];

let index = null;
function lireIndex() {
  if (index) return index;
  index = new Map();
  let noms = [];
  try {
    noms = readdirSync(DOSSIER);
  } catch {
    return index; // pas encore de dossier : aucun logo
  }
  for (const nom of noms) {
    const m = /^(O\d{3,})\.([a-z]+)$/i.exec(nom);
    if (!m) continue;
    const ext = m[2].toLowerCase();
    if (!FORMATS.includes(ext)) continue;
    const id = m[1].toUpperCase();
    // Si plusieurs formats existent pour un organisme, le premier de FORMATS l'emporte.
    const actuel = index.get(id);
    if (!actuel || FORMATS.indexOf(ext) < FORMATS.indexOf(actuel.ext)) index.set(id, { ext, chemin: `/logos/${nom}` });
  }
  return index;
}

/** Adresse du logo de l'organisme (« /logos/O001.svg »), ou null s'il n'y en a pas. */
export function logoDe(idOrganisme) {
  return lireIndex().get(String(idOrganisme).toUpperCase())?.chemin ?? null;
}
