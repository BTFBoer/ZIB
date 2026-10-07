// Samenvoegen met de versie in Google Drive: per record wint de nieuwste wijziging.
import test from 'node:test';
import assert from 'node:assert/strict';
import { samenvoegen, vingerafdruk, versieNaam, base64NaarTekst } from '../public/js/store/samenvoegen.js';

const rec = (id, updated_at, extra = {}) => ({ id, type: 'dossier', updated_at, ...extra });

test('Samenvoegen: nieuwste wint, ontbrekende records komen erbij, bij gelijke tijd blijft lokaal', () => {
  const lokaal = [rec('a', '2026-10-07T10:00:00Z', { naam: 'lokaal' }), rec('b', '2026-10-07T12:00:00Z', { naam: 'lokaal' })];
  const extern = [rec('a', '2026-10-07T11:00:00Z', { naam: 'drive' }), rec('b', '2026-10-07T12:00:00Z', { naam: 'drive' }), rec('c', '2026-10-07T09:00:00Z')];
  const { samen, vanExtern } = samenvoegen(lokaal, extern);
  const byId = Object.fromEntries(samen.map((r) => [r.id, r]));
  assert.equal(byId.a.naam, 'drive');
  assert.equal(byId.b.naam, 'lokaal');
  assert.ok(byId.c);
  assert.deepEqual(vanExtern.map((r) => r.id).sort(), ['a', 'c']);
});

test('Samenvoegen: een verwijdering elders werkt door, en een oud demodossier wint niet van een nieuwere versie', () => {
  const lokaal = [rec('demo', '2026-09-15T10:00:00.000Z', { naam: 'demo' })];
  const extern = [rec('demo', '2026-10-07T08:00:00.000Z', { deleted: true })];
  const { samen, vanExtern } = samenvoegen(lokaal, extern);
  assert.equal(samen[0].deleted, true);
  assert.equal(vanExtern.length, 1);
});

test('Vingerafdruk verandert bij wijziging of verwijdering, niet bij volgorde', () => {
  const a = [rec('x', 't1'), rec('y', 't2')];
  assert.equal(vingerafdruk(a), vingerafdruk([...a].reverse()));
  assert.notEqual(vingerafdruk(a), vingerafdruk([rec('x', 't3'), rec('y', 't2')]));
  assert.notEqual(vingerafdruk(a), vingerafdruk([rec('x', 't1', { deleted: true }), rec('y', 't2')]));
});

test('Versienaam sorteert op tijd en base64 met UTF-8 wordt goed gelezen', () => {
  assert.equal(versieNaam('ZIB-gegevens', new Date('2026-10-07T19:37:17.609Z')), 'ZIB-gegevens 2026-10-07T19-37-17Z.json');
  assert.ok(versieNaam('P', new Date('2026-10-07T19:37:18Z')) > versieNaam('P', new Date('2026-10-07T19:37:17Z')));
  const tekst = JSON.stringify({ app: 'ZIB', naam: 'Coöperatie € 1.000' });
  const b64 = Buffer.from(tekst, 'utf8').toString('base64');
  assert.equal(base64NaarTekst(b64), tekst);
});
