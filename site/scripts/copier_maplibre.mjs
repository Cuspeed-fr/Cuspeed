// Copie le moteur de calcul (« worker ») de MapLibre dans public/maplibre/, pour qu'il soit servi par
// notre propre site : aucune requête vers un service tiers. Lancé avant chaque dev et chaque construction.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ici = dirname(fileURLToPath(import.meta.url));
const source = join(ici, "..", "node_modules", "maplibre-gl", "dist");
const cible = join(ici, "..", "public", "maplibre");
mkdirSync(cible, { recursive: true });
for (const nom of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  if (!existsSync(join(source, nom))) throw new Error(`MapLibre : fichier absent ${nom}`);
  copyFileSync(join(source, nom), join(cible, nom));
}
