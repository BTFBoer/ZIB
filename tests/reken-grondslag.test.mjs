import test from 'node:test';
import assert from 'node:assert/strict';
import { beleidsvoorbeeldVoor } from '../public/js/data/demo.js';
import { KADER_VOLGORDE, vergelijkKaders } from '../public/js/engine/index.js';
import { rekenGrondslagVoorKader } from '../public/js/engine/reken-grondslag.js';

test('Elk toetskader toont de actuele bron, jaarinvoer en gevolgde rekenstappen', () => {
  const basis = beleidsvoorbeeldVoor('VENN');
  for (const kader of KADER_VOLGORDE) {
    const dossier = beleidsvoorbeeldVoor(kader) || basis;
    const detail = rekenGrondslagVoorKader(dossier, kader);
    const [vergelijking] = vergelijkKaders(dossier, [kader]);
    assert.equal(detail.kader, kader);
    assert.equal(detail.bron.versie, vergelijking.versie);
    assert.equal(detail.status, vergelijking.status);
    assert.ok(detail.bron.titel, kader);
    assert.ok(detail.invoer.some((regel) => Number.isFinite(regel.jaar) && Number.isFinite(regel.waarde)), kader);
    assert.ok(detail.stappen.some((regel) => regel.formule), kader);
    assert.ok(detail.regels.length, kader);
  }
});

test('Beleidsgrondslag onderscheidt indicatie, geregistreerde verklaring en werkelijk ingevoerde nul', () => {
  const d = beleidsvoorbeeldVoor('RABO');
  const oud = d.instellingen.laatsteToetsjaar - 2;
  d.ondernemingen[0].jaren[oud].vw.omzet = 0;
  let r = rekenGrondslagVoorKader(d, 'RABO');
  assert.equal(r.uitkomst.toetsinkomen, null);
  assert.ok(r.uitkomst.indicatie > 0);
  assert.equal(r.uitkomst.open, true);
  assert.ok(r.invoer.some((regel) => regel.label === 'Omzet' && regel.jaar === oud && regel.waarde === 0));

  d.beleidsinvoer.RABO = { ...d.beleidsinvoer.RABO, ikvBedrag: 74000, ikvDatum: '2026-09-01', ikvOpsteller: 'Rekenexpert' };
  r = rekenGrondslagVoorKader(d, 'RABO');
  assert.equal(r.uitkomst.bewijs.bedrag, 74000);
  assert.equal(r.uitkomst.toetsinkomen, 74000);
  assert.ok(r.uitkomst.indicatie > 0);
});
