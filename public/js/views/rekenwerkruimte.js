import { vergelijkKaders } from '../engine/index.js';
import { heeftBedrag, heeftResultaatVoorBelasting } from '../engine/financieel.js';
import { esc, fmt } from '../util.js';
import { icoon, pil } from './ui.js';
import { kerninvoerPad } from './kerninvoer.js';
import { renderInkomenTabel, renderOndernemingInkomen, renderRekenUitkomst } from './rekenuitkomst.js';
import { renderRekenBronvergelijking, renderRekenkeuzes } from './rekenkeuzes.js';
import { renderTrace } from './trace-view.js';
import { ui } from './uistate.js';

const BEDRAG_LEEG = '–';
const bedrag = (waarde) => Number.isFinite(waarde) ? fmt.eur(waarde) : BEDRAG_LEEG;
const jarenTekst = (jaren) => jaren?.length ? jaren.join(', ') : '';

function linkNaar(d, tab, tekst, { ondId, bind } = {}) {
  return `<a class="reken-link geen-print" href="${esc(kerninvoerPad(d, tab, ondId, bind))}">${esc(tekst)}${icoon('pijl')}</a>`;
}

function oefenVoorbeeld(d, kader) {
  return d.demo === true && Number.isFinite(d.oefenverklaringen?.[kader]?.bedrag) ? d.oefenverklaringen[kader] : null;
}

function resultaatOordeel(status, beleid, blokkeert) {
  if (status === 'niet_akkoord') return pil(status);
  if (blokkeert) return pil('attentie', beleid?.methode === 'extern' && !beleid.bewijs ? 'Bewijsstuk nodig' : 'Invoer nodig');
  return pil(status, beleid && status === 'akkoord' ? 'Ter beoordeling' : undefined);
}

function invoerActie(d, punt, ondId) {
  const tab = punt.paneel === 'invoer' && !ondId && !d.ondernemingen?.length ? 'ib' : punt.paneel;
  const labels = { klant: 'Klantgegevens', invoer: 'Invoer', ib: 'IB-aangifte', documenten: 'Documenten' };
  return labels[tab] ? linkNaar(d, tab, labels[tab], { ondId, bind: punt.bind }) : '';
}

function invoerPunten(d, punten, ondId) {
  if (!punten.length) return '';
  return `<ul class="reken-invoerpunten">${punten.map((punt) => `<li>
    <div><b>${esc(punt.label)}</b>${punt.jaren?.length ? ` <span class="reken-jaarlabel">${esc(jarenTekst(punt.jaren))}</span>` : ''}
      ${punt.melding ? `<span class="reken-punt-uitleg">${esc(punt.melding)}</span>` : ''}</div>
    ${invoerActie(d, punt, ondId)}
  </li>`).join('')}</ul>`;
}

export function renderRekenInvoercontroles(d, ontbreekt) {
  const aantal = ontbreekt.dossier.length + ontbreekt.ondernemingen.reduce((n, o) => n + o.punten.length, 0);
  const bedrijven = ontbreekt.ondernemingen.filter(({ punten }) => punten.length);
  const heeftOndernemingen = d.ondernemingen?.length > 0;
  return `<section class="reken-paneel" id="reken-invoer" aria-labelledby="reken-invoertitel">
    <div class="reken-paneel-kop">
      <h3 id="reken-invoertitel">Invoer controleren ${aantal ? pil('attentie', `${aantal} ${aantal === 1 ? 'punt' : 'punten'}`) : ''}</h3>
      ${linkNaar(d, heeftOndernemingen ? 'invoer' : 'ib', 'Cijfers bewerken')}
    </div>
    ${aantal
      ? `${invoerPunten(d, ontbreekt.dossier)}${bedrijven.map((o) => `<details class="stappen reken-uitklap"${bedrijven.length === 1 ? ' open' : ''}>
        <summary>${esc(o.naam)} <span>${o.punten.length} ${o.punten.length === 1 ? 'punt' : 'punten'}</span></summary>
        ${invoerPunten(d, o.punten, o.id)}</details>`).join('')}`
      : '<p class="reken-neutraal">De benodigde basisgegevens zijn ingevuld.</p>'}
  </section>`;
}

function statusBedrijfJaar(j, jaar, C) {
  if (!j?.actief) return 'Vóór start';
  if (jaar === C) return j.status === 'tussentijds' ? 'Controle · tussentijds' : 'Controlejaar';
  if (!j.meegeteld) return 'Buiten gemiddelde';
  return j.status === 'definitief' ? 'Definitief' : j.status === 'tussentijds' ? 'Tussentijds' : 'Toetsjaar';
}

function rij(label, jaren, inhoud, laatste = false) {
  return `<tr${laatste ? ' class="totaal"' : ''}><th scope="row">${esc(label)}</th>${jaren.map((jaar) => `<td class="num">${esc(inhoud(jaar))}</td>`).join('')}</tr>`;
}

function tabelKop(jaren, C) {
  return `<thead><tr><th scope="col">Post</th>${jaren.map((jaar) => `<th scope="col" class="num">${esc(jaar)}${jaar === C ? '<small>Controle</small>' : ''}</th>`).join('')}</tr></thead>`;
}

function jaarTabelBedrijf(a, bron, jaren, C) {
  const isDga = a.soort === 'VPB';
  const jarenWaarde = (label, fn) => rij(label, jaren, (jaar) => {
    const j = a.jaren[jaar];
    return bedrag(j?.actief ? fn(j, bron?.jaren?.[jaar]?.bzi || {}) : null);
  });
  const balansWaarde = (label, invoerveld, veld) => jarenWaarde(label, (j, bzi) =>
    j.heeftBalans && (!j.aggBalans || heeftBedrag(bzi[invoerveld])) ? j.bal[veld] : null);
  return `<div class="scroll"><table class="tabel reken-tabel">
    ${tabelKop(jaren, C)}<tbody>
    ${rij('Periode', jaren, (y) => statusBedrijfJaar(a.jaren[y], y, C))}
    ${C ? rij('Cijfers tot en met', jaren, (y) => y === C ? fmt.datum(bron?.jaren?.[y]?.tot) || BEDRAG_LEEG : BEDRAG_LEEG) : ''}
    ${jarenWaarde('Omzet', (j, bzi) => {
      const isOmzetBekend = heeftBedrag(j.aggVW ? bzi.omzet : j.vwRuw?.omzet);
      return isOmzetBekend ? j.vw.OMZET : null;
    })}
    ${jarenWaarde('Nettowinst', (j) => j.heeftResultaatinvoer ? j.winst.NW : null)}
    ${jarenWaarde('Nettowinst na correcties', (j) => j.heeftResultaatinvoer ? j.winst.NWcor : null)}
    ${isDga ? jarenWaarde('Resultaat vóór belasting', (j, bzi) =>
      heeftResultaatVoorBelasting({ bzi, vw: j.vwRuw }) ? j.winst.RVB : null) : ''}
    ${jarenWaarde(isDga ? 'Loon uit IB-aangifte' : 'Saldo fiscale winst uit IB-aangifte', (j) => {
      const waarde = j.ibOnd?.[isDga ? 'loon' : 'sfw'];
      return heeftBedrag(waarde) ? Number(waarde) : null;
    })}
    ${isDga ? jarenWaarde('Dividend uit IB-aangifte', (j) => heeftBedrag(j.ibOnd?.dividend) ? Number(j.ibOnd.dividend) : null) : ''}
    ${balansWaarde('Eigen vermogen', 'ev', 'EV')}
    ${balansWaarde('Balanstotaal', 'bt', 'TA')}
    ${balansWaarde('Vlottende activa', 'va', 'VA')}
    ${balansWaarde('Kort vreemd vermogen', 'kvv', 'KVV')}
    </tbody></table></div>`;
}

function persoonlijkeCijfers(d, jaren, C) {
  const regels = [['row', 'Resultaat uit overige werkzaamheden'], ['voorStart', 'Loon vóór start onderneming']]
    .filter(([key]) => jaren.some((jaar) => heeftBedrag(d.ib?.[jaar]?.[key])))
    .map(([key, label]) => rij(label, jaren, (jaar) => {
      const waarde = d.ib?.[jaar]?.[key];
      return heeftBedrag(waarde) ? bedrag(Number(waarde)) : BEDRAG_LEEG;
    })).join('');
  if (!regels) return '';
  return `<details class="stappen reken-uitklap" open><summary>Persoonlijke inkomsten</summary>
    <div class="reken-uitklap-inhoud"><div class="scroll"><table class="tabel reken-tabel">
      ${tabelKop(jaren, C)}<tbody>${regels}</tbody>
    </table></div>${linkNaar(d, d.ondernemingen?.length ? 'invoer' : 'ib', 'Persoonlijke inkomsten bewerken')}</div>
  </details>`;
}

function analyseUitkomst(d, x) {
  if (x.fout) return ['Niet te berekenen', ''];
  if (x.beleid) {
    if (x.beleid.bewijs && Number.isFinite(x.beleid.bedrag)) return [bedrag(x.beleid.bedrag), 'Op basis van bewijsstuk'];
    if (Number.isFinite(x.beleid.indicatie)) return [bedrag(x.beleid.indicatie), 'Indicatie'];
    const voorbeeld = oefenVoorbeeld(d, x.id);
    if (voorbeeld) return [bedrag(voorbeeld.bedrag), 'Fictieve oefenverklaring'];
    return ['Nog te bepalen', x.beleid.methode === 'extern' ? 'Bewijsstuk of bankbeoordeling nodig' : ''];
  }
  if (x.invoerBlokkeert) return ['Nog te bepalen', 'Invoer aanvullen'];
  return [bedrag(x.toetsinkomen), x.bron === 'geen' ? 'Vastgesteld inkomen € 0' : 'Berekend toetsinkomen'];
}

export function analyseBedragVoorDossier(d, uitkomst) {
  const [waarde, herkomst] = analyseUitkomst(d, uitkomst);
  return herkomst === 'Berekend toetsinkomen' || !herkomst ? waarde : `${waarde} · ${herkomst}`;
}

function analyseRij(d, x, compact) {
  const [waarde, herkomst] = analyseUitkomst(d, x);
  const oordeel = x.fout ? pil('attentie', 'Rekenfout') : resultaatOordeel(x.status, x.beleid, x.invoerBlokkeert);
  const details = x.fout ? [x.fout] : [...new Set([...(x.nok || []), ...(x.toelichtingen || []), ...(x.stappen || [])])];
  const kernreden = details[0];
  const overige = details.slice(1);
  const uitleg = `${kernreden ? `<p class="reken-kernreden">${esc(kernreden)}</p>` : ''}
    ${overige.length ? `<details class="stappen reken-analyse-uitleg"><summary>Overige aandachtspunten</summary><ul>${overige.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}`;
  const box1 = !x.beleid && x.invoerBlokkeert ? BEDRAG_LEEG : bedrag(x.box1);
  const box2 = !x.beleid && x.invoerBlokkeert ? BEDRAG_LEEG : bedrag(x.box2);
  return `<tr data-analysekader="${esc(x.id)}"><th scope="row">${esc(x.kort)}<small>${esc(x.versie || '')}</small></th>
    ${compact ? '' : `<td>${oordeel}</td>`}<td class="num">${esc(box1)}</td><td class="num">${esc(box2)}</td>
    <td class="num"><strong>${esc(waarde)}</strong>${herkomst ? `<small>${esc(herkomst)}</small>` : ''}</td>${compact ? '' : `<td>${uitleg}</td>`}</tr>`;
}

export function renderAnalyseTabel(d, uitkomsten = vergelijkKaders(d), { compact = false } = {}) {
  return `<div class="scroll" data-inkomensanalyse><table class="tabel reken-tabel reken-analysetabel">
      <thead><tr><th scope="col">Toetskader</th>${compact ? '' : '<th scope="col">Oordeel</th>'}<th scope="col" class="num">Box 1</th><th scope="col" class="num">Box 2</th><th scope="col" class="num">Jaarinkomen</th>${compact ? '' : '<th scope="col">Onderbouwing</th>'}</tr></thead>
      <tbody>${uitkomsten.map((x) => analyseRij(d, x, compact)).join('')}</tbody>
    </table></div>`;
}

function analysePaneel(d, uitkomsten, compact) {
  return `<section class="reken-paneel" id="reken-analyse" aria-labelledby="reken-analysetitel">
    <div class="reken-paneel-kop"><h3 id="reken-analysetitel">Uitkomsten per toetskader</h3><span class="reken-neutraal">${uitkomsten.length} toetskaders</span></div>
    ${renderAnalyseTabel(d, uitkomsten, { compact })}
  </section>`;
}

export function renderUitkomstentabel(d, r, { controles = false } = {}) {
  const jaren = [...new Set([...r.T, ...(r.C ? [r.C] : [])])].sort((a, b) => a - b);
  return `<section class="reken-paneel uitkomsten" aria-label="Uitkomsten per onderneming">
    <div class="reken-paneel-kop"><div><h2>Uitkomsten per onderneming</h2><p class="reken-neutraal">Open een onderneming voor de jaarcijfers en rekenstappen.</p></div></div>
    ${renderInkomenTabel(d, r)}${persoonlijkeCijfers(d, jaren, r.C)}
  </section>${r.inkomensanalyse ? analysePaneel(d, vergelijkKaders(d), !controles) : ''}`;
}

export function renderOndernemingBerekening(d, r, a, { details = '', weergave = '' } = {}) {
  if (!a) return renderRekenwerkruimte(d, r);
  const bron = (d.ondernemingen || []).find((o) => o.id === a.id);
  const jaren = [...new Set([...r.T, ...(r.C ? [r.C] : [])])].sort((x, y) => x - y);
  return `<div class="berekening rekenwerkruimte${ui.formules ? '' : ' zonder-formules'}">
    <section class="reken-paneel"${r.inkomensanalyse ? '' : ` data-beoordelingskader="${esc(r.kader)}"`}>
      <div class="reken-paneel-kop"><div>${linkNaar(d, 'berekening', 'Alle uitkomsten')}<h2>${esc(a.naam)}</h2>${r.inkomensanalyse ? '' : `<p class="reken-neutraal">${esc(r.kaderCfg.kort)} · ${esc(r.kaderVersie)}</p>`}</div>
      ${linkNaar(d, 'invoer', 'Cijfers bewerken', { ondId: a.id })}</div>
    </section>
    ${renderOndernemingInkomen(d, r, a)}
    <details class="stappen reken-uitklap"><summary>Onderliggende jaarcijfers</summary><div class="reken-uitklap-inhoud">${jaarTabelBedrijf(a, bron, jaren, r.C)}</div></details>
    ${r.inkomensanalyse ? `<section class="reken-paneel"><h2>Uitkomsten voor het dossier</h2><p>De kaders berekenen een dossieruitkomst. Voor meerdere ondernemingen is die niet altijd aan één onderneming toe te rekenen.</p>${renderAnalyseTabel(d, undefined, { compact: true })}</section>` : `<section class="reken-paneel"><div class="reken-paneel-kop"><h2>Rekenstappen</h2>${weergave}</div>${renderTrace({ ...a.trace, secties: (a.trace?.secties || []).filter((s) => !['controles', 'voorwaarden'].includes(s.groep)) })}${r.beleid ? `<details class="stappen reken-uitklap"><summary>Berekening volgens ${esc(r.kaderCfg.kort)}</summary><div class="reken-uitklap-inhoud">${renderTrace({ ...r.trace, secties: (r.trace?.secties || []).filter((s) => s.groep === 'inkomen') })}</div></details>` : ''}${details}</section>`}
  </div>`;
}

export function renderRekenwerkruimte(d, r, { berekend = false } = {}) {
  return `<div class="berekening rekenwerkruimte${ui.formules ? '' : ' zonder-formules'}">
    ${renderRekenkeuzes(d, r, berekend)}
    ${berekend ? `<div id="rekenresultaten" class="rekenwerkruimte">${renderRekenUitkomst(d, r)}${r.inkomensanalyse ? analysePaneel(d, vergelijkKaders(d), true) : renderRekenBronvergelijking(d, r)}</div>` : ''}
  </div>`;
}
