# Cuspeed

Toutes les formations dentaires en France. Restez à la pointe, en un clic.

Dépôt du site cuspeed.fr : structure de la base, code du site et règles de travail des agents. Les données vivent dans la base Supabase (région Paris) ; le dossier `data/` n'en est qu'une copie lisible.

## Démarrer

```
pip install pyyaml "psycopg[binary]"
python3 scripts/verifier_donnees.py        # contrôle de la copie lisible des données
```

## Où trouver quoi

- `CLAUDE.md` : règles du projet, lues par tous les agents
- `docs/processus.md` : circuit de validation, publication, sécurité
- `docs/modele-de-donnees.md` : chaque champ expliqué
- `supabase/` : structure de la base (migrations), chargement initial, tests de sécurité
- `docs/mise-en-place-supabase.md` : réglages à faire une fois
- `data/` : copie lisible de la base (lecture seule, réécrite chaque nuit)
- `.claude/agents/` : fiches de poste des agents (extracteur, vérificateur, développeur, relecteur)
- `scripts/` : outil des agents (`bdd.py`), contrôle des données, copie nocturne, import initial

## État au 3 novembre 2026

Base Supabase (Paris) en place : structure, droits (39 tests) et chargement initial vérifié, soit 195 formations (160 validées, 35 à vérifier), 37 organismes, 472 pistes. Reste à construire le site Astro et à brancher la publication.
