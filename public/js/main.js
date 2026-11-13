import {
  state, start, lijst, get, opslaan, nieuw, verwijder, opWijziging, bewaarProfiel, logUit, volgendDossiernummer,
  logHistorie, exporteer, importeer, laadDemo, laadBeleidsvoorbeelden, wisLokaal, zetOpslagvoorkeur, losConflictOp, bewaarAlles,
  heeftOnopgeslagen, mijnNaam, bewaarDossier,
} from './state.js';
import { bereken, salarisPeriode, organogramGraaf, organogramTekst } from './engine/index.js';
import {
  parseBedrag, setPath, getPath, esc, fmt, todayISO, uid, nowISO, naamAanvrager, debounce, num, clone, isIngevuld,
} from './util.js';
import { balk, banners, opslagStatusHTML, driveStatusHTML } from './views/layout.js';
import { initDrive, synchroniseer, ontkoppel, beheerRechten, opDriveWijziging, drive } from './store/drive.js';
import {
  renderAanvragen, tabelAanvragen, rijenAanvragen, filterActief, zichtbareKolommen, filters, modaalNieuweKlant, modaalStatus,
  modaalHypotheeknummer, modaalTaken, modaalKopieren, modaalVerwijderen, modaalEerdereAanvragen, modaalHerbeoordeling,
  modaalZoekAfgerond, samenvatting,
} from './views/aanvragen.js';
import { renderDossier, kopVoor, calcWaarde, docAanwezig, NAAR_BZI, NAAR_VIIZ, roosterJaren, weergaveDossier, TABS, tabsHTML } from './views/dossier.js';
import { modaalCorrectie, correctieLijstHTML, modaalVaSamenstelling, modaalSalaris, MAANDEN_KORT } from './views/bzi.js';
import { bziVerschil, maakBziCsv } from './views/bziinvoer.js';
import {
  renderDocumenten, renderAdvieskantoren, renderMeekijken, renderFAQ, renderHulp, renderToetskaders,
  renderDownloads, renderTickets, renderTicket, renderMijnGegevens, renderLogin, renderEmail, emailFormulier,
} from './views/paginas.js';
import { renderTaken, rijenTaken, tabelTaken } from './views/taken.js';
import { openModaal, sluitModaal, waardeUit, toast, downloadBestand, leeg, bevestig, vervangModaalInhoud, icoon } from './views/ui.js';
import { FORMATS, FIAT_VRAGEN } from './views/formats.js';
import { dossierNotitiesTekst, conceptFinancieel, conceptAlgemeen } from './views/rapport.js';
import { documentenlijst } from './schema/documenten.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES } from './schema/correcties.js';
import { pasDetailToe, DOSSIER_STATUSSEN, AFGEROND, BALANS_RIJEN, VW_RIJEN } from './schema/fields.js';
import { parseGrootboekTekst, verdeelGrootboek } from './schema/rekeningschema.js';
import { RECHTSVORMEN, KADERS, kaderLabel } from './engine/kaders.js';
import { bewaarDossierbeleid } from './dossierbeleid.js';
import { leesBeleidsconcept, werkBeleidsconceptBij, wisBeleidsconcept } from './views/dossierbeleid.js';
import { actorVoor, beoordelingsInhoud, fiatBlokkade, getekendeDossierfase, inkomensWijzigingPad, magFiatteren, pasInkomensWijzigingToe, wisInkomensWijzigingen } from './engine/beoordelingsrechten.js';
import { blokkadeUitkomst } from './fiatteringsuitkomst.js';
import {
  ui, zetUitgebreid, zetPaginagrootte, toggleNotitie, zetNotitiesVerborgen, zetJaarVolgorde, zetOrganogramWeergave,
  zetKolommen, zetFormules, zetRapportModus, noteerRecent, zetKlap,
} from './views/uistate.js';
import { plakRooster } from './lijsten.js';
import { openZoeken, sluitZoeken } from './views/zoeken.js';
import { organogramSVG } from './views/organogram.js';
import { heeftControleperiode, werkKerninvoerTellingBij } from './views/kerninvoer.js';
import { leesKernbedrag, leesKerncijfers } from './schema/kernimport.js';
import { initBroncijfersImport, laadPriveStart } from './broncijfers-import.js';
import { biedBrowseroverdrachtAan } from './browseroverdracht.js';
import { renderBronarchief } from './views/bronarchief.js';

const app = document.getElementById('app');
let route = { pagina: 'aanvragen' };
let resultaat = null;
let gbVoorbeeld = null;
let dossierconcept = null;
let dossierOpslag = null;
let actieveHash = '';
let geschiedenisNummer = 0;
let herstelNavigatie = null;
let interneNavigatie = '';
let vertrekKeuze = null;

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
function parseRoute(hash = location.hash) {
  const [h, zoek] = hash.replace(/^#\/?/, '').split('?');
  const [p = '', a, b, c] = h.split('/').map((x) => decodeURIComponent(x || ''));
  switch (p) {
    case '':
    case 'klanten':
    case 'aanvragen': return { pagina: 'aanvragen', afgerond: a === 'afgerond' };
    case 'dossier': return { pagina: 'dossier', id: a, tab: b || '', ondId: c || '', veld: new URLSearchParams(zoek).get('veld') };
    case 'tickets': return a ? { pagina: 'ticket', id: a } : { pagina: 'tickets' };
    case 'bronarchief': return { pagina: 'bronarchief', id: a };
    default: return { pagina: p };
  }
}

const MENU_KEY = {
  aanvragen: 'klanten', documenten: 'documenten', advieskantoren: 'advieskantoren', taken: 'taken', 'mijn-taken': 'mijn-taken',
  hulp: 'hulp', meekijken: 'meekijken', faq: 'faq', toetskaders: 'toetskaders', downloads: 'downloads', tickets: 'tickets', ticket: 'tickets',
  'mijn-gegevens': 'mijn-gegevens', 'e-mail': 'e-mail',
};

function dossierVoorRoute(id) {
  const opgeslagen = get(id);
  if (!opgeslagen || opgeslagen.deleted) return null;
  if (dossierconcept?.record.id !== id) {
    dossierconcept = { record: clone(opgeslagen), basis: JSON.stringify(opgeslagen), wijziging: false,
      inkomen: new Map(), documenten: new Map(), verwijderd: new Map(), gekozenBestand: null };
  } else if (!conceptGewijzigd() && dossierconcept.basis !== JSON.stringify(opgeslagen)) {
    dossierconcept.record = clone(opgeslagen);
    dossierconcept.basis = JSON.stringify(opgeslagen);
  }
  return dossierconcept.record;
}

function huidigDossier() {
  return route.pagina === 'dossier' ? dossierVoorRoute(route.id) : null;
}

function conceptGewijzigd() {
  const c = dossierconcept;
  return !!(c && (c.wijziging || c.inkomen.size || c.documenten.size || c.verwijderd.size || c.gekozenBestand || leesBeleidsconcept(c.record.id)));
}

function werkDossierconceptBij(d) {
  if (dossierconcept?.record !== d) return;
  dossierconcept.wijziging = dossierconcept.basis !== JSON.stringify(d);
  werkBewaarstatusBij();
}

function werkBewaarstatusBij() {
  if (route.pagina !== 'dossier') return;
  const gewijzigd = conceptGewijzigd();
  const tekst = dossierOpslag ? 'Bezig met opslaan…' : gewijzigd ? 'Niet opgeslagen wijzigingen' : 'Alle wijzigingen opgeslagen';
  for (const el of app.querySelectorAll('[data-dossier-bewaarstatus]')) {
    el.textContent = tekst;
    el.dataset.status = dossierOpslag ? 'bezig' : gewijzigd ? 'gewijzigd' : 'opgeslagen';
  }
  for (const knop of app.querySelectorAll('[data-actie="dossier-opslaan"], [data-dossierbeleid] button[type="submit"]')) knop.disabled = !!dossierOpslag;
  const balkStatus = document.getElementById('opslagstatus');
  if (balkStatus && gewijzigd && state.opslag.status === 'opgeslagen') {
    balkStatus.innerHTML = '<span class="opslagstatus bezig"><i></i><span class="tekst">Niet opgeslagen</span></span>';
  } else if (balkStatus) balkStatus.innerHTML = opslagStatusHTML();
}

function conceptDocumenten(d) {
  const c = dossierconcept?.record.id === d.id ? dossierconcept : null;
  return [...lijst('document').filter((x) => x.dossierId === d.id && !c?.verwijderd.has(x.id)),
    ...[...(c?.documenten.values() || [])].map(({ doc }) => ({ ...doc, concept: true }))];
}

const inkomensVelden = ['keuze', 'bedrag', 'motivatie', 'onderbouwing', 'bestendigheid', 'documentatie'];

function inkomensVeldenIn(blok) {
  return inkomensVelden.map((key) => [key, blok.querySelector(`[name="inkomens-${key}"]`)]).filter(([, el]) => el);
}

function werkLosseVeldenBij(el) {
  const c = dossierconcept;
  if (!c || dossierOpslag) return false;
  const blok = el.closest('[data-inkomenswijziging]');
  if (blok) {
    const knop = blok.querySelector('[data-actie="inkomenswijziging"]');
    if (!knop) return false;
    const id = knop.dataset.ond || '';
    const velden = inkomensVeldenIn(blok);
    if (velden.some(([, veld]) => veld.value !== veld.dataset.zibBegin)) {
      c.inkomen.set(id, Object.fromEntries(velden.map(([key, veld]) => [key, veld.value])));
    } else c.inkomen.delete(id);
    werkBewaarstatusBij();
    return true;
  }
  if (['doc-bestand', 'doc-jaar', 'doc-ond', 'doc-categorie'].includes(el.id)) {
    const bestand = document.getElementById('doc-bestand')?.files?.[0] || (el.id === 'doc-bestand' ? null : c.gekozenBestand?.bestand);
    c.gekozenBestand = bestand ? { bestand, categorie: document.getElementById('doc-categorie').value,
      jaar: document.getElementById('doc-jaar').value, ondId: document.getElementById('doc-ond').value } : null;
    werkBewaarstatusBij();
    return true;
  }
  return false;
}

function herstelLosseVelden() {
  const c = dossierconcept;
  if (route.pagina !== 'dossier' || !c) return;
  for (const blok of app.querySelectorAll('[data-inkomenswijziging]')) {
    const id = blok.querySelector('[data-actie="inkomenswijziging"]')?.dataset.ond || '';
    const waarden = c.inkomen.get(id);
    for (const [key, el] of inkomensVeldenIn(blok)) {
      el.dataset.zibBegin = el.value;
      if (waarden && Object.hasOwn(waarden, key)) el.value = waarden[key];
    }
    if (waarden) blok.closest('details')?.setAttribute('open', '');
  }
  const invoer = document.getElementById('doc-bestand');
  if (c.gekozenBestand && invoer) {
    const { bestand, categorie, jaar, ondId } = c.gekozenBestand;
    if (typeof DataTransfer !== 'undefined') {
      try {
        const bestanden = new DataTransfer();
        bestanden.items.add(bestand);
        invoer.files = bestanden.files;
      } catch { /* Een bewaard bestand kan ook zonder opnieuw gevulde browserinvoer worden opgeslagen. */ }
    }
    document.getElementById('doc-categorie').value = categorie;
    document.getElementById('doc-jaar').value = jaar;
    document.getElementById('doc-ond').value = ondId;
  }
}

function verwerkInkomensbesluit(d, id, invoer) {
  const uitkomst = pasInkomensWijzigingToe(d, actorVoor(state.profiel, state.me), {
    ...invoer, ondId: id, soort: invoer.keuze, bedrag: leesKernbedrag(invoer.bedrag),
  });
  if (uitkomst.gewijzigd) logHistorie(d, uitkomst.tekst);
  return uitkomst;
}

function voegDocumentConceptToe(c) {
  const invoer = c.gekozenBestand;
  if (!invoer) return '';
  if (invoer.bestand.size > 15 * 1024 * 1024) return 'Het bestand is groter dan 15 MB.';
  const { bestand, categorie, jaar, ondId } = invoer;
  const id = uid('doc');
  const doc = { id, type: 'document', dossierId: c.record.id, categorie, jaar, ondId,
    naam: bestand.name, mime: bestand.type, grootte: bestand.size, door: mijnNaam(), aangemaakt: nowISO() };
  c.gekozenBestand = null;
  logHistorie(c.record, `Document toegevoegd: ${bestand.name}`);
  c.documenten.set(id, { doc, bestand, historie: c.record.historie[0] });
  werkDossierconceptBij(c.record);
  return '';
}

async function schrijfDocumentConcepten(c) {
  for (const [id, { doc, bestand }] of c.documenten) {
    const res = await state.adapter.putFile(id, bestand);
    const opgeslagen = await bewaarDossier({ ...doc, opslag: res.opslag });
    if (!opgeslagen) throw new Error(`Het document ${doc.naam} is nog niet opgeslagen.`);
    c.documenten.delete(id);
  }
  for (const [id, doc] of c.verwijderd) {
    await state.adapter.remove(id, doc.version);
    state.records.delete(id);
    c.verwijderd.delete(id);
    await state.adapter.removeFile(id).catch(() => {});
  }
}

function conceptWissen() {
  if (dossierconcept) wisBeleidsconcept(dossierconcept.record.id);
  dossierconcept = null;
}

function stempelFiatteur(actor) {
  return { naam: actor.naam, datum: nowISO(), ...(actor.email ? { email: actor.email } : {}) };
}

/** Eén bevestigde schrijfhandeling per dossier. Bij een fout blijft de invoer beschikbaar. */
async function dossierOpslaan({ aanpassen, tekenOpnieuw = true, stil = false } = {}) {
  const d = huidigDossier();
  if (!d || dossierOpslag) return false;
  const c = dossierconcept;
  const bestandFout = voegDocumentConceptToe(c);
  if (bestandFout) { toast(bestandFout); return false; }
  if (!conceptGewijzigd() && !aanpassen) { if (!stil) toast('Alle wijzigingen zijn al opgeslagen.'); return true; }
  const volgend = clone(d);
  const basis = JSON.parse(c.basis);
  const beleid = leesBeleidsconcept(d.id);
  const gewijzigdBeleid = beleid && bewaarDossierbeleid(volgend, beleid);
  if (gewijzigdBeleid) {
    const actor = actorVoor(state.profiel, state.me);
    const vereist = getekendeDossierfase(basis) && basis.status !== 'beoordeling_2' ? 2 : 1;
    if ((getekendeDossierfase(basis) || basis.fiat?.eerste || basis.fiat?.tweede)
      && (actor.rol === 'adviseur' || !magFiatteren(actor.accreditatie, basis.niveau, vereist))) {
      toast('Laat een bevoegde fiatteur dit toetskader wijzigen.');
      return false;
    }
    if (volgend.status !== d.status) volgend.statusDatum = nowISO();
    logHistorie(volgend, 'Toetskader of aanvraagsoort gewijzigd');
  }
  if (!gewijzigdBeleid && getekendeDossierfase(basis)
    && JSON.stringify(beoordelingsInhoud(basis)) !== JSON.stringify(beoordelingsInhoud(volgend))) {
    toast('De dossierinhoud is vergrendeld tijdens de tweede beoordeling en na akkoord.');
    return false;
  }
  for (const [id, invoer] of c.inkomen) {
    const { fout } = verwerkInkomensbesluit(volgend, id, invoer);
    if (fout) { toast(fout); return false; }
  }
  if (aanpassen) {
    const fout = aanpassen(volgend);
    if (fout) { toast(fout); return false; }
  }
  dossierOpslag = c;
  const tabinhoud = document.getElementById('tabinhoud');
  if (tabinhoud) tabinhoud.inert = true;
  werkBewaarstatusBij();
  try {
    if (JSON.stringify(volgend) !== c.basis) {
      const bewaard = await bewaarDossier(volgend);
      if (!bewaard) { toast('Opslaan is niet gelukt. Je invoer staat nog in dit venster.'); return false; }
      c.record = clone(bewaard);
      c.basis = JSON.stringify(bewaard);
    }
    c.wijziging = false;
    c.inkomen.clear();
    wisBeleidsconcept(d.id);
    await schrijfDocumentConcepten(c);
    if (!stil) toast('Dossier opgeslagen.');
    return true;
  } catch (e) {
    toast(`Opslaan is niet voltooid: ${e.message}. Probeer opnieuw op te slaan.`);
    return false;
  } finally {
    dossierOpslag = null;
    if (tabinhoud) tabinhoud.inert = false;
    if (tekenOpnieuw && route.id === d.id) render({ behoudScroll: true });
    else werkBewaarstatusBij();
  }
}

export function render({ behoudScroll = false } = {}) {
  const y = window.scrollY;
  route = parseRoute(actieveHash || location.hash);
  if (!state.profiel && state.modus === 'lokaal' && route.pagina !== 'login') {
    location.hash = '#/login';
    return;
  }
  if (route.pagina === 'login') {
    if (state.modus === 'cloud') { navigeerZonderVraag('#/klanten'); return; }
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
      const d = huidigDossier();
      if (!d) { inhoud = leeg('Dit dossier bestaat niet (meer).', '<a class="knop" href="#/klanten">Naar aanvragen</a>'); break; }
      resultaat = bereken(d);
      noteerRecent(d.id);
      inhoud = renderDossier(d, route.tab, route.ondId, resultaat, { documenten: conceptDocumenten(d) });
      titel = `${d.nummer} ${naamAanvrager(d.aanvrager)}`;
      breed = weergaveDossier(d) === 'bzi';
      break;
    }
    case 'documenten': inhoud = renderDocumenten(); titel = 'Documenten'; break;
    case 'advieskantoren': inhoud = renderAdvieskantoren(); titel = 'Advieskantoren'; break;
    case 'taken': inhoud = renderTaken(false); titel = 'Alle taken'; breed = true; break;
    case 'mijn-taken': inhoud = renderTaken(true); titel = 'Mijn taken'; breed = true; break;
    case 'hulp': inhoud = renderHulp(); titel = 'Hulp nodig?'; break;
    case 'meekijken': inhoud = renderMeekijken(); titel = 'Meekijken'; break;
    case 'faq': inhoud = renderFAQ(); titel = 'FAQ'; break;
    case 'toetskaders': inhoud = renderToetskaders(); titel = 'Toetskaders'; breed = true; break;
    case 'downloads': inhoud = renderDownloads(); titel = 'Downloads'; break;
    case 'bronarchief':
      inhoud = state.me?.hosting === 'sites' ? renderBronarchief(lijst('bronarchief'), route.id ? get(route.id) : null) : leeg('Het bronarchief is beschikbaar na aanmelden in de ZIB-werkruimte.');
      titel = 'Historische brondossiers';
      break;
    case 'tickets': inhoud = renderTickets(); titel = 'Tickets'; break;
    case 'ticket': inhoud = renderTicket(route.id); titel = 'Ticket'; break;
    case 'mijn-gegevens': inhoud = renderMijnGegevens(); titel = 'Mijn gegevens'; break;
    case 'e-mail': inhoud = renderEmail(); titel = 'E-mail versturen'; break;
    default: inhoud = leeg('Pagina niet gevonden.', '<a class="knop" href="#/klanten">Naar aanvragen</a>');
  }
  app.innerHTML = `${balk(MENU_KEY[route.pagina] || '')}${banners()}<main class="pagina${breed ? ' breed' : ''}" id="main">${inhoud}</main>`;
  document.title = `ZIB | ${titel}`;
  if (behoudScroll) window.scrollTo(0, y);
  naRender();
  werkKerninvoerTellingBij(app.querySelector('[data-kerninvoer]'));
  herstelLosseVelden();
  werkBewaarstatusBij();
  if (!behoudScroll && route.veld && route.pagina === 'dossier') {
    const el = [...app.querySelectorAll('#tabinhoud [data-bind]')].find((x) => x.dataset.bind === route.veld && !x.disabled);
    if (el) requestAnimationFrame(() => {
      if (!el.isConnected) return;
      for (let p = el.closest('details'); p; p = p.parentElement?.closest('details')) p.open = true;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  }
}

// ---------------------------------------------------------------------------
// Na het tekenen: het actieve tabblad in beeld en de inhoudsopgave die meeloopt
// ---------------------------------------------------------------------------
/** Zet een element in beeld binnen zijn eigen schuivende balk of lijst (zonder de pagina te verschuiven). */
function toonInBalk(balkEl, el) {
  if (!balkEl || !el) return;
  if (balkEl.scrollWidth > balkEl.clientWidth) balkEl.scrollLeft = el.offsetLeft - (balkEl.clientWidth - el.offsetWidth) / 2;
  if (balkEl.scrollHeight > balkEl.clientHeight) {
    if (el.offsetTop < balkEl.scrollTop) balkEl.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > balkEl.scrollTop + balkEl.clientHeight) balkEl.scrollTop = el.offsetTop + el.offsetHeight - balkEl.clientHeight;
  }
}

let spyOpruimen = null;

/** Markeert in een inhoudsopgave ([data-spy]) het onderdeel dat nu bovenaan in beeld staat. */
function startSpy() {
  if (spyOpruimen) spyOpruimen();
  spyOpruimen = null;
  const bak = document.querySelector('[data-spy]');
  if (!bak) return;
  const knoppen = [...bak.querySelectorAll('[data-doel]')];
  const paren = knoppen.map((knop) => [knop, document.getElementById(knop.dataset.doel)]).filter(([, doel]) => doel);
  if (!paren.length) return;
  let gepland = false;
  // De marge boven een onderdeel (ruimte voor de vaste balken) hangt af van de breedte: opnieuw meten na een formaatwijziging.
  let marges = null;
  const werkBij = () => {
    gepland = false;
    if (!marges) marges = paren.map(([, doel]) => parseFloat(getComputedStyle(doel).scrollMarginTop) || 0);
    let actief = paren[0][0];
    paren.forEach(([knop, doel], i) => {
      if (doel.getBoundingClientRect().top - marges[i] - 12 <= 0) actief = knop;
    });
    // Helemaal onderaan de pagina is het laatste onderdeel aan de beurt, ook als het kort is.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) actief = paren[paren.length - 1][0];
    knoppen.forEach((knop) => {
      const aan = knop === actief;
      if (knop.classList.contains('actief') === aan) return;
      knop.classList.toggle('actief', aan);
      if (aan) { knop.setAttribute('aria-current', 'true'); toonInBalk(knop.parentElement, knop); } else knop.removeAttribute('aria-current');
    });
  };
  const plan = () => { if (!gepland) { gepland = true; requestAnimationFrame(werkBij); } };
  const opFormaat = () => { marges = null; plan(); };
  window.addEventListener('scroll', plan, { passive: true });
  window.addEventListener('resize', opFormaat, { passive: true });
  werkBij();
  spyOpruimen = () => { window.removeEventListener('scroll', plan); window.removeEventListener('resize', opFormaat); };
}

function naRender() {
  const tabs = document.getElementById('dossiertabs');
  toonInBalk(tabs, tabs?.querySelector('a.actief'));
  startSpy();
}

const herberekenDossier = debounce(() => {
  const d = huidigDossier();
  if (!d) return;
  resultaat = bereken(d);
  const kop = document.getElementById('dossierkop');
  if (kop) kop.outerHTML = kopVoor(d, resultaat);
  const tabs = document.getElementById('dossiertabs');
  if (tabs) {
    const links = tabs.scrollLeft;
    tabs.outerHTML = tabsHTML(d, tabs.dataset.tab, tabs.dataset.ond, resultaat, conceptDocumenten(d));
    document.getElementById('dossiertabs').scrollLeft = links;
  }
  document.querySelectorAll('[data-calc]').forEach((el) => {
    const w = calcWaarde(d, el.dataset.calc, resultaat);
    el.textContent = w === null || w === undefined ? '' : fmt.getal(w);
    if (el.dataset.calc.endsWith('|VERSCHIL')) el.classList.toggle('fout', Math.abs(Number(w) || 0) > 1);
  });
  document.querySelectorAll('[data-bzi-verschil]').forEach((el) => {
    const id = el.dataset.bziVerschil;
    const hoofd = resultaat.inkomen?.perHoofdbedrijf?.find((x) => x.id === id);
    if (hoofd) el.textContent = bziVerschil(ondVan(d, id)?.bziWerkelijk, hoofd.berekend);
  });
  werkKerninvoerTellingBij(app.querySelector('[data-kerninvoer]'));
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
    werkBewaarstatusBij();
    werkBannersBij();
  }
  if (type === 'conflict') werkBannersBij();
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
  if (rec && rec === route.id && route.pagina === 'dossier') return { soort: 'dossier', obj: huidigDossier() };
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
  if (dossierOpslag) return;
  const doel = doelVoor(el);
  if (!doel.obj) return;
  const waarde = waardeVan(el);
  const bind = el.dataset.bind;
  if (doel.soort === 'profiel' && state.modus === 'cloud' && ['accreditatie', 'email', 'rol'].includes(bind)) return;
  if (doel.obj.type === 'dossier') {
    const fout = inkomensWijzigingPad(bind) ? 'Leg een handmatige inkomenswijziging vast bij Fiattering.'
      : bind === 'status' ? statusBlokkade(doel.obj, waarde) : '';
    if (fout) { toast(fout); render({ behoudScroll: true }); return; }
  }
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
    // Handmatige keuzes die de uitkomst bepalen, komen in de historie (wie, wanneer, wat).
    if (magRenderen) {
      const bind = el.dataset.bind || '';
      if (bind === 'kader') {
        logHistorie(doel.obj, `Toetskader gewijzigd naar ${kaderLabel(waarde)}`);
        if (KADERS[waarde]?.beleid) {
          doel.obj.label = KADERS[waarde].kort;
          doel.obj.weergave = 'viiz';
        }
      }
      if (/^instellingen\.belet\.actief$/.test(bind)) logHistorie(doel.obj, `Beletperiode / incidenteel jaar ${waarde ? 'ingeschakeld' : 'uitgeschakeld'}`);
    }
  }
  if (doel.soort === 'dossier') {
    werkDossierconceptBij(doel.obj);
    herberekenDossier();
  } else opslaan(doel.obj);
  if (el.dataset.render && magRenderen) {
    if (doel.soort === 'dossier') herberekenDossier.flush();
    render({ behoudScroll: true });
  }
}

function verversTabel() {
  const t = document.getElementById('aanvragen-tabel');
  if (t) t.innerHTML = tabelAanvragen(route.afgerond);
}

function wisAanvraagfilters() {
  Object.assign(filters, { zoek: '', kader: '', soort: '', status: '', mijn: false, spoed: false });
  ui.aanvragen.zoekAfgerond = null;
  ui.aanvragen.kolomFilter = {};
  ui.aanvragen.snel = '';
  ui.aanvragen.pagina = 1;
}

/** Alleen de rijen en de paginering vernieuwen: de filterrij blijft staan, zodat je kunt doortypen. */
function verversRijen() {
  const body = document.getElementById('aanvragen-body');
  if (!body) { verversTabel(); return; }
  const { body: html, pager } = rijenAanvragen(route.afgerond);
  body.innerHTML = html;
  const p = document.getElementById('aanvragen-pager');
  if (p) p.innerHTML = pager;
  const wis = document.getElementById('filters-wissen');
  if (wis) wis.hidden = !filterActief();
}

/** Filterrij onder de kolomkoppen (aanvragen en taken). Geeft true als het element een kolomfilter was. */
function verwerkKolomfilter(el) {
  if (el.matches('[data-kolomfilter]')) {
    ui.aanvragen.kolomFilter[el.dataset.kolomfilter] = el.value;
    ui.aanvragen.pagina = 1;
    verversRijen();
    return true;
  }
  if (el.matches('[data-takenfilter]')) {
    ui.taken.filter[el.dataset.takenfilter] = el.value;
    const body = document.getElementById('taken-body');
    if (body) {
      const { body: html, voet } = rijenTaken(route.pagina === 'mijn-taken');
      body.innerHTML = html;
      const v = document.getElementById('taken-voet');
      if (v) v.innerHTML = voet;
    }
    return true;
  }
  return false;
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (route.pagina === 'dossier' && werkLosseVeldenBij(el)) return;
  if (el.matches('[data-beleid-zoek]')) {
    const zoek = el.value.toLocaleLowerCase('nl').trim();
    const kaarten = [...document.querySelectorAll('[data-beleid-kaart]')];
    for (const k of kaarten) k.hidden = !k.querySelector('summary').textContent.toLocaleLowerCase('nl').includes(zoek);
    document.getElementById('beleid-leeg').hidden = kaarten.some((k) => !k.hidden);
    return;
  }
  if (verwerkKolomfilter(el)) return;
  if (el.matches('[data-filter]')) {
    filters[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value;
    ui.aanvragen.pagina = 1;
    verversRijen();
    return;
  }
  if (el.closest('#modaal [data-salaris]')) { toonSalarisUitkomst(); return; }
  if (el.closest('#modaal [data-va]')) { toonVaTotaal(); return; }
  if (!el.matches('[data-bind]')) return;
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') return;
  if (el.matches('input.bedrag') && el.closest('[data-kerninvoer]')) {
    const ongeldig = el.value.trim() !== '' && leesKernbedrag(el.value) === null;
    if (ongeldig) { el.setAttribute('aria-invalid', 'true'); return; }
    el.removeAttribute('aria-invalid');
  }
  verwerkBinding(el, false);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (route.pagina === 'dossier' && werkLosseVeldenBij(el)) return;
  const form = el.closest('[data-dossierbeleid]');
  if (form) {
    const d = huidigDossier();
    if (d && !dossierOpslag) {
      werkBeleidsconceptBij(form, d);
      werkBewaarstatusBij();
    }
    return;
  }
  if (verwerkKolomfilter(el)) return;
  if (el.matches('[data-filter]')) {
    filters[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value;
    ui.aanvragen.pagina = 1;
    verversRijen();
    return;
  }
  if (el.matches('[data-actie]') && (el.tagName === 'SELECT' || el.type === 'file' || el.type === 'checkbox')) {
    voerUit(el.dataset.actie, el, e);
    return;
  }
  if (!el.matches('[data-bind]')) return;
  if (el.dataset.kernPeriode) {
    const d = huidigDossier();
    const j = ondVan(d, /^ond:([^.]+)/.exec(el.dataset.bind)?.[1])?.jaren?.[el.dataset.jaar] || {};
    const voorstel = { ...j, [el.dataset.kernPeriode]: el.value };
    if ((j.tot || voorstel.tot) && !heeftControleperiode(voorstel, el.dataset.jaar, resultaat?.datum)) {
      el.value = j[el.dataset.kernPeriode] || '';
      toast('Gebruik een einddatum tussen de begindatum en de peildatum.');
      return;
    }
  }
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') verwerkBinding(el, true);
  else if (el.dataset.render) verwerkBinding(el, true);
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!form.matches('[data-dossierbeleid]')) return;
  e.preventDefault();
  const d = huidigDossier();
  if (!d || dossierOpslag) return;
  werkBeleidsconceptBij(form, d);
  dossierOpslaan();
});

document.addEventListener('focusout', (e) => {
  const el = e.target;
  if (el.matches && el.matches('input.bedrag[data-type="bedrag"]')) {
    if (el.getAttribute('aria-invalid') === 'true') {
      const d = huidigDossier();
      const m = /^ond:([^.]+)\.(.+)$/.exec(el.dataset.bind);
      const vorige = m ? getPath(ondVan(d, m[1]), m[2]) : getPath(d, el.dataset.bind);
      el.value = isIngevuld(vorige) ? fmt.getal(vorige, vorige % 1 ? 2 : 0) : '';
      el.removeAttribute('aria-invalid');
      toast('Ongeldig bedrag. Gebruik bijvoorbeeld 12.500 of 12.500,50.');
      return;
    }
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

// Stappen van de BZI-weergave (voor snelzoeken binnen het open dossier).
const BZI_STAPPEN = [['overzicht', 'Dossieroverzicht'], ['algemeen', 'Algemeen'], ['bedrijven', 'Bedrijven'], ['boekhouders', 'Boekhouders'], ['verplichtingen', 'Geldstromen en verplichtingen'],
  ['samenvatting', 'Samenvatting'], ['documenten', 'Documenten'], ['berekening', 'Rekenstappen'], ['bziinvoer', 'BZI-invoer (overzicht)'], ['notities', 'Notities'], ['rapport', 'Rapport'], ['fiat', 'Fiattering en historie']];

function zoekenOpenen() {
  const d = huidigDossier();
  openZoeken({ dossier: d, tabs: d ? (weergaveDossier(d) === 'bzi' ? BZI_STAPPEN : TABS) : [], voerUit: (actie) => voerUit(actie, document.body, null) });
}

function sluitUitklap(behalve = null) {
  document.querySelectorAll('details.uitklap[open]').forEach((x) => { if (x !== behalve) x.removeAttribute('open'); });
}

// Uitklapmenu's (Meer, account, menu op smal scherm) sluiten bij een klik erbuiten of op een keuze.
document.addEventListener('click', (e) => {
  const binnen = e.target.closest && e.target.closest('details.uitklap');
  if (!binnen) sluitUitklap();
  else if (e.target.closest('.uitklap-paneel a, .uitklap-paneel button:not([data-blijf])')) sluitUitklap();
  else sluitUitklap(binnen);
});

// ---------------------------------------------------------------------------
// Invoerroosters: met Enter en de pijltjes door een kolom, en een kolom of blok uit een spreadsheet plakken
// ---------------------------------------------------------------------------
const ROOSTER_INVOER = 'input.bedrag, td.invoer input[data-type="getal"]';
const isRoosterInvoer = (el) => !!(el.matches && el.matches(ROOSTER_INVOER) && el.closest('table') && !el.closest('#modaal'));

/** Het invoerveld in dezelfde kolom, in de eerstvolgende (of vorige) rij die daar een veld heeft. */
function veldInKolom(el, richting) {
  const cel = el.closest('td');
  let rij = cel?.parentElement;
  if (!rij) return null;
  const kolom = cel.cellIndex;
  for (;;) {
    rij = richting > 0 ? rij.nextElementSibling : rij.previousElementSibling;
    if (!rij) return null;
    const doel = rij.cells?.[kolom]?.querySelector(ROOSTER_INVOER);
    if (doel && !doel.disabled && doel.offsetParent !== null) return doel;
  }
}

let plakWacht = [];

/** Geplakte regels en kolommen verdelen over de invoervelden vanaf het veld waar de cursor staat; eerst tonen, dan pas overnemen. */
function plakVoorstel(start, rooster) {
  const startCel = start.closest('td');
  const kolom = startCel.cellIndex;
  const rijen = [];
  const kern = !!start.closest('[data-kerninvoer]');
  if (kern) {
    const vanaf = start.closest('tr');
    for (let rij = vanaf; rij && rijen.length < rooster.length; rij = rij.nextElementSibling) {
      if (rij.hasAttribute('data-kern-rij')) rijen.push(rij);
    }
  } else {
    for (let veld = start; veld && rijen.length < rooster.length; veld = veldInKolom(veld, 1)) rijen.push(veld.closest('tr'));
  }
  const doelen = [];
  let overgeslagen = 0;
  rooster.forEach((regel, i) => {
    regel.forEach((tekst, j) => {
      if (tekst === '') return;
      const veld = rijen[i]?.cells?.[kolom + j]?.querySelector(ROOSTER_INVOER);
      const waarde = kern ? leesKernbedrag(tekst) : parseBedrag(tekst);
      if (!veld || veld.disabled || waarde === null) { overgeslagen += 1; return; }
      doelen.push({ veld, waarde });
    });
  });
  if (!doelen.length) { toast('Niets om te plakken: geen bedragen herkend of geen invoervelden op die plek.'); return; }
  toonPlakVoorstel(doelen, `<p>${doelen.length} ${doelen.length === 1 ? 'bedrag' : 'bedragen'} vanaf <b>${esc(start.getAttribute('aria-label') || 'het gekozen veld')}</b>.${overgeslagen
      ? ` ${overgeslagen} ${overgeslagen === 1 ? 'waarde is' : 'waarden zijn'} overgeslagen (geen bedrag, of geen invoerveld op die plek).` : ''}
      Controleer of de regels op de juiste post staan.</p>`);
}

function toonPlakVoorstel(doelen, toelichting) {
  plakWacht = doelen;
  const getal = (v) => fmt.getal(v, v % 1 ? 2 : 0);
  openModaal('Plakken in het rooster',
    `${toelichting}<div class="scroll plak-voorbeeld"><table class="tabel compact"><thead><tr><th>Post</th><th class="num">Nu</th><th class="num">Wordt</th></tr></thead><tbody>
      ${doelen.map(({ veld, waarde }) => {
    const nu = parseBedrag(veld.value);
    return `<tr${nu !== null && nu !== waarde ? ' class="gewijzigd"' : ''}><td>${esc(veld.getAttribute('aria-label') || '')}</td><td class="num">${nu === null ? '' : esc(getal(nu))}</td><td class="num"><b>${esc(getal(waarde))}</b></td></tr>`;
  }).join('')}</tbody></table></div>`,
    '<button class="knop" data-actie="plak-toepassen">Plakken</button>', { breed: true });
}

function kernPlakVelden() {
  return [...app.querySelectorAll('[data-kern-post][data-kern-jaar]')].flatMap((td) => {
    const veld = td.querySelector('input:not(:disabled)');
    return veld ? [{ post: td.dataset.kernPost, jaar: td.dataset.kernJaar, veld }] : [];
  });
}

function kernSjabloon(velden) {
  const jaren = [...new Set(velden.map((v) => v.jaar))].sort();
  const posten = [...new Set(velden.map((v) => v.post))];
  return [['Post', ...jaren], ...posten.map((p) => [p, ...jaren.map(() => '')])].map((r) => r.join('\t')).join('\r\n');
}

document.addEventListener('paste', (e) => {
  const el = e.target;
  if (!isRoosterInvoer(el) || !el.closest('#rooster, [data-kerninvoer]')) return;
  const rooster = plakRooster(e.clipboardData?.getData('text/plain'));
  if (!rooster) return; // één waarde: gewoon plakken in het veld
  e.preventDefault();
  plakVoorstel(el, rooster);
});

document.addEventListener('keydown', (e) => {
  const typend = e.target.matches && e.target.matches('input, textarea, select, [contenteditable="true"]');
  if (isRoosterInvoer(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const doel = veldInKolom(e.target, e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1);
    if (doel) { e.preventDefault(); doel.focus(); doel.select(); }
    return;
  }
  if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); zoekenOpenen(); return; }
  if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey) && !e.altKey && route.pagina === 'dossier') {
    e.preventDefault();
    if (!document.getElementById('modaal')) dossierOpslaan();
    return;
  }
  if (e.key === '/' && !typend && !e.ctrlKey && !e.metaKey && !document.getElementById('modaal')) { e.preventDefault(); zoekenOpenen(); return; }
  if (e.key === 'Escape') sluitUitklap();
  if (e.key === 'Escape' && !(dossierOpslag && vertrekKeuze?.el.isConnected)) sluitModaal();
  if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-actie]')) voerUit(e.target.dataset.actie, e.target, e);
  if (e.key === 'Enter' && e.target.matches && e.target.matches('#modaal input:not([type="checkbox"]):not([type="radio"])')) {
    const knop = document.querySelector('#modaal .acties .knop:not(.sec)');
    if (knop && !knop.disabled) { e.preventDefault(); knop.click(); }
  }
});

function zelfdeDossierpagina(hash) {
  const doel = parseRoute(hash);
  return doel.pagina === 'dossier' && doel.id === route.id && doel.tab === route.tab;
}

function vraagVertrek(doorgaan) {
  if (dossierOpslag) { toast('Wacht tot het opslaan klaar is.'); return; }
  if (!conceptGewijzigd()) { doorgaan(); return; }
  if (vertrekKeuze?.el.isConnected) return;
  const actief = document.activeElement;
  const keuze = openModaal('Niet opgeslagen wijzigingen', '<p>Wil je je wijzigingen opslaan voordat je deze pagina verlaat?</p>',
    '<button type="button" class="knop" data-actie="dossier-opslaan-verder">Opslaan en verder</button><button type="button" class="knop sec" data-actie="dossier-verlaten">Verlaten zonder opslaan</button>',
    { sluitTekst: 'Hier blijven' });
  vertrekKeuze = { el: keuze, doorgaan };
  app.inert = true;
  const observer = new MutationObserver(() => {
    if (keuze.isConnected) return;
    observer.disconnect();
    app.inert = false;
    if (vertrekKeuze?.el === keuze) {
      vertrekKeuze = null;
      actief?.focus({ preventScroll: true });
    }
  });
  observer.observe(document.body, { childList: true });
}

function navigeerZonderVraag(hash) {
  if (location.hash === hash) { render({ behoudScroll: true }); return; }
  interneNavigatie = hash;
  location.hash = hash;
}

function tekenNavigatie() {
  actieveHash = location.hash;
  geschiedenisNummer = history.state?.zibRouteIndex ?? geschiedenisNummer + 1;
  history.replaceState({ ...history.state, zibRouteIndex: geschiedenisNummer }, '');
  sluitModaal();
  sluitZoeken();
  render();
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  if (route.pagina !== 'dossier' || !(conceptGewijzigd() || dossierOpslag) || e.defaultPrevented
    || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest('a[href]');
  if (!link || link.dataset.actie || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href);
  const zelfdeApp = url.origin === location.origin && url.pathname === location.pathname && url.search === location.search;
  if (zelfdeApp && (url.hash === actieveHash || zelfdeDossierpagina(url.hash))) return;
  e.preventDefault();
  vraagVertrek(zelfdeApp ? () => navigeerZonderVraag(url.hash) : () => { location.href = url.href; });
}, true);

function behandelHash() {
  const hash = location.hash;
  if (herstelNavigatie) {
    if (hash !== actieveHash) return;
    const doorgaan = herstelNavigatie;
    herstelNavigatie = null;
    vraagVertrek(doorgaan);
    return;
  }
  if (hash === actieveHash) return;
  if (hash === interneNavigatie || !(conceptGewijzigd() || dossierOpslag) || zelfdeDossierpagina(hash)) {
    interneNavigatie = '';
    tekenNavigatie();
    return;
  }
  const vorigeIndex = history.state?.zibRouteIndex;
  const stap = Number.isInteger(vorigeIndex) ? vorigeIndex - geschiedenisNummer : 0;
  if (stap) {
    herstelNavigatie = () => { interneNavigatie = hash; history.go(stap); };
    history.go(-stap);
    return;
  }
  history.replaceState({ ...history.state, zibRouteIndex: geschiedenisNummer }, '', actieveHash || '#/klanten');
  vraagVertrek(() => navigeerZonderVraag(hash));
}

window.addEventListener('hashchange', behandelHash);
window.addEventListener('popstate', behandelHash);
window.addEventListener('beforeunload', (e) => {
  if (conceptGewijzigd() || dossierOpslag || heeftOnopgeslagen()) {
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

function statusBlokkade(d, status) {
  return status !== d.status && (['beoordeling_2', 'afgerond'].includes(status) || ['beoordeling_2', 'afgerond'].includes(d.status))
    ? 'Wijzig deze beoordelingsstatus via Fiattering of vraag een herbeoordeling aan.' : '';
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
  ['id', 'version', 'updated_at', 'updated_by', 'fiat', 'fiatteur', 'meekijken', 'teruggezet', 'oefenverklaringen'].forEach((k) => delete kopie[k]);
  for (const o of kopie.ondernemingen || []) delete o.bziWerkelijk;
  wisInkomensWijzigingen(kopie);
  for (const i of Object.values(kopie.beleidsinvoer || {})) {
    for (const key of ['ikvBedrag', 'ikvDatum', 'ikvOpsteller']) delete i[key];
  }
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
  werkDossierconceptBij(d);
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
/** Klapt een onderdeel in of uit in de pagina zelf en onthoudt de keuze. */
function zetKlapDOM(bak, dicht) {
  bak.classList.toggle('ingeklapt', dicht);
  zetKlap(bak.dataset.klap, dicht);
  bak.querySelectorAll(':scope > .klap-kop > button, :scope > .hoofdstuk-kop > button, :scope > button[data-actie="klap"]')
    .forEach((knop) => knop.setAttribute('aria-expanded', String(!dicht)));
}

const ACTIES = {
  browseroverdracht() { return biedBrowseroverdrachtAan(() => render()); },
  'zoek-open'() { zoekenOpenen(); },
  'dossier-opslaan'() { return dossierOpslaan(); },
  async 'dossier-opslaan-verder'() {
    const keuze = vertrekKeuze;
    if (!keuze || dossierOpslag) return;
    for (const knop of keuze.el.querySelectorAll('button')) knop.disabled = true;
    const opgeslagen = await dossierOpslaan({ tekenOpnieuw: false });
    if (!opgeslagen) {
      for (const knop of keuze.el.querySelectorAll('button')) knop.disabled = false;
      return;
    }
    if (vertrekKeuze !== keuze) return;
    vertrekKeuze = null;
    sluitModaal();
    keuze.doorgaan();
  },
  'dossier-verlaten'() {
    const keuze = vertrekKeuze;
    if (!keuze || dossierOpslag) return;
    conceptWissen();
    vertrekKeuze = null;
    sluitModaal();
    keuze.doorgaan();
  },

  // ---- Berekening en rapport: in- en uitklappen, springen, formules, weergave -------------
  klap(el) {
    const bak = el.closest('[data-klap]');
    if (bak) zetKlapDOM(bak, !bak.classList.contains('ingeklapt'));
  },
  'alles-klap'(el) {
    const dicht = el.dataset.stand === 'in';
    const scope = document.getElementById('tabinhoud') || document;
    scope.querySelectorAll('[data-klap]').forEach((bak) => zetKlapDOM(bak, dicht));
    scope.querySelectorAll('details.stappen').forEach((x) => { x.open = !dicht; });
  },
  'naar-sectie'(el) {
    const doel = document.getElementById(el.dataset.doel);
    if (!doel) return;
    if (doel.matches('[data-klap].ingeklapt')) zetKlapDOM(doel, false);
    const rustig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    doel.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' });
  },
  formules(el) {
    zetFormules(el.checked);
    document.querySelectorAll('.berekening, .rapport-wrap').forEach((x) => x.classList.toggle('zonder-formules', !ui.formules));
  },
  'rapport-modus'(el) {
    if (ui.rapportModus === el.dataset.modus) return;
    zetRapportModus(el.dataset.modus);
    render({ behoudScroll: true });
  },
  'kern-plakken'() {
    if (!kernPlakVelden().length) { toast('Er zijn geen bewerkbare cijfers voor deze onderneming.'); return; }
    openModaal('Kerncijfers uit Excel', `<p>Download het lege sjabloon en vul het in Excel in. Kopieer daarna de tabel met de kop <strong>Post</strong> en de jaartallen. Je mag jaarkolommen verplaatsen en lege velden overslaan.</p>
      <button type="button" class="knop sec klein" data-actie="kern-sjabloon">${icoon('download')} Sjabloon downloaden</button>
      <label class="veld kern-import"><span>Plak de tabel uit Excel of tekst met puntkomma’s</span><textarea id="kern-plaktekst" rows="7" spellcheck="false"></textarea></label>`,
    '<button class="knop" data-actie="kern-plak-voorstel">Voorbeeld bekijken</button>', { breed: true });
  },
  'kern-sjabloon'() {
    const s = kernSjabloon(kernPlakVelden());
    if (window.ZIB_ARTIFACT) {
      const el = document.getElementById('kern-plaktekst');
      if (el) { el.value = s; el.focus(); el.select(); }
    } else downloadBestand('ZIB-kerncijfers.tsv', `\uFEFF${s}`, 'text/tab-separated-values;charset=utf-8');
  },
  'kern-plak-voorstel'() {
    const el = document.getElementById('kern-plaktekst');
    const { posten, meldingen } = leesKerncijfers(el?.value, kernPlakVelden());
    const fouten = meldingen.length ? `<div class="kern-import-meldingen"><strong>${meldingen.length} ${meldingen.length === 1 ? 'cel overgeslagen' : 'cellen overgeslagen'}</strong><ul>${meldingen.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : '';
    if (!posten.length) {
      el?.parentElement.querySelector('.kern-import-meldingen')?.remove();
      el?.insertAdjacentHTML('afterend', fouten || '<p class="kern-import-meldingen">Geen bedragen gevonden.</p>');
      return;
    }
    toonPlakVoorstel(posten, `<p>Controleer de ${posten.length === 1 ? 'wijziging' : `${posten.length} wijzigingen`} voor je ze overneemt. Lege spreadsheetcellen laten bestaande bedragen staan.</p>${fouten}`);
  },
  'plak-toepassen'() {
    const doelen = plakWacht.filter(({ veld }) => document.body.contains(veld));
    plakWacht = [];
    sluitModaal();
    let opnieuw = false;
    doelen.forEach(({ veld, waarde }) => {
      veld.removeAttribute('aria-invalid');
      veld.value = veld.dataset.type === 'getal' ? String(waarde).replace('.', ',') : fmt.getal(waarde, waarde % 1 ? 2 : 0);
      verwerkBinding(veld, false);
      if (veld.dataset.render) opnieuw = true;
    });
    herberekenDossier.flush();
    if (opnieuw) render({ behoudScroll: true });
    toast(`${doelen.length} ${doelen.length === 1 ? 'bedrag' : 'bedragen'} geplakt.`);
  },
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
    const keuzeEl = m.querySelector('select[name="soortkader"]');
    const [soort, kader] = (keuzeEl?.value || 'IKV|ABN').split('|');
    const d = nieuw('dossier', {
      nummer: volgendDossiernummer(), soort, kader, status: 'documenten_uploaden', statusDatum: nowISO(), datumAanvraag: todayISO(),
      ...(soort === 'ANALYSE' ? { weergave: 'viiz' } : {}),
      niveau: 'Basis', behandelaar: mijnNaam(), advieskantoorId: modaalVeld('advieskantoor'), berekeningsdatum: todayISO(),
      label: KADERS[kader]?.beleid?.kort || modaalVeld('label') || 'ABN AMRO', afdeling: 'IMV', leningnummer: modaalVeld('leningnummer'),
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
    wisAanvraagfilters();
    render({ behoudScroll: true });
  },
  'beleid-voorbeelden-laden'() {
    const wasActief = ui.aanvragen.snel === 'beleid-voorbeelden';
    const aantal = wasActief ? 0 : laadBeleidsvoorbeelden();
    wisAanvraagfilters();
    if (!wasActief) ui.aanvragen.snel = 'beleid-voorbeelden';
    render({ behoudScroll: true });
    if (aantal) toast(`${aantal} ${aantal === 1 ? 'oefendossier toegevoegd' : 'oefendossiers toegevoegd'}.`);
  },
  snelfilter(el) {
    ui.aanvragen.snel = ui.aanvragen.snel === el.dataset.snel ? '' : el.dataset.snel;
    ui.aanvragen.pagina = 1;
    render({ behoudScroll: true });
  },
  'kolom-toggle'(el) {
    const huidig = zichtbareKolommen(route.afgerond).map((k) => k.k).filter((k) => k !== 'eerder');
    const kol = el.dataset.kol;
    const nieuw = el.checked ? [...new Set([...huidig, kol])] : huidig.filter((k) => k !== kol);
    if (!nieuw.length) { el.checked = true; toast('Laat minstens één kolom staan.'); return; }
    zetKolommen(nieuw);
    verversTabel();
    document.querySelector('[data-actie="kolommen-standaard"]')?.removeAttribute('disabled');
  },
  'kolommen-standaard'() {
    zetKolommen(null);
    render({ behoudScroll: true });
  },
  sorteer(el) {
    const kol = el.dataset.kol;
    const s = route.afgerond ? ui.aanvragen.sortAfgerond : ui.aanvragen.sort;
    if (s.kol === kol) s.richting = s.richting === 'asc' ? 'desc' : 'asc';
    else { s.kol = kol; s.richting = /datumStatus|datumAanvraag|inkomen|spoed/i.test(kol) ? 'desc' : 'asc'; }
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
    const id = modaalVeld('id');
    const d = id === route.id ? huidigDossier() : get(id);
    if (!d) return;
    const fout = statusBlokkade(d, modaalVeld('status'));
    if (fout) { toast(fout); return; }
    zetStatus(d, modaalVeld('status'), modaalVeld('toelichting'));
    if (id === route.id) werkDossierconceptBij(d);
    else opslaan(d, { direct: true });
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
    if (naar === 'bzi' && (d.soort === 'ANALYSE' || !['ABN', 'NHG'].includes(resultaat?.kader))) return;
    d.weergave = naar;
    werkDossierconceptBij(d);
    const tab = route.tab || 'overzicht';
    const nieuweTab = naar === 'bzi' ? (NAAR_BZI[tab] || tab) : (NAAR_VIIZ[tab] || tab);
    const ond = route.ondId ? `/${route.ondId}` : '';
    const doel = `#/dossier/${d.id}/${nieuweTab}${['bedrijf', 'balans', 'vw', 'diversen', 'samenvatting', 'bedrijven'].includes(nieuweTab) ? ond : ''}`;
    navigeerZonderVraag(doel);
  },
  'ond-toevoegen'() {
    const d = huidigDossier();
    d.ondernemingen = d.ondernemingen || [];
    d.ondernemingen.push(nieuweOnderneming(`Onderneming ${d.ondernemingen.length + 1}`));
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  'hoofdbedrijf-toevoegen'() {
    const d = huidigDossier();
    d.ondernemingen = d.ondernemingen || [];
    const o = nieuweOnderneming('', 'BV', '', { activiteit: 'Holding' });
    d.ondernemingen.push(o);
    logHistorie(d, 'Hoofdbedrijf toegevoegd');
    werkDossierconceptBij(d);
    navigeerZonderVraag(`#/dossier/${d.id}/bedrijven/${o.id}`);
  },
  'deelneming-toevoegen'(el) {
    const d = huidigDossier();
    const o = nieuweOnderneming('', 'BV', '', { parentId: el.dataset.ouder, direct: false });
    d.ondernemingen.push(o);
    werkDossierconceptBij(d);
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
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  'extra-ouder-toevoegen'(el) {
    const d = huidigDossier();
    const o = ondVan(d, el.dataset.ond);
    if (!o) return;
    o.extraParents = o.extraParents || [];
    o.extraParents.push({ id: '', pct: '' });
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  'extra-ouder-weg'(el) {
    const d = huidigDossier();
    const o = ondVan(d, el.dataset.ond);
    if (!o) return;
    o.extraParents.splice(Number(el.dataset.index), 1);
    werkDossierconceptBij(d);
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
    werkDossierconceptBij(d);
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
    werkDossierconceptBij(d);
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
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  async 'og-knoop-weg'(el) {
    const d = huidigDossier();
    const k = d.organogram?.knopen?.[Number(el.dataset.index)];
    if (!k || !(await bevestig(`"${k.naam || 'Deze partij'}" en de lijnen ernaartoe verwijderen?`, 'Verwijderen'))) return;
    d.organogram.knopen.splice(Number(el.dataset.index), 1);
    d.organogram.lijnen = (d.organogram.lijnen || []).filter((l) => l.van !== k.id && l.naar !== k.id);
    (d.geldstromenExtra || []).forEach((x) => { if (x.van === k.id) x.van = ''; if (x.naar === k.id) x.naar = ''; });
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  'og-lijn-toevoegen'() {
    const d = huidigDossier();
    d.organogram = d.organogram || {};
    d.organogram.lijnen = d.organogram.lijnen || [];
    d.organogram.lijnen.push({ id: uid('l'), van: '', naar: '', pct: null, soort: 'aandelen' });
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  'og-lijn-weg'(el) {
    const d = huidigDossier();
    d.organogram?.lijnen?.splice(Number(el.dataset.index), 1);
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  'og-situatie-toevoegen'() {
    const d = huidigDossier();
    const r = resultaat || bereken(d);
    d.organogram = d.organogram || {};
    d.organogram.situaties = d.organogram.situaties || [];
    d.organogram.situaties.push({ id: uid('s'), titel: `Situatie tot en met ${r.T3}`, tekst: organogramTekst(d) });
    werkDossierconceptBij(d);
    toast('Huidige structuur vastgelegd; pas titel en tekst aan naar de eerdere situatie.');
    render({ behoudScroll: true });
  },
  async 'og-situatie-weg'(el) {
    const d = huidigDossier();
    if (!(await bevestig('Deze situatie verwijderen?', 'Verwijderen'))) return;
    d.organogram?.situaties?.splice(Number(el.dataset.index), 1);
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  'gs-toevoegen'() {
    const d = huidigDossier();
    d.geldstromenExtra = Array.isArray(d.geldstromenExtra) ? d.geldstromenExtra : [];
    d.geldstromenExtra.push({ id: uid('gs'), van: '', naar: '', soort: 'fee', perJaar: {}, toelichting: '' });
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  async 'gs-weg'(el) {
    const d = huidigDossier();
    if (!(await bevestig('Deze geldstroom verwijderen?', 'Verwijderen'))) return;
    d.geldstromenExtra?.splice(Number(el.dataset.index), 1);
    werkDossierconceptBij(d);
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
  'bzi-csv'() {
    const d = huidigDossier();
    if (!d) return;
    downloadBestand(`${d.nummer || 'dossier'}-bzi-invoer.csv`, maakBziCsv(d, bereken(d)), 'text/csv;charset=utf-8');
  },
  'boekhouder-toevoegen'() {
    const d = huidigDossier();
    d.notities = d.notities || {};
    d.notities.boekhouder = d.notities.boekhouder || { optie: '1', lijst: [] };
    d.notities.boekhouder.lijst = d.notities.boekhouder.lijst || [];
    d.notities.boekhouder.lijst.push({ naam: '', kvk: '' });
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  'boekhouder-weg'(el) {
    const d = huidigDossier();
    d.notities?.boekhouder?.lijst?.splice(Number(el.dataset.index), 1);
    werkDossierconceptBij(d);
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
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  async 'zk-verwijderen'(el) {
    const d = huidigDossier();
    if (!(await bevestig('Dit krediet verwijderen?', 'Verwijderen'))) return;
    d.zk.splice(Number(el.dataset.index), 1);
    werkDossierconceptBij(d);
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
    werkDossierconceptBij(d);
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
    werkDossierconceptBij(d);
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
    werkDossierconceptBij(d);
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
    werkDossierconceptBij(d);
    sluitModaal();
    render({ behoudScroll: true });
  },
  'woonbeleid-overnemen'() {
    const d = huidigDossier();
    if (d) location.hash = `#/dossier/${encodeURIComponent(d.id)}/fiat`;
  },
  'inkomenswijziging'(el) {
    const d = huidigDossier();
    const c = dossierconcept;
    const blok = el.closest('[data-inkomenswijziging]');
    const id = el.dataset.ond || '';
    if (!d || !blok || !c) return;
    const invoer = Object.fromEntries(inkomensVeldenIn(blok).map(([key, veld]) => [key, veld.value]));
    const uitkomst = verwerkInkomensbesluit(d, id, invoer);
    if (uitkomst.fout) { toast(uitkomst.fout); return; }
    c.inkomen.delete(id);
    werkDossierconceptBij(d);
    toast(uitkomst.gewijzigd ? 'Inkomensbesluit toegevoegd aan je wijzigingen.' : 'Het inkomensbesluit is gelijk gebleven.');
    render({ behoudScroll: true });
  },
  'grootboek-open'(el) {
    const d = huidigDossier();
    const o = ondVan(d, el.dataset.ond);
    if (!o) return;
    gbVoorbeeld = null;
    const { jaren, kandidaatC } = roosterJaren(d);
    const laatsteJaar = Math.max(...jaren.filter((y) => y !== kandidaatC));
    openModaal(`Grootboek importeren: ${o.naam}`, `<p class="dempen">Plak een grootboek- of saldibalans (rekening; omschrijving; saldo of debet; credit) of kies een CSV-bestand. ZIB verdeelt de rekeningen volgens het decimale rekeningschema (zie Downloads) en toont eerst een voorbeeld.</p>
      <div class="raster-3" style="grid-template-columns:1fr 1fr 2fr">
        <label class="veld"><span>Jaar</span><select name="jaar">${jaren.map((y) => `<option${y === laatsteJaar ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
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
    werkDossierconceptBij(d);
    toast('Grootboek overgenomen. Controleer de posten en het balansverschil.');
    render({ behoudScroll: true });
  },
  'download-grootboeksjabloon'() {
    const tekst = 'Rekening;Omschrijving;Debet;Credit\n001;Gebouwen;100000;0\n011;Afschrijving gebouwen (cumulatief);0;20000\n040;Aandelenkapitaal;0;18000\n110;Bank;40000;0\n140;Crediteuren;0;12000\n800;Omzet;0;150000\n410;Directe loonkosten;50000;0\n';
    downloadBestand('zib-grootboek-sjabloon.csv', tekst, 'text/csv');
  },

  // ---- Dossier: fiattering ------------------------------------------------
  async 'gereed-melden'() {
    const id = route.id;
    const actor = actorVoor(state.profiel, state.me);
    const bewaard = await dossierOpslaan({ stil: true, aanpassen(d) {
      const fout = fiatBlokkade(actor, d, 1) || blokkadeUitkomst(d);
      if (fout) return fout;
      d.fiat = d.fiat || {};
      d.fiat.eerste = { ...stempelFiatteur(actor), opmerking: d.fiat.concept1 || '' };
      delete d.fiat.concept1;
      delete d.fiat.tweede;
      d.teruggezet = false;
      zetStatus(d, 'beoordeling_2', 'gereed gemeld');
      return '';
    } });
    if (!bewaard) return;
    nieuw('taak', { titel: '2e beoordeling uitvoeren', dossierId: id, toegewezenAan: '', deadline: todayISO(), status: 'open', door: mijnNaam() });
    toast('Gereed gemeld. Het dossier staat onder Meekijken voor de 2e beoordeling.');
  },
  async 'fiat-akkoord'() {
    const id = route.id;
    const actor = actorVoor(state.profiel, state.me);
    const bewaard = await dossierOpslaan({ stil: true, aanpassen(d) {
      const fout = fiatBlokkade(actor, d, 2) || blokkadeUitkomst(d);
      if (fout) return fout;
      const ant = d.fiat?.tweede?.antwoorden || {};
      if (FIAT_VRAGEN.some(([k]) => !ant[k]?.antwoord)) return 'Beantwoord eerst alle vragen.';
      if (FIAT_VRAGEN.some(([k]) => ant[k].antwoord === 'Nee')) return 'Herstel de vragen die met Nee zijn beantwoord of zet het dossier terug.';
      d.fiat.tweede = { ...d.fiat.tweede, ...stempelFiatteur(actor), resultaat: 'akkoord' };
      d.fiatteur = actor.naam;
      zetStatus(d, 'afgerond', '2e beoordeling akkoord');
      return '';
    } });
    if (!bewaard) return;
    lijst('taak').filter((t) => t.dossierId === id && t.status === 'open' && /2e (fiat|beoordeling)/i.test(t.titel)).forEach((t) => { t.status = 'gereed'; opslaan(t); });
    toast('Akkoord gegeven. Het dossier staat bij Afgeronde aanvragen.');
  },
  async 'fiat-niet-akkoord'() {
    const id = route.id;
    const actor = actorVoor(state.profiel, state.me);
    const bewaard = await dossierOpslaan({ stil: true, aanpassen(d) {
      const fout = fiatBlokkade(actor, d, 2);
      if (fout) return fout;
      const ant = d.fiat?.tweede?.antwoorden || {};
      if (!FIAT_VRAGEN.some(([k]) => ant[k]?.antwoord === 'Nee') && !d.fiat?.tweede?.opmerking?.trim()) {
        return 'Geef aan welke vraag niet akkoord is of licht toe in de opmerking.';
      }
      d.fiat.tweede = { ...d.fiat.tweede, ...stempelFiatteur(actor), resultaat: 'niet_akkoord' };
      d.teruggezet = true;
      zetStatus(d, 'beoordeling_1', '2e beoordeling niet akkoord, teruggezet');
      return '';
    } });
    if (!bewaard) return;
    const d = get(id);
    nieuw('taak', { titel: 'Bevindingen 2e beoordeling verwerken', dossierId: d.id, toegewezenAan: d.fiat.eerste?.naam || d.behandelaar || '', deadline: todayISO(), status: 'open', door: mijnNaam() });
    toast('Dossier teruggezet naar de eerste beoordeling.');
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
    const fout = fiatBlokkade(actorVoor(state.profiel, state.me), d, 1);
    if (fout) { toast(fout); return; }
    const v = Number(el.dataset.versie);
    if (!(await bevestig(`Versie ${v} overnemen als concept? Klik daarna op Opslaan.`, 'Versie overnemen'))) return;
    const oud = await state.adapter.getVersion(d.id, v);
    if (!oud) { toast('Versie niet gevonden.'); return; }
    if (huidigDossier() !== d) return;
    const { version, status, statusDatum } = d;
    Object.keys(d).forEach((k) => { delete d[k]; });
    Object.assign(d, clone(oud), { version, status, statusDatum });
    delete d.fiat;
    delete d.fiatteur;
    wisInkomensWijzigingen(d);
    logHistorie(d, `Versie ${v} teruggezet`);
    werkDossierconceptBij(d);
    render({ behoudScroll: true });
  },
  afdrukken() {
    if (globalThis.ZIB_ARTIFACT) { toast('Afdrukken kan in de losse demo of je eigen installatie.'); return; }
    const dicht = [...document.querySelectorAll('#rapport details:not([open])')];
    dicht.forEach((el) => { el.open = true; });
    try { window.print(); } finally { dicht.forEach((el) => { el.open = false; }); }
  },
  async 'rapport-download'() {
    const d = huidigDossier();
    const bron = document.querySelector('.rapport');
    if (!d || !bron) return;
    // Het bestand bevat altijd het hele rapport in de gekozen weergave: alles uitgeklapt, zonder knoppen, in het lichte thema.
    const rapport = bron.cloneNode(true);
    rapport.querySelectorAll('.ingeklapt').forEach((x) => x.classList.remove('ingeklapt'));
    rapport.querySelectorAll('.geen-print').forEach((x) => x.remove());
    rapport.querySelectorAll('details').forEach((x) => { x.open = true; });
    rapport.querySelectorAll('.hoofdstuk-kop > button').forEach((knop) => {
      knop.querySelectorAll('.ico').forEach((x) => x.remove());
      knop.replaceWith(...knop.childNodes);
    });
    const zonderFormules = bron.closest('.zonder-formules') ? ' zonder-formules' : '';
    let css;
    try {
      const stijlen = await Promise.all([...document.querySelectorAll('link[data-zib-stijl]')].map(async (link) => {
        const res = await fetch(link.href, { mode: 'same-origin' });
        if (!res.ok) throw new Error('Stijlbestand niet beschikbaar');
        return res.text();
      }));
      css = [...stijlen, ...[...document.querySelectorAll('style[data-zib-stijl]')].map((x) => x.textContent)]
        .join('\n').replace(/<\/style/gi, '<\\/style');
    } catch {
      toast('Rapportstijl kon niet worden geladen. Probeer opnieuw of kies Afdrukken of pdf.');
      return;
    }
    const html = `<!doctype html>
<html lang="nl" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport ${esc(d.nummer || '')}</title>
<style>${css}</style>
</head>
<body>
<div class="pagina${zonderFormules}">${rapport.outerHTML}</div>
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
  'doc-upload'() {
    const d = huidigDossier();
    const input = document.getElementById('doc-bestand');
    if (!d || !input || !dossierconcept.gekozenBestand) { toast('Kies eerst een bestand.'); return; }
    const fout = voegDocumentConceptToe(dossierconcept);
    if (fout) { toast(fout); return; }
    toast('Document toegevoegd aan je wijzigingen. Klik op Opslaan om het te bewaren.');
    render({ behoudScroll: true });
  },
  async 'doc-download'(el) {
    const concept = dossierconcept?.documenten.get(el.dataset.id);
    if (concept) { downloadBestand(concept.doc.naam, concept.bestand); return; }
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
    const c = dossierconcept;
    const concept = c?.documenten.get(el.dataset.id);
    if (concept) {
      c.documenten.delete(el.dataset.id);
      c.record.historie = c.record.historie?.filter((h) => h !== concept.historie);
      werkDossierconceptBij(c.record);
      render({ behoudScroll: true });
      return;
    }
    const rec = get(el.dataset.id);
    if (!rec || !(await bevestig(`Document "${rec.naam}" verwijderen?`, 'Verwijderen'))) return;
    if (!c || c !== dossierconcept || rec.dossierId !== c.record.id) return;
    c.verwijderd.set(rec.id, rec);
    logHistorie(c.record, `Document verwijderd: ${rec.naam}`);
    werkDossierconceptBij(c.record);
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
    werkDossierconceptBij(d);
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
  'taken-uitklap'(el) {
    const id = el.dataset.id;
    if (ui.taken.open.has(id)) ui.taken.open.delete(id); else ui.taken.open.add(id);
    const t = document.getElementById('taken-tabel');
    if (t) t.innerHTML = tabelTaken(route.pagina === 'mijn-taken');
  },
  'taken-sorteer'(el) {
    const kol = el.dataset.kol;
    const s = ui.taken.sort;
    if (s.kol === kol) s.richting = s.richting === 'asc' ? 'desc' : 'asc';
    else { s.kol = kol; s.richting = /aantal|spoed/.test(kol) ? 'desc' : 'asc'; }
    const t = document.getElementById('taken-tabel');
    if (t) t.innerHTML = tabelTaken(route.pagina === 'mijn-taken');
  },
  'taken-afgerond'(el) {
    ui.taken.afgerond = !!el.checked;
    render({ behoudScroll: true });
  },
  'taken-filters-wissen'() {
    ui.taken.filter = {};
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
      const uitkomst = await importeer(json);
      if (typeof uitkomst === 'number') toast(`${uitkomst} records teruggezet.`);
      else toast(`${uitkomst.aantal} records teruggezet.${uitkomst.geweigerd ? ` ${uitkomst.geweigerd} geweigerd.` : ''}${uitkomst.herbeoordelen ? ` ${uitkomst.herbeoordelen} opnieuw te beoordelen.` : ''}`);
      render();
    } catch (e) {
      toast(`Terugzetten mislukt: ${e.message}`);
    }
  },
  'download-formats'() {
    const tekst = Object.entries(FORMATS).map(([k, v]) => `### ${k}\n${v}`).join('\n\n');
    downloadBestand('zib-formats-dossieraantekeningen.txt', tekst, 'text/plain');
  },
  'naar-kader'(el, e) {
    e?.preventDefault?.();
    const kader = document.getElementById(`kader-${el.dataset.kader}`);
    if (!kader) return;
    if (kader.tagName === 'DETAILS') kader.open = true;
    const rustig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    kader.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' });
    kader.querySelector('summary')?.focus({ preventScroll: true });
  },
  'download-doclijst'(el) {
    const kader = el.dataset.kader;
    const k = KADERS[kader] || KADERS.NHG;
    const jaar = new Date().getFullYear();
    const lijstje = documentenlijst({ soort: 'IKV', ondernemingen: [], loondienst: { meenemen: true } },
      { kader, familie: k.familie, kaderCfg: k, T: [jaar - 3, jaar - 2, jaar - 1], C: jaar, heeftVPB: true, heeftSamenwerking: true, starter: true, meerdereBV: true, stilleReserves: true, box3: true, rc: true, zk: true, beroepsregister: true, leningDirectie: true, dividendbeleid: true, deelnemingen: true });
    const tekst = lijstje.map((x) => `- ${x.naam}\n  Wanneer: ${x.wanneer}${x.geldigheid ? `\n  Geldigheid: ${x.geldigheid}` : ''}`).join('\n');
    downloadBestand(`documentenlijst-${kader.toLowerCase()}.txt`, tekst, 'text/plain');
  },
  thema(el) {
    zetThema(el.value);
  },
  jaarvolgorde(el) {
    zetJaarVolgorde(el.value);
    toast(el.value === 'oud' ? 'Invoer: oudste jaar links. Overzichten blijven van oud naar nieuw.' : 'Invoer: meest recente jaar links. Overzichten blijven van oud naar nieuw.');
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
    vraagVertrek(logUit);
  },
  'verberg-banner'() {
    try { sessionStorage.setItem('zib.banner.lokaal', '1'); } catch { /* geen opslag */ }
    render({ behoudScroll: true });
  },
  'opnieuw-opslaan'() {
    if (conceptGewijzigd()) return dossierOpslaan();
    return bewaarAlles();
  },
  'conflict-herladen'() {
    if (state.conflict?.dossierConcept && state.conflict.id === dossierconcept?.record.id) conceptWissen();
    losConflictOp('herladen');
    render({ behoudScroll: true });
  },
  'conflict-overschrijven'() {
    if (state.conflict?.dossierConcept && state.conflict.id === dossierconcept?.record.id) {
      const huidig = state.conflict.huidig;
      if (!huidig || huidig.deleted) { toast('Dit dossier is verwijderd. Laad de huidige gegevens om je lijst bij te werken.'); return; }
      losConflictOp('herladen');
      dossierconcept.record.version = huidig.version;
      dossierconcept.basis = JSON.stringify(huidig);
      return dossierOpslaan();
    }
    losConflictOp('overschrijven');
    render({ behoudScroll: true });
  },
  'sluit-modaal'() {
    sluitModaal();
  },
};

function voerUit(actie, el, e) {
  if (dossierOpslag && route.pagina === 'dossier' && !['sluit-modaal', 'zoek-open'].includes(actie)) return;
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
    if (globalThis.ZIB_LOCAL_PRIVATE) await laadPriveStart();
    if (!location.hash) location.hash = state.profiel || state.modus === 'cloud' ? '#/klanten' : '#/login';
    actieveHash = location.hash;
    geschiedenisNummer = history.state?.zibRouteIndex ?? 0;
    history.replaceState({ ...history.state, zibRouteIndex: geschiedenisNummer }, '');
    render();
    if (globalThis.ZIB_LOCAL_PRIVATE || globalThis.ZIB_HOSTED) initBroncijfersImport(() => render());
    if (!globalThis.ZIB_LOCAL_PRIVATE && !globalThis.ZIB_HOSTED) initDrive();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="pagina"><div class="melding niet_akkoord">ZIB kon niet starten: ${esc(e.message || String(e))}</div></div>`;
  }
})();

export { samenvatting, MAANDEN_KORT };
