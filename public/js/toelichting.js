// Gegevens voor de kern van het rapport, zonder DOM (los te testen):
// - de aandachtspunten: wat de rekenkern als niet akkoord, attentie of informatie teruggeeft;
// - de toelichting op de berekening van het toetsinkomen: de rekenstappen van de totaalberekening als drie
//   kolommen (omschrijving, berekening, uitkomst), zoals in de dossiernotities van de rekensoftware.
import { fmt } from './util.js';

const isJaar = (k) => /^\d{4}$/.test(String(k));
const NIVEAU = { niet_akkoord: 0, attentie: 1, info: 2 };

/**
 * Aandachtspunten voor bovenaan het rapport, zwaarste eerst: voorwaarden die niet akkoord zijn of aandacht vragen,
 * de meldingen uit de berekening en de stappen die het inkomen hebben bijgesteld. Alleen wat de rekenkern teruggeeft.
 * @returns {{status: 'niet_akkoord'|'attentie'|'info', tekst: string}[]}
 */
export function kernPunten(d, r) {
  const punten = [];
  const voorwaarden = (naam, checks) => (checks || []).filter((c) => c.status !== 'akkoord')
    .forEach((c) => punten.push({ status: NIVEAU[c.status] === undefined ? 'info' : c.status, tekst: `${naam ? `${naam}: ` : ''}${c.label}. ${c.tekst || ''}`.trim() }));
  if (d.soort === 'NUL') {
    (r.nul?.perOnderneming || []).forEach((o) => voorwaarden(o.naam, o.checks));
    voorwaarden('', r.nul?.zekerheden);
  } else {
    (r.ondernemingen || []).forEach((a) => { if (a.meenemen || r.familie === 'ABN') voorwaarden(a.naam, a.checks); });
  }
  (r.meldingen || []).forEach((m) => punten.push({ status: NIVEAU[m.niveau] === undefined ? 'info' : m.niveau, tekst: m.tekst }));
  (r.inkomen?.stappen || []).forEach((s) => punten.push({ status: 'info', tekst: s }));
  return punten.map((p, i) => ({ p, i })).sort((a, b) => NIVEAU[a.p.status] - NIVEAU[b.p.status] || a.i - b.i).map((x) => x.p);
}

/** Opgemaakte waarde van een cel uit de rekenstappen, als platte tekst. */
export function celTekst(c) {
  if (!c || c.w === null || c.w === undefined) return '';
  switch (c.opmaak) {
    case 'ratio': return fmt.ratio(c.w);
    case 'pct': return fmt.pct(c.w);
    case 'tekst': return String(c.w);
    case 'eur': return fmt.eur(c.w);
    default: return fmt.getal(c.w);
  }
}

/**
 * Rijen voor de toelichting op één sectie van de rekenstappen. Elke rij: { soort, label, formule, uitkomst, stijl, sub }.
 *   'stap'  = één uitkomst met (als die er is) de formule;
 *   'reeks' = bedragen per jaar ("2023: 87.100 · 2024: 93.850"), zonder losse uitkomst;
 *   'groep' = tussenkop, ook boven een rij met meerdere benoemde kolommen (bijvoorbeeld per hoofdbedrijf);
 *   'tekst' = toelichtende regel.
 */
export function toelichtingRijen(sectie) {
  const kol = sectie?.kolommen || [];
  const labels = sectie?.kolomLabels || {};
  const uit = [];
  (sectie?.rijen || []).forEach((r) => {
    if (r.kop) { uit.push({ soort: 'groep', label: r.label, formule: '', uitkomst: '', stijl: '' }); return; }
    if (r.tekst !== undefined) { uit.push({ soort: 'tekst', label: r.label, formule: String(r.tekst), uitkomst: '', stijl: '' }); return; }
    const cellen = kol.filter((k) => r.cellen?.[k]).map((k) => [k, r.cellen[k]]);
    if (!cellen.length) return;
    const stijl = r.stijl || '';
    if (cellen.length === 1) {
      const c = cellen[0][1];
      uit.push({ soort: 'stap', label: r.label, formule: c.f || '', uitkomst: celTekst(c), stijl });
      return;
    }
    if (cellen.every(([k]) => isJaar(k))) {
      const reeks = cellen.map(([k, c]) => `${k}: ${celTekst(c).replace(/^€\s/, '')}${c.f ? ` (${String(c.f).replace(/\s*=\s*$/, '')})` : ''}`).join(' · ');
      uit.push({ soort: 'reeks', label: r.label, formule: reeks, uitkomst: '', stijl });
      return;
    }
    // Meerdere benoemde kolommen (zoals berekend, toets en af te geven): een tussenkop met per kolom een stap.
    uit.push({ soort: 'groep', label: r.label, formule: '', uitkomst: '', stijl });
    cellen.forEach(([k, c]) => uit.push({ soort: 'stap', label: labels[k] || String(k), formule: c.f || '', uitkomst: celTekst(c), stijl, sub: true }));
  });
  return uit;
}
