import test from 'node:test';
import assert from 'node:assert/strict';
import { beleidVoorbeelden } from '../public/js/data/demo.js';
import { laadBeleidsvoorbeelden, start, state } from '../public/js/state.js';

test('Demo aanvullen: bestaande en verwijderde dossiers behouden, ontbrekende voorbeelden laden', async () => {
  const [venn, ing, rabo, nibc, ...nieuweVoorbeelden] = beleidVoorbeelden();
  const gewijzigd = { ...venn, version: 4, notities: { algemeen: 'Eigen toelichting' } };
  const verwijderd = { ...ing, deleted: true };
  const eigen = { id: 'dos_eigen', type: 'dossier', nummer: rabo.nummer };
  const bewaard = new Map([
    ['zib.demo.geladen', '1'],
    ['zib.records.v1', JSON.stringify(Object.fromEntries([gewijzigd, verwijderd, eigen].map((r) => [r.id, r])))],
  ]);
  const globals = {
    ZIB_DEMO: true,
    location: { hostname: 'demo.example', protocol: 'https:' },
    localStorage: {
      getItem: (key) => bewaard.get(key) ?? null,
      setItem: (key, value) => bewaard.set(key, value),
      removeItem: (key) => bewaard.delete(key),
    },
  };
  const oorspronkelijk = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
    await start();
    const dossiers = JSON.parse(bewaard.get('zib.records.v1'));
    assert.deepEqual(dossiers[venn.id], gewijzigd);
    assert.deepEqual(dossiers[ing.id], verwijderd);
    assert.deepEqual(dossiers[eigen.id], eigen);
    assert.equal(dossiers[rabo.id], undefined);
    assert.equal(dossiers[nibc.id].nummer, 'ZIB-2026-0113');
    assert.equal(state.records.get(nibc.id)?.nummer, 'ZIB-2026-0113');
    for (const voorbeeld of nieuweVoorbeelden) {
      assert.equal(state.records.get(voorbeeld.id)?.nummer, voorbeeld.nummer);
    }
    assert.equal(laadBeleidsvoorbeelden(), 0);
  } finally {
    for (const [key, eigenschap] of Object.entries(oorspronkelijk)) {
      if (eigenschap) Object.defineProperty(globalThis, key, eigenschap);
      else delete globalThis[key];
    }
  }
});
