// Weergavetoestand die niet in het dossier hoort (per gebruiker/browser): uitgebreide modus,
// opengeklapte posten, sortering en paginering van de aanvragenlijst, open notitievelden.

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* geen opslag */ } }

export const ui = {
  uitgebreid: lsGet('zib.uitgebreid') === '1',
  open: new Set(),
  aanvragen: {
    sort: { kol: 'datumStatus', richting: 'desc' },
    pagina: 1,
    grootte: Number(lsGet('zib.paginagrootte')) || 50,
    filterOpen: false,
    selectie: new Set(),
    zoekAfgerond: null,
  },
  notitiesOpen: new Set((lsGet('zib.notities.open') || 'algemeen').split(',').filter(Boolean)),
  notitiesVerborgen: lsGet('zib.notities.verborgen') === '1',
  // Jaarkolommen: standaard het meest recente jaar links en het oudste jaar rechts.
  jaarVolgorde: lsGet('zib.jaarvolgorde') === 'oud' ? 'oud' : 'recent',
  organogramWeergave: lsGet('zib.organogram') === 'tekst' ? 'tekst' : 'grafisch',
};

/** Jaren in de gekozen kolomvolgorde (standaard recent links, oud rechts). Niet-jaren blijven achteraan. */
export function ordeJaren(jaren) {
  const lijst = [...jaren];
  const isJaar = (x) => /^\d{4}$/.test(String(x));
  const j = lijst.filter(isJaar).map(Number).sort((a, b) => (ui.jaarVolgorde === 'oud' ? a - b : b - a));
  return [...j, ...lijst.filter((x) => !isJaar(x))];
}

export function zetJaarVolgorde(v) {
  ui.jaarVolgorde = v === 'oud' ? 'oud' : 'recent';
  lsSet('zib.jaarvolgorde', ui.jaarVolgorde);
}

export function zetOrganogramWeergave(v) {
  ui.organogramWeergave = v === 'tekst' ? 'tekst' : 'grafisch';
  lsSet('zib.organogram', ui.organogramWeergave);
}

export function zetUitgebreid(aan) {
  ui.uitgebreid = !!aan;
  lsSet('zib.uitgebreid', aan ? '1' : '0');
}

export function zetPaginagrootte(n) {
  ui.aanvragen.grootte = n;
  ui.aanvragen.pagina = 1;
  lsSet('zib.paginagrootte', String(n));
}

export function toggleNotitie(k) {
  if (ui.notitiesOpen.has(k)) ui.notitiesOpen.delete(k);
  else ui.notitiesOpen.add(k);
  lsSet('zib.notities.open', [...ui.notitiesOpen].join(','));
}

export function zetNotitiesVerborgen(v) {
  ui.notitiesVerborgen = !!v;
  lsSet('zib.notities.verborgen', v ? '1' : '0');
}
