import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIAT_VRAGEN, actorVoor, fiatBlokkade, inkomensWijzigingPad, inkomensMotivatiesOntbreken,
  pasInkomensWijzigingToe, wijzigingsBlokkade, wisInkomensWijzigingen,
} from '../public/js/engine/beoordelingsrechten.js';
import { beveiligDossier, beveiligProfiel, cloudActor, maakImportHerbeoordeling, profielRecordId } from '../functions/_shared/fiat.js';
import { renderFiatBeoordeling } from '../public/js/views/fiatbeoordeling.js';

const env = { ZIB_ACCREDITATIES: JSON.stringify({ 'eerste@example.org': 'Medium', 'tweede@example.org': 'Top+' }) };
const eerste = cloudActor({ email: 'eerste@example.org', naam: 'Eerste beoordelaar' }, env);
const tweede = cloudActor({ email: 'tweede@example.org', naam: 'Tweede beoordelaar' }, env);
const onbevoegd = cloudActor({ email: 'advies@example.org', naam: 'Adviseur' }, env);
const opties = { nu: '2026-11-13T13:00:00.000Z' };
const dossier = () => ({ id: 'dos_test', type: 'dossier', status: 'beoordeling_1', niveau: 'Medium', soort: 'IKV', kader: 'ABN',
  ondernemingen: [{ id: 'bedrijf', naam: 'Onderneming', meenemen: true }] });
const alleAntwoorden = () => Object.fromEntries(FIAT_VRAGEN.map(([k]) => [k, { antwoord: 'Ja' }]));

test('cloudprofiel kan zijn geverifieerde accreditatie niet verhogen', () => {
  const profiel = { email: 'tweede@example.org', accreditatie: 'Top+', rol: 'beheer' };
  assert.equal(actorVoor(profiel, onbevoegd).accreditatie, '');
  assert.equal(beveiligProfiel(onbevoegd, profielRecordId(tweede.email), profiel).status, 403);
  assert.equal(beveiligProfiel(onbevoegd, profielRecordId(onbevoegd.email), profiel), null);
  assert.deepEqual(profiel, { email: onbevoegd.email, accreditatie: '', rol: 'acceptant' });
  assert.equal(cloudActor({ email: eerste.email.toUpperCase() }, env).accreditatie, 'Medium');
});

test('handmatige nul, afwijking en terugkeer zijn één gemotiveerd besluit', () => {
  const d = dossier();
  const o = d.ondernemingen[0];
  const begin = structuredClone(d);
  assert.match(pasInkomensWijzigingToe(d, onbevoegd, { ondId: o.id, soort: 'nul', motivatie: 'Geen eigen inkomen' }).fout, /accreditatie/);
  assert.match(pasInkomensWijzigingToe(d, eerste, { ondId: o.id, soort: 'nul', motivatie: ' ' }).fout, /motivatie/);
  assert.match(pasInkomensWijzigingToe(d, eerste, { ondId: o.id, soort: 'afwijkend', bedrag: '', motivatie: 'Bron' }).fout, /geldig bedrag/);
  assert.deepEqual(d, begin);
  assert.equal(pasInkomensWijzigingToe(d, eerste, { ondId: o.id, soort: 'afwijkend', bedrag: 0, motivatie: 'Besluit' }).gewijzigd, true);
  assert.equal(o.afwijkend.bedrag, 0);
  assert.deepEqual(inkomensMotivatiesOntbreken(d), []);
  d.fiat = { eerste: { naam: 'A' }, tweede: { resultaat: 'niet_akkoord' } };
  assert.equal(pasInkomensWijzigingToe(d, eerste, { ondId: o.id, soort: 'nul', motivatie: 'Risico beoordelen' }).gewijzigd, true);
  assert.deepEqual(d.fiat, {});
  assert.equal(o.nulInkomen, true);
  assert.equal(pasInkomensWijzigingToe(d, eerste, { ondId: o.id, soort: 'berekend', motivatie: 'Cijfers gecontroleerd' }).gewijzigd, true);
  assert.equal(o.nulInkomen, undefined);
  assert.equal(o.inkomensbesluit.soort, 'berekend');
});

test('cloud beschermt ook de oude uitsluiting via meenemen en vereist bronmotivatie', () => {
  const oud = dossier();
  const gewijzigd = structuredClone(oud);
  assert.equal(inkomensWijzigingPad('ond:bedrijf.meenemen'), true);
  assert.equal(inkomensWijzigingPad('loondienst.meenemen'), false);
  gewijzigd.ondernemingen[0].meenemen = false;
  assert.equal(beveiligDossier(onbevoegd, oud, gewijzigd).status, 403);
  assert.equal(beveiligDossier(eerste, oud, gewijzigd).status, 422);
  assert.equal(beveiligDossier(onbevoegd, gewijzigd, structuredClone(gewijzigd)), null);
  assert.equal(pasInkomensWijzigingToe(gewijzigd, eerste, { ondId: 'bedrijf', soort: 'berekend', motivatie: 'Omzet opnieuw vastgesteld' }).gewijzigd, true);
  assert.equal(gewijzigd.ondernemingen[0].meenemen, true);
});

test('cloud signeert eerste en tweede beslissing met geverifieerde identiteit', () => {
  const oud = dossier();
  const aangeboden = structuredClone(oud);
  pasInkomensWijzigingToe(aangeboden, eerste, { ondId: 'bedrijf', soort: 'afwijkend', bedrag: 50000, motivatie: 'Onderbouwde correctie' });
  aangeboden.status = 'beoordeling_2';
  aangeboden.fiat = { eerste: { naam: 'Ander', email: tweede.email, datum: '1900-01-01' } };
  assert.equal(beveiligDossier(onbevoegd, oud, aangeboden, opties).status, 403);
  assert.equal(beveiligDossier(eerste, oud, aangeboden, opties), null);
  assert.deepEqual(aangeboden.fiat.eerste, { naam: eerste.naam, email: eerste.email, datum: opties.nu });
  assert.match(fiatBlokkade({ ...tweede, email: eerste.email }, aangeboden, 2), /andere bevoegde/);
  assert.match(wijzigingsBlokkade(tweede, aangeboden), /al aangeboden/);

  const akkoord = structuredClone(aangeboden);
  akkoord.status = 'afgerond';
  akkoord.fiat.tweede = { naam: 'Ander', datum: '1900-01-01', resultaat: 'akkoord', antwoorden: alleAntwoorden() };
  assert.equal(beveiligDossier(tweede, aangeboden, { ...akkoord, ondernemingen: [] }, opties).status, 403);
  assert.equal(beveiligDossier(tweede, aangeboden, { ...akkoord, fiat: { ...akkoord.fiat, tweede: { resultaat: 'akkoord' } } }, opties).status, 422);
  assert.equal(beveiligDossier(tweede, aangeboden, akkoord, { ...opties, backUp: true }).status, 403);
  assert.equal(beveiligDossier(tweede, aangeboden, akkoord, opties), null);
  assert.equal(akkoord.fiat.tweede.email, tweede.email);
  assert.equal(akkoord.fiat.tweede.datum, opties.nu);
  assert.equal(akkoord.fiatteur, tweede.naam);
  assert.equal(beveiligDossier(onbevoegd, akkoord, { ...akkoord, fiatteur: 'Andere naam' }).status, 403);

  const heropend = { ...structuredClone(akkoord), kader: 'KNAB', status: 'beoordeling_1' };
  delete heropend.fiat;
  delete heropend.fiatteur;
  assert.equal(beveiligDossier(tweede, akkoord, heropend).status, 422);
  wisInkomensWijzigingen(heropend);
  assert.equal(beveiligDossier(onbevoegd, akkoord, heropend).status, 403);
  assert.equal(beveiligDossier(tweede, akkoord, heropend), null);
});

test('back-up houdt dossierinhoud vast en vereist een nieuwe beoordeling van overgenomen fiats', () => {
  const d = { ...dossier(), status: 'afgerond', fiat: { eerste: { naam: 'X' }, tweede: { resultaat: 'akkoord' } }, fiatteur: 'Y' };
  assert.equal(beveiligDossier(tweede, null, d).status, 403);
  assert.equal(maakImportHerbeoordeling(d), true);
  assert.equal(d.status, 'beoordeling_1');
  assert.equal(d.fiat, undefined);
  assert.equal(d.ondernemingen.length, 1);
  assert.equal(beveiligDossier(tweede, null, d), null);
});

test('cloud blokkeert fiattering met open bewijs of onbesproken bronverschillen', () => {
  const oud = dossier();
  const aanbieding = (d) => ({ ...structuredClone(d), status: 'beoordeling_2', fiat: { eerste: { naam: eerste.naam } } });
  const extern = { ...oud, kader: 'RABO' };
  assert.equal(beveiligDossier(eerste, extern, aanbieding(extern)).status, 422);
  const bron = { ...oud, broncontrole: { controlepunten: ['Testsignaal'] } };
  assert.match(beveiligDossier(eerste, bron, aanbieding(bron)).fout, /verschillen met de bron/);
  bron.notities = { bronverschilOnderbouwing: 'Met de jaarrekening gecontroleerd.' };
  assert.equal(beveiligDossier(eerste, bron, aanbieding(bron)), null);
});

test('Fiat bundelt reken-, bedrijfs- en documentmeldingen', () => {
  const d = dossier();
  const r = { berekend: 42000, meldingen: [{ niveau: 'attentie', tekst: 'Controleer prognose' }],
    ondernemingen: [{ id: 'bedrijf', naam: 'Testbedrijf', checks: [{ status: 'niet_akkoord', key: 'balans', label: 'Balans', tekst: 'Balans is onvolledig' }] }],
    documenten: [{ verplicht: true, naam: 'Jaarrekening', categorie: 'jaarrekening', aantal: 2 }] };
  const html = renderFiatBeoordeling(d, r, [{ categorie: 'jaarrekening' }], { broncontroles: '<p>Broncontrole aanwezig</p>' });
  for (const tekst of ['Controleer prognose', 'Balans is onvolledig', 'Jaarrekening', 'Ontbreekt', 'Broncontrole aanwezig']) assert.ok(html.includes(tekst));
  assert.match(html, /#\/dossier\/dos_test\/balans\/bedrijf/);
  assert.doesNotMatch(html, /data-actie="inkomenswijziging"/);
});
