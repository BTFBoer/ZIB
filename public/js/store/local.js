// Lokale opslag: alles blijft in deze browser. Bedoeld voor de demo en voor offline werken.
// Let op: wissen van browsergegevens = gegevens kwijt. Gebruik daarom de cloudopslag of maak back-ups.

import { ConflictError } from './api.js';

const KEY = 'zib.records.v1';
const VKEY = 'zib.versies.v1';
const MAX_VERSIES = 25;

function lees(key, standaard) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : standaard;
  } catch {
    return standaard;
  }
}

function schrijf(key, waarde) {
  try {
    localStorage.setItem(key, JSON.stringify(waarde));
    return true;
  } catch (e) {
    console.warn('Opslaan in localStorage mislukt', e);
    return false;
  }
}

export class LocalAdapter {
  constructor() {
    this.naam = 'lokaal';
    this.omschrijving = 'Lokaal in deze browser';
    this.data = {};
    this.versies = {};
    this.persistent = true;
    this.dataKey = globalThis.ZIB_LOCAL_PRIVATE === true ? 'zib.prive.records.v1' : KEY;
    this.versionKey = globalThis.ZIB_LOCAL_PRIVATE === true ? 'zib.prive.versies.v1' : VKEY;
  }

  async init() {
    try {
      localStorage.setItem('zib.test', '1');
      localStorage.removeItem('zib.test');
    } catch {
      this.persistent = false;
    }
    this.data = lees(this.dataKey, {});
    this.versies = lees(this.versionKey, {});
    return { naam: '', email: '' };
  }

  async list() {
    return Object.values(this.data).filter((r) => !r.deleted);
  }

  async put(rec, { controleerVersie = false } = {}) {
    const opgeslagen = lees(this.dataKey, this.data);
    const vorigeVersies = lees(this.versionKey, this.versies);
    const vorig = opgeslagen[rec.id];
    if (controleerVersie && ((vorig?.version || 0) !== (rec.version || 0) || vorig?.deleted)) {
      throw new ConflictError(vorig || null);
    }
    const versies = { ...vorigeVersies };
    if (vorig) versies[rec.id] = [
      { version: vorig.version || 0, at: vorig.updated_at || '', door: vorig.updated_by || '', data: vorig },
      ...(vorigeVersies[rec.id] || []),
    ].slice(0, MAX_VERSIES);
    const nieuw = { ...rec, version: (vorig?.version || 0) + 1, updated_at: new Date().toISOString(), updated_by: rec.gewijzigdDoor || '' };
    const data = { ...opgeslagen, [rec.id]: nieuw };
    // Schrijf de versiehistorie eerst. Als het dossier niet past, blijft de bewaarde versie leidend.
    if (!schrijf(this.versionKey, versies)) throw new Error('De browseropslag is vol of geblokkeerd. Maak een back-up bij Downloads.');
    if (!schrijf(this.dataKey, data)) {
      schrijf(this.versionKey, vorigeVersies);
      throw new Error('De browseropslag is vol of geblokkeerd. Maak een back-up (Downloads) en koppel de cloudopslag.');
    }
    this.data = data;
    this.versies = versies;
    return nieuw;
  }

  async remove(id, version) {
    const r = lees(this.dataKey, this.data)[id];
    if (!r) return;
    await this.put({ ...r, deleted: true, version: version ?? r.version }, { controleerVersie: version !== undefined });
  }

  async versions(id) {
    return (this.versies[id] || []).map((v) => ({ version: v.version, at: v.at, door: v.door }));
  }

  async getVersion(id, version) {
    return (this.versies[id] || []).find((v) => v.version === version)?.data || null;
  }

  async exportAll() {
    return { app: 'ZIB', formaat: 1, geexporteerd: new Date().toISOString(), records: Object.values(this.data) };
  }

  async importAll(json) {
    const recs = Array.isArray(json?.records) ? json.records : [];
    const data = { ...lees(this.dataKey, this.data) };
    recs.forEach((r) => { if (r && r.id && r.type) data[r.id] = r; });
    if (!schrijf(this.dataKey, data)) throw new Error('De browseropslag is vol of geblokkeerd. De back-up kon niet worden teruggezet.');
    this.data = data;
    return recs.length;
  }

  /** Voeg voorbeelden toe, met behoud van bestaande en verwijderde dossiers. */
  voegOntbrekendeToe(records) {
    const bewaard = { ...(this.persistent ? lees(this.dataKey, this.data) : this.data) };
    const nummers = new Set(Object.values(bewaard)
      .filter((r) => r.type === 'dossier' && !r.deleted)
      .map((r) => r.nummer));
    const toegevoegd = [];
    for (const rec of records) {
      if (Object.hasOwn(bewaard, rec.id)) continue;
      if (rec.type === 'dossier' && rec.nummer) {
        if (nummers.has(rec.nummer)) continue;
        nummers.add(rec.nummer);
      }
      bewaard[rec.id] = rec;
      toegevoegd.push(rec);
    }
    if (toegevoegd.length && this.persistent && !schrijf(this.dataKey, bewaard)) {
      throw new Error('De browseropslag is vol of geblokkeerd.');
    }
    this.data = bewaard;
    return toegevoegd;
  }

  async wisAlles() {
    this.data = {};
    this.versies = {};
    schrijf(this.dataKey, this.data);
    schrijf(this.versionKey, this.versies);
    try { await idbClear(); } catch { /* geen bestanden */ }
  }

  async putFile(id, file) {
    await idbPut(id, file);
    return { opslag: 'lokaal' };
  }

  async getFile(id) {
    return idbGet(id);
  }

  async removeFile(id) {
    return idbDel(id);
  }
}

// --- IndexedDB voor bestanden (localStorage is te klein voor pdf's) ---------
function idb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB niet beschikbaar')); return; }
    const req = indexedDB.open(globalThis.ZIB_LOCAL_PRIVATE === true ? 'zib-prive-bestanden' : 'zib-bestanden', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('bestanden');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(id, blob) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bestanden', 'readwrite');
    tx.objectStore('bestanden').put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(id) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bestanden', 'readonly');
    const req = tx.objectStore('bestanden').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(id) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bestanden', 'readwrite');
    tx.objectStore('bestanden').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear() {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bestanden', 'readwrite');
    tx.objectStore('bestanden').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
