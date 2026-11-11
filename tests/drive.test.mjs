// Samenvoegen met de versie in Google Drive: per record wint de nieuwste wijziging.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  samenvoegen, vingerafdruk, versieNaam, base64NaarTekst, isVersieNaam, nieuwsteEerst, verzamelVersies, teVerwijderen,
} from '../public/js/store/samenvoegen.js';

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

// ---------------------------------------------------------------------------
// Versies in de map vinden en opruimen. De zoekfunctie van de koppeling geeft haar antwoord in pagina's van
// wisselende grootte en zonder sortering op relevantie: een ooit geopend bestand staat dan vooraan.
const PREFIX = 'ZIB-gegevens';
const tijdstip = (i) => new Date(Date.UTC(2026, 9, 7, 19, 37, 17) + i * 3600 * 1000);
const versie = (i, extra = {}) => ({
  id: `v${String(i).padStart(3, '0')}`, title: versieNaam(PREFIX, tijdstip(i)), createdTime: tijdstip(i).toISOString(), ...extra,
});

/** Nagebootste zoekfunctie: paginering met vervolgtoken, relevantie-volgorde zonder orderBy. */
function nepZoek(bestanden, { paginas = [5, 45], kentSortering = true, dubbelOpGrens = false, tokenOpLaatste = true } = {}) {
  const aanroepen = [];
  const zoek = async (invoer) => {
    aanroepen.push({ ...invoer });
    if (invoer.orderBy && !kentSortering) throw { code: 'tool_error', message: 'Unknown argument: orderBy' };
    const opTijd = [...bestanden].sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
    const volgorde = invoer.orderBy === 'modifiedTime desc'
      ? opTijd
      : [...opTijd.filter((f) => f.viewedByMeTime), ...opTijd.filter((f) => !f.viewedByMeTime)];
    const [nr, start] = invoer.pageToken ? invoer.pageToken.split(':').map(Number) : [0, 0];
    const eind = start + Math.min(invoer.pageSize, paginas[nr] ?? invoer.pageSize);
    const files = volgorde.slice(dubbelOpGrens && start > 0 ? start - 1 : start, eind);
    const meer = eind < volgorde.length || (tokenOpLaatste && files.length > 0);
    return meer ? { files, nextPageToken: `${nr + 1}:${eind}` } : { files };
  };
  return { zoek, aanroepen };
}

test('Versienaam herkennen: alleen bestanden die ZIB zelf heeft geschreven', () => {
  assert.equal(isVersieNaam(PREFIX, 'ZIB-gegevens 2026-10-07T19-37-17Z.json'), true);
  assert.equal(isVersieNaam(PREFIX, versieNaam(PREFIX, new Date())), true);
  assert.equal(isVersieNaam(PREFIX, 'ZIB-gegevens 2026-10-07T19-37-17Z (1).json'), false);
  assert.equal(isVersieNaam(PREFIX, 'ZIB-gegevens back-up.json'), false);
  assert.equal(isVersieNaam(PREFIX, 'Kopie van ZIB-gegevens 2026-10-07T19-37-17Z.json'), false);
  assert.equal(isVersieNaam(PREFIX, 'ZIB-gegevens2026-10-07T19-37-17Z.json'), false);
  assert.equal(isVersieNaam(PREFIX, undefined), false);
});

test('Versies vinden: alle pagina\'s, nieuwste eerst, ook als de eerste pagina klein is', async () => {
  const alle = Array.from({ length: 57 }, (_, i) => versie(i));
  const { zoek, aanroepen } = nepZoek(alle, { paginas: [5, 45, 50] });
  const { versies, volledig } = await verzamelVersies(zoek, { mapId: 'map1', prefix: PREFIX });
  assert.equal(versies.length, 57);
  assert.equal(volledig, true);
  assert.equal(versies[0].id, 'v056');
  assert.equal(versies[56].id, 'v000');
  assert.equal(aanroepen[0].orderBy, 'modifiedTime desc');
  assert.equal(aanroepen[0].pageSize, 50);
  assert.equal(aanroepen[0].pageToken, undefined);
  assert.match(aanroepen[0].query, /^parentId = 'map1' and title contains 'ZIB-gegevens'$/);
  assert.ok(aanroepen.slice(1).every((a) => a.pageToken && a.orderBy === 'modifiedTime desc'));
});

test('Versies vinden: zonder sortering staat de nieuwste niet op de eerste pagina, en wordt toch gevonden', async () => {
  // Zes oude versies zijn ooit geopend: op relevantie vullen die de eerste pagina (vijf bestanden).
  const alle = Array.from({ length: 30 }, (_, i) => versie(i, i < 6 ? { viewedByMeTime: '2026-10-08T10:00:00Z' } : {}));
  const { zoek, aanroepen } = nepZoek(alle, { paginas: [5, 45], kentSortering: false });
  const eerste = await zoek({ query: 'x', pageSize: 50 });
  assert.ok(eerste.files.every((f) => f.viewedByMeTime), 'de eerste pagina bevat alleen oude, ooit geopende versies');
  aanroepen.length = 0;

  const { versies, volledig } = await verzamelVersies(zoek, { mapId: 'map1', prefix: PREFIX });
  assert.equal(versies[0].id, 'v029');
  assert.equal(versies.length, 30);
  assert.equal(volledig, true);
  // Eén poging met sortering (geweigerd), daarna zonder en alle pagina's.
  assert.equal(aanroepen[0].orderBy, 'modifiedTime desc');
  assert.ok(aanroepen.slice(1).every((a) => a.orderBy === undefined));
});

test('Versies vinden: dubbele bestanden op een paginagrens tellen één keer, vreemde bestanden doen niet mee', async () => {
  const alle = [
    ...Array.from({ length: 12 }, (_, i) => versie(i)),
    { id: 'kopie', title: 'ZIB-gegevens 2026-12-31T23-59-59Z (1).json', createdTime: '2026-12-31T23:59:59.000Z' },
    { id: 'eigen', title: 'ZIB-gegevens back-up klant.json', createdTime: '2026-12-30T10:00:00.000Z' },
  ];
  const { zoek } = nepZoek(alle, { paginas: [4, 4, 4, 4], dubbelOpGrens: true, tokenOpLaatste: false });
  const { versies } = await verzamelVersies(zoek, { mapId: 'm', prefix: PREFIX });
  assert.deepEqual(versies.map((v) => v.id), Array.from({ length: 12 }, (_, i) => `v${String(11 - i).padStart(3, '0')}`));
});

test('Versies vinden: begrensd aantal pagina\'s, en andere fouten gaan door naar de aanroeper', async () => {
  const alle = Array.from({ length: 40 }, (_, i) => versie(i));
  const { zoek, aanroepen } = nepZoek(alle, { paginas: [2, 2, 2, 2, 2, 2] });
  const r = await verzamelVersies(zoek, { mapId: 'm', prefix: PREFIX, maxPaginas: 3 });
  assert.equal(aanroepen.length, 3);
  assert.equal(r.volledig, false);
  assert.equal(r.versies[0].id, 'v039', 'met sortering staat de nieuwste altijd op de eerste pagina');

  await assert.rejects(verzamelVersies(async () => { throw { code: 'needs_reauth' }; }, { mapId: 'm', prefix: PREFIX }), { code: 'needs_reauth' });
  // Een weigering op een vervolgpagina is geen kwestie van sortering: niet opnieuw beginnen.
  let n = 0;
  const halverwege = async (invoer) => {
    n += 1;
    if (invoer.pageToken) throw { code: 'tool_error' };
    return { files: [versie(1)], nextPageToken: '1:1' };
  };
  await assert.rejects(verzamelVersies(halverwege, { mapId: 'm', prefix: PREFIX }), { code: 'tool_error' });
  assert.equal(n, 2);
});

test('Opruimen: de tien nieuwste blijven, de oudste gaan eerst, hooguit tien per keer', () => {
  const alle = Array.from({ length: 57 }, (_, i) => versie(i));
  const door = [...alle.filter((_, i) => i % 2), ...alle.filter((_, i) => i % 2 === 0)]; // de volgorde van aanleveren doet er niet toe
  const weg = teVerwijderen(door, 10, 10);
  assert.deepEqual(weg.map((v) => v.id), ['v000', 'v001', 'v002', 'v003', 'v004', 'v005', 'v006', 'v007', 'v008', 'v009']);
  const nieuwste = new Set(nieuwsteEerst(alle).slice(0, 10).map((v) => v.id));
  assert.ok(teVerwijderen(alle, 10, 1000).every((v) => !nieuwste.has(v.id)));
  assert.equal(teVerwijderen(alle, 10, 1000).length, 47);
  assert.deepEqual(teVerwijderen(alle.slice(0, 10), 10, 10), []);
  assert.deepEqual(teVerwijderen(alle.slice(0, 11), 10, 10).map((v) => v.id), ['v000']);
  assert.deepEqual(teVerwijderen([], 10, 10), []);
});
