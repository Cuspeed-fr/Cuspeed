// Configuration Astro de Cuspeed.
// Le site est entièrement pré-généré (aucun serveur, aucune lecture de la base au moment de la visite).
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://cuspeed.fr",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  integrations: [
    sitemap({
      // La page 404 n'a rien à faire dans le plan du site.
      filter: (page) => !page.includes("/404"),
    }),
  ],
});
