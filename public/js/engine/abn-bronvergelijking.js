import { gemiddelde, rond2 } from '../util.js';
import { balansOntbreekt, heeftBedrag, heeftVW } from './financieel.js';

const getal = (waarde) => heeftBedrag(waarde) ? Number(waarde) : null;

function ontvangenMinderheidsdividend(ouder, jaar, opties, perId, structuur, zeggenschap, opgenomenInBron) {
  const j = ouder.jaren?.[jaar] || {};
  const aandeelOuder = zeggenschap(ouder.id, jaar)?.belangJaar(jaar) ?? 0;
  const kandidaten = structuur.kinderen(ouder.id).filter((link) => link.pctJaar(jaar) > 0);
  const minderheidsLinks = kandidaten.filter((link) => {
    const kind = perId.get(link.kind);
    const belang = zeggenschap(link.kind, jaar);
    return kind?.soort === 'VPB' && !opgenomenInBron(kind) && !kind.geconsolideerd && belang?.keten === false && belang.belangJaar(jaar) <= 0.5;
  });
  if (!opties.minderheidsdividendInWinst || aandeelOuder <= 0) return 0;
  const totaal = getal(j.geldstroom?.totaalOntvangenDividend);
  if (totaal === 0) return 0;
  if (!minderheidsLinks.length) return totaal !== null && totaal > 0 ? null : 0;
  if (!opties.nettowinstExclusiefDeelnemingen) return null;

  let nominaal = 0;
  let aantoonbaar = 0;
  let heeftAlleOntvangsten = true;
  let bekendeOntvangsten = 0;
  for (const link of minderheidsLinks) {
    const kind = perId.get(link.kind);
    const betaald = getal(kind.jaren?.[jaar]?.geldstroom?.internDividendBron);
    const ontvangen = getal(j.geldstroom?.ontvangenDividend?.[link.kind]);
    if (betaald === null || betaald < 0 || (ontvangen !== null && ontvangen < 0)) return null;
    const aandeel = link.pctJaar(jaar);
    nominaal += betaald * aandeel;
    heeftAlleOntvangsten &&= ontvangen !== null || betaald === 0;
    aantoonbaar += Math.min(betaald * aandeel, ontvangen ?? 0);
    bekendeOntvangsten += ontvangen ?? 0;
  }
  if (heeftAlleOntvangsten && (totaal === null || bekendeOntvangsten <= totaal + 0.01)) return rond2(aantoonbaar * aandeelOuder);

  // Een bevestigd ontvangertotaal blijft één bedrag. Alleen als alle mogelijke betalende
  // deelnemingen in dit jaar aan de route voldoen, is het groepsdeel zonder verdeling te begrenzen.
  if (totaal === null || totaal < 0 || bekendeOntvangsten > totaal + 0.01 || minderheidsLinks.length !== kandidaten.length) return null;
  return rond2(Math.min(totaal, nominaal) * aandeelOuder);
}

/** Onafhankelijke herberekening van het horizontale groepsmodel uit het bronwerkboek. */
export function vergelijkAbnBronmodel(d, ctx, analyses, st, dga, zeggenschap, overigeInkomsten = 0) {
  const opties = d.abnGroep;
  if (!opties || ctx.kaderId !== 'ABN' || ctx.soort !== 'IKV') return null;
  const { T } = ctx;
  const laatste = T.at(-1);
  const perId = new Map(analyses.map((a) => [a.id, a]));
  const ondernemingen = new Map((d.ondernemingen || []).map((o) => [o.id, o]));
  const uitgesloten = Array.isArray(opties.uitgeslotenOndernemingen) ? new Set(opties.uitgeslotenOndernemingen) : null;
  const opgenomenInBron = (a) => uitgesloten ? !uitgesloten.has(a.id) : a.meenemen;
  const relevanteBV = new Set(analyses.filter((a) => a.soort === 'VPB' && opgenomenInBron(a) && !a.geconsolideerd && ondernemingen.get(a.id)?.actief !== false).map((a) => a.id));
  const open = [];
  const perJaar = {};
  if (dga?.factor !== 1 || !dga.compleet || !T.every((jaar) => Number.isFinite(dga.perJaar[jaar]?.inkomen))) open.push('De herleidbare loonreeks voor drie volledige boekjaren ontbreekt.');
  if ([...relevanteBV].some((id) => ondernemingen.get(id)?.holdingroute)) open.push('De ingestelde holdingroute wijkt af van dit horizontale bronmodel.');
  const ibOndernemingen = analyses.filter((a) => a.soort === 'IB' && opgenomenInBron(a) && !a.geconsolideerd && ondernemingen.get(a.id)?.actief !== false);
  for (const jaar of T) {
    let winst = 0;
    let uitgekeerd = 0;
    let minderheidsdividend = 0;
    let uitkeringUitWinst = 0;
    let liquiditeitsruimte = 0;
    let solvabiliteitsruimte = 0;
    let balansCompleet = true;
    let winstAanwezig = false;
    for (const a of analyses.filter((x) => x.soort === 'VPB')) {
      const j = a.jaren[jaar];
      const o = ondernemingen.get(a.id);
      if (!j?.actief || !j.meegeteld || o?.actief === false) continue;
      const belang = zeggenschap(a.id, jaar)?.belangJaar(jaar) ?? 0;
      if (belang <= 0) continue;
      const brutoUit = getal(j.geldstroom?.dividendPriveBruto);
      const priveUit = getal(j.ibOnd?.dividend);
      const direct = st.hoofden.find((h) => h.id === a.id)?.pctJaar(jaar) ?? 0;
      const toegerekend = brutoUit !== null ? brutoUit * direct : priveUit ?? 0;
      if (direct > 0 && brutoUit !== null && priveUit !== null && Math.abs(toegerekend - priveUit) > 0.01) {
        open.push(`${jaar}: het uitgekeerde dividend van ${a.naam} sluit niet aan op de privé-aangifte.`);
      }
      if (direct > 0) uitgekeerd += toegerekend;
      if (!relevanteBV.has(a.id)) continue;
      uitkeringUitWinst += toegerekend;
      if (!j.heeftResultaatinvoer) open.push(`${jaar}: nettowinst ontbreekt bij ${a.naam}.`);
      else {
        const afschrijvingOnbekend = ctx.kader.cashflowCorrectie && Number(j.div.aflossingenLVV) > 0 && !j.div.cashflowNietToepassen
          && !(o.jaren?.[jaar]?.winstCorrecties || []).some((x) => x.type === 'cashflow' && heeftBedrag(x.bedrag))
          && !heeftVW(j.vwRuw) && !heeftBedrag(o.jaren?.[jaar]?.bzi?.afschrijvingen);
        if (afschrijvingOnbekend) open.push(`${jaar}: afschrijvingen ontbreken voor de cashflowcorrectie bij ${a.naam}.`);
        winst += j.winst.NWcor * belang;
        winstAanwezig = true;
      }
      const dividend = ontvangenMinderheidsdividend(a, jaar, opties, perId, st, zeggenschap, opgenomenInBron);
      if (dividend === null) open.push(`${jaar}: ontvangen minderheidsdividend bij ${a.naam} vraagt een aansluiting op de betaalde dividenden en de belangen.`);
      else minderheidsdividend += dividend;
      if (balansOntbreekt(o?.jaren?.[jaar]).length || j.liqRuimte === null || (direct > 0 && j.solvRuimte === null)) balansCompleet = false;
      else {
        liquiditeitsruimte += j.liqRuimte * belang;
        if (direct > 0) solvabiliteitsruimte += j.solvRuimte * direct;
      }
    }
    if (!winstAanwezig) open.push(`${jaar}: geen onderbouwde nettowinst voor de meegetelde BV’s.`);
    const netto = rond2(winst + minderheidsdividend);
    perJaar[jaar] = { dga: dga?.perJaar[jaar]?.inkomen ?? null, winst: rond2(winst), minderheidsdividend: rond2(minderheidsdividend), netto,
      uitgekeerd: rond2(uitgekeerd), nietUitgekeerd: rond2(netto - uitkeringUitWinst),
      uitkeringsruimte: balansCompleet ? rond2(Math.max(0, Math.min(liquiditeitsruimte, solvabiliteitsruimte))) : null };
  }
  const l = perJaar[laatste];
  if (opties.overwinstMeenemen && opties.uitkeringsruimteMaximeren && l.uitkeringsruimte === null) open.push(`${laatste}: de balans voor de groepsuitkeringstoets is onvolledig.`);
  if (open.length) return { perJaar, open: [...new Set(open)], horizontaal: null };

  const gemiddeldeVan = (key) => gemiddelde(T.map((jaar) => perJaar[jaar][key]));
  const winstplafond = Math.max(0, Math.min(gemiddeldeVan('netto'), l.netto));
  const uitgekeerd = Math.max(0, Math.min(gemiddeldeVan('uitgekeerd'), l.uitgekeerd, winstplafond));
  const ruimte = opties.uitkeringsruimteMaximeren ? l.uitkeringsruimte : Infinity;
  const nietUitgekeerd = opties.overwinstMeenemen ? Math.max(0, Math.min(gemiddeldeVan('nietUitgekeerd'), l.nietUitgekeerd, winstplafond - uitgekeerd, ruimte)) : 0;
  // Overzicht!C63:F67: begrens box 2 per kolom en pas het laatste-jaarplafond op het totaal toe.
  // De bronimport bevat de vertaling van de BV-route. Een IB-onderneming vraagt haar eigen bronkeuzes.
  const verticaleBox2 = (betaald, over, plafond) => Math.max(0, Math.min(
    betaald + (opties.overwinstMeenemen ? over : 0), plafond,
    opties.overwinstMeenemen ? Math.min(betaald, plafond) + ruimte : Infinity,
  ));
  const rowPerJaar = T.map((jaar) => getal(d.ib?.[jaar]?.row) ?? 0);
  const verticaalGemiddeld = gemiddeldeVan('dga') + verticaleBox2(gemiddeldeVan('uitgekeerd'), gemiddeldeVan('nietUitgekeerd'), winstplafond) + gemiddelde(rowPerJaar);
  const verticaalLaatste = l.dga + verticaleBox2(l.uitgekeerd, l.nietUitgekeerd, Infinity) + rowPerJaar.at(-1);
  const verticaal = ibOndernemingen.length ? null : rond2(Math.min(verticaalGemiddeld, verticaalLaatste));
  return { perJaar, open: [], dga: dga.toetsinkomen, overigeInkomsten, uitgekeerd: rond2(uitgekeerd), nietUitgekeerd: rond2(nietUitgekeerd),
    winstplafond: rond2(winstplafond), uitkeringsruimte: l.uitkeringsruimte, horizontaal: rond2(dga.toetsinkomen + overigeInkomsten + uitgekeerd + nietUitgekeerd),
    verticaal, verticaalGemiddeld: verticaal === null ? null : rond2(verticaalGemiddeld), verticaalLaatste: verticaal === null ? null : rond2(verticaalLaatste) };
}

export function kiesAbnVaststelling(d, vergelijking) {
  const keuze = d.instellingen?.abnVaststelling;
  const methode = keuze === 'verticaal' || keuze === 'horizontaal' ? keuze : vergelijking ? 'horizontaal' : null;
  if (!methode) return null;
  const horizontaal = vergelijking?.horizontaal ?? null;
  const verticaal = vergelijking?.verticaal ?? null;
  const bedrag = methode === 'horizontaal' ? horizontaal : verticaal;
  return { methode, bedrag, bron: bedrag === null ? 'open' : 'herberekend', horizontaal, verticaal };
}
