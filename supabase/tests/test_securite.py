#!/usr/bin/env python3
"""Teste les règles de sécurité de la base : ce que chaque rôle peut et ne peut pas faire.

    DATABASE_URL=postgresql://... python3 supabase/tests/test_securite.py

À lancer sur une base de TEST uniquement (migrations et seed appliqués), jamais sur la base de production.
Chaque essai est annulé (rollback) : la base n'est pas modifiée.
"""
import os
import sys

import psycopg

URL = os.environ.get("DATABASE_URL")
if not URL:
    sys.exit("DATABASE_URL manquant (base de test uniquement)")
if "supabase.co" in URL or "supabase.com" in URL:
    sys.exit("Refus : ce test ne se lance jamais sur Supabase.")

echecs = []
conn = psycopg.connect(URL, autocommit=False)


def essai(nom, role, sql, attendu, params=None):
    """attendu : 'erreur', ou un entier = nombre de lignes retournées / touchées."""
    motif = ""
    with conn.cursor() as cur:
        try:
            cur.execute(f"set local role {role}") if role else None
            cur.execute(sql, params)
            n = cur.rowcount if cur.description is None else len(cur.fetchall())
            resultat = n
        except psycopg.Error as e:
            resultat = "erreur"
            motif = str(e).splitlines()[0][:90]
        finally:
            conn.rollback()
    ok = resultat == attendu
    print(("  ok   " if ok else "  ECHEC"), f"{nom} (attendu {attendu}, obtenu {resultat})" + (f" [{motif}]" if motif else ""))
    if not ok:
        echecs.append(nom)


NOUVELLE = ("insert into formations (intitule, organisme_id, secteur, type, url_officielle, statut) "
            "values ('Test', 'O001', 'prive', 'du', 'https://exemple.fr/x', %s)")

print("Public (le site)")
essai("voit uniquement les fiches validées", "anon", "select id from formations where statut <> 'validee'", 0)
essai("voit les fiches validées", "anon", "select id from formations", 160)
essai("ne lit pas les notes internes", "anon", "select notes from formations", "erreur")
essai("lit les précisions publiques des fiches validées", "anon", "select precisions from formations", 160)
essai("lit la discipline « Gestion & management du cabinet »", "anon",
      "select 1 from disciplines where code = 'gestion' and libelle = 'Gestion & management du cabinet'", 1)
essai("ne lit pas les pistes", "anon", "select * from pistes", "erreur")
essai("ne lit pas le journal", "anon", "select * from journal", "erreur")
essai("n'écrit pas", "anon", NOUVELLE.replace("%s", "'a-verifier'"), "erreur")
essai("ne voit pas les sessions d'une fiche non validée", "anon",
      "select s.id from sessions s join formations f on f.id = s.formation_id where f.statut <> 'validee'", 0)

print("Agent extracteur")
essai("crée une fiche à vérifier", "agent_extracteur", NOUVELLE.replace("%s", "'a-verifier'"), 1)
essai("ne peut pas créer une fiche validée", "agent_extracteur", NOUVELLE.replace("%s", "'validee'"), "erreur")
essai("ne modifie pas une fiche validée", "agent_extracteur",
      "update formations set intitule = 'piraté' where statut = 'validee'", 0)
essai("ne valide pas une fiche", "agent_extracteur",
      "update formations set statut = 'validee' where statut = 'a-verifier'", "erreur")
essai("ne supprime rien", "agent_extracteur", "delete from formations", "erreur")
essai("ne supprime aucune session d'une fiche validée", "agent_extracteur",
      "delete from sessions where formation_id in (select id from formations where statut = 'validee')", 0)
essai("retire seulement les sessions d'une fiche à vérifier", "agent_extracteur", "delete from sessions", 35)
essai("ne change pas les disciplines d'une fiche validée", "agent_extracteur",
      "delete from formation_disciplines where formation_id in (select id from formations where statut = 'validee')", 0)
essai("range une fiche à vérifier dans la discipline gestion", "agent_extracteur",
      "insert into formation_disciplines (formation_id, discipline) "
      "select id, 'gestion' from formations f where statut = 'a-verifier' and not exists "
      "(select 1 from formation_disciplines d where d.formation_id = f.id and d.discipline = 'gestion') "
      "order by id limit 1", 1)
essai("indique une prise en charge OPCO ou CPF sur une fiche à vérifier", "agent_extracteur",
      "update formations set financement = array['dpc','fifpl','opco','cpf'] "
      "where id = (select min(id) from formations where statut = 'a-verifier')", 1)
essai("n'accède pas au service de l'API en tant que service_role", "anon", "select appliquer_proposition(1)", "erreur")
essai("un utilisateur connecté n'accepte pas de proposition", "authenticated", "select appliquer_proposition(1)", "erreur")
essai("un utilisateur connecté n'écrit pas", "authenticated", "update formations set intitule = 'x'", "erreur")
essai("lit les notes internes", "agent_extracteur", "select notes from formations limit 1", 1)
essai("ne lit pas le journal", "agent_extracteur", "select * from journal", "erreur")
essai("dépose une proposition", "agent_extracteur",
      "insert into propositions (formation_id, champ, nouvelle_valeur, source_url) "
      "values ('F0001', 'duree', '10 h', 'https://exemple.fr')", 1)
essai("dépose une proposition sur les précisions", "agent_extracteur",
      "insert into propositions (formation_id, champ, nouvelle_valeur, source_url) "
      "values ('F0001', 'precisions', 'En partenariat avec une autre faculté', 'https://exemple.fr')", 1)
essai("ne propose pas un champ inconnu", "agent_extracteur",
      "insert into propositions (formation_id, champ, nouvelle_valeur, source_url) "
      "values ('F0001', 'statut', 'validee', 'https://exemple.fr')", "erreur")
essai("ne s'accepte pas sa proposition", "agent_extracteur", "select appliquer_proposition(1)", "erreur")
essai("ne crée pas une proposition déjà acceptée", "agent_extracteur",
      "insert into propositions (formation_id, champ, nouvelle_valeur, source_url, statut) "
      "values ('F0001', 'duree', '10 h', 'https://exemple.fr', 'acceptee')", "erreur")
essai("ne modifie pas un organisme", "agent_extracteur", "update organismes set nom = 'x'", "erreur")

print("Agent vérificateur")
essai("dépose un avis", "agent_verificateur",
      "insert into verifications (formation_id, avis) values ('F0001', 'conforme')", 1)
essai("ne modifie aucune fiche", "agent_verificateur", "update formations set intitule = 'x'", "erreur")
essai("ne crée aucune fiche", "agent_verificateur", NOUVELLE.replace("%s", "'a-verifier'"), "erreur")
essai("lit les précisions", "agent_verificateur", "select precisions from formations limit 1", 1)

print("Copie nocturne")
essai("lit le journal", "lecteur_sauvegarde", "select * from journal limit 1", 1)
essai("n'écrit pas", "lecteur_sauvegarde", "update formations set intitule = 'x'", "erreur")
essai("lit les précisions et les notes", "lecteur_sauvegarde", "select precisions, notes from formations limit 1", 1)

print("Contraintes de qualité (propriétaire de la base)")
for nom, sql in [
    ("prix négatif refusé", "update formations set tarif_euros = -5 where id = 'F0001'"),
    ("source non web refusée", "update formations set url_officielle = 'ftp://x' where id = 'F0001'"),
    ("statut inconnu refusé", "update formations set statut = 'publie' where id = 'F0001'"),
    ("organisme inexistant refusé", "update formations set organisme_id = 'O999' where id = 'F0001'"),
    ("discipline inconnue refusée", "insert into formation_disciplines values ('F0001', 'magie')"),
    ("prise en charge inconnue refusée", "update formations set financement = array['opco','mecenat'] where id = 'F0001'"),
    ("identifiant mal formé refusé", "insert into organismes (id, nom, type) values ('X1', 'x', 'universite')"),
    ("précisions de plus de 200 caractères refusées", "update formations set precisions = repeat('x', 201) where id = 'F0001'"),
    ("précisions vides refusées", "update formations set precisions = '  ' where id = 'F0001'"),
    ("session qui finit avant de commencer refusée",
     "insert into sessions (formation_id, debut, fin) values ('F0001', '2027-02-01', '2027-01-01')"),
]:
    essai(nom, None, sql, "erreur")

print("Proposition et journal (propriétaire)")
with conn.cursor() as cur:
    cur.execute("insert into propositions (formation_id, champ, nouvelle_valeur, source_url) "
                "values ('F0001', 'volume_horaire_h', '42', 'https://exemple.fr') returning id")
    pid = cur.fetchone()[0]
    cur.execute("select appliquer_proposition(%s)", (pid,))
    cur.execute("select volume_horaire_h from formations where id = 'F0001'")
    v = cur.fetchone()[0]
    cur.execute("select count(*) from journal where table_nom = 'formations' and ligne_id = 'F0001' and action = 'UPDATE'")
    nj = cur.fetchone()[0]
    cur.execute("select statut from propositions where id = %s", (pid,))
    st = cur.fetchone()[0]
    cur.execute("insert into propositions (formation_id, champ, nouvelle_valeur, source_url) "
                "values ('F0001', 'precisions', 'Clinique le lundi', 'https://exemple.fr') returning id")
    pid2 = cur.fetchone()[0]
    cur.execute("select appliquer_proposition(%s)", (pid2,))
    cur.execute("select precisions from formations where id = 'F0001'")
    pr = cur.fetchone()[0]
conn.rollback()
for nom, ok in [("accepter une proposition modifie la fiche", float(v) == 42.0),
                ("la modification est inscrite au journal", nj >= 1),
                ("la proposition est marquée acceptée", st == "acceptee"),
                ("accepter une proposition de précisions remplit le champ", pr == "Clinique le lundi")]:
    print(("  ok   " if ok else "  ECHEC"), nom)
    if not ok:
        echecs.append(nom)

# Colonnes set_option et inherit_option : PostgreSQL 16 et plus (version de la CI).
print("Compte du tableau de bord (lots de fiches)")
essai("postgres peut prendre le rôle agent_extracteur", None,
      "select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member "
      "where r.rolname = 'agent_extracteur' and u.rolname = 'postgres' and m.set_option", 1)
essai("postgres peut prendre le rôle agent_verificateur", None,
      "select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member "
      "where r.rolname = 'agent_verificateur' and u.rolname = 'postgres' and m.set_option", 1)
essai("postgres ne cumule pas les droits des agents (inherit false)", None,
      "select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member "
      "where r.rolname in ('agent_extracteur', 'agent_verificateur') and u.rolname = 'postgres' and m.inherit_option", 0)
for agent in ("agent_extracteur", "agent_verificateur", "lecteur_sauvegarde"):
    essai(f"{agent} n'est membre d'aucun autre rôle", None,
          "select 1 from pg_auth_members m join pg_roles u on u.oid = m.member where u.rolname = %s", 0, (agent,))
essai("le rôle lecteur_sauvegarde n'est pas donné à postgres", None,
      "select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member "
      "where r.rolname = 'lecteur_sauvegarde' and u.rolname = 'postgres'", 0)

print()
if echecs:
    sys.exit(f"{len(echecs)} test(s) en échec : " + "; ".join(echecs))
print("Tous les tests de sécurité passent.")
