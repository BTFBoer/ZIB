import { heeftBalans, heeftBedrag } from '../engine/financieel.js';
import { rekenInvoerStatus } from '../engine/reken-invoer.js';
import { esc, fmt, gemiddelde } from '../util.js';
import { heeftControleperiode, kerninvoerPad } from './kerninvoer.js';
import { icoon, pil } from './ui.js';
import { hoofduitkomst } from './uitkomst.js';

const LEEG = '—';
const geld = (v) => Number.isFinite(v) ? fmt.eur(v, Number.isInteger(v) ? 0 : 2) : LEEG;
const opmaak = (v, fn) => Number.isFinite(v) ? fn(v) : LEEG;
const gem = (lijst) => lijst.length && lijst.every(Number.isFinite) ? gemiddelde(lijst) : null;
const samen = (...bedragen) => {
  const bekend = bedragen.filter(Number.isFinite);
  return bekend.length ? bekend.reduce((som, v) => som + v, 0) : null;
};

function kolom(label, toelichting = '') {
  return `<th scope="col" class="num">${esc(label)}${toelichting ? `<small>${esc(toelichting)}</small>` : ''}</th>`;
}

function geldcel(v, klasse = '') {
  return `<td class="num${klasse ? ` ${klasse}` : ''}">${esc(geld(v))}</td>`;
}

function bronJaar(d, a, jaar) {
  return d.ondernemingen?.find((o) => o.id === a.id)?.jaren?.[jaar];
}

function heeftJaarinkomen(a, jaar) {
  const j = a.jaren?.[jaar];
  if (!j?.actief) return false;
  if (a.soort === 'VPB') return heeftBedrag(j.ibOnd?.loon) || heeftBedrag(j.vwRuw?.salarisDGA);
  return heeftBedrag(j.ibOnd?.sfw) || j.heeftResultaatinvoer;
}

function inkomensPosten(d, r, a, p) {
  const i = r.inkomen;
  const b2 = a.box2;
  const isVpb = a.soort === 'VPB';
  const gezamenlijk = isVpb && !!i?.dgaGezamenlijk;
  const box1 = (y) => !gezamenlijk && heeftJaarinkomen(a, y) ? a.jaren[y].inkomen.totaal : null;
  const dividend = (y) => {
    const j = a.jaren?.[y];
    if (!isVpb || !j?.actief) return null;
    if (b2?.holding) return b2.holding.perJaar[y] ?? null;
    if (heeftBedrag(j.ibOnd?.dividend)) return Number(j.ibOnd.dividend);
    const bruto = j.geldstroom?.dividendPriveBruto;
    return !a.isDeelneming && heeftBedrag(bruto) ? Number(bruto) * j.aandeel : null;
  };
  const overwinst = (y) => a.jaren?.[y]?.heeftResultaatinvoer ? b2?.overwinst?.ow?.[y] ?? null : null;
  // Optimaal telt het aandeel in de winst na Vpb van vennootschappen met zeggenschap per jaar mee (look-through).
  const winstaandeel = (y) => b2?.model === 'OPT' && b2.keten && a.jaren?.[y]?.actief && Number.isFinite(Number(b2.P?.[y])) ? Number(b2.P[y]) : null;
  const jaren = r.T.filter((y) => a.jaren?.[y]?.meegeteld);
  const C = r.C;
  const heeftC = C && heeftControleperiode(bronJaar(d, a, C) || {}, C, r.datum);
  const extrapolatie = heeftC && Number.isFinite(box1(C)) ? a.jaren[C].inkomen.extr : null;
  const gemiddeldBox1 = gem(jaren.map(box1));
  const gemiddeldeDividend = gem(jaren.map(dividend));
  const gemiddeldeOverwinst = gem(jaren.map(overwinst));
  const gebruikDividend = Number.isFinite(gemiddeldeDividend);
  const gebruikOverwinst = Number.isFinite(gemiddeldeOverwinst);
  const toetsBox1 = Number.isFinite(gemiddeldBox1) ? p?.toets ?? p?.gemiddelde ?? null : null;
  const toetsDividend = gebruikDividend && b2?.toegestaan ? (b2.holding ? b2.totaal : p?.uitgekeerdDividend ?? b2.route1 ?? b2.gemDividend ?? null) : null;
  const toetsOverwinst = gebruikOverwinst && b2?.toegestaan ? p?.overwinstMee ?? b2.route2 ?? b2.winstNaDbt ?? null : null;
  const jaarBedrag = (y) => {
    if (r.beleid && r.ondernemingen.length === 1 && Number.isFinite(r.beleid.perJaar?.[y])) return r.beleid.perJaar[y];
    if (r.familie === 'ABN' || b2?.dividendInTotaal) return samen(box1(y), dividend(y));
    if (Number.isFinite(winstaandeel(y))) return samen(box1(y), winstaandeel(y));
    return box1(y);
  };
  const metWinstaandeel = jaren.some((y) => Number.isFinite(winstaandeel(y)));
  return {
    jaarBedrag, extrapolatie, gemiddeld: gem(jaren.map(jaarBedrag)),
    posten: [
      { label: 'Box 1 inkomen', jaar: box1, gemiddelde: gemiddeldBox1, gecorrigeerd: toetsBox1, extrapolatie },
      { label: 'Box 2 inkomen dividend', jaar: dividend, gemiddelde: gemiddeldeDividend, gecorrigeerd: toetsDividend },
      ...(metWinstaandeel
        ? [{ label: 'Aandeel winst na Vpb (Optimaal)', jaar: winstaandeel, gemiddelde: gem(jaren.map(winstaandeel)), gecorrigeerd: p?.box2 ?? null }]
        : [{ label: 'Box 2 inkomen overwinst', jaar: overwinst, gemiddelde: gemiddeldeOverwinst, gecorrigeerd: toetsOverwinst }]),
    ],
    box2Route: b2?.holding ? 'Holdingroute' : { route1: 'Route 1 · dividend', route2: 'Route 2 · overwinst', combinatie: 'Combinatie', geen: 'Geen box 2' }[b2?.route],
  };
}

function bedrijfsinkomen(r, a, p, gegevens) {
  if (r.inkomensanalyse || r.soort === 'NUL' || a.meenemen === false || a.geconsolideerd) return null;
  if (r.beleid) return r.ondernemingen.length === 1 ? r.beleid.bedrag ?? r.beleid.indicatie : null;
  if (!p || !r.T.some((y) => Number.isFinite(gegevens.jaarBedrag(y)))) return null;
  if (r.familie === 'ABN') {
    if (p.nul) return 0;
    return r.inkomen?.dgaGezamenlijk && a.soort === 'VPB' ? p.box2 : p.woonbeleid;
  }
  // Dit is het bedrijfsbedrag vóór een eventuele dossierbrede begrenzing.
  return Number.isFinite(p.gemiddelde) ? Math.max(0, p.gemiddelde) + (p.box2 || 0) : null;
}

export function renderInkomenTabel(d, r) {
  const i = r.inkomen;
  const C = r.C;
  const jaren = C ? [...r.T, C] : r.T;
  const analyse = r.inkomensanalyse;
  const analyses = r.ondernemingen || [];
  const perOnd = new Map((i?.perOnderneming || []).map((o) => [o.id, o]));
  const ontbreekt = rekenInvoerStatus(d, r);
  const bronDga = (jaar) => d.ib?.[jaar]?.dgaGezamenlijk;
  const heeftBronDga = analyse && jaren.some((jaar) => heeftBedrag(bronDga(jaar)?.loon));
  const dga = i?.dgaGezamenlijk;
  const kader = analyse ? 'Ingevoerde bedragen' : r.kaderCfg.kort;
  // Ontbrekende invoer maakt de uitkomst voorlopig; de bedragen blijven zichtbaar en de open punten staan bij Fiattering.
  const basisOpen = [...ontbreekt.dossier, ...ontbreekt.ondernemingen.flatMap((o) => o.punten)].some((punt) => punt.blokkeert);
  const uitkomst = hoofduitkomst(r, { invoerOpen: basisOpen });
  const kaderbedrag = r.inkomensanalyse ? null : r.soort === 'NUL' ? 0 : r.beleid ? uitkomst.bedrag : r.toetsinkomen;
  const kaderlabel = r.beleid || (basisOpen && !r.inkomensanalyse && r.soort !== 'NUL') ? uitkomst.label : '';
  const indicatie = r.beleid?.indicatie;
  const vastgesteld = r.vastgesteld;
  const abnModel = i?.abnVaststelling;
  const voorwaarden = !r.inkomensanalyse && !r.beleid;
  const gegevens = analyses.map((a) => {
    const p = perOnd.get(a.id);
    const posten = inkomensPosten(d, r, a, p);
    return { a, posten, bedrag: bedrijfsinkomen(r, a, p, posten) };
  });
  const invoerBedrag = (a, y) => {
    const j = a.jaren?.[y];
    if (!j?.actief) return null;
    if (a.soort !== 'VPB') {
      if (heeftBedrag(j.ibOnd?.sfw)) return Number(j.ibOnd.sfw);
      return j.heeftResultaatinvoer ? j.winst.NW : null;
    }
    const loon = heeftBedrag(j.ibOnd?.loon) ? Number(j.ibOnd.loon)
      : heeftBedrag(j.vwRuw?.salarisDGA) ? Number(j.vwRuw.salarisDGA) : null;
    const dividend = heeftBedrag(j.ibOnd?.dividend) ? Number(j.ibOnd.dividend)
      : !a.isDeelneming && heeftBedrag(j.geldstroom?.dividendPriveBruto) ? Number(j.geldstroom.dividendPriveBruto) * j.aandeel : null;
    return samen(loon, dividend);
  };
  const rijen = gegevens.map(({ a, posten, bedrag }) => {
    const duur = a.start && Number.isFinite(a.maandenOndernemer) ? `${fmt.getal(a.maandenOndernemer)} maanden ondernemer` : '';
    return `<tr><th scope="row"><a href="${esc(kerninvoerPad(d, 'berekening', a.id))}">${esc(a.naam)}${icoon('rechts')}</a>
      <small>${esc([a.rechtsvormKort, duur, a.geconsolideerd ? 'Geconsolideerd' : '', a.meenemen === false ? 'Buiten het inkomen' : ''].filter(Boolean).join(' · '))}</small></th>
      ${jaren.map((y) => geldcel(analyse ? invoerBedrag(a, y) : posten.jaarBedrag(y))).join('')}${analyse ? '' : `${geldcel(posten.gemiddeld)}${C ? geldcel(posten.extrapolatie) : ''}${geldcel(bedrag)}${voorwaarden ? `<td>${pil(a.status)}</td>` : ''}`}</tr>`;
  }).join('');
  const dgaRij = dga ? `<tr><th scope="row">Gezamenlijk DGA-loon<small>Voor alle eigen vennootschappen</small></th>
    ${jaren.map((y) => geldcel(dga.perJaar?.[y]?.inkomen)).join('')}${geldcel(dga.berekend)}${C ? geldcel(dga.perJaar?.[C]?.geëxtrapoleerd) : ''}
    ${geldcel(dga.inUitkomst ? dga.toetsinkomen : null)}${voorwaarden ? '<td></td>' : ''}</tr>` : '';
  const bronDgaRij = heeftBronDga ? `<tr><th scope="row">Gezamenlijk bruto DGA-loon<small>Op aanvragerniveau</small></th>${jaren.map((y) => geldcel(heeftBedrag(bronDga(y)?.loon) ? Number(bronDga(y).loon) : null)).join('')}</tr>
    <tr><th scope="row">Bijtelling gezamenlijk DGA-loon</th>${jaren.map((y) => geldcel(heeftBedrag(bronDga(y)?.bijtelling) ? Number(bronDga(y).bijtelling) : null)).join('')}</tr>` : '';
  const persoon = (y) => {
    if (analyse) return samen(...['voorStart', 'naast', 'uitkeringen', 'row'].map((k) => heeftBedrag(d.ib?.[y]?.[k]) ? Number(d.ib[y][k]) : null));
    if (r.familie === 'ABN') return heeftBedrag(d.ib?.[y]?.row) ? Number(d.ib[y].row) : null;
    if (['voorStart', 'naast', 'uitkeringen', 'row'].some((k) => heeftBedrag(d.ib?.[y]?.[k]))) return i?.persoonlijk?.[y]?.totaal;
    return null;
  };
  const persoonRij = jaren.some((y) => Number.isFinite(persoon(y))) ? `<tr><th scope="row">Overig box 1 inkomen</th>${jaren.map((y) => geldcel(persoon(y))).join('')}
    ${analyse ? '' : `${geldcel(gem(r.T.map(persoon)))}${C ? geldcel(null) : ''}${geldcel(i?.row)}${voorwaarden ? '<td></td>' : ''}`}</tr>` : '';
  // Optimaal: bestendig dividend uit minderheidsbelangen telt per jaar mee in het economisch inkomen.
  const minderheid = !analyse && !r.beleid ? i?.optimaal?.minderheidPerJaar : null;
  const minderheidRij = minderheid && r.T.some((y) => Number(minderheid[y])) ? `<tr><th scope="row">Dividend minderheidsbelangen<small>Met trackrecord</small></th>${jaren.map((y) => geldcel(Number.isFinite(Number(minderheid[y])) && y !== C ? Number(minderheid[y]) : null)).join('')}
    ${geldcel(gem(r.T.map((y) => Number(minderheid[y]) || 0)))}${C ? geldcel(null) : ''}${geldcel(null)}${voorwaarden ? '<td></td>' : ''}</tr>` : '';
  const jaartotaal = (y) => {
    if (r.inkomensanalyse || r.soort === 'NUL') return null;
    if (r.beleid) return r.beleid.perJaar?.[y];
    if (dga && !dga.inUitkomst) return null;
    if (!Number.isFinite(persoon(y)) && !Number.isFinite(dga?.perJaar?.[y]?.inkomen) && !gegevens.some((x) => Number.isFinite(x.posten.jaarBedrag(y)))) return null;
    return i?.perJaar?.[y] ?? (y === C ? i?.controleReal : null);
  };
  const jaartotalen = jaren.map(jaartotaal);
  // Kaders zonder eigen totaalgemiddelde (beleidsprofielen, ABN AMRO) tonen het gemiddelde van de jaartotalen.
  const somGemiddeld = !r.inkomensanalyse && jaartotalen.some(Number.isFinite)
    ? (!r.beleid && Number.isFinite(i?.gemiddelde) ? i.gemiddelde : gem(r.T.map(jaartotaal))) : null;
  const somExtr = C && !r.inkomensanalyse
    ? (Number.isFinite(jaartotaal(C)) && Number.isFinite(i?.controleExtr) ? i.controleExtr
      : !r.beleid && r.familie === 'ABN' ? samen(...gegevens.map((x) => x.posten.extrapolatie)) : null) : null;
  const totaal = r.inkomensanalyse ? LEEG : Number.isFinite(kaderbedrag) ? geld(kaderbedrag) : 'Geen cijfers';
  const aantal = analyse ? jaren.length + 1 : r.T.length + (C ? 2 : 0) + (voorwaarden ? 4 : 3);
  const extraTotaal = (label, v) => `<tr><th scope="row" colspan="${aantal - (voorwaarden ? 2 : 1)}">${esc(label)}</th>${geldcel(v)}${voorwaarden ? '<td></td>' : ''}</tr>`;
  // Aanpassingen op het totaal (beletperiode, incidenteel jaar) als eigen regel: zo sluiten de ondernemingsregels
  // aan op het jaartotaal.
  const vervangen = !analyse && !r.beleid ? [i?.belet, i?.incident].find((x) => x && !x.fout && Number.isFinite(x.nieuw) && Number.isFinite(x.oud) && x.nieuw !== x.oud) : null;
  const vervangRij = vervangen ? `<tr class="reken-aanpassing"><th scope="row">${esc(vervangen === i?.belet ? `Beletperiode ${vervangen.jaar} vervangen` : `Incidenteel jaar ${vervangen.jaar} vervangen`)}<small>${esc(`${geld(vervangen.oud)} → ${geld(vervangen.nieuw)} · ${vervangen.bron || ''}`)}</small></th>
    ${jaren.map((y) => geldcel(y === vervangen.jaar ? vervangen.nieuw - vervangen.oud : null)).join('')}${geldcel(null)}${C ? geldcel(null) : ''}${geldcel(null)}${voorwaarden ? '<td></td>' : ''}</tr>` : '';
  const modelGelijk = Number.isFinite(abnModel?.bedrag) && vastgesteld === abnModel.bedrag;
  const modelLabel = abnModel ? `ABN AMRO · ${abnModel.methode === 'verticaal' ? 'verticaal' : 'horizontaal'} · ${abnModel.bron === 'bronbestand' ? 'bronbedrag' : 'herberekend'}` : '';
  return `<div class="scroll"><table class="tabel reken-tabel reken-inkomenstabel uitkomsten-tabel" aria-label="Inkomen per onderneming" data-uitkomstentabel>
    <thead><tr><th scope="col" rowspan="2">Onderneming</th><th scope="colgroup" colspan="${aantal - 1}" class="reken-tabelkop">${esc(kader)}</th></tr><tr>
    ${r.T.map((y) => kolom(y)).join('')}${C ? kolom(C, 'Gerealiseerd') : ''}${analyse ? '' : `${kolom('Gemiddelde', 'Na jaarlijkse correcties')}${C ? kolom(C, 'Geëxtrapoleerd') : ''}${kolom('Jaarinkomen', 'Na toetsing')}${voorwaarden ? kolom('Voorwaarden') : ''}`}</tr></thead>
    <tbody>${dgaRij}${bronDgaRij}${rijen}${persoonRij}${minderheidRij}${vervangRij}${!analyses.length && !persoonRij && !bronDgaRij ? `<tr><td colspan="${aantal}">Geen ondernemingen opgenomen.</td></tr>` : ''}</tbody>
    ${analyse ? '' : `<tfoot><tr class="totaal"><th scope="row">${r.familie === 'ABN' ? 'Toetsinkomen volgens Woonbeleid' : 'Toetsinkomen totaal'}</th>${jaartotalen.map((v) => geldcel(v)).join('')}${geldcel(somGemiddeld)}${C ? geldcel(somExtr) : ''}
    <td class="num reken-uitkomstbedrag"><strong>${esc(totaal)}</strong>${kaderlabel ? `<small>${esc(kaderlabel)}</small>` : ''}</td>${voorwaarden ? '<td></td>' : ''}</tr>
    ${Number.isFinite(indicatie) && r.beleid?.bewijs && indicatie !== kaderbedrag ? extraTotaal('Berekende indicatie', indicatie) : ''}
    ${Number.isFinite(abnModel?.bedrag) && !modelGelijk ? extraTotaal(modelLabel, abnModel.bedrag) : ''}
    ${Number.isFinite(vastgesteld) && Number.isFinite(kaderbedrag) && vastgesteld !== kaderbedrag && !(r.beleid && !r.beleid.bewijs) ? extraTotaal(modelGelijk ? `Vastgesteld inkomen · ${modelLabel}` : 'Vastgesteld inkomen', vastgesteld) : ''}
    </tfoot>`}</table></div>`;
}

function renderBedrijfsinkomen(d, r, a) {
  if (r.soort === 'NUL' || r.inkomensanalyse) return '';
  const p = r.inkomen?.perOnderneming?.find((o) => o.id === a.id);
  const posten = inkomensPosten(d, r, a, p);
  const C = r.C;
  return `<div class="scroll"><table class="tabel reken-tabel reken-toetsingstabel" aria-label="Inkomensposten per onderneming"><thead><tr>
    <th scope="col">Inkomen</th>${r.T.map((y) => kolom(y)).join('')}${kolom('Gemiddelde', 'Na jaarlijkse correcties')}${kolom('Na toetsing')}${C ? kolom(C, 'Geëxtrapoleerd') : kolom('Geen controlejaar')}</tr></thead><tbody>
    ${posten.posten.map((x) => `<tr><th scope="row">${esc(x.label)}</th>${r.T.map((y) => geldcel(x.jaar(y))).join('')}${geldcel(x.gemiddelde)}${geldcel(x.gecorrigeerd)}${geldcel(x.extrapolatie)}</tr>`).join('')}
    ${posten.box2Route ? `<tr><th scope="row">Box 2 route</th><td colspan="${r.T.length + 3}">${esc(posten.box2Route)}</td></tr>` : ''}
    <tr class="reken-toetsing-totaal"><th scope="row">Totaal inkomen</th>${r.T.map((y) => geldcel(posten.jaarBedrag(y))).join('')}${geldcel(posten.gemiddeld)}
    ${geldcel(bedrijfsinkomen(r, a, p, posten))}${geldcel(posten.extrapolatie)}</tr></tbody></table></div>`;
}

function renderRatios(d, r, a) {
  const C = r.C;
  const jaren = C ? [...r.T, C] : r.T;
  const laatste = r.T.at(-1);
  const j = (y) => a.jaren?.[y];
  const balansPosten = (y, posten) => {
    const bron = bronJaar(d, a, y);
    return j(y)?.actief && (heeftBalans(bron?.balans) || posten.every((k) => heeftBedrag(bron?.bzi?.[k])));
  };
  const liquiditeit = (y) => balansPosten(y, ['va', 'kvv']);
  const solvabiliteit = (y) => balansPosten(y, ['ev', 'bt']);
  const winst = (y) => j(y)?.actief && j(y).heeftResultaatinvoer;
  const overigeVoorwaarden = !r.beleid && !r.inkomensanalyse;
  const check = (key, bekend = true) => {
    if (!overigeVoorwaarden) return '';
    const status = a.checks?.find((x) => x.key === key)?.status;
    if (!bekend && status !== 'niet_akkoord') return pil('attentie', 'Open');
    return status ? pil(status) : LEEG;
  };
  const bedrijf = d.ondernemingen?.find((o) => o.id === a.id);
  const definitief = (y) => winst(y) && (y !== C || heeftControleperiode(bronJaar(d, a, y) || {}, y, r.datum));
  const kern = [
    ['Winstgevendheid', 'winst', (y) => definitief(y) ? y === C ? j(y).winst.NWcorExtr : j(y).winst.NWcor : null, geld, winst(laatste)],
    ['Liquiditeit · Current ratio', 'liquiditeit', (y) => liquiditeit(y) ? j(y).CR : null, fmt.ratio, liquiditeit(laatste)],
    ['Liquiditeit · Werkkapitaal', 'werkkapitaal', (y) => liquiditeit(y) ? j(y).WK : null, fmt.getal, liquiditeit(laatste)],
    ['Solvabiliteit', 'solvabiliteit', (y) => solvabiliteit(y) ? j(y).SV : null, fmt.pct, solvabiliteit(laatste)],
    ['Buitenland', 'buitenland', () => null, String, !!bedrijf?.land],
    ['Branche / sector', a.checks?.some((c) => c.key === 'sector') ? 'sector' : 'branche', () => null, String, !!(bedrijf?.sbi || bedrijf?.branche)],
  ];
  const kolommen = (label) => `<thead><tr><th scope="col">${esc(label)}</th>${r.T.map((y) => kolom(y)).join('')}
    ${C ? kolom(C, 'Controlejaar') : kolom('Geen controlejaar')}${overigeVoorwaarden || label === 'Overig' ? '<th scope="col">Resultaat</th>' : ''}</tr></thead>`;
  const jaarcellen = (waarde, fn) => `${jaren.map((y) => `<td class="num">${esc(opmaak(waarde(y), fn))}</td>`).join('')}${C ? '' : '<td class="num">—</td>'}`;
  const trendWaarde = (key, bekend, y, n) => n > 0 && bekend(y) && bekend(jaren[n - 1]) ? a.trendPct?.[key]?.[n] ?? null : null;
  const trends = [['winst', 'Trend winstgevendheid', definitief], ['cr', 'Trend liquiditeit', (y) => liquiditeit(y) && Number.isFinite(j(y).CR)],
    ['wk', 'Trend werkkapitaal', liquiditeit], ['sv', 'Trend solvabiliteit', (y) => solvabiliteit(y) && Number.isFinite(j(y).SV)]];
  const pct = (v) => `${v > 0 ? '+' : ''}${fmt.pct(v)}`;
  const omloop = (key, balansveld, label) => `<tr><th scope="row">${label}</th>${jaarcellen((y) => {
    const bron = bronJaar(d, a, y);
    return j(y)?.actief && heeftBedrag(bron?.balans?.[balansveld]) ? j(y)[key] : null;
  }, fmt.getal)}<td></td></tr>`;
  const totaal = a.status === 'akkoord' && kern.some((x) => !x[4]) ? pil('attentie', 'Open') : pil(a.status);
  return `<div class="scroll"><table class="tabel reken-tabel reken-toetsingstabel" aria-label="Kengetallen en voorwaarden">
    ${kolommen('Kengetallen, ratio’s en voorwaarden')}<tbody>${kern.map(([label, key, waarde, fn, bekend]) => `<tr><th scope="row">${esc(label)}</th>
    ${jaarcellen(waarde, fn)}${overigeVoorwaarden ? `<td class="reken-toetsing-status">${check(key, bekend)}</td>` : ''}</tr>`).join('')}
    ${overigeVoorwaarden ? `<tr class="reken-toetsing-totaal"><th scope="row">Totaalresultaat</th><td colspan="${r.T.length + 1}"></td><td class="reken-toetsing-status">${totaal}</td></tr>` : ''}</tbody></table></div>
    <div class="scroll"><table class="tabel reken-tabel reken-toetsingstabel" aria-label="Trends en omlooptijden">${kolommen('Overig')}<tbody>
    ${trends.map(([key, label, bekend]) => {
      const waarden = jaren.map((y, n) => trendWaarde(key, bekend, y, n));
      // Een door de engine berekende trend kan ontbrekende jaren als nul bevatten. Toon dan alleen verifieerbare mutaties.
      const oordeel = jaren.every(bekend) ? a.trendLabels?.[key] : null;
      return `<tr><th scope="row">${label}</th>${jaarcellen((y) => waarden[jaren.indexOf(y)], pct)}<td class="reken-toetsing-status">${esc(oordeel || LEEG)}</td></tr>`;
    }).join('')}${omloop('omlDeb', 'debiteuren', 'Omlooptijd debiteuren (dagen)')}${omloop('omlCred', 'klCrediteuren', 'Omlooptijd crediteuren (dagen)')}</tbody></table></div>`;
}

export function renderOndernemingInkomen(d, r, a) {
  return `<section class="reken-paneel reken-bedrijfblok" aria-label="Inkomen, ratio’s en voorwaarden van de onderneming">
    <div class="reken-paneel-kop"><h2>Inkomen, ratio’s en voorwaarden</h2></div>${renderBedrijfsinkomen(d, r, a)}${renderRatios(d, r, a)}</section>`;
}

export function renderRekenUitkomst(d, r) {
  const analyse = r.inkomensanalyse;
  const regels = !r.inkomensanalyse && r.soort !== 'NUL' ? r.kaderCfg.inkomensberekening || [] : [];
  return `<section class="reken-paneel uitkomsten" aria-label="${analyse ? 'Invoer per onderneming' : 'Uitkomsten per onderneming'}">
    ${analyse ? `<details class="stappen reken-uitklap"><summary>Invoer per onderneming en aanvrager</summary><div class="reken-uitklap-inhoud"><p class="reken-neutraal">De tabel toont de bekende bedragen uit het dossier. De toetsinkomens staan bij de afzonderlijke kaders.</p>${renderInkomenTabel(d, r)}</div></details>` : `
    <div class="reken-paneel-kop"><div><h2 id="rekenresultaten-titel" tabindex="-1">Inkomen</h2><p class="reken-neutraal">Open een onderneming voor de uitsplitsing van het inkomen en de rekenstappen.</p></div></div>
    ${renderInkomenTabel(d, r)}${regels.length ? `<details class="stappen reken-uitklap"><summary>Inkomensberekening volgens ${esc(r.kaderCfg.kort)}</summary><ul>${regels.map((tekst) => `<li>${esc(tekst)}</li>`).join('')}</ul></details>` : ''}`}</section>
    ${(r.ondernemingen || []).length ? `<section class="reken-paneel" aria-labelledby="reken-ratios-titel"><div class="reken-paneel-kop"><h2 id="reken-ratios-titel">Ratio’s en voorwaarden</h2></div>
    ${r.beleid || r.inkomensanalyse ? '<p class="reken-neutraal">De jaarcijfers en ratio’s staan hieronder. De voorwaarden voor het gekozen toetskader staan bij Fiattering.</p>' : ''}
    ${r.ondernemingen.map((a, n) => `<details class="stappen reken-uitklap reken-bedrijfblok"${n === 0 ? ' open' : ''}><summary>${esc(a.naam)}</summary>
      <div class="reken-uitklap-inhoud">${renderRatios(d, r, a)}</div></details>`).join('')}</section>` : ''}`;
}
