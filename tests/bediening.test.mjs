// Tests voor de bediening: lijsten en snelzoeken, de voortgang per tabblad, de kern van het rapport
// (aandachtspunten en de toelichting op de berekening) en het plakken in de invoerroosters. Alle cijfers zijn fictief.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bereken } from '../public/js/engine/index.js';
import { demoRecords } from '../public/js/data/demo.js';
import {
  plusDagen, deadlineKlasse, deadlineTekst, kolomFilterPast, zoekScore, zoekItems, sparkStaven, plakRooster,
} from '../public/js/lijsten.js';
import { celTekst, toelichtingRijen, kernPunten } from '../public/js/toelichting.js';
import { voortgang, voortgangTelling } from '../public/js/views/voortgang.js';
import { ui, ordeJaren, ordeJarenOverzicht, zetJaarVolgorde } from '../public/js/views/uistate.js';

const demo = (id) => {
  const d = demoRecords().find((x) => x.id === id);
  assert.ok(d, `demodossier ${id} bestaat`);
  return d;
};

// ---------------------------------------------------------------------------
// Lijsten
// ---------------------------------------------------------------------------
test('uiterste datum: verstreken is te laat, vandaag en binnen twee dagen is bijna', () => {
  assert.equal(plusDagen('2026-12-30', 3), '2027-01-02');
  assert.equal(deadlineKlasse('2026-11-10', '2026-11-11'), 'te-laat');
  assert.equal(deadlineKlasse('2026-11-11', '2026-11-11'), 'bijna');
  assert.equal(deadlineKlasse('2026-11-13', '2026-11-11'), 'bijna');
  assert.equal(deadlineKlasse('2026-11-14', '2026-11-11'), '');
  assert.equal(deadlineKlasse('', '2026-11-11'), '');
  assert.equal(deadlineTekst('2026-11-11', '2026-11-11'), 'Uiterste datum is vandaag');
  assert.equal(deadlineTekst('2026-11-01', '2026-11-11'), 'Uiterste datum is verstreken');
  assert.equal(deadlineTekst('2026-12-01', '2026-11-11'), '');
});

test('kolomfilter: tekst is een deel van de waarde, een keuze (=) moet exact overeenkomen', () => {
  const rij = { naam: 'Vries, M. de', uitkomst: 'Niet akkoord', status: '1e beoordeling' };
  assert.equal(kolomFilterPast(rij, {}), true);
  assert.equal(kolomFilterPast(rij, { naam: 'vries' }), true);
  assert.equal(kolomFilterPast(rij, { naam: 'vries', status: '2e' }), false);
  assert.equal(kolomFilterPast(rij, { uitkomst: 'akkoord' }), true, 'tekstfilter vindt "akkoord" in "Niet akkoord"');
  assert.equal(kolomFilterPast(rij, { uitkomst: '=Akkoord' }), false, 'keuzefilter Akkoord is niet Niet akkoord');
  assert.equal(kolomFilterPast(rij, { uitkomst: '=niet akkoord' }), true);
  assert.equal(kolomFilterPast(rij, { onbekend: 'x' }), false);
  assert.equal(kolomFilterPast(rij, { naam: '  ' }), true, 'een leeg filter telt niet mee');
});

test('snelzoeken: alle woorden moeten voorkomen, accenten tellen niet, de titel weegt het zwaarst', () => {
  const items = [
    { titel: 'Jansen, P.A.', zoek: 'ZIB-2026-0001 Jansen Installatietechniek 00000101' },
    { titel: 'Café Zeezicht B.V.', zoek: 'ZIB-2026-0009 Scheveningen' },
    { titel: 'Documenten', zoek: 'pagina menu' },
    { titel: 'Wit, K. de', zoek: 'ZIB-2026-0102 De Wit Beheer B.V. Jansenstraat' },
  ];
  assert.equal(zoekScore(items[0], 'jansen installatie'), 8 + 2);
  assert.equal(zoekScore(items[0], 'jansen bakker'), 0);
  assert.equal(zoekScore(items[1], 'cafe'), 8);
  assert.deepEqual(zoekItems(items, 'jansen').map((x) => x.titel), ['Jansen, P.A.', 'Wit, K. de'], 'treffer in de titel staat voor een treffer in de zoektekst');
  assert.deepEqual(zoekItems(items, '0009').map((x) => x.titel), ['Café Zeezicht B.V.']);
  assert.equal(zoekItems(items, '').length, 4, 'zonder vraag komt alles terug');
  assert.equal(zoekItems(items, 'e', 2).length, 2, 'maximum aantal treffers');
});

test('trendstaafjes: één schaal vanaf nul, negatief onder de nullijn, ontbrekend jaar blijft leeg', () => {
  const { staven, nul, hoogte } = sparkStaven([100, 50, null, -50], { breedte: 45, hoogte: 30, tussenruimte: 3 });
  assert.equal(staven.length, 4);
  assert.equal(nul, 20, 'nullijn op twee derde: het bereik loopt van -50 tot 100');
  assert.equal(staven[0].h, 20);
  assert.equal(staven[0].y, 0);
  assert.equal(staven[1].h, 10);
  assert.equal(staven[2].leeg, true);
  assert.equal(staven[3].negatief, true);
  assert.equal(staven[3].y, nul);
  assert.equal(staven[3].y + staven[3].h, hoogte);
  assert.equal(staven[1].x, staven[0].b + 3);
  const klein = sparkStaven([1000000, 1], { hoogte: 20 });
  assert.equal(klein.staven[1].h, 1, 'een waarde ongelijk aan nul blijft zichtbaar');
  assert.equal(sparkStaven([0, 0]).staven.every((s) => s.h === 0), true);
});

test('plakken: regels worden rijen en tabs kolommen; één losse waarde wordt gewoon geplakt', () => {
  assert.equal(plakRooster('12.500'), null);
  assert.equal(plakRooster(''), null);
  assert.equal(plakRooster('12.500\n'), null, 'alleen een regeleinde aan het eind is nog steeds één waarde');
  assert.deepEqual(plakRooster('1.000\r\n2.000\r\n'), [['1.000'], ['2.000']]);
  assert.deepEqual(plakRooster('1\t2\n\t4\n'), [['1', '2'], ['', '4']]);
  assert.deepEqual(plakRooster(' € 1.250,50 \t(300)'), [['€ 1.250,50', '(300)']]);
});

// ---------------------------------------------------------------------------
// Volgorde van de jaren
// ---------------------------------------------------------------------------
test('jaarvolgorde: de invoer loopt van nieuw naar oud, overzichten altijd van oud naar nieuw', () => {
  assert.equal(ui.jaarVolgorde, 'recent', 'standaard staat het meest recente jaar links in de invoer');
  assert.deepEqual(ordeJaren([2023, 2024, 2025, 2026]), [2026, 2025, 2024, 2023]);
  assert.deepEqual(ordeJarenOverzicht([2026, 2023, 2025, 2024]), [2023, 2024, 2025, 2026]);
  assert.deepEqual(ordeJarenOverzicht(['2025', 'waarde', '2023']), [2023, 2025, 'waarde'], 'kolommen die geen jaar zijn blijven achteraan');
  assert.deepEqual(ordeJaren(['berekend', 'woonbeleid', 'afgegeven']), ['berekend', 'woonbeleid', 'afgegeven']);
  assert.equal(ui.aanvragen.sort.richting, 'desc', 'de klantenlijst begint bij het nieuwste dossier');
  assert.equal(ui.aanvragen.sortAfgerond.richting, 'desc');
  // De instelling in Mijn gegevens keert alleen de invoer om.
  zetJaarVolgorde('oud');
  try {
    assert.deepEqual(ordeJaren([2023, 2024, 2025, 2026]), [2023, 2024, 2025, 2026]);
    assert.deepEqual(ordeJarenOverzicht([2026, 2025, 2024, 2023]), [2023, 2024, 2025, 2026]);
  } finally {
    zetJaarVolgorde('recent');
  }
  assert.deepEqual(ordeJaren([2023, 2024, 2025]), [2025, 2024, 2023]);
});

// ---------------------------------------------------------------------------
// Voortgang per tabblad
// ---------------------------------------------------------------------------
test('voortgang: een volledig ingevoerd dossier is compleet op invoer; documenten en fiattering staan nog open', () => {
  const d = demo('dos_demo_jansen');
  const v = voortgang(d, bereken(d), []);
  assert.equal(v.klant.status, 'ok');
  assert.equal(v.balans.status, 'ok');
  assert.equal(v.vw.status, 'ok');
  assert.equal(v.ib.status, 'ok');
  assert.equal(v.berekening.status, 'ok');
  assert.equal(v.documenten.status, 'open', 'zonder geüploade stukken ontbreken alle verplichte documenten');
  assert.ok(v.documenten.teller > 0);
  assert.equal(v.fiat.status, 'open');
  const { klaar, totaal } = voortgangTelling(v);
  assert.equal(totaal, 6);
  assert.equal(klaar, 4 + (v.notities.status === 'ok' ? 1 : 0));
});

test('voortgang: een balans die niet sluit is een fout, een leeg dossier staat open', () => {
  const d = structuredClone(demo('dos_demo_jansen'));
  const jaar = bereken(d).T[2];
  d.ondernemingen[0].jaren[jaar].balans.liquideMiddelen = (d.ondernemingen[0].jaren[jaar].balans.liquideMiddelen || 0) + 5000;
  const v = voortgang(d, bereken(d), []);
  assert.equal(v.balans.status, 'fout');
  assert.match(v.balans.tekst, new RegExp(`sluiten niet.*${jaar}`));

  const leeg = { id: 'x', soort: 'IKV', kader: 'NHG', berekeningsdatum: '2026-09-15', aanvrager: {}, ondernemingen: [{ id: 'o1', naam: 'Nieuw', rechtsvorm: 'EZ', jaren: {} }], ib: {} };
  const w = voortgang(leeg, bereken(leeg), []);
  assert.equal(w.klant.status, 'aandacht');
  assert.match(w.klant.tekst, /achternaam/);
  assert.match(w.klant.tekst, /startdatum Nieuw/);
  assert.equal(w.balans.status, 'open');
  assert.equal(w.vw.status, 'open');
  assert.equal(w.ib.status, 'open');
  assert.equal(w.notities.status, 'open');
  assert.equal(voortgangTelling(w).klaar, 0);
});

test('voortgang: bij een 0-verklaring telt de IB-aangifte niet mee; fiattering volgt de beoordelingen', () => {
  const d = structuredClone(demo('dos_demo_bakker'));
  const v = voortgang(d, bereken(d), []);
  assert.equal(v.ib, null);
  assert.equal(voortgangTelling(v).totaal, 5);
  d.fiat = { eerste: { naam: 'A', datum: '2026-09-15T10:00:00Z' } };
  assert.equal(voortgang(d, bereken(d), []).fiat.status, 'aandacht');
  d.fiat.tweede = { resultaat: 'akkoord', naam: 'B' };
  assert.equal(voortgang(d, bereken(d), []).fiat.status, 'ok');
  d.fiat.tweede.resultaat = 'niet_akkoord';
  assert.equal(voortgang(d, bereken(d), []).fiat.status, 'fout');
});

// ---------------------------------------------------------------------------
// Kern van het rapport
// ---------------------------------------------------------------------------
test('aandachtspunten: zwaarste eerst, met voorwaarden, meldingen en bijstellingen uit de rekenkern', () => {
  const d = demo('dos_demo_renewi');
  const r = bereken(d);
  const punten = kernPunten(d, r);
  const niveaus = punten.map((p) => p.status);
  assert.deepEqual(niveaus, [...niveaus].sort((a, b) => ['niet_akkoord', 'attentie', 'info'].indexOf(a) - ['niet_akkoord', 'attentie', 'info'].indexOf(b)));
  assert.equal(punten[0].status, 'niet_akkoord');
  const nietAkkoord = r.ondernemingen.flatMap((a) => a.checks.filter((c) => c.status === 'niet_akkoord'));
  assert.ok(nietAkkoord.length >= 3);
  nietAkkoord.forEach((c) => assert.ok(punten.some((p) => p.status === 'niet_akkoord' && p.tekst.includes(c.label)), `voorwaarde "${c.label}" staat bij de aandachtspunten`));
  r.meldingen.forEach((m) => assert.ok(punten.some((p) => p.tekst === m.tekst), 'elke melding staat bij de aandachtspunten'));

  const schoon = demo('dos_demo_visser');
  assert.deepEqual(kernPunten(schoon, bereken(schoon)), [], 'een dossier zonder aandachtspunten geeft een lege lijst');

  const jansen = demo('dos_demo_jansen');
  const rj = bereken(jansen);
  assert.deepEqual(kernPunten(jansen, rj), rj.inkomen.stappen.map((tekst) => ({ status: 'info', tekst })));
});

test('aandachtspunten bij een 0-verklaring komen uit de beoordeling van de 0-verklaring', () => {
  const d = demo('dos_demo_bakker');
  const r = bereken(d);
  const verwacht = r.nul.perOnderneming.flatMap((o) => o.checks.filter((c) => c.status !== 'akkoord')).length
    + r.nul.zekerheden.filter((c) => c.status !== 'akkoord').length + r.meldingen.length;
  assert.equal(kernPunten(d, r).length, verwacht);
});

test('toelichting: de stappen van de totaalberekening als omschrijving, berekening en uitkomst', () => {
  const d = demo('dos_demo_jansen');
  const r = bereken(d);
  const sectie = r.trace.secties.find((s) => s.groep === 'inkomen');
  const rijen = toelichtingRijen(sectie);
  const perJaar = rijen.find((x) => x.label.startsWith('Totaal box 1 inkomen per jaar'));
  assert.equal(perJaar.soort, 'reeks');
  assert.equal(perJaar.formule, '2023: 87.100 · 2024: 93.850 · 2025: 96.700 · 2026: 46.820 (gerealiseerd)');
  assert.equal(perJaar.uitkomst, '');
  const gemiddeld = rijen.find((x) => x.label.startsWith('Gemiddeld box 1 inkomen'));
  assert.deepEqual({ soort: gemiddeld.soort, formule: gemiddeld.formule, uitkomst: gemiddeld.uitkomst }, { soort: 'stap', formule: '(87.100 + 93.850 + 96.700) / 3 =', uitkomst: '€ 92.550' });
  const totaal = rijen[rijen.length - 1];
  assert.equal(totaal.stijl, 'totaal');
  assert.equal(totaal.uitkomst, `€ ${new Intl.NumberFormat('nl-NL').format(r.berekend)}`, 'de laatste regel is het berekende inkomen');
});

test('toelichting: benoemde kolommen (berekend, toets, af te geven) worden een tussenkop met een stap per kolom', () => {
  const d = demo('dos_demo_devries');
  const r = bereken(d);
  const sectie = r.trace.secties.find((s) => s.groep === 'inkomen');
  const rijen = toelichtingRijen(sectie);
  assert.equal(rijen[0].soort, 'groep');
  assert.match(rijen[0].label, /De Vries Advies/);
  assert.deepEqual(rijen.slice(1, 4).map((x) => [x.soort, x.label, x.sub]), [
    ['stap', 'Berekend inkomen (gemiddelde)', true], ['stap', 'Toets Woonbeleid', true], ['stap', 'Af te geven', true],
  ]);
  assert.equal(rijen[3].uitkomst, `€ ${new Intl.NumberFormat('nl-NL').format(r.vastgesteld)}`);
});

test('toelichting: opmaak van cellen en regels zonder bedragen', () => {
  assert.equal(celTekst({ w: 0.2522, opmaak: 'pct' }), '25,22%');
  assert.equal(celTekst({ w: 1.5, opmaak: 'ratio' }), '1,50');
  assert.equal(celTekst({ w: 54708, opmaak: 'eur' }), '€ 54.708');
  assert.equal(celTekst({ w: 54708 }), '54.708');
  assert.equal(celTekst({ w: null, opmaak: 'eur' }), '');
  assert.equal(celTekst(undefined), '');
  const rijen = toelichtingRijen({
    kolommen: ['waarde'],
    rijen: [{ kop: true, label: 'Kop' }, { label: 'Toelichting', tekst: 'vrije tekst' }, { label: 'Leeg', cellen: {} }, { label: 'Datum', cellen: { waarde: { w: '15-09-2026', opmaak: 'tekst' } } }],
  });
  assert.deepEqual(rijen.map((x) => x.soort), ['groep', 'tekst', 'stap']);
  assert.equal(rijen[1].formule, 'vrije tekst');
  assert.equal(rijen[2].uitkomst, '15-09-2026');
  assert.deepEqual(toelichtingRijen(undefined), []);
});
