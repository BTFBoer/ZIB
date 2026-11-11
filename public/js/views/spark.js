// Kleine trendgrafiek naast een rij met kengetallen. De waarden staan altijd ook als tekst in dezelfde rij;
// de grafiek is een aanvulling (verloop in één oogopslag) en nooit de enige plek waar een waarde staat.
import { esc, fmt } from '../util.js';
import { sparkStaven } from '../lijsten.js';

const STAAF = 9;
const TUSSEN = 3;
const HOOGTE = 20;
const n2 = (x) => Math.round(x * 100) / 100;

// Staaf met een afgeronde kop aan de datakant en een rechte kant op de nullijn.
function staafPad({ x, y, b, h, negatief }) {
  const r = Math.min(2, h, b / 2);
  const x2 = n2(x + b);
  const y2 = n2(y + h);
  const x1 = n2(x);
  const y1 = n2(y);
  if (negatief) return `M${x1},${y1}H${x2}V${n2(y2 - r)}Q${x2},${y2} ${n2(x2 - r)},${y2}H${n2(x1 + r)}Q${x1},${y2} ${x1},${n2(y2 - r)}Z`;
  return `M${x1},${y2}V${n2(y1 + r)}Q${x1},${y1} ${n2(x1 + r)},${y1}H${n2(x2 - r)}Q${x2},${y1} ${x2},${n2(y1 + r)}V${y2}Z`;
}

/**
 * Staafjes van oud naar nieuw (links naar rechts), met het laatste jaar in de accentkleur.
 * @param {(number|null)[]} waarden  chronologisch
 * @param {{labels?: (string|number)[], opmaak?: (v: number) => string, titel?: string}} opties
 */
export function sparkSVG(waarden, { labels = [], opmaak = (v) => fmt.getal(v), titel = '' } = {}) {
  const getal = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const reeks = waarden.map(getal);
  if (reeks.filter((v) => v !== null).length < 2 || reeks.every((v) => !v)) return '';
  const breedte = reeks.length * STAAF + (reeks.length - 1) * TUSSEN;
  const { staven, nul } = sparkStaven(reeks, { breedte, hoogte: HOOGTE, tussenruimte: TUSSEN });
  let laatste = -1;
  staven.forEach((s, i) => { if (!s.leeg) laatste = i; });
  const beschrijving = reeks.map((v, i) => `${labels[i] ?? i + 1}: ${v === null ? 'n.v.t.' : opmaak(v)}`).join(' · ');
  const nullijn = staven.some((s) => s.negatief) ? `<line class="nul" x1="0" x2="${breedte}" y1="${n2(nul)}" y2="${n2(nul)}"/>` : '';
  const marks = staven.map((s, i) => (s.leeg || !s.h ? '' : `<path${i === laatste ? ' class="nu"' : ''} d="${staafPad(s)}"/>`)).join('');
  return `<svg class="spark" viewBox="0 0 ${breedte} ${HOOGTE}" width="${breedte}" height="${HOOGTE}" role="img" aria-label="${esc(`${titel ? `${titel}, ` : ''}${beschrijving}`)}"><title>${esc(beschrijving)}</title>${nullijn}${marks}</svg>`;
}
