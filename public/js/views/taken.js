// Takenlijst per dossier, opgebouwd zoals "Alle Taken" en "Mijn Taken" in de rekensoftware: één rij per dossier
// met de eerstvolgende uiterste datum (rood = verstreken, oranje = vandaag of binnen twee dagen), het aantal taken en
// de lopende taak. Een rij klapt open naar de afzonderlijke taken om ze af te vinken.
import { esc, fmt, naamAanvrager, todayISO } from '../util.js';
import { lijst, get, state } from '../state.js';
import { DOSSIER_STATUSSEN } from '../schema/fields.js';
import { deadlineKlasse, deadlineTekst, kolomFilterPast } from '../lijsten.js';
import { paginakop, datumKort } from './layout.js';
import { icoon, statusPil, leeg } from './ui.js';
import { ui } from './uistate.js';
import { soortAanvraagTekst } from './aanvragen.js';

const ZONDER = '__zonder__';

function initialenVan(naam) {
  if (!naam) return '';
  const p = state.profiel;
  if (p?.naam === naam && p.initialen) return p.initialen;
  return naam.split(/[\s.]+/).filter(Boolean).map((x) => x[0]).join('').slice(0, 4);
}

/** Taken gegroepeerd per dossier. Met `alleenMijn` tellen alleen taken die aan de aangemelde gebruiker zijn toegewezen. */
export function takenGroepen(alleenMijn) {
  const mijn = state.profiel?.naam || '';
  const metAfgerond = ui.taken.afgerond;
  const groepen = new Map();
  lijst('taak').filter((t) => !alleenMijn || t.toegewezenAan === mijn).forEach((t) => {
    const d = t.dossierId ? get(t.dossierId) : null;
    const sleutel = d ? d.id : ZONDER;
    if (!groepen.has(sleutel)) groepen.set(sleutel, { sleutel, dossier: d, open: [], klaar: [] });
    groepen.get(sleutel)[t.status === 'gereed' ? 'klaar' : 'open'].push(t);
  });
  const opDatum = (a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'));
  return [...groepen.values()]
    .filter((g) => g.open.length || (metAfgerond && g.klaar.length))
    .map((g) => {
      g.open.sort(opDatum);
      g.klaar.sort(opDatum);
      const d = g.dossier;
      const wie = [...new Set(g.open.map((t) => t.toegewezenAan).filter(Boolean))];
      return {
        ...g,
        uiterste: g.open[0]?.deadline || '',
        wie,
        tekst: {
          naam: d ? naamAanvrager(d.aanvrager) : 'Zonder dossier',
          nr: d?.nummer || '',
          soort: d ? soortAanvraagTekst(d) : '',
          status: d ? (DOSSIER_STATUSSEN[d.status] || d.status) : '',
          uiterste: fmt.datum(g.open[0]?.deadline),
          spoed: d ? (d.spoed ? 'Ja' : 'Nee') : '',
          behandelaar: wie.map((n) => `${n} ${initialenVan(n)}`).join(' '),
          taak: [...g.open, ...(metAfgerond ? g.klaar : [])].map((t) => t.titel).join(' '),
        },
      };
    });
}

const KOLOMMEN = [
  { k: 'naam', label: 'Naam klant', filter: 'tekst', w: (g) => g.tekst.naam.toLowerCase() },
  { k: 'nr', label: 'Dossier<br>nr.', filter: 'tekst', w: (g) => g.tekst.nr },
  { k: 'soort', label: 'Soort<br>aanvraag', filter: 'tekst', w: (g) => g.tekst.soort },
  { k: 'status', label: 'Status', filter: 'keuze', w: (g) => Object.keys(DOSSIER_STATUSSEN).indexOf(g.dossier?.status) },
  { k: 'uiterste', label: 'Uiterste<br>datum taak', filter: 'tekst', w: (g) => g.uiterste || '9999' },
  { k: 'spoed', label: 'Spoed<br>dossier', filter: 'keuze', w: (g) => (g.dossier?.spoed ? 1 : 0) },
  { k: 'aantal', label: 'Aantal<br>taken', num: true, w: (g) => g.open.length },
  { k: 'behandelaar', label: 'Behan-<br>delaar', filter: 'tekst', w: (g) => g.wie.join(' ').toLowerCase() },
  { k: 'taak', label: 'Lopende taak', filter: 'tekst', w: (g) => (g.open[0]?.titel || '').toLowerCase() },
];
const KOLOM = Object.fromEntries(KOLOMMEN.map((k) => [k.k, k]));

function gefilterd(alleenMijn) {
  const f = ui.taken.filter;
  const kol = KOLOM[ui.taken.sort.kol] || KOLOM.uiterste;
  const r = ui.taken.sort.richting === 'asc' ? 1 : -1;
  return takenGroepen(alleenMijn)
    .filter((g) => kolomFilterPast(g.tekst, f))
    .sort((a, b) => {
      const x = kol.w(a);
      const y = kol.w(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * r;
      return String(x).localeCompare(String(y), 'nl') * r;
    });
}

function taakRij(t, vandaag) {
  const klaar = t.status === 'gereed';
  const klasse = klaar ? '' : deadlineKlasse(t.deadline, vandaag);
  return `<tr class="${klaar ? 'klaar' : ''}">
    <td class="sel"><input type="checkbox" aria-label="${klaar ? 'Taak weer openzetten' : 'Taak afvinken'}: ${esc(t.titel)}"${klaar ? ' checked' : ''} data-actie="taak-toggle" data-id="${esc(t.id)}"></td>
    <td class="taak-titel">${esc(t.titel)}</td>
    <td class="nowrap">${t.deadline ? `<span class="deadline ${klasse}">${esc(fmt.datum(t.deadline))}</span>` : ''}</td>
    <td>${esc(t.toegewezenAan || '')}</td>
    <td class="dempen nowrap">${esc([t.door, datumKort(t.aangemaakt)].filter(Boolean).join(', '))}</td>
    <td class="ico-kol"><button type="button" class="grid-ico gevaar" data-actie="verwijder-record" data-id="${esc(t.id)}" data-vraag="Taak verwijderen?" title="Taak verwijderen">${icoon('prullenbak')}</button></td>
  </tr>`;
}

function filterCel(k) {
  const def = KOLOM[k];
  const waarde = ui.taken.filter[k] || '';
  const naam = def.label.replace(/<br>/g, ' ');
  if (def.filter === 'tekst') return `<input type="search" class="kolomfilter" data-takenfilter="${k}" value="${esc(waarde)}" aria-label="Filter op ${esc(naam)}" autocomplete="off" spellcheck="false">`;
  if (def.filter === 'keuze') {
    const opties = k === 'status' ? Object.values(DOSSIER_STATUSSEN) : ['Ja', 'Nee'];
    return `<select class="kolomfilter" data-takenfilter="${k}" aria-label="Filter op ${esc(naam)}"><option value=""></option>
      ${opties.map((o) => `<option value="=${esc(o)}"${waarde === `=${o}` ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  return '';
}

/** Rijen en voetregel van de takenlijst (bij typen in een filter blijft de kop staan). */
export function rijenTaken(alleenMijn) {
  const groepen = gefilterd(alleenMijn);
  const vandaag = todayISO();
  const metAfgerond = ui.taken.afgerond;
  const breedte = KOLOMMEN.length + 2;
  const body = groepen.map((g) => {
    const d = g.dossier;
    const open = ui.taken.open.has(g.sleutel);
    const klasse = deadlineKlasse(g.uiterste, vandaag);
    const eerste = g.open[0];
    const alle = g.open.map((t) => `${t.deadline ? `${fmt.datum(t.deadline)}: ` : ''}${t.titel}${t.toegewezenAan ? ` (${t.toegewezenAan})` : ''}`).join('\n');
    const taken = [...g.open, ...(metAfgerond ? g.klaar : [])];
    return `<tr class="groep${open ? ' open' : ''}" data-id="${esc(g.sleutel)}">
      <td class="sel"><button type="button" class="grid-ico uitklapknop" data-actie="taken-uitklap" data-id="${esc(g.sleutel)}" aria-expanded="${open}" title="${open ? 'Taken verbergen' : 'Taken tonen en afvinken'}">${icoon(open ? 'open' : 'dicht')}</button></td>
      <td class="acties-kol nowrap">${d ? `
        <a class="grid-ico" href="#/dossier/${esc(d.id)}" title="Klantgegevens openen">${icoon('persoon')}</a>
        <a class="grid-ico" href="#/dossier/${esc(d.id)}/documenten" title="Documenten">${icoon('map')}</a>
        <a class="grid-ico" href="#/dossier/${esc(d.id)}/berekening" title="Berekening en uitkomst">${icoon('reken')}</a>` : ''}</td>
      <td class="k-naam">${d ? `<a href="#/dossier/${esc(d.id)}" class="grid-naam">${esc(g.tekst.naam)}</a>` : '<span class="dempen">Zonder dossier</span>'}</td>
      <td class="k-nr">${esc(g.tekst.nr)}</td>
      <td class="k-soort">${esc(g.tekst.soort)}</td>
      <td class="k-status">${d ? statusPil(d.status) : ''}</td>
      <td class="k-uiterste">${g.uiterste ? `<span class="deadline ${klasse}"${klasse ? ` title="${esc(deadlineTekst(g.uiterste, vandaag))}"` : ''}>${esc(fmt.datum(g.uiterste))}</span>` : ''}</td>
      <td class="k-spoed${d?.spoed ? ' spoed' : ''}">${esc(g.tekst.spoed)}</td>
      <td class="num k-aantal">${g.open.length}</td>
      <td class="k-behandelaar"><span title="${esc(g.wie.join(', '))}">${esc(g.wie.map(initialenVan).join(', '))}</span></td>
      <td class="k-taak">${eerste ? `<button type="button" class="grid-taak" data-actie="taken-uitklap" data-id="${esc(g.sleutel)}" title="${esc(alle)}"><span>${esc(eerste.titel)}</span>${g.open.length > 1 ? `<b>+${g.open.length - 1}</b>` : ''}</button>` : '<span class="dempen">Alle taken afgerond</span>'}</td>
    </tr>${open ? `<tr class="groep-taken"><td></td><td colspan="${breedte - 1}">
      <table class="taken-sub"><thead><tr><th class="sel">Klaar</th><th>Taak</th><th>Uiterste datum</th><th>Taak voor</th><th>Aangemaakt</th><th></th></tr></thead>
      <tbody>${taken.map((t) => taakRij(t, vandaag)).join('')}</tbody></table>
      ${d ? `<button type="button" class="knop link klein" data-actie="taken-dossier" data-id="${esc(d.id)}">${icoon('plus')}Taak toevoegen bij dit dossier</button>` : ''}</td></tr>` : ''}`;
  }).join('') || `<tr class="geen-rijen"><td colspan="${breedte}">Geen taken die aan de filters voldoen.
      <button type="button" class="knop sec klein" data-actie="taken-filters-wissen">Verwijder filter(s)</button></td></tr>`;
  const aantal = groepen.reduce((s, g) => s + g.open.length, 0);
  const filterAan = Object.values(ui.taken.filter).some((x) => String(x || '').trim());
  const voet = `<span class="pager-lead">${aantal} open ${aantal === 1 ? 'taak' : 'taken'} in ${groepen.length} ${groepen.length === 1 ? 'dossier' : 'dossiers'}</span>
    ${filterAan ? '<button type="button" class="knop link klein" data-actie="taken-filters-wissen">Verwijder filter(s)</button>' : ''}
    <span class="legenda"><span class="deadline te-laat">verstreken</span> <span class="deadline bijna">vandaag of binnen 2 dagen</span></span>`;
  return { body, voet };
}

export function tabelTaken(alleenMijn) {
  const { kol: sk, richting } = ui.taken.sort;
  const { body, voet } = rijenTaken(alleenMijn);
  const kop = `<tr><th class="sel"></th><th class="acties-kol"></th>${KOLOMMEN.map((k) => `<th class="k-${k.k}${k.num ? ' num' : ''}${k.k === sk ? ` gesorteerd ${richting}` : ''}"${k.k === sk ? ` aria-sort="${richting === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-actie="taken-sorteer" data-kol="${k.k}" title="Sorteren">${k.label}</button></th>`).join('')}</tr>`;
  const filterrij = `<tr class="filterrij"><th class="sel"></th><th class="acties-kol">${icoon('filter', 'Filter per kolom')}</th>${KOLOMMEN.map((k) => `<th class="k-${k.k}">${k.filter ? filterCel(k.k) : ''}</th>`).join('')}</tr>`;
  return `<div class="scroll"><table class="grid taken-grid"><thead>${kop}${filterrij}</thead><tbody id="taken-body">${body}</tbody></table></div>
    <div class="pager" id="taken-voet">${voet}</div>`;
}

export function renderTaken(alleenMijn) {
  const mijn = state.profiel?.naam || '';
  const alle = lijst('taak').filter((t) => !alleenMijn || t.toegewezenAan === mijn);
  const open = alle.filter((t) => t.status !== 'gereed');
  const vandaag = todayISO();
  const telaat = open.filter((t) => deadlineKlasse(t.deadline, vandaag) === 'te-laat').length;
  const bijna = open.filter((t) => deadlineKlasse(t.deadline, vandaag) === 'bijna').length;
  const sub = `${alleenMijn ? `Taken toegewezen aan ${esc(mijn || 'jou')}: ` : ''}${open.length} open${telaat ? `, waarvan <span class="deadline te-laat">${telaat} verstreken</span>` : ''}${bijna ? ` en <span class="deadline bijna">${bijna} binnen 2 dagen</span>` : ''}`;
  const acties = `<label class="check"><input type="checkbox" data-actie="taken-afgerond"${ui.taken.afgerond ? ' checked' : ''}><span>Toon afgeronde taken</span></label>
    <button class="knop" data-actie="nieuwe-taak">${icoon('plus')}Taak toevoegen</button>`;
  const heeft = alle.length > 0;
  return `${paginakop(alleenMijn ? 'Mijn Taken' : 'Alle Taken', sub, acties)}
    <div class="grid-paneel los">${heeft ? `<div id="taken-tabel">${tabelTaken(alleenMijn)}</div>` : leeg(alleenMijn ? 'Je hebt geen taken.' : 'Er zijn geen taken.', '<button class="knop" data-actie="nieuwe-taak">Taak toevoegen</button>')}</div>`;
}
