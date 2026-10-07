// Gedeelde hulpfuncties (zonder DOM-afhankelijkheden, dus ook bruikbaar in Node-tests).

const nf0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
  'augustus', 'september', 'oktober', 'november', 'december'];

/** Maakt van elke invoer een eindig getal (lege/ongeldige waarden worden 0). */
export function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** True als er bewust een waarde is ingevuld (ook 0). */
export function isIngevuld(v) {
  return !(v === null || v === undefined || v === '');
}

/** Afronden op hele euro's, zoals de rekenstappen in de rapportage. */
export function rond(x) {
  const r = Math.round(num(x));
  return Object.is(r, -0) ? 0 : r;
}

export function rond2(x) {
  return Math.round(num(x) * 100) / 100;
}

export const fmt = {
  /** 54708 -> "54.708" */
  getal(x, dec = 0) {
    if (x === null || x === undefined || Number.isNaN(x)) return '';
    return dec === 2 ? nf2.format(x) : nf0.format(rond(x));
  },
  /** 54708 -> "€ 54.708" */
  eur(x, dec = 0) {
    if (x === null || x === undefined || Number.isNaN(x)) return '';
    return '€ ' + (dec === 2 ? nf2.format(x) : nf0.format(rond(x)));
  },
  /** 0.2522 -> "25,22%" */
  pct(x, dec = 2) {
    if (x === null || x === undefined || !Number.isFinite(x)) return 'n.v.t.';
    return (dec === 2 ? nf2.format(x * 100) : nf0.format(x * 100)) + '%';
  },
  /** 1.5 -> "1,50" */
  ratio(x) {
    if (x === null || x === undefined || !Number.isFinite(x)) return 'n.v.t.';
    return nf2.format(x);
  },
  /** "2024-06-07" -> "07-06-2024" */
  datum(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    if (!y || !m || !d) return String(iso);
    return `${d}-${m}-${y}`;
  },
  /** "2024-06-07" -> "7 juni 2024" */
  datumLang(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return String(iso);
    return `${d} ${MAANDEN[m - 1]} ${y}`;
  },
  /** ISO tijdstempel -> "07-06-2024 13:39" */
  tijdstip(iso) {
    if (!iso) return '';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return String(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(dt.getDate())}-${p(dt.getMonth() + 1)}-${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
  },
};

/**
 * Leest een bedrag zoals een Nederlandse gebruiker het typt.
 * Punten zijn duizendtallen, de komma is het decimaalteken: "38.896" -> 38896, "1.234,50" -> 1234.5.
 * Lege invoer geeft null (= niet ingevuld).
 */
export function parseBedrag(str) {
  if (str === null || str === undefined) return null;
  let s = String(str).trim();
  if (s === '') return null;
  s = s.replace(/€/g, '').replace(/\s/g, '').replace(/−/g, '-');
  const negatief = /^\(.*\)$/.test(s);
  if (negatief) s = s.slice(1, -1);
  s = s.replace(/\./g, '').replace(',', '.');
  const x = Number(s);
  if (!Number.isFinite(x)) return null;
  return negatief ? -x : x;
}

/** Leest een percentage: "80" of "80%" -> 80 */
export function parsePct(str) {
  const x = parseBedrag(String(str ?? '').replace('%', ''));
  return x === null ? null : x;
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function uid(prefix = 'id') {
  const r = (globalThis.crypto && globalThis.crypto.randomUUID)
    ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${prefix}_${r}`;
}

export function getPath(obj, path) {
  if (!path) return obj;
  return String(path).split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i];
    if (o[k] === null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
  return obj;
}

export function clone(o) {
  return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
}

export function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nowISO() {
  return new Date().toISOString();
}

export function som(arr) {
  return arr.reduce((a, b) => a + num(b), 0);
}

export function gemiddelde(arr) {
  return arr.length ? som(arr) / arr.length : 0;
}

/** Volledige naam zoals in de rapportage: "Jansen, P.A." of "Vries, M. de" */
export function naamAanvrager(a = {}) {
  const achternaam = a.achternaam || '';
  const tv = a.tussenvoegsel ? ` ${a.tussenvoegsel}` : '';
  const vl = a.voorletters || '';
  if (!achternaam && !vl) return '(naam onbekend)';
  return `${achternaam}${vl ? ', ' + vl : ''}${tv}`;
}
