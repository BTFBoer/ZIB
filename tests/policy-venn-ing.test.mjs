import test from 'node:test';
import assert from 'node:assert/strict';
import { VENN_ING } from '../public/js/engine/policy-venn-ing.js';

const [venn, ing] = VENN_ING;
const T = [2023, 2024, 2025];

function proef({ soort = 'IB', inkomen = [50000, 65000, 80000], datum = '2026-06-30', invoer = {} } = {}) {
  const id = 'ond';
  const rechtsvorm = soort === 'IB' ? 'EZ' : 'BV';
  const start = '2022-01-01';
  const onderneming = { id, naam: 'Fictieve onderneming', rechtsvorm, startdatum: start, land: 'NL', belastingplichtig: 'NL' };
  const jaren = Object.fromEntries(T.map((y, i) => [y, {
    van: `${y}-01-01`, tot: `${y}-12-31`, status: 'definitief', meegeteld: true, heeftBalans: true, heeftResultaatinvoer: true,
    TVcor: 200000, EVcor: 100000, VAcor: 120000, KVVcor: 60000, bal: { VOORRADEN: 20000 }, aandeel: 1,
    inkomen: { neg: [] }, winst: { neg: [], RVBcor: 100000 },
    ibOnd: soort === 'IB' ? { sfw: inkomen[i] } : { loon: inkomen[i], dividend: 20000 },
  }]));
  const analyses = [{ id, naam: onderneming.naam, soort, rechtsvorm, aandeel: 1, start, jaren }];
  return { dossier: { datumAanvraag: datum, ondernemingen: [onderneming] }, analyses, ctx: { T, datum, jaarNu: 2026 }, invoer: {
    faillissement: 'nee', sector: 'toegestaan', verhuurInOnderneming: 'nee', ...invoer,
  } };
}

test('Venn weegt 1-2-3 en houdt de controles per jaar gescheiden', () => {
  const fixture = proef();
  assert.equal(venn.bereken(fixture).bedrag, 70000);
  fixture.analyses[0].jaren[2024].bal.VOORRADEN = 73000;
  const onderNorm = venn.bereken(fixture);
  assert.equal(onderNorm.bedrag, null);
  assert.ok(onderNorm.checks.some((m) => m.status === 'niet_akkoord' && m.tekst.includes('2024')));
  assert.ok(onderNorm.stappen.some((s) => s.formule.includes('Quick ratio: 0,78')));
});

test('Venn controleert precies 10% dubbele daling en een nieuwe onderneming', () => {
  const fixture = proef({ inkomen: [100000, 90000, 81000] });
  assert.match(venn.bereken(fixture).checks.find((m) => m.status === 'niet_akkoord').tekst, /inkomensdaling/);
  const starter = proef();
  starter.dossier.ondernemingen[0].startdatum = '2023-07-01';
  assert.match(venn.bereken(starter).checks.find((m) => m.status === 'niet_akkoord').tekst, /korter dan 36 maanden/);
  const dalingLaatsteJaar = proef({ inkomen: [90000, 100000, 85000] });
  assert.match(venn.bereken(dalingLaatsteJaar).checks.find((m) => m.status === 'niet_akkoord').tekst, /inkomensdaling/);
  const kleineEersteDaling = proef({ inkomen: [101000, 100000, 85000] });
  assert.match(venn.bereken(kleineEersteDaling).checks.find((m) => m.status === 'attentie').tekst, /kleinere daling/);
});

test('Venn onderscheidt historisch overwinstpercentage van de huidige dubbele balanstoets', () => {
  const fixture = proef({ soort: 'VPB', inkomen: [60000, 60000, 60000], invoer: { overwinst: true } });
  // Drie maal €100.000 winst voor belasting, na €20.000 dividend. De huidige
  // liquiditeitsruimte is €60.000. Daarvan telt €45.000 mee na de afslag.
  const huidig = venn.bereken(fixture);
  assert.equal(huidig.bedrag, 125000);
  assert.equal(huidig.box2, 65000);
  const historisch = venn.bereken({ ...fixture, invoer: { ...fixture.invoer, bronVersie: '2025-10' } });
  assert.equal(historisch.bedrag, 120000);
  assert.match(historisch.versie, /Oktober 2025/);
  fixture.analyses[0].jaren[2025].aggVW = true;
  const zonderVpb = venn.bereken(fixture);
  assert.equal(zonderVpb.bedrag, 60000);
  assert.match(zonderVpb.checks.find((m) => m.tekst.includes('vennootschapsbelasting')).tekst, /vóór belasting/);
});

test('Venn gebruikt gerealiseerde tussentijdse winst bij de optionele augustusvariant', () => {
  const fixture = proef({ datum: '2026-08-01', invoer: { tussentijdsVervangen: true } });
  fixture.ctx.C = 2026;
  fixture.analyses[0].jaren[2026] = { heeftBalans: true, heeftResultaatinvoer: true, aandeel: 1, factor: 2, winst: { RVBcor: 50000 } };
  const uitkomst = venn.bereken(fixture);
  assert.equal(uitkomst.bedrag, 50000);
  assert.equal(uitkomst.stappen.find((s) => s.label === 'Vervanging op verzoek').waarde, 50000);
  assert.deepEqual(uitkomst.vervanging, { toegepast: true, reden: '' });
  fixture.ctx.C = null;
  const zonderControlejaar = venn.bereken(fixture);
  assert.equal(zonderControlejaar.bedrag, 70000);
  assert.equal(zonderControlejaar.vervanging.toegepast, false);
  assert.equal(zonderControlejaar.stappen.some((s) => s.label === 'Vervanging op verzoek'), false);
});

test('ING behandelt nul in een ingediende IB-aangifte als werkelijk resultaat en ontbrekend saldo als open', () => {
  const fixture = proef({ inkomen: [0, 60000, 60000] });
  assert.equal(ing.bereken(fixture).bedrag, 40000);
  assert.deepEqual(ing.bereken(fixture).perJaar, { 2023: 0, 2024: 60000, 2025: 60000 });
  delete fixture.analyses[0].jaren[2023].ibOnd.sfw;
  assert.equal(ing.bereken(fixture).bedrag, null);
});

test('ING stuurt starters naar NHG en telt DGA-winst alleen met onderbouwing mee', () => {
  const starter = proef({ invoer: { ondernemersduur: 'starter' } });
  const volgensNhg = ing.bereken({ ...starter, nhg: { toetsinkomen: 46000, status: 'akkoord' } });
  assert.equal(volgensNhg.bedrag, 46000);
  assert.equal(volgensNhg.methode, 'nhg');
  const dga = proef({ soort: 'VPB', invoer: { arbeidsinkomenDga: 80000, uitkeerbareWinst: 10000, bestendigheidBevestigd: true } });
  assert.equal(ing.bereken(dga).bedrag, 80000);
  dga.invoer.onderbouwing = 'Fictieve vrije kasstroom en uitkeringsruimte beoordeeld.';
  assert.equal(ing.bereken(dga).bedrag, 90000);
});

test('ING houdt rekening-courant als last apart en past de 3%-ondergrens toe', () => {
  const fixture = proef({ soort: 'VPB', inkomen: [60000, 60000, 60000], invoer: { rcJaarlast: 600 } });
  fixture.dossier.rc = { saldo: 20000, limiet: 40000 };
  const normaal = ing.bereken(fixture);
  assert.equal(normaal.bedrag, 60000);
  assert.equal(normaal.rc.maandlast, 100);
  fixture.invoer.rcAflossingAangetoond = true;
  fixture.invoer.rcOnderbouwing = 'Fictieve vrije middelen na verstrekking gecontroleerd.';
  assert.equal(ing.bereken(fixture).rc.maandlast, 50);
  fixture.dossier.rc.saldo = 17499;
  assert.equal(ing.bereken(fixture).rc.maandlast, 0);
});
