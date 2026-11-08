"""Prépare le dossier envoyé chez l'hébergeur : seulement le site construit, rien d'autre.

Usage : python3 scripts/preparer_envoi.py DOSSIER_DIST DOSSIER_DESTINATION

Le dossier DOSSIER_DIST (site/dist/) est copié dans DOSSIER_DESTINATION, à condition que chaque
fichier soit un fichier de site ordinaire. Le script refuse (code 1, rien n'est copié) si on trouve :
- un lien symbolique (il pourrait pointer vers la base ou vers le dépôt) ;
- un fichier ou un dossier caché (.git, .env, .github...) ;
- un dossier de travail à la racine (data, scripts, src, supabase, docs, tests, node_modules) ;
- une extension qui n'est pas celle d'un site (un .yaml, un .py, un .sql...) ;
- un nom qui évoque une note interne (« note », « notes » séparé par des tirets, points ou tirets bas) ;
- l'absence de page d'accueil (index.html) : le dossier n'est alors pas un site construit.

Ce script ne lit jamais la base ; il ne fait que trier des fichiers déjà construits.
"""
import re
import shutil
import sys
from pathlib import Path

# Extensions d'un site statique : pages, styles, scripts, images, polices, fichiers d'annuaire.
EXTENSIONS_PERMISES = {
    ".html", ".css", ".js", ".mjs", ".json", ".xml", ".txt", ".svg", ".png", ".jpg", ".jpeg",
    ".webp", ".avif", ".ico", ".woff", ".woff2", ".webmanifest",
    # Fond de carte (données publiques, sans note) chargé par la carte interactive.
    ".geojson",
}
# Dossiers de travail qui ne doivent jamais se retrouver à la racine du site envoyé.
DOSSIERS_INTERDITS = {"data", "scripts", "src", "supabase", "docs", "tests", "node_modules", ".github", ".git"}
# « note » ou « notes » isolé dans le nom (ex. notes-internes.html, F0001-note.txt).
MOTIF_NOTE = re.compile(r"(^|[-_.])notes?([-_.]|$)", re.IGNORECASE)


def controler_fichier(relatif):
    """Renvoie la liste des raisons de refus pour un chemin relatif (vide = fichier accepté)."""
    raisons = []
    if any(partie.startswith(".") for partie in relatif.parts):
        raisons.append("fichier ou dossier caché")
    if relatif.parts and relatif.parts[0] in DOSSIERS_INTERDITS:
        raisons.append(f"dossier de travail « {relatif.parts[0]} » à la racine")
    if relatif.suffix.lower() not in EXTENSIONS_PERMISES:
        raisons.append(f"extension « {relatif.suffix or '(aucune)'} » non permise pour un site")
    if any(MOTIF_NOTE.search(partie) for partie in relatif.parts):
        raisons.append("nom qui évoque une note interne")
    return raisons


def preparer(dist, destination):
    """Copie le site construit vers destination. Renvoie (liste des fichiers copiés, liste des erreurs)."""
    dist = Path(dist)
    if not dist.is_dir():
        return [], [f"dossier introuvable : {dist}"]
    if not (dist / "index.html").is_file():
        return [], ["pas de page d'accueil index.html : ce n'est pas un site construit"]

    erreurs = []
    a_copier = []
    for chemin in sorted(dist.rglob("*")):
        relatif = chemin.relative_to(dist)
        if chemin.is_symlink():
            erreurs.append(f"{relatif} : lien symbolique refusé")
            continue
        if chemin.is_dir():
            continue
        for raison in controler_fichier(relatif):
            erreurs.append(f"{relatif} : {raison}")
        a_copier.append(relatif)

    if erreurs:
        return [], erreurs

    destination = Path(destination)
    if destination.exists():
        shutil.rmtree(destination)
    for relatif in a_copier:
        cible = destination / relatif
        cible.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(dist / relatif, cible)
    return [str(r) for r in a_copier], []


def main(argv):
    if len(argv) != 2:
        print("Usage : preparer_envoi.py DOSSIER_DIST DOSSIER_DESTINATION", file=sys.stderr)
        return 2
    copies, erreurs = preparer(argv[0], argv[1])
    if erreurs:
        print("Envoi refusé, aucun fichier n'est parti :", file=sys.stderr)
        for erreur in erreurs:
            print(f"  - {erreur}", file=sys.stderr)
        return 1
    print(f"Dossier d'envoi prêt : {len(copies)} fichiers, uniquement le site construit.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
