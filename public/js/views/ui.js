import { esc, fmt, isIngevuld } from '../util.js';
import { DOSSIER_STATUSSEN } from '../schema/fields.js';

export const STATUS_TEKST = { akkoord: 'Akkoord', attentie: 'Attentie', niet_akkoord: 'Niet akkoord', nvt: 'N.v.t.', info: 'Info' };

const ICONEN = {
  persoon: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
  kopie: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  taken: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.1"/>',
  prullenbak: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  zoek: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  herhaal: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.6L20 16"/><path d="M20 20v-4h-4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  reken: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h8"/>',
  correctie: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  waarschuwing: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v5M12 17.6v.1"/>',
  links: '<path d="M15 6l-6 6 6 6"/>',
  rechts: '<path d="M9 6l6 6-6 6"/>',
  open: '<path d="M6 9l6 6 6-6"/>',
  dicht: '<path d="M9 6l6 6-6 6"/>',
  organogram: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  gebouw: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  document: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  lijst: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  boek: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  vink: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  wissel: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
  notitie: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};

/** Klein lijnicoon (inline SVG, geen externe bestanden). */
export function icoon(naam, titel = '') {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${titel ? ` role="img" aria-label="${esc(titel)}"` : ' aria-hidden="true"'}>${titel ? `<title>${esc(titel)}</title>` : ''}${ICONEN[naam] || ''}</svg>`;
}

export function pil(status, tekst) {
  return `<span class="pil ${esc(status)}">${esc(tekst ?? STATUS_TEKST[status] ?? status)}</span>`;
}

export function statusPil(status) {
  return `<span class="pil status ${esc(status)}">${esc(DOSSIER_STATUSSEN[status] || status)}</span>`;
}

/** Bedragchip zoals bij correcties: "€ -3.277". */
export function chip(bedrag, { titel = '', soort = '', actie = '', data = '' } = {}) {
  const tekst = `€ ${fmt.getal(bedrag)}`;
  const attrs = `${titel ? ` title="${esc(titel)}"` : ''}${actie ? ` data-actie="${esc(actie)}"` : ''} ${data}`;
  return actie
    ? `<button type="button" class="chip ${esc(soort)}"${attrs}>${esc(tekst)}</button>`
    : `<span class="chip ${esc(soort)}"${attrs}>${esc(tekst)}</span>`;
}

/** Gekleurd kengetal (groen = voldoet, rood = voldoet niet), zoals in de samenvatting van de rekentool. */
export function kengetal(tekst, ok) {
  if (tekst === null || tekst === undefined || tekst === '') return '';
  return `<span class="kengetal ${ok === null ? '' : ok ? 'ok' : 'nok'}">${esc(tekst)}</span>`;
}

function attrs({ bind, type, rec, render, extra = '' }) {
  return `data-bind="${esc(bind)}" data-type="${esc(type)}"${rec ? ` data-rec="${esc(rec)}"` : ''}${render ? ' data-render="1"' : ''} ${extra}`;
}

/** Bedragveld; waarde null/undefined = leeg. placeholder voor terugvalwaarden. */
export function bedrag(bind, waarde, { rec, placeholder = '', render = false, label } = {}) {
  const v = isIngevuld(waarde) ? fmt.getal(Number(waarde), Number(waarde) % 1 ? 2 : 0) : '';
  return `<input class="bedrag${placeholder ? ' leeg-terugval' : ''}" inputmode="decimal" autocomplete="off" value="${esc(v)}" placeholder="${esc(placeholder)}" ${attrs({ bind, type: 'bedrag', rec, render })}${label ? ` aria-label="${esc(label)}"` : ''}>`;
}

export function veld(label, bind, waarde, { type = 'tekst', rec, render = false, placeholder = '', breed = false, hint = '', invoertype } = {}) {
  const t = invoertype || (type === 'datum' ? 'date' : type === 'getal' || type === 'pct' ? 'text' : type === 'email' ? 'email' : 'text');
  const im = type === 'getal' || type === 'pct' ? ' inputmode="decimal"' : '';
  let v = waarde ?? '';
  if ((type === 'getal' || type === 'pct') && isIngevuld(waarde)) v = String(waarde).replace('.', ',');
  return `<label class="veld"${breed ? ' style="grid-column:1/-1"' : ''}><span>${esc(label)}</span>
    <input type="${t}"${im} value="${esc(v)}" placeholder="${esc(placeholder)}" ${attrs({ bind, type, rec, render })}>${hint ? `<small class="dempen">${esc(hint)}</small>` : ''}</label>`;
}

export function tekstvak(label, bind, waarde, { rec, rijen = 6, placeholder = '', hint = '' } = {}) {
  return `<label class="veld" style="grid-column:1/-1"><span>${esc(label)}</span>
    <textarea rows="${rijen}" placeholder="${esc(placeholder)}" ${attrs({ bind, type: 'tekst', rec })}>${esc(waarde ?? '')}</textarea>${hint ? `<small class="dempen">${esc(hint)}</small>` : ''}</label>`;
}

export function keuze(label, bind, opties, waarde, { rec, render = false, hint = '', leeg, type = 'tekst' } = {}) {
  const lijst = Array.isArray(opties) ? opties.map((o) => (Array.isArray(o) ? o : [o, o])) : Object.entries(opties);
  const opts = (leeg !== undefined ? [[ '', leeg ]] : []).concat(lijst)
    .map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(waarde ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const sel = `<select ${attrs({ bind, type, rec, render })}>${opts}</select>`;
  if (label === null) return sel;
  return `<label class="veld"><span>${esc(label)}</span>${sel}${hint ? `<small class="dempen">${esc(hint)}</small>` : ''}</label>`;
}

export function vink(label, bind, waarde, { rec, render = false, hint = '' } = {}) {
  return `<label class="check"><input type="checkbox"${waarde ? ' checked' : ''} ${attrs({ bind, type: 'bool', rec, render })}>
    <span>${esc(label)}${hint ? `<br><small class="dempen">${esc(hint)}</small>` : ''}</span></label>`;
}

export function melding(niveau, tekst, extra = '') {
  return `<div class="melding ${esc(niveau)}"><div>${tekst}</div>${extra}</div>`;
}

export function leeg(tekst, actie = '') {
  return `<div class="leeg">${esc(tekst)}${actie ? `<div style="margin-top:12px">${actie}</div>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Modaal venster
// ---------------------------------------------------------------------------
export function openModaal(titel, inhoud, knoppen = '', { breed = false, sluitTekst = 'Annuleren' } = {}) {
  sluitModaal();
  const el = document.createElement('div');
  el.className = 'modaal-achter';
  el.id = 'modaal';
  el.innerHTML = `<div class="modaal${breed ? ' breed' : ''}" role="dialog" aria-modal="true" aria-labelledby="modaal-titel">
    <h2 id="modaal-titel">${esc(titel)}</h2>${inhoud}
    <div class="acties">${knoppen}<button class="knop sec" data-actie="sluit-modaal">${esc(sluitTekst)}</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { if (e.target === el) sluitModaal(); });
  const eerste = el.querySelector('input:not([type="hidden"]), select, textarea, button');
  if (eerste) eerste.focus();
  return el;
}

/** Vervangt de inhoud van een open modaal venster (bijv. na toevoegen van een correctie). */
export function vervangModaalInhoud(selector, html) {
  const el = document.querySelector(`#modaal ${selector}`);
  if (el) el.innerHTML = html;
}

export function sluitModaal() {
  document.getElementById('modaal')?.remove();
}

/** Bevestigingsvenster (vervangt window.confirm, dat in ingesloten vensters geblokkeerd kan zijn). */
export function bevestig(tekst, knopTekst = 'Bevestigen') {
  return new Promise((resolve) => {
    const el = openModaal('Bevestigen', `<p>${esc(tekst)}</p>`, `<button class="knop" id="bevestig-ja">${esc(knopTekst)}</button>`);
    let klaar = false;
    const afronden = (v) => {
      if (klaar) return;
      klaar = true;
      obs.disconnect();
      sluitModaal();
      resolve(v);
    };
    const obs = new MutationObserver(() => { if (!document.body.contains(el)) afronden(false); });
    obs.observe(document.body, { childList: true });
    el.querySelector('#bevestig-ja').addEventListener('click', (e) => { e.stopPropagation(); afronden(true); });
  });
}

export function waardeUit(scope, naam) {
  const el = scope.querySelector(`[name="${naam}"]`);
  if (!el) return '';
  if (el.type === 'checkbox') return el.checked;
  return el.value;
}

let toastTimer = null;
export function toast(tekst) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--inkt);color:var(--vlak);padding:9px 16px;border-radius:6px;font-size:14px;z-index:60;max-width:90vw';
    document.body.appendChild(el);
  }
  el.textContent = tekst;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2600);
}

// In een ingesloten voorbeeldweergave (ZIB_ARTIFACT) mag de pagina zelf niets downloaden; de viewer biedt
// daarvoor de downloads-capability (met een bevestiging). Niet beschikbaar: tekst tonen om te kopiëren.
let downloadsViewer = null;
if (globalThis.ZIB_ARTIFACT && typeof globalThis.claude?.use === 'function') {
  Promise.resolve(globalThis.claude.use('downloads')).then((ns) => { downloadsViewer = ns || null; }, () => {});
}

function toonKopie(naam, inhoud, reden = '') {
  const tekst = typeof inhoud === 'string' ? inhoud : null;
  openModaal(`Downloaden: ${naam}`,
    `<p class="dempen klein">${esc(reden || 'In deze voorbeeldweergave kan ZIB geen bestanden opslaan.')} ${tekst !== null
      ? 'Kopieer de inhoud hieronder, of download het bestand in de losse demo of je eigen installatie.'
      : 'Download dit bestand in de losse demo of je eigen installatie.'}</p>
    ${tekst !== null ? `<textarea id="download-tekst" class="mono" rows="12" readonly aria-label="Inhoud van ${esc(naam)}">${esc(tekst)}</textarea>` : ''}`,
    tekst !== null ? '<button class="knop" data-actie="kopieer-download">Kopiëren</button>' : '', { breed: true, sluitTekst: 'Sluiten' });
}

export function downloadBestand(naam, inhoud, mime = 'application/json') {
  if (globalThis.ZIB_ARTIFACT) {
    if (!downloadsViewer) { toonKopie(naam, inhoud); return; }
    downloadsViewer.save({ filename: naam, data: inhoud instanceof Blob ? inhoud : String(inhoud) }).then(
      () => toast(`Download klaargezet: ${naam}`),
      (e) => {
        const code = e?.code;
        if (code === 'declined') return;
        if (code === 'rate_limited') { toast('Er staat al een downloadvraag open.'); return; }
        toonKopie(naam, inhoud, code === 'rejected_extension' ? 'Dit bestandstype kan hier niet worden opgeslagen.' : 'Downloaden lukt niet in deze weergave.');
      },
    );
    return;
  }
  const blob = inhoud instanceof Blob ? inhoud : new Blob([inhoud], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = naam;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
