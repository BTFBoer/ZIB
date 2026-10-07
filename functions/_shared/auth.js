// Authenticatie via Cloudflare Access (Zero Trust).
// Access zet na het inloggen een ondertekende JWT in de header "Cf-Access-Jwt-Assertion".
// Deze module controleert handtekening, audience (AUD-tag), issuer en vervaldatum.
// Zonder ACCESS_TEAM_DOMAIN en ACCESS_AUD weigert de API alle verzoeken, tenzij
// DEV_ALLOW_ANON = "1" is gezet (alleen voor lokaal testen met `wrangler pages dev`).
// Optioneel slot: ALLOWED_EMAILS (komma- of puntkommagescheiden). Dan krijgen alleen die
// e-mailadressen toegang tot de gegevens, ook als de Access-policy per ongeluk ruimer staat.

let certCache = { team: '', keys: null, opgehaald: 0 };

function b64urlNaarBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlNaarTekst(s) {
  return new TextDecoder().decode(b64urlNaarBytes(s));
}

async function haalCertificaten(team) {
  const nu = Date.now();
  if (certCache.team === team && certCache.keys && nu - certCache.opgehaald < 60 * 60 * 1000) return certCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access-certificaten niet bereikbaar (${res.status})`);
  const json = await res.json();
  certCache = { team, keys: json.keys || [], opgehaald: nu };
  return certCache.keys;
}

async function verifieer(token, team, aud) {
  const delen = token.split('.');
  if (delen.length !== 3) return null;
  const [h, p, s] = delen;
  const header = JSON.parse(b64urlNaarTekst(h));
  const payload = JSON.parse(b64urlNaarTekst(p));
  const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
  if (!audOk) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (payload.iss && payload.iss !== `https://${team}`) return null;
  const keys = await haalCertificaten(team);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const sleutel = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const geldig = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', sleutel, b64urlNaarBytes(s), new TextEncoder().encode(`${h}.${p}`));
  return geldig ? payload : null;
}

function cookie(request, naam) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${naam}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Staat dit e-mailadres op de lijst ALLOWED_EMAILS? Zonder lijst: ja (Access bepaalt dan alleen). */
export function toegestaanEmail(email, env = {}) {
  const lijst = String(env.ALLOWED_EMAILS || '').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return !lijst.length || lijst.includes(String(email || '').trim().toLowerCase());
}

/**
 * Geeft { email, naam, toegang } terug, of null als de gebruiker niet is ingelogd.
 * `toegang` is false als het adres niet op ALLOWED_EMAILS staat.
 */
export async function gebruiker(request, env) {
  const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = env.ACCESS_AUD || '';
  if (team && aud) {
    const token = request.headers.get('cf-access-jwt-assertion') || cookie(request, 'CF_Authorization');
    if (!token) return null;
    const payload = await verifieer(token, team, aud);
    if (!payload) return null;
    const email = String(payload.email || payload.common_name || 'service-token').toLowerCase();
    return { email, naam: payload.name || email, toegang: toegestaanEmail(email, env) };
  }
  if (env.DEV_ALLOW_ANON === '1') return { email: 'ontwikkelaar@localhost', naam: 'Ontwikkelaar', toegang: true };
  return null;
}
