import { METHODE_LABEL } from './beleid.js';
import { heeftBalans, heeftBedrag, heeftResultaatinvoer, heeftResultaatVoorBelasting, totalenJaar, voorraadTotaal } from './financieel.js';
import { bereken, vergelijkDossierVoorKader } from './index.js';
import { KADERS, PARAM_LABELS, leesPad, solvNorm } from './kaders.js';
import { rekenInvoerStatus } from './reken-invoer.js';

const bedrag = (waarde) => heeftBedrag(waarde) ? Number(waarde) : null;
const ingevuld = (waarde) => typeof waarde === 'boolean' || (typeof waarde === 'string' && waarde.trim() !== '') || Number.isFinite(waarde);
const bedragType = (type) => type === 'bedrag' ? 'eur' : type;

function dossierinvoer(d, r, jaren) {
  const uit = [];
  const voeg = (label, waarde, type, extra = {}) => {
    if (ingevuld(waarde)) uit.push({ label, waarde, type, ...extra });
  };
  const bron = new Map((d.broncontrole?.velden || []).map(({ pad, jaar, ondId, bestand, locatie }) => [`${ondId || ''}|${jaar}|${pad}`, [bestand, locatie].filter(Boolean).join(' · ')]));
  const herkomst = (id, jaar, pad, anders) => bron.get(`${id || ''}|${jaar}|${pad}`) || anders;
  const ondernemingen = new Map((d.ondernemingen || []).map((o) => [o.id, o]));
  for (const a of r.ondernemingen) {
    const o = ondernemingen.get(a.id);
    const meta = { ondId: a.id, onderneming: a.naam, herkomst: 'Ondernemingsgegevens' };
    voeg('Rechtsvorm', a.rechtsvormKort, 'tekst', { ...meta, pad: `ond:${a.id}.rechtsvorm` });
    voeg('Startdatum onderneming', o?.startdatum || o?.startActiviteiten, 'datum', { ...meta, pad: `ond:${a.id}.startdatum` });
    voeg('Ondernemersduur', a.start ? a.maandenOndernemer : null, 'getal', { ...meta, herkomst: 'Afgeleid van de startdatum' });
    voeg('Belang in de onderneming', heeftBedrag(o?.aandeelPct) ? Number(o.aandeelPct) / 100 : null, 'pct', { ...meta, pad: `ond:${a.id}.aandeelPct` });
  }
  for (const jaar of jaren) {
    const ib = d.ib?.[jaar] || {};
    const gezamenlijk = ib.dgaGezamenlijk;
    voeg('Gezamenlijk bruto DGA-loon', bedrag(gezamenlijk?.loon), 'eur', { jaar, pad: `ib.${jaar}.dgaGezamenlijk.loon`,
      herkomst: herkomst('', jaar, `ib.${jaar}.dgaGezamenlijk.loon`, 'Aanvragerniveau · uitsplitsing per vennootschap vereist waar van toepassing') });
    voeg('Bijtelling bij gezamenlijk DGA-loon', bedrag(gezamenlijk?.bijtelling), 'eur', { jaar, pad: `ib.${jaar}.dgaGezamenlijk.bijtelling`,
      herkomst: herkomst('', jaar, `ib.${jaar}.dgaGezamenlijk.bijtelling`, 'Aanvragerniveau') });
    for (const [key, label] of [['voorStart', 'Loon vóór start onderneming'], ['naast', 'Loon naast onderneming'], ['uitkeringen', 'Uitkeringen'], ['row', 'Resultaat uit overige werkzaamheden']]) {
      voeg(label, bedrag(ib[key]), 'eur', { jaar, pad: `ib.${jaar}.${key}`, herkomst: 'IB-invoer' });
    }
    for (const a of r.ondernemingen) {
      const o = ondernemingen.get(a.id);
      const j = o?.jaren?.[jaar];
      const jaardata = a.jaren?.[jaar];
      if (!jaardata?.actief) continue;
      const perOnd = ib.perOnd?.[a.id];
      const meta = { jaar, ondId: a.id, onderneming: a.naam };
      const voegJaar = (label, waarde, type, pad, anders, bronPad = pad) => voeg(label, waarde, type,
        { ...meta, pad, herkomst: herkomst(a.id, jaar, bronPad, anders) });
      for (const [key, label] of [['sfw', 'Saldo fiscale winst'], ['loon', 'Bruto DGA-loon'], ['bijtelling', 'Bijtelling auto'], ['dividend', 'Bruto uitgekeerd dividend']]) {
        const pad = `ib.${jaar}.perOnd.${a.id}.${key}`;
        voegJaar(label, bedrag(perOnd?.[key]), 'eur', pad, 'IB-invoer');
      }
      if (!j) continue;
      const totalen = totalenJaar(j);
      const pad = `ond:${a.id}.jaren.${jaar}`;
      const jaarcijfer = (label, waarde, key) => voegJaar(label, waarde, 'eur', `${pad}.bzi.${key}`, 'Jaarcijfers', `bzi.${key}`);
      const resultaat = heeftResultaatinvoer(j);
      jaarcijfer('Omzet', heeftBedrag(j.bzi?.omzet) || heeftBedrag(j.vw?.omzet) ? totalen.vw.OMZET : null, 'omzet');
      jaarcijfer('Nettowinst', resultaat ? totalen.vw.NW : null, 'nettowinst');
      jaarcijfer('Resultaat vóór belasting', heeftResultaatVoorBelasting(j) ? totalen.vw.RVB : null, 'resultaatVoorBelasting');
      if (heeftBalans(j.balans)) {
        for (const [label, col] of [['Eigen vermogen', 'EV'], ['Balanstotaal', 'TA'], ['Vlottende activa', 'VA'], ['Kort vreemd vermogen', 'KVV']]) {
          voegJaar(label, totalen.bal[col], 'eur', `${pad}.balans`, 'Totaal uit ingevoerde balansposten');
        }
      } else {
        for (const [label, key] of [['Eigen vermogen', 'ev'], ['Balanstotaal', 'bt'], ['Vlottende activa', 'va'], ['Kort vreemd vermogen', 'kvv']]) jaarcijfer(label, bedrag(j.bzi?.[key]), key);
      }
      const voorraadBekend = heeftBedrag(j.balans?.voorraden) || heeftBedrag(j.balans?.onderhandenWerk);
      jaarcijfer('Voorraad en onderhanden werk', heeftBalans(j.balans) ? voorraadBekend ? totalen.bal.VOORRADEN : null : voorraadTotaal(j.bzi), 'voorraad');
      voegJaar('Bruto DGA-loon volgens W&V', bedrag(j.vw?.salarisDGA), 'eur', `${pad}.vw.salarisDGA`, 'Winst-en-verliesrekening');
      voegJaar('Geldstroom dividend naar privé', bedrag(j.geldstromen?.dividendPriveBruto), 'eur', `${pad}.geldstromen.dividendPriveBruto`, 'Geldstroominvoer', 'geldstromen.dividendPriveBruto');
      voegJaar('Totaal ontvangen dividend', bedrag(j.geldstromen?.totaalOntvangenDividend), 'eur', `${pad}.geldstromen.totaalOntvangenDividend`, 'Geldstroominvoer', 'geldstromen.totaalOntvangenDividend');
      voegJaar('Contractuele aflossingen lang vreemd vermogen', bedrag(j.div?.aflossingenLVV), 'eur', `${pad}.div.aflossingenLVV`, 'Jaarcijfers', 'div.aflossingenLVV');
      if (r.C === jaar && j.tot) voegJaar('Einddatum gerealiseerde cijfers', j.tot, 'datum', `${pad}.tot`, 'Dossierinvoer', 'tot');
    }
  }
  for (const [label, pad] of [['Saldo rekening-courant directie', 'rc.saldo'], ['Kredietlimiet rekening-courant directie', 'rc.limiet'],
    ['Contractuele termijn lening directie', 'leningDirectie.termijn'], ['Jaarloon in loondienst', 'loondienst.loonJaar']]) {
    voeg(label, bedrag(leesPad(d, pad)), 'eur', { pad, herkomst: 'Klantgegevens' });
  }
  const gegevens = d.beleidsinvoer?.[r.kader] || {};
  for (const { key, label, type, opties, standaard } of r.kaderCfg.beleid?.extraVelden || []) {
    const waarde = gegevens[key] ?? standaard;
    const percentage = key === 'raboBelangSamen' && heeftBedrag(waarde);
    const getoond = percentage ? Number(waarde) / 100 : opties?.[waarde] ?? waarde;
    voeg(label, getoond, percentage ? 'pct' : bedragType(type), { pad: `beleidsinvoer.${r.kader}.${key}`, herkomst: ingevuld(gegevens[key]) ? 'Beleidsinvoer' : 'Standaard voor dit kader' });
  }
  const bewijs = r.beleid?.bewijs;
  if (bewijs) {
    voeg('Inkomen op inkomensverklaring of bankbeoordeling', bewijs.bedrag, 'eur', { herkomst: bewijs.opsteller });
    voeg('Datum inkomensverklaring of bankbeoordeling', bewijs.datum, 'datum', { herkomst: bewijs.opsteller });
  }
  return uit;
}

function parametersVoor(r) {
  const k = r.kaderCfg;
  const parameters = [];
  const voeg = (label, waarde, type, toelichting = '') => {
    if (ingevuld(waarde)) parameters.push({ label, waarde, type, toelichting });
  };
  const rekenkeuzes = r.rekenkeuzes;
  voeg('Controlejaar meegenomen', rekenkeuzes?.controlejaar?.actief, 'bool');
  if (rekenkeuzes?.vervanging?.beschikbaar) voeg('Oudste jaar vervangen', rekenkeuzes.vervanging.toegepast, 'bool', rekenkeuzes.vervanging.reden);
  if (rekenkeuzes?.abnVaststelling) voeg('ABN AMRO-bronmethode', rekenkeuzes.abnVaststelling.methode === 'verticaal' ? 'Verticaal' : 'Horizontaal', 'tekst');
  if (k.beleid) {
    voeg('Minimale ondernemersduur van dit profiel', k.beleid.minMaanden, 'getal', 'In maanden');
    voeg('Maximale geldigheid verklaring', k.beleid.ikvGeldigheid, 'getal', 'In maanden');
    const routes = r.beleid?.stappen || [];
    if (k.id === 'VENN' && routes.some((s) => s.label === 'Gewogen inkomen')) {
      voeg('Weging toetsjaren', '1-2-3', 'tekst');
    }
    if (k.id === 'NIBC' && routes.some((s) => s.label === 'Maximum van 120% van de NHG-basis')) {
      voeg('Maximum ten opzichte van de NHG-basis', 1.20, 'pct');
    }
  } else {
    voeg('Minimale ondernemersduur', k.minMaandenKvK, 'getal', 'In maanden');
    voeg('Minimum Current ratio', k.liquiditeitMin, 'ratio');
    const soorten = [...new Set(r.ondernemingen.map((a) => a.soort))];
    for (const soort of soorten) voeg(`Norm solvabiliteit · ${soort === 'VPB' ? 'DGA' : 'IB'}`, solvNorm(k, soort), 'pct');
    voeg('Minimum belang', k.minBelang, 'pct');
    voeg('Solvabiliteit bij dubbele balanstoets', k.dbt?.solvNorm, 'pct');
    voeg('Minimale duur voor box 2', k.box2?.minMaanden, 'getal', 'In maanden; toepasselijkheid hangt af van de box 2-route.');
    const instelbaar = new Set(k.instelbaar || []);
    for (const pad of [...instelbaar, ...Object.keys(PARAM_LABELS).filter((x) => !instelbaar.has(x) && leesPad(k, x) !== undefined)]) {
      const [label, type] = PARAM_LABELS[pad];
      voeg(label, leesPad(k, pad), type, Object.hasOwn(k.aangepast || {}, pad) ? 'Dossierinstelling' : 'Kaderinstelling');
    }
  }
  return parameters;
}

function rekenstappen(r) {
  const beleid = r.beleid;
  const profielStappen = beleid?.stappen.map(({ label, formule, waarde }) => ({ label, formule, uitkomst: waarde ?? null,
    type: Number.isFinite(waarde) ? 'eur' : 'tekst' })) || [];
  const secties = (r.trace?.secties || []).filter((s) => s.groep === 'inkomen');
  const uitTrace = beleid ? beleid.methode === 'nhg' ? secties.slice(1) : [] : secties;
  const stappen = [...profielStappen, ...uitTrace.flatMap((s) => s.rijen.flatMap((rij) => {
    const uitvoer = Object.entries(rij.cellen || {}).filter(([, c]) => ingevuld(c?.w) || !!c?.f).map(([kolom, c]) => ({
      label: rij.label, groep: s.titel, kolom: s.kolomLabels[kolom] || kolom, formule: c.f || s.formule, uitkomst: c.w ?? null, type: c.opmaak,
    }));
    return uitvoer.length ? uitvoer : rij.tekst ? [{ label: rij.label, groep: s.titel, formule: rij.tekst, uitkomst: null, type: 'tekst' }] : [];
  }))];
  const abn = r.inkomen?.abnBronVergelijking;
  if (!abn || !Number.isFinite(abn.horizontaal)) return stappen;
  const groep = 'ABN AMRO · bronwerkmap';
  for (const [label, formule, uitkomst] of [
    ['Gezamenlijk DGA-loon', 'Laagste van het gemiddelde en het laatste jaar', abn.dga],
    ['Uitgekeerd dividend', 'Laagste van het gemiddelde, het laatste jaar en het winstplafond', abn.uitgekeerd],
    ['Niet-uitgekeerde winst', 'Begrensd op het laatste jaar, het resterende winstplafond en de beschikbare uitkeringsruimte als die optie is gekozen', abn.nietUitgekeerd],
    ['Horizontale bronvergelijking', 'Tel de afzonderlijk begrensde inkomenscomponenten op', abn.horizontaal],
    ['Verticale bronvergelijking', 'Laagste van de gemiddelde en de laatste-jaaruitkomst na begrenzing per kolom', abn.verticaal],
  ]) {
    if (Number.isFinite(uitkomst)) stappen.push({ label, groep, formule, uitkomst, type: 'eur' });
  }
  return stappen;
}

/** Herleidbare gegevens van de berekende route. Ontbrekende invoer en bronbedragen blijven afzonderlijk zichtbaar. */
export function rekenGrondslag(d, r = bereken(d)) {
  const jaren = r.C ? [...r.T, r.C] : r.T;
  const k = r.kaderCfg;
  const beleid = r.beleid;
  const ontbreekt = rekenInvoerStatus(d, r);
  const open = [...ontbreekt.dossier, ...ontbreekt.ondernemingen.flatMap((o) => o.punten.map((p) => ({ ...p, onderneming: o.naam, ondId: o.id })))];
  const blokkeert = open.some((p) => p.blokkeert) || r.bron === 'open' || r.inkomensanalyse;
  const referentie = r.inkomen?.abnVaststelling ?? null;
  const basis = beleid ? beleid.perJaar : r.inkomen?.perJaar;
  const perJaar = jaren.filter((jaar) => Number.isFinite(basis?.[jaar]) && (beleid || !blokkeert)).map((jaar) => ({
    jaar, waarde: basis[jaar], type: 'eur', controlejaar: jaar === r.C,
  }));
  return {
    kader: r.kader, methode: beleid?.methode || 'eigen', methodeLabel: METHODE_LABEL[beleid?.methode || 'eigen'],
    status: r.status, bron: { titel: k.bron, url: beleid?.bronUrl || k.bronUrl || '', versie: r.kaderVersie, status: k.bronStatus },
    peildatum: r.datum, jaren, perJaar, invoer: dossierinvoer(d, r, jaren), parameters: parametersVoor(r),
    stappen: rekenstappen(r), regels: k.regels || [], aannames: k.aannames || [], ontbreekt: open,
    voorwaarden: beleid?.checks || [],
    uitkomst: {
      berekend: beleid ? bedrag(beleid.indicatie) : blokkeert ? null : bedrag(r.berekend),
      toetsinkomen: beleid ? (beleid.bewijs && r.status !== 'niet_akkoord' ? bedrag(beleid.bedrag) : null) : blokkeert ? null : bedrag(r.toetsinkomen),
      vastgesteld: beleid && !beleid.bewijs || blokkeert ? null : bedrag(r.vastgesteld),
      indicatie: beleid ? bedrag(beleid.indicatie) : null, bewijs: beleid?.bewijs ?? null, referentie,
      open: blokkeert || (beleid?.methode === 'extern' && !beleid.bewijs),
    },
  };
}

export function rekenGrondslagVoorKader(dossier, kader) {
  if (!Object.hasOwn(KADERS, kader)) throw new Error('Onbekend toetskader.');
  return rekenGrondslag(vergelijkDossierVoorKader(dossier, kader));
}
