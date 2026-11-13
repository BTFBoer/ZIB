import { esc, fmt, isIngevuld } from '../util.js';
import { soortOndernemer, RECHTSVORMEN } from '../engine/kaders.js';
import { heeftBalans, heeftVW, totalenJaar } from '../engine/financieel.js';
import { IB_ONDERNEMING_RIJEN, IB_PERSOON_RIJEN, JAAR_STATUSSEN, weergaveVan } from '../schema/fields.js';
import { bedrag, keuze, veld, icoon } from './ui.js';

const basisVW = [
  ['omzet', 'Omzet', 'OMZET'], ['nettowinst', 'Nettowinst', 'NW'],
];
const basisBalans = [
  ['ev', 'Eigen vermogen', 'EV'], ['bt', 'Balanstotaal', 'TA'],
  ['va', 'Vlottende activa', 'VA'], ['kvv', 'Kort vreemd vermogen', 'KVV'],
];
const vpbVW = [['resultaatVoorBelasting', 'Resultaat vóór belasting', 'RVB'], ['vpb', 'Vennootschapsbelasting']];

export function kerninvoerPad(d, tab, ond, bind) {
  return `#/dossier/${encodeURIComponent(d.id)}/${tab}${ond ? `/${encodeURIComponent(ond)}` : ''}${bind ? `?veld=${encodeURIComponent(bind)}` : ''}`;
}

/** Status van de expliciet ingevoerde periode; een lege controledatum krijgt geen fictief jaareinde. */
export function heeftControleperiode(j, jaar, peildatum) {
  const van = j.van || `${jaar}-01-01`;
  return /^\d{4}-\d{2}-\d{2}$/.test(j.tot || '') && j.tot >= van && (!peildatum || j.tot <= peildatum);
}

export function werkKerninvoerTellingBij(el) {
  if (!el) return;
  const cellen = [...el.querySelectorAll('table[data-kern-kern] td[data-kern-bedrag]')];
  const aantal = cellen.filter((td) => {
    const veld = td.querySelector('input');
    return veld ? !veld.disabled && veld.value.trim() !== '' && veld.getAttribute('aria-invalid') !== 'true' : td.hasAttribute('data-kern-detail');
  }).length;
  const teller = el.querySelector('[data-kern-teller]');
  if (teller) teller.textContent = `${aantal} van ${cellen.length} kernvelden ingevuld`;
}

export function renderKerninvoer(d, ond, { jaren, kandidaatC }, r) {
  const href = (tab, id, bind) => kerninvoerPad(d, tab, id, bind);
  if (!ond) return `<div class="paneel"><p>Voeg eerst een onderneming toe bij Klantgegevens.</p><a class="knop" href="${href('klant')}">Onderneming toevoegen</a></div>`;
  const vpb = soortOndernemer(ond.rechtsvorm) === 'VPB';
  const startBind = `ond:${ond.id}.startdatum`;
  const jaarpad = (y, pad) => `ond:${ond.id}.jaren.${y}.${pad}`;
  const bron = (y) => ond.jaren?.[y] || {};
  const financieel = new Map(jaren.map((y) => [y, totalenJaar(bron(y))]));
  const telJaren = new Set(r.T || []);
  const peildatum = r.datum || d.datumVaststelling || '';
  const datumcel = (y, k, label) => `<td><input type="date" aria-label="${label} ${y}" data-bind="${esc(jaarpad(y, k))}" data-type="datum" data-render="1"${y === kandidaatC ? ` data-kern-periode="${k}" data-jaar="${y}"${peildatum ? ` max="${esc(peildatum)}"` : ''}` : ''} value="${esc(bron(y)[k] || '')}"></td>`;
  const type = (y) => y === kandidaatC ? 'Controlejaar' : 'Boekjaar';
  const kop = `<thead><tr><th scope="col">Post</th>${jaren.map((y) => `<th scope="col" class="${y === kandidaatC ? 'kern-controle' : ''}"><strong>${y}</strong><small>${type(y)}</small></th>`).join('')}</tr></thead>`;
  const sectie = (label, hint) => `<tr class="kern-tussenkop"><th colspan="${jaren.length + 1}" scope="colgroup">${label}<small>${hint}</small></th></tr>`;
  const rijen = (def, bronSoort) => def.map(({ k, label, hint, totaal }) => `<tr data-kern-rij><th scope="row">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</th>${jaren.map((y) => {
    const j = bron(y);
    if (bronSoort === 'ib' && y === kandidaatC && k === 'sfw') return '<td class="kern-nvt"><small>Gebruik nettowinst</small></td>';
    if (bronSoort === 'persoon' && !telJaren.has(y)) return '<td class="kern-nvt"><small>Niet van toepassing</small></td>';
    const afgesloten = bronSoort !== 'persoon' && y === kandidaatC && !heeftControleperiode(j, y, peildatum);
    const voorStart = ond.startdatum && Number(ond.startdatum.slice(0, 4)) > y;
    if (voorStart && bronSoort !== 'persoon') return '<td class="kern-nvt"><small>Vóór de start</small></td>';
    const bind = bronSoort === 'persoon' ? `ib.${y}.${k}` : bronSoort === 'ib' ? `ib.${y}.perOnd.${ond.id}.${k}` : jaarpad(y, `bzi.${k}`);
    const detail = bronSoort === 'balans' ? heeftBalans(j.balans) : bronSoort === 'vw' ? heeftVW(j.vw) : false;
    if (detail) {
      const t = financieel.get(y);
      const waarde = totaal ? (bronSoort === 'balans' ? t.bal : t.vw)[totaal] : j.vw?.vpb;
      const route = weergaveVan(d) === 'bzi' ? 'bedrijf' : bronSoort;
      return `<td data-kern-bedrag data-kern-detail class="kern-broncel"><a href="${href(route, ond.id)}" title="Bewerken bij de detailposten">${isIngevuld(waarde) ? esc(fmt.eur(waarde, waarde % 1 ? 2 : 0)) : '—'}<small>Uit detailposten</small></a></td>`;
    }
    const waarde = bronSoort === 'persoon' ? d.ib?.[y]?.[k] : bronSoort === 'ib' ? d.ib?.[y]?.perOnd?.[ond.id]?.[k] : j.bzi?.[k];
    const tel = bronSoort === 'ib' && (k === 'sfw' || k === 'loon') || bronSoort === 'balans' || bronSoort === 'vw';
    const invoer = bedrag(bind, waarde, { label: `${label} ${y}` });
    return `<td class="invoer"${tel ? ' data-kern-bedrag' : ''} data-kern-post="${esc(label)}" data-kern-jaar="${y}">${afgesloten ? invoer.replace('<input ', '<input disabled title="Vul eerst de einddatum van de controleperiode in" ') : invoer}</td>`;
  }).join('')}</tr>`).join('');
  const defs = (lijst) => lijst.map(([k, label, totaal]) => ({ k, label, totaal }));
  const ib = IB_ONDERNEMING_RIJEN.filter((x) => !x.soorten || x.soorten.includes(vpb ? 'VPB' : 'IB'));
  const ontbrekendeDatum = !heeftControleperiode(bron(kandidaatC), kandidaatC, peildatum);
  const periodeBind = jaarpad(kandidaatC, 'tot');
  const huidige = d.ondernemingen || [];
  return `<div class="kerninvoer" data-kerninvoer>
    <section class="kern-intro">
      <div><span class="kern-kicker">Cijfers per onderneming</span><h2>${esc(ond.naam || 'Onderneming')}</h2><p>${esc(RECHTSVORMEN[ond.rechtsvorm]?.label || '')}${ond.rechtsvorm ? ' · ' : ''}IB, winst en balans in één werkblad.</p></div>
      <div class="kern-acties"><button type="button" class="knop sec" data-actie="kern-plakken">Plak uit Excel</button><a class="knop" href="${href('berekening')}">Naar berekening ${icoon('pijl')}</a></div>
    </section>
    ${huidige.length > 1 ? `<nav class="ondkeuze" aria-label="Onderneming">${huidige.map((o) => `<a href="${href('invoer', o.id)}"${o.id === ond.id ? ' class="actief" aria-current="page"' : ''}>${esc(o.naam || 'Naamloze onderneming')}</a>`).join('')}</nav>` : ''}
    <section class="paneel kern-blok">
      <div class="kern-blokkop"><div><h3>1. Boekjaren en controleperiode</h3><p>Voor een volledig boekjaar mag de periode leeg blijven. Geef voor tussentijdse cijfers de einddatum op.</p></div>${veld('Startdatum KvK', startBind, ond.startdatum, { type: 'datum', render: true })}</div>
      <div class="scroll"><table class="kern-tabel" aria-label="Boekjaren en controleperiode">${kop}<tbody>
        <tr><th scope="row">Status cijfers</th>${jaren.map((y) => `<td>${keuze(null, jaarpad(y, 'status'), JAAR_STATUSSEN, bron(y).status || (y === kandidaatC ? 'tussentijds' : 'definitief'), { render: true }).replace('<select ', `<select aria-label="Status cijfers ${y}" `)}</td>`).join('')}</tr>
        <tr><th scope="row">Periode vanaf</th>${jaren.map((y) => datumcel(y, 'van', 'Periode vanaf')).join('')}</tr>
        <tr><th scope="row">Periode tot en met</th>${jaren.map((y) => datumcel(y, 'tot', 'Periode tot en met')).join('')}</tr>
      </tbody></table></div>
      ${ontbrekendeDatum ? `<p class="kern-hint"><a href="${href('invoer', ond.id, periodeBind)}">Vul de einddatum van de controleperiode in</a> om de cijfers voor ${kandidaatC} te bewerken. De einddatum moet op of vóór de peildatum liggen.</p>` : ''}
    </section>
    <section class="paneel kern-blok">
      <div class="kern-blokkop"><div><h3>2. Kerncijfers</h3><p>Bedragen in euro’s. Laat onbekende bedragen leeg en vul 0 in als het bedrag werkelijk nul is.</p></div><span class="pil neutraal" data-kern-teller aria-live="polite"></span></div>
      <div class="scroll" id="rooster"><table class="kern-tabel" data-kern-kern aria-label="Kerncijfers">${kop}<tbody>
        ${sectie('Inkomstenbelasting', 'Overnemen uit de aangifte of salarisstukken.')}${rijen(ib, 'ib')}
        ${sectie('Winst en verlies', 'Neem de cijfers over uit de jaarrekening.')}${rijen(defs(basisVW), 'vw')}
        ${sectie('Balans', 'Gebruik de boekwaarden aan het einde van de periode.')}${rijen(defs(basisBalans), 'balans')}
      </tbody></table></div>
      <div class="kern-voet"><span>Wijzigingen worden automatisch opgeslagen.</span><a href="${href('bziinvoer')}">Detailinvoer en correcties ${icoon('rechts')}</a></div>
    </section>
    <details class="paneel kern-blok kern-extra"><summary><strong>3. Aanvullende posten</strong><span>Voorraad${vpb ? ', resultaat vóór belasting, VPB' : ''} en overige inkomsten</span></summary>
      <div class="scroll"><table class="kern-tabel" aria-label="Aanvullende posten">${kop}<tbody>
        ${sectie('Aanvullende jaarcijfers', 'Invullen als het gekozen beleid deze cijfers gebruikt.')}
        ${rijen(defs([['voorraad', 'Voorraad en onderhanden werk', 'VOORRADEN']]), 'balans')}${vpb ? rijen(defs(vpbVW), 'vw') : ''}
        ${sectie('Overige inkomsten en vermogen', 'Bedragen gelden voor het hele dossier; vul ze één keer in.')}${rijen(IB_PERSOON_RIJEN, 'persoon')}
      </tbody></table></div>
    </details>
    <div class="kern-voet"><a href="${href('klant')}">Naar klantgegevens en beleidsvelden ${icoon('rechts')}</a><a class="knop" href="${href('berekening')}">Uitkomst bekijken ${icoon('pijl')}</a></div>
  </div>`;
}
