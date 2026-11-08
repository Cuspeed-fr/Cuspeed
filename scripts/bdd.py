#!/usr/bin/env python3
"""Outil des agents pour lire et écrire dans la base Cuspeed, dans les limites de leur rôle.

    python3 scripts/bdd.py creer fiche.json                 # extracteur : crée une fiche « à vérifier »
    python3 scripts/bdd.py proposer F0001 duree "10 h" https://source "motif"   # extracteur : propose un changement
    python3 scripts/bdd.py a-verifier                       # liste des fiches et propositions en attente
    python3 scripts/bdd.py fiche F0001                      # affiche une fiche complète
    python3 scripts/bdd.py avis F0001 conforme "détails"    # vérificateur : dépose son avis

La connexion se fait avec la variable d'environnement CUSPEED_DB_URL (adresse propre au rôle de l'agent).
Cette adresse est un secret : elle ne s'écrit jamais dans un fichier du dépôt ni dans une conversation.
Les droits sont imposés par la base elle-même : un refus de la base n'est pas une erreur à contourner.
"""
import json
import os
import sys

import psycopg

# Champs qu'un agent peut proposer de changer sur une fiche (même liste que la contrainte de la table propositions)
CHAMPS_PROPOSABLES = ("intitule", "duree", "volume_horaire_h", "tarif_texte", "tarif_euros", "tarif_annee",
                      "prerequis", "url_officielle", "format", "notes", "precisions",
                      # depuis le 8 novembre 2026 (migration 20261108000100) :
                      # financement et disciplines = tableau texte « {dpc,fifpl} » ; type = code ;
                      # sessions = tableau JSON [{"lieu":"L-LILLE","debut":"2027-01-15","fin":null,
                      #            "inscriptions":"ouvertes","places":12}] qui remplace les sessions de la fiche
                      "financement", "type", "disciplines", "sessions")


def connexion():
    url = os.environ.get("CUSPEED_DB_URL")
    if not url:
        sys.exit("CUSPEED_DB_URL manquant : demande à Chris de la renseigner dans l'environnement (jamais dans un fichier).")
    return psycopg.connect(url)


def creer(chemin):
    """Crée une fiche à partir d'un fichier JSON au format des fiches (voir docs/modele-de-donnees.md)."""
    with open(chemin, encoding="utf-8") as f:
        d = json.load(f)
    t = d.get("tarif") or {}
    with connexion() as conn, conn.cursor() as cur:
        cur.execute(
            """insert into formations (intitule, organisme_id, secteur, type, format, duree, volume_horaire_h,
                   tarif_texte, tarif_euros, tarif_annee, prerequis, precisions, financement, url_officielle,
                   statut, derniere_verification, notes)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'a-verifier',%s,%s) returning id""",
            (d["intitule"], d["organisme"], d["secteur"], d["type"], d.get("format"), d.get("duree"),
             d.get("volume_horaire_h"), t.get("texte"), t.get("euros"), t.get("annee"), d.get("prerequis"),
             d.get("precisions"), d.get("financement") or [], d["url_officielle"],
             d.get("derniere_verification"), d.get("notes")))
        fid = cur.fetchone()[0]
        for disc in d.get("disciplines") or []:
            cur.execute("insert into formation_disciplines (formation_id, discipline) values (%s,%s)", (fid, disc))
        for s in d.get("sessions") or []:
            cur.execute("insert into sessions (formation_id, lieu_id, debut, fin, inscriptions, places) "
                        "values (%s,%s,%s,%s,%s,%s)",
                        (fid, s.get("lieu"), s.get("debut"), s.get("fin"), s.get("inscriptions") or "a-renseigner",
                         s.get("places")))
    print(f"{fid} créée (à vérifier).")


def controler_valeur(champ, valeur):
    """Refuse avant dépôt une valeur mal formée (sinon l'erreur n'apparaîtrait que chez Chris)."""
    import re
    if champ in ("financement", "disciplines"):
        if not re.fullmatch(r"\{[a-z-]+(,[a-z-]+)*\}" + ("" if champ == "disciplines" else r"|\{\}"), valeur):
            sys.exit(f"{champ} : attendu un tableau texte comme {{dpc,fifpl}}, reçu {valeur!r}")
    elif champ == "sessions":
        try:
            sessions = json.loads(valeur)
        except ValueError:
            sys.exit(f"sessions : JSON invalide {valeur!r}")
        cles = {"lieu", "debut", "fin", "inscriptions", "places"}
        if not isinstance(sessions, list) or any(not isinstance(x, dict) or set(x) - cles or
                                                 not (x.get("lieu") or x.get("debut") or x.get("fin"))
                                                 for x in sessions):
            sys.exit(f"sessions : attendu un tableau d'objets {sorted(cles)} avec un lieu ou une date")


def proposer(fid, champ, valeur, source, motif=None):
    if champ not in CHAMPS_PROPOSABLES:
        sys.exit(f"Champ non modifiable par proposition : {champ}. Champs possibles : {', '.join(CHAMPS_PROPOSABLES)}")
    controler_valeur(champ, valeur)
    with connexion() as conn, conn.cursor() as cur:
        cur.execute("select 1 from formations where id = %s", (fid,))
        if cur.fetchone() is None:
            sys.exit(f"Fiche {fid} introuvable.")
        if champ == "disciplines":
            cur.execute("select coalesce(array_agg(discipline order by discipline), '{}')::text "
                        "from formation_disciplines where formation_id = %s", (fid,))
        elif champ == "sessions":
            cur.execute("select coalesce(json_agg(json_build_object('lieu', lieu_id, 'debut', debut, 'fin', fin, "
                        "'inscriptions', inscriptions, 'places', places) order by id), '[]')::text "
                        "from sessions where formation_id = %s", (fid,))
        else:
            cur.execute(f"select {champ}::text from formations where id = %s", (fid,))  # champ validé par la liste ci-dessus
        ligne = cur.fetchone()
        cur.execute("insert into propositions (formation_id, champ, ancienne_valeur, nouvelle_valeur, source_url, motif) "
                    "values (%s,%s,%s,%s,%s,%s) returning id", (fid, champ, ligne[0], valeur, source, motif))
        print(f"Proposition {cur.fetchone()[0]} déposée : {fid}.{champ} {ligne[0]!r} -> {valeur!r}")


def a_verifier():
    with connexion() as conn, conn.cursor() as cur:
        cur.execute("select id, intitule, url_officielle from formations where statut = 'a-verifier' order by id")
        lignes = cur.fetchall()
        print(f"Fiches à vérifier : {len(lignes)}")
        for i, t, u in lignes:
            print(f"  {i}  {t}  {u}")
        cur.execute("select id, formation_id, champ, ancienne_valeur, nouvelle_valeur from propositions "
                    "where statut = 'en-attente' order by id")
        lignes = cur.fetchall()
        print(f"Propositions en attente : {len(lignes)}")
        for i, f, c, a, n in lignes:
            print(f"  #{i}  {f}.{c} : {a!r} -> {n!r}")


def fiche(fid):
    with connexion() as conn, conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("select * from formations where id = %s", (fid,))
        f = cur.fetchone()
        if f is None:
            sys.exit(f"Fiche {fid} introuvable.")
        cur.execute("select discipline from formation_disciplines where formation_id = %s order by 1", (fid,))
        f["disciplines"] = [r["discipline"] for r in cur.fetchall()]
        cur.execute("select lieu_id, debut, fin, inscriptions, places from sessions where formation_id = %s order by id", (fid,))
        f["sessions"] = cur.fetchall()
        print(json.dumps(f, ensure_ascii=False, indent=2, default=str))


def avis(fid, verdict, details=None):
    with connexion() as conn, conn.cursor() as cur:
        cur.execute("insert into verifications (formation_id, avis, details) values (%s,%s,%s)", (fid, verdict, details))
    print(f"Avis déposé : {fid} {verdict}.")


COMMANDES = {"creer": creer, "proposer": proposer, "a-verifier": a_verifier, "fiche": fiche, "avis": avis}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDES:
        sys.exit(__doc__)
    try:
        COMMANDES[sys.argv[1]](*sys.argv[2:])
    except psycopg.Error as e:
        sys.exit(f"Refus ou erreur de la base : {str(e).splitlines()[0]}")
