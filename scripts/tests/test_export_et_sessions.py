"""Tests : fiches sans session (verifier_donnees.py) et fichiers périmés de l'export (sauvegarder_vers_yaml.py).

Aucune base de données : le contrôle tourne sur un petit jeu de fichiers temporaire.
Lancement : python3 -m unittest discover -s scripts/tests -t scripts/tests
"""
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import sauvegarder_vers_yaml as export  # noqa: E402
import verifier_donnees  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent.parent


def fiche(identifiant, intitule="Formation test", statut="a-verifier", sessions=()):
    return {
        "id": identifiant, "intitule": intitule, "organisme": "O001", "secteur": "universitaire", "type": "du",
        "disciplines": ["paro"], "format": "presentiel", "duree": None, "volume_horaire_h": None,
        "tarif": {"texte": None, "euros": None, "annee": None}, "prerequis": None, "financement": [],
        "url_officielle": "https://exemple.fr/formation", "sessions": list(sessions), "statut": statut,
        "derniere_verification": "2026-11-05", "notes": None,
    }


SESSION = {"lieu": "L-LILLE", "debut": "2027-01-10", "fin": "2027-01-11", "inscriptions": "ouvertes", "places": None}


def controler(fiches):
    """Écrit les fiches dans un dossier temporaire, lance le contrôle ; renvoie (code de sortie, erreurs, avertissements)."""
    verifier_donnees.erreurs.clear()
    verifier_donnees.avertissements.clear()
    with tempfile.TemporaryDirectory() as tmp:
        data = Path(tmp)
        (data / "formations").mkdir()
        (data / "referentiels.yaml").write_text((RACINE / "data" / "referentiels.yaml").read_text(encoding="utf-8"),
                                                encoding="utf-8")
        (data / "organismes.yaml").write_text(
            yaml.safe_dump([{"id": "O001", "nom": "Test", "type": "universite", "ville": "Lille"}]), encoding="utf-8")
        (data / "lieux.yaml").write_text(
            yaml.safe_dump([{"id": "L-LILLE", "nom": "Lille", "latitude": 50.6, "longitude": 3.1}]), encoding="utf-8")
        (data / "pistes.csv").write_text("id,statut\n", encoding="utf-8")
        for nom, f in fiches:
            (data / "formations" / nom).write_text(yaml.safe_dump(f, allow_unicode=True), encoding="utf-8")
        ancien_data, ancien_argv = verifier_donnees.DATA, sys.argv
        verifier_donnees.DATA, sys.argv = data, ["verifier_donnees.py"]
        code = 0
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                verifier_donnees.main()
        except SystemExit as e:
            code = e.code
        finally:
            verifier_donnees.DATA, sys.argv = ancien_data, ancien_argv
    return code, list(verifier_donnees.erreurs), list(verifier_donnees.avertissements)


def erreurs_session(erreurs):
    return [e for e in erreurs if "session" in e]


class FichesSansSession(unittest.TestCase):
    def test_a_verifier_sans_session_est_un_avertissement(self):
        code, erreurs, avert = controler([("F0001-test.yaml", fiche("F0001", statut="a-verifier"))])
        self.assertEqual(erreurs_session(erreurs), [])
        self.assertEqual(len(avert), 1)

    def test_archivee_sans_session_nest_pas_une_erreur(self):
        _, erreurs, avert = controler([("F0001-test.yaml", fiche("F0001", statut="archivee"))])
        self.assertEqual(erreurs_session(erreurs), [])
        self.assertEqual(len(avert), 1)

    def test_validee_sans_session_reste_une_erreur(self):
        code, erreurs, _ = controler([("F0001-test.yaml", fiche("F0001", statut="validee"))])
        self.assertEqual(len(erreurs_session(erreurs)), 1)
        self.assertEqual(code, 1)

    def test_validee_avec_session_est_correcte(self):
        code, erreurs, avert = controler([("F0001-test.yaml", fiche("F0001", statut="validee", sessions=[SESSION]))])
        self.assertEqual((code, erreurs, avert), (0, [], []))

    def test_identifiant_en_double_toujours_detecte(self):
        _, erreurs, _ = controler([("F0001-a.yaml", fiche("F0001", "A", "validee", [SESSION])),
                                   ("F0001-b.yaml", fiche("F0001", "B", "validee", [SESSION]))])
        self.assertTrue(any("en double" in e for e in erreurs))


class ExportSansFichiersPerimes(unittest.TestCase):
    def test_nom_de_fichier_suit_lintitule(self):
        self.assertEqual(export.nom_fichier_fiche("F0148", "DU Implantologie basale"),
                         "F0148-du-implantologie-basale.yaml")

    def test_ancien_fichier_supprime_quand_lintitule_change(self):
        # Simule la nuit où l'intitulé de F0148 change : l'ancien fichier ne doit pas survivre à l'export.
        with tempfile.TemporaryDirectory() as tmp:
            dossier = Path(tmp) / "formations"
            dossier.mkdir()
            ancien = dossier / export.nom_fichier_fiche("F0148", "DU Implantologie basale (fermé en 2026-27)")
            ancien.write_text("id: F0148\n", encoding="utf-8")
            export.vider_dossier_formations(dossier)
            nouveau = dossier / export.nom_fichier_fiche("F0148", "DU Implantologie basale")
            nouveau.write_text("id: F0148\n", encoding="utf-8")
            self.assertEqual([p.name for p in dossier.iterdir()], [nouveau.name])


if __name__ == "__main__":
    unittest.main()
