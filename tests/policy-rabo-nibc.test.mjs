import test from 'node:test';
import assert from 'node:assert/strict';
import { RABO_NIBC } from '../public/js/engine/policy-rabo-nibc.js';

const [rabo, nibc] = RABO_NIBC;
const T = [2023, 2024, 2025];
const ctx = { T, datum: '2026-07-15', C: null, jaarNu: 2026 };
const reeks = [50000, 70000, 100000];
const jaren = Object.fromEntries(T.map((jaar, i) => [jaar, {
  actief: true, status: 'definitief', van: `${jaar}-01-01`, tot: `${jaar}-12-31`, heeftResultaatinvoer: true,
  inkomen: { basis: reeks[i], totaal: reeks[i] - 15000 }, ibOnd: { bijtelling: 15000 },
}]));
const analyse = { id: 'zaak', naam: 'Voorbeeldzaak', rechtsvorm: 'EZ', start: '2020-01-01', soort: 'IB', meenemen: true, aandeel: 1, jaren };
const dossier = { soort: 'IKV', ondernemingen: [{ id: 'zaak', rechtsvorm: 'EZ' }] };
const nhg = { T, C: null, toetsinkomen: 58333, status: 'akkoord', ondernemingen: [analyse], inkomen: { perJaar: Object.fromEntries(T.map((jaar, i) => [jaar, reeks[i] - 15000])) } };

test('Rabobank toont IB-indicatie met drie volledige jaren en gebruikt een IKV voor het formele bedrag', () => {
  const resultaat = rabo.bereken({ dossier, analyses: [analyse], ctx, nhg, invoer: {} });
  assert.equal(resultaat.bedrag, 58333);
  assert.equal(resultaat.extern, true);
  const starter = { ...analyse, jaren: { ...jaren, 2023: { ...jaren[2023], van: '2023-04-01' } } };
  assert.equal(rabo.bereken({ dossier, analyses: [starter], ctx, nhg, invoer: {} }).bedrag, null);
});

test('Rabobank t/m 25% telt werkgeversverklaring en laagste aangetoonde bruto dividend op', () => {
  const aandeelhouder = { ...analyse, soort: 'VPB', aandeel: 0.2 };
  const eigenDossier = {
    ...dossier,
    ib: Object.fromEntries(T.map((jaar, i) => [jaar, { perOnd: { zaak: { dividend: [18000, 12000, 15000][i] } } }])),
  };
  const invoer = { raboRoute: 'minderheid', raboBelangSamen: 25, raboWerkgeversverklaring: 46000, raboDividend: true, raboZelfdeWerkgever: true };
  const testRoute = (overig) => rabo.bereken({ dossier: eigenDossier, analyses: [aandeelhouder], ctx, invoer: { ...invoer, ...overig } });
  assert.equal(testRoute({}).bedrag, 58000);
  assert.equal(testRoute({}).extern, false);
  assert.equal(testRoute({ raboBelangSamen: 25.01 }).extern, true);
  assert.equal(testRoute({ raboZelfdeWerkgever: false }).bedrag, null);
  assert.equal(testRoute({ raboDividend: false }).bedrag, 46000);
});

test('Rabobank ROW telt een verlies mee en begrenst op het laatste kalenderjaar', () => {
  const invoer = { raboRoute: 'row' };
  const berekenRow = (row) => {
    const ib = Object.fromEntries(T.map((jaar, i) => [jaar, { row: row[i] }]));
    return rabo.bereken({ dossier: { soort: 'IKV', ib }, analyses: [], ctx, invoer });
  };
  assert.equal(berekenRow([-10000, 60000, 40000]).bedrag, 30000);
  assert.equal(berekenRow([40000, 60000, 10000]).bedrag, 10000);
  assert.equal(berekenRow([0, 60000, 10000]).bedrag, 10000);
  assert.equal(berekenRow([undefined, 60000, 10000]).bedrag, null);
});

test('NIBC reproduceert de twee officiële voorbeelden voor 1-2-3 en aangepaste autobijtelling', () => {
  const uit = (nibcMethode, refs = nhg, overig = {}) => nibc.bereken({
    dossier, analyses: [analyse], ctx, nhg: refs, invoer: { nibcMethode, ...overig },
  });
  const gewogen = uit('gewogen');
  assert.equal(gewogen.bedrag, 66667);
  assert.equal(gewogen.extern, true);
  assert.equal(uit('bijtelling').bedrag, 69333);
  assert.deepEqual(uit('bijtelling').perJaar, { 2023: 42000, 2024: 66000, 2025: 100000 });
  assert.equal(uit('gewogen', nhg, { nhg: true }).bedrag, 58333);
  const begrensd = uit('gewogen', { ...nhg, toetsinkomen: 40000 });
  assert.equal(begrensd.bedrag, 48000);
  assert.ok(begrensd.checks.some(({ tekst }) => tekst.includes('meer dan 20%')));
});

test('NIBC 1-2-3 vervangt het oudste jaar niet en gebruikt het gerealiseerde YTD-plafond uit het bronvoorbeeld', () => {
  const afsluiting = [10000, 24000, 21000];
  const maakAnalyse = (ytd) => ({
    ...analyse, jaren: {
      ...Object.fromEntries(T.map((jaar, i) => [jaar, { ...jaren[jaar], inkomen: { totaal: afsluiting[i] } }])),
      2026: { heeftResultaatinvoer: true, inkomen: { totaal: ytd, extr: ytd * 2 } },
    },
  });
  const controle = (ytd) => {
    const bedrijf = maakAnalyse(ytd);
    return nibc.bereken({
      dossier: { ...dossier, instellingen: { vervangOudsteJaar: true } }, analyses: [bedrijf], ctx,
      nhg: { ...nhg, C: 2026, jaarNu: 2026, toetsinkomen: 21000, ondernemingen: [bedrijf] },
      invoer: { nibcMethode: 'gewogen' },
    });
  };
  assert.ok(controle(20000).stappen.some((s) => s.label.startsWith('Plafond op basis') && s.waarde === 21000));
  assert.ok(controle(22000).stappen.some((s) => s.label.startsWith('Plafond op basis') && s.waarde === 22000));
  assert.equal(controle(22000).bedrag, 20167);
});

test('NIBC past een startersafslag toe op de IKV zonder NHG en vereist meer dan 36 maanden voor alternatieven', () => {
  const starter = { ...analyse, start: '2024-07-15' };
  const referentie = { ...nhg, toetsinkomen: 60000, ondernemingen: [starter] };
  const uit = (invoer) => nibc.bereken({ dossier, analyses: [starter], ctx, nhg: referentie, invoer });
  assert.equal(uit({}).externFactor, 0.9);
  assert.equal(uit({}).bedrag, 54000);
  assert.equal(uit({ nhg: true }).externFactor, 1);
  assert.equal(uit({ nibcMethode: 'gewogen', nibcAanboddatum: '2027-07-15' }).bedrag, null);
});

test('NIBC-ratioafwijking levert alleen een route voor voorleggen en blokkeert vanaf twee miljoen euro', () => {
  const resultaat = nibc.bereken({
    dossier, analyses: [analyse], ctx, nhg, invoer: { nibcMethode: 'ratios', nibcHypotheekbedrag: 2000000 },
  });
  assert.ok(resultaat.checks.some(({ status, tekst }) => status === 'niet_akkoord' && tekst.includes('€ 2.000.000')));
  assert.ok(resultaat.documenten.some(({ categorie }) => categorie === 'prognose'));
});
