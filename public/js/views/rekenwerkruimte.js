import { vergelijkKaders } from '../engine/index.js';
import { METHODE_LABEL } from '../engine/beleid.js';
import { heeftBedrag, heeftResultaatVoorBelasting } from '../engine/financieel.js';
import { rekenInvoerStatus } from '../engine/reken-invoer.js';
import { esc, fmt } from '../util.js';
import { icoon, pil } from './ui.js';
import { kerninvoerPad } from './kerninvoer.js';
import { renderTrace } from './trace-view.js';
import { ui } from './uistate.js';

const BEDRAG_LEEG = '–';
const bedrag = (waarde) => Number.isFinite(waarde) ? fmt.eur(waarde) : BEDRAG_LEEG;
const jarenTekst = (jaren) => jaren?.length ? jaren.join(', ') : '';

function linkNaar(d, tab, tekst, { ondId, bind } = {}) {
  return `<a class="reken-link geen-print" href="${esc(kerninvoerPad(d, tab, ondId, bind))}">${esc(tekst)}${icoon('pijl')}</a>`;
}

function sectieKnop(id, tekst, icon) {
  return `<button type="button" class="knop sec klein" data-actie="naar-sectie" data-doel="${id}">${icoon(icon)}${esc(tekst)}</button>`;
}

function metriek(label, waarde) {
  return `<div class="reken-metriek"><dt>${esc(label)}</dt><dd>${esc(waarde)}</dd></div>`;
}

function bronLink(url) {
  return /^https:\/\//i.test(url || '')
    ? `<a class="reken-link geen-print" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Beleidsbron${icoon('pijl')}</a>` : '';
}

function oefenVoorbeeld(d, kader) {
  return d.demo === true && Number.isFinite(d.oefenverklaringen?.[kader]?.bedrag) ? d.oefenverklaringen[kader] : null;
}

function oefenVerklaring(d, kader) {
  const voorbeeld = oefenVoorbeeld(d, kader);
  if (!voorbeeld) return '';
  const herkomst = [voorbeeld.opsteller, fmt.datum(voorbeeld.datum)].filter(Boolean).join(' · ');
  return `<p class="reken-oefen"><b>Fictieve oefenverklaring</b> ${esc(bedrag(voorbeeld.bedrag))}${herkomst ? ` · ${esc(herkomst)}` : ''}. Deze telt alleen als voorbeeld.</p>`;
}

function resultaatOordeel(status, beleid, blokkeert) {
  if (status === 'niet_akkoord') return pil(status);
  if (blokkeert) return pil('attentie', beleid?.methode === 'extern' && !beleid.bewijs ? 'Bewijsstuk nodig' : 'Invoer nodig');
  return pil(status, beleid && status === 'akkoord' ? 'Ter beoordeling' : undefined);
}

function enkelKaderKop(d, r, geblokkeerd) {
  const p = r.beleid;
  const nul = r.soort === 'NUL';
  const oordeel = resultaatOordeel(r.status, p, geblokkeerd);
  const methode = p ? METHODE_LABEL[p.methode] : '';
  let hoofdlabel = 'Toetsinkomen';
  let hoofdwaarde = geblokkeerd ? 'Invoer aanvullen' : bedrag(r.toetsinkomen);
  let toelichting = 'Bedrag per jaar';
  let aanvullend = '';
  if (nul) {
    hoofdlabel = 'Nulverklaring';
    hoofdwaarde = r.nul?.conclusie || 'Ter beoordeling';
    toelichting = '';
  } else if (p) {
    if (p.bewijs) {
      hoofdlabel = 'Toetsinkomen op basis van bewijsstuk';
      hoofdwaarde = bedrag(p.bedrag);
      toelichting = [p.bewijs.opsteller, fmt.datum(p.bewijs.datum)].filter(Boolean).join(' · ');
      if (p.bewijs.bedrag !== p.bedrag) aanvullend += metriek('Bedrag op bewijsstuk', bedrag(p.bewijs.bedrag));
    } else if (p.methode === 'extern') {
      hoofdlabel = 'Inkomensverklaring of bankbeoordeling';
      hoofdwaarde = 'Bewijsstuk nodig';
      toelichting = 'Registreer bedrag, datum en opsteller bij Klantgegevens.';
    } else {
      hoofdlabel = 'Berekende indicatie';
      hoofdwaarde = Number.isFinite(p.bedrag) ? bedrag(p.bedrag) : 'Nog te bepalen';
      toelichting = 'Bedrag per jaar, ter beoordeling';
    }
    if ((p.bewijs || p.methode === 'extern') && Number.isFinite(p.indicatie)) {
      aanvullend += metriek('Eigen rekenindicatie', bedrag(p.indicatie));
    }
  } else if (!geblokkeerd && Number.isFinite(r.vastgesteld) && r.vastgesteld !== r.toetsinkomen) {
    aanvullend += metriek('Vastgesteld inkomen', bedrag(r.vastgesteld));
  }
  if (!nul && (!geblokkeerd || p)) {
    if (Number.isFinite(r.inkomen?.box1)) aanvullend += metriek('Box 1 volgens de berekening', bedrag(r.inkomen.box1));
    if (Number.isFinite(r.inkomen?.box2)) aanvullend += metriek('Box 2 volgens de berekening', bedrag(r.inkomen.box2));
  }
  return `<section class="reken-overzicht" data-beoordelingskader="${esc(r.kader)}" aria-labelledby="reken-titel">
    <div class="reken-overzicht-kop">
      <div><h2 id="reken-titel">${esc(r.kaderCfg.kort)}</h2><p>${esc([r.kaderVersie, methode].filter(Boolean).join(' · '))}</p></div>
      <div class="reken-overzicht-acties">${oordeel}${bronLink(p?.bronUrl || r.kaderCfg.bronUrl)}</div>
    </div>
    <div class="reken-uitkomst">
      <div class="reken-hoofdwaarde${nul ? ' reken-hoofdwaarde-tekst' : ''}"><span>${esc(hoofdlabel)}</span><strong>${esc(hoofdwaarde)}</strong>${toelichting ? `<p>${esc(toelichting)}</p>` : ''}</div>
      ${aanvullend ? `<dl class="reken-metrieken">${aanvullend}</dl>` : ''}
    </div>
    ${oefenVerklaring(d, r.kader)}
  </section>`;
}

function invoerActie(d, punt, ondId) {
  const tab = punt.paneel === 'invoer' && !ondId && !d.ondernemingen?.length ? 'ib' : punt.paneel;
  const labels = { klant: 'Klantgegevens', invoer: 'Invoer', ib: 'IB-aangifte', documenten: 'Documenten' };
  return labels[tab] ? linkNaar(d, tab, labels[tab], { ondId, bind: punt.bind }) : '';
}

function invoerPunten(d, punten, ondId) {
  if (!punten.length) return '';
  return `<ul class="reken-invoerpunten">${punten.map((punt) => `<li>
    <div><b>${esc(punt.label)}</b>${punt.jaren?.length ? ` <span class="reken-jaarlabel">${esc(jarenTekst(punt.jaren))}</span>` : ''}
      ${punt.melding ? `<span class="reken-punt-uitleg">${esc(punt.melding)}</span>` : ''}</div>
    ${invoerActie(d, punt, ondId)}
  </li>`).join('')}</ul>`;
}

function invoerPaneel(d, ontbreekt, aantal) {
  const bedrijven = ontbreekt.ondernemingen.filter(({ punten }) => punten.length);
  const heeftOndernemingen = d.ondernemingen?.length > 0;
  return `<section class="reken-paneel" id="reken-invoer" aria-labelledby="reken-invoertitel">
    <div class="reken-paneel-kop">
      <h3 id="reken-invoertitel">Invoer controleren ${aantal ? pil('attentie', `${aantal} ${aantal === 1 ? 'punt' : 'punten'}`) : ''}</h3>
      ${linkNaar(d, heeftOndernemingen ? 'invoer' : 'ib', 'Cijfers bewerken')}
    </div>
    ${aantal
      ? `${invoerPunten(d, ontbreekt.dossier)}${bedrijven.map((o) => `<details class="stappen reken-uitklap"${bedrijven.length === 1 ? ' open' : ''}>
        <summary>${esc(o.naam)} <span>${o.punten.length} ${o.punten.length === 1 ? 'punt' : 'punten'}</span></summary>
        ${invoerPunten(d, o.punten, o.id)}</details>`).join('')}`
      : '<p class="reken-neutraal">De benodigde basisgegevens zijn ingevuld.</p>'}
  </section>`;
}

function statusBedrijfJaar(j, jaar, C) {
  if (!j?.actief) return 'Vóór start';
  if (jaar === C) return j.status === 'tussentijds' ? 'Controle · tussentijds' : 'Controlejaar';
  if (!j.meegeteld) return 'Buiten gemiddelde';
  return j.status === 'definitief' ? 'Definitief' : j.status === 'tussentijds' ? 'Tussentijds' : 'Toetsjaar';
}

function rij(label, jaren, inhoud, laatste = false) {
  return `<tr${laatste ? ' class="totaal"' : ''}><th scope="row">${esc(label)}</th>${jaren.map((jaar) => `<td class="num">${esc(inhoud(jaar))}</td>`).join('')}</tr>`;
}

function tabelKop(jaren, C) {
  return `<thead><tr><th scope="col">Post</th>${jaren.map((jaar) => `<th scope="col" class="num">${esc(jaar)}${jaar === C ? '<small>Controle</small>' : ''}</th>`).join('')}</tr></thead>`;
}

function jaarTabelBedrijf(a, bron, jaren, C) {
  const isDga = a.soort === 'VPB';
  const jarenWaarde = (label, fn) => rij(label, jaren, (jaar) => {
    const j = a.jaren[jaar];
    return bedrag(j?.actief ? fn(j, bron?.jaren?.[jaar]?.bzi || {}) : null);
  });
  const balansWaarde = (label, invoerveld, veld) => jarenWaarde(label, (j, bzi) =>
    j.heeftBalans && (!j.aggBalans || heeftBedrag(bzi[invoerveld])) ? j.bal[veld] : null);
  return `<div class="scroll"><table class="tabel reken-tabel">
    ${tabelKop(jaren, C)}<tbody>
    ${rij('Periode', jaren, (y) => statusBedrijfJaar(a.jaren[y], y, C))}
    ${C ? rij('Cijfers tot en met', jaren, (y) => y === C ? fmt.datum(bron?.jaren?.[y]?.tot) || BEDRAG_LEEG : BEDRAG_LEEG) : ''}
    ${jarenWaarde('Omzet', (j, bzi) => {
      const isOmzetBekend = heeftBedrag(j.aggVW ? bzi.omzet : j.vwRuw?.omzet);
      return isOmzetBekend ? j.vw.OMZET : null;
    })}
    ${jarenWaarde('Nettowinst', (j) => j.heeftResultaatinvoer ? j.winst.NW : null)}
    ${jarenWaarde('Nettowinst na correcties', (j) => j.heeftResultaatinvoer ? j.winst.NWcor : null)}
    ${isDga ? jarenWaarde('Resultaat vóór belasting', (j, bzi) =>
      heeftResultaatVoorBelasting({ bzi, vw: j.vwRuw }) ? j.winst.RVB : null) : ''}
    ${jarenWaarde(isDga ? 'Loon uit IB-aangifte' : 'Saldo fiscale winst uit IB-aangifte', (j) => {
      const waarde = j.ibOnd?.[isDga ? 'loon' : 'sfw'];
      return heeftBedrag(waarde) ? Number(waarde) : null;
    })}
    ${isDga ? jarenWaarde('Dividend uit IB-aangifte', (j) => heeftBedrag(j.ibOnd?.dividend) ? Number(j.ibOnd.dividend) : null) : ''}
    ${balansWaarde('Eigen vermogen', 'ev', 'EV')}
    ${balansWaarde('Balanstotaal', 'bt', 'TA')}
    ${balansWaarde('Vlottende activa', 'va', 'VA')}
    ${balansWaarde('Kort vreemd vermogen', 'kvv', 'KVV')}
    </tbody></table></div>`;
}

function persoonlijkeCijfers(d, jaren, C) {
  const regels = [['row', 'Resultaat uit overige werkzaamheden'], ['voorStart', 'Loon vóór start onderneming']]
    .filter(([key]) => jaren.some((jaar) => heeftBedrag(d.ib?.[jaar]?.[key])))
    .map(([key, label]) => rij(label, jaren, (jaar) => {
      const waarde = d.ib?.[jaar]?.[key];
      return heeftBedrag(waarde) ? bedrag(Number(waarde)) : BEDRAG_LEEG;
    })).join('');
  if (!regels) return '';
  return `<details class="stappen reken-uitklap" open><summary>Persoonlijke inkomsten</summary>
    <div class="reken-uitklap-inhoud"><div class="scroll"><table class="tabel reken-tabel">
      ${tabelKop(jaren, C)}<tbody>${regels}</tbody>
    </table></div>${linkNaar(d, d.ondernemingen?.length ? 'invoer' : 'ib', 'Persoonlijke inkomsten bewerken')}</div>
  </details>`;
}

function jaarTotaal(r, jaren, ontbreekt) {
  if (r.soort === 'NUL' || r.inkomensanalyse) return '';
  const inkomen = r.inkomen;
  if (!inkomen || !Object.values(inkomen.perJaar || {}).some(Number.isFinite)) return '';
  const punten = [...ontbreekt.dossier, ...ontbreekt.ondernemingen.flatMap((o) => o.punten)];
  const onvolledig = (jaar) => !r.beleid && punten.some((punt) => punt.blokkeert
    && (!punt.jaren?.length || punt.jaren.includes(jaar)));
  const inhoud = rij('Jaarbedrag in het toetskader', jaren, (jaar) => {
    if (onvolledig(jaar)) return BEDRAG_LEEG;
    return bedrag(inkomen.perJaar?.[jaar] ?? (jaar === r.C ? inkomen.controleReal : null));
  }, true);
  const controle = r.C && Number.isFinite(inkomen.controleExtr) && !onvolledig(r.C)
    ? rij('Controlejaar op jaarbasis', jaren, (jaar) => jaar === r.C ? bedrag(inkomen.controleExtr) : BEDRAG_LEEG) : '';
  return `<div class="scroll"><table class="tabel reken-tabel reken-jaartotaal">${tabelKop(jaren, r.C)}<tbody>${inhoud}${controle}</tbody></table></div>`;
}

function jaarPaneel(d, r, ontbreekt) {
  const jaren = [...new Set([...r.T, ...(r.C ? [r.C] : [])])].sort((a, b) => a - b);
  const bronPerId = new Map((d.ondernemingen || []).map((o) => [o.id, o]));
  const bedrijven = r.ondernemingen.map((a) => {
    const bron = bronPerId.get(a.id);
    return `<details class="stappen reken-uitklap"${r.ondernemingen.length === 1 ? ' open' : ''}>
      <summary>${esc(a.naam)} <span>${esc(a.rechtsvormKort)}${a.meenemen === false ? ' · telt niet mee voor inkomen' : ''}</span></summary>
      <div class="reken-uitklap-inhoud">${jaarTabelBedrijf(a, bron, jaren, r.C)}${linkNaar(d, 'invoer', 'Cijfers van deze onderneming bewerken', { ondId: a.id })}</div>
    </details>`;
  }).join('');
  return `<section class="reken-paneel" id="reken-boekjaren" aria-labelledby="reken-jaartitel">
    <div class="reken-paneel-kop"><h3 id="reken-jaartitel">Cijfers per boekjaar</h3><span class="reken-neutraal">${esc(jarenTekst(r.T))}${r.C ? ` · controlejaar ${esc(r.C)}` : ''}</span></div>
    ${jaarTotaal(r, jaren, ontbreekt)}
    ${persoonlijkeCijfers(d, jaren, r.C)}
    ${bedrijven ? `${bedrijven}<p class="reken-neutraal">Een streepje betekent dat een bedrag ontbreekt of voor die periode niet van toepassing is.</p>` : ''}
  </section>`;
}

function analyseUitkomst(d, x) {
  if (x.fout) return ['Niet te berekenen', ''];
  if (x.beleid) {
    if (x.beleid.bewijs && Number.isFinite(x.beleid.bedrag)) return [bedrag(x.beleid.bedrag), 'Op basis van bewijsstuk'];
    if (Number.isFinite(x.beleid.indicatie)) return [bedrag(x.beleid.indicatie), 'Indicatie'];
    const voorbeeld = oefenVoorbeeld(d, x.id);
    if (voorbeeld) return [bedrag(voorbeeld.bedrag), 'Fictieve oefenverklaring'];
    return ['Nog te bepalen', x.beleid.methode === 'extern' ? 'Bewijsstuk of bankbeoordeling nodig' : ''];
  }
  if (x.invoerBlokkeert) return ['Nog te bepalen', 'Invoer aanvullen'];
  return [bedrag(x.toetsinkomen), x.bron === 'geen' ? 'Vastgesteld inkomen € 0' : 'Berekend toetsinkomen'];
}

export function analyseBedragVoorDossier(d, uitkomst) {
  const [waarde, herkomst] = analyseUitkomst(d, uitkomst);
  return herkomst === 'Berekend toetsinkomen' || !herkomst ? waarde : `${waarde} · ${herkomst}`;
}

function analyseRij(d, x) {
  const [waarde, herkomst] = analyseUitkomst(d, x);
  const oordeel = x.fout ? pil('attentie', 'Rekenfout') : resultaatOordeel(x.status, x.beleid, x.invoerBlokkeert);
  const details = x.fout ? [x.fout] : [...new Set([...(x.nok || []), ...(x.toelichtingen || []), ...(x.stappen || [])])];
  const kernreden = details[0];
  const overige = details.slice(1);
  const uitleg = `${kernreden ? `<p class="reken-kernreden">${esc(kernreden)}</p>` : ''}
    ${overige.length ? `<details class="stappen reken-analyse-uitleg"><summary>Overige aandachtspunten</summary><ul>${overige.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}`;
  const box1 = !x.beleid && x.invoerBlokkeert ? BEDRAG_LEEG : bedrag(x.box1);
  const box2 = !x.beleid && x.invoerBlokkeert ? BEDRAG_LEEG : bedrag(x.box2);
  return `<tr data-analysekader="${esc(x.id)}"><th scope="row">${esc(x.kort)}<small>${esc(x.versie || '')}</small></th>
    <td>${oordeel}</td><td class="num">${esc(box1)}</td><td class="num">${esc(box2)}</td>
    <td class="num"><strong>${esc(waarde)}</strong>${herkomst ? `<small>${esc(herkomst)}</small>` : ''}</td><td>${uitleg}</td></tr>`;
}

export function renderAnalyseTabel(d, uitkomsten = vergelijkKaders(d)) {
  return `<div class="scroll" data-inkomensanalyse><table class="tabel reken-tabel reken-analysetabel">
      <thead><tr><th scope="col">Toetskader</th><th scope="col">Oordeel</th><th scope="col" class="num">Box 1</th><th scope="col" class="num">Box 2</th><th scope="col" class="num">Jaarinkomen</th><th scope="col">Onderbouwing</th></tr></thead>
      <tbody>${uitkomsten.map((x) => analyseRij(d, x)).join('')}</tbody>
    </table></div>`;
}

function analysePaneel(d, uitkomsten) {
  return `<section class="reken-paneel" id="reken-analyse" aria-labelledby="reken-analysetitel">
    <div class="reken-paneel-kop"><h3 id="reken-analysetitel">Uitkomsten per toetskader</h3><span class="reken-neutraal">${uitkomsten.length} toetskaders</span></div>
    ${renderAnalyseTabel(d, uitkomsten)}
  </section>`;
}

function controlePaneel(d, r) {
  const meldingen = [...new Map((r.meldingen || []).map((m) => [m.tekst, m])).values()];
  const rang = { niet_akkoord: 0, attentie: 1 };
  meldingen.sort((a, b) => (rang[a.niveau] ?? 2) - (rang[b.niveau] ?? 2));
  const actie = (m) => m.actie?.soort === 'woonbeleid-overnemen'
    ? `<button type="button" class="knop sec klein" data-actie="woonbeleid-overnemen" data-ond="${esc(m.actie.ondId)}" data-bedrag="${esc(m.actie.bedrag)}">Als afwijkend inkomen overnemen</button>` : '';
  return `<section class="reken-paneel" id="reken-controles" aria-labelledby="reken-controletitel">
    <div class="reken-paneel-kop"><h3 id="reken-controletitel">Beleidscontroles</h3>${r.beleid ? linkNaar(d, 'klant', 'Beleidsinvoer bekijken') : ''}</div>
    <ul class="reken-invoerpunten">${meldingen.map((m) => `<li><div>${pil(m.niveau)} <span>${esc(m.tekst)}</span></div>${actie(m)}</li>`).join('')}</ul>
  </section>`;
}

function tracePaneel(r, details, weergave) {
  const trace = r.soort === 'NUL' ? '' : renderTrace(r.trace);
  if (!trace && !details) return '';
  return `<section class="reken-paneel" id="reken-stappen" aria-labelledby="reken-stappentitel">
    <div class="reken-paneel-kop"><h3 id="reken-stappentitel">Onderbouwing</h3>${weergave}</div>
    ${trace ? `<details class="stappen reken-uitklap"><summary>Totale rekenstappen</summary><div class="reken-uitklap-inhoud">${trace}</div></details>` : ''}
    ${details ? `<details class="stappen reken-uitklap"><summary>${r.soort === 'NUL' ? 'Beoordeling per onderneming' : 'Financiële toetsen en details per onderneming'}</summary><div class="reken-uitklap-inhoud">${details}</div></details>` : ''}
  </section>`;
}

export function renderRekenwerkruimte(d, r, { details = '', weergave = '' } = {}) {
  const ontbreekt = rekenInvoerStatus(d, r);
  const punten = [...ontbreekt.dossier, ...ontbreekt.ondernemingen.flatMap((o) => o.punten)];
  const analyse = r.inkomensanalyse;
  const uitkomsten = analyse ? vergelijkKaders(d) : [];
  return `<div class="berekening rekenwerkruimte${ui.formules ? '' : ' zonder-formules'}">
    ${analyse ? `<section class="reken-overzicht" aria-labelledby="reken-titel">
      <div class="reken-overzicht-kop"><div><h2 id="reken-titel">Inkomensanalyse</h2><p>Vergelijk de uitkomsten op dezelfde dossierinvoer.</p></div></div>
    </section>` : enkelKaderKop(d, r, punten.some((punt) => punt.blokkeert))}
    <nav class="reken-snelkeuze geen-print" aria-label="Onderdelen van de berekening">
      ${analyse ? sectieKnop('reken-analyse', 'Uitkomsten vergelijken', 'kolommen') : ''}
      ${sectieKnop('reken-invoer', 'Invoer controleren', 'vink')}
      ${sectieKnop('reken-boekjaren', 'Cijfers per boekjaar', 'boek')}
      ${!analyse && r.meldingen?.length ? sectieKnop('reken-controles', 'Beleidscontroles', 'waarschuwing') : ''}
      ${!analyse && (details || r.soort !== 'NUL') ? sectieKnop('reken-stappen', 'Onderbouwing', 'formule') : ''}
    </nav>
    ${analyse ? analysePaneel(d, uitkomsten) : ''}
    ${invoerPaneel(d, ontbreekt, punten.length)}
    ${jaarPaneel(d, r, ontbreekt)}
    ${!analyse && r.meldingen?.length ? controlePaneel(d, r) : ''}
    ${analyse ? '' : tracePaneel(r, details, weergave)}
  </div>`;
}
