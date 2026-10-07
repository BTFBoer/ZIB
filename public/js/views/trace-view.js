import { esc, fmt } from '../util.js';
import { pil } from './ui.js';
import { ordeJaren } from './uistate.js';

export function celWaarde(c) {
  if (!c) return '';
  if (c.w === null || c.w === undefined) return c.opmaak === 'tekst' ? '' : (c.opmaak === 'ratio' || c.opmaak === 'pct' ? 'n.v.t.' : '');
  switch (c.opmaak) {
    case 'ratio': return fmt.ratio(c.w);
    case 'pct': return fmt.pct(c.w);
    case 'getal': return fmt.getal(c.w);
    case 'tekst': return esc(String(c.w));
    default: return fmt.getal(c.w);
  }
}

export function renderSectie(s) {
  // Jaarkolommen in de gekozen volgorde (standaard het meest recente jaar links).
  const kol = ordeJaren(s.kolommen || []);
  const kop = `<tr><th>${esc(s.titel)}</th>${kol.map((k) => `<th class="num">${esc(s.kolomLabels?.[k] ?? k)}</th>`).join('')}${s.rijen.some((r) => r.trend) ? '<th>Trend</th>' : ''}</tr>`;
  const metTrend = s.rijen.some((r) => r.trend);
  const rijen = s.rijen.map((r) => {
    if (r.kop) return `<tr class="kopregel"><td colspan="${kol.length + 1 + (metTrend ? 1 : 0)}">${esc(r.label)}</td></tr>`;
    if (r.tekst !== undefined) return `<tr><td>${esc(r.label)}</td><td colspan="${kol.length + (metTrend ? 1 : 0)}">${esc(r.tekst)}</td></tr>`;
    const cellen = kol.map((k) => {
      const c = r.cellen?.[k];
      if (!c) return '<td class="num"></td>';
      const f = c.f ? `<span class="f">${esc(c.f)}</span>` : '';
      const status = c.status ? ` ${pil(c.status)}` : '';
      return `<td class="num">${f}${celWaarde(c)}${status}</td>`;
    }).join('');
    return `<tr class="${esc(r.stijl || '')}"><td>${esc(r.label)}</td>${cellen}${metTrend ? `<td>${esc(r.trend || '')}</td>` : ''}</tr>`;
  }).join('');
  return `<div class="trace"><h4>${esc(s.titel)}</h4>
    ${s.richtlijn ? `<div class="richtlijn">Richtlijn: ${esc(s.richtlijn)}</div>` : ''}
    ${s.formule ? `<div class="richtlijn">Formule: ${esc(s.formule)}</div>` : ''}
    <div class="scroll"><table class="tabel">${kop.replace(`<th>${esc(s.titel)}</th>`, '<th></th>')}${rijen}</table></div></div>`;
}

export function renderTrace(trace, groep) {
  const secties = (trace?.secties || []).filter((s) => !groep || s.groep === groep);
  return secties.map(renderSectie).join('');
}
