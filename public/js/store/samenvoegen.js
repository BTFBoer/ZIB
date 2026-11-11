// Samenvoegen van records uit twee bronnen (deze browser en een opgeslagen versie elders, zoals
// Google Drive). Per record wint de nieuwste wijziging; verwijderde records blijven als
// "deleted" bestaan zodat een verwijdering ook doorwerkt op andere apparaten.
// Daarnaast: de versies in de map vinden, sorteren en bepalen welke oude versies weg mogen.

/** Tijdstip van de laatste wijziging van een record (ISO-tekst, vergelijkbaar als tekst). */
export function wijzigingstijd(r) {
  return String(r?.updated_at || r?.gewijzigd || r?.aangemaakt || '');
}

/**
 * Voegt `extern` samen met `lokaal`. Geeft alle records terug (`samen`) en de records die uit
 * `extern` komen omdat ze lokaal ontbreken of nieuwer zijn (`vanExtern`). Bij gelijke tijd wint lokaal.
 */
export function samenvoegen(lokaal = [], extern = []) {
  const map = new Map((lokaal || []).filter((r) => r && r.id).map((r) => [r.id, r]));
  const vanExtern = [];
  (extern || []).forEach((r) => {
    if (!r || !r.id || !r.type) return;
    const l = map.get(r.id);
    if (!l || wijzigingstijd(r) > wijzigingstijd(l)) {
      map.set(r.id, r);
      vanExtern.push(r);
    }
  });
  return { samen: [...map.values()], vanExtern };
}

/** Vingerafdruk van een verzameling records: verandert als er iets is toegevoegd, gewijzigd of verwijderd. */
export function vingerafdruk(records = []) {
  return (records || []).filter((r) => r && r.id)
    .map((r) => `${r.id}:${wijzigingstijd(r)}:${r.deleted ? 1 : 0}`).sort().join('|');
}

/** Bestandsnaam voor een nieuwe versie, sorteerbaar op tijd: "ZIB-gegevens 2026-10-07T19-37-17Z.json". */
export function versieNaam(prefix, datum = new Date()) {
  return `${prefix} ${datum.toISOString().slice(0, 19).replace(/:/g, '-')}Z.json`;
}

/** Is dit de naam van een versie die ZIB zelf heeft geschreven ("<prefix> 2026-10-07T19-37-17Z.json")? */
export function isVersieNaam(prefix, titel) {
  const t = String(titel || '');
  return t.startsWith(`${prefix} `) && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/.test(t.slice(String(prefix).length + 1));
}

const aflopend = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

/** Versies van nieuw naar oud: de naam bevat het tijdstip; bij gelijke naam beslist het aanmaaktijdstip. */
export function nieuwsteEerst(versies = []) {
  return [...(versies || [])].sort((a, b) => aflopend(String(a?.title || ''), String(b?.title || ''))
    || aflopend(String(a?.createdTime || ''), String(b?.createdTime || '')));
}

// Foutcodes waarbij de koppeling de argumenten van de zoekopdracht niet aannam.
const ARGUMENT_GEWEIGERD = new Set(['tool_error', 'bad_request', 'transform_error']);

/**
 * Leest via de zoekfunctie van de koppeling alle versies in een map, van nieuw naar oud.
 *
 * Zonder sortering geeft de zoekfunctie de meest relevante bestanden eerst (een ooit geopend bestand
 * staat dan vooraan) en verdeelt ze het antwoord over pagina's van wisselende grootte. Wie alleen de
 * eerste pagina leest, mist dus versies en kan een oude versie voor de nieuwste aanzien. Daarom vraagt
 * ZIB om de laatst gewijzigde eerst en leest het door tot er geen vervolgpagina meer is. Neemt de
 * koppeling de sortering niet aan, dan zonder: alle pagina's lezen en zelf sorteren geeft hetzelfde.
 *
 * `zoek(invoer)` roept search_files aan en geeft het antwoord terug ({ files, nextPageToken }).
 * Geeft `{ versies, volledig }`; `volledig` is false als er na `maxPaginas` pagina's nog meer was.
 */
export async function verzamelVersies(zoek, { mapId, prefix, paginaGrootte = 50, maxPaginas = 10 } = {}) {
  const gezien = new Map();
  let token = '';
  let gesorteerd = true;
  let paginas = 0;
  while (paginas < maxPaginas) {
    const invoer = { query: `parentId = '${mapId}' and title contains '${prefix}'`, excludeContentSnippets: true, pageSize: paginaGrootte };
    if (gesorteerd) invoer.orderBy = 'modifiedTime desc';
    if (token) invoer.pageToken = token;
    let r;
    try {
      r = await zoek(invoer);
    } catch (e) {
      if (gesorteerd && !token && ARGUMENT_GEWEIGERD.has(e?.code)) { gesorteerd = false; continue; }
      throw e;
    }
    paginas += 1;
    const bestanden = Array.isArray(r?.files) ? r.files : [];
    bestanden.forEach((f) => {
      if (f && f.id && isVersieNaam(prefix, f.title) && !gezien.has(f.id)) gezien.set(f.id, f);
    });
    // Een lege pagina betekent dat er niets meer komt, ook als er nog een vervolgtoken bij zit.
    token = bestanden.length ? String(r?.nextPageToken || r?.next_page_token || '') : '';
    if (!token) break;
  }
  return { versies: nieuwsteEerst([...gezien.values()]), volledig: !token };
}

/** De versies die weg mogen: alles na de `bewaar` nieuwste, oudste eerst, hooguit `max` per keer. */
export function teVerwijderen(versies = [], bewaar = 10, max = 10) {
  return nieuwsteEerst(versies).slice(Math.max(0, bewaar)).reverse().slice(0, Math.max(0, max));
}

/** Base64 (zoals de Drive-koppeling teruggeeft) naar tekst in UTF-8. */
export function base64NaarTekst(b64) {
  const bin = atob(String(b64 || ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
