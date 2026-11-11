// Google Drive als opslag voor de ingesloten demo (claude.ai-artifact).
//
// ZIB bewaart alle records als JSON-bestand in de map "ZIB" in de Google Drive van de gebruiker,
// via de Google Drive-koppeling van claude.ai (runtime-capability "mcp"). De koppeling kan de
// inhoud van een bestaand bestand niet overschrijven, dus elke opslag is een nieuwe versie
// ("ZIB-gegevens <tijd>.json"); de tien nieuwste blijven staan, oudere gaan naar de prullenbak.
// Bij het ophalen voegt ZIB de nieuwste versie samen met wat in deze browser staat: per record
// wint de nieuwste wijziging. Daarna slaat ZIB automatisch op, kort na elke wijziging.
//
// De zoekfunctie van de koppeling geeft haar antwoord in pagina's en zonder sortering op relevantie.
// ZIB vraagt daarom om de laatst gewijzigde versie eerst en leest alle pagina's (zie verzamelVersies):
// zo is de nieuwste versie altijd gevonden en ruimt ZIB ook echt op tot de tien nieuwste.
import { state, exporteer, importeer, opWijziging } from '../state.js';
import { samenvoegen, vingerafdruk, versieNaam, base64NaarTekst, verzamelVersies, teVerwijderen } from './samenvoegen.js';

export const DRIVE_SERVER = 'Google Drive';
export const DRIVE_TOOLS = ['search_files', 'create_file', 'download_file_content', 'trash_file'];
const MAP = 'ZIB';
const PREFIX = 'ZIB-gegevens';
const BEWAAR = 10;
const MAX_OPRUIMEN = 10; // per synchronisatie hooguit zoveel oude versies naar de prullenbak
const OPRUIM_MS = 8000; // en niet langer dan dit, zodat een volgende opslag niet hoeft te wachten
const MAX_TEKST = 900 * 1024; // ruim onder de invoerlimiet van 1 MiB per aanroep
// Opruimen is niet toegestaan of geweigerd: in deze sessie niet opnieuw vragen.
const OPRUIMEN_GEWEIGERD = new Set(['approval_required', 'not_in_manifest', 'blocked_by_policy', 'consent_required']);

const FOUTTEKST = {
  needs_reauth: 'Verbind Google Drive opnieuw in claude.ai (Instellingen → Connectors).',
  server_not_connected: 'Voeg Google Drive toe in claude.ai (Instellingen → Connectors).',
  selection_required: 'Kies in claude.ai welke Google Drive-koppeling deze pagina gebruikt.',
  server_not_found: 'De Google Drive-koppeling bestaat niet meer. Voeg hem opnieuw toe in claude.ai.',
  not_in_manifest: 'Google Drive staat voor deze pagina uit of is geweigerd. Zet het aan via Rechten beheren.',
  blocked_by_policy: 'Je organisatie staat Google Drive voor deze pagina niet toe.',
  approval_required: 'Google Drive wacht op je goedkeuring. Klik op Nu opslaan en sta het toe.',
  server_unavailable: 'Google Drive reageert even niet. Probeer het zo opnieuw.',
  upstream_error: 'Google Drive gaf een fout. Probeer het zo opnieuw.',
  rate_limited: 'Te veel verzoeken achter elkaar. Probeer het over een paar seconden opnieuw.',
  not_granted: 'Google Drive is in deze weergave niet beschikbaar.',
  capability_disabled: 'Google Drive is in deze weergave niet beschikbaar.',
  capability_removed: 'Google Drive is in deze weergave niet beschikbaar.',
  consent_required: 'Sta Google Drive toe voor deze pagina en probeer het opnieuw.',
  cancelled: 'Afgebroken.',
};

/** Toestand voor de schermen (bovenbalk en paneel op Downloads). */
export const drive = {
  beschikbaar: false, // kan deze weergave de koppeling gebruiken?
  toestemming: 'onbekend', // granted | prompt | denied | unavailable | onbekend
  status: 'uit', // uit | bezig | ok | fout
  melding: '',
  code: '',
  laatst: null, // Date van de laatste geslaagde synchronisatie
  bestand: '',
  versies: 0,
  opruimen: '', // 'geweigerd' als oude versies niet naar de prullenbak mogen
  mapUrl: '',
  uitgezet: false, // in deze browser ontkoppeld
};

let mcp = null;
let rechten = null;
let mapId = '';
let laatsteAfdruk = '';
let opruimenGeweigerd = false;
let timer = null;
let lopend = null;
let importerend = false;
let bestandsArgumenten = false;
const luisteraars = new Set();

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* niet beschikbaar */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* niet beschikbaar */ } }

/** Luister naar wijzigingen: type "status" of "records" (er zijn records uit Drive overgenomen). */
export function opDriveWijziging(fn) {
  luisteraars.add(fn);
  return () => luisteraars.delete(fn);
}
function meld(type = 'status') {
  luisteraars.forEach((fn) => { try { fn(type); } catch (e) { console.error(e); } });
}

function wachttijd() {
  const t = Number(globalThis.ZIB_DRIVE_WACHT_MS);
  return Number.isFinite(t) && t >= 0 ? t : 20000;
}

/** Start de koppeling als deze weergave de capability heeft. Vraagt nooit zelf om toestemming. */
export async function initDrive() {
  if (!globalThis.ZIB_ARTIFACT || typeof globalThis.claude?.use !== 'function') return;
  drive.uitgezet = lsGet('zib.drive.uit') === '1';
  try { mcp = await globalThis.claude.use('mcp'); } catch { mcp = null; }
  if (!mcp) { drive.beschikbaar = false; meld(); return; }
  drive.beschikbaar = true;
  try { rechten = await globalThis.claude.use('permissions'); } catch { rechten = null; }
  drive.toestemming = rechten
    ? await Promise.resolve(rechten.state(`mcp:${DRIVE_SERVER}`)).catch(() => 'unavailable')
    : (lsGet('zib.drive.aan') === '1' ? 'granted' : 'prompt');
  try { bestandsArgumenten = !!(await mcp.listTools())?.fileArgs; } catch { bestandsArgumenten = false; }
  opWijziging((type) => {
    if (importerend) return;
    if ((type === 'opslag' && state.opslag.status === 'opgeslagen') || type === 'records') planOpslag();
  });
  meld();
  // Eerder toegestaan: meteen ophalen en samenvoegen. Anders wacht ZIB op de knop "Koppelen".
  if (drive.toestemming === 'granted' && !drive.uitgezet) synchroniseer();
}

/** Plan een synchronisatie kort na een wijziging (alleen als er echt iets veranderd is). */
export function planOpslag() {
  // Alleen als er al gekoppeld is: nooit ongevraagd om toestemming vragen.
  if (!mcp || drive.uitgezet || (drive.status === 'uit' && drive.toestemming !== 'granted')) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const lokaal = (await state.adapter.exportAll()).records || [];
      if (vingerafdruk(lokaal) === laatsteAfdruk) return;
    } catch { return; }
    synchroniseer();
  }, wachttijd());
}

async function roep(tool, invoer, { lezen = false } = {}) {
  const een = async () => {
    const r = await mcp.callTool(DRIVE_SERVER, tool, invoer, { cache: false });
    return r && 'payload' in r ? r.payload : r;
  };
  try {
    return await een();
  } catch (e) {
    // Alleen lezen mag één keer automatisch opnieuw, en alleen als de fout dat toestaat.
    if (lezen && e?.retryable) {
      const ms = Math.min(15000, Number(e.retryAfterMs) || (1200 + Math.random() * 1500));
      await new Promise((ok) => { setTimeout(ok, ms); });
      return een();
    }
    throw e;
  }
}

async function zorgVoorMap() {
  const r = await roep('search_files', {
    query: `title = '${MAP}' and mimeType = 'application/vnd.google-apps.folder' and owner = 'me'`,
    excludeContentSnippets: true, pageSize: 10,
  }, { lezen: true });
  const mappen = (r?.files || []).filter((f) => f && f.id)
    .sort((a, b) => String(a.createdTime || '').localeCompare(String(b.createdTime || '')));
  const voorkeur = lsGet('zib.drive.map');
  const gekozen = mappen.find((f) => f.id === voorkeur) || mappen[0];
  if (gekozen) mapId = gekozen.id;
  else {
    const m = await roep('create_file', { title: MAP, contentMimeType: 'application/vnd.google-apps.folder' });
    if (!m?.id) throw { code: 'tool_error', message: 'De map ZIB kon niet worden aangemaakt.' };
    mapId = m.id;
  }
  lsSet('zib.drive.map', mapId);
  drive.mapUrl = `https://drive.google.com/drive/folders/${encodeURIComponent(mapId)}`;
}

/** Alle versies in de map, nieuwste eerst (alle pagina's van de zoekfunctie, niet alleen de eerste). */
async function versies() {
  const { versies: lijst } = await verzamelVersies(
    (invoer) => roep('search_files', invoer, { lezen: true }),
    { mapId, prefix: PREFIX },
  );
  return lijst;
}

async function lees(id) {
  const r = await roep('download_file_content', { fileId: id }, { lezen: true });
  let json;
  try { json = JSON.parse(base64NaarTekst(r?.content)); } catch { json = null; }
  if (!json || json.app !== 'ZIB' || !Array.isArray(json.records)) {
    throw { code: 'formaat', message: 'De nieuwste versie in de map ZIB is geen leesbaar ZIB-bestand.' };
  }
  return json;
}

async function schrijf(records) {
  const nu = new Date();
  const title = versieNaam(PREFIX, nu);
  const tekst = JSON.stringify({ app: 'ZIB', formaat: 1, geexporteerd: nu.toISOString(), bron: 'Google Drive', records });
  const invoer = { title, parentId: mapId, contentMimeType: 'application/json', disableConversionToGoogleType: true };
  if (tekst.length <= MAX_TEKST) invoer.textContent = tekst;
  else if (bestandsArgumenten) {
    invoer.base64Content = { $file: { data: new Blob([tekst], { type: 'application/json' }), name: 'zib-gegevens.json', type: 'application/json' } };
  } else {
    throw { code: 'te_groot', message: `De gegevens (${Math.round(tekst.length / 1024)} kB) zijn te groot om in één keer naar Google Drive te sturen. Maak een back-up via Downloads.` };
  }
  const f = await roep('create_file', invoer);
  if (!f?.id) throw { code: 'tool_error', message: 'Google Drive gaf geen bestand terug.' };
  return { id: f.id, title: f.title || title, createdTime: f.createdTime || nu.toISOString() };
}

/**
 * Verplaatst oude versies naar de prullenbak; de tien nieuwste blijven staan. Oudste eerst en een
 * begrensd aantal per keer: een achterstand loopt in de volgende synchronisaties verder terug.
 * Geeft het aantal verplaatste versies terug.
 */
async function ruimOp(lijst) {
  if (opruimenGeweigerd) return 0;
  const start = Date.now();
  let weg = 0;
  for (const f of teVerwijderen(lijst, BEWAAR, MAX_OPRUIMEN)) {
    if (Date.now() - start > OPRUIM_MS) break;
    try {
      await roep('trash_file', { fileId: f.id });
      weg += 1;
    } catch (e) {
      // Bij de eerste fout stoppen: niet toegestaan blijft de rest van de sessie zo, iets anders
      // (bijvoorbeeld een storing) lost een volgende synchronisatie op.
      if (OPRUIMEN_GEWEIGERD.has(e?.code)) { opruimenGeweigerd = true; drive.opruimen = 'geweigerd'; }
      break;
    }
  }
  return weg;
}

function fout(e) {
  const code = e?.code || '';
  drive.status = 'fout';
  drive.code = code;
  drive.melding = code === 'tool_error'
    ? `Google Drive weigerde de opdracht${e?.message ? `: ${e.message}` : '.'}`
    : FOUTTEKST[code] || e?.message || 'Opslaan in Google Drive is niet gelukt.';
  if (code === 'not_in_manifest') drive.toestemming = 'denied';
}

/**
 * Haal de nieuwste versie op, voeg samen met deze browser en sla een nieuwe versie op als er
 * iets veranderd is. Roep dit de eerste keer aan vanuit een klik: dan vraagt claude.ai toestemming.
 */
export function synchroniseer() {
  if (!mcp) return Promise.resolve(null);
  if (lopend) return lopend;
  lopend = (async () => {
    clearTimeout(timer);
    drive.status = 'bezig';
    drive.melding = '';
    drive.code = '';
    meld();
    try {
      await zorgVoorMap();
      const lijst = await versies();
      const extern = lijst[0] ? await lees(lijst[0].id) : null;
      const lokaal = (await exporteer()).records || [];
      const { samen, vanExtern } = samenvoegen(lokaal, extern?.records || []);
      if (vanExtern.length) {
        importerend = true;
        try { await importeer({ records: vanExtern }); } finally { importerend = false; }
      }
      const afdruk = vingerafdruk(samen);
      let titel = lijst[0]?.title || '';
      if (!extern || vingerafdruk(extern.records) !== afdruk) {
        const nieuw = await schrijf(samen);
        lijst.unshift(nieuw);
        titel = nieuw.title;
      }
      // De gegevens staan veilig; daarna pas opruimen. Een fout daarbij maakt de opslag niet ongedaan.
      const weg = await ruimOp(lijst);
      laatsteAfdruk = afdruk;
      drive.status = 'ok';
      drive.toestemming = 'granted';
      drive.laatst = new Date();
      drive.bestand = titel;
      drive.versies = lijst.length - weg;
      drive.uitgezet = false;
      lsSet('zib.drive.aan', '1');
      lsDel('zib.drive.uit');
      if (vanExtern.length) meld('records');
      return { opgehaald: vanExtern.length };
    } catch (e) {
      fout(e);
      return null;
    } finally {
      lopend = null;
      meld();
    }
  })();
  return lopend;
}

/** Stop met opslaan in Google Drive in deze browser (de bestanden in Drive blijven staan). */
export function ontkoppel() {
  clearTimeout(timer);
  drive.uitgezet = true;
  drive.status = 'uit';
  drive.melding = '';
  lsSet('zib.drive.uit', '1');
  meld();
}

/** Open het rechtenpaneel van claude.ai (na een weigering). */
export async function beheerRechten() {
  if (!rechten?.manage) return false;
  try {
    await rechten.manage();
    drive.toestemming = await Promise.resolve(rechten.state(`mcp:${DRIVE_SERVER}`)).catch(() => drive.toestemming);
    meld();
    return true;
  } catch {
    return false;
  }
}
