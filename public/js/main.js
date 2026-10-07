import {
  state, start, lijst, get, opslaan, nieuw, verwijder, opWijziging, bewaarProfiel, logUit, volgendDossiernummer,
  logHistorie, exporteer, importeer, laadDemo, wisLokaal, zetOpslagvoorkeur, losConflictOp, bewaarAlles,
  heeftOnopgeslagen, mijnNaam,
} from './state.js';
import { bereken, salarisPeriode, organogramGraaf, organogramTekst } from './engine/index.js';
import {
  parseBedrag, setPath, getPath, esc, fmt, todayISO, uid, nowISO, naamAanvrager, debounce, num, clone, isIngevuld,
} from './util.js';
import { balk, banners, opslagStatusHTML, driveStatusHTML } from './views/layout.js';
import { initDrive, synchroniseer, ontkoppel, beheerRechten, opDriveWijziging, drive } from './store/drive.js';
import {
  renderAanvragen, tabelAanvragen, filters, modaalNieuweKlant, modaalStatus, modaalHypotheeknummer, modaalTaken,
  modaalKopieren, modaalVerwijderen, modaalEerdereAanvragen, modaalHerbeoordeling, modaalZoekAfgerond, samenvatting,
} from './views/aanvragen.js';
import { renderDossier, kopVoor, calcWaarde, docAanwezig, NAAR_BZI, NAAR_VIIZ, roosterJaren, weergaveDossier } from './views/dossier.js';
import { modaalCorrectie, correctieLijstHTML, modaalVaSamenstelling, modaalSalaris, MAANDEN_KORT } from './views/bzi.js';
import {
  renderDocumenten, renderAdvieskantoren, renderTaken, renderMeekijken, renderFAQ, renderHulp,
  renderDownloads, renderTickets, renderTicket, renderMijnGegevens, renderLogin, renderEmail, emailFormulier,
} from './views/paginas.js';
import { openModaal, sluitModaal, waardeUit, toast, downloadBestand, leeg, bevestig, vervangModaalInhoud, icoon } from './views/ui.js';
import { FORMATS, FIAT_VRAGEN, magFiatteren } from './views/formats.js';
import { dossierNotitiesTekst, conceptFinancieel, conceptAlgemeen } from './views/rapport.js';
import { documentenlijst } from './schema/documenten.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES } from './schema/correcties.js';
import { pasDetailToe, DOSSIER_STATUSSEN, AFGEROND, BALANS_RIJEN, VW_RIJEN } from './schema/fields.js';
import { parseGrootboekTekst, verdeelGrootboek } from './schema/rekeningschema.js';
import { RECHTSVORMEN } from './engine/kaders.js';
import { ui, zetUitgebreid, zetPaginagrootte, toggleNotitie, zetNotitiesVerborgen, zetJaarVolgorde, zetOrganogramWeergave } from './views/uistate.js';
import { organogramSVG } from './views/organogram.js';

const app = document.getElementById('app');
let route = { pagina: 'aanvragen' };
let resultaat = null;
let gbVoorbeeld = null;

// ---------------------------------------------------------------------------
// Thema
// ---------------------------------------------------------------------------
function zetThema(waarde) {
  try { localStorage.setItem('zib.thema', waarde); } catch { /* geen opslag */ }
  if (waarde === 'light' || waarde === 'dark') document.documentElement.dataset.theme = waarde;
  else delete document.documentElement.dataset.theme;
}
try { zetThema(localStorage.getItem('zib.thema') || 'systeem'); } catch { /* geen opslag */ }

// ---------------------------------------------------------------------------
// Router en rendering
// ---------------------------------------------------------------------------
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p = '', a, b, c] = h.split('/').map((x) => decodeURIComponent(x || ''));
  switch (p) {
    case '':
    case 'klanten':
    case 'aanvragen': return { pagina: 'aanvragen', afgerond: a === 'afgerond' };
    case 'dossier': return { pagina: 'dossier', id: a, tab: b || '', ondId: c || '' };
    case 'tickets': return a ? { pagina: 'ticket', id: a } : { pagina: 'tickets' };
    default: return { pagina: p };
  }
}

const MENU_KEY = {
  aanvragen: 'klanten', documenten: 'documenten', advieskantoren: 'advieskantoren', taken: 'taken', 'mijn-taken': 'mijn-taken',
  hulp: 'hulp', meekijken: 'meekijken', faq: 'faq', downloads: 'downloads', tickets: 'tickets', ticket: 'tickets',
  'mijn-gegevens': 'mijn-gegevens', 'e-mail': 'e-mail',
};

function huidigDossier() {
  return route.pagina === 'dossier' ? get(route.id) : null;
}

export function render({ behoudScroll = false } = {}) {
  const y = window.scrollY;
  route = parseRoute();
  if (!state.profiel && state.modus === 'lokaal' && route.pagina !== 'login') {
    location.hash = '#/login';
    return;
  }
  if (route.pagina === 'login') {
    app.innerHTML = renderLogin();
    document.title = 'ZIB | Aanmelden';
    return;
  }
  let inhoud = '';
  let titel = 'Nieuwe en lopende aanvragen';
  let breed = false;
  switch (route.pagina) {
    case 'aanvragen': inhoud = renderAanvragen(route.afgerond); titel = route.afgerond ? 'Afgeronde aanvragen' : titel; breed = true; break;
    case 'dossier': {
      const d = get(route.id);
      if (!d) { inhoud = leeg('Dit dossier bestaat niet (meer).', '<a class="knop" href="#/klanten">Naar aanvragen</a>'); break; }
      resultaat = bereken(d);
      inhoud = renderDossier(d, route.tab || (weergaveDossier(d) === 'bzi' ? 'algemeen' : 'klant'), route.ondId, resultaat);
      titel = `${d.nummer} ${naamAanvrager(d.aanvrager)}`;
      breed = weergaveDossier(d) === 'bzi';
      break;
    }
    case 'documenten': inhoud = renderDocumenten(); titel = 'Documenten'; break;
    case 'advieskantoren': inhoud = renderAdvieskantoren(); titel = 'Advieskantoren'; break;
    case 'taken': inhoud = renderTaken(false); titel = 'Alle taken'; break;
    case 'mijn-taken': inhoud = renderTaken(true); titel = 'Mijn taken'; break;
    case 'hulp': inhoud = renderHulp(); titel = 'Hulp nodig?'; break;
    case 'meekijken': inhoud = renderMeekijken(); titel = 'Meekijken'; break;
    case 'faq': inhoud = renderFAQ(); titel = 'FAQ'; break;
    case 'downloads': inhoud = renderDownloads(); titel = 'Downloads'; break;
    case 'tickets': inhoud = renderTickets(); titel = 'Tickets'; break;
    case 'ticket': inhoud = renderTicket(route.id); titel = 'Ticket'; break;
    case 'mijn-gegevens': inhoud = renderMijnGegevens(); titel = 'Mijn gegevens'; break;
    case 'e-mail': inhoud = renderEmail(); titel = 'E-mail versturen'; break;
    default: inhoud = leeg('Pagina niet gevonden.', '<a class="knop" href="#/klanten">Naar aanvragen</a>');
  }
  app.innerHTML = `${balk(MENU_KEY[route.pagina] || '')}${banners()}<main class="pagina${breed ? ' breed' : ''}" id="main">${inhoud}</main>`;
  document.title = `ZIB | ${titel}`;
  if (behoudScroll) window.scrollTo(0, y);
}

const herberekenDossier = debounce(() => {
  const d = huidigDossier();
  if (!d) return;
  resultaat = bereken(d);
  const kop = document.getElementById('dossierkop');
  if (kop) kop.outerHTML = kopVoor(d, resultaat);
  document.querySelectorAll('[data-calc]').forEach((el) => {
    const w = calcWaarde(d, el.dataset.calc, resultaat);
    el.textContent = w === null || w === undefined ? '' : fmt.getal(w);
    if (el.dataset.calc.endsWith('|VERSCHIL')) el.classList.toggle('fout', Math.abs(Number(w) || 0) > 1);
  });
}, 150);

/** Alleen de meldingen boven de pagina bijwerken (zonder de hele pagina opnieuw te tekenen). */
function werkBannersBij() {
  const nieuw = banners();
  const oud = app.querySelector(':scope > .banner');
  if (oud) {
    if (nieuw) oud.outerHTML = nieuw;
    else oud.remove();
  } else if (nieuw) {
    document.getElementById('main')?.insertAdjacentHTML('beforebegin', nieuw);
  }
}

// Google Drive (ingesloten demo): status in de bovenbalk; na het ophalen van records opnieuw tekenen.
opDriveWijziging((type) => {
  if (route.pagina === 'login' || !document.getElementById('main')) return;
  if (type === 'records' || route.pagina === 'downloads') { render({ behoudScroll: true }); return; }
  const el = document.getElementById('drivestatus');
  if (el) el.innerHTML = driveStatusHTML();
  werkBannersBij();
});

opWijziging((type) => {
  if (type === 'opslag') {
    const el = document.getElementById('opslagstatus');
    if (el) el.innerHTML = opslagStatusHTML();
    if (state.opslag.status === 'fout' && !document.querySelector('.banner .niet_akkoord')) render({ behoudScroll: true });
  }
  if (type === 'conflict') render({ behoudScroll: true });
});

// ---------------------------------------------------------------------------
// Binding van invoervelden aan records
// ---------------------------------------------------------------------------
function waardeVan(el) {
  const t = el.dataset.type;
  if (t === 'bool') return el.checked;
  if (el.tagName === 'SELECT' && (el.value === 'true' || el.value === 'false')) return el.value === 'true';
  if (t === 'bedrag' || t === 'getal' || t === 'pct') return parseBedrag(el.value);
  return el.value;
}

function doelVoor(el) {
  const rec = el.dataset.rec;
  if (rec === '__profiel') return { soort: 'profiel', obj: { ...(state.profiel || {}) } };
  if (rec) return { soort: 'record', obj: get(rec) };
  return { soort: 'dossier', obj: huidigDossier() };
}

function ondVan(d, id) {
  return (d?.ondernemingen || []).find((o) => o.id === id) || null;
}

function zetWaarde(obj, pad, waarde) {
  if (pad.startsWith('ond:')) {
    const punt = pad.indexOf('.');
    const ond = ondVan(obj, pad.slice(4, punt));
    if (!ond) return;
    setPath(ond, pad.slice(punt + 1), waarde);
    return;
  }
  setPath(obj, pad, waarde);
}

function verwerkBinding(el, magRenderen) {
  const doel = doelVoor(el);
  if (!doel.obj) return;
  const waarde = waardeVan(el);
  zetWaarde(doel.obj, el.dataset.bind, waarde);
  if (doel.soort === 'profiel') {
    bewaarProfiel(doel.obj);
    return;
  }
  if (doel.soort === 'dossier') {
    const m = /^ond:([^.]+)\.jaren\.(\d+)\.(balans|vw)Detail\.([^.]+)\./.exec(el.dataset.bind || '');
    if (m) {
      const ond = ondVan(doel.obj, m[1]);
      if (ond?.jaren?.[m[2]]) pasDetailToe(ond.jaren[m[2]], m[3], m[4]);
    }
    if (el.dataset.bind === 'status') doel.obj.statusDatum = nowISO();
  }
  opslaan(doel.obj);
  if (doel.soort === 'dossier') herberekenDossier();
  if (el.dataset.render && magRenderen) {
    if (doel.soort === 'dossier') herberekenDossier.flush();
    render({ behoudScroll: true });
  }
}

function verversTabel() {
  const t = document.getElementById('aanvragen-tabel');
  if (t) t.innerHTML = tabelAanvragen(route.afgerond);
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('[data-filter]')) {
    filters[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value;
    ui.aanvragen.pagina = 1;
    verversTabel();
    return;
  }
  if (el.closest('#modaal [data-salaris]')) { toonSalarisUitkomst(); return; }
  if (el.closest('#modaal [data-va]')) { toonVaTotaal(); return; }
  if (!el.matches('[data-bind]')) return;
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') return;
  verwerkBinding(el, false);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('[data-filter]')) {
    filters[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value;
    ui.aanvragen.pagina = 1;
    verversTabel();
    return;
  }
  if (el.matches('[data-actie]') && (el.tagName === 'SELECT' || el.type === 'file' || el.type === 'checkbox')) {
    voerUit(el.dataset.actie, el, e);
    return;
  }
  if (!el.matches('[data-bind]')) return;
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') verwerkBinding(el, true);
  else if (el.dataset.render) verwerkBinding(el, true);
});

document.addEventListener('focusout', (e) => {
  const el = e.target;
  if (el.matches && el.matches('input.bedrag[data-type="bedrag"]')) {
    const v = parseBedrag(el.value);
    el.value = v === null ? '' : fmt.getal(v, v % 1 ? 2 : 0);
  }
  // Een ongewijzigd ingevoegd format wordt weer leeggemaakt.
  if (el.matches && el.matches('textarea[data-template]') && el.dataset.ingevoegd === '1') {
    const tpl = FORMATS[el.dataset.template] || '';
    delete el.dataset.ingevoegd;
    if (el.value === tpl) {
      el.value = '';
      verwerkBinding(el, false);
    }
  }
});

// Format bij het eerste gebruik van een leeg notitieveld (zoals de vragen in de rekentool).
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el.matches || !el.matches('textarea[data-template]') || el.value.trim()) return;
  const tpl = FORMATS[el.dataset.template];
  if (!tpl) return;
  el.value = tpl;
  el.dataset.ingevoegd = '1';
  const eersteRegel = tpl.indexOf('\n');
  const pos = eersteRegel === -1 ? tpl.length : eersteRegel;
  try { el.setSelectionRange(pos, pos); } catch { /* niet ondersteund */ }
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-actie]');
  if (!el) return;
  if (el.tagName === 'SELECT' || el.type === 'file' || el.type === 'checkbox') return;
  if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'TR') e.preventDefault();
  voerUit(el.dataset.actie, el, e);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') sluitModaal();
  if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-actie]')) voerUit(e.target.dataset.actie, e.target, e);
  if (e.key === 'Enter' && e.target.matches && e.target.matches('#modaal input:not([type="checkbox"]):not([type="radio"])')) {
    const knop = document.querySelector('#modaal .acties .knop:not(.sec)');
    if (knop && !knop.disabled) { e.preventDefault(); knop.click(); }
  }
});

window.addEventListener('hashchange', () => { sluitModaal(); render(); window.scrollTo(0, 0); });
window.addEventListener('beforeunload', (e) => {
  if (heeftOnopgeslagen()) {
    bewaarAlles();
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------------------------------------------------------------------------
// Hulpfuncties voor acties
// ---------------------------------------------------------------------------
function nieuweOnderneming(naam = '', rechtsvorm = 'EZ', startdatum = '', extra = {}) {
  return { id: uid('ond'), naam, rechtsvorm, startdatum, kvk: '', sbi: '', land: 'NL', belastingplichtig: 'NL',
    actief: true, meenemen: true, aandeelPct: 100, direct: true, beroepsgroep: 'overig', jaren: {}, ...extra };
}

function zetStatus(d, status, toelichting = '') {
  if (d.status === status) return;
  const oud = DOSSIER_STATUSSEN[d.status] || d.status;
  d.status = status;
  d.statusDatum = nowISO();
  logHistorie(d, `Status gewijzigd van "${oud}" naar "${DOSSIER_STATUSSEN[status] || status}"${toelichting ? `: ${toelichting}` : ''}`);
}

function modaalVeld(naam) {
  const m = document.getElementById('modaal');
  return m ? waardeUit(m, naam) : '';
}

function ontbrekendeStukken(d) {
  const r = bereken(d);
  const docs = lijst('document').filter((x) => x.dossierId === d.id);
  return r.documenten.filter((x) => x.verplicht && !docAanwezig(docs, x));
}

function mailto({ aan = '', bcc = '', onderwerp = '', bericht = '' }) {
  const params = [];
  if (bcc) params.push(`bcc=${encodeURIComponent(bcc)}`);
  params.push(`subject=${encodeURIComponent(onderwerp)}`);
  params.push(`body=${encodeURIComponent(bericht)}`);
  location.href = `mailto:${encodeURIComponent(aan).replace(/%40/g, '@').replace(/%2C/g, ',')}?${params.join('&')}`;
}

function kopieDossier(bron, { status = 'documenten_uploaden', actie = '' } = {}) {
  const kopie = clone(bron);
  ['id', 'version', 'updated_at', 'updated_by', 'fiat', 'fiatteur', 'meekijken', 'teruggezet'].forEach((k) => delete kopie[k]);
  return nieuw('dossier', {
    ...kopie, nummer: volgendDossiernummer(), status, statusDatum: nowISO(), datumAanvraag: todayISO(),
    behandelaar: mijnNaam(), historie: [{ at: nowISO(), door: mijnNaam(), actie: actie || `Kopie gemaakt van dossier ${bron.nummer}` }],
  });
}

function laatsteDagMaand(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toonSalarisUitkomst() {
  const el = document.getElementById('salaris-uitkomst');
  if (!el) return null;
  const s = salarisPeriode({
    maandsalaris: parseBedrag(modaalVeld('maandsalaris')),
    vakantiegeldPct: parseBedrag(modaalVeld('vakantiegeldPct')) ?? 8,
    dertiendeMaand: !!modaalVeld('dertiendeMaand'),
    maanden: parseBedrag(modaalVeld('maanden')) ?? 12,
  });
  el.textContent = num(parseBedrag(modaalVeld('maandsalaris'))) ? s.f : '–';
  return s;
}

function toonVaTotaal() {
  const el = document.getElementById('va-totaal');
  if (!el) return 0;
  const som = ['voorraden', 'vorderingen', 'rcDirectie', 'liquide'].reduce((s, k) => s + num(parseBedrag(modaalVeld(k))), 0);
  el.textContent = fmt.eur(som);
  return som;
}

function voegNotitieToe(d, pad, tekst, kop) {
  const huidig = String(getPath(d, pad) || '');
  const nieuwT = huidig.trim() ? `${huidig.trimEnd()}\n\n${kop ? `${kop}\n` : ''}${tekst}` : tekst;
  setPath(d, pad, nieuwT);
  opslaan(d);
}

function openCorrectieModaal(d, ondId, y, lijstNaam) {
  const r = resultaat || bereken(d);
  const o = ondVan(d, ondId);
  openModaal(`${lijstNaam === 'winst' ? 'Winstcorrectie' : 'Vermogenscorrectie'} ${o?.naam || ''} ${y}`, modaalCorrectie(d, r, ondId, y, lijstNaam),
    '<button class="knop" data-actie="correctie-toevoegen">Toevoegen</button>', { breed: true, sluitTekst: 'Sluiten' });
}

function verversCorrectieLijst(d, ondId, y, lijstNaam) {
  const o = ondVan(d, ondId);
  const sleutel = lijstNaam === 'winst' ? 'winstCorrecties' : 'vermogensCorrecties';
  vervangModaalInhoud('#correctie-lijst', correctieLijstHTML(o?.jaren?.[y]?.[sleutel] || [], lijstNaam === 'winst' ? WINST_CORRECTIES : VERMOGENS_CORRECTIES, ondId, y, lijstNaam));
}

function verzamelmailTeksten() {
  const ds = [...ui.aanvragen.selectie].map(get).filter(Boolean);
  const perKantoor = new Map();
  ds.forEach((d) => {
    const k = d.advieskantoorId || '';
    if (!perKantoor.has(k)) perKantoor.set(k, []);
    perKantoor.get(k).push(d);
  });
  return [...perKantoor.entries()].map(([k, lijstD]) => {
    const adv = get(k);
    const blokken = lijstD.map((d) => {
      const ontbr = ontbrekendeStukken(d);
      return `${naamAanvrager(d.aanvrager)} (dossier ${d.nummer}${d.leningnummer ? `, aanvraag ${d.leningnummer}` : ''}):\n${ontbr.length ? ontbr.map((x) => `- ${x.naam}${x.geldigheid ? ` (${x.geldigheid.toLowerCase()})` : ''}`).join('\n') : '- Geen ontbrekende stukken; graag een reactie op de openstaande vragen.'}`;
    }).join('\n\n');
    return {
      kantoor: adv?.naam || 'Geen advieskantoor',
      aan: adv?.email || '',
      ids: lijstD.map((d) => d.id),
      onderwerp: lijstD.length === 1 ? `Aanvullende stukken ${lijstD[0].nummer} ${naamAanvrager(lijstD[0].aanvrager)}` : `Aanvullende stukken voor ${lijstD.length} aanvragen`,
      bericht: `Beste ${adv?.contactpersoon || 'adviseur'},\n\nVoor de beoordeling van het zakelijk inkomen hebben wij nog de volgende stukken nodig:\n\n${blokken}\n\nWilt u deze aanleveren? Alvast bedankt.\n\nMet vriendelijke groet,\n${mijnNaam()}`,
    };
  });
}

const POST_LABELS = Object.fromEntries([...BALANS_RIJEN, ...VW_RIJEN].filter((r) => r.k).map((r) => [r.k, r.label]));
POST_LABELS.vpb = 'Vennootschapsbelasting';

function grootboekVoorbeeldHTML(v, fouten) {
  const tabel = (titel, obj) => {
    const rijen = Object.entries(obj).filter(([, w]) => w !== 0);
    return `<div><h4>${esc(titel)}</h4>${rijen.length ? `<table class="tabel compact"><tbody>${rijen.map(([k, w]) => `<tr><td>${esc(POST_LABELS[k] || k)}</td><td class="num">${esc(fmt.getal(w, w % 1 ? 2 : 0))}</td></tr>`).join('')}</tbody></table>` : '<p class="dempen">Geen posten.</p>'}</div>`;
  };
  return `<div class="melding ${Math.abs(v.verschil) > 1 ? 'attentie' : 'akkoord'}">Resultaat boekjaar uit de resultatenrekening: <b>${esc(fmt.eur(v.resultaat))}</b>${v.resultaatGeboektOp ? ` (geteld bij ${esc(POST_LABELS[v.resultaatGeboektOp] || v.resultaatGeboektOp)})` : ''}. Verschil activa en passiva na import: <b>${esc(fmt.eur(v.verschil))}</b>.</div>
    <div class="raster-2" style="margin-top:10px">${tabel('Balans', v.balans)}${tabel('Winst- en verliesrekening', v.vw)}</div>
    ${v.toegewezen.some((x) => x.opmerking) ? `<h4>Opmerkingen</h4><ul class="klein">${v.toegewezen.filter((x) => x.opmerking).map((x) => `<li>${esc(x.rekening)} ${esc(x.omschrijving)}: ${esc(x.opmerking)}</li>`).join('')}</ul>` : ''}
    ${v.nietOvergenomen.length ? `<h4>Niet overgenomen</h4><ul class="klein">${v.nietOvergenomen.map((x) => `<li>${esc(x.rekening)} ${esc(x.omschrijving)} (${esc(fmt.getal(x.saldo))}): ${esc(x.opmerking)}</li>`).join('')}</ul>` : ''}
    ${fouten.length ? `<h4>Regels die niet gelezen konden worden</h4><ul class="klein">${fouten.map((x) => `<li>Regel ${x.regel}: ${esc(x.tekst)}</li>`).join('')}</ul>` : ''}`;
}

// ---------------------------------------------------------------------------
// Acties
// ---------------------------------------------------------------------------
const ACTIES = {
  'open-dossier'(el) {
    location.hash = `#/dossier/${el.dataset.id}${el.dataset.tab ? `/${el.dataset.tab}` : ''}`;
  },

  // ---- Aanvragenlijst --------------------------------------------------
  'nieuwe-aanvraag'() {
    openModaal('Nieuwe klant', modaalNieuweKlant(), '<button class="knop" data-actie="aanvraag-aanmaken">Maak nieuwe klant aan</button>');
  },
  'aanvraag-aanmaken'() {
    const m = document.getElementById('modaal');
    if (!modaalVeld('voorletters') || !modaalVeld('achternaam')) { toast('Vul de voorletters en de achternaam in.'); return; }
    const keuzeEl = m.querySelector('input[name="soortkader"]:checked');
    const [soort, kader] = (keuzeEl?.value || 'IKV|ABN').split('|');
    const d = nieuw('dossier', {
      nummer: volgendDossiernummer(), soort, kader, status: 'documenten_uploaden', statusDatum: nowISO(), datumAanvraag: todayISO(),
      niveau: 'Basis', behandelaar: mijnNaam(), advieskantoorId: modaalVeld('advieskantoor'), berekeningsdatum: todayISO(),
      label: modaalVeld('label') || 'ABN AMRO', afdeling: 'IMV', leningnummer: modaalVeld('leningnummer'),
      uitersteDatum: modaalVeld('uiterste'), spoed: !!modaalVeld('spoed'),
      aanvrager: { voorletters: modaalVeld('voorletters'), tussenvoegsel: modaalVeld('tussenvoegsel'), achternaam: modaalVeld('achternaam') },
      instellingen: { controlejaar: true, initieelAantalOndernemingen: 1, box2Route: 'route1' },
      loondienst: { voorStartMeenemen: true }, ondernemingen: [], ib: {}, notities: {},
      historie: [{ at: nowISO(), door: mijnNaam(), actie: 'Dossier aangemaakt' }],
    });
    sluitModaal();
    location.hash = `#/dossier/${d.id}/${weergaveDossier(d) === 'bzi' ? 'algemeen' : 'klant'}`;
  },
  'toon-alle-klanten'() {
    Object.assign(filters, { zoek: '', kader: '', soort: '', status: '', mijn: false, spoed: false });
    ui.aanvragen.zoekAfgerond = null;
    ui.aanvragen.pagina = 1;
    render();
  },
  'filter-maken'() {
    ui.aanvragen.filterOpen = !ui.aanvragen.filterOpen;
    render({ behoudScroll: true });
  },
  sorteer(el) {
    const kol = el.dataset.kol;
    const s = ui.aanvragen.sort;
    if (s.kol === kol) s.richting = s.richting === 'asc' ? 'desc' : 'asc';
    else { s.kol = kol; s.richting = /datum|uiterste|inkomen|spoed/i.test(kol) ? 'desc' : 'asc'; }
    verversTabel();
  },
  pagina(el) {
    ui.aanvragen.pagina = Number(el.dataset.pagina) || 1;
    verversTabel();
  },
  paginagrootte(el) {
    zetPaginagrootte(Number(el.value) || 50);
    verversTabel();
  },
  selecteer(el) {
    const sel = ui.aanvragen.selectie;
    if (el.checked) sel.add(el.dataset.id); else sel.delete(el.dataset.id);
    render({ behoudScroll: true });
  },
  'selecteer-alles'(el) {
    const ids = [...document.querySelectorAll('#aanvragen-tabel input[data-actie="selecteer"]')].map((x) => x.dataset.id);
    ids.forEach((id) => (el.checked ? ui.aanvragen.selectie.add(id) : ui.aanvragen.selectie.delete(id)));
    render({ behoudScroll: true });
  },
  'status-wijzigen'(el) {
    const d = get(el.dataset.id);
    if (d) openModaal('Status wijzigen', modaalStatus(d), '<button class="knop" data-actie="status-opslaan">Wijzig status</button>');
  },
  'status-opslaan'() {
    const d = get(modaalVeld('id'));
    if (!d) return;
    zetStatus(d, modaalVeld('status'), modaalVeld('toelichting'));
    opslaan(d, { direct: true });
    sluitModaal();
    render({ behoudScroll: true });
  },
  hypotheeknummer(el) {
    const d = get(el.dataset.id);
    if (d) openModaal('Wijzigen hypotheekaanvraagnummer', modaalHypotheeknummer(d), '<button class="knop" data-actie="hypotheeknummer-opslaan">Wijzig</button>');
  },
  'hypotheeknummer-opslaan'() {
    const d = get(modaalVeld('id'));
    if (!d) return;
    d.leningnummer = modaalVeld('leningnummer').trim();
    logHistorie(d, `Hypotheekaanvraagnummer gewijzigd in ${d.leningnummer || '(leeg)'}`);
    opslaan(d, { direct: true });
    sluitModaal();
    render({ behoudScroll: true });
  },
  'eerdere-aanvragen'(el) {
    const d = get(el.dataset.id);
    if (d) openModaal(`Aanvragen van ${naamAanvrager(d.aanvrager)}`, modaalEerdereAanvragen(d), '', { breed: true, sluitTekst: 'Sluiten' });
  },
  'taken-dossier'(el) {
    const d = get(el.dataset.id);
    if (d) openModaal(`Taken ${d.nummer} ${naamAanvrager(d.aanvrager)}`, modaalTaken(d), '<button class="knop" data-actie="taak-in-dossier">Taak toevoegen</button>', { breed: true, sluitTekst: 'Sluiten' });
  },
  'taak-in-dossier'() {
    const d = get(modaalVeld('id'));
    if (!d) return;
    if (!modaalVeld('titel').trim()) { toast('Geef de taak een omschrijving.'); return; }
    nieuw('taak', { titel: modaalVeld('titel').trim(), dossierId: d.id, toegewezenAan: modaalVeld('wie'), deadline: modaalVeld('deadline'), status: 'open', door: mijnNaam() });
    openModaal(`Taken ${d.nummer} ${naamAanvrager(d.aanvrager)}`, modaalTaken(d), '<button class="knop" data-actie="taak-in-dossier">Taak toevoegen</button>', { breed: true, sluitTekst: 'Sluiten' });
    verversTabel();
  },
  'kopieer-dossier'(el) {
    const d = get(el.dataset.id);
    if (d) openModaal('Dossier kopiëren?', modaalKopieren(d), '<button class="knop" data-actie="kopieer-bevestig">Kopieer dossier</button>');
  },
  'kopieer-bevestig'() {
    const bron = get(modaalVeld('id'));
    if (!bron) return;
    const kopie = kopieDossier(bron);
    logHistorie(bron, `Gekopieerd naar dossier ${kopie.nummer}`);
    opslaan(bron);
    sluitModaal();
    toast(`Kopie ${kopie.nummer} aangemaakt.`);
    location.hash = `#/dossier/${kopie.id}`;
  },
  'verwijder-klant'(el) {
    const d = get(el.dataset.id);
    if (d) openModaal('Klant verwijderen?', modaalVerwijderen(d), '<button class="knop gevaar-vol" data-actie="verwijder-bevestig">Verwijder klant</button>');
  },
  async 'verwijder-bevestig'() {
    const d = get(modaalVeld('id'));
    if (!d) return;
    sluitModaal();
    for (const doc of lijst('document').filter((x) => x.dossierId === d.id)) {
      try { await state.adapter.removeFile(doc.id); } catch { /* bestand ontbrak al */ }
      await verwijder(doc.id);
    }
    for (const t of lijst('taak').filter((x) => x.dossierId === d.id)) await verwijder(t.id);
    ui.aanvragen.selectie.delete(d.id);
    await verwijder(d.id);
    toast('Klant verwijderd.');
    render({ behoudScroll: true });
  },
  herbeoordeling() {
    openModaal('Aanvraag herbeoordeling', modaalHerbeoordeling(), '<button class="knop" data-actie="herbeoordeling-aanmaken">Ga verder</button>');
  },
  'herbeoordeling-aanmaken'() {
    const bron = get(modaalVeld('id'));
    const toelichting = modaalVeld('toelichting').trim();
    if (!bron) { toast('Kies het te herbeoordelen dossier.'); return; }
    if (!toelichting) { toast('Geef de reden van de herbeoordeling.'); return; }
    const kopie = kopieDossier(bron, { actie: `Herbeoordeling van dossier ${bron.nummer}: ${toelichting}` });
    kopie.herbeoordelingVan = bron.id;
    kopie.berekeningsdatum = todayISO();
    opslaan(kopie, { direct: true });
    logHistorie(bron, `Herbeoordeling aangevraagd (nieuw dossier ${kopie.nummer})`);
    opslaan(bron);
    sluitModaal();
    toast(`Herbeoordeling ${kopie.nummer} aangemaakt.`);
    location.hash = `#/dossier/${kopie.id}`;
  },
  'zoek-afgerond'() {
    openModaal('Zoeken in afgeronde aanvragen', modaalZoekAfgerond(), '<button class="knop" data-actie="zoek-afgerond-uitvoeren">Zoek</button>');
  },
  'zoek-afgerond-uitvoeren'() {
    const z = { achternaam: modaalVeld('achternaam').trim(), hypotheek: modaalVeld('hypotheek').trim(), nummer: modaalVeld('nummer').trim(), vanaf: modaalVeld('vanaf'), tot: modaalVeld('tot') };
    ui.aanvragen.zoekAfgerond = Object.values(z).some(Boolean) ? z : null;
    ui.aanvragen.pagina = 1;
    sluitModaal();
    if (route.pagina === 'aanvragen' && route.afgerond) render(); else location.hash = '#/klanten/afgerond';
  },
  verzamelmail() {
    const teksten = verzamelmailTeksten();
    if (!teksten.length) { toast('Selecteer eerst een of meer dossiers.'); return; }
    openModaal('Verzamelmail', `<p class="dempen">Eén e-mail per advieskantoor met de ontbrekende stukken van de geselecteerde dossiers. Pas de tekst zo nodig aan en open hem in je e-mailprogramma.</p>
      ${teksten.map((t, i) => `<div class="verzamel" data-index="${i}"><h4>${esc(t.kantoor)} <span class="dempen klein">${t.ids.length} dossier(s)${t.aan ? `, ${esc(t.aan)}` : ', geen e-mailadres bekend'}</span></h4>
        <input name="onderwerp_${i}" value="${esc(t.onderwerp)}" aria-label="Onderwerp">
        <textarea name="bericht_${i}" rows="8" aria-label="Bericht">${esc(t.bericht)}</textarea>
        <div class="acties" style="margin-top:6px"><button class="knop sec klein" data-actie="verzamelmail-open" data-index="${i}">${icoon('mail')}Openen in e-mailprogramma</button></div></div>`).join('')}`,
    '', { breed: true, sluitTekst: 'Sluiten' });
  },
  'verzamelmail-open'(el) {
    const i = Number(el.dataset.index);
    const t = verzamelmailTeksten()[i];
    if (!t) return;
    t.ids.forEach((id) => {
      const d = get(id);
      if (!d) return;
      logHistorie(d, 'Herinnering / stukken opgevraagd via verzamelmail');
      if (['documenten_uploaden', 'controleren_documenten', 'opnieuw_controleren', 'beoordeling_1'].includes(d.status)) zetStatus(d, 'informatie_aanleveren');
      opslaan(d);
    });
    mailto({ aan: t.aan, onderwerp: modaalVeld(`onderwerp_${i}`) || t.onderwerp, bericht: modaalVeld(`bericht_${i}`) || t.bericht });
  },
  'email-versturen'() {
    openModaal('E-mail versturen', emailFormulier(), `<button class="knop" data-actie="email-verzend">${icoon('mail')}Openen in e-mailprogramma</button>`, { breed: true });
  },
  'email-verzend'() {
    const scope = document.getElementById('modaal') || app;
    const v = (n) => waardeUit(scope, n);
    if (!v('aan') || !v('onderwerp')) { toast('Vul minimaal Aan en Onderwerp in.'); return; }
    mailto({ aan: v('aan'), bcc: v('bcc'), onderwerp: v('onderwerp'), bericht: v('bericht') });
    sluitModaal();
  },
  'meekijken-toestemming'() {
    openModaal('Meekijken in een dossier', `<p>Met toestemming van de behandelaar kijk je vandaag mee in een dossier. Het dossier krijgt een lichtgele achtergrond in de aanvragenlijst (alleen vandaag).</p>
      <label class="veld"><span>Dossiernummer *</span><input name="nummer" placeholder="ZIB-${new Date().getFullYear()}-0001" autocomplete="off"></label>
      <label class="check" style="margin-top:10px"><input type="checkbox" name="toestemming"><span>Toestemming ontvangen om vandaag mee te kijken *</span></label>`,
    '<button class="knop" data-actie="meekijken-bevestig">Bevestig</button>');
  },
  'meekijken-bevestig'() {
    const nr = modaalVeld('nummer').trim().toUpperCase();
    if (!modaalVeld('toestemming')) { toast('Bevestig dat je toestemming hebt.'); return; }
    const d = lijst('dossier').find((x) => String(x.nummer || '').toUpperCase() === nr);
    if (!d) { toast('Dossier niet gevonden. Controleer het dossiernummer.'); return; }
    d.meekijken = { datum: todayISO(), door: mijnNaam() };
    logHistorie(d, 'Toestemming vastgelegd om vandaag mee te kijken');
    opslaan(d, { direct: true });
    sluitModaal();
    toast(`Je kijkt vandaag mee in ${d.nummer}.`);
    render({ behoudScroll: true });
  },

  // ---- Dossier: weergave en structuur -------------------------------------
  weergave(el) {
    const d = huidigDossier();
    if (!d) return;
    const naar = el.dataset.weergave === 'viiz' ? 'viiz' : 'bzi';
    d.weergave = naar;
    opslaan(d);
    const tab = route.tab;
    const nieuweTab = naar === 'bzi' ? (NAAR_BZI[tab] || tab || 'algemeen') : (NAAR_VIIZ[tab] || tab || 'klant');
    const ond = route.ondId ? `/${route.ondId}` : '';
    const doel = `#/dossier/${d.id}/${nieuweTab}${['bedrijf', 'balans', 'vw', 'diversen', 'samenvatting', 'bedrijven'].includes(nieuweTab) ? ond : ''}`;
    if (location.hash === doel) render({ behoudScroll: true });
    else location.hash = doel;
  },
  'bzi-nhg'(el) {
    const d = huidigDossier();
    d.weergave = weergaveDossier(d);
    d.kader = el.checked ? 'NHG' : 'ABN';
    logHistorie(d, `Kader gewijzigd naar ${el.checked ? 'NHG' : 'ABN AMRO (zonder NHG)'}`);
    opslaan(d);
    render({ behoudScroll: true });
  },
  'ond-toevoegen'() {
    const d = huidigDossier();
    d.ondernemingen = d.ondernemingen || [];
    d.ondernemingen.push(nieuweOnderneming(`Onderneming ${d.ondernemingen.length + 1}`));
    opslaan(d);
    render({ behoudScroll: true });
  },
  'hoofdbedrijf-toevoegen'() {
    const d = huidigDossier();
    d.ondernemingen = d.ondernemingen || [];
    const o = nieuweOnderneming('', 'BV', '', { activiteit: 'Holding' });
    d.ondernemingen.push(o);
    logHistorie(d, 'Hoofdbedrijf toegevoegd');
    opslaan(d);
    location.hash = `#/dossier/${d.id}/bedrijven/${o.id}`;
  },
  'deelneming-toevoegen'(el) {
    const d = huidigDossier();
    const o = nieuweOnderneming('', 'BV', '', { parentId: el.dataset.ouder, direct: false });
    d.ondernemingen.push(o);
    opslaan(d);
    render({ behoudScroll: true });
  },
  async 'ond-verwijderen'(el) {
    const d = huidigDossier();
    const o = d.ondernemingen.find((x) => x.id === el.dataset.ond);
    if (!o || !(await bevestig(`Onderneming "${o.naam || '(naamloos)'}" en alle ingevoerde cijfers verwijderen?`, 'Verwijderen'))) return;
    d.ondernemingen = d.ondernemingen.filter((x) => x.id !== o.id);
    d.ondernemingen.forEach((x) => {
      if (x.parentId === o.id) x.parentId = o.parentId || '';
      x.extraParents = (x.extraParents || []).filter((p) => p.id !== o.id);
      Object.values(x.jaren || {}).forEach((j) => {
        if (j?.geldstromen?.ontvangenFee) delete j.geldstromen.ontvangenFee[o.id];
        if (j?.geldstromen?.ontvangenDividend) delete j.geldstromen.ontvangenDividend[o.id];
      });
    });
    Object.values(d.ib || {}).forEach((j) => { if (j?.perOnd) delete j.perOnd[o.id]; });
    (d.zk || []).forEach((x) => { if (x.ondId === o.id) x.ondId = ''; });
    if (d.salarisStrook) delete d.salarisStrook[o.id];
    if (d.notities?.financieelOnderneming) delete d.notities.financieelOnderneming[o.id];
    logHistorie(d, `Onderneming ${o.naam || '(naamloos)'} verwijderd`);
    opslaan(d);
    render({ behoudScroll: true });
  },
  'extra-ouder-toevoegen'(el) {
    const d = huidigDossier();
    const o = ondVan(d, el.dataset.ond);
    if (!o) return;
    o.extraParents = o.extraParents || [];
    o.extraParents.push({ id: '', pct: '' });
    opslaan(d);
    render({ behoudScroll: true });
  },
  'extra-ouder-weg'(el) {
    const d = huidigDossier();
    const o = ondVan(d, el.dataset.ond);
    if (!o) return;
    o.extraParents.splice(Number(el.dataset.index), 1);
    opslaan(d);
    render({ behoudScroll: true });
  },
  'bzi-tm'(el) {
    const d = huidigDossier();
    const o = ondVan(d, el.dataset.ond);
    const y = Number(el.dataset.jaar);
    const m = Number(el.value) || 12;
    if (!o) return;
    // De periode geldt voor alle ondernemingen in het dossier (dezelfde tussentijdse periode).
    (d.ondernemingen || []).forEach((x) => {
      x.jaren = x.jaren || {};
      x.jaren[y] = x.jaren[y] || {};
      const start = x.startdatum && String(x.startdatum).startsWith(String(y)) ? x.startdatum : `${y}-01-01`;
      x.jaren[y].van = start;
      x.jaren[y].tot = `${y}-${String(m).padStart(2, '0')}-${laatsteDagMaand(y, m)}`;
      if (!x.jaren[y].status) x.jaren[y].status = m === 12 ? 'concept' : 'tussentijds';
    });
    opslaan(d);
    render({ behoudScroll: true });
  },

  // ---- Dossier: notities ---------------------------------------------------
  'notities-paneel'() {
    zetNotitiesVerborgen(!ui.notitiesVerborgen);
    render({ behoudScroll: true });
  },
  'notitie-toggle'(el) {
    toggleNotitie(el.dataset.veld);
    render({ behoudScroll: true });
  },
  'notities-ond'(el) {
    ui.bziNotitiesOnd = el.value;
    render({ behoudScroll: true });
  },
  'format-invoegen'(el) {
    const d = huidigDossier();
    const pad = el.dataset.pad;
    const format = FORMATS[el.dataset.format] || '';
    const huidig = getPath(d, pad) || '';
    const nieuwT = huidig.trim() ? `${huidig.trimEnd()}\n\n${format}` : format;
    setPath(d, pad, nieuwT);
    opslaan(d);
    const ta = document.querySelector(`textarea[data-bind="${CSS.escape(pad)}"]`);
    if (ta) { ta.value = nieuwT; ta.focus(); delete ta.dataset.ingevoegd; }
  },
  'concept-financieel'(el) {
    const d = huidigDossier();
    const r = resultaat || bereken(d);
    const tekst = conceptFinancieel(d, r, el.dataset.ond);
    if (!tekst) return;
    voegNotitieToe(d, `notities.financieelOnderneming.${el.dataset.ond}`, tekst, `--- Concept uit invoer (${fmt.datum(todayISO())}) ---`);
    ui.notitiesOpen.add('financieel');
    ui.bziNotitiesOnd = el.dataset.ond;
    toast('Concept toegevoegd aan de financiële informatie. Vul aan en controleer.');
    render({ behoudScroll: true });
  },
  'organogram-invoegen'() {
    const d = huidigDossier();
    voegNotitieToe(d, 'notities.algemeen', conceptAlgemeen(d), 'Organogram');
    ui.notitiesOpen.add('algemeen');
    toast('Organogram toegevoegd aan de algemene informatie.');
    render({ behoudScroll: true });
  },
  'og-weergave'(el) {
    zetOrganogramWeergave(el.dataset.weergave);
    render({ behoudScroll: true });
  },
  'og-download'() {
    const d = huidigDossier();
    const svg = organogramSVG(organogramGraaf(d), { losstaand: true });
    downloadBestand(`${d.nummer || 'dossier'}-organogram.svg`, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, 'image/svg+xml');
  },
  'og-knoop-toevoegen'() {
    const d = huidigDossier();
    d.organogram = d.organogram || {};
    d.organogram.knopen = d.organogram.knopen || [];
    d.organogram.knopen.push({ id: uid('k'), soort: 'persoon', naam: '', toelichting: '' });
    opslaan(d);
    render({ behoudScroll: true });
  },
  async 'og-knoop-weg'(el) {
    const d = huidigDossier();
    const k = d.organogram?.knopen?.[Number(el.dataset.index)];
    if (!k || !(await bevestig(`"${k.naam || 'Deze partij'}" en de lijnen ernaartoe verwijderen?`, 'Verwijderen'))) return;
    d.organogram.knopen.splice(Number(el.dataset.index), 1);
    d.organogram.lijnen = (d.organogram.lijnen || []).filter((l) => l.van !== k.id && l.naar !== k.id);
    (d.geldstromenExtra || []).forEach((x) => { if (x.van === k.id) x.van = ''; if (x.naar === k.id) x.naar = ''; });
    opslaan(d);
    render({ behoudScroll: true });
  },
  'og-lijn-toevoegen'() {
    const d = huidigDossier();
    d.organogram = d.organogram || {};
    d.organogram.lijnen = d.organogram.lijnen || [];
    d.organogram.lijnen.push({ id: uid('l'), van: '', naar: '', pct: null, soort: 'aandelen' });
    opslaan(d);
    render({ behoudScroll: true });
  },
  'og-lijn-weg'(el) {
    const d = huidigDossier();
    d.organogram?.lijnen?.splice(Number(el.dataset.index), 1);
    opslaan(d);
    render({ behoudScroll: true });
  },
  'og-situatie-toevoegen'() {
    const d = huidigDossier();
    const r = resultaat || bereken(d);
    d.organogram = d.organogram || {};
    d.organogram.situaties = d.organogram.situaties || [];
    d.organogram.situaties.push({ id: uid('s'), titel: `Situatie tot en met ${r.T3}`, tekst: organogramTekst(d) });
    opslaan(d);
    toast('Huidige structuur vastgelegd; pas titel en tekst aan naar de eerdere situatie.');
    render({ behoudScroll: true });
  },
  async 'og-situatie-weg'(el) {
    const d = huidigDossier();
    if (!(await bevestig('Deze situatie verwijderen?', 'Verwijderen'))) return;
    d.organogram?.situaties?.splice(Number(el.dataset.index), 1);
    opslaan(d);
    render({ behoudScroll: true });
  },
  'gs-toevoegen'() {
    const d = huidigDossier();
    d.geldstromenExtra = Array.isArray(d.geldstromenExtra) ? d.geldstromenExtra : [];
    d.geldstromenExtra.push({ id: uid('gs'), van: '', naar: '', soort: 'fee', perJaar: {}, toelichting: '' });
    opslaan(d);
    render({ behoudScroll: true });
  },
  async 'gs-weg'(el) {
    const d = huidigDossier();
    if (!(await bevestig('Deze geldstroom verwijderen?', 'Verwijderen'))) return;
    d.geldstromenExtra?.splice(Number(el.dataset.index), 1);
    opslaan(d);
    render({ behoudScroll: true });
  },
  async 'kopieer-tsv'(el) {
    const bron = document.getElementById(el.dataset.doel);
    const tekst = bron?.value || bron?.textContent || '';
    if (!tekst) return;
    try {
      await navigator.clipboard.writeText(tekst);
      toast('Gekopieerd; plak in Excel of in de notities.');
    } catch {
      downloadBestand(`${el.dataset.doel}.txt`, tekst, 'text/plain');
    }
  },
  'boekhouder-toevoegen'() {
    const d = huidigDossier();
    d.notities = d.notities || {};
    d.notities.boekhouder = d.notities.boekhouder || { optie: '1', lijst: [] };
    d.notities.boekhouder.lijst = d.notities.boekhouder.lijst || [];
    d.notities.boekhouder.lijst.push({ naam: '', kvk: '' });
    opslaan(d);
    render({ behoudScroll: true });
  },
  'boekhouder-weg'(el) {
    const d = huidigDossier();
    d.notities?.boekhouder?.lijst?.splice(Number(el.dataset.index), 1);
    opslaan(d);
    render({ behoudScroll: true });
  },
  'kopieer-notities': async () => {
    const d = huidigDossier();
    const tekst = dossierNotitiesTekst(d, resultaat || bereken(d));
    try {
      await navigator.clipboard.writeText(tekst);
      toast('Dossiernotities gekopieerd.');
    } catch {
      downloadBestand(`${d.nummer}-dossiernotities.txt`, tekst, 'text/plain');
    }
  },

  // ---- Dossier: invoer -------------------------------------------------------
  modus(el) {
    zetUitgebreid(el.dataset.modus === 'uitgebreid');
    render({ behoudScroll: true });
  },
  'detail-toggle'(el) {
    const k = el.dataset.sleutel;
    if (ui.open.has(k)) ui.open.delete(k); else ui.open.add(k);
    render({ behoudScroll: true });
  },
  'toggle-extra'() {
    document.getElementById('rooster')?.classList.toggle('toon-extra');
  },
  'zk-toevoegen'() {
    const d = huidigDossier();
    d.zk = Array.isArray(d.zk) ? d.zk : [];
    d.zk.push({ id: uid('zk'), soort: 'krediet', kredietgever: '', omschrijving: '', ondId: '', maandlast: null, saldo: null, gedragenDoor: 'onderneming', status: 'lopend', afgelostIn: '' });
    opslaan(d);
    render({ behoudScroll: true });
  },
  async 'zk-verwijderen'(el) {
    const d = huidigDossier();
    if (!(await bevestig('Dit krediet verwijderen?', 'Verwijderen'))) return;
    d.zk.splice(Number(el.dataset.index), 1);
    opslaan(d);
    render({ behoudScroll: true });
  },
  'correctie-open'(el) {
    const d = huidigDossier();
    openCorrectieModaal(d, el.dataset.ond, Number(el.dataset.jaar), el.dataset.lijst);
  },
  'correctie-toevoegen'() {
    const d = huidigDossier();
    const ondId = modaalVeld('ond');
    const y = Number(modaalVeld('jaar'));
    const lijstNaam = modaalVeld('lijst');
    const bedragW = parseBedrag(modaalVeld('bedrag'));
    if (bedragW === null || bedragW === 0) { toast('Vul een bedrag in.'); return; }
    const o = ondVan(d, ondId);
    if (!o) return;
    const sleutel = lijstNaam === 'winst' ? 'winstCorrecties' : 'vermogensCorrecties';
    o.jaren = o.jaren || {};
    o.jaren[y] = o.jaren[y] || {};
    o.jaren[y][sleutel] = o.jaren[y][sleutel] || [];
    const type = modaalVeld('type');
    o.jaren[y][sleutel].push({ type, bedrag: bedragW, toelichting: modaalVeld('toelichting').trim() });
    const defs = lijstNaam === 'winst' ? WINST_CORRECTIES : VERMOGENS_CORRECTIES;
    logHistorie(d, `${defs[type]?.label || type} ${y} toegevoegd bij ${o.naam}: ${fmt.eur(bedragW)}`);
    opslaan(d);
    render({ behoudScroll: true });
    openCorrectieModaal(d, ondId, y, lijstNaam);
  },
  'correctie-weg'(el) {
    const d = huidigDossier();
    const o = ondVan(d, el.dataset.ond);
    const y = Number(el.dataset.jaar);
    const sleutel = el.dataset.lijst === 'winst' ? 'winstCorrecties' : 'vermogensCorrecties';
    const lijstC = o?.jaren?.[y]?.[sleutel];
    if (!lijstC) return;
    const [weg] = lijstC.splice(Number(el.dataset.index), 1);
    if (weg) logHistorie(d, `Correctie ${y} verwijderd bij ${o.naam}: ${fmt.eur(weg.bedrag)}`);
    opslaan(d);
    render({ behoudScroll: true });
    openCorrectieModaal(d, o.id, y, el.dataset.lijst);
  },
  'va-samenstelling'(el) {
    const d = huidigDossier();
    openModaal(`Samenstelling vlottende activa ${el.dataset.jaar}`, modaalVaSamenstelling(d, el.dataset.ond, Number(el.dataset.jaar)),
      '<button class="knop" data-actie="va-opslaan">Overnemen</button>');
    toonVaTotaal();
  },
  'va-opslaan'() {
    const d = huidigDossier();
    const o = ondVan(d, modaalVeld('ond'));
    const y = Number(modaalVeld('jaar'));
    if (!o) return;
    const det = {};
    ['voorraden', 'vorderingen', 'rcDirectie', 'liquide', 'nietVrij'].forEach((k) => {
      const w = parseBedrag(modaalVeld(k));
      if (w !== null) det[k] = w;
    });
    o.jaren = o.jaren || {};
    o.jaren[y] = o.jaren[y] || {};
    o.jaren[y].bzi = o.jaren[y].bzi || {};
    o.jaren[y].bzi.vaDetail = det;
    o.jaren[y].bzi.va = num(det.voorraden) + num(det.vorderingen) + num(det.rcDirectie) + num(det.liquide);
    opslaan(d);
    sluitModaal();
    render({ behoudScroll: true });
  },
  'salaris-hulp'(el) {
    const d = huidigDossier();
    const r = resultaat || bereken(d);
    openModaal(`DGA-inkomen ${el.dataset.jaar} uit de salarisstrook`, modaalSalaris(d, r, el.dataset.ond, Number(el.dataset.jaar)),
      '<button class="knop" data-actie="salaris-overnemen">Overnemen als DGA-inkomen</button>');
    toonSalarisUitkomst();
  },
  'salaris-overnemen'() {
    const d = huidigDossier();
    const ondId = modaalVeld('ond');
    const y = Number(modaalVeld('jaar'));
    const s = toonSalarisUitkomst();
    if (!s || !num(parseBedrag(modaalVeld('maandsalaris')))) { toast('Vul het maandsalaris in.'); return; }
    d.ib = d.ib || {};
    setPath(d, `ib.${y}.perOnd.${ondId}.loon`, s.bedrag);
    d.salarisStrook = d.salarisStrook || {};
    d.salarisStrook[ondId] = {
      jaar: y, maandsalaris: parseBedrag(modaalVeld('maandsalaris')), vakantiegeldPct: parseBedrag(modaalVeld('vakantiegeldPct')) ?? 8,
      dertiendeMaand: !!modaalVeld('dertiendeMaand'), maanden: parseBedrag(modaalVeld('maanden')) ?? 12, strookTm: modaalVeld('strookTm'),
      f: s.f, bedrag: s.bedrag,
    };
    logHistorie(d, `DGA-inkomen ${y} bepaald uit de salarisstrook: ${s.f}`);
    opslaan(d);
    sluitModaal();
    render({ behoudScroll: true });
  },
  'woonbeleid-overnemen'(el) {
    const d = huidigDossier();
    const o = ondVan(d, el.dataset.ond);
    if (!o) return;
    const bedragW = Math.round(Number(el.dataset.bedrag) || 0);
    const r = resultaat || bereken(d);
    const h = r.inkomen?.perHoofdbedrijf?.find((x) => x.id === o.id);
    const onderbouwing = h?.onderbouwing || `Inkomen volgens de toets aan het Woonbeleid: ${fmt.eur(bedragW)}.`;
    o.afwijkend = { actief: true, bedrag: bedragW, motivatie: onderbouwing };
    voegNotitieToe(d, 'notities.conclusie', onderbouwing, `Afwijkend inkomen ${o.naam} (rekenkundige onderbouwing uit ZIB)`);
    logHistorie(d, `${o.naam}: inkomen volgens Woonbeleid${h?.overwinstMee ? ' inclusief overwinst' : ''} overgenomen als afwijkend inkomen (${fmt.eur(bedragW)})`);
    opslaan(d);
    toast('Overgenomen als afwijkend inkomen; de onderbouwing staat in de conclusie.');
    render({ behoudScroll: true });
  },
  'grootboek-open'(el) {
    const d = huidigDossier();
    const o = ondVan(d, el.dataset.ond);
    if (!o) return;
    gbVoorbeeld = null;
    const { jaren } = roosterJaren(d);
    openModaal(`Grootboek importeren: ${o.naam}`, `<p class="dempen">Plak een grootboek- of saldibalans (rekening; omschrijving; saldo of debet; credit) of kies een CSV-bestand. ZIB verdeelt de rekeningen volgens het decimale rekeningschema (zie Downloads) en toont eerst een voorbeeld.</p>
      <div class="raster-3" style="grid-template-columns:1fr 1fr 2fr">
        <label class="veld"><span>Jaar</span><select name="jaar">${[...jaren].reverse().map((y) => `<option${y === jaren[jaren.length - 2] ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
        <label class="veld"><span>Rechtsvorm</span><input value="${esc(RECHTSVORMEN[o.rechtsvorm]?.label || o.rechtsvorm)}" disabled></label>
        <label class="veld"><span>Bestand (.csv of .txt)</span><input type="file" name="bestand" accept=".csv,.txt,text/csv,text/plain"></label>
      </div>
      <label class="veld" style="margin-top:10px"><span>Of plak de regels</span><textarea name="tekst" rows="7" placeholder="110;Bank;12.345\n130;Debiteuren;8.200\n140;Crediteuren;-4.560\n800;Omzet;-150.000"></textarea></label>
      <div id="grootboek-voorbeeld" style="margin-top:12px"></div>
      <input type="hidden" name="ond" value="${esc(o.id)}">`,
    '<button class="knop sec" data-actie="grootboek-voorbeeld">Voorbeeld</button><button class="knop" data-actie="grootboek-overnemen" id="gb-over" disabled>Overnemen</button>', { breed: true });
  },
  async 'grootboek-voorbeeld'() {
    const d = huidigDossier();
    const m = document.getElementById('modaal');
    const o = ondVan(d, modaalVeld('ond'));
    if (!o || !m) return;
    let tekst = modaalVeld('tekst');
    const bestand = m.querySelector('input[name="bestand"]')?.files?.[0];
    if (bestand) {
      if (bestand.size > 2 * 1024 * 1024) { toast('Het bestand is groter dan 2 MB.'); return; }
      tekst = await bestand.text();
    }
    const { regels, fouten } = parseGrootboekTekst(tekst);
    if (!regels.length) { toast('Geen regels gevonden. Gebruik rekening; omschrijving; saldo.'); return; }
    const v = verdeelGrootboek(regels, { rechtsvorm: o.rechtsvorm });
    gbVoorbeeld = { ondId: o.id, jaar: Number(modaalVeld('jaar')), v, aantal: regels.length };
    vervangModaalInhoud('#grootboek-voorbeeld', grootboekVoorbeeldHTML(v, fouten));
    const knop = document.getElementById('gb-over');
    if (knop) knop.disabled = false;
  },
  async 'grootboek-overnemen'() {
    const d = huidigDossier();
    if (!gbVoorbeeld) return;
    const { ondId, jaar, v } = gbVoorbeeld;
    const o = ondVan(d, ondId);
    if (!o) return;
    if (!(await bevestig(`De balans en/of W&V van ${o.naam} over ${jaar} worden vervangen door de geïmporteerde bedragen. Doorgaan?`, 'Overnemen'))) return;
    o.jaren = o.jaren || {};
    const jd = o.jaren[jaar] || (o.jaren[jaar] = {});
    if (Object.keys(v.balans).length) {
      jd.balans = { ...v.balans, ...(isIngevuld(jd.balans?.liquideNietVrij) ? { liquideNietVrij: jd.balans.liquideNietVrij } : {}) };
      delete jd.balansDetail;
    }
    if (Object.keys(v.vw).length) {
      jd.vw = { ...v.vw, ...(isIngevuld(jd.vw?.prognose) ? { prognose: jd.vw.prognose } : {}), ...(isIngevuld(jd.vw?.fte) ? { fte: jd.vw.fte } : {}) };
      delete jd.vwDetail;
    }
    logHistorie(d, `Grootboek geïmporteerd voor ${o.naam} ${jaar} (${gbVoorbeeld.aantal} regels)`);
    gbVoorbeeld = null;
    opslaan(d);
    toast('Grootboek overgenomen. Controleer de posten en het balansverschil.');
    render({ behoudScroll: true });
  },
  'download-grootboeksjabloon'() {
    const tekst = 'Rekening;Omschrijving;Debet;Credit\n001;Gebouwen;100000;0\n011;Afschrijving gebouwen (cumulatief);0;20000\n040;Aandelenkapitaal;0;18000\n110;Bank;40000;0\n140;Crediteuren;0;12000\n800;Omzet;0;150000\n410;Directe loonkosten;50000;0\n';
    downloadBestand('zib-grootboek-sjabloon.csv', tekst, 'text/csv');
  },

  // ---- Dossier: fiattering ------------------------------------------------
  'gereed-melden'() {
    const d = huidigDossier();
    const p = state.profiel || {};
    if (!magFiatteren(p.accreditatie || 'Basis', d.niveau || 'Basis', 1)) { toast('Je accreditatie is niet toereikend om dit dossier gereed te melden.'); return; }
    d.fiat = d.fiat || {};
    d.fiat.eerste = { naam: mijnNaam(), datum: nowISO(), opmerking: d.fiat.concept1 || '' };
    delete d.fiat.concept1;
    delete d.fiat.tweede;
    d.teruggezet = false;
    zetStatus(d, 'beoordeling_2', 'gereed gemeld');
    opslaan(d, { direct: true });
    nieuw('taak', { titel: '2e beoordeling uitvoeren', dossierId: d.id, toegewezenAan: '', deadline: todayISO(), status: 'open', door: mijnNaam() });
    toast('Gereed gemeld. Het dossier staat onder Meekijken voor de 2e beoordeling.');
    render({ behoudScroll: true });
  },
  'fiat-akkoord'() {
    const d = huidigDossier();
    const ant = d.fiat?.tweede?.antwoorden || {};
    const open = FIAT_VRAGEN.filter(([k]) => !ant[k]?.antwoord);
    if (open.length) { toast('Beantwoord eerst alle vragen.'); return; }
    if (FIAT_VRAGEN.some(([k]) => ant[k].antwoord === 'Nee')) { toast('Er is een vraag met "Nee" beantwoord: geef geen akkoord.'); return; }
    d.fiat.tweede = { ...d.fiat.tweede, naam: mijnNaam(), datum: nowISO(), resultaat: 'akkoord' };
    d.fiatteur = mijnNaam();
    zetStatus(d, 'afgerond', '2e beoordeling akkoord');
    lijst('taak').filter((t) => t.dossierId === d.id && t.status === 'open' && /2e (fiat|beoordeling)/i.test(t.titel)).forEach((t) => { t.status = 'gereed'; opslaan(t); });
    opslaan(d, { direct: true });
    toast('Akkoord gegeven. Het dossier staat bij Afgeronde aanvragen.');
    render({ behoudScroll: true });
  },
  'fiat-niet-akkoord'() {
    const d = huidigDossier();
    const ant = d.fiat?.tweede?.antwoorden || {};
    if (!FIAT_VRAGEN.some(([k]) => ant[k]?.antwoord === 'Nee') && !d.fiat?.tweede?.opmerking) {
      toast('Geef aan welke vraag niet akkoord is of licht toe in de opmerking.');
      return;
    }
    d.fiat.tweede = { ...d.fiat.tweede, naam: mijnNaam(), datum: nowISO(), resultaat: 'niet_akkoord' };
    d.teruggezet = true;
    zetStatus(d, 'beoordeling_1', '2e beoordeling niet akkoord, teruggezet');
    nieuw('taak', { titel: 'Bevindingen 2e beoordeling verwerken', dossierId: d.id, toegewezenAan: d.fiat.eerste?.naam || d.behandelaar || '', deadline: todayISO(), status: 'open', door: mijnNaam() });
    opslaan(d, { direct: true });
    render({ behoudScroll: true });
  },
  async 'toon-versies'() {
    const d = huidigDossier();
    const el = document.getElementById('versies');
    if (!el) return;
    el.innerHTML = '<p class="dempen">Versies laden…</p>';
    try {
      const vs = await state.adapter.versions(d.id);
      el.innerHTML = vs.length ? `<table class="tabel" style="margin-top:10px"><thead><tr><th>Versie</th><th>Opgeslagen</th><th>Door</th><th></th></tr></thead><tbody>
        ${vs.map((v) => `<tr><td>${esc(v.version)}</td><td>${esc(fmt.tijdstip(v.at))}</td><td>${esc(v.door || '')}</td>
          <td><button class="knop link klein" data-actie="versie-herstellen" data-versie="${esc(v.version)}">Deze versie terugzetten</button></td></tr>`).join('')}</tbody></table>`
        : '<p class="dempen">Er zijn nog geen eerdere versies.</p>';
    } catch (e) {
      el.innerHTML = `<p class="dempen">Versies konden niet worden geladen: ${esc(e.message)}</p>`;
    }
  },
  async 'versie-herstellen'(el) {
    const d = huidigDossier();
    const v = Number(el.dataset.versie);
    if (!(await bevestig(`Versie ${v} terugzetten? De huidige inhoud wordt als nieuwe versie bewaard.`, 'Terugzetten'))) return;
    const oud = await state.adapter.getVersion(d.id, v);
    if (!oud) { toast('Versie niet gevonden.'); return; }
    const versie = d.version;
    Object.keys(d).forEach((k) => { delete d[k]; });
    Object.assign(d, oud, { version: versie });
    logHistorie(d, `Versie ${v} teruggezet`);
    opslaan(d, { direct: true });
    render({ behoudScroll: true });
  },
  afdrukken() {
    if (globalThis.ZIB_ARTIFACT) { toast('Afdrukken kan in de losse demo of je eigen installatie.'); return; }
    window.print();
  },
  'rapport-download'() {
    const d = huidigDossier();
    const rapport = document.querySelector('.rapport');
    if (!d || !rapport) return;
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport ${esc(d.nummer || '')}</title>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<div class="pagina">${rapport.outerHTML}</div>
</body>
</html>`;
    downloadBestand(`${d.nummer || 'dossier'}-rapport.html`, html, 'text/html');
  },
  async 'drive-koppel'() {
    const r = await synchroniseer();
    if (r) toast(r.opgehaald ? `Google Drive gekoppeld: ${r.opgehaald} ${r.opgehaald === 1 ? 'record' : 'records'} opgehaald.` : 'Google Drive gekoppeld: je dossiers staan in de map ZIB.');
  },
  async 'drive-sync'() {
    const r = await synchroniseer();
    if (r) toast(r.opgehaald ? `${r.opgehaald} ${r.opgehaald === 1 ? 'record' : 'records'} opgehaald uit Google Drive.` : 'Google Drive is bijgewerkt.');
  },
  'drive-uit'() {
    ontkoppel();
    toast('Google Drive ontkoppeld in deze browser. De bestanden in Drive blijven staan.');
  },
  async 'drive-rechten'() {
    if (!(await beheerRechten())) toast('Open het menu Rechten van deze pagina in claude.ai en zet Google Drive aan.');
  },
  'kopieer-download'() {
    const el = document.getElementById('download-tekst');
    if (!el) return;
    const selecteer = () => { el.focus(); el.select(); toast('Selecteer de tekst en kopieer met Ctrl+C (Cmd+C op een Mac).'); };
    try {
      navigator.clipboard.writeText(el.value).then(() => toast('Gekopieerd.'), selecteer);
    } catch {
      selecteer();
    }
  },

  // ---- Documenten ---------------------------------------------------------
  async 'doc-upload'() {
    const d = huidigDossier();
    const input = document.getElementById('doc-bestand');
    const bestand = input?.files?.[0];
    if (!bestand) { toast('Kies eerst een bestand.'); return; }
    if (bestand.size > 15 * 1024 * 1024) { toast('Het bestand is groter dan 15 MB.'); return; }
    const id = uid('doc');
    try {
      const res = await state.adapter.putFile(id, bestand);
      const rec = { id, type: 'document', dossierId: d.id, categorie: document.getElementById('doc-categorie').value,
        jaar: document.getElementById('doc-jaar').value, ondId: document.getElementById('doc-ond').value,
        naam: bestand.name, mime: bestand.type, grootte: bestand.size, opslag: res.opslag, door: mijnNaam(), aangemaakt: nowISO() };
      opslaan(rec, { direct: true });
      logHistorie(d, `Document toegevoegd: ${bestand.name}`);
      opslaan(d);
      toast('Document toegevoegd.');
      render({ behoudScroll: true });
    } catch (e) {
      toast(`Uploaden mislukt: ${e.message}`);
    }
  },
  async 'doc-download'(el) {
    const rec = get(el.dataset.id);
    try {
      const blob = await state.adapter.getFile(el.dataset.id);
      if (!blob) { toast('Het bestand is niet (meer) beschikbaar in deze opslag.'); return; }
      downloadBestand(rec?.naam || 'document', blob);
    } catch (e) {
      toast(`Openen mislukt: ${e.message}`);
    }
  },
  async 'doc-verwijderen'(el) {
    const rec = get(el.dataset.id);
    if (!rec || !(await bevestig(`Document "${rec.naam}" verwijderen?`, 'Verwijderen'))) return;
    try { await state.adapter.removeFile(rec.id); } catch { /* bestand ontbrak al */ }
    await verwijder(rec.id);
    render({ behoudScroll: true });
  },
  'mail-adviseur'() {
    const d = huidigDossier();
    const ontbrekend = ontbrekendeStukken(d);
    const adv = get(d.advieskantoorId);
    const tekst = `Beste ${adv?.contactpersoon || 'adviseur'},\n\nVoor de beoordeling van het zakelijk inkomen van ${naamAanvrager(d.aanvrager)} (dossier ${d.nummer}${d.leningnummer ? `, aanvraag ${d.leningnummer}` : ''}) hebben wij aanvullend de volgende stukken nodig:\n\n${ontbrekend.map((x) => `- ${x.naam}${x.geldigheid ? ` (${x.geldigheid.toLowerCase()})` : ''}`).join('\n')}\n\nWilt u deze aanleveren? Alvast bedankt.\n\nMet vriendelijke groet,\n${mijnNaam()}`;
    mailto({ aan: adv?.email || '', onderwerp: `Aanvullende stukken ${d.nummer} ${naamAanvrager(d.aanvrager)}`, bericht: tekst });
    if (['documenten_uploaden', 'controleren_documenten', 'opnieuw_controleren', 'beoordeling_1'].includes(d.status)) zetStatus(d, 'informatie_aanleveren');
    logHistorie(d, 'Ontbrekende stukken opgevraagd bij adviseur');
    opslaan(d);
  },

  // ---- Overige pagina's ------------------------------------------------------
  'nieuw-advieskantoor'() {
    nieuw('advieskantoor', { naam: 'Nieuw advieskantoor' });
    render({ behoudScroll: true });
  },
  async 'verwijder-record'(el) {
    if (!(await bevestig(el.dataset.vraag || 'Verwijderen?', 'Verwijderen'))) return;
    await verwijder(el.dataset.id);
    render({ behoudScroll: true });
  },
  'nieuwe-taak'() {
    const ds = lijst('dossier').filter((d) => !AFGEROND.includes(d.status));
    openModaal('Taak toevoegen', `<div class="raster-3" style="grid-template-columns:1fr">
      <label class="veld"><span>Taak</span><input name="titel"></label>
      <label class="veld"><span>Dossier</span><select name="dossier"><option value="">Geen</option>${ds.map((d) => `<option value="${esc(d.id)}">${esc(d.nummer)} ${esc(naamAanvrager(d.aanvrager))}</option>`).join('')}</select></label>
      <label class="veld"><span>Toegewezen aan</span><input name="wie" value="${esc(mijnNaam())}"></label>
      <label class="veld"><span>Deadline</span><input type="date" name="deadline" value="${esc(todayISO())}"></label>
    </div>`, '<button class="knop" data-actie="taak-aanmaken">Toevoegen</button>');
  },
  'taak-aanmaken'() {
    if (!modaalVeld('titel')) { toast('Geef de taak een omschrijving.'); return; }
    nieuw('taak', { titel: modaalVeld('titel'), dossierId: modaalVeld('dossier'), toegewezenAan: modaalVeld('wie'), deadline: modaalVeld('deadline'), status: 'open', door: mijnNaam() });
    sluitModaal();
    render({ behoudScroll: true });
  },
  'taak-toggle'(el) {
    const t = get(el.dataset.id);
    if (!t) return;
    t.status = t.status === 'gereed' ? 'open' : 'gereed';
    opslaan(t);
    if (el.dataset.blijf) { verversTabel(); return; }
    render({ behoudScroll: true });
  },
  'hulp-verstuur'() {
    const onderwerp = document.getElementById('hulp-onderwerp')?.value?.trim();
    const bericht = document.getElementById('hulp-bericht')?.value?.trim();
    if (!onderwerp) { toast('Vul een onderwerp in.'); return; }
    const t = nieuw('ticket', { onderwerp, bericht, status: 'open', door: mijnNaam(), reacties: [] });
    location.hash = `#/tickets/${t.id}`;
  },
  'open-ticket'(el) {
    location.hash = `#/tickets/${el.dataset.id}`;
  },
  'ticket-reageer'(el) {
    const t = get(el.dataset.id);
    const tekst = document.getElementById('ticket-reactie')?.value?.trim();
    if (!t || !tekst) return;
    t.reacties = t.reacties || [];
    t.reacties.push({ door: mijnNaam(), at: nowISO(), tekst });
    if (t.status === 'open') t.status = 'in behandeling';
    opslaan(t);
    render({ behoudScroll: true });
  },
  async export() {
    try {
      const json = await exporteer();
      downloadBestand(`zib-backup-${todayISO()}.json`, JSON.stringify(json, null, 2));
    } catch (e) {
      toast(`Back-up mislukt: ${e.message}`);
    }
  },
  async import(el) {
    const bestand = el.files?.[0];
    if (!bestand) return;
    try {
      const json = JSON.parse(await bestand.text());
      if (!Array.isArray(json.records)) throw new Error('Geen geldig ZIB-back-upbestand.');
      if (!(await bevestig(`${json.records.length} records terugzetten? Bestaande records met hetzelfde id worden overschreven.`, 'Terugzetten'))) return;
      const n = await importeer(json);
      toast(`${n} records teruggezet.`);
      render();
    } catch (e) {
      toast(`Terugzetten mislukt: ${e.message}`);
    }
  },
  'download-formats'() {
    const tekst = Object.entries(FORMATS).map(([k, v]) => `### ${k}\n${v}`).join('\n\n');
    downloadBestand('zib-formats-dossieraantekeningen.txt', tekst, 'text/plain');
  },
  'download-doclijst'(el) {
    const kader = el.dataset.kader;
    const jaar = new Date().getFullYear();
    const lijstje = documentenlijst({ soort: 'IKV', ondernemingen: [], loondienst: { meenemen: true } },
      { kader, T: [jaar - 3, jaar - 2, jaar - 1], C: jaar, heeftVPB: true, heeftSamenwerking: true, starter: true, meerdereBV: true, stilleReserves: true, box3: true, rc: true, zk: true, beroepsregister: true, leningDirectie: true, dividendbeleid: true, deelnemingen: true });
    const tekst = lijstje.map((x) => `- ${x.naam}\n  Wanneer: ${x.wanneer}${x.geldigheid ? `\n  Geldigheid: ${x.geldigheid}` : ''}`).join('\n');
    downloadBestand(`documentenlijst-${kader.toLowerCase()}.txt`, tekst, 'text/plain');
  },
  thema(el) {
    zetThema(el.value);
  },
  jaarvolgorde(el) {
    zetJaarVolgorde(el.value);
    toast(el.value === 'oud' ? 'Jaarkolommen: oudste jaar links.' : 'Jaarkolommen: meest recente jaar links.');
    render({ behoudScroll: true });
  },
  opslagvoorkeur(el) {
    zetOpslagvoorkeur(el.value);
    toast('De voorkeur wordt actief na herladen.');
    setTimeout(() => location.reload(), 900);
  },
  async 'demo-laden'() {
    await laadDemo();
    toast('Demodossiers geladen.');
    render();
  },
  async 'lokaal-wissen'() {
    const driveTekst = globalThis.ZIB_ARTIFACT && drive.status === 'ok'
      ? ' De versies in Google Drive blijven staan en komen bij de volgende synchronisatie terug; ontkoppel Google Drive eerst als je dat niet wilt.' : '';
    if (!(await bevestig(`Alle lokale gegevens (dossiers, documenten, taken) definitief wissen? Maak eerst een back-up als je ze wilt bewaren.${driveTekst}`, 'Alles wissen'))) return;
    await wisLokaal();
    toast('Lokale gegevens gewist.');
    render();
  },
  login() {
    const naam = document.getElementById('login-naam')?.value?.trim();
    if (!naam) { toast('Vul je naam in.'); return; }
    bewaarProfiel({ naam, initialen: document.getElementById('login-initialen')?.value?.trim() || naam.split(/\s+/).map((x) => x[0]).join(''),
      accreditatie: document.getElementById('login-accreditatie')?.value || 'Medium', rol: 'acceptant', email: '' });
    location.hash = '#/klanten';
  },
  'log-uit'() {
    logUit();
  },
  'verberg-banner'() {
    try { sessionStorage.setItem('zib.banner.lokaal', '1'); } catch { /* geen opslag */ }
    render({ behoudScroll: true });
  },
  'opnieuw-opslaan'() {
    const d = huidigDossier();
    if (d) opslaan(d, { direct: true });
    bewaarAlles();
  },
  'conflict-herladen'() {
    losConflictOp('herladen');
    render({ behoudScroll: true });
  },
  'conflict-overschrijven'() {
    losConflictOp('overschrijven');
    render({ behoudScroll: true });
  },
  'sluit-modaal'() {
    sluitModaal();
  },
};

function voerUit(actie, el, e) {
  const fn = ACTIES[actie];
  if (!fn) return;
  try {
    const res = fn(el, e);
    if (res && typeof res.catch === 'function') res.catch((err) => toast(err.message || String(err)));
  } catch (err) {
    console.error(err);
    toast(err.message || String(err));
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
(async () => {
  try {
    await start();
    if (!location.hash) location.hash = state.profiel || state.modus === 'cloud' ? '#/klanten' : '#/login';
    render();
    initDrive();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="pagina"><div class="melding niet_akkoord">ZIB kon niet starten: ${esc(e.message || String(e))}</div></div>`;
  }
})();

export { samenvatting, MAANDEN_KORT };
