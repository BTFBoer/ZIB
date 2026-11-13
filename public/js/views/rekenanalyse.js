import { BELEID_PER_ID } from '../engine/beleid.js';
import { rekenGrondslagVoorKader } from '../engine/reken-grondslag.js';
import { esc, fmt } from '../util.js';
import { beleidInvoer } from './beleid.js';
import { kerninvoerPad } from './kerninvoer.js';
import { icoon, pil } from './ui.js';

const LEEG = '—';
let openKader = null;
let extraKeuzes = () => '';

function toonWaarde(waarde, type) {
  if (waarde === null || waarde === undefined || waarde === '') return LEEG;
  if (typeof waarde === 'boolean') return waarde ? 'Ja' : 'Nee';
  if (type === 'datum') return fmt.datum(waarde) || LEEG;
  if (Number.isFinite(waarde)) {
    if (type === 'pct') return fmt.pct(waarde);
    if (type === 'ratio') return fmt.ratio(waarde);
    const decimalen = Number.isInteger(waarde) ? 0 : 2;
    return ['eur', 'bedrag'].includes(type) ? fmt.eur(waarde, decimalen) : fmt.getal(waarde, decimalen);
  }
  return String(waarde);
}

function waardecel(waarde, type) {
  return `<td class="${Number.isFinite(waarde) ? 'num' : ''}">${esc(toonWaarde(waarde, type))}</td>`;
}

function tabel(label, kolommen, rijen) {
  return `<div class="scroll"><table class="tabel reken-tabel reken-analyse-detailtabel" aria-label="${esc(label)}"><thead><tr>${kolommen.map((k) => `<th scope="col">${esc(k)}</th>`).join('')}</tr></thead><tbody>${rijen.join('')}</tbody></table></div>`;
}

function uitklap(label, inhoud) {
  return `<details class="stappen reken-uitklap"><summary>${esc(label)}</summary><div class="reken-uitklap-inhoud">${inhoud}</div></details>`;
}

function uitleg(tekst) {
  return `<p class="reken-neutraal">${esc(tekst)}</p>`;
}

function bronLink(bron) {
  const naam = [bron?.titel, bron?.versie].filter(Boolean).join(' · ');
  const url = bron?.url || '';
  return `${naam ? `<span>${esc(naam)}</span>` : ''}${/^https:\/\//i.test(url) ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Beleidsbron openen</a>` : ''}`;
}

function invoerLink(d, punt) {
  if (punt.bind?.startsWith('beleidsinvoer.')) return 'Bij Beleidsinvoer in dit toetskader';
  const tab = punt.paneel || (punt.pad?.startsWith('ib.') ? 'ib' : punt.ondId ? 'invoer' : 'klant');
  const labels = { klant: 'Klantgegevens', invoer: 'Cijfers invoeren', ib: 'IB-aangifte', documenten: 'Documenten', fiat: 'Fiattering' };
  return labels[tab] ? `<a href="${esc(kerninvoerPad(d, tab, punt.ondId, punt.bind || punt.pad))}">${labels[tab]}</a>` : '';
}

function uitkomstTabel(r) {
  const u = r.uitkomst;
  const rijen = [
    ['Berekende indicatie', u.indicatie], ['Berekend bedrag volgens dit kader', u.indicatie === null ? u.berekend : null],
    ['Box 1 in de berekening', u.box1], ['Box 2 in de berekening', u.box2], ['Toetsinkomen', u.toetsinkomen],
    ['Vastgesteld inkomen', u.vastgesteld],
  ].filter(([label, waarde]) => label === 'Toetsinkomen' || Number.isFinite(waarde));
  if (Number.isFinite(u.referentie?.bedrag)) {
    const methode = u.referentie.methode === 'verticaal' ? 'verticaal' : 'horizontaal';
    rijen.splice(-1, 0, [`Herberekening ABN-bronwerkmap · ${methode}`, u.referentie.bedrag]);
  }
  return tabel('Bedragen en uitkomst', ['Uitkomst', 'Per jaar'], rijen.map(([label, waarde]) => `<tr><th scope="row">${esc(label)}</th>${waarde === null ? '<td>Nog te beoordelen</td>' : waardecel(waarde, 'eur')}</tr>`));
}

function groepeer(rijen, sleutel) {
  const groepen = new Map();
  for (const rij of rijen) {
    const naam = sleutel(rij);
    if (!groepen.has(naam)) groepen.set(naam, []);
    groepen.get(naam).push(rij);
  }
  return groepen;
}

export function renderRekenAnalyseDetail(d, r, beleid = '') {
  const parameters = r.parameters.map((p) => `<tr><th scope="row">${esc(p.label)}</th>${waardecel(p.waarde, p.type)}<td>${esc(p.toelichting || '')}</td></tr>`);
  const jaren = r.perJaar.map((j) => `<tr><th scope="row">${esc(j.jaar)}${j.controlejaar ? ' · controlejaar' : ''}</th>${waardecel(j.waarde, j.type)}</tr>`);
  const bron = bronLink(r.bron);
  const ontbreekt = r.ontbreekt.map((x) => `<tr><th scope="row">${esc(x.label)}${x.onderneming ? `<small>${esc(x.onderneming)}</small>` : ''}</th><td>${esc(x.jaren?.join(', ') || LEEG)}</td><td>${esc(x.melding || (x.blokkeert ? 'Nodig voor de uitkomst' : 'Ter controle'))}</td><td>${invoerLink(d, x)}</td></tr>`);
  const voorwaarden = (r.voorwaarden || []).map((v) => `<tr><td>${pil(v.status || 'info')}</td><td>${esc(v.tekst || v.label || LEEG)}</td></tr>`);
  const invoer = [...groepeer(r.invoer, (x) => x.onderneming || (x.pad?.startsWith('beleidsinvoer.') ? 'Beleidsinvoer' : 'Aanvragerniveau')).entries()]
    .map(([naam, regels]) => uitklap(naam, tabel(`Invoercellen · ${naam}`, ['Invoercel', 'Jaar', 'Waarde', 'Herkomst'], regels.map((x) => `<tr><th scope="row">${esc(x.label)}</th><td>${esc(x.jaar ?? LEEG)}</td>${waardecel(x.waarde, x.type)}<td>${esc(x.herkomst || LEEG)}</td></tr>`)))).join('');
  const stappen = [...groepeer(r.stappen, (x) => x.groep || 'Berekening en bron').entries()]
    .map(([naam, regels]) => uitklap(naam, tabel(`Rekenstappen · ${naam}`, ['Stap', 'Jaar / kolom', 'Berekening of bron', 'Rekenwaarde'], regels.map((x) => `<tr><th scope="row">${esc(x.label)}</th><td>${esc(x.kolom ?? LEEG)}</td><td>${esc(x.formule || LEEG)}</td>${waardecel(x.uitkomst, x.type)}</tr>`)))).join('');
  const regels = [...r.regels, ...r.aannames];
  return `<div class="reken-analyse-detail">
    <div class="reken-analyse-detailkop"><div><h4>Rekenwaarden en onderbouwing</h4><p class="reken-neutraal">${esc(r.methodeLabel)} · Peildatum ${esc(fmt.datum(r.peildatum))}${r.jaren.length ? ` · Jaren ${esc(r.jaren.join(', '))}` : ''}</p></div>${beleid ? `<button type="button" class="knop sec klein reken-analyse-herbereken" data-actie="dossier-berekenen">Opnieuw berekenen</button>` : ''}</div>
    ${uitkomstTabel(r)}
    ${r.uitkomst.bewijs ? `<p class="reken-neutraal">Bewijsstuk ${esc(r.uitkomst.bewijs.opsteller)} · ${esc(fmt.datum(r.uitkomst.bewijs.datum))}</p>` : ''}
    ${bron ? `<p class="reken-analyse-bron">${bron}</p>` : ''}
    ${beleid}
    ${ontbreekt.length ? uitklap(`Ontbrekende invoer (${ontbreekt.length})`, tabel('Ontbrekende invoer', ['Veld', 'Jaar', 'Onderbouwing nodig', 'Invoer'], ontbreekt)) : ''}
    ${voorwaarden.length ? uitklap('Voorwaarden en oordeel van dit toetskader', tabel('Voorwaarden en oordeel', ['Status', 'Toelichting'], voorwaarden)) : ''}
    ${uitklap('Methode, keuzes en drempels', (parameters.length ? tabel('Keuzes en drempels', ['Keuze / norm', 'Waarde', 'Toelichting'], parameters) : '') + (regels.length ? `<ul class="reken-analyse-regels">${regels.map((regel) => `<li>${esc(regel)}</li>`).join('')}</ul>` : '') || uitleg('Voor dit kader zijn geen lokale drempels geregistreerd.'))}
    ${uitklap('Jaarwaarden van dit toetskader', jaren.length ? tabel('Jaarwaarden', ['Jaar', 'Bedrag'], jaren) : uitleg('Er zijn nog geen bruikbare jaaruitkomsten voor dit toetskader.'))}
    ${uitklap('Ingevoerde celwaarden', invoer || uitleg('Er zijn geen beschikbare invoercellen voor deze jaren.'))}
    ${uitklap('Rekenstappen en rekenwaarden', stappen || uitleg('Deze route levert met de huidige invoer geen lokale rekenstappen op.'))}
  </div>`;
}

export function analyseUitklapKnop(d, id, label) {
  const doel = `analyse-${d.id}-${id}`;
  return `<button type="button" class="knop link klein reken-analyse-open" data-analyse-open="${esc(id)}" aria-expanded="false" aria-controls="${esc(doel)}"><span class="sr">${esc(label)} </span>Rekenwaarden ${icoon('open')}</button>`;
}

export function analyseUitklapRij(d, id, kolommen) {
  return `<tr class="reken-analyse-uitklaprij" id="${esc(`analyse-${d.id}-${id}`)}" hidden><td colspan="${kolommen}" data-analyse-inhoud></td></tr>`;
}

function openAnalyse(d, knop, { onthouden = true } = {}) {
  const rij = document.getElementById(knop.getAttribute('aria-controls'));
  if (!rij) return;
  const tabel = knop.closest('table');
  const openen = knop.getAttribute('aria-expanded') !== 'true';
  const id = knop.dataset.analyseOpen;
  for (const open of tabel.querySelectorAll('[data-analyse-open][aria-expanded="true"]')) {
    open.setAttribute('aria-expanded', 'false');
    const vorige = document.getElementById(open.getAttribute('aria-controls'));
    if (vorige) vorige.hidden = true;
  }
  if (onthouden) openKader = openen ? { dossierId: d.id, id } : null;
  if (!openen) return;
  const inhoud = rij.querySelector('[data-analyse-inhoud]');
  if (tabel.closest('[data-verouderd]') && !inhoud.querySelector('.reken-analyse-detail')) {
    inhoud.innerHTML = `<div class="reken-analyse-detail">${uitleg('De keuzes zijn gewijzigd. Bereken opnieuw om de rekenwaarden te vernieuwen.')}<button type="button" class="knop sec klein" data-actie="dossier-berekenen">Opnieuw berekenen</button></div>`;
  } else if (!inhoud.querySelector('.reken-analyse-detail')) {
    try {
      const detail = rekenGrondslagVoorKader(d, id);
      const profiel = BELEID_PER_ID[id];
      const invoer = profiel ? beleidInvoer(d, { kaderCfg: { beleid: profiel }, beleid: { methode: detail.methode, versie: detail.bron.versie, bronUrl: detail.bron.url } }, { analyse: true }) : extraKeuzes(d, id, detail);
      inhoud.innerHTML = renderRekenAnalyseDetail(d, detail, invoer);
    } catch (error) {
      inhoud.textContent = `De rekenwaarden zijn niet beschikbaar. ${error?.message || ''}`;
    }
  }
  rij.hidden = false;
  knop.setAttribute('aria-expanded', 'true');
}

export function initRekenAnalyse(haalDossier, renderExtraKeuzes = () => '') {
  extraKeuzes = renderExtraKeuzes;
  document.addEventListener('click', (event) => {
    const knop = event.target.closest?.('[data-analyse-open]');
    if (!knop) return;
    const d = haalDossier();
    if (d) openAnalyse(d, knop);
  });
}

export function herstelRekenAnalyse(d) {
  if (!d || openKader?.dossierId !== d.id) return;
  const knop = [...document.querySelectorAll('[data-analyse-open]')].find((el) => el.dataset.analyseOpen === openKader.id);
  if (knop && knop.getAttribute('aria-expanded') !== 'true') openAnalyse(d, knop, { onthouden: false });
}
