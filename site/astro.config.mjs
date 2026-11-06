// Configuration Astro de Cuspeed.
// Le site est entièrement pré-généré (aucun serveur, aucune lecture de la base au moment de la visite).
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { chargerDonnees } from "./src/lib/donnees.js";

const donnees = chargerDonnees();
if (donnees.nonFigees.length) {
  console.warn(
    `Adresses non encore figées pour ${donnees.nonFigees.length} fiche(s) : ${donnees.nonFigees.join(", ")}. ` +
      "Lancer « npm run figer-adresses » et proposer site/adresses.json par pull request.",
  );
}
const redirections = new Set(donnees.redirections.map((r) => `/formations/${r.de}/`));
// Date de dernière vérification de chaque fiche, donnée aux moteurs comme date de
// modification. Jamais la date de construction : elle changerait tous les jours sans raison.
const dates = new Map(
  donnees.formations
    .filter((f) => f.derniere_verification)
    .map((f) => [`/formations/${f.slug}/`, f.derniere_verification]),
);
const estRedirection = (page) => redirections.has(new URL(page).pathname);

export default defineConfig({
  site: "https://cuspeed.fr",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  vite: {
    build: {
      // Le script de l'accueil (filtres, tri, « Afficher plus », environ 6 Ko) est écrit dans la
      // page plutôt que téléchargé à part : une requête de moins, filtres prêts plus tôt en 4G
      // lente (mesuré le 6 novembre 2026). Les polices (plus de 12 Ko) restent des fichiers.
      assetsInlineLimit: 8192,
    },
  },
  integrations: [
    sitemap({
      // Ni la page 404, ni les pages de redirection (adresse courte /formations/f0084/
      // ou ancienne adresse) n'ont leur place dans le plan du site.
      filter: (page) => !page.includes("/404") && !estRedirection(page),
      serialize(item) {
        const date = dates.get(new URL(item.url).pathname);
        return date ? { ...item, lastmod: date } : item;
      },
    }),
  ],
});
