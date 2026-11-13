// Periodelogica volgens de gangbare rekenwijze in inkomensverklaringen:
// maanden van 30 dagen, jaren van 360 dagen (30/360). Daarmee geeft
// 01-01 t/m 31-05 precies 150 dagen en een extrapolatiefactor van 360/150 = 2,4.

export function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

export function toISO({ y, m, d }) {
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}`;
}

function dagenInMaand(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Aantal dagen tussen twee datums volgens 30/360. Inclusief = einddag telt mee. */
export function days360(van, tot, inclusief = true) {
  const a = parseISO(van);
  const b = parseISO(tot);
  if (!a || !b) return 0;
  const d1 = Math.min(a.d, 30);
  const d2 = Math.min(b.d, 30);
  return (b.y - a.y) * 360 + (b.m - a.m) * 30 + (d2 - d1) + (inclusief ? 1 : 0);
}

/** 360 / aantal dagen in de (tussentijdse) periode. Een volledig jaar geeft 1. */
export function extrapolatiefactor(van, tot) {
  const d = days360(van, tot, true);
  if (d <= 0) return 1;
  return Math.round((360 / d) * 100000) / 100000;
}

/** Is de periode een geheel aantal kalendermaanden (begint op de 1e, eindigt op de laatste dag)? */
export function volledigeMaanden(van, tot) {
  const a = parseISO(van);
  const b = parseISO(tot);
  if (!a || !b) return false;
  return a.d === 1 && b.d === dagenInMaand(b.y, b.m);
}

/** Duur tussen twee datums (niet-inclusief) in jaren/maanden/dagen en decimale maanden. */
export function duur(van, tot) {
  if (!van || !tot) return { jaren: 0, maanden: 0, dagen: 0, totaalMaanden: 0, negatief: false };
  const days = days360(van, tot, false);
  if (days < 0) return { jaren: 0, maanden: 0, dagen: 0, totaalMaanden: 0, negatief: true };
  const jaren = Math.floor(days / 360);
  const rest = days - jaren * 360;
  const maanden = Math.floor(rest / 30);
  const dagen = rest - maanden * 30;
  return { jaren, maanden, dagen, totaalMaanden: days / 30, negatief: false };
}

/** Periode in maanden inclusief de einddag, afgerond op twee decimalen (bijv. 36,40). */
export function maandenInclusief(van, tot) {
  const d = days360(van, tot, true);
  return Math.max(0, Math.round((d / 30) * 100) / 100);
}

export function addDaysISO(iso, n) {
  const p = parseISO(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return toISO({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function addMonthsISO(iso, n) {
  const p = parseISO(iso);
  if (!p) return iso;
  let m = p.m - 1 + n;
  const y = p.y + Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  const d = Math.min(p.d, dagenInMaand(y, m + 1));
  return toISO({ y, m: m + 1, d });
}

/** Geldigheid van een verklaring: vaststellingsdatum + N maanden - 1 dag (7 juni -> 6 december). */
export function geldigTot(iso, maanden = 6) {
  return addDaysISO(addMonthsISO(iso, maanden), -1);
}

/** Ligt de datum op of na dag/maand in hetzelfde jaar? */
export function opOfNa(iso, maand, dag) {
  const p = parseISO(iso);
  if (!p) return false;
  return p.m > maand || (p.m === maand && p.d >= dag);
}

/** Minimale NHG-dekking bij kalenderboekjaren, toetskader IKV 01.2026 p. 10. */
export function nhgKwartaaltermijn(datum) {
  const p = parseISO(datum);
  if (!p) return null;
  if (p.m >= 11) return { jaar: p.y, kwartaal: 3, tot: `${p.y}-09-30`, vanaf: '1 november' };
  if (p.m >= 8) return { jaar: p.y, kwartaal: 2, tot: `${p.y}-06-30`, vanaf: '1 augustus' };
  if (p.m >= 2 && p.m < 5) return { jaar: p.y - 1, kwartaal: 4, tot: `${p.y - 1}-12-31`, vanaf: '1 februari' };
  return null;
}

export function jaarVan(iso) {
  const p = parseISO(iso);
  return p ? p.y : new Date().getFullYear();
}

export function tekstDuur(d) {
  if (!d) return '';
  const j = `${d.jaren} jaar`;
  const m = `${d.maanden} ${d.maanden === 1 ? 'maand' : 'maanden'}`;
  const dg = `${d.dagen} ${d.dagen === 1 ? 'dag' : 'dagen'}`;
  return `${j}, ${m} en ${dg}`;
}
