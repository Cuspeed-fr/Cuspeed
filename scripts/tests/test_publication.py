"""Tests de la mise en ligne : tri du dossier envoyé, envoi vers un dépôt Git jetable, garde-fous du workflow.

Aucun secret, aucune base, aucun appel réseau : l'envoi est testé vers un dépôt Git local (un faux GitHub).
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


BRANCHE = "mise-en-ligne"


class TestEnvoiVersUnDepotLocal(unittest.TestCase):
    """Teste scripts/envoyer_site.sh contre un dépôt Git nu qui joue le rôle du dépôt GitHub."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.depot = Path(self.tmp, "depot.git")
        git("init", "-q", "--bare", "-b", "main", str(self.depot))
        # Le dépôt contient déjà main (le code source) : l'envoi ne doit jamais y toucher.
        source = Path(self.tmp, "source")
        git("init", "-q", "-b", "main", str(source))
        ecrire(source, "site/astro.config.mjs", "export default {}")
        git("add", "-A", cwd=source)
        git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "code", cwd=source)
        git("push", "-q", str(self.depot), "main", cwd=source)
        self.main_avant = git("--git-dir", str(self.depot), "rev-parse", "main").strip()
        self.dist = Path(self.tmp, "dist")

    def lancer(self, dist, branche=BRANCHE):
        return subprocess.run(
            ["bash", str(RACINE / "scripts" / "envoyer_site.sh"), str(dist), str(self.depot), branche],
            capture_output=True, text=True,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )

    def fichiers_pousses(self):
        sortie = git("--git-dir", str(self.depot), "ls-tree", "-r", "--name-only", BRANCHE)
        return sorted(sortie.split())

    def tearDown(self):
        # Quoi qu'il arrive, main est intacte.
        self.assertEqual(git("--git-dir", str(self.depot), "rev-parse", "main").strip(), self.main_avant)

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
        self.assertEqual(git("--git-dir", str(self.depot), "rev-list", "--count", BRANCHE).strip(), "2",
                         "l'historique de déploiement est conservé (pas de poussée forcée)")
        # La branche ne contient que le site : rien du code source de main.
        self.assertNotIn("site/astro.config.mjs", fichiers)

    def test_branche_sans_lien_avec_main(self):
        faux_site(self.dist)
        self.assertEqual(self.lancer(self.dist).returncode, 0)
        commun = subprocess.run(["git", "--git-dir", str(self.depot), "merge-base", BRANCHE, "main"],
                                capture_output=True, text=True)
        self.assertNotEqual(commun.returncode, 0, "la branche de mise en ligne ne partage aucun historique avec main")

    def test_branche_issue_de_main_refusee(self):
        # Quelqu'un a créé « mise-en-ligne » à partir de main (avec le code source) : l'envoi doit s'arrêter.
        git("--git-dir", str(self.depot), "branch", BRANCHE, "main")
        faux_site(self.dist)
        resultat = self.lancer(self.dist)
        self.assertNotEqual(resultat.returncode, 0)
        self.assertIn("partage de l'historique avec main", resultat.stderr)
        self.assertEqual(git("--git-dir", str(self.depot), "rev-parse", BRANCHE).strip(), self.main_avant,
                         "la branche n'a pas bougé")

    def test_controle_python_sans_identifiants_git(self):
        texte = (RACINE / "scripts" / "envoyer_site.sh").read_text(encoding="utf-8")
        self.assertIn("env -u GIT_CONFIG_COUNT -u GIT_CONFIG_KEY_0 -u GIT_CONFIG_VALUE_0", texte)

    def test_branches_protegees_refusees(self):
        faux_site(self.dist)
        for interdite in ("main", "master", "sauvegarde", "Main", "refs/heads/main", "mise-en-ligne-2", ""):
            resultat = self.lancer(self.dist, interdite)
            self.assertNotEqual(resultat.returncode, 0, interdite)
            self.assertIn("refusée", resultat.stderr)

    def test_dossier_refuse_rien_n_est_pousse(self):
        faux_site(self.dist)
        ecrire(self.dist, "data/formations/F0001.yaml", "statut: a-verifier")
        resultat = self.lancer(self.dist)
        self.assertNotEqual(resultat.returncode, 0)
        self.assertIn("Envoi refusé", resultat.stderr)
        branches = git("--git-dir", str(self.depot), "branch", "--list", BRANCHE).strip()
        self.assertEqual(branches, "", "la branche de mise en ligne ne doit pas exister après un refus")


class TestWorkflowPublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.texte = PUBLICATION.read_text(encoding="utf-8")
        cls.doc = yaml.safe_load(cls.texte)
        # PyYAML lit la clé « on » comme le booléen True.
        cls.declencheurs = cls.doc.get("on", cls.doc.get(True))
        cls.construction = cls.doc["jobs"]["construction"]
        cls.envoi = cls.doc["jobs"]["mise-en-ligne"]

    def test_yaml_valide_et_jobs_presents(self):
        self.assertEqual(set(self.doc["jobs"]), {"construction", "mise-en-ligne"})

    def test_seulement_lancement_manuel(self):
        self.assertEqual(list(self.declencheurs), ["workflow_dispatch"])

    def test_aucun_declencheur_automatique(self):
        for interdit in ("push", "pull_request", "schedule", "workflow_run", "repository_dispatch", "release", "deployment"):
            self.assertNotIn(interdit, self.declencheurs)

    def test_les_deux_temps_exigent_l_environnement_publication(self):
        # L'envoi a sa propre approbation : une relance du seul envoi ne part pas sans Chris.
        self.assertEqual(self.construction.get("environment"), "publication")
        self.assertEqual(self.envoi.get("environment"), "publication")

    def test_jeton_encode_masque_dans_les_journaux(self):
        commandes = " ".join(str(e.get("run", "")) for e in self.envoi["steps"])
        self.assertIn('echo "::add-mask::$ENCODE"', commandes)
        self.assertLess(commandes.index("::add-mask::"), commandes.index("GIT_CONFIG_VALUE_0"))

    def test_envoi_attend_la_construction_approuvee(self):
        self.assertEqual(self.envoi.get("needs"), "construction")

    def test_tout_limite_a_main(self):
        for job in (self.construction, self.envoi):
            self.assertIn("refs/heads/main", job.get("if", ""))
            checkout = [s for s in job["steps"] if s.get("uses", "").startswith("actions/checkout")]
            self.assertTrue(checkout and checkout[0]["with"]["ref"] == "main")
            self.assertIs(checkout[0]["with"].get("persist-credentials"), False)

    def test_systeme_fige_pour_les_versions_figees(self):
        # ubuntu-latest a changé (26.04) et n'a plus Python 3.12.7 : le système est donc figé.
        for job in (self.construction, self.envoi):
            self.assertEqual(job["runs-on"], "ubuntu-24.04")

    def test_une_publication_a_la_fois(self):
        self.assertEqual(self.doc.get("concurrency"), "publication")

    def test_envoi_seulement_en_production(self):
        self.assertIn("inputs.essai == false", self.envoi.get("if", ""))
        for etape in self.construction["steps"]:
            self.assertNotIn("envoyer_site", str(etape.get("run", "")), etape.get("name"))

    def test_essai_par_defaut(self):
        self.assertTrue(self.declencheurs["workflow_dispatch"]["inputs"]["essai"]["default"])

    def test_droits_d_ecriture_seulement_pour_l_envoi(self):
        self.assertEqual(self.doc["permissions"], {"contents": "read"})
        self.assertEqual(self.construction["permissions"], {"contents": "read"})
        self.assertEqual(self.envoi["permissions"], {"contents": "write"})

    def test_envoi_n_installe_aucun_paquet(self):
        for etape in self.envoi["steps"]:
            commande = str(etape.get("run", "")) + str(etape.get("uses", ""))
            for interdit in ("npm", "pip", "setup-node", "setup-python", "publier.sh"):
                self.assertNotIn(interdit, commande, etape.get("name"))

    def test_envoi_vers_la_seule_branche_mise_en_ligne(self):
        commandes = " ".join(str(e.get("run", "")) for e in self.envoi["steps"])
        self.assertIn("envoyer_site.sh site/dist \"$DEPOT\" mise-en-ligne", commandes)
        self.assertNotIn("--force", commandes)

    def test_jeton_jamais_sur_la_ligne_de_commande(self):
        commandes = " ".join(str(e.get("run", "")) for e in self.envoi["steps"])
        self.assertNotIn("x-access-token:${", commandes.replace("%s", ""))
        self.assertNotIn("@github.com", commandes)

    def test_secrets_connus_seulement(self):
        self.assertEqual(set(re.findall(r"secrets\.([A-Z_]+)", self.texte)), {"CUSPEED_SAUVEGARDE_DB_URL"})
        self.assertEqual(set(re.findall(r"vars\.([A-Z_]+)", self.texte)), set())
        # Le secret de la base ne sert qu'à la construction.
        self.assertNotIn("secrets.", yaml.safe_dump(self.envoi))

    def test_aucune_valeur_de_secret_dans_le_depot(self):
        fichiers = list(WORKFLOWS.glob("*.yml")) + [RACINE / "scripts" / "publier.sh",
                                                     RACINE / "scripts" / "envoyer_site.sh"]
        motifs = [r"postgres(ql)?://[^\s:/$'\"]+:[^\s@$'\"]+@", r"-----BEGIN [A-Z ]*PRIVATE KEY", r"ssh-(rsa|ed25519) [A-Za-z0-9+/]{20,}",
                  r"git\+ssh://\S+@", r"gh[pousr]_[A-Za-z0-9]{20,}"]
        for fichier in fichiers:
            contenu = fichier.read_text(encoding="utf-8")
            for motif in motifs:
                self.assertIsNone(re.search(motif, contenu), f"motif sensible dans {fichier.name}")

    def test_seul_publication_yml_envoie(self):
        for fichier in WORKFLOWS.glob("*.yml"):
            if fichier.name != PUBLICATION.name:
                contenu = fichier.read_text(encoding="utf-8")
                self.assertNotIn("envoyer_site", contenu, fichier.name)
                self.assertNotIn("mise-en-ligne", contenu, fichier.name)


if __name__ == "__main__":
    unittest.main()
