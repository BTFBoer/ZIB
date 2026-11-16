import { parseBedrag } from '../util.js';

const sleutel = (v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ');

export function leesKernbedrag(v) {
  const numeriek = String(v ?? '').replace(/[€\s]/g, '').replace(/−/g, '-');
  const inhoud = numeriek.startsWith('(') && numeriek.endsWith(')') ? numeriek.slice(1, -1) : numeriek;
  return /^(?:[+-]?\d+|[+-]?\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(inhoud) ? parseBedrag(v) : null;
}

/** Koppel spreadsheetcellen op post én jaar, ook als de kolommen zijn omgewisseld. */
export function leesKerncijfers(tekst, velden) {
  const lijnen = String(tekst ?? '').replace(/^\uFEFF/, '').trim().split(/\r\n?|\n/);
  const sep = lijnen[0].includes('\t') ? '\t' : ';';
  const split = (s) => s.split(sep).map((v) => v.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
  const [kop, ...rijen] = lijnen.map(split);
  const jaren = kop.slice(1);
  if (sleutel(kop[0]) !== 'post' || !jaren.length || jaren.some((v) => !/^\d{4}$/.test(v)) || new Set(jaren).size !== jaren.length) {
    return { posten: [], meldingen: ['Gebruik de kop Post met unieke jaartallen, zoals in het sjabloon.'] };
  }
  const index = new Map(velden.map((v) => [`${sleutel(v.post)}|${v.jaar}`, v]));
  const gezien = new Set();
  const posten = [];
  const meldingen = [];
  for (const [naam, ...bedragen] of rijen) {
    if (!naam && !bedragen.some(Boolean)) continue;
    if (gezien.has(sleutel(naam))) return { posten: [], meldingen: [`Post “${naam}” komt meer dan één keer voor.`] };
    gezien.add(sleutel(naam));
    if (bedragen.slice(jaren.length).some(Boolean)) return { posten: [], meldingen: [`Bij “${naam}” staan bedragen zonder jaarkolom.`] };
    bedragen.slice(0, jaren.length).forEach((v, i) => {
      if (v === '') return;
      const veld = index.get(`${sleutel(naam)}|${jaren[i]}`);
      const waarde = leesKernbedrag(v);
      if (!veld) meldingen.push(`${naam || '(post zonder naam)'} · ${jaren[i]}: geen bewerkbaar veld.`);
      else if (waarde === null) meldingen.push(`${naam} · ${jaren[i]}: bedrag niet herkend.`);
      else posten.push({ ...veld, waarde });
    });
  }
  return { posten, meldingen };
}
