import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoRecords } from '../public/js/data/demo.js';
import { bewaarDossierbeleid } from '../public/js/dossierbeleid.js';
import { bereken, vergelijkKaders } from '../public/js/engine/index.js';
import { KADER_VOLGORDE } from '../public/js/engine/kaders.js';
import { renderDossier } from '../public/js/views/dossier.js';
import { renderDossierbeleid, werkBeleidsconceptBij, wisBeleidsconcept } from '../public/js/views/dossierbeleid.js';
import { dossierNotitiesTekst, renderRapport } from '../public/js/views/rapport.js';

const tabs = ['berekening', 'notities', 'rapport', 'fiat'];
const voorbeeld = () => {
  const d = demoRecords().find((record) => record.id === 'dos_demo_jansen');
  return { ...d, soort: 'IKV', kader: 'VENN', label: 'Venn', historie: [], notities: {} };
};

function controleerBeoordeling(d, r, verwacht, anderKader) {
  for (const tab of tabs) {
    const html = renderDossier(d, tab, '', r);
    assert.ok(html.includes(`data-beoordelingskader="${verwacht}"`), `${tab}: verwacht toetskader ${verwacht}`);
    assert.ok(!html.includes('data-analysekader='), `${tab}: onverwachte vergelijking`);
    assert.equal(anderKader.exec(html)?.[0], undefined, `${tab}: een ander kader staat in beeld`);
  }
  const rapport = renderRapport(d, r, 'uitgebreid');
  assert.ok(!rapport.includes('data-analysekader='), 'uitgebreid rapport: onverwachte vergelijking');
  assert.equal(anderKader.exec(rapport)?.[0], undefined, 'uitgebreid rapport: een ander kader staat in beeld');
  assert.equal(anderKader.exec(dossierNotitiesTekst(d, r))?.[0], undefined, 'gekopieerde notities: een ander kader staat in beeld');
}

test('Beoordeling volgt na opslaan het gewijzigde kader op alle vier tabbladen', () => {
  const d = voorbeeld();
  const wijziging = { soort: 'IKV', kader: 'ING', metNhg: false };
  const velden = {
    '[data-beleid-lender]': {},
    '[data-beleid-nhg]': {},
    '[data-beleid-melding]': {},
  };
  const form = {
    elements: {
      beleidSoort: { value: wijziging.soort },
      beleidKader: { value: wijziging.kader },
      beleidNhg: { checked: wijziging.metNhg },
    },
    querySelector: (selector) => velden[selector],
  };
  werkBeleidsconceptBij(form, d);
  assert.match(renderDossierbeleid(d), /value="ING" selected/);
  assert.match(velden['[data-beleid-melding]'].textContent, /Opslaan/);

  let r = bereken(d);
  assert.equal(r.kader, 'VENN');
  assert.equal(r.beleid.indicatie, 91900);
  controleerBeoordeling(d, r, 'VENN', /\bING\b|Rabobank/);

  bewaarDossierbeleid(d, wijziging);
  wisBeleidsconcept(d.id);
  r = bereken(d);
  assert.equal(r.kader, 'ING');
  assert.equal(r.beleid.indicatie, 95500);
  controleerBeoordeling(d, r, 'ING', /\bVenn\b|Rabobank/);
});

test('Met NHG gebruikt elk beoordelingstabblad alleen het NHG-kader', () => {
  const d = voorbeeld();
  bewaarDossierbeleid(d, { soort: 'IKV', kader: 'VENN', metNhg: true });
  const r = bereken(d);
  assert.equal(r.kader, 'NHG');
  assert.equal(r.vastgesteld, 92550);
  controleerBeoordeling(d, r, 'NHG', /\bVenn\b|\bING\b|Rabobank/);
  assert.match(dossierNotitiesTekst(d, r), /NHG/);
});

test('Een bestaand dossier met NHG behoudt NHG tot zonder NHG wordt opgeslagen', () => {
  const d = { ...voorbeeld(), beleidsinvoer: { VENN: { nhg: true } } };
  assert.equal(bereken(d).kader, 'NHG');
  bewaarDossierbeleid(d, { soort: 'IKV', kader: 'VENN', metNhg: false });
  assert.equal(bereken(d).kader, 'VENN');
});

test('Een nulbeoordeling met NHG toont geen Woonbeleid van een bank', () => {
  const d = { ...voorbeeld(), soort: 'NUL', metNhg: true };
  const r = bereken(d);
  controleerBeoordeling(d, r, 'NHG', /Woonbeleid|ABN AMRO|\bVenn\b/);
});

test('De BZI-weergave volgt dezelfde beoordelingsscope', () => {
  const d = { ...voorbeeld(), kader: 'ABN', label: 'ABN AMRO', weergave: 'bzi' };
  controleerBeoordeling(d, bereken(d), 'ABN', /\bVenn\b|\bING\b|Rabobank/);

  d.metNhg = true;
  controleerBeoordeling(d, bereken(d), 'NHG', /ABN AMRO|\bVenn\b|\bING\b|Rabobank/);
});

test('Een opgeslagen kaderwijziging opent de beoordeling opnieuw', () => {
  const d = {
    ...voorbeeld(),
    status: 'afgerond',
    fiat: { eerste: { naam: 'Eerste beoordelaar' }, tweede: { resultaat: 'akkoord' } },
    afwijkend: { actief: true, bedrag: 45000 },
  };
  assert.equal(bewaarDossierbeleid(d, { soort: 'IKV', kader: 'VENN', metNhg: false }), false);
  assert.equal(d.fiat.tweede.resultaat, 'akkoord');

  assert.equal(bewaarDossierbeleid(d, { soort: 'IKV', kader: 'ING', metNhg: false }), true);
  assert.equal(d.status, 'beoordeling_1');
  assert.equal(d.fiat, undefined);
  assert.equal(d.afwijkend, undefined);
});

test('Inkomensanalyse vergelijkt alle kaders ook na een eerdere keuze voor NHG', () => {
  const d = { ...voorbeeld(), beleidsinvoer: { VENN: { nhg: true } }, metNhg: true };
  bewaarDossierbeleid(d, { soort: 'ANALYSE', kader: 'VENN', metNhg: true });
  const r = bereken(d);
  assert.equal(r.inkomensanalyse, true);
  assert.equal(r.vastgesteld, null);
  const uitkomsten = vergelijkKaders(d);
  assert.equal(uitkomsten.length, KADER_VOLGORDE.length);
  assert.equal(uitkomsten.find((v) => v.id === 'VENN').beleid?.indicatie, 91900);
  assert.equal(uitkomsten.find((v) => v.id === 'ING').beleid?.indicatie, 95500);
  assert.equal(uitkomsten.find((v) => v.id === 'NHG').vastgesteld, 92550);
  for (const tab of tabs) {
    const html = renderDossier(d, tab, '', r);
    assert.ok(html.includes('data-inkomensanalyse'), `${tab}: ontbrekende vergelijking`);
    for (const id of KADER_VOLGORDE) assert.ok(html.includes(`data-analysekader="${id}"`), `${tab}: ${id} ontbreekt`);
  }
  assert.doesNotMatch(renderDossier(d, 'fiat', '', r), /data-actie="(?:gereed-melden|fiat-akkoord)"/);
});
