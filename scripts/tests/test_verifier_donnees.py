"""Tests du contrôle des statuts de pistes (scripts/verifier_donnees.py).

Lancement : python3 -m unittest discover -s scripts/tests -t scripts/tests
"""
import sys
import unittest
from pathlib import Path

# Le script est dans le dossier parent : on l'ajoute au chemin d'import.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import verifier_donnees  # noqa: E402  (import après la modification du chemin)


class StatutsPistes(unittest.TestCase):
    def test_fiche_creee_est_accepte(self):
        # Le statut « Fiche créée » est utilisé par le lot du 6 novembre 2026 : il doit passer le contrôle.
        self.assertIn("Fiche créée", verifier_donnees.STATUTS_PISTES)

    def test_statuts_existants_restent_acceptes(self):
        for statut in ("À vérifier", "Importée", "Doublon", "Écartée"):
            with self.subTest(statut=statut):
                self.assertIn(statut, verifier_donnees.STATUTS_PISTES)

    def test_valeur_inconnue_reste_refusee(self):
        for statut in ("Fiche creee", "publiée", "", "validee"):
            with self.subTest(statut=statut):
                self.assertNotIn(statut, verifier_donnees.STATUTS_PISTES)


if __name__ == "__main__":
    unittest.main()
