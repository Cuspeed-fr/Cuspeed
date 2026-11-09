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


class TypeEtSecteur(unittest.TestCase):
    UNIV = ["du", "diu", "desu", "ces", "auec", "aeu"]

    def test_diplome_universitaire_accepte(self):
        self.assertTrue(verifier_donnees.type_et_secteur_coherents("du", "universitaire", self.UNIV))

    def test_formation_courte_universitaire_acceptee(self):
        for t in ("journee", "cursus", "masterclass"):
            with self.subTest(type=t):
                self.assertTrue(verifier_donnees.type_et_secteur_coherents(t, "universitaire", self.UNIV))

    def test_diplome_dans_le_secteur_prive_refuse(self):
        self.assertFalse(verifier_donnees.type_et_secteur_coherents("du", "prive", self.UNIV))

    def test_formation_privee_de_type_court_acceptee(self):
        self.assertTrue(verifier_donnees.type_et_secteur_coherents("journee", "prive", self.UNIV))

    def test_catalogue_universitaire_refuse(self):
        self.assertFalse(verifier_donnees.type_et_secteur_coherents("catalogue", "universitaire", self.UNIV))


if __name__ == "__main__":
    unittest.main()
