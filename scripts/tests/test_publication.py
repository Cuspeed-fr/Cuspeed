"""Tests de la mise en ligne : tri du dossier envoyé, envoi vers un dépôt Git jetable, garde-fous du workflow.

Aucun secret, aucune base, aucun appel réseau : l'envoi est testé vers un dépôt Git local (un faux Clever Cloud).
Lancement : python3 -m unittest discover -s scripts/tests -t scripts/tests
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import preparer_envoi  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent.parent
WORKFLOWS = RACINE / ".github" / "workflows"
PUBLICATION = WORKFLOWS / "publication.yml"


def ecrire(dossier, relatif, contenu="x"):
    chemin = Path(dossier) / relatif
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(contenu, encoding="utf-8")


def faux_site(dossier):
    """Un site construit minimal et réaliste (pages, styles, images, robots, sitemap)."""
    ecrire(dossier, "index.html", "<html>accueil</html>")
    ecrire(dossier, "a-propos/index.html", "<html>à propos</html>")
    ecrire(dossier, "_astro/site.abc123.css", "body{}")
    ecrire(dossier, "robots.txt", "User-agent: *")
    ecrire(dossier, "sitemap-index.xml", "<xml/>")
    ecrire(dossier, "fonts/dm-sans.woff2", "police")
    ecrire(dossier, "404.html", "<html>absent</html>")
    return dossier


class TestPreparerEnvoi(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.dist = Path(self.tmp, "dist")
        self.destination = Path(self.tmp, "envoi")

    def test_seul_le_site_construit_est_copie(self):
        faux_site(self.dist)
        copies, erreurs = preparer_envoi.preparer(self.dist, self.destination)
        self.assertEqual(erreurs, [])
        fichiers = sorted(str(p.relative_to(self.destination)) for p in self.destination.rglob("*") if p.is_file())
        self.assertEqual(fichiers, sorted(copies))
        self.assertIn("index.html", fichiers)
        self.assertIn("robots.txt", fichiers)

    def test_fiches_et_notes_internes_refusees(self):
        faux_site(self.dist)
        # Jeu factice : une fiche non validée exportée par erreur, des notes internes, des fichiers du dépôt.
        ecrire(self.dist, "data/formations/F0001.yaml", "statut: a-verifier")
        ecrire(self.dist, "formations/F0002.yaml", "statut: a-verifier")
        ecrire(self.dist, "notes-internes.html", "piste confidentielle")
        ecrire(self.dist, "formations/F0003-note.txt", "note de relecture")
        ecrire(self.dist, ".env", "SECRET=1")
        ecrire(self.dist, ".git/config", "[core]")
        ecrire(self.dist, "scripts/publier.sh", "echo")
        ecrire(self.dist, "package.json", "{}")  # json permis, mais pas de dossier de travail : doit passer
        copies, erreurs = preparer_envoi.preparer(self.dist, self.destination)
        texte = "\n".join(erreurs)
        self.assertIn("F0001.yaml", texte)
        self.assertIn("F0002.yaml", texte)
        self.assertIn("notes-internes.html", texte)
        self.assertIn("F0003-note.txt", texte)
        self.assertIn(".env", texte)
        self.assertIn("scripts", texte)
        self.assertEqual(copies, [])
        self.assertFalse(self.destination.exists(), "rien ne doit être copié en cas de refus")

    def test_mot_note_dans_un_mot_courant_accepte(self):
        # « notes » seul comme segment est refusé, mais un mot comme « notariat » ne doit pas l'être.
        faux_site(self.dist)
        ecrire(self.dist, "notariat/index.html", "<html/>")
        _, erreurs = preparer_envoi.preparer(self.dist, self.destination)
        self.assertEqual(erreurs, [])

    def test_lien_symbolique_refuse(self):
        faux_site(self.dist)
        cible = Path(self.tmp, "base-locale.yaml")
        cible.write_text("secret", encoding="utf-8")
        os.symlink(cible, self.dist / "lien.html")
        _, erreurs = preparer_envoi.preparer(self.dist, self.destination)
        self.assertTrue(any("lien symbolique" in e for e in erreurs))

    def test_sans_page_d_accueil_refuse(self):
        ecrire(self.dist, "a-propos/index.html", "<html/>")
        _, erreurs = preparer_envoi.preparer(self.dist, self.destination)
        self.assertTrue(erreurs)
        self.assertFalse(self.destination.exists())


def git(*args, cwd=None):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


class TestEnvoiVersUnDepotLocal(unittest.TestCase):
    """Teste scripts/envoyer_site.sh contre un dépôt Git nu qui joue le rôle de Clever Cloud."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.clever = Path(self.tmp, "clever.git")
        git("init", "-q", "--bare", str(self.clever))
        self.dist = Path(self.tmp, "dist")

    def lancer(self, dist):
        return subprocess.run(
            ["bash", str(RACINE / "scripts" / "envoyer_site.sh"), str(dist), str(self.clever)],
            capture_output=True, text=True,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )

    def fichiers_pousses(self):
        sortie = git("--git-dir", str(self.clever), "ls-tree", "-r", "--name-only", "master")
        return sorted(sortie.split())

    def test_premier_envoi_puis_remplacement(self):
        faux_site(self.dist)
        premier = self.lancer(self.dist)
        self.assertEqual(premier.returncode, 0, premier.stderr)
        self.assertIn("index.html", self.fichiers_pousses())
        self.assertIn("a-propos/index.html", self.fichiers_pousses())

        # Deuxième envoi : une page disparaît du site, elle doit disparaître du dépôt de déploiement.
        shutil.rmtree(self.dist / "a-propos")
        ecrire(self.dist, "nouveautes/index.html", "<html/>")
        second = self.lancer(self.dist)
        self.assertEqual(second.returncode, 0, second.stderr)
        fichiers = self.fichiers_pousses()
        self.assertNotIn("a-propos/index.html", fichiers)
        self.assertIn("nouveautes/index.html", fichiers)
        self.assertEqual(git("--git-dir", str(self.clever), "rev-list", "--count", "master").strip(), "2",
                         "l'historique de déploiement est conservé (pas de poussée forcée)")

    def test_dossier_refuse_rien_n_est_pousse(self):
        faux_site(self.dist)
        ecrire(self.dist, "data/formations/F0001.yaml", "statut: a-verifier")
        resultat = self.lancer(self.dist)
        self.assertNotEqual(resultat.returncode, 0)
        self.assertIn("Envoi refusé", resultat.stderr)
        branches = git("--git-dir", str(self.clever), "branch", "--list").strip()
        self.assertEqual(branches, "", "aucune branche ne doit exister après un refus")


class TestWorkflowPublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.texte = PUBLICATION.read_text(encoding="utf-8")
        cls.doc = yaml.safe_load(cls.texte)
        # PyYAML lit la clé « on » comme le booléen True.
        cls.declencheurs = cls.doc.get("on", cls.doc.get(True))
        cls.job = cls.doc["jobs"]["publication"]

    def test_yaml_valide_et_job_present(self):
        self.assertIsInstance(self.doc, dict)
        self.assertEqual(set(self.doc["jobs"]), {"publication"})

    def test_seulement_lancement_manuel(self):
        self.assertEqual(list(self.declencheurs), ["workflow_dispatch"])

    def test_aucun_declencheur_automatique_ni_webhook(self):
        for interdit in ("push", "pull_request", "schedule", "workflow_run", "repository_dispatch", "release", "deployment"):
            self.assertNotIn(interdit, self.declencheurs)
        self.assertNotIn("webhook", self.texte.lower())

    def test_job_exige_l_environnement_publication(self):
        self.assertEqual(self.job.get("environment"), "publication")

    def test_job_limite_a_main(self):
        self.assertIn("refs/heads/main", self.job.get("if", ""))
        pas_main = [s for s in self.job["steps"] if s.get("uses", "").startswith("actions/checkout")]
        self.assertTrue(pas_main and pas_main[0]["with"]["ref"] == "main")

    def test_une_publication_a_la_fois(self):
        self.assertEqual(self.job.get("concurrency"), "publication")

    def test_envoi_seulement_en_production(self):
        etapes_envoi = [s for s in self.job["steps"]
                        if "envoyer_site.sh" in str(s.get("run", "")) or "CLEVER" in str(s.get("env", ""))]
        self.assertTrue(etapes_envoi)
        for etape in etapes_envoi:
            self.assertEqual(etape.get("if"), "inputs.essai == false", etape.get("name"))

    def test_essai_par_defaut_et_pas_de_deploiement_sur_essai(self):
        entree = self.declencheurs["workflow_dispatch"]["inputs"]["essai"]
        self.assertTrue(entree["default"])

    def test_secrets_et_variables_connus_seulement(self):
        secrets_utilises = set(re.findall(r"secrets\.([A-Z_]+)", self.texte))
        variables_utilisees = set(re.findall(r"vars\.([A-Z_]+)", self.texte))
        self.assertEqual(secrets_utilises, {"CUSPEED_SAUVEGARDE_DB_URL", "CLEVER_SSH_PRIVATE_KEY"})
        self.assertEqual(variables_utilisees, {"CLEVER_GIT_URL", "CLEVER_SSH_KNOWN_HOSTS"})

    def test_aucune_valeur_de_secret_dans_le_depot(self):
        fichiers = list(WORKFLOWS.glob("*.yml")) + [RACINE / "scripts" / "publier.sh",
                                                     RACINE / "scripts" / "envoyer_site.sh"]
        motifs = [r"postgres(ql)?://[^\s:/$'\"]+:[^\s@$'\"]+@", r"-----BEGIN [A-Z ]*PRIVATE KEY", r"ssh-(rsa|ed25519) [A-Za-z0-9+/]{20,}",
                  r"git\+ssh://\S+@"]
        for fichier in fichiers:
            contenu = fichier.read_text(encoding="utf-8")
            for motif in motifs:
                self.assertIsNone(re.search(motif, contenu), f"motif sensible dans {fichier.name}")

    def test_seul_publication_yml_envoie_chez_clever(self):
        for fichier in WORKFLOWS.glob("*.yml"):
            if fichier.name != PUBLICATION.name:
                self.assertNotIn("CLEVER", fichier.read_text(encoding="utf-8"), fichier.name)
                self.assertNotIn("envoyer_site", fichier.read_text(encoding="utf-8"), fichier.name)


if __name__ == "__main__":
    unittest.main()
