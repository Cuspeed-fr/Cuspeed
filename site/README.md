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
2. `scripts/controler_construction.mjs` relit le site construit et échoue s'il y trouve une fiche non validée, une note interne, un motif de secret, une ressource chargée depuis un autre site, ou une page sans titre, description ou adresse canonique, ou un titre ou une description en double. Avec `CUSPEED_PUBLICATION=1`, il refuse aussi les champs « [à compléter] » (mentions légales).

**Pour la mise en ligne**, le site est construit sur l'export des seules fiches validées : ce dossier ne contient ni fiche non validée ni note à rechercher. Il faut donc lancer la construction avec `CUSPEED_DATA_CONTROLE` pointant vers le miroir complet (`data/` de la branche `sauvegarde`), et `CUSPEED_PUBLICATION=1` :

```bash
CUSPEED_DATA=/chemin/export-validees CUSPEED_DATA_CONTROLE=/chemin/miroir-complet CUSPEED_PUBLICATION=1 npm run build
```

## Publication

`scripts/publier.sh` (à la racine du dépôt) enchaîne l'export depuis la base, les contrôles et la construction ; `.github/workflows/publication.yml` le lance depuis GitHub (bouton « Run workflow »). Avec `--essai`, le site est construit pour une adresse de test : toutes les pages portent `noindex` et `robots.txt` interdit tout (`CUSPEED_ESSAI=1`).

## Organisation

| Fichier | Rôle |
| --- | --- |
| `src/pages/index.astro` | Accueil : recherche, carte, filtres, tri, liste de toutes les formations par paquets |
| `src/pages/formations/[slug].astro` | Une page par formation (`/formations/f0084-du-parodontologie/`) |
| `src/pages/organismes/` | Liste des organismes et une page par organisme |
| `src/pages/a-propos.astro`, `mentions-legales.astro`, `plan-du-site.astro`, `404.astro` | Pages fixes |
| `src/layouts/Base.astro` | Gabarit commun, balises de référencement, données structurées schema.org |
| `src/lib/donnees.js` | Chargement et filtrage des données publiques |
| `src/lib/carte.js`, `contour-france.js` | Carte de France maison (SVG, sans service externe) |
| `tests/` | Tests et jeu d'essai inventé |

## Choix

- Aucune ressource externe (police, carte, script, mesure d'audience) : rien n'est transmis à un tiers quand on visite le site, et pas de bandeau cookies.
- Identité visuelle : polices League Spartan (titres, logo) et DM Sans (texte), hébergées sur le site via les paquets `@fontsource` (licence OFL, sous-ensemble latin, 5 graisses d'environ 14 Ko en woff2 ; les fichiers woff de secours sont publiés mais les navigateurs actuels ne les téléchargent pas) ; palette officielle et contrastes vérifiés en tête de `src/styles/global.css` ; logo vectorisé dans `src/lib/logo.js` et `src/components/Logo.astro`.
- Liste complète écrite dans la page : lisible sans JavaScript et par les moteurs de recherche. Le script de la page d'accueil (sans bibliothèque, écrit dans la page) filtre, trie et affiche la liste par paquets de 24 (« Afficher plus ») ; sans JavaScript, toutes les fiches s'affichent. Les cartes hors de l'écran ne sont pas dessinées (`content-visibility: auto`) : la liste reste fluide au-delà de 1 000 fiches.
- La classe `js`, posée dans l'en-tête avant le premier affichage, réserve la place des commandes qui ont besoin de JavaScript (filtres, tri, « Afficher plus ») : la page ne se décale pas quand le script démarre.
- Adresses stables : une adresse publiée ne change plus, même si l'intitulé change, pour garder l'historique Google et les liens partagés. Voir ci-dessous.

## Adresses des pages (`adresses.json`)

- Chaque fiche publiée a une adresse figée dans `adresses.json` (ex. `F0084` → `/formations/f0084-du-parodontologie-medicale-et-chirurgicale/`). Si l'intitulé change dans la base, l'adresse reste la même.
- Chaque fiche a aussi une adresse courte permanente, `/formations/f0084/`, qui redirige vers l'adresse complète.
- Une nouvelle fiche validée reçoit une adresse calculée. La construction le signale ; `npm run figer-adresses` l'ajoute au registre, à proposer par pull request. Un test vérifie que le registre couvre toutes les fiches validées du miroir `data/`.
- Pour renommer volontairement une adresse (rare) : changer l'entrée, et ajouter l'ancienne dans `anciennes` pour qu'elle redirige vers la nouvelle.
- Les redirections sont des pages à rafraîchissement immédiat (site statique) ; Google les traite comme des redirections permanentes. Si l'hébergeur permet de vraies redirections, on pourra les générer à la place.
- Une fiche archivée n'est plus publiée : son adresse renvoie la page 404, et Google l'oublie. Aucune page ne mentionne une fiche non validée.
