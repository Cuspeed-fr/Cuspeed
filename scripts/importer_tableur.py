#!/usr/bin/env python3
"""Importe le tableur historique (atlas-formation-dentaire-base.xlsx) dans data/.

Usage unique au démarrage du projet :
    python3 scripts/importer_tableur.py chemin/vers/tableur.xlsx

Crée un fichier YAML par formation, ainsi que organismes, lieux, surveillance,
référentiels et pistes. Refuse d'écraser un dossier data/formations non vide.
"""
import csv
import re
import sys
import unicodedata
from pathlib import Path

import yaml
from openpyxl import load_workbook

RACINE = Path(__file__).resolve().parent.parent
DATA = RACINE / "data"

DISCIPLINES = {
    "paro": "Parodontologie", "implanto": "Implantologie", "ortho": "Orthodontie",
    "proth": "Prothèse & réhabilitation", "resto": "Restauratrice & esthétique",
    "endo": "Endodontie", "chir": "Chirurgie orale", "pedo": "Odontologie pédiatrique",
    "occlu": "Occlusodontie & ATM", "sommeil": "Médecine du sommeil",
    "mbd": "Pathologie & médecine orale", "sedation": "Sédation & hypnose",
    "laser": "Laser", "num": "Numérique", "geria": "Gériatrie & handicap",
    "legal": "Odontologie légale & expertise", "bio": "Biologie & biomatériaux",
    "omni": "Omnipratique & remise à niveau", "sp": "Santé publique & qualité",
}
TYPES = {
    "DU": ("du", "universitaire"), "DIU": ("diu", "universitaire"),
    "DESU": ("desu", "universitaire"), "CES": ("ces", "universitaire"),
    "AUEC": ("auec", "universitaire"), "AEU": ("aeu", "universitaire"),
    "Cursus": ("cursus", "prive"), "Masterclass": ("masterclass", "prive"),
    "Journée": ("journee", "prive"), "Catalogue": ("catalogue", "prive"),
}
TYPE_LIBELLES = {
    "du": "DU", "diu": "DIU", "desu": "DESU", "ces": "CES", "auec": "AUEC", "aeu": "AEU",
    "cursus": "Cursus", "masterclass": "Masterclass", "journee": "Journée",
    "catalogue": "Catalogue de formations",
}
TYPES_ORGANISME = {
    "Université": "universite", "Société savante": "societe-savante",
    "Industriel": "industriel", "Organisme privé": "organisme-prive",
}
FORMATS = {"": None, None: None, "Présentiel": "presentiel",
           "Hybride / en ligne": "hybride", "En ligne": "en-ligne"}
STATUTS = {"Validée": "validee", "À vérifier": "a-verifier", "Archivée": "archivee"}
INSCRIPTIONS = {"À renseigner": "a-renseigner", "Ouvertes": "ouvertes", "Complet": "complet",
                "Fermées": "fermees", "Prochaine session annoncée": "annoncee"}


def slug(texte, longueur=60):
    t = unicodedata.normalize("NFD", texte).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:longueur].rstrip("-")


def lignes(ws):
    entetes = [c.value for c in ws[1]]
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0]:
            yield dict(zip(entetes, row))


def vide(v):
    return None if v in (None, "", "—") else v


def ecrire_yaml(chemin, contenu):
    with open(chemin, "w", encoding="utf-8") as f:
        yaml.safe_dump(contenu, f, allow_unicode=True, sort_keys=False, width=100)


def main(tableur):
    dossier = DATA / "formations"
    if dossier.exists() and any(dossier.glob("*.yaml")):
        sys.exit("data/formations n'est pas vide : import annulé pour ne rien écraser.")
    dossier.mkdir(parents=True, exist_ok=True)

    wb = load_workbook(tableur, data_only=True)
    code_discipline = {v: k for k, v in DISCIPLINES.items()}

    # Référentiels
    ecrire_yaml(DATA / "referentiels.yaml", {
        "disciplines": DISCIPLINES,
        "types": TYPE_LIBELLES,
        "types_universitaires": ["du", "diu", "desu", "ces", "auec", "aeu"],
        "secteurs": {"universitaire": "Universitaire", "prive": "Privé"},
        "formats": {"presentiel": "Présentiel", "hybride": "Hybride", "en-ligne": "En ligne"},
        "statuts": {"validee": "Validée", "a-verifier": "À vérifier", "archivee": "Archivée"},
        "inscriptions": {v: k for k, v in INSCRIPTIONS.items()},
        "financements": {"dpc": "DPC", "fifpl": "FIFPL"},
        "types_organisme": {v: k for k, v in TYPES_ORGANISME.items()},
    })

    # Organismes
    organismes = []
    for r in lignes(wb["Organismes"]):
        organismes.append({
            "id": r["ID"], "nom": r["Nom"], "type": TYPES_ORGANISME[r["Type"]],
            "ville": vide(r["Ville principale"]), "site_web": vide(r["Site web"]),
            "page_catalogue": vide(r["Page catalogue / formation continue"]),
            "fiche_revendiquee": r["Fiche revendiquée"] == "Oui",
        })
    ecrire_yaml(DATA / "organismes.yaml", organismes)

    # Lieux
    lieux = []
    for r in lignes(wb["Lieux"]):
        lieux.append({
            "id": r["ID"], "nom": r["Ville / lieu"], "adresse": vide(r["Adresse"]),
            "latitude": r["Latitude"], "longitude": r["Longitude"],
            "regroupement_carte": None if r["Pin carte"] in (None, "—") else r["Pin carte"],
        })
    ecrire_yaml(DATA / "lieux.yaml", lieux)

    # Surveillance des sources
    surveillance = []
    for r in lignes(wb["Sources"]):
        surveillance.append({
            "url": r["URL"], "organisme": r["ID organisme"],
            "type": "pdf" if r["Type"] == "PDF" else "page",
            "derniere_verification": str(r["Dernière vérification"]),
            "empreinte": vide(r["Empreinte du contenu"]),
            "fiabilite": "ok" if r["Statut"] == "OK" else "ancienne-ou-indirecte",
        })
    ecrire_yaml(DATA / "surveillance.yaml", surveillance)

    # Sessions, regroupées par formation
    sessions = {}
    for r in lignes(wb["Sessions"]):
        sessions.setdefault(r["ID formation"], []).append({
            "lieu": r["ID lieu"], "debut": vide(r["Date de début"]), "fin": vide(r["Date de fin"]),
            "inscriptions": INSCRIPTIONS[r["Statut des inscriptions"]],
            "places": vide(r["Places"]),
        })

    # Formations
    n = 0
    for r in lignes(wb["Formations"]):
        type_code, _ = TYPES[r["Type"]]
        fiche = {
            "id": r["ID"],
            "intitule": r["Intitulé"],
            "organisme": r["ID organisme"],
            "secteur": "universitaire" if r["Secteur"] == "Universitaire" else "prive",
            "type": type_code,
            "disciplines": [code_discipline[d.strip()] for d in r["Disciplines"].split(";")],
            "format": FORMATS[r["Format"]],
            "duree": vide(r["Durée (texte)"]),
            "volume_horaire_h": vide(r["Volume horaire (h)"]),
            "tarif": {
                "texte": vide(r["Tarif (texte)"]),
                "euros": vide(r["Tarif (€)"]),
                "annee": vide(r["Année du tarif"]),
            },
            "prerequis": vide(r["Prérequis"]),
            "financement": [],
            "url_officielle": r["URL officielle"],
            "sessions": sessions.get(r["ID"], []),
            "statut": STATUTS[r["Statut fiche"]],
            "derniere_verification": str(r["Dernière vérification"]),
            "notes": vide(r["Notes"]),
        }
        ecrire_yaml(dossier / f"{r['ID']}-{slug(r['Intitulé'])}.yaml", fiche)
        n += 1

    # Pistes
    with open(DATA / "pistes.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "intitule", "organisme", "ville", "categorie", "url_piste",
                    "url_officielle", "repere_sur", "statut", "notes"])
        for r in lignes(wb["Pistes"]):
            w.writerow([r["ID"], r["Intitulé repéré"], r["Organisme"], r["Ville"] or "",
                        r["Catégorie (auto)"], r["URL de la piste"], r["URL officielle"] or "",
                        r["Repéré sur"], r["Statut"], r["Notes"] or ""])

    print(f"Import terminé : {n} formations, {len(organismes)} organismes, "
          f"{len(lieux)} lieux, {len(surveillance)} sources surveillées.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
