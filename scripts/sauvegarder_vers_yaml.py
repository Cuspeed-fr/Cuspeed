#!/usr/bin/env python3
"""Exporte la base Supabase vers des fichiers lisibles (dossier data/), pour la sauvegarde et le contrôle avant publication.

    python3 scripts/sauvegarder_vers_yaml.py                          # copie complète dans data/
    python3 scripts/sauvegarder_vers_yaml.py --seulement-validees --sortie /tmp/export   # ce que le site publiera

La base reste la source de vérité : data/ est un miroir en lecture seule, réécrit par la copie nocturne.
Connexion : variable d'environnement CUSPEED_DB_URL (rôle lecteur_sauvegarde, lecture seule). C'est un secret.
"""
import argparse
import csv
import datetime as dt
import os
import re
import shutil
import sys
import unicodedata
from decimal import Decimal
from pathlib import Path

import psycopg
import yaml
from psycopg.rows import dict_row

RACINE = Path(__file__).resolve().parent.parent


def slug(texte, longueur=60):
    t = unicodedata.normalize("NFD", texte).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:longueur].rstrip("-")


def valeur(v, flottant=False):
    """Convertit les types de la base en types simples pour le YAML."""
    if isinstance(v, Decimal):
        if flottant:
            return float(v)
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    return v


def ecrire_yaml(chemin, contenu):
    with open(chemin, "w", encoding="utf-8") as f:
        yaml.safe_dump(contenu, f, allow_unicode=True, sort_keys=False, width=100)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sortie", default=str(RACINE / "data"))
    parser.add_argument("--seulement-validees", action="store_true")
    args = parser.parse_args()
    url = os.environ.get("CUSPEED_DB_URL")
    if not url:
        sys.exit("CUSPEED_DB_URL manquant.")
    sortie = Path(args.sortie)
    dossier = sortie / "formations"
    if dossier.exists():
        shutil.rmtree(dossier)
    dossier.mkdir(parents=True)

    with psycopg.connect(url, row_factory=dict_row) as conn, conn.cursor() as cur:
        cur.execute("set transaction read only")
        # Référentiels : valeurs variables lues dans la base, listes fixes reprises du fichier existant
        ref = yaml.safe_load((RACINE / "data" / "referentiels.yaml").read_text(encoding="utf-8"))
        cur.execute("select code, libelle from disciplines order by code")
        disciplines = {r["code"]: r["libelle"] for r in cur.fetchall()}
        cur.execute("select code, libelle, universitaire from types_formation order by code")
        types = cur.fetchall()
        ref["disciplines"] = {c: disciplines[c] for c in ref["disciplines"] if c in disciplines}
        ref["disciplines"].update({c: l for c, l in disciplines.items() if c not in ref["disciplines"]})
        ref["types"] = {r["code"]: r["libelle"] for r in sorted(types, key=lambda r: list(ref["types"]).index(r["code"])
                                                                  if r["code"] in ref["types"] else 99)}
        ref["types_universitaires"] = [c for c in ref["types"] if any(r["code"] == c and r["universitaire"] for r in types)]
        ecrire_yaml(sortie / "referentiels.yaml", ref)

        cur.execute("select * from organismes order by id")
        organismes = [{k: r[k] for k in ("id", "nom", "type", "ville", "site_web", "page_catalogue", "fiche_revendiquee")}
                      for r in cur.fetchall()]
        ecrire_yaml(sortie / "organismes.yaml", organismes)

        cur.execute("select * from lieux order by id")
        ecrire_yaml(sortie / "lieux.yaml",
                    [{"id": r["id"], "nom": r["nom"], "adresse": r["adresse"],
                      "latitude": valeur(r["latitude"], True), "longitude": valeur(r["longitude"], True),
                      "regroupement_carte": r["regroupement_carte"]} for r in cur.fetchall()])

        filtre = "where statut = 'validee'" if args.seulement_validees else ""
        cur.execute(f"select * from formations {filtre} order by id")
        formations = cur.fetchall()
        for f in formations:
            cur.execute("select discipline from formation_disciplines where formation_id = %s order by discipline",
                        (f["id"],))
            discs = [r["discipline"] for r in cur.fetchall()]
            cur.execute("select lieu_id, debut, fin, inscriptions, places from sessions where formation_id = %s order by id",
                        (f["id"],))
            sessions = [{"lieu": s["lieu_id"], "debut": valeur(s["debut"]), "fin": valeur(s["fin"]),
                         "inscriptions": s["inscriptions"], "places": s["places"]} for s in cur.fetchall()]
            fiche = {
                "id": f["id"], "intitule": f["intitule"], "organisme": f["organisme_id"], "secteur": f["secteur"],
                "type": f["type"], "disciplines": discs, "format": f["format"], "duree": f["duree"],
                "volume_horaire_h": valeur(f["volume_horaire_h"]),
                "tarif": {"texte": f["tarif_texte"], "euros": valeur(f["tarif_euros"]), "annee": f["tarif_annee"]},
                "prerequis": f["prerequis"], "financement": f["financement"], "url_officielle": f["url_officielle"],
                "sessions": sessions, "statut": f["statut"], "derniere_verification": valeur(f["derniere_verification"]),
                "notes": f["notes"],
            }
            ecrire_yaml(dossier / f"{f['id']}-{slug(f['intitule'])}.yaml", fiche)

        cur.execute("select url, organisme_id, type, derniere_verification, empreinte, fiabilite from surveillance order by id")
        ecrire_yaml(sortie / "surveillance.yaml",
                    [{"url": r["url"], "organisme": r["organisme_id"], "type": r["type"],
                      "derniere_verification": valeur(r["derniere_verification"]), "empreinte": r["empreinte"],
                      "fiabilite": r["fiabilite"]} for r in cur.fetchall()])

        cur.execute("select id, intitule, organisme, ville, categorie, url_piste, url_officielle, repere_sur, statut, notes "
                    "from pistes order by id")
        pistes = cur.fetchall()
        with open(sortie / "pistes.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["id", "intitule", "organisme", "ville", "categorie", "url_piste", "url_officielle",
                        "repere_sur", "statut", "notes"])
            for p in pistes:
                w.writerow([p[k] if p[k] is not None else "" for k in p])
    print(f"{sortie} : {len(formations)} formations, {len(organismes)} organismes, {len(pistes)} pistes exportées.")


if __name__ == "__main__":
    main()
