// Moteur de la carte interactive : fonctions pures, sans navigateur ni MapLibre.
//
// Principe : un point par lieu (ville ou site) ; chaque point sait quelles formations
// et quels organismes y interviennent. Les regroupements (clusters) comptent des
// formations et des organismes DISTINCTS (union d'ensembles), jamais la somme des
// points : une formation proposée dans trois villes d'un même groupe compte pour une.

import Supercluster from "supercluster";

/** Une session est « à venir » si elle n'a pas de date de fin dépassée. Sans date : on la garde. */
export function sessionActive(session, aujourdhui) {
  const fin = session.fin ?? session.debut ?? null;
  return !(fin && fin < aujourdhui);
}

/**
 * Construit les points de la carte à partir des données publiques.
 * Un lieu sans coordonnées n'est pas affichable : il est compté à part (sansCoordonnees)
 * pour que la page puisse dire honnêtement « N formations sans lieu précis ».
 * @returns {{ points: Array, sansCoordonnees: Set<string>, sansLieu: Set<string> }}
 */
export function construirePoints(donnees, aujourdhui = new Date().toISOString().slice(0, 10)) {
  const parLieu = new Map();
  const sansCoordonnees = new Set();
  const sansLieu = new Set();

  for (const f of donnees.formations) {
    const lieuxDeLaFiche = new Set();
    for (const s of f.sessions ?? []) {
      if (!s.lieu || !sessionActive(s, aujourdhui)) continue;
      lieuxDeLaFiche.add(s.lieu);
    }
    if (lieuxDeLaFiche.size === 0) {
      sansLieu.add(f.id);
      continue;
    }
    let affichable = false;
    for (const idLieu of lieuxDeLaFiche) {
      const lieu = donnees.lieu(idLieu);
      if (!lieu || typeof lieu.latitude !== "number" || typeof lieu.longitude !== "number") continue;
      affichable = true;
      if (!parLieu.has(idLieu)) {
        parLieu.set(idLieu, { lieu, formations: new Set(), organismes: new Set() });
      }
      const p = parLieu.get(idLieu);
      p.formations.add(f.id);
      p.organismes.add(f.organisme);
    }
    if (!affichable) sansCoordonnees.add(f.id);
  }

  const points = [...parLieu.values()].map(({ lieu, formations, organismes }) => ({
    id: lieu.id,
    nom: lieu.nom,
    latitude: lieu.latitude,
    longitude: lieu.longitude,
    formations: [...formations].sort(),
    organismes: [...organismes].sort(),
  }));
  return { points, sansCoordonnees, sansLieu };
}

/**
 * Index de regroupement. `mode` vaut « formations » ou « organismes » : il ne change que
 * le nombre mis en avant ; les deux comptes distincts sont toujours calculés.
 */
export function creerIndex(points, { rayon = 60, zoomMax = 14 } = {}) {
  const index = new Supercluster({ radius: rayon, maxZoom: zoomMax, minPoints: 2 });
  index.load(
    points.map((p) => ({
      type: "Feature",
      properties: { id: p.id, nom: p.nom, formations: p.formations, organismes: p.organismes },
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
    })),
  );
  return index;
}

/** Union d'ensembles : comptes distincts des formations et organismes d'un ensemble de points. */
export function compter(proprietesDesPoints) {
  const formations = new Set();
  const organismes = new Set();
  for (const p of proprietesDesPoints) {
    for (const id of p.formations) formations.add(id);
    for (const id of p.organismes) organismes.add(id);
  }
  return { formations, organismes };
}

/**
 * Éléments à dessiner pour une emprise et un zoom donnés.
 * Chaque élément : { type: "groupe" | "lieu", longitude, latitude, formations: Set, organismes: Set, ... }
 */
export function elementsVisibles(index, emprise, zoom) {
  const [ouest, sud, est, nord] = emprise;
  const entiers = Math.round(zoom);
  const caracteristiques = index.getClusters([ouest, sud, est, nord], entiers);
  return caracteristiques.map((c) => {
    const [longitude, latitude] = c.geometry.coordinates;
    if (c.properties.cluster) {
      const feuilles = index.getLeaves(c.properties.cluster_id, Infinity).map((l) => l.properties);
      const { formations, organismes } = compter(feuilles);
      return {
        type: "groupe",
        idGroupe: c.properties.cluster_id,
        longitude,
        latitude,
        lieux: feuilles.map((l) => l.id),
        formations,
        organismes,
      };
    }
    const p = c.properties;
    return {
      type: "lieu",
      id: p.id,
      nom: p.nom,
      longitude,
      latitude,
      lieux: [p.id],
      formations: new Set(p.formations),
      organismes: new Set(p.organismes),
    };
  });
}

/** Formations et organismes distincts dont au moins un lieu est dans l'emprise (liste synchronisée). */
export function contenuDansEmprise(points, emprise) {
  const [ouest, sud, est, nord] = emprise;
  const dedans = points.filter(
    (p) => p.longitude >= ouest && p.longitude <= est && p.latitude >= sud && p.latitude <= nord,
  );
  return { ...compter(dedans), lieux: dedans.map((p) => p.id) };
}

/** Zoom auquel un groupe s'éclate, pour le clic sur un groupe. */
export function zoomEclatement(index, idGroupe, zoomMaxCarte = 14) {
  return Math.min(index.getClusterExpansionZoom(idGroupe), zoomMaxCarte);
}

/** Emprise (ouest, sud, est, nord) englobant des points, avec une marge. */
export function empriseDe(points, marge = 0.5) {
  if (!points.length) return null;
  let ouest = Infinity, sud = Infinity, est = -Infinity, nord = -Infinity;
  for (const p of points) {
    ouest = Math.min(ouest, p.longitude);
    est = Math.max(est, p.longitude);
    sud = Math.min(sud, p.latitude);
    nord = Math.max(nord, p.latitude);
  }
  return [ouest - marge, sud - marge, est + marge, nord + marge];
}
