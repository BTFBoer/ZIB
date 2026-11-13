import { gemiddelde, rond, rond2 } from '../util.js';
import { heeftBedrag } from './financieel.js';
import { extrapolatiefactor, maandenInclusief } from './periods.js';

function isDatum(waarde) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(waarde || '')) return false;
  const d = new Date(`${waarde}T00:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === waarde;
}

function geld(waarde) {
  return heeftBedrag(waarde) ? Number(waarde) : null;
}

/** Lees het fiscale loon op aanvragerniveau, of een eerder opgeslagen en herleidbare bronverwijzing. */
export function bronDgaGezamenlijk(d, jaar) {
  const ib = d.ib?.[jaar];
  if (ib && Object.hasOwn(ib, 'dgaGezamenlijk')) return ib.dgaGezamenlijk || {};
  const archief = d.broncontrole?.aanvrager?.dgaInkomenGecombineerd?.[jaar];
  return archief?.bronnen?.loon?.locatie && archief?.bronnen?.bijtelling?.locatie ? archief : null;
}

/** Alleen afgesloten, beschikbare boekjaren dragen bij aan gemiddelde en laatste-jaarplafond. */
export function berekenDgaGezamenlijk(d, { T, C, datum }, analyses, perHoofd) {
  const jaren = [...T, ...(C ? [C] : [])];
  const ingevoerd = jaren.map((y) => [y, bronDgaGezamenlijk(d, y)]);
  if (!ingevoerd.some(([, b]) => b && (heeftBedrag(b.loon) || heeftBedrag(b.bijtelling)))) return null;
  const werk = analyses.filter((a) => a.soort === 'VPB' && !a.geconsolideerd);
  const hoofden = perHoofd.filter((h) => h.soort === 'VPB');
  const blokkades = [];
  let strijdigeToedeling = false;
  const perJaar = {};
  for (const [jaar, bron] of ingevoerd) {
    const loon = geld(bron?.loon);
    const bijtelling = geld(bron?.bijtelling);
    const bronPerOnderneming = werk.map((a) => a.jaren[jaar]).filter((j) => heeftBedrag(j?.ibOnd?.loon) || heeftBedrag(j?.vwRuw?.salarisDGA));
    const verdeeld = bronPerOnderneming.reduce((som, j) => som + (geld(j.ibOnd.loon) ?? geld(j.vwRuw.salarisDGA) ?? 0), 0);
    const bijtellingVerdeeld = bronPerOnderneming.reduce((som, j) => som + Math.abs(geld(j.ibOnd.bijtelling) ?? 0), 0);
    const overlap = bronPerOnderneming.length > 0 && loon !== null;
    const gelijk = overlap && rond2(verdeeld) === rond2(loon)
      && bijtelling !== null && rond2(bijtellingVerdeeld) === rond2(Math.abs(bijtelling));
    const inkomen = loon !== null && bijtelling !== null && loon >= Math.abs(bijtelling) ? rond2(loon - Math.abs(bijtelling)) : null;
    if (jaar !== C && overlap && !gelijk) {
      strijdigeToedeling = true;
      blokkades.push(`${jaar}: gezamenlijk DGA-loon of bijtelling wijkt af van de uitsplitsing per onderneming.`);
    }
    const van = bron?.van || `${jaar}-01-01`;
    const tot = bron?.tot || (jaar === C ? '' : `${jaar}-12-31`);
    const periodeBekend = isDatum(van) && isDatum(tot) && van <= tot && (!datum || tot <= datum) && Number(tot.slice(0, 4)) === jaar;
    perJaar[jaar] = { loon, bijtelling: bijtelling === null ? null : Math.abs(bijtelling), inkomen,
      van, tot, periodeBekend, vergelekenMetOndernemingen: gelijk,
      geëxtrapoleerd: jaar === C && periodeBekend && inkomen !== null && (!overlap || gelijk) ? rond(inkomen * extrapolatiefactor(van, tot)) : null };
  }
  const hoofdenMee = hoofden.filter((h) => !h.nul && h.bron !== 'geen');
  if (!hoofdenMee.length || hoofdenMee.length !== hoofden.length) {
    blokkades.push('Het gezamenlijke DGA-loon kan niet betrouwbaar worden toegerekend bij een uitgesloten of ontbrekende BV.');
  }
  if (hoofdenMee.some((h) => h.bron === 'afwijkend')) {
    blokkades.push('Het gezamenlijke DGA-loon kan overlappen met een handmatig inkomensbesluit per BV.');
  }
  if (hoofdenMee.some((h) => !h.voldoet)) {
    blokkades.push('Beoordeel eerst de voorwaarden van de BV’s waarop het gezamenlijke DGA-loon berust.');
  }
  // Een gezamenlijke loonpost heeft een gezamenlijke looptijd. Voor starters is de prognose
  // op hetzelfde niveau vereist, anders kan de laagste van afslag en prognose niet worden vastgesteld.
  const maanden = Math.max(0, ...hoofdenMee.map((h) => h.maanden));
  const actieveJaren = T.filter((jaar) => werk.some((a) => a.jaren[jaar]?.meegeteld));
  const ontbreekt = actieveJaren.filter((y) => perJaar[y].inkomen === null || !perJaar[y].periodeBekend);
  if (ontbreekt.length) blokkades.push(`Vul het bruto DGA-loon en de bijtelling over ${ontbreekt.join(', ')} in. Vul € 0 in als er geen bijtelling was.`);
  const reeks = actieveJaren.map((y) => perJaar[y].inkomen).filter(Number.isFinite);
  const berekend = reeks.length && reeks.length === actieveJaren.length ? rond2(gemiddelde(reeks)) : null;
  const laatste = perJaar[T.at(-1)]?.inkomen;
  const factor = maanden < 12 ? 0 : maanden < 24 ? 0.75 : maanden < 36 ? 0.9 : 1;
  const prognose = geld(d.instellingen?.dgaGezamenlijkePrognose);
  if (factor > 0 && factor < 1 && (prognose === null || d.instellingen?.dgaGezamenlijkePrognoseRAAA !== true)) {
    blokkades.push('Voor de starterstoets is een prognose van het gezamenlijke DGA-loon door een RA of AA nodig.');
  }
  const toetsinkomen = berekend === null || laatste === null ? null
    : factor === 1 ? Math.min(berekend, laatste)
      : factor === 0 ? 0 : prognose === null ? null : rond2(Math.min(berekend * factor, prognose));
  const inUitkomst = !blokkades.length && Number.isFinite(toetsinkomen);
  return { perJaar, berekend, toetsinkomen, factor, prognose, inUitkomst, blokkades, ontbreekt,
    compleet: !strijdigeToedeling && ontbreekt.length === 0 && !T.some((y) => perJaar[y].inkomen !== null && !perJaar[y].periodeBekend),
    bronJaren: actieveJaren };
}
