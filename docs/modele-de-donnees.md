# Modèle de données

La base Supabase (région Paris) est la source de vérité. Sa structure est définie dans `supabase/migrations/`. Le dossier `data/` en est un miroir en lecture seule, au format YAML, réécrit chaque nuit.

## Tables

| Table | Contenu | Qui peut écrire |
| --- | --- | --- |
| `formations` | Une ligne par formation | Extracteur : création en `a-verifier` uniquement. Chris : tout. |
| `formation_disciplines` | Disciplines d'une formation (une ou plusieurs) | Extracteur sur les fiches `a-verifier` |
| `sessions` | Dates, lieu, inscriptions, places | Extracteur sur les fiches `a-verifier` |
| `organismes`, `lieux` | Organismes de formation, villes | Extracteur : ajout seulement. Chris : tout. |
| `disciplines`, `types_formation` | Valeurs autorisées | Chris |
| `propositions` | Changements proposés sur une fiche publiée | Extracteur : dépôt. Chris : décision. |
| `verifications` | Avis du vérificateur par fiche | Vérificateur : dépôt |
| `pistes` | Formations repérées ailleurs, à vérifier | Extracteur |
| `surveillance` | Pages officielles relues chaque semaine | Extracteur |
| `journal` | Qui a changé quoi, quand (automatique) | Personne : rempli par la base |

## Une formation (`formations`)

| Champ | Contenu | Exemple |
| --- | --- | --- |
| `id` | Identifiant attribué automatiquement, jamais réutilisé | `F0084` |
| `intitule` | Intitulé officiel | `DU Parodontologie médicale et chirurgicale` |
| `organisme_id` | Identifiant dans `organismes` | `O009` |
| `secteur` | `universitaire` ou `prive` | `universitaire` |
| `type` | `du`, `diu`, `desu`, `ces`, `auec`, `aeu`, `cursus`, `masterclass`, `journee`, `catalogue` | `du` |
| `format` | `presentiel`, `hybride`, `en-ligne` ou vide | `hybride` |
| `duree` | Durée telle que la source l'écrit | `141 h · sept. à mai` |
| `volume_horaire_h` | Nombre d'heures si la source le donne | `141` |
| `tarif_texte`, `tarif_euros`, `tarif_annee` | Tarif formation continue TTC | `3200`, `2026-27` |
| `prerequis` | Diplômes ou expérience demandés | |
| `precisions` | Remarque **publique** courte (200 caractères au plus), tirée de la source officielle : partenariat avec une autre faculté, lieu délocalisé, éligibilité DPC, organisation… Affichée sur la fiche (« À savoir »). Ne jamais y mettre une durée, un format ou un nombre de places, qui ont leur propre champ. | « Enseignement délocalisé à La Réunion » |
| `financement` | `dpc`, `fifpl` si la source l'indique | `{dpc}` |
| `url_officielle` | Page ou PDF officiel, obligatoire, commence par `http` | |
| `statut` | `a-verifier`, `validee`, `archivee` | `validee` |
| `derniere_verification` | Date de la dernière lecture de la source | `2026-11-02` |
| `notes` | Remarque interne, jamais publiée ni visible du public | |

Seules les fiches `validee` sont visibles du public et publiées sur le site.

## Sessions (`sessions`)

`formation_id`, `lieu_id`, `debut`, `fin`, `inscriptions` (`a-renseigner`, `ouvertes`, `complet`, `fermees`, `annoncee`), `places`. Une session ne peut pas finir avant de commencer.

## Ce que la base refuse d'elle-même

Prix négatif, source qui ne commence pas par `http`, statut ou type inconnu, organisme ou discipline inexistant, identifiant mal formé, session qui finit avant de commencer. Ces règles sont testées par `supabase/tests/test_securite.py`.

## Format du miroir `data/`

- `data/formations/F0084-intitule.yaml` : une fiche, avec `tarif` (texte, euros, annee), `disciplines` (liste) et `sessions` (liste) regroupés.
- `data/organismes.yaml`, `data/lieux.yaml`, `data/surveillance.yaml`, `data/referentiels.yaml`, `data/pistes.csv`.
- `scripts/yaml_vers_sql.py` reconstruit un chargement SQL depuis ce miroir : c'est aussi le moyen de repartir d'une sauvegarde.
