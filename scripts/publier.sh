#!/usr/bin/env bash
# Chaîne de publication du site Cuspeed, indépendante de l'hébergeur.
#
#   1. Export des seules fiches validées (le site) et de la base complète (le contrôle).
#   2. Contrôle des données exportées (verifier_donnees.py).
#   3. Tests du site, construction, contrôle du site construit.
#   4. Résultat dans site/dist/, prêt à être envoyé chez l'hébergeur.
#
# Si une étape échoue, le script s'arrête avec une erreur et rien n'est envoyé :
# la version en ligne reste en place.
#
# Usage (depuis la racine du dépôt) :
#   CUSPEED_DB_URL=... scripts/publier.sh            mise en ligne réelle
#   CUSPEED_DB_URL=... scripts/publier.sh --essai    adresse de test : pages non référencées,
#                                                    mentions légales incomplètes tolérées
#
# CUSPEED_DB_URL : adresse de connexion du rôle lecteur_sauvegarde (lecture seule). C'est un secret :
# variable d'environnement uniquement, jamais dans un fichier ni dans une conversation.

set -euo pipefail

ESSAI=0
if [ "${1:-}" = "--essai" ]; then ESSAI=1; fi

if [ -z "${CUSPEED_DB_URL:-}" ]; then
  echo "CUSPEED_DB_URL manquant (rôle lecteur_sauvegarde)." >&2
  exit 1
fi

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

echo "== 1. Export de la base"
python3 "$RACINE/scripts/sauvegarder_vers_yaml.py" --seulement-validees --sortie "$TRAVAIL/validees"
python3 "$RACINE/scripts/sauvegarder_vers_yaml.py" --sortie "$TRAVAIL/complet"

echo "== 2. Contrôle des données exportées"
CUSPEED_DATA="$TRAVAIL/validees" python3 "$RACINE/scripts/verifier_donnees.py"
# L'export de publication ne doit contenir que des fiches validées, sans note interne.
python3 - "$TRAVAIL/validees" <<'PY'
import sys, pathlib, yaml
erreurs = []
for f in sorted(pathlib.Path(sys.argv[1], "formations").glob("*.yaml")):
    d = yaml.safe_load(f.read_text(encoding="utf-8"))
    if d.get("statut") != "validee":
        erreurs.append(f"{d.get('id')} : statut {d.get('statut')}")
    if d.get("notes"):
        erreurs.append(f"{d.get('id')} : note interne présente")
if erreurs:
    sys.exit("Export de publication incorrect :\n" + "\n".join(erreurs))
print("Export de publication : seulement des fiches validées, aucune note.")
PY

echo "== 3. Tests et construction du site"
cd "$RACINE/site"
export ASTRO_TELEMETRY_DISABLED=1
npm ci --no-audit --no-fund
npm test
if [ "$ESSAI" = "1" ]; then
  CUSPEED_DATA="$TRAVAIL/validees" CUSPEED_DATA_CONTROLE="$TRAVAIL/complet" CUSPEED_ESSAI=1 npm run build
else
  CUSPEED_DATA="$TRAVAIL/validees" CUSPEED_DATA_CONTROLE="$TRAVAIL/complet" CUSPEED_PUBLICATION=1 npm run build
fi

echo "== 4. Site prêt dans site/dist/ ($(find dist -name index.html | wc -l) pages)"
