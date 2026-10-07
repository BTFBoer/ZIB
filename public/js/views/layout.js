import { esc, fmt } from '../util.js';
import { state } from '../state.js';

// Hoofdmenu in de volgorde van de rekensoftware. "Klanten" is het overzicht van de aanvragen.
export const MENU = [
  ['#/klanten', 'Klanten', 'klanten'],
  ['#/documenten', 'Documenten', 'documenten'],
  ['#/advieskantoren', 'Advieskantoren', 'advieskantoren'],
  ['#/taken', 'Alle Taken', 'taken'],
  ['#/mijn-taken', 'Mijn Taken', 'mijn-taken'],
  ['#/hulp', 'Hulp nodig?', 'hulp'],
  ['#/meekijken', 'Meekijken', 'meekijken'],
  ['#/faq', 'FAQ', 'faq'],
  ['#/downloads', 'Downloads', 'downloads'],
  ['#/tickets', 'Tickets', 'tickets'],
  ['#/e-mail', 'E-mail versturen', 'e-mail', 'email-versturen'],
  ['#/mijn-gegevens', 'Mijn gegevens', 'mijn-gegevens'],
];

export function opslagStatusHTML() {
  const s = state.opslag;
  const tekst = {
    opgeslagen: s.tijd ? `Opgeslagen ${String(s.tijd.getHours()).padStart(2, '0')}:${String(s.tijd.getMinutes()).padStart(2, '0')}` : 'Opgeslagen',
    bezig: 'Opslaan…',
    fout: 'Opslaan mislukt',
    conflict: 'Conflict',
  }[s.status] || '';
  return `<span class="opslagstatus ${esc(s.status)}" title="${esc(s.fout || '')}"><i></i>${esc(tekst)}</span>`;
}

export function balk(actief) {
  const p = state.profiel;
  const modus = state.modus === 'cloud' ? 'Cloud' : 'Lokaal';
  return `<header class="balk"><div class="balk-binnen">
    <a class="woordmerk" href="#/klanten" title="Nieuwe en lopende aanvragen"><b>ZIB</b><span>Zakelijk inkomen</span></a>
    <nav class="menu" aria-label="Hoofdmenu">
      ${MENU.map(([href, label, key, actie]) => `<a href="${href}" class="${key === actief ? 'actief' : ''}"${actie ? ` data-actie="${actie}"` : ''}>${esc(label)}</a>`).join('')}
      <a href="#/log-uit" data-actie="log-uit">Log uit</a>
    </nav>
    <div class="balk-rechts">
      <span id="opslagstatus">${opslagStatusHTML()}</span>
      <span class="modus-label" title="${esc(state.adapter?.omschrijving || '')}">${modus}</span>
      <span class="wie" title="${esc(p?.naam || '')}${p?.accreditatie ? ` (${esc(p.accreditatie)})` : ''}">${esc(p?.initialen || p?.naam || '')}</span>
    </div>
  </div></header>`;
}

export function banners() {
  const out = [];
  if (state.waarschuwing) out.push(`<div class="melding niet_akkoord">${esc(state.waarschuwing)}</div>`);
  if (state.modus === 'lokaal') {
    const verborgen = (() => { try { return sessionStorage.getItem('zib.banner.lokaal') === '1'; } catch { return false; } })();
    if (!verborgen) {
      out.push(`<div class="melding info">Lokale modus: gegevens staan alleen in deze browser. Maak regelmatig een back-up via Downloads, of koppel de cloudopslag (zie README).
        <button class="knop link klein" data-actie="verberg-banner">Verbergen</button></div>`);
    }
  }
  if (state.opslag.status === 'fout') {
    out.push(`<div class="melding niet_akkoord">Opslaan mislukt: ${esc(state.opslag.fout)}. Je wijzigingen staan nog in dit venster; probeer het opnieuw of maak een back-up.
      <button class="knop klein" data-actie="opnieuw-opslaan">Opnieuw opslaan</button></div>`);
  }
  if (state.conflict) {
    out.push(`<div class="melding attentie">Dit record is intussen door ${esc(state.conflict.huidig?.updated_by || 'iemand anders')} gewijzigd.
      <button class="knop klein" data-actie="conflict-herladen">Hun versie laden</button>
      <button class="knop sec klein" data-actie="conflict-overschrijven">Mijn versie bewaren</button></div>`);
  }
  return out.length ? `<div class="banner geen-print">${out.join('')}</div>` : '';
}

export function paginakop(titel, sub = '', acties = '') {
  return `<div class="paginakop"><div><h1>${esc(titel)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${acties ? `<div class="acties">${acties}</div>` : ''}</div>`;
}

export function datumKort(iso) {
  return iso ? fmt.datum(String(iso).slice(0, 10)) : '';
}
