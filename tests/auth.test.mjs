// Slot op e-mailadres voor de cloudversie (ALLOWED_EMAILS naast Cloudflare Access).
import test from 'node:test';
import assert from 'node:assert/strict';
import { toegestaanEmail, gebruiker } from '../functions/_shared/auth.js';

test('ALLOWED_EMAILS: zonder lijst beslist Access, met lijst alleen die adressen (hoofdletterongevoelig)', () => {
  assert.equal(toegestaanEmail('iemand@voorbeeld.nl', {}), true);
  const env = { ALLOWED_EMAILS: 'Jij@Voorbeeld.nl; collega@voorbeeld.nl' };
  assert.equal(toegestaanEmail('jij@voorbeeld.nl', env), true);
  assert.equal(toegestaanEmail('COLLEGA@voorbeeld.nl', env), true);
  assert.equal(toegestaanEmail('ander@voorbeeld.nl', env), false);
  assert.equal(toegestaanEmail('', env), false);
});

test('Zonder Access-instellingen weigert de API, behalve lokaal met DEV_ALLOW_ANON', async () => {
  const req = new Request('https://zib.example/api/me');
  assert.equal(await gebruiker(req, {}), null);
  const dev = await gebruiker(req, { DEV_ALLOW_ANON: '1' });
  assert.equal(dev.toegang, true);
});
