import { addMonthsISO, days360, parseISO } from './periods.js';
import { fmt, gemiddelde, isIngevuld, num, rond } from '../util.js';

const RABO_BELEID = 'https://media.rabobank.com/asset/8459b3ed-b9e7-4823-8025-b64fcb3f2a56/Acceptatiebeleid-Rabobank-november-2026.pdf';
const RABO_INDICATIE = 'https://www.rabobank.nl/bedrijven/intermediairs/hypotheek/ondernemer-in-prive/indicatieve-inkomenstool/gebruik-indicatieve-inkomenstool';
const NIBC_GIDS = 'https://nibc.nl/media/zzqnjuq1/hypotheekgids-2026.pdf';
const NIBC_WERKINSTRUCTIE = 'https://nibc.nl/media/pidhezud/werkinstructie_toetsinkomen_ondernemers-202601.pdf';
const IKV_RABO = { categorie: 'ikv', naam: 'Inkomensverklaring of nulverklaring', wanneer: 'Rabobank of een geaccepteerde rekenexpert volgens het aanvraagkanaal', geldigheid: '6 maanden' };
const IKV_NIBC = { categorie: 'ikv', naam: 'Inkomensverklaring van een geaccrediteerde rekenexpert', wanneer: 'Bij inkomen uit onderneming' };

const stap = (label, formule, waarde) => ({ label, formule, waarde });
const melding = (tekst, status = 'attentie') => ({ status, tekst });
const geldigBedrag = (x) => isIngevuld(x) && Number.isFinite(Number(x));
const euro = (x) => fmt.eur(x);
const laagste = (grenzen) => `Laagste van ${grenzen.map(euro).join(', ')}`;
const gemiddeldeFormule = (reeks) => `(${reeks.map(euro).join(' + ')}) / ${reeks.length}`;
const gewogenFormule = (reeks) => `(${euro(reeks[0])} + 2 × ${euro(reeks[1])} + 3 × ${euro(reeks[2])}) / 6`;
const gewogen = (reeks) => (reeks[0] + 2 * reeks[1] + 3 * reeks[2]) / 6;

function volledigeJaren(a, jaren) {
  return jaren.length === 3 && jaren.every((jaar) => {
    const j = a.jaren[jaar];
    return j?.actief && j.status === 'definitief' && days360(j.van, j.tot) === 360 && j.heeftResultaatinvoer;
  });
}

function meegenomen(analyses, dossier) {
  const inactief = new Set((dossier.ondernemingen || []).filter((o) => o.actief === false).map((o) => o.id));
  return analyses.filter((a) => a.meenemen && !a.geconsolideerd && !inactief.has(a.id));
}

function brutoDividend(dossier, bedrijven, jaar) {
  const bedragen = bedrijven.map((a) => dossier.ib?.[jaar]?.perOnd?.[a.id]?.dividend);
  if (!bedragen.every(geldigBedrag)) return null;
  return bedragen.reduce((som, bedrag) => som + Number(bedrag), 0);
}

function berekenRabo({ dossier, analyses, ctx, nhg, invoer }) {
  const bedrijven = meegenomen(analyses, dossier).filter((a) => !a.isDeelneming);
  const { T } = ctx;
  const stappen = [];
  const checks = [];
  const resultaat = { bedrag: null, stappen, checks, extern: true, documenten: [IKV_RABO] };
  const geldigOpstellers = invoer.raboKanaal === 'direct' ? /^rabobank\b/i : /^(rabobank|raadhuys|zakelijk inkomen|overviewz|pentrax)\b/i;
  if (invoer.ikvOpsteller && !geldigOpstellers.test(String(invoer.ikvOpsteller).trim()) && !['minderheid', 'row'].includes(invoer.raboRoute)) {
    checks.push(melding('Controleer of de opsteller van de verklaring geaccepteerd wordt voor dit aanvraagkanaal.'));
  }
  if (dossier.soort === 'NUL') return resultaat;

  if (invoer.raboRoute === 'row') {
    resultaat.extern = invoer.nhg === true;
    const jaren = resultaat.extern ? nhg?.T || T : T;
    const row = jaren.map((jaar) => dossier.ib?.[jaar]?.row);
    resultaat.documenten = [
      { categorie: 'ib_aangifte', naam: 'IB-aangiften met netto resultaat uit overige werkzaamheden', wanneer: jaren.join(', '), aantal: 3 },
      { categorie: 'bankafschrift', naam: 'Rekeningafschrift met drie recente bijschrijvingen', wanneer: 'Ter onderbouwing van resultaat uit overige werkzaamheden' },
      ...(resultaat.extern ? [IKV_RABO] : []),
    ];
    if (bedrijven.length) {
      checks.push(melding('Er is ook inkomen uit onderneming geselecteerd. Beoordeel de ondernemingsinkomsten en het ROW elk in hun eigen route.'));
      return resultaat;
    }
    if (!row.every(geldigBedrag)) {
      checks.push(melding('Voer het netto resultaat uit overige werkzaamheden van elk van de drie jaren in. Gebruik 0 voor een aangifte zonder resultaat.'));
      return resultaat;
    }
    const reeks = row.map(Number);
    const gemiddeld = gemiddelde(reeks);
    const bedrag = Math.max(0, rond(Math.min(gemiddeld, reeks[2])));
    stappen.push(stap('Gemiddeld resultaat uit overige werkzaamheden', gemiddeldeFormule(reeks), rond(gemiddeld)));
    stappen.push(stap('ROW, maximaal het laatste kalenderjaar', laagste([gemiddeld, reeks[2]]), bedrag));
    return { ...resultaat, bedrag, perJaar: Object.fromEntries(jaren.map((jaar, i) => [jaar, reeks[i]])) };
  }

  if (invoer.raboRoute === 'minderheid') {
    const gecombineerd = invoer.raboBelangSamen;
    const eigenBelang = Math.max(0, ...bedrijven.map((a) => (a.belangEconomisch ?? a.aandeel ?? 0) * 100));
    if (bedrijven.length !== 1 || bedrijven[0].soort !== 'VPB') {
      checks.push(melding('Selecteer één VPB-onderneming voor de berekening met een werkgeversverklaring. Bij een gemengde structuur beoordeelt de rekenexpert de ondernemingsinkomsten.'));
      return resultaat;
    }
    if (!geldigBedrag(gecombineerd) || Number(gecombineerd) < 0 || Number(gecombineerd) < eigenBelang - 1e-6 || Number(gecombineerd) > 100) {
      checks.push(melding('Leg het hoogste percentage aandelenbelang of zeggenschap inclusief eventuele partner vast.'));
      return resultaat;
    }
    const bedrijf = (dossier.ondernemingen || []).find((o) => o.id === bedrijven[0].id);
    if (Number(gecombineerd) > 25 || bedrijf?.zeggenschap === true) {
      checks.push(melding('Bij meer dan 25% gecombineerd aandelenbelang of zeggenschap geldt de inkomensverklaring.'));
      return resultaat;
    }
    resultaat.extern = false;
    resultaat.documenten = [
      { categorie: 'werkgeversverklaring', naam: 'Werkgeversverklaring', wanneer: 'Directeur/aandeelhouder met ten hoogste 25% aandelenbelang en zeggenschap', geldigheid: '3 maanden' },
      { categorie: 'loonstrook', naam: 'Salarisoverzicht', wanneer: 'Bij de werkgeversverklaring', geldigheid: '3 maanden' },
    ];
    const loon = invoer.raboWerkgeversverklaring;
    if (!geldigBedrag(loon) || Number(loon) < 0) {
      checks.push(melding('Voer het jaarinkomen volgens de werkgeversverklaring in.'));
      return resultaat;
    }
    stappen.push(stap('Inkomen volgens werkgeversverklaring', 'Rabobank §3.1.2', Number(loon)));
    let dividend = 0;
    let perJaar;
    if (invoer.raboDividend === true) {
      resultaat.documenten.push(
        { categorie: 'dividendbeleid', naam: 'Aandeelhoudersverslag met dividendbeleid', wanneer: 'Bij meetellen van dividend' },
        { categorie: 'aandeelhouderschap', naam: 'Bewijs van aandeelhouderschap', wanneer: 'Bij meetellen van dividend' },
        { categorie: 'dividendbewijs', naam: 'Bewijs van ontvangen bruto dividend', wanneer: 'Drie jaren bij de huidige werkgever' },
      );
      const reeks = T.map((jaar) => brutoDividend(dossier, bedrijven, jaar));
      if (reeks.some((x) => x === null)) {
        checks.push(melding('Vul het ontvangen bruto dividend per jaar in op het tabblad IB-aangifte. Gebruik 0 bij een jaar zonder dividend.'));
        return resultaat;
      }
      if (invoer.raboZelfdeWerkgever !== true) {
        checks.push(melding('Bevestig dat het dividend in de drie jaren door de huidige werkgever is uitgekeerd.'));
        return resultaat;
      }
      dividend = reeks.every((x) => x > 0) ? rond(Math.min(...reeks)) : 0;
      perJaar = Object.fromEntries(T.map((jaar, i) => [jaar, reeks[i]]));
      stappen.push(stap('Meetellend bruto dividend', laagste(reeks), dividend));
    }
    const bedrag = rond(Number(loon) + dividend);
    stappen.push(stap('Totaal volgens de loondienstroute', `${euro(Number(loon))} + ${euro(dividend)}`, bedrag));
    return { ...resultaat, bedrag, perJaar };
  }

  if (invoer.nhg === true) {
    if (Number.isFinite(nhg?.toetsinkomen) && nhg.status !== 'niet_akkoord') {
      stappen.push(stap('Inkomen volgens NHG-basis', 'NHG Toetskaders IKV', nhg.toetsinkomen));
      return { ...resultaat, bedrag: nhg.toetsinkomen, perJaar: nhg.inkomen?.perJaar };
    }
    return resultaat;
  }
  if (!bedrijven.length || bedrijven.some((a) => !['EZ', 'VOF', 'MTS', 'CV'].includes(a.rechtsvorm) || !volledigeJaren(a, T))) return resultaat;
  const reeks = T.map((jaar) => bedrijven.reduce((som, a) => som + num(a.jaren[jaar].inkomen.totaal), 0));
  const bedrag = Math.max(0, rond(gemiddelde(reeks)));
  stappen.push(stap('Indicatief IB-inkomen', gemiddeldeFormule(reeks), bedrag));
  if (ctx.C && bedrijven.some((a) => days360(a.jaren[ctx.C]?.van, a.jaren[ctx.C]?.tot) >= 180 && a.jaren[ctx.C]?.heeftResultaatinvoer)) {
    checks.push(melding('Tussentijdse cijfers over ten minste een halfjaar kunnen bij groei worden beoordeeld door de inkomensspecialist.', 'info'));
  }
  return { ...resultaat, bedrag, perJaar: Object.fromEntries(T.map((jaar, i) => [jaar, reeks[i]])) };
}

function basisNIBC(nhg, kortZelfstandig, metNhg) {
  const externFactor = kortZelfstandig && !metNhg ? 0.9 : 1;
  const bedrag = nhg?.toetsinkomen;
  const stappen = [];
  if (Number.isFinite(bedrag)) stappen.push(stap('Inkomen volgens NHG-basis', 'NHG Toetskaders IKV', bedrag));
  if (externFactor < 1 && Number.isFinite(bedrag)) {
    stappen.push(stap('NIBC-afslag voor kort-zelfstandigen', `${euro(bedrag)} × 90%`, rond(bedrag * externFactor)));
  }
  return {
    bedrag: Number.isFinite(bedrag) ? rond(bedrag * externFactor) : null,
    stappen,
    checks: [],
    extern: true,
    externFactor,
    perJaar: nhg?.inkomen?.perJaar,
  };
}

function ruimteBijtelling(a, jaar, laatsteJaar) {
  const j = a.jaren[jaar];
  if (!j || (a.soort === 'VPB' && jaar !== laatsteJaar && !j.isC)) return 0;
  const bijtelling = Math.abs(num(j.ibOnd?.bijtelling));
  const inkomenZonderBijtelling = Math.max(0, num(j.inkomen.basis) - bijtelling);
  return Math.min(bijtelling, 0.2 * inkomenZonderBijtelling);
}

function gewogenBox2(a, T) {
  const box2 = a.box2;
  if (!box2?.toegestaan || box2.route === 'geen') return 0;
  const winst = T.map((jaar) => num(a.jaren[jaar]?.winst?.RVBcor));
  const capWinst = Math.max(0, Math.min(gewogen(winst), winst[2])) * a.aandeel;
  const dividend = T.map((jaar) => num(a.jaren[jaar]?.ibOnd?.dividend));
  const route1 = Math.max(0, Math.min(gewogen(dividend), dividend[2], capWinst));
  const o = box2.overwinst;
  const winstreserve = T.map((jaar) => num(o?.ow[jaar]));
  const grenzen = [gewogen(winstreserve), winstreserve[2], o?.dbt.max ?? 0, o?.owC ?? Infinity, o?.vrij ?? Infinity];
  const route2 = o?.toegestaan ? Math.max(0, Math.min(...grenzen)) * a.aandeel * (1 - o.afslag) : 0;
  if (box2.route === 'route1') return rond(route1);
  if (box2.route === 'route2') return rond(route2);
  return rond(Math.min(route1 + route2, capWinst * (1 - (o?.afslag ?? 0.25))));
}

function berekenNIBC({ dossier, analyses, ctx, nhg, invoer }) {
  const metNhg = invoer.nhg === true;
  const bedrijven = meegenomen(nhg?.ondernemingen || analyses, dossier);
  const T = nhg?.T || ctx.T;
  const C = nhg ? nhg.C : ctx.C;
  const aanboddatum = parseISO(invoer.nibcAanboddatum) ? invoer.nibcAanboddatum : ctx.datum;
  const heeft12Maanden = (a) => a.start && aanboddatum >= addMonthsISO(a.start, 12);
  const heeftMeerDan36Maanden = (a) => a.start && aanboddatum > addMonthsISO(a.start, 36);
  const kortZelfstandig = bedrijven.some((a) => heeft12Maanden(a) && aanboddatum < addMonthsISO(a.start, 36))
    || (bedrijven.some((a) => !volledigeJaren(a, T)) && T.some((jaar) => num(nhg?.inkomen?.persoonlijk?.[jaar]?.voorStart) > 0));
  const basis = basisNIBC(nhg, kortZelfstandig, metNhg);
  const { checks, stappen } = basis;
  if (invoer.ikvOpsteller && !/^(raadhuys|overviewz|pentrax|zakelijk inkomen|viiz)\b/i.test(String(invoer.ikvOpsteller).trim())) {
    checks.push(melding('Controleer of de IKV-opsteller op de actuele NIBC-lijst staat.'));
  }
  if (metNhg && /^viiz\b/i.test(String(invoer.ikvOpsteller || '').trim())) {
    checks.push(melding('Selecteer voor een NHG-aanvraag een opsteller die voor NHG bij NIBC wordt geaccepteerd.'));
  }
  if (dossier.soort === 'NUL') return { ...basis, bedrag: null };
  if (bedrijven.some((a) => !a.start)) {
    checks.push(melding('Vul de startdatum in om de duur op de datum van het bindend aanbod te toetsen.'));
    return { ...basis, bedrag: null };
  }
  if (bedrijven.some((a) => !heeft12Maanden(a))) {
    checks.push(melding('NIBC verlangt ten minste twaalf maanden actief ondernemerschap.', 'niet_akkoord'));
    return { ...basis, bedrag: null };
  }
  if (kortZelfstandig && !metNhg && !invoer.nibcAanboddatum) {
    checks.push(melding('Controleer de ondernemersduur op de datum van het bindend aanbod voor de startersafslag.'));
  }
  const methode = invoer.nibcMethode || 'standaard';
  if (methode !== 'ratios' && nhg?.status === 'niet_akkoord') {
    checks.push(melding('De NHG-basis voldoet op één of meer onderdelen niet. Controleer de voorwaarden met de rekenexpert.'));
    return { ...basis, bedrag: null };
  }
  if (nhg?.status === 'attentie') checks.push(melding('De NHG-basis heeft open aandachtspunten. Controleer de voorwaarden met de rekenexpert.'));
  if (methode === 'standaard') return basis;
  if (metNhg) {
    checks.push(melding('De gekozen afwijking geldt uitsluitend zonder NHG. De NHG-basis is weergegeven.'));
    return basis;
  }
  if (!bedrijven.length || bedrijven.some((a) => !heeftMeerDan36Maanden(a) || !volledigeJaren(a, T))) {
    checks.push(melding('Een afwijkende methode vereist meer dan 36 maanden ondernemerschap en drie volledige jaarrekeningen. Vul de ontbrekende cijfers aan of kies de standaardmethode.'));
    return { ...basis, bedrag: null };
  }
  if (!Number.isFinite(nhg?.toetsinkomen)) {
    checks.push(melding('Vul eerst de cijfers voor de vergelijking met het NHG-inkomen in.'));
    return { ...basis, bedrag: null };
  }
  if (methode === 'ratios') {
    const financiering = invoer.nibcHypotheekbedrag;
    const extra = { ...basis, documenten: [IKV_NIBC, { categorie: 'prognose', naam: 'Onderbouwde herstelprognose en verklaring deskundige', wanneer: 'Bij voorleggen van liquiditeit of solvabiliteit' }] };
    if (!geldigBedrag(financiering) || Number(financiering) <= 0) {
      checks.push(melding('Voer het hypotheekbedrag exclusief overbrugging in om de route voor een ratioafwijking te beoordelen.'));
      return extra;
    }
    if (Number(financiering) >= 2000000) {
      checks.push(melding('Vanaf € 2.000.000 exclusief overbrugging kent NIBC geen afwijking op de ratio’s.', 'niet_akkoord'));
      return extra;
    }
    const ratioChecks = bedrijven.flatMap((a) => (a.checks || []).filter((c) => c.status === 'niet_akkoord' && ['liquiditeit', 'solvabiliteit'].includes(c.key)));
    if (new Set(ratioChecks.map((c) => c.key)).size > 1) {
      checks.push(melding('NIBC laat een afwijking voor zowel liquiditeit als solvabiliteit in dezelfde aanvraag niet toe.', 'niet_akkoord'));
      return extra;
    }
    for (const a of bedrijven) {
      const recente = [a.jaren[T[2]], a.jaren[C]].filter((j) => j?.heeftBalans);
      if (recente.some((j) => (Number.isFinite(j.CR) && j.CR < 0.7) || (Number.isFinite(j.SV) && j.SV < 0.15))) {
        checks.push(melding(`${a.naam}: de ratio ligt onder de NIBC-ondergrens voor voorleggen (current ratio 0,70 of solvabiliteit 15%).`, 'niet_akkoord'));
      }
    }
    checks.push(melding('Leg één ratioafwijking met oorzaak, hersteltermijn, prognose en verklaring van de deskundige voor aan de NIBC Hypotheekdesk.'));
    return { ...extra, bedrag: null };
  }
  if (methode !== 'gewogen' && methode !== 'bijtelling') return basis;

  const gewichten = methode === 'gewogen';
  const plus = (jaar) => bedrijven.reduce((som, a) => som + ruimteBijtelling(a, jaar, T[2]), 0);
  const persoonlijk = (jaar) => gewichten ? 0 : num(nhg.inkomen?.persoonlijk?.[jaar]?.totaal);
  const reeks = T.map((jaar) => bedrijven.reduce((som, a) => som + num(a.jaren[jaar]?.inkomen?.totaal), persoonlijk(jaar)) + (gewichten ? 0 : plus(jaar)));
  const perJaar = Object.fromEntries(T.map((jaar, i) => [jaar, rond(reeks[i])]));
  const gemiddeld = gewichten ? gewogen(reeks) : gemiddelde(reeks);
  const winstLaatste = reeks[2];
  const controleVolledig = C && bedrijven.every((a) => a.jaren[C]?.heeftResultaatinvoer || geldigBedrag(a.jaren[C]?.ibOnd?.loon));
  if (C && !controleVolledig) {
    checks.push(melding(`Vul de resultaatcijfers van ${C} aan voor de gekozen NIBC-afwijking.`));
    return { ...basis, bedrag: null, perJaar };
  }
  const gemLabel = gewichten ? 'Gewogen zakelijk inkomen box 1 (1-2-3)' : 'Gemiddeld box 1 inkomen na aangepaste bijtelling';
  stappen.push(stap(gemLabel, gewichten ? gewogenFormule(reeks) : gemiddeldeFormule(reeks), rond(gemiddeld)));
  if (!gewichten) T.forEach((jaar) => stappen.push(stap(`Minder aftrek autobijtelling ${jaar}`, 'Maximaal 20% van het inkomen exclusief de bijtelling', rond(plus(jaar)))));

  let grensBox1 = winstLaatste;
  if (controleVolledig && gewichten && C === (nhg?.jaarNu ?? ctx.jaarNu)) {
    const real = bedrijven.reduce((som, a) => som + num(a.jaren[C]?.inkomen?.totaal), 0);
    grensBox1 = Math.max(winstLaatste, real);
    stappen.push(stap('Plafond op basis van gerealiseerde cijfers', `Hoogste van ${euro(winstLaatste)} en ${euro(real)}; controlejaar zonder extrapolatie`, rond(grensBox1)));
  } else if (controleVolledig && !gewichten && Number.isFinite(nhg.inkomen?.controleExtr)) {
    const extra = bedrijven.reduce((som, a) => som + ruimteBijtelling(a, C, T[2]) * num(a.jaren[C]?.factor), 0);
    grensBox1 = Math.min(winstLaatste, nhg.inkomen.controleExtr + extra);
    stappen.push(stap('Verlagende controlejaargrens', laagste([winstLaatste, nhg.inkomen.controleExtr + extra]), rond(grensBox1)));
  }

  let box1 = Math.max(0, Math.min(gemiddeld, grensBox1));
  const maxBijLoon = nhg.inkomen?.toets30?.max;
  if (Number.isFinite(maxBijLoon)) {
    const loonGrens = maxBijLoon + gemiddelde(T.map(persoonlijk));
    box1 = Math.min(box1, loonGrens);
    stappen.push(stap('Plafond bij loondienst naast ondernemerschap', 'NHG-inkomenstoets bij ≥80% loondienst', rond(loonGrens)));
  }
  const box2 = gewichten ? bedrijven.reduce((som, a) => som + gewogenBox2(a, T), 0) : num(nhg.inkomen?.box2);
  const voorPlafond = box1 + box2;
  const plafond = Math.max(0, Math.floor(nhg.toetsinkomen * 1.2 + Number.EPSILON));
  stappen.push(stap('Box 1 na begrenzing', laagste([gemiddeld, grensBox1]), rond(box1)));
  if (box2 > 0) stappen.push(stap('Box 2 volgens NHG-uitkeringstoets', gewichten ? '1-2-3 op dividend en overwinst' : 'NHG zonder wijziging van box 2', box2));
  stappen.push(stap('Maximum van 120% van de NHG-basis', `${euro(nhg.toetsinkomen)} × 120%`, plafond));
  const bedrag = Math.max(0, Math.min(rond(voorPlafond), plafond));
  stappen.push(stap('Indicatief inkomen volgens NIBC', laagste([voorPlafond, plafond]), bedrag));
  if (gewichten && Math.abs(voorPlafond - nhg.toetsinkomen) > 0.2 * nhg.toetsinkomen) {
    checks.push(melding('De 1-2-3-uitkomst wijkt meer dan 20% af van NHG. Leg het dossier voor aan de NIBC Hypotheekdesk.'));
  }
  if (dossier.instellingen?.vervangOudsteJaar && gewichten) {
    checks.push(melding('De 1-2-3-methode gebruikt drie volledige jaren. Het oudste jaar is in deze berekening behouden.', 'info'));
  }
  if (gewichten && C && grensBox1 > winstLaatste) {
    checks.push(melding('Bevestig het hogere gerealiseerde controlejaarbedrag met de rekenexpert. De NIBC-werkinstructie gebruikt dit plafond in het rekenvoorbeeld.'));
  }
  return { ...basis, bedrag, perJaar };
}

export const RABO_NIBC = [
  {
    id: 'RABO',
    kort: 'Rabobank',
    versie: 'November 2026',
    bron: 'Acceptatiebeleid Rabobank §§3.2–3.3 en documentenlijst. Bijlage februari 2026 vergeleken met de actuele gids.',
    bronUrl: RABO_BELEID,
    bronStatus: 'De bank of een geaccepteerde rekenexpert bepaalt het inkomen op de inkomensverklaring.',
    bronnen: [{ label: 'Rabobank Indicatieve Inkomenstool', url: RABO_INDICATIE }],
    basis: 'NHG',
    methode: 'eigen',
    definitiefVanaf: { m: 7, d: 1 },
    ikvGeldigheid: 6,
    documenten: [IKV_RABO],
    regels: [
      'IB en VPB met meer dan 25% aandelenbelang of zeggenschap samen met de partner gebruiken een inkomensverklaring of nulverklaring.',
      'Voor IB met drie volledige boekjaren zonder NHG toont ZIB een indicatie met drie gelijk gewogen jaren.',
      'Bij ten hoogste 25% aandelenbelang en zeggenschap geldt de werkgeversverklaring. Bruto dividend telt voor het laagste jaarbedrag mee als het in alle drie de jaren bij de huidige werkgever is ontvangen.',
      'Netto resultaat uit overige werkzaamheden wordt gemiddeld over drie kalenderjaren, tot maximaal het laatste jaar.',
    ],
    extraVelden: [
      { key: 'raboRoute', label: 'Inkomensroute', type: 'keuze', standaard: 'ikv', opties: { ikv: 'Ondernemingsinkomen (IKV)', minderheid: 'Directeur/aandeelhouder t/m 25%', row: 'Resultaat uit overige werkzaamheden' } },
      { key: 'raboKanaal', label: 'Aanvraagkanaal', type: 'keuze', standaard: 'intermediair', opties: { intermediair: 'Intermediair', direct: 'Rechtstreeks bij Rabobank' } },
      { key: 'raboBelangSamen', label: 'Hoogste aandelenbelang of zeggenschap samen met partner (%)', type: 'bedrag' },
      { key: 'raboWerkgeversverklaring', label: 'Jaarinkomen volgens werkgeversverklaring', type: 'bedrag' },
      { key: 'raboDividend', label: 'Ontvangen dividend meenemen', type: 'bool' },
      { key: 'raboZelfdeWerkgever', label: 'Dividend in alle drie jaren ontvangen bij de huidige werkgever', type: 'bool' },
    ],
    bereken: berekenRabo,
  },
  {
    id: 'NIBC',
    kort: 'NIBC',
    versie: '2026.01',
    bron: 'Hypotheekgids 2026 §§5.2–5.2.3 en Werkinstructie Toetsinkomen Ondernemers januari 2026 §§2–3.',
    bronUrl: NIBC_GIDS,
    bronStatus: 'De rekenexpert stelt de IKV op. Ratioafwijkingen worden voorgelegd aan de Hypotheekdesk.',
    bronnen: [{ label: 'NIBC Werkinstructie Toetsinkomen Ondernemers', url: NIBC_WERKINSTRUCTIE }],
    basis: 'NHG',
    methode: 'eigen',
    definitiefVanaf: { m: 5, d: 1 },
    documenten: [IKV_NIBC],
    regels: [
      'NHG is de basis. Vanaf twaalf maanden actief kan een ondernemer in aanmerking komen voor een inkomensverklaring.',
      'Zonder NHG geldt voor kort-zelfstandigen 90% van het inkomen op de inkomensverklaring.',
      'Zonder NHG en na meer dan 36 maanden kan met drie volledige jaarrekeningen één afwijking worden beoordeeld: 1-2-3, aangepaste autobijtelling of voorleggen van één ratio.',
      'De alternatieve inkomensmethoden blijven begrensd op 120% van het NHG-inkomen.',
    ],
    extraVelden: [
      { key: 'nibcMethode', label: 'Rekenroute', type: 'keuze', standaard: 'standaard', opties: { standaard: 'NHG-basis en eventuele startersafslag', gewogen: '1-2-3-methode', bijtelling: 'Aangepaste autobijtelling', ratios: 'Ratioafwijking voorleggen' } },
      { key: 'nibcAanboddatum', label: 'Datum bindend aanbod', type: 'datum', hint: 'Voor de toets op de ondernemersduur.' },
      { key: 'nibcHypotheekbedrag', label: 'Hypotheekbedrag exclusief overbrugging', type: 'bedrag', hint: 'Nodig bij een ratioafwijking.' },
    ],
    bereken: berekenNIBC,
  },
];
