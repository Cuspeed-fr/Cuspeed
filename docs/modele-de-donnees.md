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
| `propositions` | Changements proposés sur une fiche publiée (champs texte et nombre, et depuis le 8 novembre 2026 : `financement`, `type`, `disciplines`, `sessions`) | Extracteur : dépôt. Chris : décision. |
| `verifications` | Avis du vérificateur par fiche | Vérificateur : dépôt |
| `pistes` | Formations repérées ailleurs, à vérifier | Extracteur |
| `surveillance` | Pages officielles relues chaque semaine | Extracteur |
| `journal` | Qui a changé quoi, quand (automatique) | Personne : rempli par la base |

Statuts d'une piste (`pistes.statut`) : `À vérifier` (à traiter), `Importée`, `Doublon`, `Écartée`, `Fiche créée` (la piste a donné lieu à une fiche). La base ne contraint pas la colonne ; la liste de référence est `STATUTS_PISTES` dans `scripts/verifier_donnees.py`, qui doit rester identique à ce paragraphe.

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
| `tarif_texte`, `tarif_euros`, `tarif_annee` | Tarif **tel qu'affiché sur la page officielle**, sans conversion HT/TTC : voir « Tarifs » ci-dessous | `1 200 € HT`, `1200`, vide |
| `prerequis` | Diplômes ou expérience demandés | |
| `precisions` | Remarque **publique** courte (200 caractères au plus), tirée de la source officielle : partenariat avec une autre faculté, lieu délocalisé, organisation (« clinique le lundi »)… Affichée sur la fiche (« À savoir »). Ne jamais y mettre une durée, un format, un nombre de places ou le DPC, qui ont leur propre champ. | « Enseignement délocalisé à La Réunion » |
| `financement` | Prises en charge, affichées « Éligible aux aides » : `dpc`, `fifpl`, `opco` (ex. OPCO EP), `cpf`. Uniquement si la source officielle l'écrit, y compris dans une mention générale de l'organisme (« nos formations sont éligibles au FIFPL ») : ce cas est signalé dans `notes` avec la page qui le dit | `{dpc,opco}` |
| `url_officielle` | Page ou PDF officiel, obligatoire, commence par `http` | |
| `statut` | `a-verifier`, `validee`, `archivee` | `validee` |
| `derniere_verification` | Date de la dernière lecture de la source | `2026-11-02` |
| `notes` | Remarque interne, jamais publiée ni visible du public. Contient aussi, depuis le 5 novembre 2026, la citation exacte de la source pour chaque champ rempli (preuve interne), une ligne par champ | `tarif_texte : « 1 200 € HT »` |

Seules les fiches `validee` sont visibles du public et publiées sur le site.

Disciplines (`formation_disciplines`) : une ou plusieurs par fiche, parmi la table `disciplines`. Depuis le 6 novembre 2026, `gestion` (« Gestion & management du cabinet ») accueille les formations sur les ressources humaines, le management, la gestion financière et l'organisation du cabinet.

## Tarifs (règle du 5 novembre 2026)

Le tarif reprend le prix tel qu'affiché sur la page officielle. Aucune conversion HT/TTC, aucun calcul.

- `tarif_texte` : le prix affiché, avec ses mentions (« 1 200 € HT », « à partir de 800 € », « TVA non applicable », formules, variantes). Le site l'affiche tel quel.
- `tarif_euros` : un montant seulement si un prix praticien clair se dégage (voir les cas ci-dessous) ; sinon vide.
- `tarif_annee` : seulement si la source écrit l'année ou la saison du tarif (`2026-27`) ; sinon vide.
- Aucun prix publié par la source : les trois champs restent vides ; le site affiche « Non communiqué : à demander à l'organisme ».

Formules et variantes de prix :

1. **Un même programme vendu à la carte** (formation complète ou modules au choix) : une seule fiche ; `tarif_euros` = prix de la formation complète ; les formules dans `tarif_texte`.
2. **Des formats différents sous un même nom** (en ligne, immersion, masterclass, à des prix distincts) : des fiches distinctes, une par format.
3. **Des tarifs selon le public ou la session** (praticien ou jeune diplômé, membre ou non-membre) : une seule fiche ; `tarif_euros` = prix standard praticien ; les variantes dans `tarif_texte`.

## Propositions sur une fiche publiée

Une fiche publiée ne se modifie que par une proposition (`propositions`), que Chris accepte (`select appliquer_proposition(N);`) ou refuse (`select refuser_proposition(N);`). Format de `nouvelle_valeur` :

- champs texte et nombre : la valeur telle quelle ;
- `financement`, `disciplines` : tableau texte, ex. `{dpc,fifpl}` ; la liste remplace l'ancienne ;
- `type` : le code, ex. `du` ;
- `sessions` : tableau JSON, ex. `[{"lieu":"L-LILLE","debut":"2027-01-15","fin":null,"inscriptions":"ouvertes","places":12}]` ; la liste remplace toutes les sessions de la fiche.

Une proposition invalide (code inconnu, lieu inexistant, session qui finit avant de commencer) échoue sans rien modifier.

## Présentation d'un organisme (`organismes`, décision de Chris du 14 novembre 2026)

La page d'un organisme montre, au-dessus de ses formations, une présentation structurée : logo (fichier `site/public/logos/Oxxx.ext`), court paragraphe, chiffres clés, équipe, histoire et source.

| Champ | Contenu | Exemple |
| --- | --- | --- |
| `presentation` | Court paragraphe descriptif, 40 à 700 caractères, **rédigé** d'après le site officiel (jamais copié d'un site tiers) | « Institut lyonnais de formation continue… » |
| `histoire` | Histoire de l'organisme, 40 à 2000 caractères, d'après le site officiel | |
| `annee_creation` | Année de création écrite par l'organisme | `1998` |
| `adresse` | Adresse du siège, telle que publiée | `66 quai Charles de Gaulle, 69006 Lyon` |
| `equipe` | Équipe publiée par l'organisme : liste de `{"nom", "role"}` (rôle facultatif), 40 personnes au plus. Ni photo, ni coordonnées ; retrait sur simple demande | `[{"nom": "Dr A. Martin", "role": "Fondateur"}]` |
| `presentation_source` | Page officielle d'où vient la présentation (obligatoire dès qu'un champ est rempli) | `https://…/a-propos` |
| `presentation_verifiee_le` | Date de la dernière vérification (obligatoire avec la source) | `2026-11-14` |
| `presentation_par` | `cuspeed` (rédigée par Cuspeed, source affichée) ou `organisme` (V2 : tenue par l'organisme depuis son compte) | `cuspeed` |

La base refuse une présentation sans source ni date, un texte hors des longueurs, une année hors de 1800-2100 et un membre d'équipe avec un autre champ que `nom` et `role`. Les agents n'écrivent jamais ces champs directement : ils les proposent, Chris les valide.

## Sessions (`sessions`)

`formation_id`, `lieu_id`, `debut`, `fin`, `inscriptions` (`a-renseigner`, `ouvertes`, `complet`, `fermees`, `annoncee`), `places`. Une session ne peut pas finir avant de commencer.

## Ce que la base refuse d'elle-même

Prix négatif, source qui ne commence pas par `http`, statut ou type inconnu, organisme ou discipline inexistant, prise en charge hors de la liste (`dpc`, `fifpl`, `opco`, `cpf`), identifiant mal formé, session qui finit avant de commencer. Ces règles sont testées par `supabase/tests/test_securite.py`.

## Format du miroir `data/`

- `data/formations/F0084-intitule.yaml` : une fiche, avec `tarif` (texte, euros, annee), `disciplines` (liste) et `sessions` (liste) regroupés.
- `data/organismes.yaml`, `data/lieux.yaml`, `data/surveillance.yaml`, `data/referentiels.yaml`, `data/pistes.csv`.
- `scripts/yaml_vers_sql.py` reconstruit un chargement SQL depuis ce miroir : c'est aussi le moyen de repartir d'une sauvegarde.
