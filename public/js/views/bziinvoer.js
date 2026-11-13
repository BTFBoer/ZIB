// BZI-invoer: de uitkomst van de (gedetailleerde) berekening in ZIB vertaald naar de velden van de
// rekentool van de bank, in de volgorde van die tool: per bedrijf de periode, status, het belang,
// de privé-onttrekkingen, winstgevendheid en correcties, solvabiliteit en liquiditeit, en daarna de
// verwachte uitkomsten om te controleren of de rekentool hetzelfde laat zien. Zo kun je een dossier
// met de diepgang van de rekensoftware beoordelen en het resultaat foutloos overnemen.
import { esc, fmt, num, isIngevuld, naamAanvrager, rond2 } from '../util.js';
import { RECHTSVORMEN, soortOndernemer } from '../engine/kaders.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES } from '../schema/correcties.js';
import { bedrag, pil, melding, icoon } from './ui.js';
import { ordeJaren } from './uistate.js';
import { hoofdbedrijven, deelnemingenVan } from './bzi.js';

// Automatische correcties (uit de detailbalans) omgezet naar de correctietypen van de rekentool.
const VERMOGEN_TYPE = {
  iva: 'immaterieel', leningDGA: 'leningDirectie', rc: 'rcDirectie', dubieus: 'overigVlottend', surplusIngezet: 'overigVlottend',
  vordGroepKort: 'overigVlottend', latentActiefKort: 'overigVlottend', vordGroepLang: 'overigVast', latentActief: 'overigVast', overigNeg: 'overigVast',
  box3: 'box3', stilleReserves: 'herwaardering', latentPassief: 'latentHerwaardering', achtergesteld: 'achtergesteld', odv: 'odv',
  schuldDGA: 'lvv', schuldParticipanten: 'lvv', schuldGroep: 'lvv', stamrecht: 'overigPassivaLang', overigPos: 'overigPassivaLang',
  surplusOntvangen: 'box3', schuldDGAKort: 'overigPassivaKort', schuldParticipantenKort: 'overigPassivaKort', schuldGroepKort: 'overigPassivaKort',
};

function winstType(x) {
  if (x.type && WINST_CORRECTIES[x.type]) return x.type;
  return 'overig';
}

function vermogenType(item) {
  if (item.type && VERMOGENS_CORRECTIES[item.type]) return item.type;
  return VERMOGEN_TYPE[item.key] || null;
}

function tmMaand(j) {
  return j?.tot ? Number(String(j.tot).slice(5, 7)) : 12;
}

/** Rijen per bedrijf: [label, {jaar: waarde}, {stijl}] */
function rijenVoor(d, r, o, a, jaren, { isHoofd, ouder }) {
  const soort = soortOndernemer(o.rechtsvorm);
  const J = a.jaren;
  const rijen = [];
  const rij = (label, fn, stijl = '', optioneel = false, toon = toonCel) => {
    const waarden = Object.fromEntries(jaren.map((y) => [y, J[y] ? fn(J[y], y) : '']));
    if (optioneel && Object.values(waarden).every((w) => w === '' || w === null || w === undefined)) return;
    rijen.push({ label, waarden, stijl, toon });
  };
  const bedragT = (x) => (isIngevuld(x) ? Math.round(num(x)) : '');
  rijen.push({ label: 'Jaar meetellen (vinkje)', waarden: Object.fromEntries(jaren.map((y) => [y, y === r.C ? 'nee (lopend jaar)' : J[y]?.meegeteld ? 'ja' : 'nee'])), stijl: 'kop' });
  if (r.C && jaren.includes(r.C)) rijen.push({ label: 't/m (maand lopend jaar)', waarden: { [r.C]: J[r.C]?.heeftVW || J[r.C]?.heeftBalans ? String(tmMaand(J[r.C])) : '' } });
  rij('Status', (j) => j.status);
  if (o.rechtsvorm !== 'EZ') rij('Percentage aandeel in bedrijf', (j) => Math.round(j.aandeel * 1000) / 10, '', false, toonDecimaal);
  if (isHoofd) {
    rijen.push({ label: 'Privé-onttrekkingen', waarden: {}, stijl: 'sectie' });
    const ib = (y, k) => d.ib?.[y]?.perOnd?.[o.id]?.[k];
    if (soort === 'VPB') {
      rij('DGA-inkomen', (j, y) => bedragT(ib(y, 'loon')));
      rij('Bijtelling privégebruik auto (negatief)', (j, y) => (num(ib(y, 'bijtelling')) ? bedragT(-Math.abs(num(ib(y, 'bijtelling')))) : ''));
      rij('Dividend (box 2)', (j, y) => bedragT(ib(y, 'dividend')));
    } else {
      rij('Saldo fiscale winst / winstaandeel', (j, y) => bedragT(ib(y, 'sfw')));
      rij('Bijtelling privégebruik auto (negatief)', (j, y) => (num(ib(y, 'bijtelling')) ? bedragT(-Math.abs(num(ib(y, 'bijtelling')))) : ''));
    }
  }
  rijen.push({ label: 'Winstgevendheid', waarden: {}, stijl: 'sectie' });
  rij('Omzet', (j) => (j.heeftVW ? bedragT(j.vw.OMZET) : ''));
  rij(r.familie === 'NHG' ? 'Winst vóór belasting' : 'Nettowinst', (j) => (j.heeftVW ? bedragT(r.familie === 'NHG' ? j.vw.RVB : j.winst.NW) : ''));
  if (!isHoofd) {
    rij(`Management fee${ouder ? ` (aan ${ouder.naam})` : ''}`, (j, y) => bedragT(o.jaren?.[y]?.bzi?.managementFee));
    rij(`Intern dividend${ouder ? ` (aan ${ouder.naam}, naar rato van het belang per jaar)` : ''}`, (j, y) => {
      const dividend = o.jaren?.[y]?.bzi?.internDividend;
      return isIngevuld(dividend) ? bedragT(num(dividend) * (ouder ? j.aandeel : 1)) : '';
    });
  }
  // Winstcorrecties per type
  const wTypes = new Map();
  jaren.forEach((y) => {
    const j = J[y];
    if (!j) return;
    [...j.winst.pos.map((x) => [x, 1]), ...j.winst.neg.map((x) => [x, -1])].forEach(([x, t]) => {
      const tp = winstType(x);
      const m = wTypes.get(tp) || {};
      m[y] = (m[y] || 0) + t * x.bedrag;
      wTypes.set(tp, m);
    });
  });
  if (wTypes.size) {
    rijen.push({ label: 'Winstcorrecties (knop Correctie)', waarden: {}, stijl: 'sectie' });
    wTypes.forEach((m, tp) => rijen.push({ label: `– ${WINST_CORRECTIES[tp]?.label || tp}`, waarden: Object.fromEntries(jaren.map((y) => [y, m[y] ? bedragT(m[y]) : ''])) }));
  }
  rijen.push({ label: 'Solvabiliteit', waarden: {}, stijl: 'sectie' });
  rij('Eigen vermogen', (j) => (j.heeftBalans ? bedragT(j.bal.EV) : ''));
  rij('Balanstotaal', (j) => (j.heeftBalans ? bedragT(j.bal.TA) : ''));
  rijen.push({ label: 'Liquiditeit', waarden: {}, stijl: 'sectie' });
  rij('Vlottende activa', (j) => (j.heeftBalans ? bedragT(j.bal.VA) : ''));
  rij('– rekenknop: waarvan niet vrij beschikbaar (G-rekening)', (j) => bedragT(j.corr.items.find((x) => x.key === 'gRekening')?.va ? -j.corr.items.find((x) => x.key === 'gRekening').va : ''), '', true);
  rij('Kort vreemd vermogen', (j) => (j.heeftBalans ? bedragT(j.bal.KVV) : ''));
  // Vermogenscorrecties per type (effect op het aansprakelijk vermogen)
  const vTypes = new Map();
  const onbekend = new Map();
  jaren.forEach((y) => {
    const j = J[y];
    if (!j) return;
    j.corr.items.filter((x) => x.key !== 'gRekening').forEach((x) => {
      const tp = vermogenType(x);
      const doel = tp ? vTypes : onbekend;
      const sleutel = tp || x.label;
      const m = doel.get(sleutel) || {};
      m[y] = (m[y] || 0) + (tp && VERMOGENS_CORRECTIES[tp]?.effect.includes('kvv') && !x.av ? -x.kvv : x.av);
      doel.set(sleutel, m);
    });
  });
  if (vTypes.size || onbekend.size) {
    rijen.push({ label: 'Vermogenscorrecties (knop Correctie)', waarden: {}, stijl: 'sectie' });
    vTypes.forEach((m, tp) => rijen.push({ label: `– ${VERMOGENS_CORRECTIES[tp]?.label || tp}${VERMOGENS_CORRECTIES[tp]?.alleenNHG ? ' (alleen NHG)' : ''}`, waarden: Object.fromEntries(jaren.map((y) => [y, m[y] ? bedragT(m[y]) : ''])) }));
    onbekend.forEach((m, l) => rijen.push({ label: `– ${l} (geen vast type: Overig)`, waarden: Object.fromEntries(jaren.map((y) => [y, m[y] ? bedragT(m[y]) : ''])) }));
  }
  rijen.push({ label: 'Controle: uitkomst in de rekentool', waarden: {}, stijl: 'sectie' });
  rij('Nettowinst (na correctie)', (j) => (j.heeftVW ? bedragT(j.winst.NWcor) : ''), 'controle');
  rij('Aansprakelijk vermogen', (j) => (j.heeftBalans ? bedragT(j.EVcor) : ''), 'controle');
  rij('Balanstotaal (na correctie)', (j) => (j.heeftBalans ? bedragT(j.TVcor) : ''), 'controle');
  rij('Vlottende activa (na correctie)', (j) => (j.heeftBalans ? bedragT(j.VAcor) : ''), 'controle');
  rij('Kort vreemd vermogen (na correctie)', (j) => (j.heeftBalans ? bedragT(j.KVVcor) : ''), 'controle');
  rij('Solvabiliteit (%)', (j) => (j.heeftBalans && Number.isFinite(j.SV) ? Math.round(j.SV * 100) : ''), 'controle');
  rij('Liquiditeit', (j) => (j.heeftBalans && j.CR !== null ? j.CR : ''), 'controle', false, (x) => (isIngevuld(x) ? fmt.ratio(x) : ''));
  return rijen;
}

function toonCel(x) {
  return typeof x === 'number' ? fmt.getal(x) : (x ?? '');
}

function toonDecimaal(x) {
  return String(x ?? '').replace('.', ',');
}

function spreadsheetTekst(x) {
  const tekst = String(x ?? '');
  return /^[\s\x00-\x1f]*[=+\-@]|^[\t\r\n]/.test(tekst.normalize('NFKC')) ? `'${tekst}` : tekst;
}

function tsv(titel, jaren, rijen) {
  const cel = (x) => spreadsheetTekst(x).replace(/[\t\r\n]+/g, ' ');
  const regels = rijen.map((rij) => [cel(rij.label), ...jaren.map((y) => {
    const x = rij.waarden[y];
    return typeof x === 'number' ? (rij.toon || toonCel)(x) : cel(x);
  })].join('\t'));
  return [cel(titel), ['', ...jaren].join('\t'), ...regels].join('\n');
}

function bziTabellen(d, r) {
  const jaren = ordeJaren(r.C ? [...r.T, r.C] : [...r.T]);
  const blokken = [];
  hoofdbedrijven(d).forEach((h) => {
    [{ o: h, diepte: 0 }, ...deelnemingenVan(d, h.id)].forEach(({ o, diepte }) => {
      const a = r.ondernemingen.find((x) => x.id === o.id);
      if (!a) return;
      const ouder = (d.ondernemingen || []).find((x) => x.id === o.parentId);
      const rijen = rijenVoor(d, r, o, a, jaren, { isHoofd: diepte === 0, ouder });
      const titel = `${o.naam || '(naamloos)'}${diepte === 0 ? ' (hoofdbedrijf)' : ` (deelneming${ouder ? ` van ${ouder.naam}` : ''})`}`;
      blokken.push({ o, a, rijen, titel });
    });
  });
  return { jaren, blokken };
}

export function maakBziCsv(d, r) {
  const { jaren, blokken } = bziTabellen(d, r);
  const regels = [['Onderneming', 'Onderdeel', 'Veld in de rekentool', ...jaren.map((y) => y === r.C ? `${y} (lopend jaar)` : y)]];
  for (const { titel, rijen } of blokken) {
    let onderdeel = 'Boekjaren';
    for (const rij of rijen) {
      if (rij.stijl === 'sectie') { onderdeel = rij.label; continue; }
      regels.push([titel, onderdeel, rij.label, ...jaren.map((y) => rij.waarden[y])]);
    }
  }
  const csvCel = (x) => {
    if (typeof x === 'number' && Number.isFinite(x)) return toonDecimaal(x);
    return `"${spreadsheetTekst(x).replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + regels.map((regel) => regel.map(csvCel).join(';')).join('\r\n') + '\r\n';
}

export function bziVerschil(werkelijk, indicatie) {
  if (!isIngevuld(werkelijk)) return 'Nog te vergelijken';
  const verschil = rond2(Number(werkelijk) - indicatie);
  if (!verschil) return 'Gelijk aan ZIB';
  return `${verschil > 0 ? '+' : '−'} ${fmt.eur(Math.abs(verschil), verschil % 1 ? 2 : 0)} t.o.v. ZIB`;
}

export function renderBziInvoer(d, r) {
  if (!(d.ondernemingen || []).length) return melding('info', 'Nog geen ondernemingen.');
  const { jaren, blokken } = bziTabellen(d, r);
  const tabellen = blokken.map(({ o, a, rijen, titel }) => {
    const id = `tsv-${o.id}`;
    return `<div class="paneel bzi-invoer"><div class="paginakop" style="margin:0 0 6px"><h2>${esc(titel)} ${pil(a.status)}</h2>
          <button class="knop sec klein geen-print" data-actie="kopieer-tsv" data-doel="${esc(id)}">${icoon('kopie')}Kopieer als tabel</button></div>
        <p class="dempen klein">${esc(RECHTSVORMEN[o.rechtsvorm]?.label || o.rechtsvorm)}${o.kvk ? ` · KvK ${esc(o.kvk)}` : ''}${o.startdatum ? ` · ingeschreven ${esc(fmt.datum(o.startdatum))}` : ''}${o.activiteit ? ` · ${esc(o.activiteit)}` : ''}${o.geconsolideerd ? ' · geconsolideerd in de aandeelhouder (vinkje bij Bedrijven)' : ''}</p>
        <div class="scroll"><table class="tabel compact bzi-invoer-tabel"><thead><tr><th>Veld in de rekentool</th>${jaren.map((y) => `<th class="num">${y}${y === r.C ? ' (lopend)' : ''}</th>`).join('')}</tr></thead><tbody>
          ${rijen.map((rr) => (rr.stijl === 'sectie'
    ? `<tr class="kopregel"><td colspan="${jaren.length + 1}">${esc(rr.label)}</td></tr>`
    : `<tr class="${esc(rr.stijl)}"><td>${esc(rr.label)}</td>${jaren.map((y) => `<td class="num">${esc((rr.toon || toonCel)(rr.waarden[y]))}</td>`).join('')}</tr>`)).join('')}
        </tbody></table></div>
        <textarea id="${esc(id)}" hidden>${esc(tsv(titel, jaren, rijen.filter((x) => x.stijl !== 'sectie')))}</textarea>
      </div>`;
  });

  // Samenvatting en advies
  const ph = r.inkomen?.perHoofdbedrijf || [];
  const advies = r.familie === 'ABN' && ph.length ? `<div class="paneel"><h2>BZI-uitkomst vergelijken</h2>
    <p class="dempen klein">Neem per hoofdbedrijf het berekend inkomen uit BZI over, vóór eventuele afslag of afwijking. Het ingevoerde bedrag dient voor de vergelijking.</p>
    <div class="scroll"><table class="tabel compact invoer-tabel"><thead><tr><th>Hoofdbedrijf</th><th>Toetskader</th><th class="num">BZI-indicatie (ZIB)</th><th>Werkelijke uitkomst in BZI</th><th class="num">Inkomen volgens Woonbeleid (ZIB)</th><th>Advies</th></tr></thead><tbody>
      ${ph.map((x) => {
    const verschil = !x.nul && Math.abs(x.woonbeleidVoorAfslag - x.berekend) > 1;
    const adviesT = x.nul ? '0-inkomen afgeven (vinkje "0-inkomen afgegeven?")'
      : x.bron === 'geen' ? 'Geen inkomen afgeven (vinkje "Geen inkomen afgeven?")'
      : x.bron === 'afwijkend' ? `Afwijkend inkomen ${fmt.eur(x.bijdrage)} (vastgelegd bij Fiattering)`
        : verschil ? `Afwijkend inkomen ${fmt.eur(x.woonbeleidVoorAfslag)} overwegen, met de rekenkundige onderbouwing hieronder` : 'Berekend inkomen afgeven';
    const werkelijk = d.ondernemingen.find((o) => o.id === x.id)?.bziWerkelijk;
    const vergelijking = x.nul ? 'n.v.t.' : `${bedrag(`ond:${x.id}.bziWerkelijk`, werkelijk, { label: `Werkelijke uitkomst in BZI voor ${x.naam}` })}
      <div class="dempen klein" data-bzi-verschil="${esc(x.id)}" aria-live="polite">${esc(bziVerschil(werkelijk, x.berekend))}</div>`;
    return `<tr><td><b>${esc(x.naam)}</b></td><td>${x.nul ? pil('info', '0-inkomen') : pil(x.toetsStatus, x.voldoet ? 'Voldoet' : 'Voldoet niet')}</td>
          <td class="num">${esc(fmt.eur(x.nul ? 0 : x.berekend))}</td><td>${vergelijking}</td><td class="num">${x.nul ? '' : esc(fmt.eur(x.woonbeleid))}${!x.nul && x.woonbeleidVoorAfslag !== x.woonbeleid ? `<div class="dempen klein">${esc(fmt.eur(x.woonbeleidVoorAfslag))} vóór afslag</div>` : ''}${x.overwinstMee ? `<div class="dempen klein">incl. overwinst ${esc(fmt.eur(x.overwinstMee))}</div>` : ''}</td><td>${esc(adviesT)}</td></tr>`;
  }).join('')}
    </tbody></table></div>
    ${ph.filter((x) => !x.nul && x.onderbouwing && (Math.abs(x.woonbeleidVoorAfslag - x.berekend) > 1 || x.bron === 'afwijkend')).map((x) => `<details class="stappen"><summary>Rekenkundige onderbouwing ${esc(x.naam)}</summary><div class="inhoud">
      <pre class="notitie">${esc(x.onderbouwing)}</pre>
      <div class="acties geen-print"><button class="knop sec klein" data-actie="kopieer-tsv" data-doel="ob-${esc(x.id)}">${icoon('kopie')}Kopieer onderbouwing</button></div>
      <textarea id="ob-${esc(x.id)}" hidden>${esc(x.onderbouwing)}</textarea></div></details>`).join('')}
  </div>` : '';

  const alg = `<div class="paneel"><div class="paginakop"><h2>Algemeen en bedrijven</h2>
    ${blokken.length ? `<button type="button" class="knop sec klein geen-print" data-actie="bzi-csv">${icoon('download')}Download invoer als CSV</button>` : ''}</div>
    <dl class="kv compact">
      <dt>Lening</dt><dd>${esc(d.label || 'ABN AMRO')} · ${esc(d.afdeling || 'IMV')} · ${esc(d.leningnummer || '(nummer)')} · NHG: ${d.kader === 'NHG' ? 'ja' : 'nee'}</dd>
      <dt>Aanvrager</dt><dd>${esc(naamAanvrager(d.aanvrager))}${d.aanvrager?.geboortedatum ? ` · ${esc(fmt.datum(d.aanvrager.geboortedatum))}` : ''}</dd>
      <dt>Hoofdbedrijven</dt><dd>${hoofdbedrijven(d).map((h) => `${esc(h.naam || '(naamloos)')} (${deelnemingenVan(d, h.id).length} deelneming${deelnemingenVan(d, h.id).length === 1 ? '' : 'en'})`).join('; ') || '–'}</dd>
      <dt>Periode</dt><dd>${esc(`${r.T[0]} - ${r.T[2] + 1}`)} (laatste toetsjaar ${r.T3}${r.C ? `, lopend jaar ${r.C}` : ''})</dd>
    </dl>
    <p class="dempen klein">De CSV volgt de getoonde jaarvolgorde. Bedragen staan in hele euro's, met een minteken bij verlagende correcties.</p></div>`;
  return `${alg}${advies}${tabellen.join('')}`;
}
