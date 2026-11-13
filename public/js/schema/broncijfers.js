import { getPath, setPath, clone, isIngevuld } from '../util.js';
import { KADERS, RECHTSVORMEN, kaderVoor } from '../engine/kaders.js';
import { heeftBalans, heeftVW } from '../engine/financieel.js';
import { VERMOGENS_CORRECTIES } from './correcties.js';
import { JAAR_STATUSSEN, AFGEROND } from './fields.js';

const BALANS = ['ev', 'bt', 'va', 'kvv', 'voorraad', 'vaDetail.rcDirectie'];
const RESULTAAT = ['omzet', 'nettowinst', 'resultaatVoorBelasting', 'vpb', 'afschrijvingen'];
const BZI = [...BALANS, ...RESULTAAT, 'managementFee', 'internDividend'];
const IB = ['sfw', 'loon', 'dividend', 'bijtelling'];
const PERSOONLIJK = ['voorStart', 'naast', 'uitkeringen', 'row', 'box3'];
const normal = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const gelijk = (a, b) => !!normal(a) && normal(a) === normal(b);
const tekst = (v, max = 250) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const geldigJaar = (y) => /^20\d\d$/.test(y);
const datum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
const bronnen = (b) => b && typeof b === 'object' ? { bestand: tekst(b.bestand), locatie: tekst(b.locatie) } : null;
const bedrag = (n) => typeof n === 'number' && Number.isFinite(n);
const identiek = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function pastDossier(d, m = {}) {
  const ids = [['id', m.id], ['nummer', m.nummer], ['leningnummer', m.leningnummer]].filter(([, v]) => normal(v));
  if (ids.length) return ids.every(([k, v]) => gelijk(d[k], v));
  if (!gelijk(d.aanvrager?.achternaam, m.aanvrager?.achternaam) || !gelijk(d.aanvrager?.voorletters, m.aanvrager?.voorletters)) return false;
  return (d.ondernemingen || []).some((o) => m.kvk ? gelijk(o.kvk, m.kvk) : gelijk(o.naam, m.onderneming));
}

function pastOnderneming(o, m = {}) {
  if (m.kvk && o.kvk) return gelijk(o.kvk, m.kvk);
  return gelijk(o.naam, m.naam);
}

function maakNieuw(bron, nummer) {
  const n = bron.nieuw;
  if (!n || bron.archief || !Object.hasOwn(KADERS, bron.toetskader?.kader || '') || !datum(bron.peildatum)
    || !gelijk(n.aanvrager?.achternaam, bron.match?.aanvrager?.achternaam) || !gelijk(n.aanvrager?.voorletters, bron.match?.aanvrager?.voorletters)) return null;
  const ondernemingen = (n.ondernemingen || []).map((o) => ({
    id: tekst(o.id, 50), naam: tekst(o.naam), rechtsvorm: Object.hasOwn(RECHTSVORMEN, o.rechtsvorm || '') ? o.rechtsvorm : '',
    ...(datum(o.startdatum) ? { startdatum: o.startdatum } : {}), land: tekst(o.land, 40), kvk: tekst(o.kvk, 20),
    ...(bedrag(o.aandeelPct) && o.aandeelPct >= 0 && o.aandeelPct <= 100 ? { aandeelPct: o.aandeelPct } : {}),
    ...(o.parentId ? { parentId: tekst(o.parentId, 50) } : {}),
    ...(o.extraParents?.length ? { extraParents: o.extraParents.map((p) => ({ id: tekst(p.id, 50), pct: p.pct,
      ...(geldigJaar(String(p.vanaf)) ? { vanaf: Number(p.vanaf) } : {}), ...(geldigJaar(String(p.tot)) ? { tot: Number(p.tot) } : {})
    })).filter((p) => bedrag(p.pct) && p.pct >= 0 && p.pct <= 100) } : {}),
    actief: true, meenemen: o.meenemen !== false, jaren: {},
  }));
  const ids = new Set(ondernemingen.map((o) => o.id));
  if (!ondernemingen.length || ids.size !== ondernemingen.length || ondernemingen.some((o) => !/^[\w-]+$/.test(o.id) || !o.naam || !o.rechtsvorm
    || (o.parentId && !ids.has(o.parentId)) || o.extraParents?.some((p) => !ids.has(p.id)))) return null;
  const instellingen = {};
  if (geldigJaar(String(n.instellingen?.laatsteToetsjaar))) instellingen.laatsteToetsjaar = n.instellingen.laatsteToetsjaar;
  return { id: `dos_prive_${nummer}`, type: 'dossier', version: 0, nummer, soort: 'IKV', status: 'beoordeling_1', niveau: 'Top',
    aanvrager: { voorletters: tekst(n.aanvrager.voorletters), achternaam: tekst(n.aanvrager.achternaam) },
    kader: bron.toetskader.kader, ...(typeof bron.toetskader.metNhg === 'boolean' ? { metNhg: bron.toetskader.metNhg } : {}),
    berekeningsdatum: bron.peildatum, ondernemingen, instellingen, ib: {}, weergave: 'viiz' };
}

/** Vul uitsluitend herleidbare lege velden in. Gedeelde dossiers worden nooit op naam alleen gematcht. */
export function voorstelBroncijfers(pakket, opgeslagen, { nummerVoorNieuw } = {}) {
  if (pakket?.app !== 'ZIB' || pakket.formaat !== 'dossiercijfers-1' || !Array.isArray(pakket.dossiers)) throw new Error('Dit bestand is geen ZIB-broncijfersbestand.');
  const werk = opgeslagen.filter((d) => d?.type === 'dossier' && !d.deleted && !d.demo && !d.id.startsWith('dos_demo_'));
  const voorstellen = [];
  for (const [index, bron] of pakket.dossiers.entries()) {
    if (!bron?.match || !Array.isArray(bron.ondernemingen)) continue;
    const matches = werk.filter((d) => pastDossier(d, bron.match));
    const issues = [];
    const gevonden = matches.length === 1 ? matches[0] : null;
    const nieuw = matches.length === 0 && nummerVoorNieuw ? maakNieuw(bron, nummerVoorNieuw(index)) : null;
    const p = { match: bron.match, broncontrole: bron.broncontrole, nieuw: !!nieuw, issues, wijzigingen: [], dossier: null };
    voorstellen.push(p);
    const origineel = gevonden || nieuw;
    if (!origineel) { issues.push(matches.length > 1 ? 'Meerdere dossiers komen overeen; koppel handmatig.' : 'Geen bestaand dossier met een unieke combinatie van identificatie en onderneming.'); continue; }
    if (AFGEROND.includes(origineel.status)) { issues.push('Dit dossier is afgesloten; open eerst een herbeoordeling.'); continue; }
    if (bron.toetskader?.kader && kaderVoor(origineel).id !== (bron.toetskader.metNhg ? 'NHG' : bron.toetskader.kader)) {
      issues.push('Het bronkader verschilt van het gekozen kader in ZIB. Koppel pas na controle.'); continue;
    }
    const d = clone(origineel);
    const provenance = [];
    const voeg = (obj, pad, waarde, bronregel, ond, jaar) => {
      const b = bronnen(bronregel);
      if (!b?.bestand || !b.locatie) return;
      const huidig = getPath(obj, pad);
      if (isIngevuld(huidig) && (!Array.isArray(huidig) || huidig.length)) {
        if (!identiek(huidig, waarde)) issues.push(`${ond ? `${ond.naam} · ` : ''}${jaar} · ${pad}: bestaande waarde behouden.`);
        return;
      }
      setPath(obj, pad, waarde);
      provenance.push({ ondId: ond?.id || '', jaar: Number(jaar), pad, ...b });
      p.wijzigingen.push({ onderneming: ond?.naam || '', jaar: Number(jaar), pad, waarde, ...b });
    };
    for (const o of bron.ondernemingen) {
      const matchOnd = (d.ondernemingen || []).filter((x) => pastOnderneming(x, o.match));
      if (matchOnd.length !== 1) { issues.push(`Onderneming niet uniek gekoppeld: ${tekst(o.match?.naam) || 'onbekend'}.`); continue; }
      const [ond] = matchOnd;
      ond.jaren ||= {};
      for (const [y, jaar] of Object.entries(o.jaren || {})) {
        if (!geldigJaar(y) || !jaar) continue;
        const jd = ond.jaren[y] ||= {};
        const jBron = jaar.bronnen || {};
        const velden = ['aandeelPct', 'div.aflossingenLVV', ...BZI.map((k) => `bzi.${k}`)];
        for (const pad of velden) {
          const v = getPath(jaar, pad);
          if (!bedrag(v)) continue;
          if (pad === 'aandeelPct' && (v < 0 || v > 100)) continue;
          if ((BALANS.some((k) => `bzi.${k}` === pad) && heeftBalans(jd.balans)) || (RESULTAAT.some((k) => `bzi.${k}` === pad) && heeftVW(jd.vw))) {
            issues.push(`${ond.naam} · ${y} · ${pad}: detailboekingen zijn leidend.`); continue;
          }
          voeg(jd, pad, v, jBron[pad], ond, y);
        }
        if (Object.hasOwn(JAAR_STATUSSEN, jaar.status || '')) voeg(jd, 'status', jaar.status, jBron.status, ond, y);
        for (const k of ['van', 'tot']) if (datum(jaar[k]) && !(jaar.van && jaar.tot && jaar.van > jaar.tot)) voeg(jd, k, jaar[k], jBron[k], ond, y);
        if (Array.isArray(jaar.vermogensCorrecties) && jaar.vermogensCorrecties.length && jaar.vermogensCorrecties.every((x) => Object.hasOwn(VERMOGENS_CORRECTIES, x.type) && bedrag(x.bedrag))) {
          voeg(jd, 'vermogensCorrecties', jaar.vermogensCorrecties.map((x) => ({ type: x.type, bedrag: x.bedrag, toelichting: tekst(x.toelichting, 800) })), jBron.vermogensCorrecties, ond, y);
        }
        for (const k of IB) {
          const v = o.ib?.[y]?.[k];
          if (bedrag(v)) voeg(d, `ib.${y}.perOnd.${ond.id}.${k}`, v, jBron[`ib.${k}`], ond, y);
        }
      }
    }
    for (const [y, jaar] of Object.entries(bron.ib || {})) if (geldigJaar(y)) for (const k of PERSOONLIJK) {
      if (bedrag(jaar[k])) voeg(d, `ib.${y}.${k}`, jaar[k], jaar.bronnen?.[k], null, y);
    }
    if (!p.wijzigingen.length) continue;
    d.broncontrole = { ...bron.broncontrole, peildatum: bron.peildatum, referentiebeleid: bron.toetskader?.bron, referentieversie: bron.toetskader?.versie,
      velden: [...(d.broncontrole?.velden || []), ...provenance], afwijkingenBijOvername: issues };
    // Gewijzigde grondslag vraagt een nieuwe beoordeling; oorspronkelijke fiatteringen blijven in versiehistorie.
    if (d.status === 'beoordeling_2') { d.status = 'beoordeling_1'; delete d.fiat; }
    if (d.afwijkend) d.afwijkend = { ...d.afwijkend, actief: false };
    for (const o of d.ondernemingen) if (o.afwijkend) o.afwijkend = { ...o.afwijkend, actief: false };
    p.dossier = d;
    if (nieuw) werk.push(d);
  }
  return voorstellen;
}
