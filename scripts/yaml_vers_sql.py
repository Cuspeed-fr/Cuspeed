#!/usr/bin/env python3
"""Convertit le dossier data/ (YAML) en supabase/seed.sql : chargement initial de la base.

    python3 scripts/yaml_vers_sql.py

Le fichier produit ne contient aucune donnée personnelle ni aucun secret.
"""
import csv
import sys
from pathlib import Path

import yaml

RACINE = Path(__file__).resolve().parent.parent
DATA = RACINE / "data"
SORTIE = RACINE / "supabase" / "seed.sql"


def lit(valeur):
    """Valeur littérale SQL, échappée."""
    if valeur is None or valeur == "":
        return "null"
    if isinstance(valeur, bool):
        return "true" if valeur else "false"
    if isinstance(valeur, (int, float)):
        return repr(valeur)
    return "'" + str(valeur).replace("'", "''") + "'"


def tableau(valeurs):
    return "array[" + ",".join(lit(v) for v in valeurs) + "]::text[]" if valeurs else "'{}'"


def charger(nom):
    with open(DATA / nom, encoding="utf-8") as f:
        return yaml.safe_load(f)


def inserts(table, colonnes, lignes):
    if not lignes:
        return ""
    sortie = [f"insert into public.{table} ({', '.join(colonnes)}) values"]
    sortie.append(",\n".join("  (" + ", ".join(ligne) + ")" for ligne in lignes) + ";\n")
    return "\n".join(sortie)


def main():
    ref = charger("referentiels.yaml")
    parties = ["-- Chargement initial généré par scripts/yaml_vers_sql.py : ne pas modifier à la main.\n"]

    parties.append(inserts("disciplines", ["code", "libelle"],
                           [[lit(k), lit(v)] for k, v in ref["disciplines"].items()]))
    univ = set(ref["types_universitaires"])
    parties.append(inserts("types_formation", ["code", "libelle", "universitaire"],
                           [[lit(k), lit(v), lit(k in univ)] for k, v in ref["types"].items()]))

    orgs = charger("organismes.yaml")
    parties.append(inserts("organismes",
                           ["id", "nom", "type", "ville", "site_web", "page_catalogue", "fiche_revendiquee"],
                           [[lit(o["id"]), lit(o["nom"]), lit(o["type"]), lit(o.get("ville")), lit(o.get("site_web")),
                             lit(o.get("page_catalogue")), lit(bool(o.get("fiche_revendiquee")))] for o in orgs]))

    lieux = charger("lieux.yaml")
    parties.append(inserts("lieux", ["id", "nom", "adresse", "latitude", "longitude", "regroupement_carte"],
                           [[lit(x["id"]), lit(x["nom"]), lit(x.get("adresse")), lit(x.get("latitude")),
                             lit(x.get("longitude")), lit(x.get("regroupement_carte"))] for x in lieux]))

    formations, disciplines, sessions = [], [], []
    for chemin in sorted((DATA / "formations").glob("*.yaml")):
        with open(chemin, encoding="utf-8") as f:
            d = yaml.safe_load(f)
        t = d.get("tarif") or {}
        formations.append([lit(d["id"]), lit(d["intitule"]), lit(d["organisme"]), lit(d["secteur"]), lit(d["type"]),
                           lit(d.get("format")), lit(d.get("duree")), lit(d.get("volume_horaire_h")),
                           lit(t.get("texte")), lit(t.get("euros")), lit(t.get("annee")), lit(d.get("prerequis")),
                           tableau(d.get("financement") or []), lit(d["url_officielle"]), lit(d["statut"]),
                           lit(d.get("derniere_verification")), lit(d.get("notes"))])
        for disc in d.get("disciplines") or []:
            disciplines.append([lit(d["id"]), lit(disc)])
        for s in d.get("sessions") or []:
            sessions.append([lit(d["id"]), lit(s.get("lieu")), lit(s.get("debut")), lit(s.get("fin")),
                             lit(s.get("inscriptions") or "a-renseigner"), lit(s.get("places"))])
    parties.append(inserts("formations",
                           ["id", "intitule", "organisme_id", "secteur", "type", "format", "duree", "volume_horaire_h",
                            "tarif_texte", "tarif_euros", "tarif_annee", "prerequis", "financement", "url_officielle",
                            "statut", "derniere_verification", "notes"], formations))
    parties.append(inserts("formation_disciplines", ["formation_id", "discipline"], disciplines))
    parties.append(inserts("sessions", ["formation_id", "lieu_id", "debut", "fin", "inscriptions", "places"], sessions))

    veille = charger("surveillance.yaml")
    parties.append(inserts("surveillance", ["url", "organisme_id", "type", "derniere_verification", "empreinte", "fiabilite"],
                           [[lit(v["url"]), lit(v.get("organisme")), lit(v["type"]), lit(v.get("derniere_verification")),
                             lit(v.get("empreinte")), lit(v.get("fiabilite"))] for v in veille]))

    with open(DATA / "pistes.csv", encoding="utf-8", newline="") as f:
        pistes = list(csv.DictReader(f))
    parties.append(inserts("pistes",
                           ["id", "intitule", "organisme", "ville", "categorie", "url_piste", "url_officielle",
                            "repere_sur", "statut", "notes"],
                           [[lit(p["id"]), lit(p["intitule"]), lit(p["organisme"]), lit(p["ville"]), lit(p["categorie"]),
                             lit(p["url_piste"]), lit(p["url_officielle"]), lit(p["repere_sur"]), lit(p["statut"]),
                             lit(p["notes"])] for p in pistes]))

    parties.append("select setval('public.seq_formation', "
                   "(select coalesce(max(substr(id, 2)::int), 0) from public.formations));\n")
    SORTIE.write_text("\n".join(p for p in parties if p), encoding="utf-8")
    print(f"{SORTIE.relative_to(RACINE)} : {len(formations)} formations, {len(sessions)} sessions, "
          f"{len(orgs)} organismes, {len(lieux)} lieux, {len(pistes)} pistes.")


if __name__ == "__main__":
    sys.exit(main())
