import { kiesAdapter } from './store/index.js';
import { ConflictError } from './store/api.js';
import { uid, nowISO } from './util.js';
import { demoRecords, beleidVoorbeelden } from './data/demo.js';
import { migreerDossier } from './schema/fields.js';
import { priveAlsTekst } from './views/formats.js';

/**
 * Zet records uit een oudere versie om naar het actuele formaat (alleen in het geheugen;
 * de nieuwe vorm wordt opgeslagen bij de eerstvolgende wijziging).
 */
export function migreer(r) {
  if (!r || r.type !== 'dossier') return r;
  migreerDossier(r);
  const n = r.notities || {};
  if (!n.priveTekst && n.prive && Object.values(n.prive).some((x) => x !== '' && x !== null && x !== undefined)) {
    r.notities = { ...n, priveTekst: priveAlsTekst(n.prive) };
  }
  if (!Array.isArray(r.zk) && r.nul?.zk?.ja) {
    r.zk = [{ id: uid('zk'), soort: 'krediet', kredietgever: '', omschrijving: 'Zakelijk krediet', ondId: '',
      maandlast: r.nul.zk.maandlast, gedragenDoor: r.nul.zk.prive ? 'prive' : 'onderneming', status: 'lopend' }];
  }
  if (!r.statusDatum) r.statusDatum = r.gewijzigd || r.aangemaakt || '';
  return r;
}

const luisteraars = new Set();

export const state = {
  adapter: null,
  modus: 'lokaal',
  me: null,
  profiel: null,
  records: new Map(),
  opslag: { status: 'opgeslagen', tijd: null, fout: '' },
  conflict: null,
  waarschuwing: '',
};

export function opWijziging(fn) {
  luisteraars.add(fn);
  return () => luisteraars.delete(fn);
}

function meld(type, detail) {
  luisteraars.forEach((fn) => {
    try { fn(type, detail); } catch (e) { console.error(e); }
  });
}

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* niet beschikbaar */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* niet beschikbaar */ } }

export async function start() {
  const voorkeur = lsGet('zib.opslagvoorkeur') || 'auto';
  const { adapter, me, waarschuwing } = await kiesAdapter(voorkeur);
  state.waarschuwing = waarschuwing || '';
  state.adapter = adapter;
  state.modus = adapter.naam;
  state.me = me || {};
  const lijst = await adapter.list();
  lijst.forEach((r) => state.records.set(r.id, migreer(r)));
  if (adapter.naam === 'lokaal' && globalThis.ZIB_LOCAL_PRIVATE !== true && lijst.length === 0 && !lsGet('zib.demo.geladen')) {
    await laadDemo();
  } else if (kanBeleidsvoorbeeldenLaden() && globalThis.ZIB_DEMO === true && lsGet('zib.demo.geladen')
    && lijst.some((r) => r.type === 'dossier' && r.id.startsWith('dos_demo_'))) {
    try { laadBeleidsvoorbeelden(); } catch (e) { state.waarschuwing ||= e.message; }
  }
  state.profiel = laadProfiel();
}

// ---------------------------------------------------------------------------
// Profiel en sessie
// ---------------------------------------------------------------------------
export function laadProfiel() {
  if (state.modus === 'cloud') {
    const email = (state.me?.email || 'onbekend').toLowerCase();
    const id = `profiel_${email.replace(/[^a-z0-9]/g, '_')}`;
    return { naam: state.me?.naam || email, initialen: '', ...state.records.get(id),
      id, type: 'profiel', email, rol: 'acceptant', accreditatie: state.me?.accreditatie || '' };
  }
  try {
    const p = JSON.parse(lsGet('zib.profiel') || 'null');
    return p && p.naam ? p : null;
  } catch {
    return null;
  }
}

export function bewaarProfiel(p) {
  if (state.modus === 'cloud') {
    state.profiel = { ...p, email: state.me.email, rol: 'acceptant', accreditatie: state.me.accreditatie || '' };
    opslaan(state.profiel, { direct: true });
  } else {
    state.profiel = p;
    lsSet('zib.profiel', JSON.stringify(p));
  }
  meld('profiel');
}

export function logUit() {
  if (state.modus === 'cloud') {
    location.href = '/cdn-cgi/access/logout';
    return;
  }
  lsDel('zib.profiel');
  state.profiel = null;
  location.hash = '#/login';
}

export function zetOpslagvoorkeur(v) {
  lsSet('zib.opslagvoorkeur', v);
}

export function opslagvoorkeur() {
  return lsGet('zib.opslagvoorkeur') || 'auto';
}

export function mijnNaam() {
  return state.profiel?.naam || state.me?.email || 'Onbekend';
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------
export function lijst(type) {
  return [...state.records.values()].filter((r) => r.type === type && !r.deleted);
}

export function get(id) {
  return state.records.get(id) || null;
}

const timers = new Map();
const bezig = new Set();
const opnieuw = new Set();
const lopendeSchrijfacties = new Map();

export function opslaan(rec, { direct = false } = {}) {
  rec.gewijzigd = nowISO();
  rec.gewijzigdDoor = mijnNaam();
  state.records.set(rec.id, rec);
  state.opslag = { status: 'bezig', tijd: state.opslag.tijd, fout: '' };
  meld('opslag');
  clearTimeout(timers.get(rec.id));
  if (direct) {
    timers.delete(rec.id);
    return schrijfDirect(rec.id);
  }
  timers.set(rec.id, setTimeout(() => schrijf(rec.id), 700));
  return null;
}

/** Bewaar een dossierconcept. Pas de gedeelde dossierlijst aan nadat de opslag bevestigd is. */
export async function bewaarDossier(concept) {
  const { id } = concept;
  if (timers.has(id)) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    if (await schrijfDirect(id) === false) return null;
  } else if (lopendeSchrijfacties.has(id) && await lopendeSchrijfacties.get(id) === false) return null;

  const dossier = { ...concept, gewijzigd: nowISO(), gewijzigdDoor: mijnNaam() };
  state.opslag = { status: 'bezig', tijd: state.opslag.tijd, fout: '' };
  meld('opslag');
  try {
    const huidig = get(id);
    if ((huidig?.version || 0) !== (dossier.version || 0)) throw new ConflictError(huidig);
    const bewaard = await state.adapter.put(dossier, { controleerVersie: true });
    state.records.set(id, bewaard);
    state.opslag = { status: 'opgeslagen', tijd: new Date(), fout: '' };
    if (state.conflict?.id === id) state.conflict = null;
    meld('records', id);
    return bewaard;
  } catch (e) {
    if (e instanceof ConflictError) {
      state.conflict = { id, huidig: e.huidig, dossierConcept: true };
      state.opslag = { status: 'conflict', tijd: state.opslag.tijd, fout: e.message };
      meld('conflict', state.conflict);
    } else {
      state.opslag = { status: 'fout', tijd: state.opslag.tijd, fout: e.message || String(e) };
    }
    return null;
  } finally {
    meld('opslag');
  }
}

async function schrijfDirect(id) {
  while (lopendeSchrijfacties.has(id)) {
    if (await lopendeSchrijfacties.get(id) === false) return false;
  }
  return schrijf(id);
}

function schrijf(id) {
  if (lopendeSchrijfacties.has(id)) {
    opnieuw.add(id);
    return lopendeSchrijfacties.get(id);
  }
  const taak = Promise.resolve().then(() => schrijfRecord(id)).finally(() => {
    lopendeSchrijfacties.delete(id);
    if (opnieuw.delete(id)) schrijf(id);
  });
  lopendeSchrijfacties.set(id, taak);
  return taak;
}

async function schrijfRecord(id) {
  timers.delete(id);
  const rec = state.records.get(id);
  if (!rec) return;
  bezig.add(id);
  try {
    const res = await state.adapter.put(rec);
    rec.version = res.version;
    rec.updated_at = res.updated_at;
    if (res.updated_by) rec.updated_by = res.updated_by;
    if (!timers.size && bezig.size === 1) {
      state.opslag = { status: 'opgeslagen', tijd: new Date(), fout: '' };
    }
    return true;
  } catch (e) {
    if (e instanceof ConflictError) {
      state.conflict = { id, huidig: e.huidig };
      state.opslag = { status: 'conflict', tijd: state.opslag.tijd, fout: e.message };
      meld('conflict', state.conflict);
    } else {
      state.opslag = { status: 'fout', tijd: state.opslag.tijd, fout: e.message || String(e) };
    }
    return false;
  } finally {
    bezig.delete(id);
    meld('opslag');
  }
}

export async function bewaarAlles() {
  const ids = [...timers.keys()];
  ids.forEach((id) => clearTimeout(timers.get(id)));
  await Promise.all(ids.map((id) => schrijf(id)));
}

export function heeftOnopgeslagen() {
  return timers.size > 0 || lopendeSchrijfacties.size > 0;
}

export function nieuw(type, data = {}) {
  const prefix = { dossier: 'dos', advieskantoor: 'adv', taak: 'taak', ticket: 'tkt', document: 'doc' }[type] || type;
  const rec = { id: uid(prefix), type, aangemaakt: nowISO(), ...data };
  opslaan(rec, { direct: true });
  meld('records');
  return rec;
}

export async function verwijder(id) {
  const r = state.records.get(id);
  if (!r) return;
  clearTimeout(timers.get(id));
  timers.delete(id);
  state.records.delete(id);
  meld('records');
  try {
    await state.adapter.remove(id, r.version);
  } catch (e) {
    state.opslag = { status: 'fout', tijd: state.opslag.tijd, fout: e.message || String(e) };
    meld('opslag');
  }
}

export function losConflictOp(keuze) {
  const c = state.conflict;
  if (!c) return;
  state.conflict = null;
  if (keuze === 'herladen') {
    if (c.huidig && !c.huidig.deleted) state.records.set(c.id, c.huidig);
    else state.records.delete(c.id);
    state.opslag = { status: 'opgeslagen', tijd: new Date(), fout: '' };
  } else if (keuze === 'overschrijven') {
    const rec = state.records.get(c.id);
    if (rec && c.huidig) rec.version = c.huidig.version;
    if (rec) opslaan(rec, { direct: true });
  }
  meld('records');
  meld('opslag');
}

export function volgendDossiernummer(jaar = new Date().getFullYear()) {
  const prefix = `ZIB-${jaar}-`;
  const max = lijst('dossier')
    .map((d) => (String(d.nummer || '').startsWith(prefix) ? Number(String(d.nummer).slice(prefix.length)) : 0))
    .reduce((a, b) => Math.max(a, Number.isFinite(b) ? b : 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export function logHistorie(dossier, actie) {
  dossier.historie = dossier.historie || [];
  dossier.historie.unshift({ at: nowISO(), door: mijnNaam(), actie });
}

// ---------------------------------------------------------------------------
// Back-up en demo
// ---------------------------------------------------------------------------
export async function exporteer() {
  await bewaarAlles();
  return state.adapter.exportAll();
}

export async function importeer(json) {
  const n = await state.adapter.importAll(json);
  state.records.clear();
  (await state.adapter.list()).forEach((r) => state.records.set(r.id, migreer(r)));
  meld('records');
  return n;
}

export async function laadDemo() {
  const recs = demoRecords();
  if (state.adapter?.naam === 'lokaal') {
    const aantal = voegLokaleVoorbeeldenToe(recs);
    lsSet('zib.demo.geladen', '1');
    return aantal;
  }
  for (const r of recs) {
    const res = await state.adapter.put(r);
    state.records.set(r.id, migreer({ ...r, version: res.version, updated_at: res.updated_at }));
  }
  lsSet('zib.demo.geladen', '1');
  meld('records');
}

export function kanBeleidsvoorbeeldenLaden() {
  return state.adapter?.naam === 'lokaal' && !globalThis.ZIB_ARTIFACT && globalThis.ZIB_LOCAL_PRIVATE !== true;
}

export function laadBeleidsvoorbeelden() {
  if (!kanBeleidsvoorbeeldenLaden()) return 0;
  return voegLokaleVoorbeeldenToe(beleidVoorbeelden());
}

function voegLokaleVoorbeeldenToe(records) {
  // De oorspronkelijke tijdstempels houden samenvoegen met een bestaande back-up voorspelbaar.
  const metTijd = records.map((r) => ({ ...r, version: 1, updated_at: r.gewijzigd || r.aangemaakt || '2026-01-01T00:00:00.000Z' }));
  const toegevoegd = state.adapter.voegOntbrekendeToe(metTijd);
  toegevoegd.forEach((r) => state.records.set(r.id, migreer({ ...r })));
  if (toegevoegd.length) meld('records');
  return toegevoegd.length;
}

export async function wisLokaal() {
  if (state.modus !== 'lokaal') return;
  await state.adapter.wisAlles();
  state.records.clear();
  lsSet('zib.demo.geladen', '1');
  meld('records');
}
