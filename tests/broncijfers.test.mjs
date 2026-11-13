import test from 'node:test';
import assert from 'node:assert/strict';
import { voorstelBroncijfers } from '../public/js/schema/broncijfers.js';
import { totalenJaar } from '../public/js/engine/financieel.js';

const bron = { bestand: 'bron.xlsx', locatie: 'C4' };
const onderneming = { id: 'o', naam: 'Testbedrijf', rechtsvorm: 'BV', aandeelPct: 100 };
const identiteit = { voorletters: 'A.', achternaam: 'Voorbeeld' };
const bronDossier = {
  match: { aanvrager: identiteit, onderneming: onderneming.naam },
  toetskader: { kader: 'ABN', metNhg: false }, peildatum: '2026-09-01',
  nieuw: { aanvrager: identiteit, ondernemingen: [onderneming] },
  ondernemingen: [{ match: { naam: onderneming.naam }, jaren: { 2025: { bzi: { ev: 0, bt: 1000, omzet: 17000, nettowinst: 5000, afschrijvingen: 2000 }, bronnen: { 'bzi.ev': bron, 'bzi.bt': bron, 'bzi.omzet': bron, 'bzi.afschrijvingen': bron } } } }],
};
const pakket = (d = bronDossier) => ({ app: 'ZIB', formaat: 'dossiercijfers-1', dossiers: [d] });

test('Broncijfers wijzigen alleen herleidbare lege velden en bewaren een geregistreerde nul', () => {
  const d = { id: 'd', version: 1, type: 'dossier', kader: 'ABN', aanvrager: identiteit, ondernemingen: [{ ...onderneming, jaren: { 2025: { bzi: { bt: 0 } } } }] };
  const [p] = voorstelBroncijfers(pakket(), [d]);
  const jaar = p.dossier.ondernemingen[0].jaren[2025];
  assert.deepEqual(jaar.bzi, { ev: 0, bt: 0, omzet: 17000, afschrijvingen: 2000 });
  assert.equal(p.wijzigingen.length, 3);
  assert.equal(p.issues.length, 1);
  assert.equal(p.dossier.broncontrole.velden[0].bestand, 'bron.xlsx');
  assert.equal(d.ondernemingen[0].jaren[2025].bzi.ev, undefined);
  assert.equal(totalenJaar(jaar).vw.AFSCHRIJVINGEN, 2000);
});

test('Geen match op naam alleen, niet in oefendossiers en geen nieuw dossier voor een historisch rapport', () => {
  const d = { id: 'd', version: 1, type: 'dossier', kader: 'ING', aanvrager: identiteit, ondernemingen: [onderneming] };
  assert.equal(voorstelBroncijfers(pakket(), [d])[0].dossier, null);
  assert.equal(voorstelBroncijfers(pakket(), [{ ...d, kader: 'ABN', ondernemingen: [] }])[0].dossier, null);
  assert.equal(voorstelBroncijfers(pakket(), [{ ...d, kader: 'ABN', demo: true }])[0].dossier, null);
  assert.equal(voorstelBroncijfers(pakket({ ...bronDossier, archief: true }), [], { nummerVoorNieuw: () => 'ZIB-2026-0099' })[0].dossier, null);
  const [p] = voorstelBroncijfers(pakket(), [], { nummerVoorNieuw: () => 'ZIB-2026-0099' });
  assert.equal(p.dossier.status, 'beoordeling_1');
  assert.equal(p.dossier.niveau, 'Top');
  assert.equal(p.dossier.fiat, undefined);
});
