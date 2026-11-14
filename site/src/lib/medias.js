// Médias d'un organisme : une bannière et quelques photos, fournis par l'organisme lui-même (avec son
// autorisation écrite), jamais récupérés sur un site. Décision de Chris, 14 novembre 2026.
// Aujourd'hui, Chris les dépose par pull request dans site/public/medias/Oxxx/ avec un fichier medias.json :
//
//   {
//     "banniere": { "fichier": "banniere.jpg", "alt": "Salle de travaux pratiques", "credit": "© Clinic-All" },
//     "photos": [ { "fichier": "tp-1.jpg", "alt": "Atelier sur mâchoires animales", "credit": "© Clinic-All" } ]
//   }
//
// Plus tard (V2), l'organisme les déposera depuis son compte. Rien n'est affiché sans médias.
// Lu une fois, à la construction (même principe que les logos).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DOSSIER = process.env.CUSPEED_MEDIAS ?? join(process.cwd(), "public", "medias");
const FORMATS = /\.(jpe?g|png|webp|avif)$/i;
export const PHOTOS_MAX = 12;

const cache = new Map();

/** Un média valide : fichier image présent dans le dossier de l'organisme, texte alternatif obligatoire. */
function media(id, m) {
  if (!m || typeof m.fichier !== "string" || typeof m.alt !== "string") return null;
  const fichier = m.fichier.trim();
  const alt = m.alt.trim();
  // Un nom de fichier simple : pas de dossier, pas de remontée, une extension d'image.
  if (!/^[\w.-]+$/.test(fichier) || fichier.startsWith(".") || !FORMATS.test(fichier) || !alt) return null;
  if (!existsSync(join(DOSSIER, id, fichier))) return null;
  return {
    src: `/medias/${id}/${fichier}`,
    alt: alt.slice(0, 160),
    credit: typeof m.credit === "string" && m.credit.trim() ? m.credit.trim().slice(0, 120) : null,
  };
}

/** Médias de l'organisme : { banniere, photos } (banniere peut être null, photos peut être vide). */
export function mediasDe(idOrganisme) {
  const id = String(idOrganisme).toUpperCase();
  if (!/^O\d{3,}$/.test(id)) return { banniere: null, photos: [] };
  if (cache.has(id)) return cache.get(id);
  let brut = null;
  try {
    brut = JSON.parse(readFileSync(join(DOSSIER, id, "medias.json"), "utf8"));
  } catch {
    brut = null; // pas de médias (ou fichier illisible) : rien n'est affiché
  }
  const resultat = {
    banniere: media(id, brut?.banniere),
    photos: (Array.isArray(brut?.photos) ? brut.photos : []).map((m) => media(id, m)).filter(Boolean).slice(0, PHOTOS_MAX),
  };
  cache.set(id, resultat);
  return resultat;
}
