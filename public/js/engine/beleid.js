import { VENN_ING } from './policy-venn-ing.js';
import { RABO_NIBC } from './policy-rabo-nibc.js';
import { EXTRA_PROFIELEN } from './policy-extra.js';
import { addMonthsISO } from './periods.js';
import { fmt, isIngevuld, num, rond } from '../util.js';
import { REKENWIJZEN, beleidsinvoerMetRekenwijze, effectieveRekenwijze } from './rekenwijze.js';

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

/**
 * Gepubliceerde rekenmethode per geldverstrekker voor de rekenindicatie (zie de regels per profiel):
 * '111' = gemiddelde van drie jaar, '123' = gewogen 1×/2×/3×, 'nhg' = het toetsinkomen volgens NHG. Altijd
 * maximaal het laatste jaar.
 */
export const BELEIDSMETHODE = {
  VENN: '123',
  ING: '111', RABO: '111', ATTENS: '111', SYNTRUS: '111', LLOYDS: '111', NN: '111', DYNAMIC: '111',
  NIBC: 'nhg', MUNT: 'nhg', MERIUS: 'nhg', ASR: 'nhg', BIJBOUWE: 'nhg', TULP: 'nhg', BUNQ: 'nhg',
};
const METHODE_TEKST = {
  111: 'gemiddelde van drie jaar, maximaal het laatste jaar',
  123: 'gewogen 1-2-3 (oudste 1×, middelste 2×, laatste 3×), maximaal het laatste jaar',
  134: 'gewogen 1-3-4 (oudste 1×, middelste 3×, laatste 4×), maximaal het laatste jaar',
  nhg: 'toetsinkomen volgens het NHG-toetskader (rekenbasis van deze geldverstrekker)',
};

/**
 * Rekenindicatie volgens de methode van de geldverstrekker op de jaarinkomens van de NHG-rekenkern. Een gekozen
 * gewogen rekenwijze (1-2-3 of 1-3-4, als de geldverstrekker die aanbiedt) gaat voor de standaardmethode.
 */
export function beleidsindicatie(profiel, nhg, rekenwijze = null) {
  if (!nhg?.inkomen) return null;
  const methode = REKENWIJZEN[rekenwijze] && rekenwijze !== '111' ? rekenwijze : BELEIDSMETHODE[profiel.id] || 'nhg';
  const T = nhg.T || [];
  const reeks = T.map((y) => nhg.inkomen.perJaar?.[y]);
  // Zonder cijfers geen indicatie: een lege berekening is geen inkomen van € 0.
  const heeftCijfers = reeks.some((x) => Number.isFinite(x) && x !== 0)
    || (Number.isFinite(nhg.toetsinkomen) && nhg.toetsinkomen !== 0);
  if (!heeftCijfers) return null;
  // Starters volgen de NHG-starterregels (afslag en prognose); de driejaarsmethode past daar niet.
  if (methode === 'nhg' || nhg.inkomen.starter || reeks.length !== 3 || reeks.some((x) => !Number.isFinite(x))) {
    if (!Number.isFinite(nhg.toetsinkomen)) return null;
    return {
      bedrag: rond(Math.max(0, nhg.toetsinkomen)), methode: 'nhg',
      stappen: [{ label: `Rekenindicatie ${profiel.kort}`, formule: `Methode: ${METHODE_TEKST.nhg}`, waarde: rond(Math.max(0, nhg.toetsinkomen)) }],
    };
  }
  const [a, b, c] = reeks;
  const [wa, wb, wc] = REKENWIJZEN[methode]?.gewichten || [1, 1, 1];
  const noemer = wa + wb + wc;
  const gem = (wa * a + wb * b + wc * c) / noemer;
  const deel = (w, x) => `${w > 1 ? `${w} × ` : ''}${fmt.getal(x)}`;
  const formule = `(${deel(wa, a)} + ${deel(wb, b)} + ${deel(wc, c)}) / ${noemer} = ${fmt.getal(gem)}; maximaal ${fmt.getal(c)}`;
  // Het lopende jaar kan alleen verlagen, zoals bij NHG.
  const extr = Number.isFinite(nhg.inkomen.controleExtr) ? nhg.inkomen.controleExtr : null;
  let bedrag = Math.max(0, Math.min(gem, c));
  const stappen = T.map((y, i) => ({ label: `Jaarinkomen ${y} na correcties`, formule: 'Uit de rekenkern (box 1, box 2 en overige inkomsten)', waarde: rond(reeks[i]) }));
  stappen.push({ label: `Rekenindicatie ${profiel.kort}`, formule: `Methode: ${METHODE_TEKST[methode]}. ${formule}`, waarde: rond(bedrag) });
  if (extr !== null && extr < bedrag) {
    bedrag = Math.max(0, extr);
    stappen.push({ label: 'Lopend jaar lager (geëxtrapoleerd)', formule: 'Het inkomen kan alleen naar beneden worden bijgesteld', waarde: rond(bedrag) });
  }
  return { bedrag: rond(bedrag), methode, stappen };
}

/** Bereken de route van de geldverstrekker; een bankverklaring is een bron, geen ZIB-berekening. */
export function toetsBeleidsprofiel(profiel, dossier, analyses, ctx, nhg) {
  // De rekenwijze bij de algemene rekenkeuzes (bijv. 1-2-3 bij NIBC of bunq) stuurt de route van het profiel.
  const invoer = beleidsinvoerMetRekenwijze(profiel.id, { ...dossier.beleidsinvoer?.[profiel.id], nhg: ctx.kader.nhg === true }, dossier.instellingen);
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
  let indicatie = bedrag;
  let viaIndicatie = false;
  // Geen eigen bedrag uit de route (bijv. verklaring vereist of een ontbrekend beleidsveld): reken dan met de
  // gepubliceerde methode van de geldverstrekker op de jaarinkomens na correcties (NHG-rekenkern). Zo staan de
  // rekenvelden altijd ingevuld; het formele bedrag blijft de verklaring of bankbeoordeling waar het beleid die eist.
  if (indicatie === null && dossier.soort !== 'NUL') {
    const fallback = beleidsindicatie(profiel, nhg, effectieveRekenwijze(profiel.id, dossier.instellingen, dossier.beleidsinvoer));
    if (fallback) {
      indicatie = fallback.bedrag;
      viaIndicatie = true;
      stappen.push(...fallback.stappen);
      // Een maximum uit het beleid (bijv. een percentage van het jaarloon naast dienstverband) blijft gelden.
      const maximum = stappen.find((s) => /^Maximum/i.test(s.label || '') && Number.isFinite(s.waarde));
      if (maximum && maximum.waarde < indicatie) {
        indicatie = rond(maximum.waarde);
        stappen.push({ label: 'Indicatie begrensd op het maximum uit het beleid', formule: maximum.label, waarde: indicatie });
      }
      if (!extern && profiel.methode !== 'extern') {
        meld('attentie', `Rekenindicatie volgens de methode van ${profiel.kort}; vul de ontbrekende gegevens van het beleid aan voor de volledige toets.`);
      }
    }
  }
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
  // Bij een rekenindicatie zonder eigen uitsplitsing: de jaarinkomens en de box 2-component uit de NHG-rekenkern,
  // zodat de rekenvelden (box 1, box 2, jaren) gevuld zijn.
  const zonderSplitsing = grondslag.box1 === undefined && grondslag.box2 === undefined && Number.isFinite(indicatie);
  const splitsen = viaIndicatie || zonderSplitsing;
  const box2Indicatie = splitsen && Number.isFinite(nhg?.inkomen?.box2) ? Math.max(0, Math.min(nhg.inkomen.box2, indicatie)) : 0;
  const perJaarGrondslag = grondslag.perJaar && Object.keys(grondslag.perJaar).length ? grondslag.perJaar : null;
  return {
    methode: extern ? 'extern' : grondslag.methode || (profiel.methode === 'extern' ? 'eigen' : profiel.methode),
    bedrag, indicatie, stappen, checks, bewijs,
    box1: grondslag.box1 ?? (splitsen ? rond(indicatie - box2Indicatie) : undefined),
    box2: grondslag.box2 ?? (splitsen ? rond(box2Indicatie) : undefined),
    rc: grondslag.rc,
    ...(grondslag.vervanging ? { vervanging: grondslag.vervanging } : {}),
    versie: grondslag.versie || profiel.versie,
    bronUrl: grondslag.bronUrl || profiel.bronUrl,
    perJaar: perJaarGrondslag || (splitsen && nhg?.inkomen?.perJaar ? { ...nhg.inkomen.perJaar } : {}),
    documenten: grondslag.documenten ?? (typeof profiel.documenten === 'function' ? profiel.documenten({ ctx, dossier, invoer }) : profiel.documenten),
  };
}
