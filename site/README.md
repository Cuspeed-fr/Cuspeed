# Site Cuspeed

Site statique construit avec [Astro](https://astro.build). Aucun serveur, aucune lecture de la base au moment de la visite : chaque page est générée à l'avance à partir des fiches validées.

## Commandes (depuis ce dossier)

```bash
npm ci            # installe exactement les versions verrouillées (package-lock.json)
npm test          # tests : aucune fiche non validée, aucune note interne publiée
npm run build     # construit le site dans dist/ puis lance le contrôle du résultat
npm run dev       # aperçu local avec rechargement automatique
```

Pour ne pas envoyer de statistiques d'usage à l'éditeur d'Astro : `export ASTRO_TELEMETRY_DISABLED=1`.

## D'où viennent les données

Le site lit un dossier au format du miroir `data/` (voir `docs/modele-de-donnees.md`) :

- par défaut, le miroir `../data/` du dépôt ;
- sinon le dossier indiqué par la variable `CUSPEED_DATA`. Pour la mise en ligne, ce sera l'export des seules fiches validées (`scripts/sauvegarder_vers_yaml.py --seulement-validees`).

Deux protections indépendantes :

1. `src/lib/donnees.js` ne garde que les fiches au statut `validee` et ne recopie que les champs publics, un par un. Les notes internes, les pistes et les sources surveillées ne sont jamais lues. Une fiche validée incohérente (organisme inconnu, pas de source officielle) arrête la construction.
2. `scripts/controler_construction.mjs` relit le site construit et échoue s'il y trouve une fiche non validée, une note interne, un motif de secret, une ressource chargée depuis un autre site, ou une page sans titre, description ou adresse canonique. Avec `CUSPEED_PUBLICATION=1`, il refuse aussi les champs « [à compléter] » (mentions légales).

## Organisation

| Fichier | Rôle |
| --- | --- |
| `src/pages/index.astro` | Accueil : carte, filtres, liste de toutes les formations |
| `src/pages/formations/[slug].astro` | Une page par formation (`/formations/f0084-du-parodontologie/`) |
| `src/pages/organismes/` | Liste des organismes et une page par organisme |
| `src/pages/a-propos.astro`, `mentions-legales.astro`, `plan-du-site.astro`, `404.astro` | Pages fixes |
| `src/layouts/Base.astro` | Gabarit commun, balises de référencement, données structurées schema.org |
| `src/lib/donnees.js` | Chargement et filtrage des données publiques |
| `src/lib/carte.js`, `contour-france.js` | Carte de France maison (SVG, sans service externe) |
| `tests/` | Tests et jeu d'essai inventé |

## Choix

- Aucune ressource externe (police, carte, script, mesure d'audience) : rien n'est transmis à un tiers quand on visite le site, et pas de bandeau cookies.
- Liste complète écrite dans la page : lisible sans JavaScript et par les moteurs de recherche. Le script de la page d'accueil ne fait que masquer ce qui ne correspond pas aux filtres.
- Adresses de fiche : identifiant + intitulé. L'identifiant ne change jamais ; si un intitulé change, l'adresse change aussi (à traiter par des redirections le jour où cela arrivera).
