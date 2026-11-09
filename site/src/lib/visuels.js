// Visuels des fiches : un dessin propre à Cuspeed par discipline (décision de Chris, 9 novembre 2026).
// Aucune photo ni image d'un site tiers : ces dessins sont libres de droits, légers et lisibles
// en mode clair comme en mode sombre. Chaque pictogramme est dessiné au trait dans un carré de 48.
// La teinte du fond (« ton ») est l'une des quatre teintes de la charte, définies dans global.css.

// Dent (molaire) réutilisée par plusieurs pictogrammes.
export const DENT =
  '<path d="M16 9c-4.2 0-7 3-7 7.4 0 3.4 1.2 6.2 2.4 9.2 1 2.6 1.5 6 2.1 9.6.6 3.4 1.5 5 2.9 5s2.2-1.8 2.8-5.2c.5-3 1.4-4.8 2.8-4.8s2.3 1.8 2.8 4.8c.6 3.4 1.4 5.2 2.8 5.2s2.3-1.6 2.9-5c.6-3.6 1.1-7 2.1-9.6 1.2-3 2.4-5.8 2.4-9.2C39 12 36.2 9 32 9c-2.8 0-4.6 1.6-8 1.6S18.8 9 16 9Z"/>';
const petiteDent = (x, y, echelle) => `<g transform="translate(${x} ${y}) scale(${echelle})">${DENT}</g>`;

export const VISUELS = {
  paro: { ton: "lime", dessin: `${DENT}<path d="M4 29c4-3.2 8-3.2 12 0s8 3.2 12 0 8-3.2 12 0 4 1.6 4 1.6"/>` },
  implanto: {
    ton: "bleu",
    dessin:
      '<path d="M15 6h18c2 0 3 1.5 3 3.5 0 4-2 7.5-5 7.5H17c-3 0-5-3.5-5-7.5C12 7.5 13 6 15 6Z"/><path d="M20 17h8v5h-8z"/><path d="M18.5 22h11l-1.2 16L24 43l-4.3-5z"/><path d="M18 27h12M18.4 31.5h11.2M18.8 36h10.4"/>',
  },
  ortho: {
    ton: "bleu",
    dessin:
      '<rect x="4" y="15" width="11" height="18" rx="4"/><rect x="18.5" y="13" width="11" height="22" rx="4"/><rect x="33" y="15" width="11" height="18" rx="4"/><rect x="7" y="21.5" width="5" height="5" rx="1"/><rect x="21.5" y="21.5" width="5" height="5" rx="1"/><rect x="36" y="21.5" width="5" height="5" rx="1"/><path d="M2 24h44"/>',
  },
  proth: {
    ton: "marine",
    dessin:
      '<path d="M5 18c0-4 2-6 5.5-6S16 14 16 18v12c0 3-2 5-5.5 5S5 33 5 30z"/><path d="M18.5 16c0-4 2-6 5.5-6s5.5 2 5.5 6v14c0 3-2 5-5.5 5s-5.5-2-5.5-5z"/><path d="M32 18c0-4 2-6 5.5-6s5.5 2 5.5 6v12c0 3-2 5-5.5 5S32 33 32 30z"/><path d="M5 40h38"/>',
  },
  resto: { ton: "lime", dessin: `${petiteDent(-2, 4, 0.85)}<path d="M39 5v8M35 9h8M40 20v4M38 22h4"/>` },
  endo: { ton: "bleu", dessin: `${DENT}<path d="M19.5 21c2.5-2.6 6.5-2.6 9 0"/><path d="M19.5 21l-1.3 14M28.5 21l1.3 14"/>` },
  chir: {
    ton: "marine",
    dessin: '<path d="M25 23 39 8c2.4 4.6 1.4 9.6-2.6 13.6L29 27z"/><path d="M25 23 8.6 39.4a2.8 2.8 0 0 0 4 4L29 27"/>',
  },
  pedo: {
    ton: "lime",
    dessin: `${petiteDent(2, 12, 0.72)}<path d="m37 6 1.9 3.8 4.2.6-3 3 .7 4.2-3.8-2-3.8 2 .7-4.2-3-3 4.2-.6z"/>`,
  },
  occlu: {
    ton: "marine",
    dessin:
      '<path d="M6 21c5-7 31-7 36 0"/><path d="M6 27c5 7 31 7 36 0"/><path d="M13 16.5V21M19 14.6V21M24 14V21M29 14.6V21M35 16.5V21M13 27v4.5M19 27v6.4M24 27v7M29 27v6.4M35 27v4.5"/>',
  },
  sommeil: { ton: "marine", dessin: '<path d="M30 8a15 15 0 1 0 11 24A13 13 0 0 1 30 8Z"/><path d="M8 8h7l-7 8h7"/>' },
  mbd: { ton: "marine", dessin: '<circle cx="20" cy="20" r="12"/><path d="m29 29 12 12M20 14v12M14 20h12"/>' },
  sedation: {
    ton: "marine",
    dessin:
      '<g transform="translate(24 24) scale(1.7) translate(-23 -24)" stroke-width="1.2"><path d="M24 24c0-1.6 2.4-1.6 2.4 0 0 3.4-7 3.4-7 0 0-5.6 11.6-5.6 11.6 0 0 7.8-16.2 7.8-16.2 0 0-10 20.8-10 20.8 0"/></g>',
  },
  laser: { ton: "lime", dessin: '<path d="M6 42 18 30"/><path d="m15 27 6 6"/><path d="M24 24 40 9M26 27l17-3M21 22 25 5"/>' },
  num: { ton: "bleu", dessin: `<rect x="5" y="7" width="38" height="27" rx="3"/><path d="M17 42h14M24 34v8"/>${petiteDent(14.4, 10.6, 0.4)}` },
  geria: { ton: "lime", dessin: '<path d="M24 41S7 31 7 19.5a8.5 8.5 0 0 1 17-3 8.5 8.5 0 0 1 17 3C41 31 24 41 24 41Z"/>' },
  legal: {
    ton: "marine",
    dessin:
      '<path d="M24 7v33M15 41h18M9 13h30"/><path d="m9 13-5 12h10zM39 13l-5 12h10z"/><path d="M4 25a5 4 0 0 0 10 0M34 25a5 4 0 0 0 10 0"/>',
  },
  bio: {
    ton: "lime",
    dessin:
      '<circle cx="13" cy="15" r="4"/><circle cx="34" cy="12" r="4"/><circle cx="24" cy="32" r="4"/><circle cx="40" cy="36" r="4"/><path d="m16.5 17 5.5 11.4M30 13.3l-13 1M27 29.5l5-13.7M28 33.4l8 2"/>',
  },
  omni: { ton: "bleu", dessin: `${petiteDent(0, 2, 0.8)}<path d="m30 34 4 4 9-10"/>` },
  sp: { ton: "lime", dessin: '<path d="m24 6 14 5v11c0 9-6 16-14 20-8-4-14-11-14-20V11z"/><path d="M24 16v12M18 22h12"/>' },
  gestion: { ton: "bleu", dessin: '<path d="M6 42h37M11 39V28M20 39V19M29 39V24M38 39V11"/>' },
};

/** Visuel d'une formation : celui de sa première discipline, sinon une dent. */
export function visuelDe(disciplines = []) {
  for (const d of disciplines) if (VISUELS[d]) return { code: d, ...VISUELS[d] };
  return { code: "dent", ton: "bleu", dessin: DENT };
}
