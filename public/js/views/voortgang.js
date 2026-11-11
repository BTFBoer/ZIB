// Voortgang per tabblad van een dossier: wat is compleet, wat vraagt aandacht en wat is nog leeg.
// Zonder DOM, zodat het los te testen is. De uitkomst is een hulpmiddel, geen oordeel: de voorwaarden
// zelf staan bij de berekening.
import { isIngevuld } from '../util.js';
import { docAanwezig } from '../schema/documenten.js';

const OK = 'ok';
const AANDACHT = 'aandacht';
const FOUT = 'fout';
const OPEN = 'open';

function jarenTekst(lijst) {
  return [...new Set(lijst)].sort().join(', ');
}

/**
 * @returns {Object<string, {status: 'ok'|'aandacht'|'fout'|'open', tekst: string}>} per tabblad
 */
export function voortgang(d, r, docs = []) {
  const uit = {};
  const a = d.aanvrager || {};
  const onds = d.ondernemingen || [];
  const isNul = d.soort === 'NUL';

  // Klantgegevens
  const mist = [];
  if (!a.achternaam) mist.push('achternaam');
  if (!a.geboortedatum) mist.push('geboortedatum');
  if (!onds.length) mist.push('een onderneming');
  onds.forEach((o) => { if (!o.startdatum) mist.push(`startdatum ${o.naam || 'onderneming'}`); });
  uit.klant = mist.length ? { status: AANDACHT, tekst: `Nog invullen: ${mist.join(', ')}` } : { status: OK, tekst: 'Klantgegevens compleet' };

  // Balans en V&W per meegenomen onderneming en toetsjaar
  const analyses = (r.ondernemingen || []).filter((x) => x.meenemen !== false || r.familie === 'ABN' || isNul);
  const tellen = (vlag) => {
    let aanwezig = 0;
    const ontbreekt = [];
    analyses.forEach((an) => (r.T || []).forEach((y) => {
      const j = an.jaren?.[y];
      if (!j || j.actief === false) return; // onderneming bestond dat jaar nog niet
      if (j[vlag]) aanwezig += 1; else ontbreekt.push(`${an.naam} ${y}`);
    }));
    return { aanwezig, ontbreekt };
  };
  const bal = tellen('heeftBalans');
  const sluitNiet = analyses.flatMap((an) => (an.checks || []).filter((c) => /^balans\d{4}$/.test(c.key)).map((c) => `${an.naam} ${c.key.slice(6)}`));
  if (sluitNiet.length) uit.balans = { status: FOUT, tekst: `Activa en passiva sluiten niet: ${sluitNiet.join(', ')}` };
  else if (!bal.aanwezig) uit.balans = { status: OPEN, tekst: 'Nog geen balans ingevoerd' };
  else if (bal.ontbreekt.length) uit.balans = { status: AANDACHT, tekst: `Balans ontbreekt: ${bal.ontbreekt.join(', ')}` };
  else uit.balans = { status: OK, tekst: 'Balans ingevoerd voor alle toetsjaren en sluitend' };

  const vw = tellen('heeftVW');
  if (!vw.aanwezig) uit.vw = { status: OPEN, tekst: 'Nog geen winst- en verliesrekening ingevoerd' };
  else if (vw.ontbreekt.length) uit.vw = { status: AANDACHT, tekst: `Winst- en verliesrekening ontbreekt: ${vw.ontbreekt.join(', ')}` };
  else uit.vw = { status: OK, tekst: 'Winst- en verliesrekening ingevoerd voor alle toetsjaren' };

  // IB-aangifte: per toetsjaar minstens één ingevuld bedrag (per onderneming of persoonlijk)
  const ibJaren = (r.T || []).filter((y) => {
    const ib = d.ib?.[y] || {};
    const perOnd = Object.values(ib.perOnd || {}).some((p) => Object.values(p || {}).some(isIngevuld));
    const persoon = Object.entries(ib).some(([k, v]) => k !== 'perOnd' && isIngevuld(v));
    return perOnd || persoon;
  });
  if (isNul) uit.ib = null;
  else if (!ibJaren.length) uit.ib = { status: OPEN, tekst: 'Nog geen IB-aangifte ingevoerd' };
  else if (ibJaren.length < (r.T || []).length) uit.ib = { status: AANDACHT, tekst: `IB-aangifte ontbreekt voor ${jarenTekst((r.T || []).filter((y) => !ibJaren.includes(y)))}` };
  else uit.ib = { status: OK, tekst: 'IB-aangifte ingevoerd voor alle toetsjaren' };

  // Berekening: het oordeel over de voorwaarden
  const oordeel = isNul ? r.nul?.status : r.status;
  uit.berekening = {
    status: oordeel === 'akkoord' ? OK : oordeel === 'niet_akkoord' ? FOUT : AANDACHT,
    tekst: oordeel === 'akkoord' ? 'Voorwaarden akkoord' : oordeel === 'niet_akkoord' ? 'Voorwaarden niet akkoord' : 'Aandachtspunten bij de voorwaarden',
  };

  // Documenten: verplichte stukken
  const vereist = (r.documenten || []).filter((x) => x.verplicht);
  const ontbrekend = vereist.filter((x) => !docAanwezig(docs, x)).length;
  uit.documenten = !vereist.length ? null
    : ontbrekend ? { status: ontbrekend === vereist.length ? OPEN : AANDACHT, tekst: `${ontbrekend} van ${vereist.length} verplichte documenten ontbreken`, teller: ontbrekend }
      : { status: OK, tekst: 'Alle verplichte documenten aanwezig' };

  // Notities: algemene toelichting en conclusie
  const n = d.notities || {};
  const heeftAlgemeen = !!String(n.algemeen || '').trim();
  const heeftConclusie = !!String(n.conclusie || '').trim();
  uit.notities = heeftAlgemeen && heeftConclusie ? { status: OK, tekst: 'Algemene toelichting en conclusie ingevuld' }
    : heeftAlgemeen || heeftConclusie ? { status: AANDACHT, tekst: `Nog invullen: ${heeftAlgemeen ? 'conclusie' : 'algemene toelichting'}` }
      : { status: OPEN, tekst: 'Nog geen notities' };

  // Fiattering
  const f = d.fiat || {};
  uit.fiat = f.tweede?.resultaat === 'akkoord' ? { status: OK, tekst: 'Definitief akkoord (2e fiat)' }
    : f.tweede?.resultaat === 'niet_akkoord' ? { status: FOUT, tekst: 'Niet akkoord bij de 2e beoordeling' }
      : f.eerste ? { status: AANDACHT, tekst: 'Gereed gemeld, wacht op de 2e beoordeling' }
        : { status: OPEN, tekst: 'Nog niet gereed gemeld' };

  return uit;
}

/** Samenvatting voor de dossierkop: aantal complete onderdelen van de invoer. */
export function voortgangTelling(v) {
  const invoer = ['klant', 'balans', 'vw', 'ib', 'documenten', 'notities'].map((k) => v[k]).filter(Boolean);
  return { klaar: invoer.filter((x) => x.status === OK).length, totaal: invoer.length };
}
