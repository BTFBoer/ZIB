import { LocalAdapter } from './local.js';
import { ApiAdapter } from './api.js';

/**
 * Kiest de opslag. Draait de app op Cloudflare Pages met de API, dan wordt de cloud gebruikt.
 * Anders (GitHub Pages, lokaal bestand, demo) valt de app terug op opslag in de browser.
 */
export async function kiesAdapter(voorkeur = 'auto') {
  let waarschuwing = '';
  const statischeHost = /\.github\.io$/i.test(location.hostname) || globalThis.ZIB_DEMO === true;
  if (voorkeur !== 'lokaal' && !statischeHost && typeof fetch === 'function' && location.protocol.startsWith('http')) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch('/api/health', { headers: { accept: 'application/json' }, signal: ctrl.signal });
      clearTimeout(t);
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.includes('application/json')) {
        const j = await res.json();
        if (j && j.ok && j.app === 'ZIB') {
          const api = new ApiAdapter('/api');
          try {
            const me = await api.init();
            return { adapter: api, me };
          } catch (e) {
            waarschuwing = `De cloud-API is gevonden maar niet toegankelijk (${e.message}). Controleer Cloudflare Access, de instellingen ACCESS_TEAM_DOMAIN en ACCESS_AUD en of je e-mailadres op ALLOWED_EMAILS staat. ZIB werkt nu tijdelijk lokaal in deze browser.`;
          }
        }
      }
    } catch {
      // geen API bereikbaar: lokale modus
    }
  }
  const lokaal = new LocalAdapter();
  const me = await lokaal.init();
  return { adapter: lokaal, me, waarschuwing };
}
