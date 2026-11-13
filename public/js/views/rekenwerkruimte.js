import { vergelijkKaders } from '../engine/index.js';
import { heeftBedrag, heeftResultaatVoorBelasting } from '../engine/financieel.js';
import { esc, fmt } from '../util.js';
import { icoon, pil } from './ui.js';
import { kerninvoerPad } from './kerninvoer.js';
import { analyseUitklapKnop, analyseUitklapRij } from './rekenanalyse.js';
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
    if (x.beleid.bewijs && Number.isFinite(x.beleid.bedrag)) return [bedrag(x.beleid.bedrag), x.status === 'niet_akkoord' ? 'Bronbedrag · voorwaarden niet akkoord' : 'Op basis van bewijsstuk'];
    if (Number.isFinite(x.beleid.indicatie)) return [bedrag(x.beleid.indicatie), x.beleid.methode === 'extern' ? 'Indicatie · bewijsstuk of bankbeoordeling nodig' : 'Indicatie'];
    if (x.id === 'VENN' && x.status === 'niet_akkoord') return ['Buiten het kader', 'Voorwaarden niet akkoord'];
    const voorbeeld = oefenVoorbeeld(d, x.id);
    if (voorbeeld) return [bedrag(voorbeeld.bedrag), 'Fictieve oefenverklaring'];
    return ['Nog te bepalen', x.beleid.methode === 'extern' ? (x.id === 'RABO' ? 'IKV of bankbeoordeling nodig' : 'Bewijsstuk of bankbeoordeling nodig') : 'Invoer aanvullen'];
  }
  if (Number.isFinite(x.abnVaststelling?.bedrag) && (x.invoerBlokkeert || !Number.isFinite(x.toetsinkomen))) {
    const methode = x.abnVaststelling.methode === 'verticaal' ? 'verticaal' : 'horizontaal';
    return [fmt.eur(x.abnVaststelling.bedrag, 2), `ABN-bronmodel · ${methode} · toetsinkomen open`];
  }
  if (x.invoerBlokkeert) return ['Nog te bepalen', 'Invoer aanvullen'];
  if (!Number.isFinite(x.toetsinkomen)) return ['Nog te bepalen', 'Toetsinkomen open'];
  return [bedrag(x.toetsinkomen), x.bron === 'geen' ? 'Geen inkomen afgegeven' : 'Berekend toetsinkomen'];
}

export function analyseBedragVoorDossier(d, uitkomst) {
  const [waarde, herkomst] = analyseUitkomst(d, uitkomst);
  return herkomst === 'Berekend toetsinkomen' || !herkomst ? waarde : `${waarde} · ${herkomst}`;
}

function analyseRij(d, x, compact, uitklap) {
  const [waarde, herkomst] = analyseUitkomst(d, x);
  const oordeel = x.fout ? pil('attentie', 'Rekenfout') : resultaatOordeel(x.status, x.beleid, x.invoerBlokkeert);
  const details = x.fout ? [x.fout] : [...new Set([...(x.nok || []), ...(x.toelichtingen || []), ...(x.stappen || [])])];
  const kernreden = details[0];
  const overige = details.slice(1);
  const uitleg = `${kernreden ? `<p class="reken-kernreden">${esc(kernreden)}</p>` : ''}
    ${overige.length ? `<details class="stappen reken-analyse-uitleg"><summary>Overige aandachtspunten</summary><ul>${overige.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}`;
  const model = herkomst.startsWith('ABN-bronmodel') ? x.abnBronVergelijking : null;
  const horizontaal = model && x.abnVaststelling?.methode === 'horizontaal';
  const box1 = horizontaal ? fmt.eur(model.dga, 2) : !x.beleid && x.invoerBlokkeert ? BEDRAG_LEEG : bedrag(x.box1);
  const box2 = horizontaal ? fmt.eur(model.uitgekeerd + model.nietUitgekeerd, 2) : !x.beleid && x.invoerBlokkeert ? BEDRAG_LEEG : bedrag(x.box2);
  const toelichting = horizontaal ? '<small>Bronmodel</small>' : x.beleid && !x.beleid.bewijs && (Number.isFinite(x.box1) || Number.isFinite(x.box2)) ? '<small>Indicatie</small>' : '';
  return `<tr data-analysekader="${esc(x.id)}"><th scope="row">${esc(x.kort)}<small>${esc(x.versie || '')}</small>${uitklap ? analyseUitklapKnop(d, x.id, x.kort) : ''}</th>
    ${compact && !uitklap ? '' : `<td>${oordeel}</td>`}<td class="num">${esc(box1)}${toelichting}</td><td class="num">${esc(box2)}${toelichting}</td>
    <td class="num"><strong>${esc(waarde)}</strong>${herkomst ? `<small>${esc(herkomst)}</small>` : ''}</td>${compact ? '' : `<td>${uitleg}</td>`}</tr>${uitklap ? analyseUitklapRij(d, x.id, compact ? 5 : 6) : ''}`;
}

export function renderAnalyseTabel(d, uitkomsten = vergelijkKaders(d), { compact = false, uitklap = false } = {}) {
  return `<div class="scroll" data-inkomensanalyse><table class="tabel reken-tabel reken-analysetabel">
      <thead><tr><th scope="col">Toetskader</th>${compact && !uitklap ? '' : '<th scope="col">Oordeel</th>'}<th scope="col" class="num">Box 1</th><th scope="col" class="num">Box 2</th><th scope="col" class="num">Jaarinkomen</th>${compact ? '' : '<th scope="col">Onderbouwing</th>'}</tr></thead>
      <tbody>${uitkomsten.map((x) => analyseRij(d, x, compact, uitklap)).join('')}</tbody>
    </table></div>`;
}

function analysePaneel(d, uitkomsten, compact, uitklap = false) {
  const titel = uitklap ? 'rekenresultaten-titel' : 'reken-analysetitel';
  return `<section class="reken-paneel" id="reken-analyse" aria-labelledby="${titel}">
    <div class="reken-paneel-kop"><div><h3 id="${titel}"${uitklap ? ' tabindex="-1"' : ''}>Uitkomsten per toetskader</h3>${uitklap ? '<p class="reken-neutraal" data-analyse-status>Open de rekenwaarden per toetskader voor de keuzes, invoercellen en rekenstappen.</p>' : ''}</div><span class="reken-neutraal">${uitkomsten.length} toetskaders</span></div>
    ${renderAnalyseTabel(d, uitkomsten, { compact, uitklap })}
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
  const analyse = r.inkomensanalyse && berekend;
  return `<div class="berekening rekenwerkruimte${ui.formules ? '' : ' zonder-formules'}">
    ${renderRekenkeuzes(d, r, berekend)}
    ${berekend ? `<div id="rekenresultaten" class="rekenwerkruimte">${analyse ? analysePaneel(d, vergelijkKaders(d), true, true) : ''}${renderRekenUitkomst(d, r)}${analyse ? '' : renderRekenBronvergelijking(d, r)}</div>` : ''}
  </div>`;
}
