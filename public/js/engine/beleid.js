import { VENN_ING } from './policy-venn-ing.js';
import { RABO_NIBC } from './policy-rabo-nibc.js';
import { EXTRA_PROFIELEN } from './policy-extra.js';
import { addMonthsISO } from './periods.js';
import { fmt, isIngevuld, num, rond } from '../util.js';

export const BELEIDSPROFIELEN = [...VENN_ING, ...RABO_NIBC, ...EXTRA_PROFIELEN];
export const BELEID_PER_ID = Object.fromEntries(BELEIDSPROFIELEN.map((p) => [p.id, p]));
export const METHODE_LABEL = {
  eigen: 'Eigen rekenregels',
  nhg: 'NHG als rekenbasis',
  extern: 'Inkomensverklaring of bankbeoordeling',
};

const tekst = (v) => typeof v === 'string' ? v.trim() : '';
function geldigeDatum(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Bereken de route van de geldverstrekker; een bankverklaring is een bron, geen ZIB-berekening. */
export function toetsBeleidsprofiel(profiel, dossier, analyses, ctx, nhg) {
  const invoer = dossier.beleidsinvoer?.[profiel.id] || {};
  const grondslag = profiel.bereken?.({ dossier, analyses, ctx, nhg, invoer }) || {};
  if (dossier.soort === 'NUL') {
    return {
      methode: 'extern', bedrag: null, indicatie: null, bewijs: null, versie: grondslag.versie || profiel.versie,
      bronUrl: grondslag.bronUrl || profiel.bronUrl, perJaar: {},
      stappen: Number.isFinite(grondslag.bedrag) && grondslag.bedrag === 0 ? grondslag.stappen || [] : [],
      checks: [...(grondslag.bedrag === 0 ? grondslag.checks || [] : []), { status: 'attentie', tekst: 'Controleer het ondernemingsrisico en leg de voorgeschreven nul- of beoordelingsverklaring vast.' }],
      documenten: grondslag.documenten ?? (typeof profiel.documenten === 'function' ? profiel.documenten({ ctx, dossier, invoer }) : undefined),
    };
  }
  const extern = grondslag.extern ?? profiel.methode === 'extern';
  const checks = [...(grondslag.checks || [])];
  const stappen = [...(grondslag.stappen || [])];
  const meld = (status, tekst) => checks.push({ status, tekst });
  let bedrag = Number.isFinite(grondslag.bedrag) ? rond(Math.max(0, grondslag.bedrag)) : null;
  const toegevoegd = dossier.ondernemingen || [];
  const actief = analyses.filter((a) => a.meenemen !== false && !a.geconsolideerd && !a.isDeelneming
    && toegevoegd.find((o) => o.id === a.id)?.actief !== false);
  if (profiel.minMaanden && actief.length) {
    for (const a of actief) {
      if (!a.start) meld('attentie', `${a.naam}: voer de startdatum in om de minimale ondernemersduur te toetsen.`);
      else if (a.maandenOndernemer < profiel.minMaanden) meld('niet_akkoord', `${a.naam}: deze route vereist minimaal ${profiel.minMaanden} maanden ondernemerschap.`);
    }
  }
  if (profiel.basis === 'NHG' && profiel.methode === 'nhg' && grondslag.bedrag === undefined && !extern) {
    bedrag = Number.isFinite(nhg?.toetsinkomen) && nhg.status !== 'niet_akkoord' && nhg.bron !== 'geen' ? nhg.toetsinkomen : null;
    stappen.push({ label: 'Uitkomst NHG-rekenbasis', formule: 'NHG IKV; zie de rekenstappen van het NHG-dossier', waarde: bedrag });
    if (nhg?.status !== 'akkoord') meld(nhg?.status === 'niet_akkoord' ? 'niet_akkoord' : 'attentie', 'De NHG-berekening heeft open of afgewezen voorwaarden. Controleer de onderbouwing.');
  }
  let bewijs = null;
  const indicatie = bedrag;
  const heeftIkvInvoer = ['ikvBedrag', 'ikvDatum', 'ikvOpsteller'].some((key) => isIngevuld(invoer[key]));
  if (extern || (profiel.ikvOptioneel && heeftIkvInvoer)) {
    if (extern) bedrag = null;
    const datum = tekst(invoer.ikvDatum);
    const opsteller = tekst(invoer.ikvOpsteller);
    const bedragIngevoerd = isIngevuld(invoer.ikvBedrag) && Number.isFinite(Number(invoer.ikvBedrag)) && num(invoer.ikvBedrag) >= 0;
    if (!bedragIngevoerd || !opsteller || !geldigeDatum(datum)) {
      meld('attentie', 'Registreer bedrag, datum en opsteller van de vereiste inkomensverklaring of bankbeoordeling.');
    } else if (datum > ctx.datum) {
      meld('attentie', 'De datum van het bewijsstuk ligt na de berekeningsdatum.');
    } else if (profiel.ikvGeldigheid && ctx.datum >= addMonthsISO(datum, profiel.ikvGeldigheid)) {
      meld('attentie', `De inkomensverklaring is op de berekeningsdatum ouder dan toegestaan (${profiel.ikvGeldigheid} maanden).`);
    } else {
      bewijs = { datum, opsteller, bedrag: rond(num(invoer.ikvBedrag)) };
      const factor = grondslag.externFactor ?? 1;
      bedrag = rond(bewijs.bedrag * factor);
      stappen.push({ label: 'Geregistreerde inkomensverklaring of bankuitkomst', formule: `${opsteller} · ${fmt.datum(datum)}`, waarde: bewijs.bedrag });
      if (factor !== 1) stappen.push({ label: 'Mee te nemen deel volgens toetskader', formule: `${fmt.eur(bewijs.bedrag)} × ${fmt.pct(factor)}`, waarde: bedrag });
      meld('info', 'Controleer of de geldverstrekker de opsteller, verklaring en geldigheid voor deze aanvraag accepteert.');
    }
    if (extern && indicatie !== null) stappen.push({ label: 'Eigen rekenindicatie', formule: 'Ter vergelijking; de geldverstrekker gebruikt de voorgeschreven verklaring of eigen beoordeling.', waarde: indicatie });
  }
  if (bedrag === null && !checks.some((c) => c.status === 'attentie' || c.status === 'niet_akkoord')) {
    meld('attentie', 'Voor deze situatie is nog geen toetsinkomen onderbouwd.');
  }
  return {
    methode: extern ? 'extern' : grondslag.methode || (profiel.methode === 'extern' ? 'eigen' : profiel.methode),
    bedrag, indicatie, stappen, checks, bewijs,
    box1: grondslag.box1, box2: grondslag.box2, rc: grondslag.rc,
    versie: grondslag.versie || profiel.versie,
    bronUrl: grondslag.bronUrl || profiel.bronUrl,
    perJaar: grondslag.perJaar || {},
    documenten: grondslag.documenten ?? (typeof profiel.documenten === 'function' ? profiel.documenten({ ctx, dossier, invoer }) : profiel.documenten),
  };
}
