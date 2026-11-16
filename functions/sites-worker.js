import { handelApiVerzoek } from './api/[[route]].js';

const leesmethode = new Set(['GET', 'HEAD']);
const headers = {
  'cache-control': 'private, no-store',
  'referrer-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
};
const tekst = (waarde) => String(waarde || '').trim();
const emailKlein = (waarde) => tekst(waarde).toLowerCase();

function fout(tekst, status) {
  return new Response(JSON.stringify({ fout: tekst }), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
}

function naamUitSites(request, email) {
  const naam = tekst(request.headers.get('oai-authenticated-user-full-name'));
  if (!naam) return email;
  if (request.headers.get('oai-authenticated-user-full-name-encoding') !== 'percent-encoded-utf-8') return naam;
  try { return decodeURIComponent(naam); } catch { return email; }
}

function isEigenSite(request, url, env) {
  const origin = request.headers.get('origin');
  const verwacht = tekst(env.ZIB_SITE_ORIGIN) || url.origin;
  const site = request.headers.get('sec-fetch-site');
  return (!site || site === 'same-origin') && (origin ? origin === verwacht : site === 'same-origin');
}

export function maakSitesWorker({ html }) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
      // Sites Dispatch beheert deze headers. Gebruik deze adapter uitsluitend achter Sites Dispatch.
      const id = tekst(request.headers.get('oai-authenticated-user-id'));
      const email = emailKlein(request.headers.get('oai-authenticated-user-email'));
      const eigenaar = emailKlein(env.ZIB_SITE_OWNER_EMAIL);
      if (!eigenaar) return fout('De toegangsconfiguratie van deze ZIB-werkruimte ontbreekt.', 503);
      if (!id || !email) {
        if (isApi || !leesmethode.has(request.method)) return fout('Meld je aan met ChatGPT om ZIB te openen.', 401);
        return new Response(null, { status: 302, headers: { ...headers, location: '/signin-with-chatgpt?return_to=%2F' } });
      }
      if (email !== eigenaar || (tekst(env.ZIB_SITE_OWNER_ID) && id !== tekst(env.ZIB_SITE_OWNER_ID))) {
        return fout('Dit ChatGPT-account heeft geen toegang tot de ZIB-werkruimte.', 403);
      }

      if (isApi) {
        if (!leesmethode.has(request.method) && !isEigenSite(request, url, env)) return fout('Dit verzoek is afkomstig van een andere site.', 403);
        const route = url.pathname.split('/').slice(2).filter(Boolean);
        const response = await handelApiVerzoek({ request, env, params: { route }, hosting: 'sites' },
          () => ({ email, naam: naamUitSites(request, email), toegang: true }));
        const beveiligdeHeaders = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) beveiligdeHeaders.set(key, value);
        return new Response(response.body, { status: response.status, headers: beveiligdeHeaders });
      }
      if (url.pathname !== '/' && url.pathname !== '/index.html') return fout('Pagina niet gevonden.', 404);
      if (!leesmethode.has(request.method)) return fout('Methode niet toegestaan.', 405);
      return new Response(request.method === 'HEAD' ? null : html, {
        headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
      });
    },
  };
}
