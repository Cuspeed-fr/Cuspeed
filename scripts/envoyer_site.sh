#!/usr/bin/env bash
# Envoie le site construit sur la branche de mise en ligne, que Clever Cloud déploie.
#
# Usage (depuis la racine du dépôt) : scripts/envoyer_site.sh DOSSIER_DIST URL_DEPOT BRANCHE
#   DOSSIER_DIST : site/dist/ (le seul dossier envoyé)
#   URL_DEPOT    : adresse du dépôt GitHub (https://github.com/Cuspeed-fr/Cuspeed.git)
#   BRANCHE      : branche de mise en ligne (« mise-en-ligne ») ; jamais main ni sauvegarde
#
# Fonctionnement :
#   1. scripts/preparer_envoi.py contrôle le dossier et n'en copie que le site ; en cas de refus, on s'arrête.
#   2. On récupère la branche de mise en ligne (historique des envois), on remplace son contenu par le site,
#      on enregistre un commit, puis on pousse (sans forcer : un conflit d'historique s'arrête).
#      La branche ne contient que des pages construites, jamais le code source ni les données.
#   3. Clever Cloud, relié au dépôt GitHub sur cette seule branche, met le site en ligne.
#
# Authentification : fournie par le workflow (jeton GitHub temporaire passé par l'environnement Git,
# jamais sur la ligne de commande). Rien de secret n'est écrit ici.

set -euo pipefail

if [ $# -ne 3 ]; then
  echo "Usage : scripts/envoyer_site.sh DOSSIER_DIST URL_DEPOT BRANCHE" >&2
  exit 2
fi
DIST="$1"
URL="$2"
BRANCHE="$3"
case "$BRANCHE" in
  main|master|sauvegarde|"")
    echo "Branche « $BRANCHE » refusée : le site construit ne va que sur la branche de mise en ligne." >&2
    exit 2
    ;;
esac

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

echo "== 1. Contrôle du dossier à envoyer"
python3 "$RACINE/scripts/preparer_envoi.py" "$DIST" "$TRAVAIL/envoi"

echo "== 2. Branche de mise en ligne « $BRANCHE »"
git init -q -b "$BRANCHE" "$TRAVAIL/depot"
cd "$TRAVAIL/depot"
git remote add depot "$URL"
# Distinguer « dépôt vide » (premier envoi, code 2) d'une panne réseau (on s'arrête).
if git ls-remote --exit-code --heads depot "$BRANCHE" >/dev/null 2>&1; then
  git fetch -q depot "$BRANCHE"
  git checkout -q -B "$BRANCHE" FETCH_HEAD
else
  code=$?
  if [ "$code" -ne 2 ]; then
    echo "Impossible de joindre le dépôt (code $code) : rien n'est envoyé." >&2
    exit 1
  fi
  echo "Premier envoi : la branche « $BRANCHE » sera créée."
fi

# On remplace le contenu suivi par le nouveau site (les fichiers disparus du site disparaissent).
git rm -r -q --ignore-unmatch .
cp -a "$TRAVAIL/envoi/." .
git add -A

echo "== 3. Envoi"
git -c user.name="Publication Cuspeed" -c user.email="contact@cuspeed.fr" \
  commit -q --allow-empty -m "Mise en ligne $(date -u +%F\ %H:%M) UTC"
git push -q depot "HEAD:refs/heads/$BRANCHE"
echo "Site envoyé sur la branche « $BRANCHE ». Clever Cloud le met en ligne."
