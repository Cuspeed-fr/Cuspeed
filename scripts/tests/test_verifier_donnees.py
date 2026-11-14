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


class PresentationOrganisme(unittest.TestCase):
    BASE = {"id": "O001", "presentation_source": "https://exemple.fr", "presentation_verifiee_le": "2026-11-14"}

    def erreurs(self, **champs):
        avant = len(verifier_donnees.erreurs)
        verifier_donnees.verifier_presentation({**self.BASE, **champs})
        nouvelles = verifier_donnees.erreurs[avant:]
        del verifier_donnees.erreurs[avant:]
        return nouvelles

    def test_presentation_complete_acceptee(self):
        self.assertEqual(self.erreurs(presentation="a" * 60, annee_creation=1990, histoire="b" * 80,
                                      equipe=[{"nom": "Dr X", "role": "Fondateur"}, {"nom": "Dr Y"}]), [])

    def test_sans_source_refusee(self):
        self.assertTrue(self.erreurs(presentation="a" * 60, presentation_source=None))

    def test_tenue_par_l_organisme_sans_source_acceptee(self):
        self.assertEqual(self.erreurs(presentation="a" * 60, presentation_source=None, presentation_par="organisme"), [])

    def test_texte_trop_court_ou_trop_long_refuse(self):
        self.assertTrue(self.erreurs(presentation="court"))
        self.assertTrue(self.erreurs(histoire="x" * 2001))

    def test_annee_impossible_refusee(self):
        self.assertTrue(self.erreurs(annee_creation=1500))

    def test_membre_avec_donnee_en_plus_refuse(self):
        self.assertTrue(self.erreurs(equipe=[{"nom": "Dr X", "telephone": "06"}]))

    def test_coordonnees_dans_le_nom_ou_le_role_refusees(self):
        self.assertTrue(self.erreurs(equipe=[{"nom": "Dr X", "role": "contact : x@exemple.fr"}]))
        self.assertTrue(self.erreurs(equipe=[{"nom": "Dr X 06 12 34 56 78"}]))

    def test_role_nul_ou_trop_long_refuse(self):
        self.assertTrue(self.erreurs(equipe=[{"nom": "Dr X", "role": None}]))
        self.assertTrue(self.erreurs(equipe=[{"nom": "Dr X", "role": "r" * 161}]))

    def test_annee_booleenne_et_adresse_trop_longue_refusees(self):
        self.assertTrue(self.erreurs(annee_creation=True))
        self.assertTrue(self.erreurs(adresse="a" * 201))


if __name__ == "__main__":
    unittest.main()
