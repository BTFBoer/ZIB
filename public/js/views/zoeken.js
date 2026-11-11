// Snelzoeken (Ctrl+K): spring direct naar een dossier, een tabblad van het open dossier, een pagina of een actie.
import { esc, naamAanvrager } from '../util.js';
import { lijst, get } from '../state.js';
import { DOSSIER_STATUSSEN } from '../schema/fields.js';
import { zoekItems } from '../lijsten.js';
import { MENU_HOOFD, MENU_MEER, MENU_ACCOUNT } from './layout.js';
import { icoon } from './ui.js';
import { ui } from './uistate.js';

const GROEP_ICOON = { 'Dit dossier': 'pijl', 'Recent geopend': 'klok', Dossiers: 'persoon', "Pagina's": 'document', Acties: 'plus' };
const GROEP_VOLGORDE = ['Dit dossier', 'Recent geopend', 'Dossiers', "Pagina's", 'Acties'];

function dossierItem(d, groep = 'Dossiers') {
  const adv = get(d.advieskantoorId);
  const onds = d.ondernemingen || [];
  return {
    groep,
    titel: naamAanvrager(d.aanvrager) || '(naamloos)',
    sub: [d.nummer, DOSSIER_STATUSSEN[d.status] || d.status, onds[0]?.naam].filter(Boolean).join(' · '),
    zoek: [d.nummer, d.leningnummer, d.aanvrager?.woonplaats, adv?.naam, d.behandelaar, ...onds.map((o) => `${o.naam || ''} ${o.kvk || ''}`)].join(' '),
    href: `#/dossier/${d.id}`,
  };
}

/** Alles waarin gezocht kan worden. `dossier` en `tabs` gelden voor het dossier dat nu open staat. */
export function zoekIndex({ dossier = null, tabs = [] } = {}) {
  const items = [];
  if (dossier) {
    tabs.forEach(([k, label]) => items.push({
      groep: 'Dit dossier', titel: label, sub: `${naamAanvrager(dossier.aanvrager)} · ${dossier.nummer || ''}`, zoek: `ga naar ${label}`, href: `#/dossier/${dossier.id}/${k}`,
    }));
  }
  lijst('dossier').forEach((d) => items.push(dossierItem(d)));
  [...MENU_HOOFD, ...MENU_MEER, ...MENU_ACCOUNT].filter(([, , key]) => key !== 'log-uit')
    .forEach(([href, label, , actie]) => items.push({ groep: "Pagina's", titel: label, sub: '', zoek: 'pagina menu', href: actie ? null : href, actie: actie || null }));
  items.push({ groep: 'Acties', titel: 'Nieuwe klant', sub: 'Nieuwe aanvraag aanmaken', zoek: 'toevoegen aanvraag dossier', actie: 'nieuwe-aanvraag' });
  items.push({ groep: 'Acties', titel: 'Taak toevoegen', sub: 'Nieuwe taak, los of bij een dossier', zoek: 'nieuwe taak', actie: 'nieuwe-taak' });
  items.push({ groep: 'Acties', titel: 'Afgeronde aanvragen', sub: 'Afgeronde, afgewezen en geannuleerde dossiers', zoek: 'klanten afgerond', href: '#/klanten/afgerond' });
  return items;
}

function treffers(index, vraag, dossier) {
  if (!vraag.trim()) {
    const recent = ui.recent.map((id) => get(id)).filter((d) => d && d.id !== dossier?.id).slice(0, 5).map((d) => dossierItem(d, 'Recent geopend'));
    return [...index.filter((x) => x.groep === 'Dit dossier'), ...recent, ...index.filter((x) => x.groep === "Pagina's" || x.groep === 'Acties')];
  }
  const gevonden = zoekItems(index, vraag, 14);
  return GROEP_VOLGORDE.flatMap((g) => gevonden.filter((x) => x.groep === g));
}

function lijstHTML(items, actief) {
  if (!items.length) return '<div class="palet-leeg">Niets gevonden. Zoek op naam, dossiernummer, aanvraagnummer, onderneming of KvK-nummer.</div>';
  let groep = '';
  return items.map((x, i) => {
    const kop = x.groep !== groep ? `<div class="palet-groep">${esc(x.groep)}</div>` : '';
    groep = x.groep;
    return `${kop}<div class="palet-item${i === actief ? ' actief' : ''}" role="option" id="palet-item-${i}" aria-selected="${i === actief}" data-i="${i}">
      ${icoon(GROEP_ICOON[x.groep] || 'pijl')}<span class="palet-titel">${esc(x.titel)}</span>${x.sub ? `<span class="palet-sub">${esc(x.sub)}</span>` : ''}</div>`;
  }).join('');
}

export function sluitZoeken() {
  document.getElementById('palet')?.remove();
}

/**
 * Opent het zoekvenster. `voerUit(actie)` start een actie (zoals "Nieuwe klant"); navigeren gaat via de hash.
 */
export function openZoeken({ dossier = null, tabs = [], voerUit = () => {} } = {}) {
  sluitZoeken();
  const index = zoekIndex({ dossier, tabs });
  let items = treffers(index, '', dossier);
  let actief = 0;
  const el = document.createElement('div');
  el.className = 'palet-achter';
  el.id = 'palet';
  el.innerHTML = `<div class="palet" role="dialog" aria-modal="true" aria-label="Zoeken">
    <div class="palet-invoer">${icoon('zoek')}<input id="palet-zoek" type="search" autocomplete="off" spellcheck="false"
      placeholder="Zoek een dossier, onderneming, pagina of actie" aria-label="Zoeken" role="combobox" aria-expanded="true" aria-controls="palet-lijst"></div>
    <div class="palet-lijst" id="palet-lijst" role="listbox" aria-label="Resultaten">${lijstHTML(items, actief)}</div>
    <div class="palet-voet"><span><kbd>↑</kbd><kbd>↓</kbd> kiezen</span><span><kbd>Enter</kbd> openen</span><span><kbd>Esc</kbd> sluiten</span></div>
  </div>`;
  document.body.appendChild(el);
  const invoer = el.querySelector('#palet-zoek');
  const lijstEl = el.querySelector('#palet-lijst');
  const teken = () => {
    lijstEl.innerHTML = lijstHTML(items, actief);
    invoer.setAttribute('aria-activedescendant', items.length ? `palet-item-${actief}` : '');
    lijstEl.querySelector('.palet-item.actief')?.scrollIntoView({ block: 'nearest' });
  };
  const kies = (item) => {
    if (!item) return;
    sluitZoeken();
    if (item.actie) voerUit(item.actie);
    else if (item.href) location.hash = item.href;
  };
  invoer.addEventListener('input', () => { items = treffers(index, invoer.value, dossier); actief = 0; teken(); });
  invoer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); actief = Math.min(items.length - 1, actief + 1); teken(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); actief = Math.max(0, actief - 1); teken(); }
    else if (e.key === 'Enter') { e.preventDefault(); kies(items[actief]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sluitZoeken(); }
  });
  lijstEl.addEventListener('click', (e) => {
    const rij = e.target.closest('.palet-item');
    if (rij) kies(items[Number(rij.dataset.i)]);
  });
  lijstEl.addEventListener('mousemove', (e) => {
    const rij = e.target.closest('.palet-item');
    if (rij && Number(rij.dataset.i) !== actief) {
      actief = Number(rij.dataset.i);
      lijstEl.querySelectorAll('.palet-item').forEach((x) => x.classList.toggle('actief', Number(x.dataset.i) === actief));
    }
  });
  el.addEventListener('mousedown', (e) => { if (e.target === el) sluitZoeken(); });
  invoer.focus();
}
