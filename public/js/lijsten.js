// Hulpfuncties voor lijsten, zoeken en kleine grafieken. Zonder DOM en zonder opslag, zodat ze los te testen zijn.

/** ISO-datum plus een aantal dagen (kalenderdagen). */
export function plusDagen(iso, n) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Kleur van een uiterste datum, zoals in de takenlijst van de rekensoftware:
 * 'te-laat' (rood) = verstreken, 'bijna' (oranje) = vandaag of binnen twee dagen, '' = verder weg of geen datum.
 */
export function deadlineKlasse(datum, vandaag) {
  if (!datum) return '';
  const d = String(datum).slice(0, 10);
  if (d < vandaag) return 'te-laat';
  return d <= plusDagen(vandaag, 2) ? 'bijna' : '';
}

/** Toelichting bij de kleur van een uiterste datum (voor de tooltip). */
export function deadlineTekst(datum, vandaag) {
  const k = deadlineKlasse(datum, vandaag);
  if (k === 'te-laat') return 'Uiterste datum is verstreken';
  if (k === 'bijna') return String(datum).slice(0, 10) === vandaag ? 'Uiterste datum is vandaag' : 'Uiterste datum is binnen twee dagen';
  return '';
}

/** Filter per kolom: elk ingevuld filter moet in de kolomtekst voorkomen (niet hoofdlettergevoelig); '=tekst' vraagt een exacte waarde. */
export function kolomFilterPast(waarden, filters) {
  return Object.entries(filters || {}).every(([k, f]) => {
    const zoek = String(f ?? '').trim().toLowerCase();
    if (!zoek) return true;
    const waarde = String(waarden[k] ?? '').toLowerCase();
    // Een keuzefilter begint met '=' en moet exact overeenkomen ("Akkoord" is niet "Niet akkoord").
    return zoek.startsWith('=') ? waarde === zoek.slice(1) : waarde.includes(zoek);
  });
}

const zonderAccent = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Score voor snelzoeken. Alle woorden uit de vraag moeten voorkomen in titel of zoektekst.
 * Een treffer aan het begin van de titel of van een woord telt zwaarder. 0 = geen treffer.
 */
export function zoekScore(item, vraag) {
  const woorden = zonderAccent(vraag).split(/\s+/).filter(Boolean);
  if (!woorden.length) return 1;
  const titel = zonderAccent(item.titel);
  const alles = `${titel} ${zonderAccent(item.zoek)}`;
  let score = 0;
  for (const w of woorden) {
    const i = alles.indexOf(w);
    if (i === -1) return 0;
    const it = titel.indexOf(w);
    if (it === 0) score += 8;
    else if (it > 0 && /[\s,.(-]/.test(titel[it - 1])) score += 5;
    else if (it > 0) score += 3;
    else if (i === 0 || /[\s,.(-]/.test(alles[i - 1])) score += 2;
    else score += 1;
  }
  return score;
}

/** Zoekt in een lijst met items ({ titel, zoek, ... }) en geeft de beste treffers, in volgorde van score. */
export function zoekItems(items, vraag, max = 12) {
  return items
    .map((item, i) => ({ item, i, score: zoekScore(item, vraag) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .map((x) => x.item);
}

/**
 * Staafjes voor een kleine trendgrafiek. Alle staven delen één schaal; negatieve waarden lopen onder de nullijn.
 * Geeft per waarde { x, y, b, h, negatief, leeg } en de hoogte van de nullijn (nul) binnen het vak (breedte × hoogte).
 */
export function sparkStaven(waarden, { breedte = 60, hoogte = 20, tussenruimte = 3 } = {}) {
  const getallen = waarden.map((v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v)));
  const geldig = getallen.filter((v) => v !== null);
  const max = Math.max(0, ...geldig);
  const min = Math.min(0, ...geldig);
  const bereik = max - min || 1;
  const n = Math.max(1, getallen.length);
  const b = (breedte - tussenruimte * (n - 1)) / n;
  const nul = (max / bereik) * hoogte;
  const staven = getallen.map((v, i) => {
    const x = i * (b + tussenruimte);
    if (v === null) return { x, y: nul, b, h: 0, negatief: false, leeg: true };
    const h = (Math.abs(v) / bereik) * hoogte;
    // Een waarde ongelijk aan nul blijft zichtbaar (minimaal 1 beeldpunt).
    const zichtbaar = v === 0 ? 0 : Math.max(1, h);
    return { x, y: v >= 0 ? nul - zichtbaar : nul, b, h: zichtbaar, negatief: v < 0, leeg: false };
  });
  return { staven, nul, breedte, hoogte };
}

/**
 * Geplakte tekst (uit een spreadsheet of pdf) als rooster van cellen: regels worden rijen, tabs worden kolommen.
 * Lege regels aan het eind vervallen; een enkele waarde zonder regeleinde of tab geeft null (gewoon plakken).
 */
export function plakRooster(tekst) {
  const schoon = String(tekst ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!schoon || !/[\n\t]/.test(schoon)) return null;
  return schoon.split('\n').map((regel) => regel.split('\t').map((cel) => cel.trim()));
}
