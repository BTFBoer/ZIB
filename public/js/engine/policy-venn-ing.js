import { fmt, isIngevuld, gemiddelde, num, rond } from '../util.js';
import { balansOntbreekt, heeftBedrag, heeftResultaatVoorBelasting, nhgInkomenBeschikbaar, voorraadTotaal } from './financieel.js';
import { addMonthsISO, opOfNa } from './periods.js';
import { g, laagsteF, lijstF } from './trace.js';

const VENN_2025 = 'https://www.vennhypotheken.nl/wp-content/uploads/Kredietgids-Oktober-2025.pdf';
const VENN_APRIL = 'https://www.zelfhypotheekafsluiten.nl/Uploads/geldverstrekkers/2026/09/venn-hypotheek-kredietgids-april-2026.pdf';
const VENN_JULI = 'https://www.zelfhypotheekafsluiten.nl/Uploads/geldverstrekkers/2026/09/venn-hypotheek-kredietgids-juli-2026.pdf';
const ING_2026 = 'https://hypotheekcompany.nl/wp-content/uploads/2026/05/ING-Hypotheken-Acceptatiebeleid-1-juni-2026.pdf';
const aanwezig = (waarde) => isIngevuld(waarde) && Number.isFinite(Number(waarde));
const aftrek = (j) => Math.abs(num(j?.ibOnd?.bijtelling));
const check = (status, tekst) => ({ status, tekst });
const stap = (label, formule, waarde) => ({ label, formule, waarde });

function vennWeging([oud, middel, laatst]) {
  const formule = `(${g(oud)} + 2 × ${g(middel)} + 3 × ${g(laatst)}) / 6`;
  const gemiddelde = (oud + 2 * middel + 3 * laatst) / 6;
  return { formule, gemiddelde, bedrag: Math.max(0, Math.min(gemiddelde, laatst)) };
}

function geefNhg(nhg, stappen, checks) {
  const bedrag = nhgInkomenBeschikbaar(nhg) ? nhg.toetsinkomen : null;
  stappen.push(stap('NHG-basis', 'Toetskader IKV Ondernemer 01.2026', bedrag ?? null));
  if (nhg?.status && nhg.status !== 'akkoord') {
    const oorzaken = [...(nhg.meldingen || []), ...(nhg.ondernemingen || []).flatMap((ond) => ond.checks || [])]
      .filter((x) => ['niet_akkoord', 'attentie'].includes(x.niveau ?? x.status));
    for (const oorzaak of oorzaken) checks.push(check(oorzaak.niveau ?? oorzaak.status, `NHG: ${oorzaak.tekst || oorzaak.label}`));
    if (!oorzaken.length) checks.push(check(nhg.status, 'Controleer de openstaande NHG-voorwaarden in de NHG-berekening.'));
  }
  return nhg?.status === 'niet_akkoord' ? null : bedrag ?? null;
}

function volledigeBalans(j, jd) {
  return j?.heeftBalans && (!j.aggBalans || balansOntbreekt(jd).length === 0)
    && j.TVcor > 0 && j.KVVcor >= 0 && j.VAcor >= 0;
}

function vennBalans(j, jd, voorraad, norm, naam, jaar, stappen, checks) {
  if (!volledigeBalans(j, jd)) {
    checks.push(check('attentie', `${naam}: vul de volledige balans over ${jaar} in voor de ratio’s.`));
    return;
  }
  const cr = j.KVVcor ? j.VAcor / j.KVVcor : null;
  const voorraden = j.aggBalans ? voorraadTotaal(jd?.bzi) ?? (heeftBedrag(voorraad) ? num(voorraad) : null) : j.bal?.VOORRADEN ?? null;
  const qr = j.KVVcor && voorraden !== null && voorraden >= 0 ? (j.VAcor - voorraden) / j.KVVcor : null;
  const sv = j.EVcor / j.TVcor;
  const wk = j.VAcor - j.KVVcor;
  const crTekst = cr === null ? 'geen kortlopende schuld' : `${fmt.ratio(cr)} (minimaal 1,00)`;
  const qrTekst = qr === null ? 'onbekend of niet van toepassing' : `${fmt.ratio(qr)} (minimaal 0,80)`;
  stappen.push(stap(`${naam} · ratio’s ${jaar}`, `Current ratio: ${crTekst}. Quick ratio: ${qrTekst}. Solvabiliteit: ${fmt.pct(sv)} (minimaal ${fmt.pct(norm, 0)}). Werkkapitaal: ${fmt.eur(wk)}.`, null));
  if (j.KVVcor && (voorraden === null || voorraden < 0)) checks.push(check('attentie', `${naam}: vul de voorraad en het onderhanden werk over ${jaar} in om de quick ratio te toetsen.`));
  if ((cr !== null && cr < 1) || (qr !== null && qr < 0.8) || sv < norm || (norm === 0.25 && wk <= 0)) {
    checks.push(check('niet_akkoord', `${naam}: ${jaar} voldoet niet aan de Venn-normen voor liquiditeit, quick ratio, solvabiliteit of positief werkkapitaal.`));
  }
}

function vennBox1(j, soort) {
  const bron = soort === 'IB' ? j?.ibOnd?.sfw : j?.ibOnd?.loon;
  if (!aanwezig(bron)) return null;
  if (soort === 'VPB') return num(bron) - aftrek(j);
  const baten = j.winst.neg.filter((x) => x.type === 'incidenteleBaat').reduce((som, x) => som + x.bedrag, 0);
  const overige = j.inkomen.neg.find((x) => x.label === 'Overige negatieve correctie')?.bedrag || 0;
  return num(bron) - aftrek(j) - baten * j.aandeel - overige;
}

function vennWinstVoorBelasting(j, jd, oudeVpb) {
  if (!j) return null;
  if (heeftResultaatVoorBelasting(jd) || (!j.aggVW && j.heeftResultaatinvoer)) return j.winst.RVBcor;
  return j.heeftResultaatinvoer && heeftBedrag(oudeVpb) ? j.winst.RVBcor + num(oudeVpb) : null;
}

function vennDga(ond, jaren, bronjaren, winst, bedragen, venn2025, invoer, stappen, checks) {
  const winstAanvrager = jaren.map((j, i) => winst[i] === null ? null : winst[i] * j.aandeel);
  const uitgekeerd = jaren.map((j) => aanwezig(j?.ibOnd?.dividend) ? num(j.ibOnd.dividend) : null);
  const herleidbaar = uitgekeerd.every((x) => x !== null && x >= 0);
  if (!herleidbaar) checks.push(check('attentie', 'Vul het bruto uitgekeerde dividend per toetsjaar in. Gebruik € 0 als er aantoonbaar niets is uitgekeerd.'));
  const heeftWinst = winstAanvrager.every((x) => x !== null);
  const winstCap = heeftWinst ? Math.min(gemiddelde(winstAanvrager), winstAanvrager[2]) : null;
  if (!venn2025 && herleidbaar && uitgekeerd.some((x) => x > 0) && winstCap === null) {
    checks.push(check('attentie', 'Vul de resultaten vóór belasting over drie jaren in om het uitgekeerde dividend te maximeren. Geef bij BZI-totaalposten de vennootschapsbelasting afzonderlijk op.'));
  }
  const dividend = herleidbaar && (venn2025 || winstCap !== null)
    ? Math.max(0, Math.min(gemiddelde(uitgekeerd), uitgekeerd[2], venn2025 ? Infinity : winstCap)) : 0;
  if (herleidbaar) {
    stappen.push(stap('Uitgekeerd dividend', venn2025 ? laagsteF([gemiddelde(uitgekeerd), uitgekeerd[2]])
      : `${laagsteF([gemiddelde(uitgekeerd), uitgekeerd[2]])} begrensd op gemiddelde winst vóór belasting en laatste jaar`, dividend));
  }
  let overwinst = 0;
  if (invoer.overwinst === true) {
    const controle = (ond.belangEconomisch ?? ond.aandeel) > 0.5 || invoer.zeggenschapAangetoond === true;
    if ((!venn2025 && !controle) || !herleidbaar || !heeftWinst || winstAanvrager.slice(1).some((x) => x <= 0)) {
      checks.push(check('attentie', 'Overwinst staat open. Controleer zeggenschap en dividend. Vul het resultaat vóór belasting van alle drie jaren in en toets positieve gecorrigeerde winst in beide laatste jaren.'));
    } else {
      const reserves = winstAanvrager.map((w, i) => w - uitgekeerd[i]);
      if (venn2025) {
        overwinst = Math.max(0, Math.min(0.5 * gemiddelde(reserves), reserves[2]));
        stappen.push(stap('Overwinst · oktober 2025', '50% × gemiddelde onuitgekeerde winst, maximaal de onuitgekeerde winst van het laatste jaar', overwinst));
      } else if (jaren.every((j, i) => volledigeBalans(j, bronjaren[i]))) {
        const liquiditeitsruimte = jaren.map((j) => (j.VAcor - j.KVVcor) * j.aandeel);
        const solvabiliteitsruimte = ((jaren[2].EVcor - 0.25 * jaren[2].TVcor) / 0.75) * jaren[2].aandeel;
        const ruimte = Math.max(0, Math.min(gemiddelde(reserves), reserves[2], gemiddelde(liquiditeitsruimte), liquiditeitsruimte[2], solvabiliteitsruimte));
        overwinst = ruimte * 0.75;
        stappen.push(stap('Overwinst · dubbele balanstoets', `${laagsteF([gemiddelde(reserves), reserves[2], gemiddelde(liquiditeitsruimte), liquiditeitsruimte[2], solvabiliteitsruimte])} ${g(ruimte)} × 75%`, overwinst));
        checks.push(check('attentie', 'Bevestig met de rekenexpert dat de toegerekende, resterende winst na uitgekeerd dividend blijvend kan worden onttrokken.'));
      } else checks.push(check('attentie', 'Vul de drie balansen volledig in om de gemiddelde liquiditeitsruimte en dubbele balanstoets voor overwinst te bepalen.'));
    }
  }
  return { bedrag: Math.max(0, bedragen + dividend + overwinst), dividend, overwinst };
}

function berekenVenn({ dossier, analyses, ctx, nhg, invoer = {} }) {
  const stappen = [];
  const checks = [];
  const venn2025 = invoer.bronVersie === '2025-10';
  const april2026 = invoer.bronVersie === '2026-04';
  const versie = venn2025 ? 'Oktober 2025, §7.4' : april2026 ? 'April 2026, §7.4' : 'Juli 2026, §7.4';
  const bronUrl = venn2025 ? VENN_2025 : april2026 ? VENN_APRIL : VENN_JULI;
  const resultaat = (bedrag, extra = {}) => ({
    bedrag: checks.some((x) => x.status === 'niet_akkoord') ? null : bedrag === null ? null : rond(bedrag),
    stappen, checks, versie, bronUrl, ...extra,
  });
  const onds = dossier.ondernemingen || [];
  const hoofd = analyses.find((a) => !a.parentId && !a.isDeelneming);
  const hoofdBron = onds.find((o) => o.id === hoofd?.id);
  const dochter = hoofd && onds.find((o) => o.parentId === hoofd.id);
  if (!hoofd || !hoofdBron) return resultaat(null);
  const ib = hoofd.soort === 'IB';
  const toegestaneStructuur = ib ? onds.length === 1 && ['EZ', 'VOF'].includes(hoofd.rechtsvorm)
    : hoofd.rechtsvorm === 'BV' && (onds.length === 1 || (onds.length === 2 && dochter?.rechtsvorm === 'BV' && !(dochter.extraParents || []).length));
  if (!toegestaneStructuur) {
    checks.push(check('niet_akkoord', 'Venn accepteert één eenmanszaak of vof, of een bv-structuur met maximaal één holding en één werkmaatschappij.'));
    return resultaat(null);
  }
  if (onds.some((o) => (o.land && o.land !== 'NL') || (o.belastingplichtig && o.belastingplichtig !== 'NL'))) {
    checks.push(check('niet_akkoord', 'Venn verlangt een Nederlandse vestiging en belastingplicht.'));
  } else if (onds.some((o) => !o.land || !o.belastingplichtig)) {
    checks.push(check('attentie', 'Controleer de Nederlandse vestiging en belastingplicht van alle ondernemingen.'));
  }
  if (invoer.faillissement === 'ja') checks.push(check('niet_akkoord', 'De aanvrager was bij een eerder faillissement betrokken. Venn sluit dit uit.'));
  if (!['ja', 'nee'].includes(invoer.faillissement)) checks.push(check('attentie', 'Leg vast of de aanvrager bij een eerder faillissement betrokken was.'));
  if (invoer.sector === 'uitgesloten') checks.push(check('niet_akkoord', 'De vastgelegde sector is uitgesloten volgens Venn §7.4.'));
  else if (invoer.sector === 'voorleggen') checks.push(check('attentie', 'Leg deze sector aan Venn voor en registreer de uitkomst van de beoordeling.'));
  else if (invoer.sector !== 'toegestaan') checks.push(check('attentie', 'Controleer de uitsluitingen en de sectoren die Venn wil beoordelen volgens §7.4.'));
  checks.push(check('info', 'Venn verlangt een inkomensverklaring van een geaccepteerde rekenexpert. De verklaring mag bij het kredietaanbod hoogstens zes maanden oud zijn.'));
  if (dossier.zk?.some((x) => x.status !== 'afgelost')) {
    checks.push(check('info', 'Controleer bij zakelijke kredieten of de lasten aantoonbaar in de jaarcijfers zitten. Voor BKR-code ZK kan Venn dan de last op nul zetten (§3.1.1).'));
  }
  if (invoer.nhg === true) {
    if (invoer.verhuurInOnderneming === 'ja') {
      checks.push(check('attentie', 'Venn sluit verhuurinkomen uit. Laat de rekenexpert het NHG-inkomen zonder die component bepalen.'));
      return resultaat(null);
    }
    if (invoer.verhuurInOnderneming !== 'nee') checks.push(check('attentie', 'Controleer of het NHG-inkomen opbrengsten uit verhuurd onroerend goed bevat.'));
    const bedrag = geefNhg(nhg, stappen, checks);
    return resultaat(bedrag, { methode: 'nhg', perJaar: bedrag === null ? {} : nhg?.inkomen?.perJaar });
  }
  const aanvraagDatum = dossier.datumAanvraag || ctx.datum;
  if (!hoofdBron.startdatum) checks.push(check('attentie', 'Vul de inschrijfdatum bij de KvK in voor de 36-maandentoets.'));
  else if (addMonthsISO(hoofdBron.startdatum, 36) > aanvraagDatum) checks.push(check('niet_akkoord', 'De onderneming is op de aanvraagdatum korter dan 36 maanden bij de KvK ingeschreven.'));
  if (!ib && invoer.overwinst === true && dochter) {
    if (!dochter.startdatum) checks.push(check('attentie', 'Vul de inschrijfdatum van de werkmaatschappij in voordat je overwinst meeneemt.'));
    else if (addMonthsISO(dochter.startdatum, 36) > aanvraagDatum) checks.push(check('attentie', 'De werkmaatschappij is nog geen 36 maanden ingeschreven. Laat de rekenexpert beoordelen of overwinst mag meetellen.'));
  }
  if (!ib && (hoofd.aandeel ?? 0) < 0.05 && invoer.dgaBelangFamilie !== true) {
    checks.push(check('attentie', 'Venn beoordeelt belangen onder 5% via loondienst. Bevestig eerst of het belang samen met partner en/of kinderen minstens 5% bedraagt.'));
    return resultaat(null);
  }
  if (hoofdBron.actief === false || dochter?.actief === false) {
    checks.push(check('attentie', 'Toon bij een inactieve bv aan dat de financiële afwikkeling gedragen kan worden.'));
  }

  const T = ctx.T;
  const jaren = T.map((y) => hoofd.jaren[y]);
  if (jaren.some((j, i) => j?.van !== `${T[i]}-01-01` || j?.tot !== `${T[i]}-12-31`)) {
    checks.push(check('attentie', 'De 1-2-3-methode vraagt drie volledige kalenderjaren. Leg afwijkende verslagperioden voor aan de rekenexpert.'));
    return resultaat(null);
  }
  if (jaren.some((j) => j.status === 'tussentijds' || j.meegeteld === false)) {
    checks.push(check('attentie', 'Selecteer drie afgesloten toetsjaren voor Venn.'));
    return resultaat(null);
  }
  const reeks = jaren.map((j) => vennBox1(j, hoofd.soort));
  if (reeks.some((w) => w === null)) {
    checks.push(check('attentie', `Vul voor alle drie jaren ${ib ? 'het saldo fiscale winst uit de IB-aangifte' : 'de bruto-inkomsten uit arbeid uit de onderneming'} in.`));
    return resultaat(null);
  }
  stappen.push(...reeks.map((w, i) => stap(`Box 1 ${T[i]}`, `${ib ? 'Saldo fiscale winst' : 'Arbeidsinkomen uit onderneming'} na correcties`, w)));
  const geconsolideerd = !dochter || dochter.geconsolideerd === true;
  if (!geconsolideerd) checks.push(check('attentie', 'Laat de ratio’s, geldstromen en uitkeerbare winst van holding en werkmaatschappij gezamenlijk beoordelen. Vink consolidatie alleen aan als de holdingcijfers geconsolideerd zijn.'));
  if (invoer.verhuurInOnderneming !== 'nee') {
    checks.push(check('attentie', 'Controleer of de jaarcijfers huurinkomsten bevatten. Verwijder die uit het toetsinkomen met een onderbouwde correctie.'));
  }
  const bronjaren = T.map((y) => hoofdBron.jaren?.[y]);
  const vpb = [invoer.vpbOudste, invoer.vpbMiddelste, invoer.vpbLaatste];
  const winst = jaren.map((j, i) => ib ? reeks[i] : vennWinstVoorBelasting(j, bronjaren[i], vpb[i]));
  for (const i of [1, 2]) {
    vennBalans(jaren[i], bronjaren[i], i === 1 ? invoer.voorraadMiddelste : invoer.voorraadLaatste, i === 1 ? 0.2 : 0.25, hoofd.naam, T[i], stappen, checks);
    if (winst[i] === null) checks.push(check('attentie', `Vul het resultaat vóór belasting over ${T[i]} in om de winstgevendheid te beoordelen.`));
    else if (winst[i] < 0) checks.push(check('niet_akkoord', `De gecorrigeerde winst over ${T[i]} is negatief. Venn vereist een resultaat van minstens € 0 in beide laatste kalenderjaren.`));
  }
  const daling = (vorig, actueel) => vorig > 0 ? (vorig - actueel) / vorig : 0;
  const daling1 = daling(reeks[0], reeks[1]);
  const daling2 = daling(reeks[1], reeks[2]);
  if ((daling1 >= 0.1 && daling2 >= 0.1) || (daling1 <= 0 && daling2 >= 0.15)) {
    checks.push(check('niet_akkoord', `De inkomensdaling voldoet niet aan Venn §7.4.3 (${fmt.pct(daling1)} en ${fmt.pct(daling2)}).`));
  } else if (daling1 > 0 && daling2 >= 0.15) {
    checks.push(check('attentie', `De laatste daling is ${fmt.pct(daling2)}, na een kleinere daling in het middelste jaar. Leg de toepassing van de trendregel voor aan de rekenexpert.`));
  }

  const controleJaar = hoofd.jaren[ctx.C];
  const controleBron = hoofdBron.jaren?.[ctx.C];
  let tussenResultaat = null;
  if (ctx.C === ctx.jaarNu) {
    tussenResultaat = ib
      ? controleJaar?.heeftResultaatinvoer ? controleJaar.winst.RVBcor : null
      : vennWinstVoorBelasting(controleJaar, controleBron);
  }
  if (opOfNa(ctx.datum, 7, 1)) {
    if (tussenResultaat === null) checks.push(check('attentie', 'Venn verlangt vanaf 1 juli inzicht in de winstgevendheid van het lopende jaar. Vul de tussentijdse winst-en-verliesrekening in.'));
    else if (tussenResultaat < 0) checks.push(check('niet_akkoord', 'Het gerealiseerde tussentijdse resultaat is negatief. Vanaf 1 juli geldt de winsttoets over het lopende jaar.'));
  }
  if ((venn2025 || april2026) && ib && opOfNa(ctx.datum, 8, 1) && tussenResultaat !== null) {
    const jaarbasis = (tussenResultaat * controleJaar.aandeel - aftrek(controleJaar)) * controleJaar.factor;
    stappen.push(stap('Controle tussentijds op jaarbasis', `${g(tussenResultaat * controleJaar.aandeel - aftrek(controleJaar))} × ${controleJaar.factor}, minimaal ${g(reeks[2])}`, jaarbasis));
    if (jaarbasis < reeks[2]) checks.push(check('niet_akkoord', 'Voor deze versie van de Venn-gids moet het geëxtrapoleerde resultaat vanaf 1 augustus minstens gelijk zijn aan het voorgaande jaar.'));
  }
  let box1 = vennWeging(reeks);
  if (invoer.tussentijdsVervangen === true) {
    const controleBalans = controleJaar?.heeftBalans
      && (!controleJaar.aggBalans || balansOntbreekt(controleBron).length === 0);
    if (!opOfNa(ctx.datum, 8, 1) || tussenResultaat === null || !controleBalans) {
      checks.push(check('attentie', 'Vervanging op verzoek kan vanaf 1 augustus met gerealiseerde cijfers, een tussentijdse balans en controle van de btw-aangiften.'));
    } else if (!ib && !aanwezig(controleJaar.ibOnd?.loon)) {
      checks.push(check('attentie', 'Vul het gerealiseerde arbeidsinkomen uit onderneming over het lopende jaar in voor vervanging.'));
    } else {
      const gerealiseerd = ib ? tussenResultaat * controleJaar.aandeel - aftrek(controleJaar) : num(controleJaar.ibOnd.loon) - aftrek(controleJaar);
      const begrensd = Math.min(gerealiseerd, reeks[2]);
      box1 = vennWeging([reeks[1], reeks[2], begrensd]);
      stappen.push(stap('Vervanging op verzoek', `Gerealiseerd ${ctx.C}, maximaal het inkomen over ${T[2]}. Rekenvariant met ${T[1]}, ${T[2]} en ${ctx.C}.`, begrensd));
      checks.push(check('attentie', 'Laat de rekenexpert de gebruikte jaren bij tussentijdse vervanging bevestigen.'));
    }
  }
  stappen.push(stap('Gewogen inkomen', box1.formule, box1.gemiddelde));
  stappen.push(stap('Box 1 na plafond laatste jaar', 'Laagste van het gewogen gemiddelde en het inkomen van het laatste meegewogen jaar', box1.bedrag));
  const perJaar = Object.fromEntries(T.map((y, i) => [y, reeks[i]]));
  if (ib || !geconsolideerd) return resultaat(box1.bedrag, { box1: box1.bedrag, perJaar });
  const duurVastgesteld = hoofdBron.startdatum && addMonthsISO(hoofdBron.startdatum, 36) <= aanvraagDatum
    && (!dochter || (dochter.startdatum && addMonthsISO(dochter.startdatum, 36) <= aanvraagDatum));
  const dga = vennDga(hoofd, jaren, bronjaren, winst, box1.bedrag, venn2025, { ...invoer, overwinst: duurVastgesteld && invoer.overwinst }, stappen, checks);
  return resultaat(dga.bedrag, { box1: box1.bedrag, box2: rond(dga.dividend + dga.overwinst), perJaar });
}

function ingRekeningCourant(dossier, invoer, stappen, checks) {
  const { saldo, limiet } = dossier.rc || {};
  if (!aanwezig(saldo) || num(saldo) <= 0) return { maandlast: 0, tekst: '' };
  if (num(saldo) < 17500) {
    stappen.push(stap('ING · rekening-courant directie', `${g(saldo)} is lager dan € 17.500. De last mag buiten beschouwing blijven (§3.1.4).`, 0));
    return { maandlast: 0, saldo: num(saldo), tekst: 'Saldo onder € 17.500. De last mag bij ING buiten beschouwing blijven.' };
  }
  if (!aanwezig(limiet) || num(limiet) < num(saldo)) {
    checks.push(check('attentie', 'Vul de overeengekomen limiet van rekening-courant directie in voor de ING-lastentoets.'));
    return { maandlast: 0, saldo: num(saldo), tekst: '' };
  }
  const minimum = num(limiet) * 0.03;
  const bekend = aanwezig(invoer.rcJaarlast) && num(invoer.rcJaarlast) >= 0;
  const werkelijkeLast = bekend ? num(invoer.rcJaarlast) : null;
  const uitzondering = invoer.rcAflossingAangetoond === true && String(invoer.rcOnderbouwing || '').trim() !== '';
  const jaarlast = uitzondering && bekend ? werkelijkeLast : Math.max(minimum, werkelijkeLast ?? 0);
  const grondslag = uitzondering && bekend && werkelijkeLast < minimum
    ? 'Werkelijke last, aflossing ineens onderbouwd'
    : bekend ? `Hoogste van ${fmt.eur(werkelijkeLast)} en 3% × ${fmt.eur(num(limiet))}`
      : `Minimum 3% × ${fmt.eur(num(limiet))}. Werkelijke last nog te bevestigen.`;
  const maandlast = jaarlast / 12;
  const tekst = `${grondslag}. ${fmt.eur(maandlast, 2)} per maand volgens ING §3.1.4.`;
  if (!bekend) checks.push(check('attentie', 'Vul de werkelijke jaarlast van rekening-courant directie in. ZIB toont nu de berekende minimumlast.'));
  if (invoer.rcAflossingAangetoond === true && !uitzondering) checks.push(check('attentie', 'Onderbouw aflossing ineens uit privévermogen na de hypotheek of uit een duurzame dividenduitkering.'));
  stappen.push(stap('ING · rekening-courant directie per maand', `${grondslag}. Jaarlast / 12. Opnemen bij de financieringslast.`, maandlast));
  return { maandlast, saldo: num(saldo), tekst };
}

function berekenIng({ dossier, analyses, ctx, nhg, invoer = {} }) {
  const stappen = [];
  const checks = [];
  const mee = analyses.filter((a) => a.meenemen !== false && !a.geconsolideerd && !a.isDeelneming);
  const rc = ingRekeningCourant(dossier, invoer, stappen, checks);
  const resultaat = (bedrag, extra = {}) => ({ bedrag, stappen, checks, rc, ...extra });
  if (!mee.length) return resultaat(null);
  const T = ctx.T;
  const starter = invoer.ondernemersduur === 'starter' || (invoer.ondernemersduur !== 'drie' && mee.some((a) => a.start && a.start > `${T[0]}-12-31`));
  if (invoer.nhg === true || starter) {
    if (starter) checks.push(check('info', 'ING volgt het NHG-toetskader bij minder dan drie boekjaren als ondernemer (§2.3.3).'));
    const bedrag = geefNhg(nhg, stappen, checks);
    return resultaat(bedrag, { methode: 'nhg', perJaar: bedrag === null ? {} : nhg?.inkomen?.perJaar, documenten: nhg?.documenten });
  }
  const ib = mee.filter((a) => a.soort === 'IB');
  const dga = mee.filter((a) => a.soort === 'VPB');
  let box1 = 0;
  let box2 = 0;
  let perJaar = {};
  if (ib.length) {
    if (ib.some((a) => !['EZ', 'VOF', 'MTS'].includes(a.rechtsvorm))) {
      checks.push(check('attentie', 'De ING-basisformule in §2.3.1 is beschreven voor een eenmanszaak, vof of maatschap. Leg deze rechtsvorm voor aan ING.'));
      return resultaat(null);
    }
    const sfw = T.map((y) => ib.map((a) => a.jaren[y]?.ibOnd?.sfw));
    if (sfw.some((j) => j.some((w) => !aanwezig(w)))) {
      checks.push(check('attentie', 'Vul het saldo fiscale winst in uit de laatste drie ingediende IB-aangiften, ook als een saldo € 0 is.'));
      return resultaat(null);
    }
    const totaal = sfw.map((j) => j.reduce((som, w) => som + num(w), 0));
    if (!dga.length) perJaar = Object.fromEntries(T.map((y, i) => [y, totaal[i]]));
    const gemiddeld = gemiddelde(totaal);
    stappen.push(stap('Gemiddelde saldo fiscale winst', lijstF(totaal, 3), gemiddeld));
    box1 = Math.max(0, Math.min(gemiddeld, totaal[2]));
    stappen.push(stap('IB-inkomen · plafond laatste jaar', laagsteF([gemiddeld, totaal[2]]), box1));
  }
  if (dga.length) {
    if (dga.some((a) => T.some((y) => !aanwezig(a.jaren[y]?.ibOnd?.loon) || !a.jaren[y]?.heeftBalans || !a.jaren[y]?.heeftResultaatinvoer))) {
      checks.push(check('attentie', 'Onderbouw het DGA-inkomen met het fiscale arbeidsinkomen en de jaarrapporten (balans en resultaat) over alle drie boekjaren.'));
    }
    const deelnemingen = (dossier.ondernemingen || []).filter((o) => o.rechtsvorm === 'BV' || o.rechtsvorm === 'NV');
    if (deelnemingen.length > 2 && deelnemingen.some((o) => o.parentId && Number(o.aandeelPct) === 100)) {
      checks.push(check('attentie', 'Voeg bij de meervoudige bv-structuur met een 100%-deelneming het organogram en de geconsolideerde jaarrekening toe.'));
    }
    const lonen = T.map((y) => dga.map((a) => a.jaren[y]?.ibOnd?.loon));
    const totaalLoon = lonen.every((j) => j.every(aanwezig)) ? lonen.map((j) => j.reduce((som, w) => som + num(w), 0)) : null;
    const loonHandmatig = aanwezig(invoer.arbeidsinkomenDga) && num(invoer.arbeidsinkomenDga) >= 0;
    if (!loonHandmatig && totaalLoon === null) {
      checks.push(check('attentie', 'Vul het arbeidsinkomen uit de eigen onderneming over drie jaren in of leg het onderbouwde bestendige jaarbedrag vast.'));
      return resultaat(null);
    }
    const loon = loonHandmatig ? num(invoer.arbeidsinkomenDga) : Math.max(0, Math.min(gemiddelde(totaalLoon), totaalLoon[2]));
    if (loonHandmatig) stappen.push(stap('DGA · arbeidsinkomen', `100% × ${g(loon)} (onderbouwd jaarbedrag)`, loon));
    else {
      stappen.push(stap('DGA · gemiddelde arbeidsinkomsten', lijstF(totaalLoon, 3), gemiddelde(totaalLoon)));
      stappen.push(stap('DGA · indicatief arbeidsinkomen', `100% × laagste van driejaarsgemiddelde en laatste jaar. Laat de bestendigheid beoordelen.`, loon));
      if (!ib.length) perJaar = Object.fromEntries(T.map((y, i) => [y, totaalLoon[i]]));
    }
    box1 += loon;
    if (num(invoer.uitkeerbareWinst) > 0 && invoer.bestendigheidBevestigd === true && String(invoer.onderbouwing || '').trim()) {
      box2 = num(invoer.uitkeerbareWinst);
      stappen.push(stap('DGA · uitkeerbare winst', 'Aan de aanvrager toekomend jaarbedrag met vastgelegde onderbouwing van duurzame onttrekking', box2));
    } else if (num(invoer.uitkeerbareWinst) > 0) {
      checks.push(check('attentie', 'De uitkeerbare winst telt mee zodra de bestendigheid is bevestigd en de beoordeling van winst en balans is onderbouwd.'));
    }
  }
  checks.push(check('attentie', 'ING kan de uitkomst bijstellen op basis van de representativiteit van de winst, bestendigheid en balanspositie. Leg de beoordeling vast.'));
  return resultaat(rond(box1 + box2), { box1: rond(box1), box2: rond(box2), perJaar });
}

export const VENN_ING = [
  {
    id: 'VENN', kort: 'Venn', methode: 'eigen', basis: 'NHG', versie: 'Juli 2026, §7.4',
    ikvOptioneel: true, ikvGeldigheid: 6,
    bron: 'Venn Kredietgids §7.4',
    bronUrl: VENN_JULI,
    bronStatus: 'Kies de toepasselijke beleidsversie. De berekening blijft een concept voor de rekenexpert.',
    regels: [
      'Zonder NHG: minimaal 36 maanden KvK en het gewogen gemiddelde van drie kalenderjaren (1-2-3), begrensd op het laatste jaar.',
      'Laatste twee jaren: current ratio minimaal 1,00, quick ratio minimaal 0,80 en solvabiliteit 20% in het middelste jaar en 25% in het laatste jaar. Vanaf 1 juli controle op het gerealiseerde resultaat.',
      'Laat aannemers, transportbedrijven en handel in onroerend goed altijd door Venn beoordelen. Controleer de uitgesloten sectoren in §7.4.',
      'In april en juli 2026 geldt voor overwinst een dubbele balanstoets met een afslag van 25%. In de bijlage van oktober 2025 wordt 50% van de gemiddelde onuitgekeerde winst gehanteerd, begrensd op het laatste jaar.',
      'Bij NHG gelden aanvullend de structuur- en sectorvoorwaarden van Venn en blijft huurinkomen buiten beschouwing.',
    ],
    documenten: [
      { categorie: 'ikv', naam: 'Inkomensverklaring van een geaccepteerde rekenexpert', wanneer: 'Maximaal zes maanden oud op datum kredietaanbod' },
      { categorie: 'jaarrekening', naam: 'Jaarcijfers van de laatste drie kalenderjaren', wanneer: 'Balans en winst-en-verliesrekening. Laat de IB-uitzondering beoordelen door de rekenexpert.', aantal: 3 },
      { categorie: 'ib_aangifte', naam: 'IB-aangiften over drie jaren', wanneer: 'Saldo fiscale winst of arbeidsinkomen en dividend', aantal: 3 },
      { categorie: 'tussentijds', naam: 'Tussentijdse winst-en-verliesrekening, balans en btw-aangiften', wanneer: 'Vanaf juli voor winstgevendheid. Vanaf augustus bij vervanging op verzoek.', verplicht: false },
    ],
    extraVelden: [
      { key: 'bronVersie', label: 'Kredietgids Venn', type: 'keuze', standaard: '2026-07', opties: { '2026-07': 'Juli 2026 (standaard)', '2026-04': 'April 2026', '2025-10': 'Oktober 2025 (bijlage)' } },
      { key: 'sector', label: 'Uitkomst sectorcontrole Venn', type: 'keuze', opties: { toegestaan: 'Toegestaan', voorleggen: 'Voorleggen aan Venn', uitgesloten: 'Uitgesloten' } },
      { key: 'faillissement', label: 'Aanvrager betrokken bij eerder faillissement', type: 'keuze', opties: { nee: 'Nee', ja: 'Ja' } },
      { key: 'verhuurInOnderneming', label: 'Huurinkomsten in de gebruikte cijfers', type: 'keuze', opties: { nee: 'Nee / gecorrigeerd', ja: 'Ja' } },
      { key: 'voorraadMiddelste', label: 'Voorraad + onderhanden werk middelste jaar', type: 'bedrag', hint: 'Bij invoer via balanstotalen. Vul 0 in als de post ontbreekt op de balans.' },
      { key: 'voorraadLaatste', label: 'Voorraad + onderhanden werk laatste jaar', type: 'bedrag', hint: 'Bij invoer via balanstotalen. Vul 0 in als de post ontbreekt op de balans.' },
      { key: 'dgaBelangFamilie', label: 'DGA-belang incl. partner en kinderen minstens 5%', type: 'bool', hint: 'Gebruik bij persoonlijk belang onder 5%.' },
      { key: 'overwinst', label: 'Onderzoek overwinst bij DGA', type: 'bool' },
      { key: 'zeggenschapAangetoond', label: 'Zeggenschap of voldoende invloed aangetoond', type: 'bool', hint: 'Bij overwinst en een belang tot en met 50%.' },
      { key: 'vpbOudste', label: 'Vennootschapsbelasting oudste jaar', type: 'bedrag', hint: 'Alleen bij DGA en BZI-totaalposten.' },
      { key: 'vpbMiddelste', label: 'Vennootschapsbelasting middelste jaar', type: 'bedrag', hint: 'Alleen bij DGA en BZI-totaalposten.' },
      { key: 'vpbLaatste', label: 'Vennootschapsbelasting laatste jaar', type: 'bedrag', hint: 'Alleen bij DGA en BZI-totaalposten.' },
      { key: 'tussentijdsVervangen', label: 'Tussentijdse cijfers meenemen op verzoek', type: 'bool' },
    ],
    bereken: berekenVenn,
  },
  {
    id: 'ING', kort: 'ING', methode: 'eigen', basis: 'NHG', versie: '2026-1/2026-2, §2.3 en §3.1.4',
    ikvOptioneel: true,
    bron: 'ING Hypotheken Acceptatiebeleid (bijlage januari 2026, vergeleken met juni 2026)',
    bronUrl: ING_2026,
    bronStatus: 'De regels voor ondernemersinkomen komen overeen in de geraadpleegde versies januari en juni 2026. Raadpleeg voor een latere aanvraag het geldende ING-beleid.',
    regels: [
      'IB-ondernemer: gemiddelde van het saldo fiscale winst uit de laatste drie ingediende IB-aangiften, begrensd op het laatste boekjaar.',
      'DGA: 100% van het beoordeelde arbeidsinkomen uit de onderneming, eventueel plus aantoonbaar duurzaam uitkeerbare winst.',
      'Voor starters met minder dan drie boekjaren volgt ING NHG. ING accepteert ook een inkomensverklaring van een geaccepteerde rekenexpert.',
      'Rekening-courant directie vanaf € 17.500: werkelijke jaarlast, minimaal 3% van de limiet. Een lagere werkelijke last vereist aantoonbare aflossingsruimte.',
    ],
    documenten: [
      { categorie: 'ib_aangifte', naam: 'Ingediende IB-aangiften', wanneer: 'Drie boekjaren bij gevestigde ondernemers. Bij starters volgt de stukkenlijst het NHG-kader.', aantal: 3 },
      { categorie: 'jaarrekening', naam: 'Jaarrapporten met balans en winst-en-verliesrekening', wanneer: 'Voor de DGA-toets en beoordeling van bestendigheid en balanspositie', aantal: 3 },
      { categorie: 'organogram', naam: 'Organogram en geconsolideerde jaarrekening', wanneer: 'Verplicht bij een meervoudige bv-structuur met 100%-deelneming', verplicht: false },
    ],
    extraVelden: [
      { key: 'ondernemersduur', label: 'Afgesloten boekjaren als ondernemer', type: 'keuze', standaard: 'auto', opties: { auto: 'Afleiden uit startdatum', starter: 'Minder dan drie', drie: 'Drie of meer' } },
      { key: 'arbeidsinkomenDga', label: 'Onderbouwd arbeidsinkomen DGA per jaar', type: 'bedrag', hint: 'Arbeidsinkomen uit de eigen onderneming, vastgesteld aan de hand van de drie IB-aangiften en jaarrapporten.' },
      { key: 'uitkeerbareWinst', label: 'Onderbouwde uitkeerbare winst per jaar', type: 'bedrag', hint: 'Vul het bedrag in dat de aanvrager toekomt en blijvend kan worden onttrokken.' },
      { key: 'bestendigheidBevestigd', label: 'Winst en balanspositie beoordeeld op duurzame onttrekking', type: 'bool' },
      { key: 'onderbouwing', label: 'Onderbouwing uitkeerbare winst', type: 'tekst' },
      { key: 'rcJaarlast', label: 'Werkelijke jaarlast rekening-courant directie', type: 'bedrag', hint: 'Vul saldo en overeengekomen limiet in bij Rekening-courant directie.' },
      { key: 'rcAflossingAangetoond', label: 'Aflossing ineens van rekening-courant aangetoond', type: 'bool' },
      { key: 'rcOnderbouwing', label: 'Onderbouwing aflossing rekening-courant', type: 'tekst' },
    ],
    bereken: berekenIng,
  },
];
