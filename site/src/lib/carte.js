// Carte de France maison (SVG), sans fond de carte externe :
// aucune requête vers un serveur tiers, donc aucune adresse IP de visiteur transmise.
//
// Projection équirectangulaire corrigée à la latitude moyenne de la France (46,5°).
// Elle suffit pour placer des villes sur une carte de cette taille.

export const LARGEUR_CARTE = 485;
export const HAUTEUR_CARTE = 470;

const K = Math.cos((46.5 * Math.PI) / 180);
const ECHELLE = 46;

/** Longitude, latitude → coordonnées x, y dans la carte. */
export function projeter(longitude, latitude) {
  return [
    Math.round((longitude + 5.3) * K * ECHELLE * 10) / 10,
    Math.round((51.2 - latitude) * ECHELLE * 10) / 10,
  ];
}

/**
 * Points de la carte : un par regroupement (ex. « Paris / IDF » réunit Paris, Évry…),
 * placé sur le lieu qui porte le nom du regroupement, à défaut sur le premier lieu
 * du regroupement qui a des coordonnées.
 */
export function pointsCarte(lieux) {
  const avecCoordonnees = lieux.filter(
    (l) => l.regroupement_carte && l.latitude != null && l.longitude != null,
  );
  const points = new Map();
  for (const l of avecCoordonnees) {
    const actuel = points.get(l.regroupement_carte);
    const meilleur = l.nom === l.regroupement_carte;
    if (actuel && !(meilleur && !actuel.exact)) continue;
    const [x, y] = projeter(l.longitude, l.latitude);
    points.set(l.regroupement_carte, { nom: l.regroupement_carte, x, y, exact: meilleur });
  }
  return [...points.values()].map(({ nom, x, y }) => ({ nom, x, y }));
}

/**
 * Place le nom de chaque ville à côté de son point (de préférence à droite, sinon au-dessus,
 * à gauche ou au-dessous) en évitant les autres points, les noms déjà placés et les bords de la carte.
 * Les villes qui ont le plus de formations sont placées en premier.
 * Renvoie, pour chaque point, { ...point, etiquette: { x, y, ancre } }.
 */
export function placerEtiquettes(points, rayon) {
  const LETTRE = 6.3; // largeur moyenne d'une lettre à 11 px
  const HAUT = 13;
  const boites = points.map((p) => ({ x1: p.x - rayon(p.n), y1: p.y - rayon(p.n), x2: p.x + rayon(p.n), y2: p.y + rayon(p.n) }));
  const chevauche = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  const dedans = (b) => b.x1 >= 2 && b.y1 >= 2 && b.x2 <= LARGEUR_CARTE - 2 && b.y2 <= HAUTEUR_CARTE - 2;

  const ordre = [...points.keys()].sort((i, j) => points[j].n - points[i].n);
  const resultat = new Array(points.length);
  for (const i of ordre) {
    const p = points[i];
    const r = rayon(p.n);
    const l = p.nom.length * LETTRE;
    const essais = [
      { x: p.x + r + 4, y: p.y, ancre: "start", boite: { x1: p.x + r + 3, y1: p.y - HAUT / 2, x2: p.x + r + 5 + l, y2: p.y + HAUT / 2 } },
      { x: p.x, y: p.y - r - 8, ancre: "middle", boite: { x1: p.x - l / 2, y1: p.y - r - 3 - HAUT, x2: p.x + l / 2, y2: p.y - r - 3 } },
      { x: p.x - r - 4, y: p.y, ancre: "end", boite: { x1: p.x - r - 5 - l, y1: p.y - HAUT / 2, x2: p.x - r - 3, y2: p.y + HAUT / 2 } },
      { x: p.x, y: p.y + r + 9, ancre: "middle", boite: { x1: p.x - l / 2, y1: p.y + r + 3, x2: p.x + l / 2, y2: p.y + r + 3 + HAUT } },
    ];
    const autres = boites.filter((_, j) => j !== i);
    const choix =
      essais.find((e) => dedans(e.boite) && !autres.some((b) => chevauche(e.boite, b))) ??
      essais.find((e) => dedans(e.boite)) ??
      essais[0];
    boites.push(choix.boite);
    resultat[i] = { ...p, etiquette: { x: choix.x, y: choix.y, ancre: choix.ancre } };
  }
  return resultat;
}
