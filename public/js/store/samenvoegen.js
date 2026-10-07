// Samenvoegen van records uit twee bronnen (deze browser en een opgeslagen versie elders, zoals
// Google Drive). Per record wint de nieuwste wijziging; verwijderde records blijven als
// "deleted" bestaan zodat een verwijdering ook doorwerkt op andere apparaten.

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

/** Base64 (zoals de Drive-koppeling teruggeeft) naar tekst in UTF-8. */
export function base64NaarTekst(b64) {
  const bin = atob(String(b64 || ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
