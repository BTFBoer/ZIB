import { fmt, gemiddelde, isIngevuld, num, rond } from '../util.js';
import { heeftResultaatinvoer, nhgInkomenBeschikbaar } from './financieel.js';
import { addDaysISO, addMonthsISO, parseISO } from './periods.js';

const bedragIngevuld = (waarde) => isIngevuld(waarde) && Number.isFinite(Number(waarde));
const resultaat = (bedrag = null, stappen = [], checks = []) => ({ bedrag, stappen, checks });
const open = (tekst) => ({ status: 'attentie', tekst });
const afwijzing = (tekst) => ({ status: 'niet_akkoord', tekst });
const info = (tekst) => ({ status: 'info', tekst });
const stap = (label, formule, waarde) => ({ label, formule, waarde });
const veld = (key, label, type = 'bool', extra = {}) => ({ key, label, type, ...extra });
const stuk = (categorie, naam, wanneer, extra = {}) => ({ categorie, naam, wanneer, ...extra });
const onderneming = (o) => o.actief !== false && o.meenemen !== false && !o.nulInkomen;
const ingeschrevenSinds = (o) => o.startdatum || o.startActiviteiten;
const isVpb = (o) => ['BV', 'NV'].includes(o.rechtsvorm);
const heeftMinimaleDuur = (start, datum, maanden) => parseISO(start) && datum >= addMonthsISO(start, maanden);
const kvk = stuk('kvk', 'Recent uittreksel KvK', 'Per onderneming');
const ikv = (wanneer) => stuk('ikv', 'Inkomensverklaring Ondernemer', wanneer);
const beoordeling = (wanneer) => stuk('beoordelingsverklaring', 'Beoordelingsverklaring onderneming', wanneer);
const definitief = (jaar, jd) => (!jd?.status || jd.status === 'definitief')
  && (!jd?.van || jd.van === `${jaar}-01-01`)
  && (!jd?.tot || jd.tot === `${jaar}-12-31`);

function duurToets(ondernemingen, datum, maanden, bron = ingeschrevenSinds) {
  return ondernemingen.flatMap((o) => {
    const start = bron(o);
    if (!parseISO(start)) return [open(`${o.naam || 'Onderneming'}: vul de startdatum in.`)];
    return heeftMinimaleDuur(start, datum, maanden) ? []
      : [afwijzing(`${o.naam || 'Onderneming'}: de standaardroute vereist minimaal ${maanden} maanden ondernemerschap.`)];
  });
}

function sectorToets(invoer) {
  if (invoer.sector === 'uitgesloten') return [afwijzing('De ingevoerde bedrijfsactiviteit valt onder een sectoruitsluiting van dit kader.')];
  if (invoer.sector !== 'toegestaan') return [open('Beoordeel de bedrijfsactiviteiten aan de hand van de sectorspecifieke regels van de geldverstrekker.')];
  return [];
}

const sectorVeld = veld('sector', 'Uitkomst branchecontrole', 'keuze', {
  opties: { toegestaan: 'Toegestaan na controle', uitgesloten: 'Uitgesloten volgens de gids', voorleggen: 'Voorleggen' },
});
const bijtellingVeld = veld('bijtellingGecontroleerd', 'Autobijtelling gecontroleerd voor de toetsjaren', 'bool', {
  hint: 'Vul eventuele bijtelling per jaar bij IB-aangifte in. Bevestig hier ook als die niet van toepassing is.',
});

function driejaarsResultaat(jaren, reeks, stappen, checks, gewichten = [1, 1, 1], aftop = true) {
  const noemer = gewichten.reduce((som, x) => som + x, 0);
  const gem = reeks.reduce((som, bedrag, i) => som + bedrag * gewichten[i], 0) / noemer;
  const formule = `(${reeks.map((bedrag, i) => `${fmt.getal(bedrag)}${gewichten[i] > 1 ? ` × ${gewichten[i]}` : ''}`).join(' + ')}) ÷ ${noemer}`;
  stappen.push(stap(aftop ? 'Gemiddelde toetsjaren' : 'Gewogen indicatie 1-2-3', formule, rond(gem)));
  const bedrag = aftop ? Math.min(gem, reeks[2]) : gem;
  if (aftop) stappen.push(stap('Indicatie na begrenzing op laatste jaar', `Laagste van ${fmt.getal(gem, 2)} en ${fmt.getal(reeks[2], 2)}`, rond(bedrag)));
  if (bedrag <= 0) checks.push(open('De rekenstappen geven geen positief indicatief inkomen. Beoordeel de onderliggende cijfers.'));
  return { ...resultaat(Math.max(0, rond(bedrag)), stappen, checks), perJaar: Object.fromEntries(jaren.map((jaar, i) => [jaar, reeks[i]])) };
}

function fiscaleJaarreeks(dossier, ctx, o, metBijtelling = false) {
  return ctx.T.map((jaar) => {
    const gegevens = dossier.ib?.[jaar]?.perOnd?.[o.id] || {};
    if (!definitief(jaar, o.jaren?.[jaar]) || !bedragIngevuld(gegevens.sfw)) return null;
    const winst = num(gegevens.sfw);
    const bijtelling = metBijtelling ? Math.abs(num(gegevens.bijtelling)) : 0;
    return { jaar, bedrag: winst - bijtelling, formule: bijtelling ? `${fmt.getal(winst)} − ${fmt.getal(bijtelling)} autobijtelling` : 'Saldo fiscale winst volgens IB-aangifte' };
  });
}

function nhgIndicatie(nhg, stappen) {
  if (!nhg?.inkomen || !nhgInkomenBeschikbaar(nhg)) return null;
  stappen.push(stap('Indicatief inkomen volgens NHG', 'NHG-rekenkern, vóór formele beoordeling', nhg.toetsinkomen));
  return nhg.toetsinkomen;
}

function inkomensbesluitNietNodig(ctx, { naam, volmacht = false } = {}) {
  const checks = [open(`Beoordeel het ondernemingsrisico afzonderlijk volgens de procedure van ${naam}.`)];
  if (volmacht) checks.push(info('Gebruik de voorgeschreven beoordelingsverklaring voor het volmachtkanaal.'));
  return resultaat(0, [stap('Zakelijk inkomen niet benodigd', ctx.T.length
    ? `Risico beoordelen op het laatst beschikbare jaar (toetsjaar ${ctx.T.at(-1)})` : 'Afzonderlijke risicobeoordeling', 0)], checks);
}

const syntrusKanaal = veld('kanaal', 'Kanaal Syntrus Achmea', 'keuze', {
  opties: { direct: 'Rechtstreekse aanstelling', volmacht: 'Via volmacht zonder rechtstreekse aanstelling' },
});
const directeAanvraag = (invoer) => invoer.kanaal === 'direct';

function achmeaStukken({ dossier, ctx, invoer }, syntrus) {
  const volmacht = syntrus && invoer.kanaal === 'volmacht';
  const laatsteStukken = [
    stuk('jaarrekening', 'Balans en winst- en verliesrekening laatste beschikbare jaar', 'Risicobeoordeling'),
    stuk('ib_aangifte', 'IB-aangifte laatste beschikbare jaar', 'Risicobeoordeling'),
  ];
  if (dossier.soort === 'NUL') {
    return [kvk, ...(volmacht ? [beoordeling(invoer.nhg ? 'NHG-geselecteerde rekenexpert, maximaal zes maanden oud op offertedatum'
      : 'Raadhuys, maximaal zes maanden oud op offertedatum')] : laatsteStukken)];
  }
  if (invoer.nhg) {
    return [kvk, ikv(syntrus ? 'NHG-geselecteerde rekenexpert, maximaal zes maanden oud op offertedatum' : 'NHG-geselecteerde rekenexpert, geldig op offertedatum')];
  }
  if (volmacht || (syntrus && invoer.raadhuys === true)) return [kvk, ikv('Raadhuys, maximaal zes maanden oud op offertedatum')];
  const jaren = ctx.T.join(', ');
  const aanvraag = parseISO(dossier.datumAanvraag || ctx.datum);
  return [kvk,
    stuk('jaarrekening', 'Jaarrekeningen (balans en W&V)', jaren, { aantal: 3 }),
    stuk('ib_aangifte', 'IB-aangiften', jaren, { aantal: 3 }),
    stuk('vgi', 'Verklaringen geregistreerd inkomen', jaren, { aantal: 3 }),
    stuk('uwv', 'UWV-verzekeringsbericht', 'Maximaal drie maanden oud'),
    stuk(syntrus ? 'tussentijds' : 'prognose', syntrus ? 'Tussentijdse cijfers lopend jaar' : 'Accountantsverklaring over resultaat lopend of komend jaar',
      'Vanaf augustus verplicht, eerder op verzoek', { verplicht: aanvraag?.m >= 8 }),
    ...(dossier.ondernemingen || []).some((o) => o.rechtsvorm === 'BV')
      ? [stuk('loonstrook', 'Recente salarisstrook DGA', 'Op offertedatum maximaal drie maanden oud')] : [],
  ];
}

function berekenAchmea({ dossier, analyses, ctx, nhg, invoer }, syntrus) {
  const naam = syntrus ? 'Syntrus Achmea' : 'Attens';
  const onds = (dossier.ondernemingen || []).filter(onderneming);
  const volmacht = syntrus && invoer.kanaal === 'volmacht';
  if (dossier.soort === 'NUL') return { ...inkomensbesluitNietNodig(ctx, { naam, volmacht }), extern: false };
  const checks = [...duurToets(onds, dossier.datumAanvraag || ctx.datum, invoer.nhg ? 12 : 36), ...sectorToets(invoer)];
  const stappen = [];
  const toegestaneVormen = new Set(['EZ', 'VOF', 'MTS', 'CV', 'BV']);
  for (const o of onds) {
    if (o.land && o.land !== 'NL') checks.push(afwijzing(`${o.naam}: de onderneming moet in Nederland gevestigd en actief zijn.`));
    if (!toegestaneVormen.has(o.rechtsvorm)) checks.push(afwijzing(`${o.naam}: rechtsvorm buiten de standaardroute.`));
    if (o.rechtsvorm === 'BV' && bedragIngevuld(o.aandeelPct) && num(o.aandeelPct) < 5) {
      checks.push(afwijzing(`${o.naam}: voor de DGA-route is minimaal 5% aandelenbelang vereist.`));
    }
    if (!invoer.nhg && (dossier.ondernemingen || []).filter((kind) => kind.parentId === o.id
      || (kind.extraParents || []).some((link) => link?.id === o.id)).length > 2) {
      checks.push(afwijzing(`${o.naam}: een holding met meer dan twee werkmaatschappijen valt buiten deze niet-NHG-route.`));
    }
  }
  if (invoer.nhg) return resultaat(nhgIndicatie(nhg, stappen), stappen, checks);
  if (syntrus && !directeAanvraag(invoer) && !volmacht) {
    checks.push(open('Kies het aanvraagkanaal voor de juiste beoordelingsroute.'));
    return resultaat(null, stappen, checks);
  }
  if (volmacht || (syntrus && invoer.raadhuys === true)) {
    checks.push(info(volmacht ? 'Voor dit kanaal gebruikt Syntrus Achmea een IKV van Raadhuys.'
      : 'Leg de Raadhuys-IKV vast en geef het gebruik ervan aan in de HDN-aanvraag.'));
    return resultaat(null, stappen, checks);
  }
  if (onds.length !== 1 || !toegestaneVormen.has(onds[0].rechtsvorm) || isVpb(onds[0])) {
    checks.push(open(`${naam} beoordeelt deze structuur. De gepubliceerde formule is toepasbaar op één IB-onderneming.`));
    return resultaat(null, stappen, checks);
  }
  const [o] = onds;
  if (invoer.gelijkeActiviteiten !== true) checks.push(open('Bevestig dat het bedrijf in alle toetsjaren dezelfde bedrijfsactiviteiten uitvoerde.'));
  if (invoer.bijtellingGecontroleerd !== true) checks.push(open('Controleer de fiscale autobijtelling over de toetsjaren.'));
  if (invoer.balansBeoordeeld !== true) checks.push(open('Beoordeel liquiditeit, solvabiliteit en eigen vermogen. De gids laat een individuele beoordeling toe.'));
  const laatste = analyses.find((a) => a.id === o.id)?.jaren?.[ctx.T.at(-1)];
  if (!laatste?.heeftBalans) checks.push(open('Voeg de laatste jaarbalans toe voor de beoordeling van liquiditeit, solvabiliteit en eigen vermogen.'));
  else if (laatste.bal.EV < 0) checks.push(open('Het eigen vermogen van het laatste jaar is negatief. Vraag om individuele beoordeling.'));
  const aanvraag = parseISO(dossier.datumAanvraag || ctx.datum);
  if (aanvraag && ctx.T.at(-1) !== aanvraag.y - 1 && !(aanvraag.m <= 4 && ctx.T.at(-1) === aanvraag.y - 2)) {
    checks.push(open('Controleer de kalenderjaren. Januari tot en met april mag je één jaar terugschuiven als de meest recente stukken ontbreken.'));
    return { ...resultaat(null, stappen, checks), extern: false };
  }
  if (aanvraag && ctx.T.at(-1) === aanvraag.y - 2) {
    const vorig = aanvraag.y - 1;
    if (definitief(vorig, o.jaren?.[vorig]) && bedragIngevuld(dossier.ib?.[vorig]?.perOnd?.[o.id]?.sfw)) {
      checks.push(open(`Er zijn fiscale cijfers over ${vorig}. Neem dit jaar op als de definitieve stukken beschikbaar zijn.`));
    }
  }
  const jaarreeks = fiscaleJaarreeks(dossier, ctx, o, true);
  if (jaarreeks.some((rij) => !rij)) {
    checks.push(open('Vul het saldo fiscale winst in voor drie volledige kalenderjaren. Een ontbrekend jaar telt niet als nul.'));
    return { ...resultaat(null, stappen, checks), extern: false };
  }
  if (invoer.gelijkeActiviteiten !== true) return { ...resultaat(null, stappen, checks), extern: false };
  jaarreeks.forEach((rij) => stappen.push(stap(`Gecorrigeerde fiscale winst ${rij.jaar}`, rij.formule, rij.bedrag)));
  return { ...driejaarsResultaat(ctx.T, jaarreeks.map((rij) => rij.bedrag), stappen, checks), extern: false };
}

const achmeaVelden = [
  veld('gelijkeActiviteiten', 'Bedrijfsactiviteiten bleven gelijk in alle toetsjaren'),
  bijtellingVeld, sectorVeld,
  veld('balansBeoordeeld', 'Voldoende liquiditeit, solvabiliteit en eigen vermogen beoordeeld'),
];
const achmeaRegels = [
  'Minimaal 12 maanden ondernemerschap met NHG of 36 maanden zonder NHG. De onderneming is actief en gevestigd in Nederland.',
  'Voor één IB-onderneming met gelijke bedrijfsactiviteiten geldt het gemiddelde van de fiscale winst over drie kalenderjaren, begrensd op het laatste jaar en gecorrigeerd voor autobijtelling.',
  'Toets de sector op de gids. Horeca en autohandel hebben aanvullende eisen aan looptijd, vestiging en bedrijfsvoering. Zonder NHG geldt maximaal twee werkmaatschappijen per holding.',
];

function berekenLloyds({ dossier, analyses, ctx, nhg, invoer }) {
  const alle = dossier.ondernemingen || [];
  const onds = alle.filter(onderneming);
  const checks = [...duurToets(onds, ctx.datum, invoer.nhg ? 12 : 24), ...sectorToets(invoer)];
  const stappen = [];
  if (invoer.nhg) return resultaat(nhgIndicatie(nhg, stappen), stappen, checks);
  if (alle.length > 4) checks.push(afwijzing('Het maximum van vier geregistreerde ondernemingen, inclusief dochters, is overschreden.'));
  if (dossier.soort === 'NUL') return resultaat(null, stappen, [...checks, open('Laat Lloyds de risico’s beoordelen wanneer het ondernemingsinkomen buiten de aanvraag blijft.')]);
  if (onds.length !== 1) return resultaat(null, stappen, [...checks, open('Gebruik de inkomensverklaring voor een structuur met meerdere ondernemingen.')]);
  const [o] = onds;
  const a = analyses.find((x) => x.id === o.id);
  const laatste = a?.jaren?.[ctx.T.at(-1)];
  if (!laatste?.heeftBalans) checks.push(open('Vul de balans in zodat de solvabiliteit en liquiditeit kunnen worden beoordeeld.'));
  if (laatste?.heeftBalans && (laatste.bal.EV < 0 || laatste.bal.TA <= 0 || laatste.bal.VA <= 0)) {
    checks.push(open('Eigen vermogen is negatief of de balans laat geen positieve vermogens- en liquiditeitspositie zien. Leg de analyse voor aan Lloyds.'));
  }
  if (invoer.balansBeoordeeld !== true) checks.push(open('Bevestig de analyse van de liquiditeit en solvabiliteit.'));
  let jaarreeks;
  if (o.rechtsvorm === 'NV') return resultaat(null, stappen, [...checks, open('Laat Lloyds bevestigen welke loon- en dividendroute bij deze N.V. geldt.')]);
  if (o.rechtsvorm === 'BV') {
    const belang = o.aandeelPct;
    if (bedragIngevuld(belang) && num(belang) < 5) checks.push(afwijzing('De zelfstandigenroute voor DGA’s vereist ten minste 5% aandelenbelang.'));
    const bezit100 = invoer.gezamenlijkVolledigBelang === true;
    jaarreeks = ctx.T.map((jaar) => {
      const ib = dossier.ib?.[jaar]?.perOnd?.[o.id] || {};
      if (!definitief(jaar, o.jaren?.[jaar]) || !bedragIngevuld(ib.loon) || (bezit100 && !bedragIngevuld(ib.dividend))) return null;
      return { jaar, bedrag: num(ib.loon) + (bezit100 ? num(ib.dividend) : 0),
        formule: bezit100 ? `${fmt.getal(ib.loon)} loon + ${fmt.getal(ib.dividend)} uitgekeerd dividend` : 'Uitbetaald DGA-loon' };
    });
    if (!bezit100) checks.push(info('Dividend telt mee zodra 100% eigendom door de aanvrager(s) is bevestigd.'));
  } else {
    jaarreeks = fiscaleJaarreeks(dossier, ctx, o);
  }
  if (jaarreeks.some((rij) => !rij)) return resultaat(null, stappen, [...checks, open('Vul drie afgesloten kalenderjaren in voor deze indicatie. Bij twee jaar ondernemerschap beoordeelt de rekenexpert de beschikbare periode.')]);
  jaarreeks.forEach((rij) => stappen.push(stap(`Inkomen ${rij.jaar}`, rij.formule, rij.bedrag)));
  return driejaarsResultaat(ctx.T, jaarreeks.map((rij) => rij.bedrag), stappen, checks);
}

function berekenMunt({ dossier, ctx, nhg, invoer }) {
  const alle = dossier.ondernemingen || [];
  const onds = alle.filter(onderneming);
  const heeftHypotheek = invoer.bestaandeMunt === true;
  const checks = [...duurToets(onds, ctx.datum, invoer.nhg || heeftHypotheek ? 12 : 36), ...sectorToets(invoer)];
  const stappen = [];
  if (!invoer.nhg) {
    const bvAantal = onds.some(isVpb) ? alle.filter(isVpb).length : 0;
    if (bvAantal > 5) checks.push(afwijzing('Meer dan vijf vennootschappen overschrijdt de maximale uitloop van de DGA-route.'));
    else if (bvAantal > 3) checks.push(open('Vier of vijf vennootschappen vereisen beoordeling door een MUNT-rekenexpert.'));
    for (const o of onds) {
      if (!heeftMinimaleDuur(ingeschrevenSinds(o), ctx.datum, 36)) {
        if (heeftHypotheek && !Object.entries(o.jaren || {}).some(([jaar, jd]) => {
          const einddatum = jd.tot || `${jaar}-12-31`;
          return einddatum < ctx.datum && (!jd.status || jd.status === 'definitief') && heeftResultaatinvoer(jd)
            && bedragIngevuld(dossier.ib?.[jaar]?.perOnd?.[o.id]?.[isVpb(o) ? 'loon' : 'sfw']);
        })) {
          checks.push(open(`${o.naam}: lever definitieve jaarcijfers en een verzonden aangifte over ten minste één boekjaar aan.`));
        }
        continue;
      }
      const a = nhg?.ondernemingen?.find((x) => x.id === o.id);
      const j = a?.jaren?.[nhg?.T?.at(-1)];
      if (!j?.heeftBalans) {
        checks.push(open(`${o.naam}: voeg de laatste balans toe voor de MUNT-solvabiliteitstoets.`));
        continue;
      }
      // Gebruik dezelfde NHG-balanscorrecties en laat alleen de correctie voor IVA vervallen.
      const iva = j.corr?.items?.find((c) => c.key === 'iva');
      const ev = j.EVcor - (iva?.av || 0);
      const totaal = j.TVcor - (iva?.bt || 0);
      const ratio = totaal > 0 ? ev / totaal : null;
      const norm = isVpb(o) ? 0.20 : 0.10;
      stappen.push(stap(`MUNT-solvabiliteit · ${o.naam}`,
        `${fmt.eur(ev)} ÷ ${fmt.eur(totaal)}. IVA blijft op de balans. Norm > ${fmt.pct(norm)}`,
        ratio === null ? null : fmt.pct(ratio, 2)));
      if (ratio === null || ratio <= norm) checks.push(afwijzing(`${o.naam}: de solvabiliteit moet hoger zijn dan ${fmt.pct(norm)}.`));
    }
  }
  const indicatie = invoer.nhg || onds.every((o) => !isVpb(o)) ? nhgIndicatie(nhg, stappen) : null;
  if (!invoer.nhg && indicatie === null && onds.some(isVpb)) {
    checks.push(info('De MUNT-rekenexpert stelt het bedrag voor de DGA vast. De afwijkende solvabiliteitsnorm is hier apart berekend.'));
  }
  return resultaat(indicatie, stappen, checks);
}

const toetredingVeld = veld('toetreding', 'Toetreding tot een onderneming die al 36 maanden bestaat bevestigd');

function berekenToetreding({ dossier, analyses, ctx, nhg, invoer }, verhuur) {
  const onds = (dossier.ondernemingen || []).filter(onderneming);
  const checks = [...duurToets(onds, ctx.datum, invoer.toetreding === true ? 12 : 36), ...sectorToets(invoer)];
  const stappen = [];
  if (verhuur && invoer.nhg) {
    checks.push(afwijzing('Dit product is de Dynamic Verhuurhypotheek zonder NHG.'));
    return resultaat(null, stappen, checks);
  }
  if (verhuur && invoer.verhuurDoel !== true) checks.push(open('Bevestig dat de aanvraag betrekking heeft op financiering van een woning voor verhuur.'));
  if (dossier.soort === 'NUL') {
    const laatste = ctx.T.at(-1);
    for (const o of (dossier.ondernemingen || [])) {
      const j = analyses.find((a) => a.id === o.id)?.jaren?.[laatste];
      if (j?.heeftBalans && j.bal.EV <= 0) checks.push(open(`${o.naam}: beoordeel het niet-positieve eigen vermogen volgens de productregels.`));
    }
    return { ...inkomensbesluitNietNodig(ctx, { naam: verhuur ? 'Dynamic' : 'bijBouwe' }),
      checks: [...checks, open('Beoordeel de jaarcijfers of toegestane verklaring voor inkomen dat buiten de aanvraag blijft.')], extern: false };
  }
  if (verhuur) {
    if (invoer.toetreding === true && onds.some((o) => !heeftMinimaleDuur(ingeschrevenSinds(o), ctx.datum, 36))) {
      checks.push(open('Laat Dynamic bevestigen welke toetredingsroute volgens de actuele producthandleiding geldt.'));
    }
    if (onds.length !== 1 || isVpb(onds[0])) return resultaat(null, stappen, checks);
    const jaarreeks = fiscaleJaarreeks(dossier, ctx, onds[0]);
    if (jaarreeks.some((rij) => !rij)) return resultaat(null, stappen, [...checks, open('Vul drie afgesloten kalenderjaren in. Voer een aantoonbaar nuljaar als 0 in.')]);
    const reeks = jaarreeks.map((rij) => rij.bedrag);
    if (reeks.filter((waarde) => waarde === 0).length > 1) checks.push(afwijzing('De standaardroute staat maximaal één kalenderjaar zonder inkomen toe.'));
    jaarreeks.forEach((rij) => stappen.push(stap(`Inkomen ${rij.jaar}`, rij.formule, rij.bedrag)));
    vergelijkActueelJaar(reeks, invoer, stappen, checks);
    return driejaarsResultaat(ctx.T, reeks, stappen, checks);
  }
  const bedrag = invoer.nhg ? nhgIndicatie(nhg, stappen) : null;
  return resultaat(bedrag, stappen, checks);
}

function berekenMerius({ dossier, ctx, nhg }) {
  const alle = dossier.ondernemingen || [];
  if (dossier.soort === 'NUL' && alle.length <= 2) {
    return { ...inkomensbesluitNietNodig(ctx, { naam: 'Merius Hypotheken' }), extern: false };
  }
  const checks = [];
  const stappen = [];
  for (const o of alle.filter(onderneming)) {
    const volledigeJaren = Object.entries(o.jaren || {}).filter(([jaar, jd]) => {
      const start = ingeschrevenSinds(o);
      if ((jd.status && jd.status !== 'definitief') || !heeftResultaatinvoer(jd) || !parseISO(start)) return false;
      const van = jd.van || `${jaar}-01-01`;
      const tot = jd.tot || `${jaar}-12-31`;
      return !!parseISO(van) && !!parseISO(tot) && start <= van && tot < ctx.datum && addMonthsISO(van, 12) <= addDaysISO(tot, 1);
    });
    if (volledigeJaren.length < 2) checks.push(open(`${o.naam}: bevestig met definitieve jaarstukken ten minste twee volledige afgesloten boekjaren.`));
  }
  return resultaat(nhgIndicatie(nhg, stappen), stappen, checks);
}

function berekenNN({ dossier, ctx }) {
  const onds = (dossier.ondernemingen || []).filter(onderneming);
  const checks = duurToets(onds, ctx.datum, 12);
  const stappen = [];
  if (onds.length !== 1 || isVpb(onds[0])) return resultaat(null, stappen, checks);
  const [o] = onds;
  if (!heeftMinimaleDuur(ingeschrevenSinds(o), ctx.datum, 36)) {
    checks.push(info('Laat de rekenexpert bepalen welk eerder looninkomen en welke boekjaren mogen meetellen.'));
    return resultaat(null, stappen, checks);
  }
  const jaarreeks = fiscaleJaarreeks(dossier, ctx, o);
  if (jaarreeks.some((rij) => !rij)) return resultaat(null, stappen, [...checks, open('Vul drie afgesloten kalenderjaren in voor de standaardindicatie. Laat gebroken boekjaren afzonderlijk beoordelen.')]);
  jaarreeks.forEach((rij) => stappen.push(stap(`Fiscale winst ${rij.jaar}`, rij.formule, rij.bedrag)));
  return driejaarsResultaat(ctx.T, jaarreeks.map((rij) => rij.bedrag), stappen, checks);
}

function vergelijkActueelJaar(reeks, invoer, stappen, checks) {
  if (!bedragIngevuld(invoer.actueelJaarinkomen)) {
    checks.push(open('Leg het actuele jaarinkomen uit de tussentijdse cijfers vast voor de vergelijking met het gemiddelde.'));
    return;
  }
  const gem = gemiddelde(reeks);
  stappen.push(stap('Actueel jaarinkomen', `Vergelijk met gemiddeld inkomen ${fmt.eur(gem)}`, num(invoer.actueelJaarinkomen)));
  if (num(invoer.actueelJaarinkomen) < gem) checks.push(open('Het actuele inkomen ligt onder het gemiddelde. Laat de bestendigheid beoordelen.'));
}

function berekenTulpBunq({ dossier, ctx, nhg, invoer }, bunq) {
  const onds = (dossier.ondernemingen || []).filter(onderneming);
  const checks = [...duurToets(onds, ctx.datum, 12), ...sectorToets(invoer)];
  const stappen = [];
  if (invoer.nhg) return resultaat(nhgIndicatie(nhg, stappen), stappen, checks);
  if (onds.length !== 1 || isVpb(onds[0])) return resultaat(null, stappen, checks);
  const [o] = onds;
  const bestaand = heeftMinimaleDuur(ingeschrevenSinds(o), ctx.datum, 36);
  if (bestaand && bunq && invoer.gewogen === true) {
    const jaarreeks = fiscaleJaarreeks(dossier, ctx, o);
    if (jaarreeks.some((rij) => !rij)) return resultaat(null, stappen, [...checks, open('Vul drie volledige kalenderjaren fiscale winst in voor de 1-2-3-indicatie.')]);
    jaarreeks.forEach((rij) => stappen.push(stap(`Fiscale winst ${rij.jaar}`, rij.formule, rij.bedrag)));
    return driejaarsResultaat(ctx.T, jaarreeks.map((rij) => rij.bedrag), stappen, checks, [1, 2, 3], false);
  }
  if (bestaand || checks.some((c) => c.status === 'niet_akkoord')) return resultaat(null, stappen, checks);
  const jaarreeks = fiscaleJaarreeks(dossier, ctx, o);
  const eersteJaar = jaarreeks[2];
  if (!eersteJaar || ctx.T[2] !== Number(ingeschrevenSinds(o)?.slice(0, 4))) {
    return resultaat(null, stappen, [...checks, open('Deze startersindicatie gebruikt het eerste ondernemingsjaar en de twee voorafgaande loondienstjaren. Laat een afwijkende of gebroken periode beoordelen.')]);
  }
  const vooraf = ctx.T.slice(0, 2).map((jaar) => dossier.ib?.[jaar]?.voorStart);
  if (vooraf.some((waarde) => !bedragIngevuld(waarde))) {
    return resultaat(null, stappen, [...checks, open('Vul de looninkomsten vóór start voor beide voorafgaande jaren in.')]);
  }
  const reeks = [...vooraf.map(num), eersteJaar.bedrag];
  ctx.T.forEach((jaar, i) => stappen.push(stap(`Inkomen ${jaar}`, i < 2 ? 'Loondienst vóór ondernemerschap' : 'Eerste ondernemingsjaar', reeks[i])));
  vergelijkActueelJaar(reeks, invoer, stappen, checks);
  return driejaarsResultaat(ctx.T, reeks, stappen, checks);
}

const starterVeld = veld('actueelJaarinkomen', 'Actueel jaarinkomen voor starterstoets', 'bedrag', {
  hint: 'Gebruik het jaarinkomen op basis van de actuele cijfers, zoals onderbouwd door de rekenexpert.',
});
const tulpBunqRegels = [
  'Voor een starter telt het eerste ondernemersjaar met de twee voorafgaande jaren loondienst. Het laatste jaar begrenst het gemiddelde.',
  'Vergelijk het actuele resultaat met het gemiddelde en leg dit voor aan een gemachtigd rekeninstituut.',
  'Onder meer horeca, agrarische activiteiten, autohandel, onroerendgoedhandel en geldtransfer zijn uitgesloten. Raadpleeg de volledige lijst in de gids.',
];

export const EXTRA_PROFIELEN = [
  {
    id: 'ATTENS', kort: 'Attens', versie: '1 juli 2026', bron: 'Acceptatiegids, Inkomen uit onderneming, p. 10',
    bronUrl: 'https://www.attens.nl/-/media/attens/documenten/documenten-en-formulieren/2026/acceptatiegids-attens-1-juli-2026.pdf',
    basis: 'NHG', methode: 'extern', ikvOptioneel: true, definitiefVanaf: { m: 5, d: 1 }, extraVelden: achmeaVelden,
    bronStatus: 'Niet-NHG: ZIB rekent de gepubliceerde standaardroute voor één IB-onderneming. Attens beoordeelt de aanvraag.',
    regels: [...achmeaRegels, 'Met NHG is een geldige IKV van een NHG-rekenexpert vereist. Zonder NHG beoordeelt Attens het zakelijk inkomen.'],
    documenten: (args) => achmeaStukken(args, false), bereken: (args) => berekenAchmea(args, false),
  },
  {
    id: 'SYNTRUS', kort: 'Syntrus Achmea', versie: '1 oktober 2026', bron: 'Acceptatiegids, Inkomen uit onderneming, p. 9–10',
    bronUrl: 'https://www.syntrusachmeahypotheken.nl/-/media/syntrus-hypotheken/documenten/documenten-voor-hypotheekadviseurs/2026/acceptatiegids-syntrus-1-oktober-2026.pdf',
    basis: 'NHG', methode: 'extern', ikvOptioneel: true, ikvGeldigheid: 6, definitiefVanaf: { m: 5, d: 1 },
    bronStatus: 'De aanvraagroute via volmacht is versiegebonden. Controleer bij aanvragen vóór oktober 2026 de toen geldende gids.',
    extraVelden: [syntrusKanaal, veld('raadhuys', 'Bij rechtstreekse aanvraag een Raadhuys-verklaring gebruiken'), ...achmeaVelden],
    regels: [...achmeaRegels, 'Zonder NHG is Raadhuys verplicht bij aanvragen via volmacht zonder rechtstreekse aanstelling. Andere adviseurs kunnen rechtstreeks laten beoordelen of een Raadhuys-IKV via HDN opgeven.'],
    documenten: (args) => achmeaStukken(args, true), bereken: (args) => berekenAchmea(args, true),
  },
  {
    id: 'LLOYDS', kort: 'Lloyds Bank', versie: 'Online hypotheekgids', bron: 'Hypotheekgids §8.10–8.10.2',
    bronUrl: 'https://www.lloydsbank.nl/informatie-voor-financieel-adviseurs/hypotheekgids/lbh-inkomen',
    basis: 'NHG', methode: 'extern', ikvGeldigheid: 6,
    extraVelden: [veld('gezamenlijkVolledigBelang', 'Aanvrager(s) bezitten samen 100% in de toetsjaren'),
      veld('balansBeoordeeld', 'Positieve solvabiliteit en liquiditeit beoordeeld'), sectorVeld],
    regels: [
      'Minimaal twee jaar zelfstandig zonder NHG. De fiscale winst over drie kalenderjaren wordt gemiddeld met het laatste jaar als maximum.',
      'Voor een DGA tellen het uitbetaalde loon en bij volledig eigendom door de aanvrager(s) ook uitgekeerd dividend mee. Maximaal vier geregistreerde ondernemingen.',
      'Een geaccepteerde rekenexpert geeft de IKV af. Met NHG geldt minimaal één jaar ondernemerschap en is de NHG-IKV leidend.',
    ],
    documenten: ({ invoer }) => [ikv(invoer.nhg ? 'NHG-rekenexpert. Maximaal zes maanden oud op bindend aanbod' : 'Lloyds-geaccepteerde rekenexpert. Maximaal zes maanden oud op bindend aanbod')],
    bereken: berekenLloyds,
  },
  {
    id: 'MUNT', kort: 'MUNT Hypotheken', versie: '2026-2', bron: 'Hypotheekgids §2.3.1–2.3.5',
    bronUrl: 'https://www.munthypotheken.nl/site/assets/files/2893/munt_hypotheekgids_2026-2.pdf',
    basis: 'NHG', methode: 'extern', ikvGeldigheid: 6, extraVelden: [veld('bestaandeMunt', 'Aanvrager heeft al een MUNT Hypotheek'), sectorVeld],
    regels: [
      'NHG vormt de basis. Zonder NHG moet een nieuwe klant minimaal 36 maanden ondernemer zijn. Een bestaande klant kan vanaf 12 maanden met een definitieve jaarrekening en verzonden aangifte.',
      'Zonder NHG geldt voor ondernemers vanaf 36 maanden solvabiliteit hoger dan 10% bij IB en hoger dan 20% bij DGA. Immateriële vaste activa blijven op de balans.',
      'Voor DGA’s zonder NHG geldt maximaal drie vennootschappen. Vier of vijf vereisen beoordeling door de rekenexpert. De formele IKV is leidend voor het ondernemersinkomen.',
    ],
    documenten: ({ invoer }) => [ikv(invoer.nhg ? 'NHG-geaccepteerde rekenexpert. Maximaal zes maanden oud op het hypotheekaanbod'
      : 'MUNT-rekenexpert (Raadhuys of Zakelijk Inkomen). Maximaal zes maanden oud op het hypotheekaanbod')],
    bereken: berekenMunt,
  },
  {
    id: 'MERIUS', kort: 'Merius Hypotheken', versie: '2024_01, beleidsroute bevestigd', bron: 'Hypotheekgids §6.3 en adviseurspagina Zelfstandigen',
    bronUrl: 'https://meriushypotheken.nl/adviseur/zelfstandigen/',
    basis: 'NHG', methode: 'extern', ikvGeldigheid: 6,
    regels: [
      'Het NHG-kader is de basis bij aanvragen met en zonder NHG. Minimaal twee volledige boekjaren ondernemerschap bij afgifte.',
      'Merius gebruikt de IKV van een geaccepteerde inkomensbeoordelaar. Voor een aanvraag met NHG geldt de NHG-erkende route.',
      'Wanneer het ondernemingsinkomen niet benodigd is en er maximaal twee ondernemingen zijn, kan Merius het risico beoordelen op basis van de laatste jaarcijfers en IB-aangifte.',
    ],
    documenten: ({ dossier }) => dossier.soort === 'NUL' && (dossier.ondernemingen || []).length <= 2
      ? [stuk('jaarrekening', 'Laatste jaarcijfers', 'Risicobeoordeling'), stuk('ib_aangifte', 'Laatste IB-aangifte', 'Risicobeoordeling')]
      : [ikv('Door Merius geaccepteerde partij. Maximaal zes maanden oud op het hypotheekaanbod')],
    bereken: berekenMerius,
  },
  {
    id: 'NN', kort: 'Nationale-Nederlanden', versie: '2026', bron: 'Acceptatiegids Hypotheken §3.9.1–3.9.2',
    bronUrl: 'https://www.nn.nl/Particulier/Hypotheken/Een-hypotheek-voor-ondernemers.htm',
    methode: 'extern',
    regels: [
      'Ondernemerschap vanaf minimaal 12 maanden. Een starter tussen 12 en 36 maanden toont het toetsinkomen aan met een onafhankelijke verklaring volgens de toepasselijke voorwaarden.',
      'De standaardindicatie neemt drie jaar fiscale winst met het laatste jaar als maximum. De rekenexpert bepaalt hoe eerder loon of gebroken boekjaren meetellen.',
      'De rekenexpert beoordeelt de buffer aan de hand van solvabiliteit, liquiditeit, privévermogen en benodigd inkomen in verhouding tot de resultaten.',
    ],
    documenten: [ikv('Onafhankelijke rekenexpert volgens Nationale-Nederlanden')],
    bereken: berekenNN,
  },
  {
    id: 'ASR', kort: 'a.s.r.', versie: 'Mei 2026', bron: 'Hypotheekgids §6.5.1–6.5.2',
    bronUrl: 'https://www.asr.nl/ondernemer/life-events/zelfstandig-en-hypotheek',
    basis: 'NHG', methode: 'extern',
    extraVelden: [
      veld('neveninkomenBestendig', 'Loondienst en onderneming meer dan twee jaar stabiel gecombineerd'),
      veld('slapendOfKleinschalig', 'Uitzondering voor slapende of kleinschalige onderneming onderbouwd'),
    ],
    regels: [
      'Een samenwerkende specialist stelt het ondernemersinkomen vast. Bij NHG volgt de specialist de NHG-normen, zonder NHG gelden ook de eventuele aanvullende a.s.r.-voorwaarden.',
      'Bij combinatie met vast dienstverband beoordeelt de specialist of de verhouding al meer dan twee jaar stabiel is. Bij minimaal 80% dienstverband is het ondernemersinkomen maximaal 30% van het jaarloon.',
      'Zonder benodigd ondernemingsinkomen is een positieve beoordelingsverklaring nodig, behalve bij een aantoonbaar slapende of kleinschalige onderneming.',
    ],
    documenten: ({ dossier, invoer }) => dossier.soort === 'NUL'
      ? invoer.slapendOfKleinschalig ? [stuk('jaarrekening', 'Recente jaarstukken of IB-aangifte', 'Onderbouw de uitzondering')]
        : [beoordeling('Onvoorwaardelijk positief, opgesteld door een samenwerkende specialist')]
      : [ikv('Samenwerkende specialist van a.s.r.')],
    bereken: ({ dossier, nhg, invoer }) => {
      if (dossier.soort === 'NUL') return { ...inkomensbesluitNietNodig({ T: [] }, { naam: 'a.s.r.' }),
        stappen: [stap('Inkomen niet benodigd', invoer.slapendOfKleinschalig ? 'Uitzondering onderbouwen' : 'Positieve beoordelingsverklaring vereist', 0)], extern: false };
      const checks = [];
      const stappen = [];
      if (dossier.loondienst?.meenemen) {
        if (invoer.neveninkomenBestendig !== true) checks.push(open('Beoordeel welk afzonderlijk inkomen bestendig is als de combinatie onvoldoende bestendig is.'));
        if (num(dossier.loondienst.actueelPct) >= 80 && bedragIngevuld(dossier.loondienst.loonJaar)) {
          stappen.push(stap('Maximum ondernemersinkomen naast dienstverband', `${fmt.eur(dossier.loondienst.loonJaar)} jaarloon × 30%`,
            rond(num(dossier.loondienst.loonJaar) * 0.30)));
        }
      }
      return resultaat(invoer.nhg ? nhgIndicatie(nhg, stappen) : null, stappen, checks);
    },
  },
  {
    id: 'BIJBOUWE', kort: 'bijBouwe Basis', versie: 'September 2026', bron: 'Acceptatiehandleiding bijBouwe Basis §4.3.1',
    bronUrl: 'https://bijbouwe.nl/belangrijke-documenten',
    basis: 'NHG', methode: 'extern', ikvGeldigheid: 6, extraVelden: [toetredingVeld, sectorVeld],
    regels: [
      'Minimaal 36 maanden actief na KvK-inschrijving. Een uitzondering geldt vanaf 12 maanden na toetreding tot een onderneming die al ten minste 36 maanden bestaat.',
      'Een geselecteerde externe partij geeft de IKV af. Controleer de expliciete sectoruitsluitingen in de gids, waaronder horeca.',
      'Als inkomen niet nodig is, lever jaarcijfers met positief eigen vermogen, recente tussentijdse cijfers bij ontbreken van de jaarrekening of een nulverklaring aan.',
    ],
    documenten: ({ dossier }) => dossier.soort === 'NUL'
      ? [stuk('jaarrekening', 'Laatste jaarrekening, recente tussentijdse cijfers of nulverklaring', 'Risicobeoordeling')]
      : [ikv('Geselecteerde rekenexpert. Maximaal zes maanden geldig')],
    bereken: (args) => berekenToetreding(args, false),
  },
  {
    id: 'DYNAMIC', kort: 'Dynamic Verhuurhypotheek', versie: 'Online inkomensroute, bijlage januari 2024', bron: 'Acceptatiehandleiding Dynamic Verhuurhypotheek en actuele pagina Inkomensverklaring',
    bronUrl: 'https://www.dynamiccredit.nl/verhuurhypotheek/inkomensverklaring',
    methode: 'extern', ikvGeldigheid: 6,
    extraVelden: [veld('verhuurDoel', 'Woning wordt voor verhuur gefinancierd'), toetredingVeld, sectorVeld, starterVeld],
    regels: [
      'Dit profiel geldt voor de Dynamic Verhuurhypotheek. Het onderdeel behandelt ondernemersinkomen in de verhuurfinanciering.',
      'Voor de standaardroute beoordeelt Dynamic ondernemerschap vanaf drie jaar. De bijgevoegde gids noemt ook toetreding vanaf 12 maanden, onder voorbehoud van actuele bevestiging.',
      'De standaardroute neemt drie kalenderjaren, maximaal één jaar zonder inkomen, een aftopping op het laatste jaar en een controle van de actuele cijfers.',
      'De geselecteerde rekenexpert moet de IKV specifiek voor Dynamic opstellen. Controleer de sectoruitsluitingen in de handleiding.',
    ],
    documenten: ({ dossier }) => dossier.soort === 'NUL'
      ? [stuk('jaarrekening', 'Laatste jaarrekening of recente tussentijdse cijfers', 'Beoordeel het eigen vermogen')]
      : [ikv('Opgesteld voor Dynamic Credit door geselecteerde rekenexpert. Maximaal zes maanden geldig')],
    bereken: (args) => berekenToetreding(args, true),
  },
  {
    id: 'BUNQ', kort: 'bunq Easy Mortgage', versie: 'Februari 2026', bron: 'Acceptatiegids, Inkomen zelfstandig ondernemerschap, p. 15–16',
    bronUrl: 'https://static.bunq.com/website/documents/bunq-mortgages-acceptation-guide-2026-nl.pdf',
    basis: 'NHG', methode: 'extern',
    extraVelden: [starterVeld, veld('gewogen', 'Toon de toegestane 1-2-3-indicatie zonder NHG'), sectorVeld],
    regels: [...tulpBunqRegels, 'De gids staat de 1-2-3-methode toe. Het inkomenscertificaat van het gemachtigde instituut bepaalt het toetsinkomen.'],
    documenten: [ikv('Inkomenscertificaat van een door bunq gemachtigd rekeninstituut')],
    bereken: (args) => berekenTulpBunq(args, true),
  },
  {
    id: 'TULP', kort: 'Tulp Hypotheek', versie: 'Maart 2025', bron: 'Acceptatiegids Tulp Hypotheek, Inkomen zelfstandig ondernemerschap, p. 13',
    bronUrl: 'https://tulphypotheken.nl/wp-content/uploads/2025/03/acceptatiegids-Tulp-Hypotheek_maart-2025.pdf',
    basis: 'NHG', methode: 'extern', extraVelden: [starterVeld, sectorVeld],
    regels: [...tulpBunqRegels, 'Het inkomenscertificaat van het gemachtigde instituut bepaalt het toetsinkomen.'],
    documenten: [ikv('Inkomenscertificaat van een door Tulp gemachtigd rekeninstituut')],
    bereken: (args) => berekenTulpBunq(args, false),
  },
];
