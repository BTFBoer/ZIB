import { clone, isIngevuld, num, rond } from '../util.js';
import { solvNorm } from './kaders.js';

/**
 * Inzet van surplus netto werkkapitaal uit meerderheidsbelangen (NHG-toelichting "Groepsverhoudingen" en Knab
 * C.8.1.2). Per jaar vult het werkkapitaal boven de normen van een vennootschap waarin de aanvrager een
 * meerderheidsbelang met zeggenschap heeft, het tekort aan liquiditeit of solvabiliteit van een andere vennootschap
 * in dezelfde groep aan.
 * - Van moeder naar (klein)dochter telt 100%.
 * - Van dochter naar haar (indirecte) aandeelhouder, of via de gezamenlijke aandeelhouder naar een zustervennootschap,
 *   telt het belang van die aandeelhouder in de gevende vennootschap.
 * - De gevende vennootschap blijft na de inzet aan de normen voor liquiditeit en solvabiliteit voldoen.
 * Handmatig vastgelegde bedragen (Diversen) gaan voor: die vennootschap-jaren doen niet automatisch mee.
 * @returns {{ toegepast: boolean, overdrachten: object[], meldingen: object[], reden?: string }}
 */
export function verdeelSurplusWerkkapitaal(dossier, r, st, bel) {
  const kader = r.kaderCfg;
  if (kader?.correctieModel !== 'NHG') {
    return { toegepast: false, overdrachten: [], meldingen: [], reden: 'Dit toetskader kent geen inzet van surplus werkkapitaal tussen groepsmaatschappijen.' };
  }
  const crNorm = kader.liquiditeitMin ?? 1;
  const svNorm = solvNorm(kader, 'VPB') ?? 0.25;
  const jaren = [...r.T, ...(r.C ? [r.C] : [])];
  const onds = new Map((dossier.ondernemingen || []).map((o) => [o.id, o]));
  const analyses = new Map((r.ondernemingen || []).map((a) => [a.id, a]));
  const ouders = new Map();
  for (const l of st.links) {
    if (!ouders.has(l.kind)) ouders.set(l.kind, []);
    ouders.get(l.kind).push(l);
  }
  // Belang van voorouder a in afstammeling b in jaar y (product over het sterkste pad), of null als a geen voorouder is.
  const ketenBelang = (a, b, y, pad = new Set()) => {
    if (a === b) return 1;
    let beste = null;
    for (const l of ouders.get(b) || []) {
      if (pad.has(l.ouder)) continue;
      const k = ketenBelang(a, l.ouder, y, new Set([...pad, b]));
      if (k !== null) beste = Math.max(beste ?? 0, k * l.pctJaar(y));
    }
    return beste;
  };
  const voorouders = (id, pad = new Set()) => (ouders.get(id) || []).flatMap((l) => (pad.has(l.ouder) ? [] : [l.ouder, ...voorouders(l.ouder, new Set([...pad, id]))]));
  const factorVoor = (gever, ontvanger, y) => {
    if (ketenBelang(gever, ontvanger, y) !== null) return 1;
    let beste = null;
    for (const h of [ontvanger, ...voorouders(ontvanger)]) {
      const k = ketenBelang(h, gever, y);
      if (k !== null && k > 0) beste = Math.max(beste ?? 0, k);
    }
    return beste;
  };
  const handmatig = (id, y) => {
    const div = onds.get(id)?.jaren?.[y]?.div || {};
    return isIngevuld(div.surplusOntvangen) || isIngevuld(div.surplusIngezet);
  };
  const overdrachten = [];
  for (const y of jaren) {
    const kandidaten = [...analyses.values()].filter((a) => a.soort === 'VPB' && a.meenemen !== false && !a.geconsolideerd
      && a.jaren[y]?.heeftBalans && onds.get(a.id)?.actief !== false && !handmatig(a.id, y));
    const ruimte = new Map();
    const tekort = new Map();
    for (const a of kandidaten) {
      const j = a.jaren[y];
      const VA = num(j.VAcor);
      const KVV = num(j.KVVcor);
      const EV = num(j.EVcor);
      const TV = num(j.TVcor);
      const meerderheid = bel.get(a.id)?.keten === true && (bel.get(a.id)?.belangJaar(y) ?? 0) > 0.5;
      // Ruimte: wat de vennootschap kan missen zonder zelf onder de normen te zakken.
      const liqRuimte = VA - crNorm * KVV;
      const solvRuimte = (EV - svNorm * TV) / (1 - svNorm);
      if (meerderheid && liqRuimte > 0 && solvRuimte > 0) ruimte.set(a.id, Math.min(liqRuimte, solvRuimte));
      // Tekort: wat nodig is om aan de normen voor liquiditeit en solvabiliteit te voldoen.
      const liqTekort = crNorm * KVV - VA;
      const solvTekort = TV > 0 ? (svNorm * TV - EV) / (1 - svNorm) : 0;
      const nodig = Math.max(0, liqTekort, solvTekort);
      if (nodig > 0.5) tekort.set(a.id, nodig);
    }
    const ontvangers = [...tekort.entries()].sort((a, b) => b[1] - a[1]);
    for (const [ontvanger, nodig] of ontvangers) {
      let rest = nodig;
      const gevers = [...ruimte.entries()].filter(([id, x]) => id !== ontvanger && x > 0.5).sort((a, b) => b[1] - a[1]);
      for (const [gever, beschikbaar] of gevers) {
        if (rest <= 0.5) break;
        const factor = factorVoor(gever, ontvanger, y);
        if (!factor) continue;
        const ontvangen = Math.min(rest, beschikbaar * factor);
        const ingezet = ontvangen / factor;
        if (ontvangen <= 0.5) continue;
        overdrachten.push({ jaar: y, van: gever, naar: ontvanger, ontvangen: rond(ontvangen), ingezet: rond(ingezet), factor });
        ruimte.set(gever, beschikbaar - ingezet);
        rest -= ontvangen;
      }
    }
  }
  const naam = (id) => analyses.get(id)?.naam || onds.get(id)?.naam || id;
  const meldingen = overdrachten.map((x) => ({ niveau: 'info',
    tekst: `${x.jaar}: surplus werkkapitaal van ${naam(x.van)} ingezet bij ${naam(x.naar)}: € ${rond(x.ontvangen).toLocaleString('nl-NL')}${x.factor < 1 ? ` (${Math.round(x.factor * 1000) / 10}% belang; ingezet € ${rond(x.ingezet).toLocaleString('nl-NL')})` : ''}.` }));
  return { toegepast: overdrachten.length > 0, overdrachten, meldingen,
    ...(overdrachten.length ? {} : { reden: 'Geen meerderheidsbelang met surplus werkkapitaal en geen tekort bij een andere groepsmaatschappij.' }) };
}

/** Het dossier met de automatische inzet als balanscorrectie (Diversen) per vennootschap en jaar. */
export function dossierMetSurplus(dossier, verdeling) {
  const d = clone(dossier);
  // De inzet is verwerkt; geneste berekeningen (bijv. de NHG-referentie) gebruiken deze bedragen en verdelen niet opnieuw.
  d.instellingen = { ...(d.instellingen || {}), surplusWerkkapitaal: false };
  for (const x of verdeling.overdrachten) {
    for (const [id, veld, bedrag] of [[x.naar, 'surplusOntvangen', x.ontvangen], [x.van, 'surplusIngezet', x.ingezet]]) {
      const o = (d.ondernemingen || []).find((z) => z.id === id);
      if (!o) continue;
      o.jaren ||= {};
      o.jaren[x.jaar] ||= {};
      o.jaren[x.jaar].div ||= {};
      o.jaren[x.jaar].div[veld] = rond(num(o.jaren[x.jaar].div[veld]) + bedrag);
    }
  }
  return d;
}
