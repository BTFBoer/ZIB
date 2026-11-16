import { fmt } from '../util.js';

/** Bedrag met centen alleen als het bedrag die heeft (bijv. de ABN AMRO-groepsberekening). */
export const geldExact = (v) => Number.isFinite(v) ? fmt.eur(v, Number.isInteger(v) ? 0 : 2) : '';

/**
 * De uitkomst die ZIB voor het gekozen toetskader toont. Zodra er cijfers zijn staat er een bedrag; de aard van
 * het bedrag (berekend, indicatie, bewijsstuk, gekozen bankmethode) staat in `label`. Wat nog ontbreekt of moet
 * worden onderbouwd staat bij Fiattering, niet in plaats van het bedrag.
 * @returns {{ bedrag: number|null, tekst: string, label: string, soort: string }}
 */
export function hoofduitkomst(r, { invoerOpen = false } = {}) {
  if (!r || r.inkomensanalyse) return { bedrag: null, tekst: '', label: '', soort: 'analyse' };
  if (r.soort === 'NUL') return { bedrag: 0, tekst: '€ 0', label: '0-verklaring', soort: 'nul' };
  const leeg = { bedrag: null, tekst: 'Geen cijfers', label: 'Vul de jaarcijfers in om te berekenen', soort: 'leeg' };
  if (r.beleid) {
    if (r.beleid.bewijs && Number.isFinite(r.beleid.bedrag)) {
      return { bedrag: r.beleid.bedrag, tekst: geldExact(r.beleid.bedrag), label: 'Op basis van bewijsstuk', soort: 'bewijs' };
    }
    const indicatie = Number.isFinite(r.beleid.bedrag) ? r.beleid.bedrag : r.beleid.indicatie;
    if (!Number.isFinite(indicatie)) return leeg;
    const label = r.beleid.methode === 'extern' ? 'Indicatie · inkomensverklaring vereist'
      : invoerOpen ? 'Indicatie · invoer aanvullen' : 'Indicatie volgens beleid';
    return { bedrag: indicatie, tekst: geldExact(indicatie), label, soort: 'indicatie' };
  }
  if (r.bron === 'afwijkend') return { bedrag: r.vastgesteld, tekst: geldExact(r.vastgesteld), label: 'Afwijkend inkomen', soort: 'afwijkend' };
  if (r.bron === 'geen') {
    return { bedrag: 0, tekst: 'Geen inkomen',
      label: Number.isFinite(r.toetsinkomen) ? `Berekend ${geldExact(r.toetsinkomen)} · voorwaarden niet akkoord` : 'Voorwaarden niet akkoord', soort: 'geen' };
  }
  const bedrag = Number.isFinite(r.vastgesteld) ? r.vastgesteld : r.toetsinkomen;
  if (!Number.isFinite(bedrag)) return leeg;
  const model = r.inkomen?.abnVaststelling;
  if (model && Number.isFinite(model.bedrag) && bedrag === model.bedrag) {
    return { bedrag, tekst: geldExact(bedrag), label: `ABN AMRO · ${model.methode === 'verticaal' ? 'verticaal' : 'horizontaal'} vastgesteld`, soort: 'abn-model' };
  }
  return { bedrag, tekst: geldExact(bedrag), label: invoerOpen ? 'Indicatie · invoer aanvullen' : 'Berekend toetsinkomen', soort: invoerOpen ? 'indicatie' : 'berekend' };
}
