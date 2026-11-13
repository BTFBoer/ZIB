import assert from 'node:assert/strict';
import test from 'node:test';
import { EXTRA_PROFIELEN } from '../public/js/engine/policy-extra.js';

const profielen = Object.fromEntries(EXTRA_PROFIELEN.map((p) => [p.id, p]));
const ctx = { T: [2023, 2024, 2025], datum: '2026-10-01' };
const ibDossier = (reeks) => ({
  ondernemingen: [{ id: 'o', naam: 'Voorbeeld', rechtsvorm: 'EZ', startdatum: '2020-01-01', land: 'NL' }],
  ib: Object.fromEntries(ctx.T.map((jaar, i) => [jaar, { perOnd: { o: { sfw: reeks[i], bijtelling: 1000 } } }])),
});
const analyse = [{ id: 'o', jaren: { 2025: { heeftBalans: true, bal: { EV: 25_000, TA: 100_000, VA: 50_000 } } } }];
const achmea = { gelijkeActiviteiten: true, bijtellingGecontroleerd: true, balansBeoordeeld: true, sector: 'toegestaan' };

test('Attens rekent de gecorrigeerde fiscale winst en onderscheidt ontbrekend van expliciet nul', () => {
  const invoer = achmea;
  const bereken = (reeks) => profielen.ATTENS.bereken({ dossier: ibDossier(reeks), analyses: analyse, ctx, invoer });
  const regulier = bereken([60_000, 80_000, 55_000]);
  assert.equal(regulier.bedrag, 54_000);
  assert.equal(regulier.extern, false);
  assert.deepEqual(regulier.perJaar, { 2023: 59_000, 2024: 79_000, 2025: 54_000 });
  assert.equal(bereken([60_000, undefined, 55_000]).bedrag, null);
  assert.equal(bereken([60_000, 0, 55_000]).bedrag, 37_333);
});

test('Syntrus onderscheidt directe berekening, volmacht en NHG in de stukkenlijst', () => {
  const dossier = ibDossier([60_000, 80_000, 55_000]);
  const syntrus = profielen.SYNTRUS;
  const bereken = (route) => syntrus.bereken({ dossier, analyses: analyse, ctx, invoer: { ...achmea, ...route } });
  assert.equal(bereken({ kanaal: 'direct' }).bedrag, 54_000);
  assert.equal(bereken({ kanaal: 'volmacht' }).bedrag, null);
  assert.equal(bereken({ kanaal: 'direct', raadhuys: true }).bedrag, null);
  const documenten = (invoer, soort) => syntrus.documenten({ dossier: { ...dossier, soort }, ctx, invoer });
  assert.match(documenten({ kanaal: 'volmacht' })[1].wanneer, /Raadhuys/);
  assert.match(documenten({ kanaal: 'volmacht', nhg: true })[1].wanneer, /NHG/);
  assert.equal(documenten({ kanaal: 'volmacht' }, 'NUL')[1].categorie, 'beoordelingsverklaring');
});

test('Lloyds telt alleen uitgekeerd dividend mee na bevestiging van gezamenlijk volledig bezit', () => {
  const dossier = ibDossier([0, 0, 0]);
  dossier.ondernemingen[0].rechtsvorm = 'BV';
  dossier.ondernemingen[0].aandeelPct = 60;
  ctx.T.forEach((jaar, i) => { dossier.ib[jaar].perOnd.o = { loon: [50_000, 65_000, 55_000][i], dividend: 12_000 }; });
  const bereken = (bezit) => profielen.LLOYDS.bereken({ dossier, analyses: analyse, ctx,
    invoer: { gezamenlijkVolledigBelang: bezit, balansBeoordeeld: true, sector: 'toegestaan' } });
  assert.equal(bereken(false).bedrag, 55_000);
  assert.equal(bereken(true).bedrag, 67_000);
  delete dossier.ib[2023].perOnd.o.dividend;
  assert.equal(bereken(true).bedrag, null);
  assert.equal(bereken(false).bedrag, 55_000);
});

test('MUNT telt IVA terug voor de ratio en gebruikt een strikte solvabiliteitsgrens', () => {
  const dossier = ibDossier([60_000, 80_000, 55_000]);
  const j = { heeftBalans: true, EVcor: 0, TVcor: 90_000, corr: { items: [{ key: 'iva', av: -10_000, bt: -10_000 }] } };
  const nhg = { T: ctx.T, inkomen: {}, toetsinkomen: 55_000, ondernemingen: [{ id: 'o', jaren: { 2025: j } }] };
  const bereken = () => profielen.MUNT.bereken({ dossier, ctx, nhg, invoer: { sector: 'toegestaan' } });
  assert.equal(bereken().stappen[0].waarde, '10,00%');
  assert.ok(bereken().checks.some((c) => c.status === 'niet_akkoord'));
  j.EVcor = 1;
  assert.ok(!bereken().checks.some((c) => c.status === 'niet_akkoord'));
});

test('bunq gebruikt 1-2-3 en Tulp houdt de startersroute bij het gemiddelde van loon en eerste ondernemersjaar', () => {
  const dossier = ibDossier([30_000, 60_000, 90_000]);
  const bunq = profielen.BUNQ.bereken({ dossier, ctx, invoer: { gewogen: true, sector: 'toegestaan' } });
  assert.equal(bunq.bedrag, 70_000);
  dossier.ondernemingen[0].startdatum = '2025-01-01';
  dossier.ib[2023].voorStart = 48_000;
  dossier.ib[2024].voorStart = 60_000;
  dossier.ib[2025].perOnd.o.sfw = 45_000;
  const tulp = profielen.TULP.bereken({ dossier, ctx, invoer: { sector: 'toegestaan', actueelJaarinkomen: 50_000 } });
  assert.equal(tulp.bedrag, 45_000);
  assert.ok(tulp.checks.some((c) => /actuele inkomen ligt onder/.test(c.tekst)));
});

test('Dynamic telt maximaal één aantoonbaar nuljaar en sluit de NHG-route uit', () => {
  const dossier = ibDossier([0, 0, 60_000]);
  const invoer = { verhuurDoel: true, sector: 'toegestaan', actueelJaarinkomen: 70_000 };
  const bereken = (route) => profielen.DYNAMIC.bereken({ dossier, analyses: analyse, ctx, invoer: { ...invoer, ...route } });
  assert.ok(bereken().checks.some((c) => /maximaal één/.test(c.tekst)));
  dossier.ib[2024].perOnd.o.sfw = 30_000;
  assert.equal(bereken().bedrag, 30_000);
  assert.ok(!bereken().checks.some((c) => c.status === 'niet_akkoord'));
  assert.equal(bereken({ nhg: true }).bedrag, null);
});
