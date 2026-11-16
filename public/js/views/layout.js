import { esc, fmt, todayISO } from '../util.js';
import { state, lijst } from '../state.js';
import { drive } from '../store/drive.js';
import { icoon } from './ui.js';

// Hoofdmenu in de volgorde van de rekensoftware. "Klanten" is het overzicht van de aanvragen.
// De dagelijkse onderdelen staan in de balk; de overige onder "Meer", zodat het menu ook op een laptop past.
export const MENU_HOOFD = [
  ['#/klanten', 'Aanvragen', 'klanten'],
  ['#/documenten', 'Documenten', 'documenten'],
  ['#/advieskantoren', 'Advieskantoren', 'advieskantoren'],
  ['#/taken', 'Alle Taken', 'taken'],
  ['#/mijn-taken', 'Mijn Taken', 'mijn-taken'],
  ['#/toetskaders', 'Toetskaders', 'toetskaders'],
];
export const MENU_MEER = [
  ['#/hulp', 'Hulp nodig?', 'hulp'],
  ['#/meekijken', 'Meekijken', 'meekijken'],
  ['#/faq', 'FAQ', 'faq'],
  ['#/downloads', 'Downloads', 'downloads'],
  ['#/tickets', 'Tickets', 'tickets'],
  ['#/e-mail', 'E-mail versturen', 'e-mail', 'email-versturen'],
];
export const MENU_ACCOUNT = [
  ['#/mijn-gegevens', 'Mijn gegevens', 'mijn-gegevens'],
  ['#/log-uit', 'Log uit', 'log-uit', 'log-uit'],
];
export const MENU = [...MENU_HOOFD, ...MENU_MEER, ...MENU_ACCOUNT];

/** Open taken van de aangemelde gebruiker: aantal en of er een verlopen is (voor het bolletje bij Mijn Taken). */
export function mijnOpenTaken() {
  const mijn = state.profiel?.naam || '';
  const vandaag = todayISO();
  const open = lijst('taak').filter((t) => t.status !== 'gereed' && mijn && t.toegewezenAan === mijn);
  return { aantal: open.length, telaat: open.some((t) => t.deadline && t.deadline < vandaag) };
}

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

const uurMinuut = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Status van de Google Drive-opslag (alleen in de ingesloten demo). */
export function driveStatusHTML() {
  if (!globalThis.ZIB_ARTIFACT || !drive.beschikbaar) return '';
  const tekst = drive.status === 'bezig' ? 'Drive…'
    : drive.status === 'ok' ? `Drive ${drive.laatst ? uurMinuut(drive.laatst) : ''}`.trim()
      : drive.status === 'fout' ? 'Drive: fout' : 'Drive uit';
  const titel = drive.status === 'ok' ? `Bewaard in Google Drive (${drive.bestand})`
    : drive.status === 'fout' ? drive.melding : drive.status === 'bezig' ? 'Bezig met Google Drive' : 'Google Drive is niet gekoppeld';
  const klasse = { ok: 'opgeslagen', bezig: 'bezig', fout: 'fout' }[drive.status] || 'uit';
  return `<a class="opslagstatus drivestatus ${klasse}" href="#/downloads" title="${esc(titel)}" aria-label="${esc(titel)}"><i></i><span class="tekst">${esc(tekst)}</span></a>`;
}

function menuLink([href, label, key, actie], actief, extra = '') {
  return `<a href="${href}" class="${key === actief ? 'actief' : ''}"${key === actief ? ' aria-current="page"' : ''}${actie ? ` data-actie="${actie}"` : ''}>${esc(label)}${extra}</a>`;
}

export function balk(actief) {
  const p = state.profiel;
  const opslag = state.modus === 'cloud' ? 'Cloudopslag' : 'Lokale opslag (deze browser)';
  const taken = mijnOpenTaken();
  const teller = taken.aantal ? `<span class="menu-teller${taken.telaat ? ' te-laat' : ''}" title="${taken.aantal} open ${taken.aantal === 1 ? 'taak' : 'taken'}${taken.telaat ? ', waarvan verlopen' : ''}">${taken.aantal}</span>` : '';
  const extra = (key) => (key === 'mijn-taken' ? teller : '');
  const meerActief = MENU_MEER.some(([, , key]) => key === actief);
  return `<header class="balk"><div class="balk-binnen">
    <a class="woordmerk" href="#/klanten" title="Naar aanvragen"><span class="woordmerk-teken" aria-hidden="true">${icoon('reken')}</span><span class="woordmerk-tekst"><b>ZIB</b><span>Zakelijk inkomen</span></span></a>
    <nav class="menu" aria-label="Hoofdmenu">
      ${MENU_HOOFD.map((m) => menuLink(m, actief, extra(m[2]))).join('')}
      <details class="uitklap menu-meer">
        <summary class="${meerActief ? 'actief' : ''}">Meer${icoon('open')}</summary>
        <div class="uitklap-paneel">${MENU_MEER.map((m) => menuLink(m, actief)).join('')}</div>
      </details>
    </nav>
    <div class="balk-rechts">
      <button type="button" class="zoekknop" data-actie="zoek-open" title="Zoek een dossier, pagina of actie (Ctrl+K)">${icoon('zoek')}<span>Zoeken</span><kbd>Ctrl K</kbd></button>
      <span id="opslagstatus">${opslagStatusHTML()}</span>
      <span id="drivestatus">${driveStatusHTML()}</span>
      <details class="uitklap account">
        <summary title="${esc(p?.naam || 'Account')}" aria-label="Account van ${esc(p?.naam || 'gebruiker')}"><span class="wie">${esc(p?.initialen || (p?.naam || '?').slice(0, 2))}</span></summary>
        <div class="uitklap-paneel rechts">
          <div class="account-kop"><b>${esc(p?.naam || '')}</b><span>${esc([p?.accreditatie, opslag].filter(Boolean).join(' · '))}</span></div>
          ${MENU_ACCOUNT.map((m) => menuLink(m, actief)).join('')}
        </div>
      </details>
      <details class="uitklap menu-smal">
        <summary aria-label="Menu" title="Menu">${icoon('menu')}</summary>
        <div class="uitklap-paneel rechts">
          ${MENU_HOOFD.map((m) => menuLink(m, actief, extra(m[2]))).join('')}
          <hr>
          ${MENU_MEER.map((m) => menuLink(m, actief)).join('')}
          <hr>
          ${MENU_ACCOUNT.map((m) => menuLink(m, actief)).join('')}
        </div>
      </details>
    </div>
  </div></header>`;
}

export function banners() {
  const out = [];
  if (state.waarschuwing) out.push(`<div class="melding niet_akkoord">${esc(state.waarschuwing)}</div>`);
  if (globalThis.ZIB_ARTIFACT && drive.beschikbaar && drive.status !== 'ok' && drive.status !== 'bezig' && !drive.uitgezet) {
    // In de ingesloten demo: dossiers bewaren in Google Drive.
    out.push(drive.status === 'fout'
      ? `<div class="melding attentie">Google Drive: ${esc(drive.melding)} <button class="knop klein" data-actie="drive-sync">Opnieuw proberen</button></div>`
      : `<div class="melding info">Dossiers staan nu alleen in deze browser. Koppel Google Drive om ze te bewaren en op je andere apparaten te gebruiken.
        <button class="knop klein" data-actie="drive-koppel">Google Drive koppelen</button></div>`);
  } else if (state.modus === 'lokaal' && !(globalThis.ZIB_ARTIFACT && drive.status === 'ok')) {
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
