// Fonctions pures de la liste de l'accueil (testées dans tests/liste.test.mjs).

/** Nombre de formations retenues par organisme. `elements` : [{ organisme, retenue }]. */
export function compterParOrganisme(elements) {
  const compte = new Map();
  for (const e of elements) {
    if (e.retenue && e.organisme) compte.set(e.organisme, (compte.get(e.organisme) ?? 0) + 1);
  }
  return compte;
}

const accord = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** Texte du compteur au-dessus de la liste, selon le mode de la carte. */
export function texteResultat(mode, nbOrganismes, nbFormations) {
  return mode === "organismes"
    ? `${accord(nbOrganismes, "organisme")} · ${accord(nbFormations, "formation")}`
    : accord(nbFormations, "formation");
}
