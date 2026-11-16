import test from 'node:test';
import assert from 'node:assert/strict';
import { maakSitesWorker } from '../functions/sites-worker.js';
import { onRequest } from '../functions/api/[[route]].js';

const origin = 'https://voorbeeld.chatgpt.site';
const email = 'eigenaar@example.org';
const id = 'site-specifieke-bezoeker';
const owner = { 'oai-authenticated-user-id': id, 'oai-authenticated-user-email': email };
const worker = maakSitesWorker({ html: '<html>ZIB</html>' });
const env = { ZIB_SITE_OWNER_EMAIL: email, ZIB_SITE_OWNER_ID: id, DB: {}, FILES: {} };
const verzoek = (pad, headers = {}, init = {}, runtime = env) => worker.fetch(new Request(origin + pad, { ...init, headers }), runtime);

test('Sites vereist de eigenaar en beschermt HTML, health en records', async () => {
  const anoniem = await verzoek('/');
  assert.equal(anoniem.status, 302);
  assert.equal(anoniem.headers.get('location'), '/signin-with-chatgpt?return_to=%2F');
  for (const pad of ['/api/health', '/api/records', '/api/files/doc123']) {
    assert.equal((await verzoek(pad)).status, 401);
    assert.equal((await verzoek(pad, { 'oai-authenticated-user-email': email })).status, 401);
    assert.equal((await verzoek(pad, { ...owner, 'oai-authenticated-user-id': 'andere-account' })).status, 403);
  }
  assert.equal((await verzoek('/', owner, {}, { DB: {} })).status, 503);
  const html = await verzoek('/', owner);
  assert.equal(html.status, 200);
  assert.equal(await html.text(), '<html>ZIB</html>');
  assert.equal(html.headers.get('cache-control'), 'private, no-store');
  const health = await verzoek('/api/health', owner);
  assert.deepEqual(await health.json(), { ok: true, app: 'ZIB', database: true, bestanden: true, access: true, toegangslijst: true });
});

test('Sites gebruikt de accountnaam en past de bestaande accreditatieregel toe', async () => {
  const reactie = await verzoek('/api/me', { ...owner,
    'oai-authenticated-user-email': email.toUpperCase(),
    'oai-authenticated-user-full-name': encodeURIComponent('Zoë Test'),
    'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8' });
  assert.deepEqual(await reactie.json(), { email, naam: 'Zoë Test', accreditatie: '', hosting: 'sites' });
  const bevoegd = await verzoek('/api/me', owner, {}, { ...env, ZIB_ACCREDITATIES: JSON.stringify({ [email]: 'Medium' }) });
  assert.equal((await bevoegd.json()).accreditatie, 'Medium');
});

test('Sites verwerkt een documentupload uitsluitend vanuit dezelfde Site', async () => {
  const uploads = [];
  const runtime = {
    ...env, ZIB_SITE_ORIGIN: origin,
    DB: { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) },
    FILES: { put: async (key, body) => uploads.push([key, await new Response(body).text()]) },
  };
  const pad = '/api/files/test-document';
  const upload = { method: 'PUT', body: 'fictieve inhoud' };
  for (const metadata of [{}, { origin: 'https://andere.example.org' }, { origin, 'sec-fetch-site': 'same-site' }]) {
    assert.equal((await verzoek(pad, { ...owner, ...metadata }, upload, runtime)).status, 403);
  }
  assert.deepEqual(uploads, []);
  assert.equal((await verzoek(pad, { ...owner, origin, 'sec-fetch-site': 'same-origin' }, upload, runtime)).status, 200);
  assert.deepEqual(uploads, [['documenten/test-document', 'fictieve inhoud']]);
});

test('Cloudflare Pages vertrouwt geen Sites-identiteitsheaders', async () => {
  const request = new Request(origin + '/api/me', { headers: owner });
  const reactie = await onRequest({ request, env, params: { route: ['me'] }, hosting: 'sites' });
  assert.equal(reactie.status, 401);
});
