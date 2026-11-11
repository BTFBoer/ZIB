// Weergavetoestand die niet in het dossier hoort (per gebruiker/browser): uitgebreide modus,
// opengeklapte posten, sortering en paginering van de aanvragenlijst, open notitievelden.

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* geen opslag */ } }

export const ui = {
  uitgebreid: lsGet('zib.uitgebreid') === '1',
  open: new Set(),
  aanvragen: {
    // Lijsten lopen van nieuw naar oud: lopende aanvragen op dossiernummer, afgeronde op de datum van de status.
    sort: { kol: 'nr', richting: 'desc' },
    sortAfgerond: { kol: 'datumStatus', richting: 'desc' },
    pagina: 1,
    grootte: Number(lsGet('zib.paginagrootte')) || 50,
    filterOpen: false,
    selectie: new Set(),
    zoekAfgerond: null,
    // Filterrij onder de kolomkoppen (tekst per kolom) en de zichtbare kolommen (null = standaardset).
    kolomFilter: {},
    snel: '',
    kolommen: (() => { try { const v = JSON.parse(lsGet('zib.kolommen') || 'null'); return Array.isArray(v) ? v : null; } catch { return null; } })(),
  },
  // Takenlijst per dossier: filterrij, sortering, opengeklapte dossiers en of afgeronde taken zichtbaar zijn.
  taken: { filter: {}, sort: { kol: 'uiterste', richting: 'asc' }, open: new Set(), afgerond: false },
  // Berekening en rapport: formules tonen, rapportweergave (kort of uitgebreid) en wat de gebruiker heeft
  // in- of uitgeklapt (sleutel → true = ingeklapt; zonder keuze geldt de standaard van het onderdeel).
  formules: lsGet('zib.formules') !== '0',
  rapportModus: lsGet('zib.rapport') === 'uitgebreid' ? 'uitgebreid' : 'kort',
  klap: new Map(),
  // Laatst geopende dossiers (voor snelzoeken).
  recent: (() => { try { const v = JSON.parse(lsGet('zib.recent') || '[]'); return Array.isArray(v) ? v.slice(0, 8) : []; } catch { return []; } })(),
  notitiesOpen: new Set((lsGet('zib.notities.open') || 'algemeen').split(',').filter(Boolean)),
  notitiesVerborgen: lsGet('zib.notities.verborgen') === '1',
  // Jaarkolommen in de invoer: standaard het meest recente jaar links en het oudste jaar rechts.
  // Overzichten (berekening, kengetallen, rekenstappen, rapport) lopen altijd van oud naar nieuw.
  jaarVolgorde: lsGet('zib.jaarvolgorde') === 'oud' ? 'oud' : 'recent',
  organogramWeergave: lsGet('zib.organogram') === 'tekst' ? 'tekst' : 'grafisch',
};

const isJaar = (x) => /^\d{4}$/.test(String(x));

/**
 * Jaren voor de invoer (invoerroosters en invoerpagina's): standaard van nieuw naar oud, dus het meest recente
 * jaar links. Niet-jaren blijven achteraan.
 */
export function ordeJaren(jaren) {
  const lijst = [...jaren];
  const j = lijst.filter(isJaar).map(Number).sort((a, b) => (ui.jaarVolgorde === 'oud' ? a - b : b - a));
  return [...j, ...lijst.filter((x) => !isJaar(x))];
}

/**
 * Jaren voor overzichten (inkomensvaststelling, kengetallen, rekenstappen, samenvatting, rapport): altijd van oud
 * naar nieuw, zoals in een tabel gebruikelijk is. Niet-jaren blijven achteraan.
 */
export function ordeJarenOverzicht(jaren) {
  const lijst = [...jaren];
  return [...lijst.filter(isJaar).map(Number).sort((a, b) => a - b), ...lijst.filter((x) => !isJaar(x))];
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

export function zetKolommen(lijst) {
  ui.aanvragen.kolommen = lijst;
  if (lijst) lsSet('zib.kolommen', JSON.stringify(lijst));
  else { try { localStorage.removeItem('zib.kolommen'); } catch { /* geen opslag */ } }
}

export function zetFormules(aan) {
  ui.formules = !!aan;
  lsSet('zib.formules', aan ? '1' : '0');
}

export function zetRapportModus(m) {
  ui.rapportModus = m === 'uitgebreid' ? 'uitgebreid' : 'kort';
  lsSet('zib.rapport', ui.rapportModus);
}

/** Is een onderdeel ingeklapt? Zonder eigen keuze van de gebruiker geldt de standaard van dat onderdeel. */
export function ingeklapt(sleutel, standaard = false) {
  return ui.klap.has(sleutel) ? ui.klap.get(sleutel) : standaard;
}

export function zetKlap(sleutel, dicht) {
  ui.klap.set(sleutel, !!dicht);
}

/** Onthoudt het laatst geopende dossier bovenaan (maximaal acht). */
export function noteerRecent(id) {
  if (!id || ui.recent[0] === id) return;
  ui.recent = [id, ...ui.recent.filter((x) => x !== id)].slice(0, 8);
  lsSet('zib.recent', JSON.stringify(ui.recent));
}
