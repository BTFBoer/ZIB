// Rekenwijzen (weging van de drie toetsjaren) en welke rekenwijzen een geldverstrekker aanbiedt.
// Dit bestand importeert bewust niets uit de rekenkern, zodat kaders en beleidsprofielen het kunnen gebruiken.

export const REKENWIJZEN = {
  111: { id: '111', label: '1-1-1', gewichten: [1, 1, 1], omschrijving: 'Gemiddelde van drie jaar' },
  123: { id: '123', label: '1-2-3', gewichten: [1, 2, 3], omschrijving: 'Gewogen: oudste 1×, middelste 2×, laatste 3×' },
  134: { id: '134', label: '1-3-4', gewichten: [1, 3, 4], omschrijving: 'Gewogen: oudste 1×, middelste 3×, laatste 4×' },
};
export const REKENWIJZE_IDS = ['111', '123', '134'];

/**
 * Aangeboden rekenwijzen per toetskader (volgens het beleid in ZIB) met de standaard. Geldverstrekkers die het
 * inkomen op NHG baseren of drie jaar gelijk wegen, bieden alleen 1-1-1. Knab weegt volgens de acceptatiegids 2026
 * 1-3-4 (het concept van 2024: 1-2-3); NIBC en bunq staan 1-2-3 toe als alternatief; Venn en Optimaal wegen 1-2-3.
 */
const AANBOD = {
  KNAB: { standaard: '134', aangeboden: ['123', '134'], toelichting: 'Knab: 1-3-4 volgens de acceptatiegids 2026, 1-2-3 volgens het concept van 2024. Starters volgen 1-1-1.' },
  NIBC: { standaard: '111', aangeboden: ['111', '123'], toelichting: 'NIBC: NHG-basis, of na 36 maanden met drie jaarrekeningen 1-2-3 als enige afwijking (maximaal 120% van NHG).' },
  BUNQ: { standaard: '111', aangeboden: ['111', '123'], toelichting: 'bunq: de acceptatiegids staat de 1-2-3-methode toe.' },
  VENN: { standaard: '123', aangeboden: ['123'], toelichting: 'Venn: gewogen gemiddelde 1-2-3, maximaal het laatste jaar.' },
  OPT: { standaard: '123', aangeboden: ['123'], toelichting: 'Optimaal: 1-2-3, maximaal 10% boven het gewone gemiddelde.' },
};
const STANDAARD = { standaard: '111', aangeboden: ['111'], toelichting: 'Deze geldverstrekker weegt de drie jaren gelijk (1-1-1), maximaal het laatste jaar.' };

export function rekenwijzenVoor(kaderId) {
  return AANBOD[kaderId] || STANDAARD;
}

function wegingId(gewichten) {
  const sleutel = (gewichten || []).map((x) => Number(x)).join('');
  return REKENWIJZE_IDS.find((id) => REKENWIJZEN[id].gewichten.join('') === sleutel) || null;
}

/**
 * De rekenwijze die voor dit kader wordt toegepast: de expliciete keuze bij de rekenkeuzes als het kader die
 * aanbiedt, anders de bestaande instelling van het kader of beleidsprofiel, anders de standaard.
 * @param {object} kader  het kader zoals kaderVoor het teruggeeft (voor de ingestelde weging)
 */
export function effectieveRekenwijze(kaderId, instellingen = {}, beleidsinvoer = {}, kader = null) {
  const { standaard, aangeboden } = rekenwijzenVoor(kaderId);
  const keuze = instellingen?.rekenwijze;
  if (keuze && aangeboden.includes(String(keuze))) return String(keuze);
  if (kaderId === 'NIBC') return beleidsinvoer?.NIBC?.nibcMethode === 'gewogen' ? '123' : '111';
  if (kaderId === 'BUNQ') return beleidsinvoer?.BUNQ?.gewogen === true ? '123' : '111';
  if (kader?.methode123?.gewichten) return wegingId(kader.methode123.gewichten) || 'eigen';
  return standaard;
}

/** Past de gekozen rekenwijze toe op de invoer van een beleidsprofiel (alleen waar het profiel een keuze kent). */
export function beleidsinvoerMetRekenwijze(kaderId, invoer, instellingen = {}) {
  const keuze = instellingen?.rekenwijze;
  if (!keuze || !rekenwijzenVoor(kaderId).aangeboden.includes(String(keuze))) return invoer;
  if (kaderId === 'NIBC') {
    // NIBC kent één afwijking: kiest de gebruiker 1-2-3, dan vervangt die een andere afwijkende route.
    if (keuze === '123') return { ...invoer, nibcMethode: 'gewogen' };
    return invoer.nibcMethode === 'gewogen' ? { ...invoer, nibcMethode: 'standaard' } : invoer;
  }
  if (kaderId === 'BUNQ') return { ...invoer, gewogen: keuze === '123' };
  return invoer;
}

/** Weging voor kaders met een eigen gewogen methode (Knab, Optimaal), of null als de keuze niet van toepassing is. */
export function gewichtenVoorKeuze(kaderId, instellingen = {}) {
  const keuze = instellingen?.rekenwijze;
  if (!keuze || !rekenwijzenVoor(kaderId).aangeboden.includes(String(keuze))) return null;
  return REKENWIJZEN[keuze]?.gewichten || null;
}
