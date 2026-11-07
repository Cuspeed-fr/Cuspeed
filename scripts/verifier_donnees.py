#!/usr/bin/env python3
"""Contrôle automatique des données Cuspeed.

    python3 scripts/verifier_donnees.py                 # contrôle complet
    python3 scripts/verifier_donnees.py --reference main  # + garde-fou contre les suppressions massives

Sort avec le code 1 à la moindre erreur : une pull request qui ne passe pas
ce contrôle ne peut pas être fusionnée.
"""
import argparse
import csv
import datetime as dt
import os
import re
import subprocess
import sys
from pathlib import Path

import yaml

RACINE = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("CUSPEED_DATA", RACINE / "data"))  # CUSPEED_DATA : dossier d'export à contrôler
ID_FORMATION = re.compile(r"^F\d{4}$")
ID_ORGANISME = re.compile(r"^O\d{3}$")
SECRET = re.compile(r"(sk-ant-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"
                    r"|postgres(ql)?://[^\s:]+:[^\s@]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----)")
CHAMPS = ["id", "intitule", "organisme", "secteur", "type", "disciplines", "format", "duree",
          "volume_horaire_h", "tarif", "prerequis", "financement", "url_officielle", "sessions",
          "statut", "derniere_verification", "notes"]
# Champs facultatifs dans les fichiers : « precisions » (ajouté le 5 novembre 2026) n'existe pas encore dans
# le miroir data/ d'origine. Il deviendra obligatoire quand toutes les copies l'auront.
CHAMPS_FACULTATIFS = ["precisions"]
PRECISIONS_MAX = 200
BAISSE_MAX = 0.05  # au-delà de 5 % de fiches en moins, la publication est bloquée
# Statuts possibles d'une piste (colonne « statut » de la table pistes). La base ne contraint pas la colonne :
# cette liste doit rester alignée sur docs/modele-de-donnees.md. « Fiche créée » : la piste a donné lieu à une fiche
# (lot du 6 novembre 2026).
STATUTS_PISTES = ("À vérifier", "Importée", "Doublon", "Écartée", "Fiche créée")

erreurs = []


def erreur(ou, message):
    erreurs.append(f"{ou} : {message}")


def charger(chemin):
    with open(chemin, encoding="utf-8") as f:
        return yaml.safe_load(f)


def date_valide(valeur):
    try:
        return dt.date.fromisoformat(str(valeur))
    except ValueError:
        return None


def verifier_url(ou, url):
    if not isinstance(url, str) or not url.startswith(("https://", "http://")):
        erreur(ou, f"URL invalide : {url!r}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", help="branche git de comparaison (ex. origin/main)")
    args = parser.parse_args()

    ref = charger(DATA / "referentiels.yaml")
    organismes = charger(DATA / "organismes.yaml")
    lieux = charger(DATA / "lieux.yaml")
    ids_org = set()
    for o in organismes:
        if not ID_ORGANISME.match(str(o.get("id"))):
            erreur("organismes.yaml", f"identifiant invalide {o.get('id')!r}")
        if o["id"] in ids_org:
            erreur("organismes.yaml", f"identifiant en double {o['id']}")
        ids_org.add(o["id"])
        if o.get("type") not in ref["types_organisme"]:
            erreur("organismes.yaml", f"{o['id']} : type inconnu {o.get('type')!r}")
        for champ in ("site_web", "page_catalogue"):
            if o.get(champ):
                verifier_url(f"organismes.yaml {o['id']}", o[champ])

    ids_lieux = set()
    for l in lieux:
        ids_lieux.add(l["id"])
        lat, lon = l.get("latitude"), l.get("longitude")
        if lat is not None and not (41 <= lat <= 51.5 and -5.5 <= lon <= 10):
            erreur("lieux.yaml", f"{l['id']} : coordonnées hors de France métropolitaine")

    aujourdhui = dt.date.today()
    ids = set()
    fichiers = sorted((DATA / "formations").glob("*.yaml"))
    for chemin in fichiers:
        ou = f"formations/{chemin.name}"
        f = charger(chemin)
        if not isinstance(f, dict):
            erreur(ou, "fichier vide ou illisible")
            continue
        manquants = [c for c in CHAMPS if c not in f]
        inconnus = [c for c in f if c not in CHAMPS and c not in CHAMPS_FACULTATIFS]
        if manquants:
            erreur(ou, f"champs manquants : {', '.join(manquants)}")
        if inconnus:
            erreur(ou, f"champs inconnus : {', '.join(inconnus)}")
        fid = str(f.get("id"))
        if not ID_FORMATION.match(fid):
            erreur(ou, f"identifiant invalide {fid!r}")
        elif not chemin.name.startswith(fid + "-"):
            erreur(ou, f"le nom du fichier doit commencer par {fid}-")
        if fid in ids:
            erreur(ou, f"identifiant en double {fid}")
        ids.add(fid)
        if not f.get("intitule"):
            erreur(ou, "intitulé vide")
        if f.get("organisme") not in ids_org:
            erreur(ou, f"organisme inconnu {f.get('organisme')!r}")
        if f.get("secteur") not in ref["secteurs"]:
            erreur(ou, f"secteur inconnu {f.get('secteur')!r}")
        if f.get("type") not in ref["types"]:
            erreur(ou, f"type inconnu {f.get('type')!r}")
        elif (f["type"] in ref["types_universitaires"]) != (f.get("secteur") == "universitaire"):
            erreur(ou, "type et secteur incohérents")
        disc = f.get("disciplines") or []
        if not disc:
            erreur(ou, "au moins une discipline est requise")
        for d in disc:
            if d not in ref["disciplines"]:
                erreur(ou, f"discipline inconnue {d!r}")
        if f.get("format") is not None and f["format"] not in ref["formats"]:
            erreur(ou, f"format inconnu {f['format']!r}")
        for fi in f.get("financement") or []:
            if fi not in ref["financements"]:
                erreur(ou, f"financement inconnu {fi!r}")
        tarif = f.get("tarif") or {}
        euros = tarif.get("euros")
        if euros is not None and (not isinstance(euros, (int, float)) or not 0 < euros < 50000):
            erreur(ou, f"tarif en euros invraisemblable : {euros!r}")
        verifier_url(ou, f.get("url_officielle"))
        precisions = f.get("precisions")
        if precisions is not None and (not isinstance(precisions, str) or not precisions.strip()
                                       or len(precisions) > PRECISIONS_MAX):
            erreur(ou, f"precisions : texte non vide de {PRECISIONS_MAX} caractères au plus attendu")
        if f.get("statut") not in ref["statuts"]:
            erreur(ou, f"statut inconnu {f.get('statut')!r}")
        d = date_valide(f.get("derniere_verification"))
        if d is None:
            erreur(ou, "derniere_verification doit être une date AAAA-MM-JJ")
        elif d > aujourdhui:
            erreur(ou, "derniere_verification est dans le futur")
        if not f.get("sessions"):
            erreur(ou, "au moins une session (avec son lieu) est requise")
        for s in f.get("sessions") or []:
            if s.get("lieu") not in ids_lieux:
                erreur(ou, f"lieu inconnu {s.get('lieu')!r}")
            if s.get("inscriptions") not in ref["inscriptions"]:
                erreur(ou, f"statut d'inscription inconnu {s.get('inscriptions')!r}")
            debut, fin = s.get("debut"), s.get("fin")
            if debut and not date_valide(debut):
                erreur(ou, f"date de début invalide {debut!r}")
            if fin and not date_valide(fin):
                erreur(ou, f"date de fin invalide {fin!r}")
            if debut and fin and date_valide(debut) and date_valide(fin) and date_valide(debut) > date_valide(fin):
                erreur(ou, "la session finit avant de commencer")

    # Pistes
    with open(DATA / "pistes.csv", encoding="utf-8") as fp:
        pistes = list(csv.DictReader(fp))
    for p in pistes:
        if p["statut"] not in STATUTS_PISTES:
            erreur("pistes.csv", f"{p['id']} : statut inconnu {p['statut']!r}")

    # Aucun secret dans le dépôt
    for chemin in RACINE.rglob("*"):
        if chemin.is_file() and ".git" not in chemin.parts and chemin.suffix in (
                ".yaml", ".yml", ".csv", ".md", ".py", ".js", ".ts", ".json", ".astro", ".env", ".txt"):
            if SECRET.search(chemin.read_text(encoding="utf-8", errors="ignore")):
                erreur(str(chemin.relative_to(RACINE)), "ressemble à un secret (clé, jeton, mot de passe)")

    # Garde-fou contre les suppressions massives
    if args.reference:
        sortie = subprocess.run(["git", "ls-tree", "--name-only", f"{args.reference}:data/formations"],
                                capture_output=True, text=True, cwd=RACINE)
        if sortie.returncode == 0:
            avant = len([l for l in sortie.stdout.splitlines() if l.endswith(".yaml")])
            if avant and len(fichiers) < avant * (1 - BAISSE_MAX):
                erreur("formations", f"{avant} fiches avant, {len(fichiers)} maintenant : baisse de plus "
                                     f"de {int(BAISSE_MAX * 100)} %, publication bloquée")

    valides = sum(1 for c in fichiers if charger(c).get("statut") == "validee")
    print(f"{len(fichiers)} formations ({valides} validées), {len(ids_org)} organismes, "
          f"{len(ids_lieux)} lieux, {len(pistes)} pistes.")
    if erreurs:
        print(f"\n{len(erreurs)} erreur(s) :")
        for e in erreurs:
            print(" -", e)
        sys.exit(1)
    print("Aucune erreur.")


if __name__ == "__main__":
    main()
