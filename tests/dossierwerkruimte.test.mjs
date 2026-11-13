import test from 'node:test';
import assert from 'node:assert/strict';
import { bereken, vergelijkDossierVoorKader } from '../public/js/engine/index.js';
import { beleidsvoorbeeldVoor } from '../public/js/data/demo.js';
import { renderDossier, renderAnalyseKaderKeuzes, TABS } from '../public/js/views/dossier.js';

test('Berekening en Fiattering delen de uitkomstentabel, en de controles staan bij Fiattering', () => {
  const d = beleidsvoorbeeldVoor('VENN');
  const r = bereken(d);
  const start = renderDossier(d, 'berekening', '', r);
  assert.match(start, /Algemene rekenkeuzes[\s\S]*data-actie="dossier-berekenen"/);
  assert.doesNotMatch(start, /data-uitkomstentabel/);
  const berekening = renderDossier(d, 'berekening', '', r, { berekend: true });
  const fiat = renderDossier(d, 'fiat', '', r);
  assert.ok(berekening.includes('data-uitkomstentabel'));
  assert.match(berekening, /Algemene rekenkeuzes[\s\S]*>Inkomen<\/h2>[\s\S]*Ratio’s en voorwaarden/);
  assert.ok(fiat.includes(berekening.match(/<table[^>]+data-uitkomstentabel\b[^>]*>[\s\S]*?<\/table>/)[0]));
  assert.doesNotMatch(berekening, /id="fiat-controles"|id="reken-invoer"|Overige aandachtspunten/);
  assert.match(fiat, /id="fiat-controles"/);
  assert.match(fiat, /id="reken-invoer"/);
  assert.doesNotMatch(renderDossier(d, 'notities', '', r), /Maatschappijspecifieke controles/);
  const a = d.ondernemingen[0];
  assert.ok(berekening.includes(`#/dossier/${d.id}/berekening/${a.id}`));
  assert.match(renderDossier(d, 'berekening', a.id, r), /Alle uitkomsten.*Inkomen, ratio’s en voorwaarden.*Rekenstappen/s);
});

test('Elke dossiertab heeft een opslagactie in ViiZ en BZI', () => {
  const dossier = beleidsvoorbeeldVoor('VENN');
  for (const [tab] of TABS) assert.match(renderDossier(dossier, tab, '', bereken(dossier)), /data-actie="dossier-opslaan"/, tab);
  const d = { ...dossier, kader: 'ABN', weergave: 'bzi' };
  for (const tab of ['algemeen', 'bedrijven', 'bedrijf', 'verplichtingen', 'samenvatting', 'berekening', 'fiat']) {
    assert.match(renderDossier(d, tab, '', bereken(d)), /data-actie="dossier-opslaan"/, tab);
  }
});

test('Fiattering toont open onderbouwing bij de onderneming zonder bronbeoordeling te registreren', () => {
  const d = beleidsvoorbeeldVoor('VENN');
  const id = d.ondernemingen[0].id;
  d.notities = { openOnderbouwingDossier: 'Nog nodig op dossierniveau', openOnderbouwingPerOnderneming: { [id]: 'Originele stukken ontbreken' } };
  const r = bereken(d);
  const html = renderDossier(d, 'fiat', '', r);
  assert.ok(html.includes(`data-bind="notities.openOnderbouwingPerOnderneming.${id}"`));
  assert.match(html, /Nog nodig op dossierniveau/);
  assert.match(html, /Originele stukken ontbreken/);
  assert.doesNotMatch(renderDossier(d, 'berekening', '', r, { berekend: true }), /Originele stukken ontbreken/);
  assert.equal(d.notities.bronverschilOnderbouwing, undefined);
});

test('Rekenkeuzes bij Inkomensanalyse gelden uitsluitend voor het betreffende kader', () => {
  const d = beleidsvoorbeeldVoor('VENN');
  d.soort = 'ANALYSE';
  d.instellingen = { controlejaar: true, abnDividend: { uitgekeerd: true }, analyseKaders: { ABN: { abnVaststelling: 'verticaal', abnDividend: { uitgekeerd: false } } } };
  assert.match(renderAnalyseKaderKeuzes(d, 'ABN'), /data-bind="instellingen\.analyseKaders\.ABN\.abnVaststelling"/);
  assert.equal(vergelijkDossierVoorKader(d, 'ABN').instellingen.abnVaststelling, 'verticaal');
  assert.equal(vergelijkDossierVoorKader(d, 'ABN').instellingen.abnDividend.uitgekeerd, false);
  assert.equal(vergelijkDossierVoorKader(d, 'NHG').instellingen.abnDividend.uitgekeerd, true);
  assert.equal(vergelijkDossierVoorKader({ ...d, soort: 'IKV' }, 'ABN').instellingen.abnVaststelling, undefined);
});
