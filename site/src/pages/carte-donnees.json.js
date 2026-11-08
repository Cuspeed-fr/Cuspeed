// Données publiques de la carte : un point par lieu, avec les identifiants des formations et
// des organismes qui y interviennent. Rien d'autre (ni note, ni fiche non validée).
import { chargerDonnees } from "../lib/donnees.js";
import { construirePoints } from "../lib/carte-moteur.js";

export function GET() {
  const donnees = chargerDonnees();
  const { points, sansCoordonnees, sansLieu } = construirePoints(donnees);
  const organismes = Object.fromEntries(
    donnees.organismes.map((o) => [o.id, { nom: o.nom, slug: o.slug }]),
  );
  const formations = Object.fromEntries(
    donnees.formations.map((f) => [f.id, { intitule: f.intitule, slug: f.slug, organisme: f.organisme }]),
  );
  const corps = {
    points,
    organismes,
    formations,
    sansCoordonnees: [...sansCoordonnees],
    sansLieu: [...sansLieu],
  };
  return new Response(JSON.stringify(corps), { headers: { "Content-Type": "application/json" } });
}
