import test from 'node:test';
import assert from 'node:assert/strict';
import { beleidVoorbeelden, beleidsvoorbeeldVoor } from '../public/js/data/demo.js';
import { BELEIDSPROFIELEN } from '../public/js/engine/beleid.js';
import { bereken, vergelijkKaders, KADER_VOLGORDE } from '../public/js/engine/index.js';

test('Voor elk geldverstrekkerprofiel is een ingevuld en doorrekenbaar oefendossier beschikbaar', () => {
  const voorbeelden = beleidVoorbeelden().filter((dossier) => dossier.soort === 'IKV');
  assert.deepEqual(voorbeelden.map((dossier) => dossier.kader), BELEIDSPROFIELEN.map((profiel) => profiel.id));
  assert.deepEqual(voorbeelden.slice(0, 4).map((dossier) => dossier.nummer), [
    'ZIB-2026-0110', 'ZIB-2026-0111', 'ZIB-2026-0112', 'ZIB-2026-0113',
  ]);

  for (const dossier of voorbeelden) {
    const { kader } = dossier;
    const { beleid, ondernemingen, T, C } = bereken(dossier);
    const [onderneming] = ondernemingen;
    assert.equal(dossier.demo, true, kader);
    assert.deepEqual(T, [2023, 2024, 2025], kader);
    assert.equal(C, 2026, kader);
    const actieveJaren = kader === 'TULP' ? [2025, C] : [...T, C];
    for (const jaar of actieveJaren) {
      assert.equal(onderneming.jaren[jaar].heeftBalans, true, `${kader} ${jaar} balans`);
      assert.equal(onderneming.jaren[jaar].heeftVW, true, `${kader} ${jaar} resultaat`);
    }
    if (beleid.indicatie === null) {
      assert.ok(dossier.oefenverklaringen[kader]?.bedrag > 0, kader);
    } else {
      assert.ok(beleid.indicatie > 0, kader);
      assert.ok(beleid.stappen.length > 0, kader);
    }
    assert.equal(beleid.bewijs, null, kader);
    assert.equal(dossier.beleidsinvoer[kader]?.ikvBedrag, undefined, kader);
  }

  const tulp = beleidsvoorbeeldVoor('TULP');
  assert.equal(bereken(tulp).beleid.indicatie, 42600);
  assert.deepEqual([tulp.ib[2023].voorStart, tulp.ib[2024].voorStart], [38000, 42000]);
  tulp.beleidsinvoer.TULP.actueelJaarinkomen = 0;
  assert.equal(beleidsvoorbeeldVoor('TULP').beleidsinvoer.TULP.actueelJaarinkomen, 52500);
});

test('Het Inkomensanalyse-oefendossier toont voor ieder kader een bedrag of een afzonderlijke oefenverklaring', () => {
  const dossier = beleidsvoorbeeldVoor('ANALYSE');
  assert.equal(dossier.nummer, 'ZIB-2026-0125');
  assert.equal(dossier.demo, true);
  assert.equal(bereken(dossier).vastgesteld, null);
  const vergelijking = vergelijkKaders(dossier);
  assert.deepEqual(vergelijking.map(({ id }) => id), KADER_VOLGORDE);
  const zonderIndicatie = [];
  for (const rij of vergelijking) {
    assert.equal(rij.fout, undefined, rij.id);
    const indicatie = rij.beleid ? rij.beleid.indicatie : rij.vastgesteld;
    if (indicatie > 0) continue;
    zonderIndicatie.push(rij.id);
    assert.equal(rij.beleid.bedrag, null, rij.id);
    assert.ok(dossier.oefenverklaringen[rij.id]?.bedrag > 0, rij.id);
    assert.match(dossier.oefenverklaringen[rij.id]?.opsteller, /^Fictieve /);
  }
  assert.deepEqual(zonderIndicatie, ['TULP']);
});

test('a.s.r. en bijBouwe tonen bij volledige grondslag een NHG-indicatie, met een afzonderlijk bewijsvereiste', () => {
  for (const id of ['ASR', 'BIJBOUWE']) {
    const d = beleidsvoorbeeldVoor(id);
    const r = bereken(d);
    assert.ok(r.beleid.indicatie > 0);
    assert.equal(r.beleid.bedrag, null);
    assert.equal(r.beleid.bewijs, null);
    assert.equal(Object.keys(r.beleid.perJaar).length, 3);
    d.ondernemingen[0].jaren = {};
    d.ib = {};
    assert.equal(bereken(d).beleid.indicatie, null);
  }
  const d = beleidsvoorbeeldVoor('ASR');
  d.loondienst = { meenemen: true, actueelPct: 80, loonJaar: 40000 };
  const r = bereken(d);
  assert.equal(r.beleid.indicatie, null);
  assert.equal(r.beleid.stappen.find((x) => x.label.startsWith('Maximum'))?.waarde, 12000);
});
