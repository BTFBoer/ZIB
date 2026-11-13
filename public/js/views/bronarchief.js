import { esc, fmt, naamAanvrager } from '../util.js';
import { renderBroncontrole } from './broncontrole.js';

export function maakBronarchief(bron) {
  const sleutel = JSON.stringify([bron.match.bronDossiernummer || bron.match.kvk || '', bron.match.aanvrager, bron.match.onderneming]);
  let hash = 2166136261;
  for (const teken of sleutel) hash = Math.imul(hash ^ teken.codePointAt(0), 16777619);
  return { id: `bronarchief_${(hash >>> 0).toString(16)}`, type: 'bronarchief', version: 0, bron };
}

export function renderBronarchief(records, record) {
  if (!record) return `<div class="paginakop"><h1>Historische brondossiers</h1></div><div class="paneel">${records.length ? `<ul>${records.map((r) => `<li><a href="#/bronarchief/${encodeURIComponent(r.id)}">${esc(naamAanvrager(r.bron.match.aanvrager))} · ${esc(r.bron.match.onderneming)}</a></li>`).join('')}</ul>` : '<p>Er zijn nog geen historische brondossiers opgeslagen.</p>'}</div>`;
  const b = record.bron;
  const hoofd = naamAanvrager(b.match.aanvrager);
  const jaarposten = (j, ib) => ({ ...Object.fromEntries(Object.entries(j.bzi || {}).filter(([, v]) => typeof v === 'number')),
    ...Object.fromEntries(Object.entries(ib || {}).filter(([, v]) => typeof v === 'number')) });
  const labels = { ev: 'Eigen vermogen', bt: 'Balanstotaal', va: 'Vlottende activa', kvv: 'Kort vreemd vermogen', omzet: 'Omzet', nettowinst: 'Nettowinst', resultaatVoorBelasting: 'Resultaat vóór belasting', vpb: 'Vennootschapsbelasting', voorraad: 'Voorraad', loon: 'DGA-loon', sfw: 'Saldo fiscale winst', dividend: 'Dividend', bijtelling: 'Bijtelling', row: 'Resultaat uit overige werkzaamheden' };
  return `<div class="paginakop"><div><a href="#/bronarchief">Alle historische brondossiers</a><h1>${esc(hoofd)}</h1><p>${esc(b.match.onderneming)}${b.match.bronDossiernummer ? ` · bron ${esc(b.match.bronDossiernummer)}` : ''}</p></div></div>
    ${renderBroncontrole({ broncontrole: b.broncontrole }, { toetsinkomen: null, kaderCfg: { kort: b.toetskader?.versie || b.toetskader?.kader || 'Historisch bronkader' } }, { archief: true })}
    <section class="paneel"><h2>Jaarcijfers uit de bron</h2>${b.ondernemingen.map((o) => `<details class="stappen"><summary>${esc(o.match.naam)}</summary><div class="inhoud scroll"><table class="tabel compact"><thead><tr><th>Jaar</th><th>Post</th><th class="num">Bedrag</th><th>Bron</th></tr></thead><tbody>${Object.entries(o.jaren || {}).flatMap(([y, j]) => Object.entries(jaarposten(j, o.ib?.[y])).map(([k, waarde]) => {
      const bron = j.bronnen?.[`ib.${k}`] || j.bronnen?.[`bzi.${k}`];
      return `<tr><td>${esc(y)}</td><th scope="row">${esc(labels[k] || k)}</th><td class="num">${esc(fmt.eur(waarde, waarde % 1 ? 2 : 0))}</td><td>${esc(bron?.bestand)} · ${esc(bron?.locatie)}</td></tr>`;
    })).join('')}</tbody></table></div></details>`).join('')}
    ${Object.entries(b.ib || {}).filter(([, j]) => Number.isFinite(j.row)).map(([y, j]) => `<p>${esc(y)} · ${labels.row} · ${esc(fmt.eur(j.row))} · ${esc(j.bronnen?.row?.bestand)} ${esc(j.bronnen?.row?.locatie)}</p>`).join('')}</section>`;
}
