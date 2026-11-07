#!/usr/bin/env bash
# Envoie le site construit vers l'application Clever Cloud (site statique, sans lien GitHub).
#
# Usage (depuis la racine du dépôt) : scripts/envoyer_site.sh DOSSIER_DIST URL_GIT_CLEVER
#   DOSSIER_DIST      : site/dist/ (le seul dossier envoyé)
#   URL_GIT_CLEVER    : adresse de poussée Git de l'application cuspeed-site (fournie par Clever Cloud)
#
# Fonctionnement :
#   1. scripts/preparer_envoi.py contrôle le dossier et n'en copie que le site ; en cas de refus, on s'arrête.
#   2. On récupère le dépôt Clever (historique de déploiement), on remplace son contenu par le site,
#      on enregistre un commit, puis on pousse (sans forcer : un conflit d'historique s'arrête).
#   3. Clever Cloud met le site en ligne à la réception du commit.
#
# Authentification : la clé SSH et la liste des serveurs connus sont fournies par le workflow
# (variable GIT_SSH_COMMAND). Rien de secret n'est écrit ici.

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage : scripts/envoyer_site.sh DOSSIER_DIST URL_GIT_CLEVER" >&2
  exit 2
fi
DIST="$1"
URL="$2"

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

echo "== 1. Contrôle du dossier à envoyer"
python3 "$RACINE/scripts/preparer_envoi.py" "$DIST" "$TRAVAIL/envoi"

echo "== 2. Dépôt de déploiement Clever Cloud"
git init -q -b master "$TRAVAIL/depot"
cd "$TRAVAIL/depot"
git remote add clever "$URL"
# Distinguer « dépôt vide » (premier envoi, code 2) d'une panne réseau (on s'arrête).
if git ls-remote --exit-code --heads clever master >/dev/null 2>&1; then
  git fetch -q clever master
  git checkout -q -B master FETCH_HEAD
else
  code=$?
  if [ "$code" -ne 2 ]; then
    echo "Impossible de joindre le dépôt Clever Cloud (code $code) : rien n'est envoyé." >&2
    exit 1
  fi
  echo "Premier envoi : le dépôt Clever Cloud est vide."
fi

# On remplace le contenu suivi par le nouveau site (les fichiers disparus du site disparaissent).
git rm -r -q --ignore-unmatch .
cp -a "$TRAVAIL/envoi/." .
git add -A

echo "== 3. Envoi"
git -c user.name="Publication Cuspeed" -c user.email="contact@cuspeed.fr" \
  commit -q --allow-empty -m "Mise en ligne $(date -u +%F\ %H:%M) UTC"
git push -q clever HEAD:master
echo "Site envoyé. Clever Cloud le met en ligne."
