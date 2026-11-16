import test from 'node:test';
import assert from 'node:assert/strict';
import { bereken } from '../public/js/engine/index.js';
import { rekenInvoerStatus } from '../public/js/engine/reken-invoer.js';

const T = [2023, 2024, 2025];

function dossier(kader, rechtsvorm = 'EZ') {
  return {
    kader, soort: 'IKV', berekeningsdatum: '2026-06-30', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [{ id: 'ond', naam: 'Fictief', rechtsvorm, aandeelPct: 100, startdatum: '2022-01-01',
      land: 'NL', belastingplichtig: 'NL', jaren: {} }],
    beleidsinvoer: { VENN: { sector: 'toegestaan', verhuurInOnderneming: 'nee', faillissement: 'nee' } },
    ib: Object.fromEntries(T.map((jaar) => [jaar, { perOnd: { ond: {} } }])),
  };
}

function punten(d) {
  return rekenInvoerStatus(d, bereken(d)).ondernemingen[0].punten;
}

test('ING verlangt uitsluitend de fiscale winst voor de IB-standaardformule, waarbij een ingevulde nul meetelt', () => {
  const d = dossier('ING');
  d.ib[2024].perOnd.ond.sfw = 0;
  const [punt] = punten(d);
  assert.deepEqual(punt, {
    key: 'sfw', label: 'Saldo fiscale winst', jaren: [2023, 2025], paneel: 'invoer',
    bind: 'ib.2023.perOnd.ond.sfw', melding: 'Neem het saldo fiscale winst over uit de laatste drie ingediende IB-aangiften.', blokkeert: true,
  });
  assert.equal(punten(d).length, 1);
});

test('De actieve NHG-route vraagt jaarcijfers en verwijst uitsluitend naar toepasselijke NHG-invoer', () => {
  const d = dossier('VENN');
  d.metNhg = true;
  d.ondernemingen[0].jaren[2025] = { bzi: { omzet: 89000, ev: 10000, bt: 25000, va: 20000 } };
  d.ib[2025].perOnd.ond.sfw = 22000;
  const r = bereken(d);
  assert.equal(r.kader, 'NHG');
  const status = rekenInvoerStatus(d, r);
  assert.ok(!status.dossier.some((p) => p.bind?.includes('VENN')));
  assert.ok(status.ondernemingen[0].punten.some((p) => p.key === 'nettowinst' && p.jaren.includes(2025)));
  assert.deepEqual(status.ondernemingen[0].punten.find((p) => p.key === 'kvv').jaren, [2025]);
  d.ondernemingen[0].jaren[2025].bzi.kvv = 0;
  assert.ok(!punten(d).some((p) => p.key === 'kvv'));
});

test('Een gerealiseerd controlebedrag zonder geldige periode verwijst naar de einddatum', () => {
  const d = dossier('NHG');
  d.berekeningsdatum = '2026-11-13';
  d.ondernemingen[0].jaren[2026] = { bzi: { nettowinst: 0 } };
  assert.deepEqual(punten(d).find((p) => p.key === 'tot')?.jaren, [2026]);
  d.ondernemingen[0].jaren[2026].tot = '2026-09-30';
  assert.ok(!punten(d).some((p) => p.key === 'tot'));
});

test('Rabobank ROW verwijst naar de open persoonlijke IB-rijen zonder een onderneming te eisen', () => {
  const d = dossier('RABO');
  d.ondernemingen = [];
  d.beleidsinvoer.RABO = { raboRoute: 'row' };
  d.ib[2024].row = 0;
  const r = bereken(d);
  const { dossier: open } = rekenInvoerStatus(d, r);
  assert.equal(open.length, 1);
  assert.equal(open[0].key, 'row');
  assert.equal(open[0].bind, 'ib.2023.row');
  assert.deepEqual(open[0].jaren, [2023, 2025]);
});

test('Een ontbrekende NHG-basis wordt niet als een nulindicatie doorgegeven aan de geldverstrekker', () => {
  for (const kader of ['NIBC', 'MERIUS', 'MUNT', 'ING']) {
    const d = dossier(kader);
    d.beleidsinvoer.ING = { ondernemersduur: 'starter' };
    const leeg = bereken(d);
    assert.equal(leeg.beleid.indicatie, null, kader);
    assert.ok(punten(d).some((p) => p.key === 'nettowinst'), kader);
  }
});

test('Venn leest voorraad en resultaat vóór belasting uit de nieuwe jaarinvoer en bewaart de bestaande terugval', () => {
  const d = dossier('VENN', 'BV');
  for (const jaar of T) {
    d.ib[jaar].perOnd.ond = { loon: 60000, dividend: 20000 };
    d.ondernemingen[0].jaren[jaar] = {
      bzi: { ev: 100000, bt: 200000, va: 120000, kvv: 60000, voorraad: 20000, nettowinst: 12000, vpb: 8000 },
    };
  }
  assert.equal(bereken(d).beleid.bedrag, 80000);
  assert.ok(bereken(d).beleid.stappen.some((s) => s.formule.includes('Quick ratio: 1,67')));
  assert.ok(!punten(d).some((p) => ['voorraad', 'resultaatVoorBelasting'].includes(p.key)));

  const bzi = d.ondernemingen[0].jaren[2025].bzi;
  delete bzi.voorraad;
  delete bzi.vpb;
  bzi.vaDetail = { voorraden: 20000 };
  d.beleidsinvoer.VENN.vpbLaatste = 8000;
  assert.equal(bereken(d).beleid.bedrag, 80000);
  assert.ok(!punten(d).some((p) => ['voorraad', 'resultaatVoorBelasting'].includes(p.key)));

  delete bzi.nettowinst;
  bzi.resultaatVoorBelasting = 20000;
  assert.equal(bereken(d).beleid.bedrag, 80000);
  delete bzi.kvv;
  assert.ok(bereken(d).beleid.checks.some((c) => c.tekst.includes('volledige balans over 2025')));
  assert.ok(!bereken(d).beleid.stappen.some((s) => s.label.includes('ratio’s 2025')));
});
