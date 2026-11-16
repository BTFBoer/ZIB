import test from 'node:test';
import assert from 'node:assert/strict';
import { bewaarDossier, state } from '../public/js/state.js';
import { LocalAdapter } from '../public/js/store/local.js';

test('Een bevestigd concept verschijnt pas na opslag en kan een nieuwere versie niet stil overschrijven', async () => {
  const inhoud = new Map();
  let blokkeerRecords = false;
  globalThis.localStorage = {
    getItem(key) { return inhoud.get(key) ?? null; },
    setItem(key, value) {
      if (blokkeerRecords && key === 'zib.records.v1') throw new Error('Opslag vol');
      inhoud.set(key, value);
    },
    removeItem(key) { inhoud.delete(key); },
  };
  const adapter = new LocalAdapter();
  const anderVenster = new LocalAdapter();
  try {
    await adapter.init();
    await anderVenster.init();
    state.adapter = adapter;
    const id = 'dos_opslaan_test';
    const origineel = await bewaarDossier({ id, type: 'dossier', notities: { conclusie: 'Bewaard' } });
    const concept = { ...origineel, notities: { conclusie: 'Concept' } };
    assert.equal(state.records.get(id).notities.conclusie, 'Bewaard');

    blokkeerRecords = true;
    const warn = console.warn;
    console.warn = () => {};
    try { assert.equal(await bewaarDossier(concept), null); } finally { console.warn = warn; }
    blokkeerRecords = false;
    assert.equal(concept.notities.conclusie, 'Concept');
    assert.equal(state.records.get(id).notities.conclusie, 'Bewaard');
    assert.equal((await adapter.list())[0].version, origineel.version);
    assert.equal((await adapter.versions(id)).length, 0);

    const nieuwereVersie = await anderVenster.put({ ...origineel, notities: { conclusie: 'Tweede venster' } }, { controleerVersie: true });
    assert.equal(await bewaarDossier(concept), null);
    assert.equal(state.conflict.huidig.notities.conclusie, 'Tweede venster');
    assert.equal(state.conflict.huidig.version, nieuwereVersie.version);
    assert.equal(state.records.get(id).notities.conclusie, 'Bewaard');
  } finally {
    state.records.clear();
    state.conflict = null;
    delete globalThis.localStorage;
  }
});
