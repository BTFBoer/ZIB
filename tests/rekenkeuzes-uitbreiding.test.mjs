import test from 'node:test';
import assert from 'node:assert/strict';
import { bereken, uitkomstenPerRekenwijze, vergelijkKaders } from '../public/js/engine/index.js';
import { effectieveRekenwijze, rekenwijzenVoor } from '../public/js/engine/rekenwijze.js';
import { toegestaneInkomensBesluiten } from '../public/js/engine/beoordelingsrechten.js';
import { beleidsvoorbeeldVoor } from '../public/js/data/demo.js';

const jaren = [2023, 2024, 2025];
const perJaar = (fn) => Object.fromEntries(jaren.map((y, i) => [y, fn(i)]));

function groep(surplus) {
  return {
    type: 'dossier', soort: 'IKV', kader: 'NHG', metNhg: true, berekeningsdatum: '2026-09-15',
    instellingen: { controlejaar: false, surplusWerkkapitaal: surplus },
    ondernemingen: [
      { id: 'h', naam: 'Holding', rechtsvorm: 'BV', aandeelPct: 100, startdatum: '2015-01-01', land: 'NL',
        jaren: perJaar(() => ({ status: 'definitief', bzi: { omzet: 0, nettowinst: 5000, ev: 60000, bt: 100000, va: 10000, kvv: 40000 } })) },
      { id: 'w', naam: 'Werk', rechtsvorm: 'BV', parentId: 'h', aandeelPct: 80, startdatum: '2015-01-01', land: 'NL',
        jaren: perJaar(() => ({ status: 'definitief', bzi: { omzet: 500000, nettowinst: 60000, ev: 300000, bt: 400000, va: 200000, kvv: 50000 } })) },
    ],
    ib: perJaar(() => ({ perOnd: { h: { loon: 60000 } } })),
  };
}

test('Rekenwijzen: alleen aangeboden wegingen krijgen een bedrag, de gekozen weging wordt toegepast', () => {
  assert.deepEqual(rekenwijzenVoor('NHG').aangeboden, ['111']);
  assert.deepEqual(rekenwijzenVoor('KNAB').aangeboden, ['123', '134']);
  assert.deepEqual(rekenwijzenVoor('VENN').aangeboden, ['123']);

  const analyse = vergelijkKaders(beleidsvoorbeeldVoor('ANALYSE'));
  const per = (id) => Object.fromEntries(analyse.find((x) => x.id === id).perRekenwijze.rijen.map((r) => [r.id, r]));
  assert.equal(per('NHG')['123'].aangeboden, false, 'NHG biedt geen 1-2-3');
  assert.equal(per('NHG')['123'].bedrag, null);
  assert.ok(per('NHG')['111'].bedrag > 0);
  assert.equal(per('VENN')['111'].aangeboden, false, 'Venn weegt alleen 1-2-3');
  assert.ok(per('KNAB')['123'].bedrag > 0 && per('KNAB')['134'].bedrag > 0);
  for (const x of analyse) assert.equal(x.perRekenwijze.rijen.filter((r) => r.toegepast).length, 1, x.id);

  // Knab: de keuze bij de rekenkeuzes zet de weging van het kader.
  const knab = { ...beleidsvoorbeeldVoor('VENN'), kader: 'KNAB' };
  assert.equal(bereken(knab).kaderCfg.methode123.gewichten.join('-'), '1-3-4');
  knab.instellingen = { ...knab.instellingen, rekenwijze: '123' };
  assert.equal(bereken(knab).kaderCfg.methode123.gewichten.join('-'), '1-2-3');
  assert.equal(effectieveRekenwijze('KNAB', knab.instellingen), '123');
  // Een niet aangeboden keuze wordt genegeerd.
  knab.instellingen.rekenwijze = '111';
  assert.equal(bereken(knab).kaderCfg.methode123.gewichten.join('-'), '1-3-4');

  // NIBC: 1-2-3 als rekenwijze stuurt de gewogen route van het profiel.
  const nibc = beleidsvoorbeeldVoor('NIBC');
  nibc.instellingen = { ...nibc.instellingen, rekenwijze: '123' };
  const r = bereken(nibc);
  assert.ok(r.beleid.stappen.some((s) => /1-2-3/.test(`${s.label} ${s.formule}`)));
  assert.equal(uitkomstenPerRekenwijze(nibc, r).toegepast, '123');
});

test('Incidentele lasten tellen onder NHG alleen mee als ze uitdrukkelijk fiscaal van aard zijn', () => {
  const dossier = (vlag) => ({ type: 'dossier', soort: 'IKV', kader: 'NHG', metNhg: true, berekeningsdatum: '2026-09-15', instellingen: { controlejaar: false },
    ondernemingen: [{ id: 'e', naam: 'EZ', rechtsvorm: 'EZ', startdatum: '2015-01-01', land: 'NL',
      jaren: perJaar(() => ({ status: 'definitief', bzi: { omzet: 100000, nettowinst: 40000, ev: 50000, bt: 80000, va: 40000, kvv: 20000 },
        div: { incidenteleLasten: 10000, ...(vlag === undefined ? {} : { incidenteleLastenFiscaal: vlag }) } })) }],
    ib: perJaar(() => ({ perOnd: { e: { sfw: 40000 } } })) });
  assert.equal(bereken(dossier(undefined)).toetsinkomen, 40000, 'standaard uit');
  assert.equal(bereken(dossier(false)).toetsinkomen, 40000);
  assert.equal(bereken(dossier(true)).toetsinkomen, 50000);
});

test('Surplus werkkapitaal uit een meerderheidsbelang vult het tekort van de holding aan naar rato van het belang', () => {
  const zonder = bereken(groep(false));
  const met = bereken(groep(true));
  const holding = (r) => r.ondernemingen.find((a) => a.id === 'h');
  assert.equal(holding(zonder).checks.find((c) => c.key === 'liquiditeit').status, 'niet_akkoord');
  assert.equal(holding(met).checks.find((c) => c.key === 'liquiditeit').status, 'akkoord');
  const inzet = met.surplusWerkkapitaal.overdrachten.find((x) => x.jaar === 2025);
  assert.deepEqual({ van: inzet.van, naar: inzet.naar, ontvangen: inzet.ontvangen, ingezet: inzet.ingezet }, { van: 'w', naar: 'h', ontvangen: 30000, ingezet: 37500 });
  // De gevende vennootschap blijft aan de normen voldoen.
  const werk = met.ondernemingen.find((a) => a.id === 'w');
  assert.ok(werk.jaren[2025].CR >= 1);
  assert.ok(met.meldingen.some((m) => /surplus werkkapitaal van Werk ingezet bij Holding/.test(m.tekst)));
  // Een handmatig ingevuld bedrag gaat voor.
  const hand = groep(true);
  hand.ondernemingen[0].jaren[2025].div = { surplusOntvangen: 5000 };
  assert.ok(!bereken(hand).surplusWerkkapitaal.overdrachten.some((x) => x.jaar === 2025 && x.naar === 'h'));
});

test('Per onderneming kan ook bij NHG het inkomen worden overruled of op € 0 worden gezet', () => {
  const d = groep(false);
  assert.deepEqual(toegestaneInkomensBesluiten(d, d.ondernemingen[0]), ['berekend', 'afwijkend', 'nul']);
  const basis = bereken(d);
  d.ondernemingen[0].afwijkend = { actief: true, bedrag: 45000, motivatie: 'Bestendig loon volgens nieuwe arbeidsovereenkomst' };
  const r = bereken(d);
  assert.notEqual(r.toetsinkomen, basis.toetsinkomen);
  assert.equal(r.toetsinkomen, 45000);
  assert.ok(r.meldingen.some((m) => /handmatig vastgesteld jaarinkomen van 45\.000/.test(m.tekst)));
});
