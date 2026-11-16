import { balansOntbreekt, heeftBedrag, heeftBalans, heeftResultaatinvoer, heeftResultaatVoorBelasting, voorraadTotaal } from './financieel.js';
import { soortOndernemer } from './kaders.js';
import { addMonthsISO, days360, nhgKwartaaltermijn, opOfNa, parseISO } from './periods.js';
import { num } from '../util.js';

const LABELS = {
  ev: 'Eigen vermogen', bt: 'Balanstotaal', va: 'Vlottende activa', kvv: 'Kort vreemd vermogen',
  voorraad: 'Voorraad en onderhanden werk', nettowinst: 'Resultaat uit de jaarcijfers',
  resultaatVoorBelasting: 'Resultaat vóór belasting', sfw: 'Saldo fiscale winst', loon: 'Bruto DGA-loon',
  dividend: 'Bruto uitgekeerd dividend', status: 'Status en periode boekjaar', tot: 'Einddatum cijfers',
  row: 'Netto resultaat uit overige werkzaamheden', voorStart: 'Loon vóór start onderneming',
};

const gevuld = (waarde) => String(waarde ?? '').trim() !== '';
const periodeEind = (y, jd) => jd?.tot || `${y}-12-31`;
const periodeBegin = (y, jd) => jd?.van || `${y}-01-01`;
const definitief = (jd) => !jd?.status || jd.status === 'definitief';
const kalenderjaar = (y, jd) => periodeBegin(y, jd) === `${y}-01-01` && periodeEind(y, jd) === `${y}-12-31`;
const geldigeDatum = (datum) => /^\d{4}-\d{2}-\d{2}$/.test(datum || '') && Number.isFinite(Date.parse(datum))
  && new Date(datum).toISOString().slice(0, 10) === datum;

/**
 * Te controleren invoer voor de actieve route. Bedragen uit bewijsstukken en eigen rekenindicaties
 * blijven afzonderlijk onderbouwd. Een ingevulde 0 telt mee als geregistreerd bedrag.
 */
export function rekenInvoerStatus(d, r) {
  const dossier = [];
  const onds = d.ondernemingen || [];
  const ondernemingen = onds.map((o) => ({ id: o.id, naam: o.naam || 'Onderneming', jaren: [], punten: [] }));
  const byId = new Map(ondernemingen.map((o) => [o.id, o]));
  const analyses = new Map((r.ondernemingen || []).map((a) => [a.id, a]));
  const T = r.T || [];
  const T3 = T.at(-1);
  const C = r.C ?? (T3 + 1);
  const kader = r.kader;
  const dgaGezamenlijk = kader === 'ABN' ? r.inkomen?.dgaGezamenlijk : null;
  const p = d.beleidsinvoer?.[kader] || {};
  const achmea = ['ATTENS', 'SYNTRUS'].includes(kader);
  const tulpBunq = ['TULP', 'BUNQ'].includes(kader);
  const vpb = (o) => soortOndernemer(o.rechtsvorm) === 'VPB';
  const actief = onds.filter((o) => o.actief !== false && o.meenemen !== false && !o.nulInkomen
    && analyses.get(o.id)?.meenemen !== false && !o.geconsolideerd);
  const nhgBasis = r.beleid?.methode === 'nhg' || ['NIBC', 'MERIUS'].includes(kader)
    || (kader === 'MUNT' && actief.every((o) => !vpb(o)));
  const jaarBron = (o, y) => o.jaren?.[y] || {};
  const ib = (o, y) => d.ib?.[y]?.perOnd?.[o.id] || {};
  const analyseJaar = (o, y) => analyses.get(o.id)?.jaren?.[y];
  const pLabel = (key) => r.kaderCfg?.beleid?.extraVelden?.find((x) => x.key === key)?.label || key;
  const beleidsveld = (key, melding, { label = pLabel(key), blokkeert = false } = {}) =>
    dossier.push({ key, label, paneel: 'klant', bind: `beleidsinvoer.${kader}.${key}`, melding, blokkeert });
  const klantveld = (key, label, melding, bind = key, blokkeert = false) =>
    dossier.push({ key, label, paneel: 'klant', bind, melding, blokkeert });
  const dossierBedrag = (key, jaren, melding) => {
    const ontbreekt = jaren.filter((y) => !heeftBedrag(d.ib?.[y]?.[key]));
    if (ontbreekt.length) dossier.push({
      key, label: LABELS[key], paneel: 'invoer', bind: `ib.${ontbreekt[0]}.${key}`, jaren: ontbreekt, melding, blokkeert: true,
    });
  };
  const voegToe = (o, key, jaren, bind, melding, blokkeert = false) => {
    if (!jaren.length) return;
    const groep = byId.get(o.id);
    const bestaand = groep.punten.find((punt) => punt.key === key);
    if (bestaand) {
      bestaand.jaren = [...new Set([...bestaand.jaren, ...jaren])].sort();
      bestaand.blokkeert ||= blokkeert;
    } else {
      groep.punten.push({ key, label: LABELS[key], jaren, paneel: 'invoer', bind, melding, blokkeert });
    }
    groep.jaren = [...new Set([...groep.jaren, ...jaren])].sort();
  };
  const ibBedrag = (o, key, jaren, melding, blokkeert = true) => {
    const openJaren = jaren.filter((y) => !heeftBedrag(ib(o, y)[key]));
    voegToe(o, key, openJaren, `ib.${openJaren[0]}.perOnd.${o.id}.${key}`, melding, blokkeert);
  };
  const jaarveld = (o, key, jaren, melding, blokkeert = false) =>
    voegToe(o, key, jaren, `ond:${o.id}.jaren.${jaren[0]}.${['status', 'tot'].includes(key) ? key : `bzi.${key}`}`, melding, blokkeert);
  const resultaat = (o, jaren, melding, blokkeert = false) =>
    jaarveld(o, 'nettowinst', jaren.filter((y) => !heeftResultaatinvoer(jaarBron(o, y))), melding, blokkeert);
  const balans = (o, jaren, melding) => {
    const ontbrekend = new Map();
    for (const y of jaren) {
      for (const key of balansOntbreekt(jaarBron(o, y))) {
        ontbrekend.set(key, [...(ontbrekend.get(key) || []), y]);
      }
    }
    ontbrekend.forEach((ys, key) => jaarveld(o, key, ys, melding));
  };
  const toetsperiode = (o, jaren, voldoet = kalenderjaar) => {
    const openJaren = jaren.filter((y) => !definitief(jaarBron(o, y)) || !voldoet(y, jaarBron(o, y)));
    jaarveld(o, 'status', openJaren, 'Controleer of de cijfers een volledig, definitief toetsjaar betreffen.', true);
  };
  const fiscaal = (o, jaren = T) => {
    ibBedrag(o, 'sfw', jaren, 'Neem het saldo over uit de ingediende IB-aangifte voor elk toetsjaar.');
    toetsperiode(o, jaren);
  };
  const heeft36Maanden = (o) => {
    const start = o.startdatum || o.startActiviteiten;
    return parseISO(start) && r.datum >= addMonthsISO(start, 36);
  };

  if (dgaGezamenlijk?.blokkades.length) {
    const jaar = dgaGezamenlijk.ontbreekt[0] || T3;
    dossier.push({ key: 'dgaGezamenlijk', label: 'Gezamenlijk DGA-loon controleren', paneel: 'ib',
      bind: `ib.${jaar}.dgaGezamenlijk.loon`, jaren: dgaGezamenlijk.ontbreekt,
      melding: dgaGezamenlijk.blokkades.join(' '), blokkeert: true });
  }

  const bewijsVelden = ['ikvBedrag', 'ikvDatum', 'ikvOpsteller'];
  const bewijsBegonnen = r.kaderCfg?.beleid?.ikvOptioneel && bewijsVelden.some((key) => gevuld(p[key]));
  const extern = r.beleid?.methode === 'extern';
  if (r.soort !== 'NUL' && (extern || bewijsBegonnen) && !r.beleid?.bewijs) {
    const bewijs = [
      ['ikvBedrag', 'Toetsinkomen op het bewijsstuk', heeftBedrag(p.ikvBedrag) && num(p.ikvBedrag) >= 0],
      ['ikvDatum', 'Datum bewijsstuk', geldigeDatum(p.ikvDatum) && p.ikvDatum <= r.datum],
      ['ikvOpsteller', 'Opsteller van het bewijsstuk', gevuld(p.ikvOpsteller)],
    ];
    const onvolledig = bewijs.filter(([, , ok]) => !ok);
    for (const [key, label] of onvolledig.length ? onvolledig : bewijs.slice(1, 2)) {
      beleidsveld(key, 'Leg de geldige inkomensverklaring of bankbeoordeling vast.', { label, blokkeert: extern });
    }
  }

  if (r.soort === 'NUL') {
    for (const o of onds) {
      const y = analyses.get(o.id)?.laatsteBalansJaar ?? T3;
      balans(o, [y], 'Vul de laatst beschikbare balans aan voor de risicobeoordeling.');
      resultaat(o, [y], 'Vul het laatst beschikbare resultaat aan voor de risicobeoordeling.');
    }
  } else if (kader === 'RABO' && p.raboRoute === 'row') {
    if (!actief.length) dossierBedrag('row', T, 'Neem het netto resultaat per jaar over uit de IB-aangifte.');
  } else if (!onds.length) {
    klantveld('onderneming', 'Onderneming', 'Voeg een onderneming toe bij Klantgegevens.', '', true);
  } else {
    const zonderExterneRoute = !r.kaderCfg?.beleid || nhgBasis;
    if (zonderExterneRoute) {
      for (const o of actief) {
        const start = analyses.get(o.id)?.start || o.startActiviteiten || o.startdatum;
        const eersteJaar = Number(start?.slice(0, 4)) || 0;
        const jaren = T.filter((y) => y >= eersteJaar && jaarBron(o, y).meetellen !== false);
        const recent = jaren.slice(-1);
        if (vpb(o)) {
          if (!dgaGezamenlijk) ibBedrag(o, 'loon', jaren.filter((y) => !heeftBedrag(jaarBron(o, y).vw?.salarisDGA)), 'Neem het fiscale arbeidsinkomen uit de eigen onderneming over.');
        } else {
          resultaat(o, jaren.filter((y) => !heeftBedrag(ib(o, y).sfw)), 'Vul het resultaat uit de jaarcijfers of het saldo fiscale winst in.', true);
        }
        resultaat(o, recent, 'Vul het resultaat van het laatste toetsjaar aan voor de winsttoets.');
        balans(o, recent, 'Vul de balans aan voor liquiditeit en solvabiliteit.');
        const periode = nhgBasis || kader === 'NHG' ? nhgKwartaaltermijn(r.datum) : null;
        const verplicht = r.kaderCfg?.tussentijdsVerplichtVanaf;
        const periodeJaar = periode?.jaar ?? (verplicht && T3 === r.jaarNu - 1 && opOfNa(r.datum, verplicht.m, verplicht.d) ? r.jaarNu : null);
        if (periodeJaar && periodeJaar >= eersteJaar) {
          resultaat(o, [periodeJaar], 'Vul het resultaat over de gevraagde periode in voor de tussentijdse toets.');
        }
        if (r.C && r.C >= eersteJaar && vpb(o) && !dgaGezamenlijk) {
          ibBedrag(o, 'loon', [r.C].filter((y) => !heeftBedrag(jaarBron(o, y).vw?.salarisDGA)), 'Vul het gerealiseerde DGA-loon over de controleperiode in.', false);
        }
      }
    }
    if (kader === 'VENN') {
      const o = onds.find((x) => !x.parentId);
      const dochter = o && onds.find((x) => x.parentId === o.id);
      if (o && (vpb(o) ? o.rechtsvorm === 'BV' && (onds.length === 1 || (onds.length === 2 && dochter?.rechtsvorm === 'BV' && !(dochter.extraParents || []).length))
        : onds.length === 1 && ['EZ', 'VOF'].includes(o.rechtsvorm))) {
        if (!o.startdatum) klantveld('startdatum', 'Startdatum KvK', 'Venn toetst de KvK-inschrijfdatum.', `ond:${o.id}.startdatum`);
        ibBedrag(o, vpb(o) ? 'loon' : 'sfw', T, vpb(o) ? 'Neem het arbeidsinkomen uit de eigen onderneming over.' : 'Neem het saldo over uit de ingediende IB-aangifte.');
        const openJaren = T.filter((y) => {
          const j = analyseJaar(o, y);
          return j?.status === 'tussentijds' || j?.meegeteld === false
            || j?.van !== `${y}-01-01` || j?.tot !== `${y}-12-31`;
        });
        jaarveld(o, 'status', openJaren, 'Venn vraagt drie afgesloten, volledige en meegetelde kalenderjaren.', true);
        const huidigeGids = p.bronVersie !== '2025-10';
        const box2 = vpb(o) && (!dochter || dochter.geconsolideerd);
        const overwinst = box2 && p.overwinst === true;
        const recente = T.slice(1);
        balans(o, overwinst && huidigeGids ? T : recente, 'De Venn-ratio’s gebruiken de volledige balans.');
        const zonderVoorraad = recente.filter((y, i) => {
          const jd = jaarBron(o, y);
          const legacy = i === 0 ? p.voorraadMiddelste : p.voorraadLaatste;
          return !heeftBalans(jd.balans) && num(jd.bzi?.kvv) > 0 && voorraadTotaal(jd.bzi) === null && !heeftBedrag(legacy);
        });
        jaarveld(o, 'voorraad', zonderVoorraad, 'De quick ratio gebruikt voorraad en onderhanden werk. Voer 0 in als die post ontbreekt.');
        const dividend = box2 && T.some((y) => num(ib(o, y).dividend) > 0);
        if (box2) ibBedrag(o, 'dividend', T, 'Controleer bruto uitgekeerd dividend per jaar. Voer 0 in als er niets is uitgekeerd.', false);
        const winstjaren = overwinst || (dividend && huidigeGids) ? T : recente;
        if (vpb(o)) {
          const legacy = [p.vpbOudste, p.vpbMiddelste, p.vpbLaatste];
          const zonderWinst = winstjaren.filter((y) => {
            const jd = jaarBron(o, y);
            return !heeftResultaatVoorBelasting(jd) && !(heeftResultaatinvoer(jd) && heeftBedrag(legacy[T.indexOf(y)]));
          });
          jaarveld(o, 'resultaatVoorBelasting', zonderWinst, 'Vul resultaat vóór belasting in of combineer nettowinst met vennootschapsbelasting.');
        }
        if (opOfNa(r.datum, 7, 1)) {
          if (vpb(o)) {
            const jd = jaarBron(o, r.jaarNu);
            const ontbreekt = !heeftResultaatVoorBelasting(jd);
            jaarveld(o, 'resultaatVoorBelasting', ontbreekt ? [r.jaarNu] : [], 'Vul het gerealiseerde resultaat vóór belasting in voor de lopendejaarstoets.');
          } else {
            resultaat(o, [r.jaarNu], 'Vul het gerealiseerde resultaat in voor de lopendejaarstoets.');
          }
        }
        if (p.tussentijdsVervangen === true && opOfNa(r.datum, 8, 1)) {
          balans(o, [r.jaarNu], 'Tussentijdse vervanging vraagt een balans over dezelfde periode.');
          if (vpb(o)) ibBedrag(o, 'loon', [r.jaarNu], 'Vul het arbeidsinkomen over dezelfde periode in voor tussentijdse vervanging.');
        }
      }
      if (!gevuld(p.sector)) beleidsveld('sector', 'Leg de uitkomst van de Venn-sectorcontrole vast.');
      if (!gevuld(p.faillissement)) beleidsveld('faillissement', 'Leg vast of de aanvrager bij een eerder faillissement betrokken was.');
      if (!gevuld(p.verhuurInOnderneming)) beleidsveld('verhuurInOnderneming', 'Controleer of de gebruikte cijfers huurinkomsten bevatten.');
    }
    if (kader === 'ING' && !nhgBasis) {
      const hoofden = actief.filter((x) => !x.parentId);
      if (!['starter', 'drie'].includes(p.ondernemersduur) && hoofden.some((o) => !analyseJaar(o, T3)?.actief || !analyses.get(o.id)?.start)
        && !hoofden.some((o) => analyses.get(o.id)?.start && analyses.get(o.id).start <= `${T[0]}-01-01`)) {
        beleidsveld('ondernemersduur', 'Leg vast of de aanvrager drie volledige boekjaren ondernemer is.', { blokkeert: true });
      }
      for (const o of hoofden) {
        if (vpb(o)) {
          ibBedrag(o, 'loon', T, 'Neem het fiscale arbeidsinkomen uit de IB-aangiften over.', !heeftBedrag(p.arbeidsinkomenDga));
          resultaat(o, T, 'De jaarrapporten onderbouwen de bestendigheid van het DGA-inkomen.');
          balans(o, T, 'ING beoordeelt de balanspositie over de drie boekjaren.');
        } else if (['EZ', 'VOF', 'MTS'].includes(o.rechtsvorm)) {
          ibBedrag(o, 'sfw', T, 'Neem het saldo fiscale winst over uit de laatste drie ingediende IB-aangiften.');
        }
      }
    }
    if (kader === 'ING' && num(d.rc?.saldo) >= 17500) {
      if (!heeftBedrag(d.rc?.limiet) || num(d.rc.limiet) < num(d.rc.saldo)) {
        klantveld('rcLimiet', 'Limiet rekening-courant directie', 'Vul de overeengekomen limiet in voor de lastentoets.', 'rc.limiet');
      }
      if (!heeftBedrag(p.rcJaarlast)) beleidsveld('rcJaarlast', 'Vul de werkelijke jaarlast in zodat de minimumlast kan worden vergeleken.');
    }
    if (kader === 'ASR' && d.loondienst?.meenemen) {
      if (p.neveninkomenBestendig !== true) {
        beleidsveld('neveninkomenBestendig', 'Bevestig of loondienst en ondernemerschap bestendig gecombineerd worden.');
      }
      if (num(d.loondienst.actueelPct) >= 80 && !heeftBedrag(d.loondienst.loonJaar)) {
        klantveld('loonJaar', 'Jaarloon in loondienst', 'Vul het jaarloon in voor de toets naast ondernemerschap.', 'loondienst.loonJaar');
      }
    }
    if (kader === 'RABO' && p.raboRoute === 'minderheid' && actief.length === 1 && vpb(actief[0])) {
      const o = actief[0];
      if (!heeftBedrag(p.raboBelangSamen)) beleidsveld('raboBelangSamen', 'Leg het hoogste gecombineerde belang of zeggenschap vast.', { blokkeert: true });
      if (heeftBedrag(p.raboBelangSamen) && num(p.raboBelangSamen) <= 25 && !o.zeggenschap) {
        if (!heeftBedrag(p.raboWerkgeversverklaring)) beleidsveld('raboWerkgeversverklaring', 'Neem het jaarinkomen over uit de werkgeversverklaring.', { blokkeert: true });
        if (p.raboDividend === true) {
          ibBedrag(o, 'dividend', T, 'Vul het bruto dividend van de huidige werkgever in, ook als het bedrag 0 was.');
          if (p.raboZelfdeWerkgever !== true) beleidsveld('raboZelfdeWerkgever', 'Bevestig uitkering door dezelfde huidige werkgever in elk toetsjaar.', { blokkeert: true });
        }
      }
    } else if (kader === 'RABO' && p.raboRoute !== 'minderheid' && actief.length && actief.every((o) => !vpb(o))) {
      for (const o of actief) {
        if (!heeft36Maanden(o)) continue;
        resultaat(o, T, 'Voor de indicatie zijn de resultaten uit drie volledige jaarrekeningen nodig.', true);
        toetsperiode(o, T, (y, jd) => {
          const j = analyseJaar(o, y);
          return j?.actief && days360(j.van || periodeBegin(y, jd), j.tot || periodeEind(y, jd)) === 360;
        });
      }
    }
    if (kader === 'NIBC' && p.nibcMethode && p.nibcMethode !== 'standaard') {
      for (const o of actief) {
        resultaat(o, T, 'De gekozen afwijking gebruikt drie volledige jaarrekeningen.', true);
        toetsperiode(o, T, (y, jd) => {
          const j = analyseJaar(o, y);
          return j?.actief && days360(j.van || periodeBegin(y, jd), j.tot || periodeEind(y, jd)) === 360;
        });
      }
      if (p.nibcMethode === 'ratios' && num(p.nibcHypotheekbedrag) <= 0) {
        beleidsveld('nibcHypotheekbedrag', 'Voer het hypotheekbedrag exclusief overbrugging in.', { blokkeert: true });
      }
    }
    if (kader === 'MUNT') {
      for (const o of actief.filter(heeft36Maanden)) balans(o, [T3], 'MUNT gebruikt de laatste balans voor de solvabiliteitstoets.');
    }

    const [enige] = actief.length === 1 ? actief : [];
    if (kader === 'SYNTRUS' && !gevuld(p.kanaal)) beleidsveld('kanaal', 'Kies het kanaal voor rechtstreekse beoordeling of via volmacht.', { blokkeert: true });
    if (enige && !vpb(enige) && achmea && (kader === 'ATTENS' || (p.kanaal === 'direct' && p.raadhuys !== true))) {
      if (p.gelijkeActiviteiten !== true) beleidsveld('gelijkeActiviteiten', 'Bevestig de bedrijfsactiviteiten over de drie toetsjaren.', { blokkeert: true });
      if (p.bijtellingGecontroleerd !== true) beleidsveld('bijtellingGecontroleerd', 'Controleer eventuele autobijtelling over de toetsjaren.');
      if (p.balansBeoordeeld !== true) beleidsveld('balansBeoordeeld', 'Leg de beoordeling van liquiditeit, solvabiliteit en eigen vermogen vast.');
      fiscaal(enige);
      balans(enige, [T3], 'Gebruik de laatste balans voor de beoordeling van vermogen en liquiditeit.');
    }
    if (enige && kader === 'LLOYDS' && enige.rechtsvorm !== 'NV') {
      if (vpb(enige)) {
        ibBedrag(enige, 'loon', T, 'Neem het uitbetaalde DGA-loon per jaar over.');
        if (p.gezamenlijkVolledigBelang === true) ibBedrag(enige, 'dividend', T, 'Neem het bruto uitgekeerde dividend per toetsjaar over.');
        toetsperiode(enige, T);
      } else fiscaal(enige);
      balans(enige, [T3], 'Lloyds beoordeelt de laatste balans.');
      if (p.balansBeoordeeld !== true) beleidsveld('balansBeoordeeld', 'Bevestig de beoordeling van de liquiditeit en solvabiliteit.');
    }
    if (enige && !vpb(enige) && (kader === 'DYNAMIC' || (kader === 'NN' && heeft36Maanden(enige)))) {
      fiscaal(enige);
      if (kader === 'DYNAMIC') {
        if (p.verhuurDoel !== true) beleidsveld('verhuurDoel', 'Bevestig dat de hypotheek bedoeld is voor verhuur.');
        if (!heeftBedrag(p.actueelJaarinkomen)) beleidsveld('actueelJaarinkomen', 'Leg het actuele jaarinkomen vast voor de vergelijking.');
      }
    }
    if (enige && !vpb(enige) && tulpBunq) {
      if (heeft36Maanden(enige) && kader === 'BUNQ' && p.gewogen === true) fiscaal(enige);
      if (!heeft36Maanden(enige) && T3 === Number((enige.startdatum || enige.startActiviteiten)?.slice(0, 4))) {
        fiscaal(enige, [T3]);
        dossierBedrag('voorStart', T.slice(0, 2), 'Vul het looninkomen in over de twee jaren vóór de start.');
        if (!heeftBedrag(p.actueelJaarinkomen)) beleidsveld('actueelJaarinkomen', 'Leg het actuele jaarinkomen vast voor de vergelijking.');
      }
    }
    for (const o of actief) {
      const jaar = kader === 'VENN' && opOfNa(r.datum, 7, 1) ? r.jaarNu : C;
      const bron = jaarBron(o, jaar);
      if (jaar > T3 && (heeftResultaatVoorBelasting(bron) || heeftResultaatinvoer(bron) || (vpb(o) && heeftBedrag(ib(o, jaar).loon)))
        && (!geldigeDatum(bron.tot) || bron.tot < periodeBegin(jaar, bron) || bron.tot > r.datum)) {
        jaarveld(o, 'tot', [jaar], 'Geef aan tot welke datum de gerealiseerde cijfers of het DGA-loon lopen.');
      }
    }
  }

  return { ondernemingen, dossier };
}

export const invoerBehoefte = rekenInvoerStatus;
