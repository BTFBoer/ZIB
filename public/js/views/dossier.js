import { esc, fmt, naamAanvrager, num, isIngevuld, getPath } from '../util.js';
import { get, lijst, state } from '../state.js';
import { bepaalJaren, vergelijkKaders } from '../engine/index.js';
import {
  RECHTSVORMEN, BEROEPSGROEPEN, SOORTEN, kaderLabel, soortOndernemer, KADERS, kaderOpties, kaderVoor, PARAM_LABELS, leesPad,
} from '../engine/kaders.js';
import {
  BALANS_RIJEN, VW_RIJEN, DIVERSEN_RIJEN, DIVERSEN_VLAGGEN, IB_ONDERNEMING_RIJEN, IB_PERSOON_RIJEN,
  DOSSIER_STATUSSEN, JAAR_STATUSSEN, AFGEROND, weergaveVan, detailSom, veldZichtbaar,
} from '../schema/fields.js';
import { CATEGORIEEN } from '../schema/documenten.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES } from '../schema/correcties.js';
import { balansTotalen, vwTotalen } from '../engine/financieel.js';
import { pil, statusPil, bedrag, veld, tekstvak, keuze, vink, melding, leeg, STATUS_TEKST, icoon } from './ui.js';
import { renderTrace } from './trace-view.js';
import { renderRapport } from './rapport.js';
import { FORMATS, CONTROLES, FIAT_VRAGEN, magFiatteren, conclusieFormat } from './formats.js';
import { datumKort } from './layout.js';
import { ui, ordeJaren } from './uistate.js';
import { renderBZI, bziKop, weergaveSchakelaar, hoofdbedrijven } from './bzi.js';
import {
  paneelRC, paneelLeningDirectie, paneelZK, paneelLoondienst, paneelNul, paneelAfwijkend,
  structuurVelden, rechtsvormOpties,
} from './panelen.js';
import { paneelOrganogram } from './organogram.js';
import { paneelGeldstromen, geldstromenTabel } from './geldstromen.js';
import { overwinstBlok } from './overwinst.js';
import { renderBziInvoer } from './bziinvoer.js';

export const TABS = [
  ['klant', 'Klantgegevens'],
  ['balans', 'Balans'],
  ['vw', 'V&W'],
  ['diversen', 'Diversen'],
  ['ib', 'IB-aangifte'],
  ['berekening', 'Berekening'],
  ['bziinvoer', 'BZI-invoer'],
  ['rapport', 'Rapport'],
  ['documenten', 'Documenten'],
  ['notities', 'Notities'],
  ['fiat', 'Fiattering'],
];

const PER_ONDERNEMING = ['balans', 'vw', 'diversen'];

// Overgang tussen de weergaven: welk tabblad hoort bij welke stap.
export const NAAR_BZI = { klant: 'algemeen', balans: 'bedrijf', vw: 'bedrijf', diversen: 'bedrijf', ib: 'bedrijf', notities: 'algemeen', bziinvoer: 'bziinvoer' };
export const NAAR_VIIZ = { algemeen: 'klant', bedrijven: 'klant', bedrijf: 'balans', boekhouders: 'notities', verplichtingen: 'klant', samenvatting: 'berekening', bziinvoer: 'bziinvoer' };

// ---------------------------------------------------------------------------
// Kop en tabbladen
// ---------------------------------------------------------------------------
export function dossierKop(d, r) {
  const adv = get(d.advieskantoorId);
  const isNul = d.soort === 'NUL';
  let label = 'Vastgesteld zakelijk inkomen';
  let toelichting = `Geldig voor bindende offertes t/m ${fmt.datum(r.geldigTot)}`;
  if (isNul) {
    label = '0-verklaring';
    toelichting = r.nul?.maandlastCorrectie ? `Maandlastcorrectie € ${fmt.getal(r.nul.maandlastCorrectie)} per maand` : r.nul ? STATUS_TEKST[r.nul.status] : '';
  } else if (r.bron === 'afwijkend') {
    label = 'Afwijkend inkomen (gemotiveerd)';
    toelichting = `Berekend inkomen ${fmt.eur(r.berekend)}`;
  } else if (r.bron === 'geen') {
    toelichting = 'Voorwaarden niet akkoord: geen zakelijk inkomen afgeven';
  } else if (r.familie === 'ABN') {
    label = 'Berekend inkomen (BZI)';
    const ph = r.inkomen?.perHoofdbedrijf || [];
    if (ph.some((x) => !x.nul && !x.voldoet)) toelichting = 'Voldoet niet aan het toetskader: motiveer een afwijking of geef geen inkomen af';
    else if (r.berekend !== r.toetsinkomen) toelichting = `Toetsinkomen Woonbeleid ${fmt.eur(r.toetsinkomen)}`;
  }
  return `<div class="dossierkop" id="dossierkop">
    <div>
      <div class="naam">${esc(naamAanvrager(d.aanvrager))}</div>
      <div class="meta">
        <span>${esc(d.nummer || '')}</span>
        ${pil('neutraal', SOORTEN[d.soort] || d.soort)} ${pil('neutraal', kaderLabel(d.kader))} ${statusPil(d.status)}${d.spoed ? ' <span class="badge-spoed">Spoed</span>' : ''}
        ${adv ? `<span>${esc(adv.naam)}</span>` : ''}
        <span>Berekeningsdatum ${esc(fmt.datum(r.datum))}</span>
        <span>Toetsjaren ${esc(r.T.join(', '))}${r.C ? ` + ${r.C}` : ''}</span>
      </div>
      <div style="margin-top:10px">${weergaveSchakelaar(d, 'viiz')}</div>
    </div>
    <div class="toetsinkomen">
      <div class="label">${esc(label)} ${pil(r.status)}</div>
      <div class="bedrag">${isNul ? '€ 0' : esc(fmt.eur(r.vastgesteld))}</div>
      <div class="toelichting">${esc(toelichting)}</div>
    </div>
  </div>`;
}

/** Weergave van dit dossier, rekening houdend met de voorkeur van de gebruiker voor ABN AMRO-dossiers. */
export function weergaveDossier(d) {
  return weergaveVan(d, state.profiel?.weergaveABN || 'viiz');
}

export function kopVoor(d, r) {
  return weergaveDossier(d) === 'bzi' ? bziKop(d, r) : dossierKop(d, r);
}

function tabs(d, tab, ondId, r, docs) {
  const ontbrekend = r.documenten.filter((x) => x.verplicht && !docAanwezig(docs, x)).length;
  return `<nav class="tabs geen-print" aria-label="Dossier">${TABS.map(([k, l]) => {
    const pad = PER_ONDERNEMING.includes(k) && ondId ? `/${ondId}` : '';
    const teller = k === 'documenten' && ontbrekend ? `<span class="teller">${ontbrekend}</span>` : '';
    return `<a href="#/dossier/${esc(d.id)}/${k}${pad}" class="${k === tab ? 'actief' : ''}">${esc(l)}${teller}</a>`;
  }).join('')}</nav>`;
}

export function renderDossier(d, tab, ondId, r) {
  const docs = lijst('document').filter((x) => x.dossierId === d.id);
  if (weergaveDossier(d) === 'bzi') {
    const ontbrekend = r.documenten.filter((x) => x.verplicht && !docAanwezig(docs, x)).length;
    return renderBZI(d, NAAR_BZI[tab] || tab, ondId, r, {
      ontbrekend,
      documenten: () => tabDocumenten(d, r, docs),
      berekening: () => tabBerekening(d, r),
      bziinvoer: () => renderBziInvoer(d, r),
      rapport: () => rapportMetKnoppen(d, r),
      fiat: () => tabFiat(d, r),
    });
  }
  const t = NAAR_VIIZ[tab] || tab;
  const onds = d.ondernemingen || [];
  const ond = onds.find((o) => o.id === ondId) || onds[0];
  let inhoud;
  switch (t) {
    case 'balans': inhoud = ond ? tabRooster(d, ond, 'balans', r) : geenOnderneming(d); break;
    case 'vw': inhoud = ond ? tabRooster(d, ond, 'vw', r) : geenOnderneming(d); break;
    case 'diversen': inhoud = ond ? tabRooster(d, ond, 'diversen', r) : geenOnderneming(d); break;
    case 'ib': inhoud = tabIB(d, r); break;
    case 'berekening': inhoud = tabBerekening(d, r); break;
    case 'bziinvoer': inhoud = renderBziInvoer(d, r); break;
    case 'rapport': inhoud = rapportMetKnoppen(d, r); break;
    case 'documenten': inhoud = tabDocumenten(d, r, docs); break;
    case 'notities': inhoud = tabNotities(d, r); break;
    case 'fiat': inhoud = tabFiat(d, r); break;
    default: inhoud = tabKlant(d, r);
  }
  const keuzeOnd = PER_ONDERNEMING.includes(t) && onds.length > 1
    ? `<div class="ondkeuze geen-print">${onds.map((o) => `<a href="#/dossier/${esc(d.id)}/${t}/${esc(o.id)}" class="${o.id === ond?.id ? 'actief' : ''}">${esc(o.naam || '(naamloos)')}</a>`).join('')}</div>` : '';
  return `${dossierKop(d, r)}${tabs(d, t, ond?.id, r, docs)}${keuzeOnd}<div id="tabinhoud">${inhoud}</div>`;
}

function rapportMetKnoppen(d, r) {
  // In een ingesloten voorbeeldweergave (ZIB_ARTIFACT) kan de pagina niet afdrukken: download het rapport
  // dan als HTML-bestand en druk dat af vanuit de browser.
  const afdrukken = globalThis.ZIB_ARTIFACT
    ? '<button class="knop" data-actie="rapport-download">Rapport downloaden (HTML, om af te drukken)</button>'
    : '<button class="knop" data-actie="afdrukken">Afdrukken of opslaan als pdf</button>';
  return `<div class="acties geen-print" style="margin-bottom:12px">
      ${afdrukken}
      <button class="knop sec" data-actie="kopieer-notities">Kopieer dossiernotities</button></div>${renderRapport(d, r)}`;
}

function geenOnderneming(d) {
  return leeg('Dit dossier heeft nog geen onderneming.', `<a class="knop" href="#/dossier/${esc(d.id)}/klant">Onderneming toevoegen</a>`);
}

// ---------------------------------------------------------------------------
// Klantgegevens
// ---------------------------------------------------------------------------
function tabKlant(d, r) {
  const a = d.aanvrager || {};
  const inst = d.instellingen || {};
  const kader = kaderVoor(d);
  const { jaarNu } = bepaalJaren(d);
  const advOpties = lijst('advieskantoor').sort((x, y) => x.naam.localeCompare(y.naam)).map((x) => [x.id, x.naam]);
  const toetsjaarOpties = [['', `Standaard (${r.T3})`], ...[jaarNu - 1, jaarNu - 2, jaarNu - 3].map((y) => [String(y), String(y)])];
  const heeftVPB = (d.ondernemingen || []).some((o) => soortOndernemer(o.rechtsvorm) === 'VPB');

  const aanvraag = `<div class="paneel"><h2>Aanvraag</h2><div class="raster-3">
    ${keuze('Soort aanvraag', 'soort', { IKV: 'Inkomensverklaring (IKV)', NUL: '0-verklaring (nul-inkomen)' }, d.soort, { render: true })}
    ${keuze('Toetskader', 'kader', kaderOpties(), d.kader, { render: true, hint: `${kader.versie}. ${kader.bronStatus || ''}` })}
    ${veld('Berekeningsdatum', 'berekeningsdatum', d.berekeningsdatum, { type: 'datum', render: true })}
    ${keuze('Laatste toetsjaar', 'instellingen.laatsteToetsjaar', toetsjaarOpties, inst.laatsteToetsjaar ?? '', { render: true, type: 'getal',
      hint: `Definitieve cijfers vorig jaar verplicht vanaf ${kader.definitiefVerplichtVanaf.d}-${kader.definitiefVerplichtVanaf.m}.` })}
    ${keuze('Status', 'status', DOSSIER_STATUSSEN, d.status, { render: true })}
    ${keuze('Niveau dossier', 'niveau', ['Basis', 'Medium', 'Top'], d.niveau || 'Basis')}
    ${veld('Behandelaar (1e fiat)', 'behandelaar', d.behandelaar)}
    ${keuze('Advieskantoor', 'advieskantoorId', advOpties, d.advieskantoorId, { leeg: 'Geen / onbekend' })}
    ${keuze('Opdrachtnemer (label)', 'label', ['ABN AMRO', 'Florius', 'Moneyou', 'ASN Bank', 'Knab', 'Overig'], d.label || ({ ASN: 'ASN Bank', KNAB: 'Knab' }[d.kader] || 'ABN AMRO'))}
    ${keuze('Afdeling', 'afdeling', ['FMD', 'IMV', 'RV'], d.afdeling || 'IMV', { hint: 'Bepaalt het format van de conclusie.' })}
    ${veld('Hypotheekaanvraagnummer', 'leningnummer', d.leningnummer)}
    ${veld('Aantal ondernemingen bij aanvraag', 'instellingen.initieelAantalOndernemingen', inst.initieelAantalOndernemingen, { type: 'getal' })}
    ${veld('Datum aanvraag', 'datumAanvraag', d.datumAanvraag || String(d.aangemaakt || '').slice(0, 10), { type: 'datum' })}
    ${veld('Uiterste datum', 'uitersteDatum', d.uitersteDatum, { type: 'datum', render: true })}
    ${veld('Via', 'via', d.via, { placeholder: 'Bijv. adviseur, invoerservice, accountant' })}
    ${veld('Relatienummer (bestaande relatie)', 'relatienummer', d.relatienummer, { placeholder: 'Alleen bij een bestaande relatie' })}
  </div>
  <div class="raster-2" style="margin-top:14px">
    <div>${vink('Spoeddossier', 'spoed', !!d.spoed, { render: true })}</div>
    <div>${vink('Bestaande relatie van de geldverstrekker', 'bestaandeRelatie', !!d.bestaandeRelatie, { render: true })}</div>
    <div>${vink('Controlejaar / lopend jaar meenemen (als er cijfers zijn)', 'instellingen.controlejaar', inst.controlejaar !== false, { render: true })}</div>
    ${kader.vervangenVanaf && kader.familie === 'NHG' && d.soort === 'IKV' ? `<div>${vink('Oudste jaar vervangen door het gerealiseerde resultaat van het lopende jaar', 'instellingen.vervangOudsteJaar', !!inst.vervangOudsteJaar, { render: true, hint: `${kader.kort}: vanaf ${kader.vervangenVanaf.d}-${kader.vervangenVanaf.m} met tussentijdse balans en W&V${kader.id === 'ASN' ? '; op basis van het werkelijke aantal maanden, maximaal het laatste volledige jaar' : kader.id === 'KNAB' ? '; het vervangende jaar weegt 3×' : '; alleen hele maanden'}.` })}
      ${r.inkomen?.vergelijking ? `<p class="dempen klein" style="margin:6px 0 0 24px">Box 1 zonder vervanging ${esc(fmt.eur(r.inkomen.vergelijking.zonder))}, met vervanging ${esc(fmt.eur(r.inkomen.vergelijking.met))}.</p>` : ''}</div>` : ''}
  </div>
  ${heeftVPB && d.soort === 'IKV' ? box2Keuzes(d, kader, inst) : ''}
  ${d.soort === 'IKV' && kader.familie === 'NHG' && kader.id !== 'NHG' ? kaderKeuzes(d, kader, inst) : ''}
  ${kader.instelbaar?.length && d.soort === 'IKV' ? kaderParameters(d, kader) : ''}
  </div>`;

  const aanvrager = `<div class="paneel"><h2>Aanvrager</h2><div class="raster-3">
    ${veld('Voorletters', 'aanvrager.voorletters', a.voorletters)}
    ${veld('Tussenvoegsel', 'aanvrager.tussenvoegsel', a.tussenvoegsel)}
    ${veld('Achternaam', 'aanvrager.achternaam', a.achternaam)}
    ${keuze('Geslacht', 'aanvrager.geslacht', { M: 'Man', V: 'Vrouw', X: 'Anders/onbekend' }, a.geslacht, { leeg: '' })}
    ${veld('Geboortedatum', 'aanvrager.geboortedatum', a.geboortedatum, { type: 'datum' })}
    ${veld('Geboorteplaats', 'aanvrager.geboorteplaats', a.geboorteplaats)}
    ${veld('Straat', 'aanvrager.straat', a.straat)}
    ${veld('Huisnummer', 'aanvrager.huisnummer', a.huisnummer)}
    ${veld('Postcode', 'aanvrager.postcode', a.postcode)}
    ${veld('Woonplaats', 'aanvrager.woonplaats', a.woonplaats)}
    ${veld('Telefoon', 'aanvrager.telefoon', a.telefoon)}
    ${veld('E-mail', 'aanvrager.email', a.email, { type: 'email' })}
  </div><p class="dempen klein" style="margin-top:10px">Leg geen BSN of rekeningnummers vast; die zijn voor de inkomensbepaling niet nodig.</p></div>`;

  const ondernemingen = `<div class="paneel"><div class="paginakop" style="margin:0 0 6px"><h2>Ondernemingen en structuur</h2>
    <button class="knop sec" data-actie="ond-toevoegen">${icoon('plus')}Onderneming toevoegen</button></div>
    ${(d.ondernemingen || []).map((o, i) => ondernemingKaart(d, o, i, r)).join('') || leeg('Nog geen ondernemingen vastgelegd.')}</div>`;

  return `${aanvraag}${aanvrager}${ondernemingen}
    ${paneelOrganogram(d, { bewerken: true, titel: 'Organogram en overige aandeelhouders' })}
    ${paneelGeldstromen(d, r)}
    ${kader.familie === 'NHG' || d.soort === 'NUL' ? paneelLoondienst(d, r) : ''}
    ${heeftVPB ? paneelRC(d, r) : ''}
    ${heeftVPB ? paneelLeningDirectie(d, r) : ''}
    ${paneelZK(d)}
    ${d.soort === 'NUL' || (d.ondernemingen || []).some((o) => o.meenemen === false || o.nulInkomen) ? paneelNul(d) : ''}
    ${d.soort === 'IKV' ? paneelAfwijkend(d, r) : ''}`;
}

// Keuzes voor box 2 per kader
function box2Keuzes(d, kader, inst) {
  const m = kader.box2?.model;
  if (m === 'NHG') {
    const pctOw = Math.round((1 - (kader.box2.afslag || 0)) * 100);
    return `<div class="raster-3" style="margin-top:14px">${keuze('Box 2 inkomen (DGA)', 'instellingen.box2Route', {
      route1: `Route 1: uitgekeerd dividend${kader.box2.dividendPerJaar ? ' (per jaar in het totaalinkomen)' : ''}`,
      route2: `Route 2: nog niet uitgekeerde winstreserve (${pctOw}%)`,
      combinatie: 'Uitzonderingsroute: combinatie (motiveren)', geen: 'Geen box 2 inkomen' }, inst.box2Route || 'route1', { render: true })}</div>`;
  }
  if (m === 'ABN') {
    return `<div class="raster-2" style="margin-top:14px">
        ${vink('Uitgekeerd dividend meenemen', 'instellingen.abnDividend.uitgekeerd', inst.abnDividend?.uitgekeerd !== false, { render: true })}
        <p class="dempen klein" style="margin:0">Overwinst (niet-uitgekeerd dividend) met de dubbele balanstoets stel je per hoofdbedrijf in op het tabblad <a href="#/dossier/${esc(d.id)}/berekening">Berekening</a>; de holdingroute bij de onderneming.</p>
      </div>`;
  }
  if (m === 'ASN') {
    return `<p class="dempen klein" style="margin-top:14px">ASN Bank (§3.2): bij meer dan 50% zeggenschap tellen de gemiddelde winst na Vpb en het uitgekeerde dividend vanzelf mee, begrensd door de dubbele balanstoets (current ratio ≥ 1, solvabiliteit ≥ 20%) en op loon plus winst na Vpb van het laatste jaar. Een minderheidsbelang telt alleen met een jaarlijks terugkerend dividend (vink dat aan bij de onderneming).</p>`;
  }
  if (m === 'OPT') {
    return `<p class="dempen klein" style="margin-top:14px">Optimaal: loon plus het aandeel in de winst na Vpb van vennootschappen met zeggenschap (look-through, zonder resultaat deelnemingen), begrensd op wat na de dubbele balanstoets en uit vrije reserves uitkeerbaar is. Minderheidsbelangen tellen alleen via werkelijk ontvangen dividend met een trackrecord.</p>`;
  }
  return '';
}

// Kaderspecifieke keuzes (ASN, Knab, Optimaal)
function kaderKeuzes(d, kader, inst) {
  const b = inst.belet || {};
  const { T } = bepaalJaren(d);
  const beletLabel = kader.incidentRegel ? 'Incidenteel jaar (§3.8: bijv. zwangerschap of een afgesloten weg)' : 'Beletperiode (zwangerschap, ziekte, calamiteit; maximaal 12 maanden)';
  const hintBelet = kader.incidentRegel
    ? 'Het jaar wordt vervangen door de geëxtrapoleerde tussentijdse cijfers; voorleggen aan een senior specialist.'
    : 'Het jaar wordt vervangen door het laagste omliggende jaar; het inkomen is maximaal het inkomen ná het belet. Alleen bij 36 maanden of langer.';
  return `<h3 style="margin-top:16px">Keuzes ${esc(kader.kort)}</h3>
  <div class="raster-2">
    <div style="display:grid;gap:8px">
      ${vink(kader.id === 'ASN' ? 'Aanvrager werd partner in het bedrijf waar hij werknemer was, of was leidinggevende in de overgenomen onderneming (§3.4)' : 'Relevant voorafgaand dienstverband: zelfde branche én vergelijkbare activiteiten', 'instellingen.relevantDienstverband', inst.relevantDienstverband === true,
    { render: true, hint: kader.id === 'ASN' ? 'Loon vóór de start telt dan mee.' : 'Loon vóór de start telt mee en de starterafslag vervalt.' })}
      ${kader.id === 'ASN' ? vink('Trackrecord van 3 jaar bij dezelfde onderneming: de startersafslag vervalt (§3.4)', 'instellingen.trackrecordZelfdeOnderneming', inst.trackrecordZelfdeOnderneming === true, { render: true }) : ''}
    </div>
    ${kader.beletRegel || kader.incidentRegel ? `<div>${vink(beletLabel, 'instellingen.belet.actief', !!b.actief, { render: true, hint: hintBelet })}
      ${b.actief ? `<div class="raster-2" style="margin-top:8px">${keuze('Jaar', 'instellingen.belet.jaar', T.map((y) => [String(y), String(y)]), b.jaar ? String(b.jaar) : '', { render: true, leeg: 'Kies', type: 'getal' })}
        ${veld('Oorzaak', 'instellingen.belet.oorzaak', b.oorzaak, { placeholder: 'Bijv. zwangerschapsverlof' })}</div>
        ${tekstvak('Motivatie en stukken', 'instellingen.belet.motivatie', b.motivatie, { rijen: 3, hint: 'Verklaring boekhouder over de oorzaak, periode van het belet en de cijfers erna.' })}` : ''}</div>` : '<div></div>'}
  </div>`;
}

// Instelbare parameters van het kader (per dossier)
function kaderParameters(d, kader) {
  const over = d.instellingen?.kaderParams?.[kader.id] || {};
  const basis = KADERS[kader.id];
  const velden = kader.instelbaar.map((pad) => {
    const [label, eenheid] = PARAM_LABELS[pad] || [pad, 'getal'];
    const std = leesPad(basis, pad);
    const stdTekst = eenheid === 'pct' ? `${String(Math.round(std * 1000) / 10).replace('.', ',')}%` : String(std).replace('.', ',');
    const raw = over[pad] ?? leesPad(over, pad);
    return veld(`${label}${eenheid === 'pct' ? ' (%)' : ''}`, `instellingen.kaderParams.${kader.id}.${pad}`, raw ?? '',
      { type: eenheid === 'pct' ? 'pct' : 'getal', render: true, placeholder: stdTekst, hint: `Standaard ${stdTekst}` });
  }).join('');
  const aantal = Object.keys(kader.aangepast || {}).length;
  return `<details class="stappen" style="margin-top:14px"${aantal ? ' open' : ''}><summary>Parameters ${esc(kader.kort)}${aantal ? ` (${aantal} aangepast)` : ' (standaard)'}</summary>
    <div class="inhoud"><p class="dempen klein">Laat een veld leeg voor de standaardwaarde. Aangepaste parameters staan in de rekenstappen en het rapport.</p><div class="raster-3">${velden}</div></div></details>`;
}

function ondernemingKaart(d, o, i, r) {
  const b = `ond:${o.id}`;
  const soort = soortOndernemer(o.rechtsvorm);
  const sbi45 = /(^|\n)\s*45/.test(String(o.sbi || ''));
  const analyse = r.ondernemingen.find((x) => x.id === o.id);
  const ouder = (d.ondernemingen || []).find((x) => x.id === o.parentId);
  return `<div class="paneel ond-kaart" style="margin-top:12px;box-shadow:none">
    <div class="paginakop" style="margin:0 0 10px"><h3>${i + 1}. ${esc(o.naam || '(naamloos)')} ${analyse ? pil(analyse.status) : ''}${ouder ? ` <span class="dempen klein">deelneming van ${esc(ouder.naam)}</span>` : ''}</h3>
      <button class="knop gevaar klein" data-actie="ond-verwijderen" data-ond="${esc(o.id)}">Verwijderen</button></div>
    <div class="raster-3">
      ${veld('Statutaire naam', `${b}.naam`, o.naam, { render: false })}
      ${keuze('Rechtsvorm', `${b}.rechtsvorm`, rechtsvormOpties(), o.rechtsvorm, { render: true })}
      ${veld('Activiteit (kort)', `${b}.activiteit`, o.activiteit, { placeholder: 'Bijv. Holding, Installatietechniek' })}
      ${veld('KvK-nummer', `${b}.kvk`, o.kvk)}
      ${veld('Startdatum KvK', `${b}.startdatum`, o.startdatum, { type: 'datum', render: true })}
      ${veld('Start activiteiten (indien eerder)', `${b}.startActiviteiten`, o.startActiviteiten, { type: 'datum', render: true, hint: 'Bijv. bij rechtsvormwijziging of aantoonbaar eerder gestart.' })}
      ${soort === 'VPB' ? keuze('Belang', `${b}.direct`, { true: 'Direct', false: 'Indirect (via holding)' }, String(o.direct !== false), { render: true }) : ''}
      ${keuze('Beroepsgroep', `${b}.beroepsgroep`, BEROEPSGROEPEN, o.beroepsgroep || 'overig', { render: true })}
      ${keuze('Gevestigd in', `${b}.land`, { NL: 'Nederland', BE: 'België', DE: 'Duitsland', LU: 'Luxemburg', OV: 'Overig buitenland' }, o.land || 'NL', { render: true })}
      ${keuze('Belastingplichtig in', `${b}.belastingplichtig`, { NL: 'Nederland', OV: 'Buitenland' }, o.belastingplichtig || 'NL', { render: true })}
      ${veld('Website', `${b}.website`, o.website)}
      ${veld('Aantal medewerkers (gemiddeld)', `${b}.medewerkers`, o.medewerkers, { type: 'getal' })}
    </div>
    <h4 style="margin-top:14px">Structuur</h4>
    ${structuurVelden(d, o)}
    <div class="raster-2" style="margin-top:12px">
      ${tekstvak('SBI-code(s) en omschrijving (één per regel)', `${b}.sbi`, o.sbi, { rijen: 2 })}
      <div style="display:grid;gap:8px">
        ${vink('Onderneming is actief', `${b}.actief`, o.actief !== false, { render: true })}
        ${d.soort === 'IKV' ? vink('Inkomen uit deze onderneming meenemen', `${b}.meenemen`, o.meenemen !== false, { render: true, hint: 'Uitzetten = alleen risicobeoordeling (zoals bij een 0-verklaring).' }) : ''}
        ${soort === 'VPB' ? vink('Zelfstandig bevoegd om dividend uit te keren (zeggenschap aangetoond)', `${b}.zeggenschap`, !!o.zeggenschap, { render: true }) : ''}
        ${d.soort === 'IKV' && r.familie !== 'ABN' ? vink('0-inkomen / beoordelingsverklaring (alleen risicobeoordeling)', `${b}.nulInkomen`, !!o.nulInkomen, { render: true, hint: 'Bijv. een nieuwe persoonlijke holding zonder eigen inkomen: telt niet mee in het inkomen en het toetskader.' }) : ''}
        ${soort === 'VPB' && r.kader === 'ASN' && !o.parentId && analyse && analyse.aandeel <= 0.5 ? vink('Dividend uit dit minderheidsbelang is jaarlijks terugkerend en bestendig (§3.2, expert judgement)', `${b}.minderheidDividendBestendig`, !!o.minderheidDividendBestendig, { render: true }) : ''}
        ${soort === 'VPB' && r.familie === 'ABN' && !o.parentId ? vink('Holdingroute (3.63): DGA-loon + ontvangen dividend uit minderheidsdeelneming(en)', `${b}.holdingroute`, !!o.holdingroute, { render: true, hint: 'Gemiddeld ontvangen dividend, maximaal het laatste jaar. Uitkering en winst van de holding tellen dan niet mee.' }) : ''}
        ${o.parentId && soort === 'VPB' ? vink('Cijfers zijn geconsolideerd in de aandeelhouder', `${b}.geconsolideerd`, !!o.geconsolideerd, { render: true }) : ''}
        ${vink('Opgericht naar Nederlands recht', `${b}.rechtNL`, o.rechtNL !== false, { render: true })}
        ${vink('Prognose opgesteld door RA/AA-accountant', `${b}.prognoseRAAA`, !!o.prognoseRAAA, { render: true })}
        ${['medisch_juridisch', 'fysiotherapeut'].includes(o.beroepsgroep) ? vink('Inschrijving beroepsregister gecontroleerd, geen maatregel', `${b}.registerGecontroleerd`, !!o.registerGecontroleerd, { render: true }) : ''}
        ${sbi45 ? keuze('Heeft de onderneming kasgeld?', `${b}.kasgeld`, { ja: 'Ja: kasboek uploaden', nee: 'Nee: verklaring boekhouder uploaden' }, o.kasgeld, { render: true, leeg: 'Maak een keuze' }) : ''}
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Invoerroosters (quick-scan en uitgebreide modus)
// ---------------------------------------------------------------------------
/** Jaarkolommen van de invoerroosters: standaard het meest recente jaar links, het oudste rechts. */
export function roosterJaren(d) {
  const { T, kandidaatC } = bepaalJaren(d);
  return { jaren: ordeJaren([...T, kandidaatC]), kandidaatC };
}

/**
 * Waarde voor een berekende cel. Sleutels:
 *   balans|<ondId>|<jaar>|<totaal>   vw|<ondId>|<jaar>|<totaal>   (uit de invoer)
 *   r|<ondId>|<jaar>|<pad>                                         (uit de analyse van de rekenkern)
 *   detail|<ondId>|<jaar>|<sectie>|<post>                          (som van de onderdelen)
 */
export function calcWaarde(d, sleutel, r) {
  const delen = sleutel.split('|');
  const [sectie, ondId, y] = delen;
  if (sectie === 'r') {
    const a = r?.ondernemingen?.find((x) => x.id === ondId);
    return getPath(a?.jaren?.[y], delen[3]);
  }
  const ond = (d.ondernemingen || []).find((o) => o.id === ondId);
  const j = ond?.jaren?.[y] || {};
  if (sectie === 'balans') return balansTotalen(j.balans)[delen[3]];
  if (sectie === 'vw') return vwTotalen(j.vw)[delen[3]];
  if (sectie === 'detail') return detailSom(j[`${delen[3]}Detail`]?.[delen[4]]);
  return null;
}

function jaarKop(ond, y, kandidaatC, metStatus) {
  const jd = ond.jaren?.[y] || {};
  const isC = y === kandidaatC;
  const status = jd.status || (isC ? 'tussentijds' : 'definitief');
  let html = `<div class="jaarkop"><b>${y}${isC ? ' (lopend jaar)' : ''}</b>`;
  if (metStatus) {
    html += keuze(null, `ond:${ond.id}.jaren.${y}.status`, JAAR_STATUSSEN, status, { render: true });
    if (isC || status === 'tussentijds') {
      html += `<input type="date" aria-label="Periode vanaf ${y}" value="${esc(jd.van || `${y}-01-01`)}" data-bind="ond:${ond.id}.jaren.${y}.van" data-type="datum" data-render="1">`;
      html += `<input type="date" aria-label="Periode tot en met ${y}" value="${esc(jd.tot || `${y}-12-31`)}" data-bind="ond:${ond.id}.jaren.${y}.tot" data-type="datum" data-render="1">`;
    }
  }
  return `${html}</div>`;
}

function tabRooster(d, ond, tab, r) {
  const { jaren, kandidaatC } = roosterJaren(d);
  const sectie = { balans: 'balans', vw: 'vw', diversen: 'div' }[tab];
  const soort = soortOndernemer(ond.rechtsvorm);
  const rijen = (tab === 'balans' ? BALANS_RIJEN : tab === 'vw' ? VW_RIJEN : DIVERSEN_RIJEN)
    .filter((x) => veldZichtbaar(x, kaderVoor(d), soort));
  const heeftExtra = rijen.some((x) => x.t === 'extra');
  const kop = `<tr><th>${tab === 'balans' ? `Balans (${ui.uitgebreid ? 'uitgebreide modus' : 'quick-scan'})` : tab === 'vw' ? `Winst- en verliesrekening (${ui.uitgebreid ? 'uitgebreide modus' : 'quick-scan'})` : 'Correcties en aanvullende gegevens'}</th>
    ${jaren.map((y) => `<th>${jaarKop(ond, y, kandidaatC, tab !== 'diversen')}</th>`).join('')}</tr>`;
  const body = rijen.map((rij) => roosterRij(d, ond, rij, sectie, jaren)).join('');
  let vlaggen = '';
  let correcties = '';
  if (tab === 'diversen') {
    const v = DIVERSEN_VLAGGEN.filter((f) => veldZichtbaar(f, kaderVoor(d), soort));
    if (v.length) {
      vlaggen = `<tr class="kop"><td colspan="${jaren.length + 1}">Keuzes per jaar</td></tr>${v.map((f) => `<tr><td>${esc(f.label)}</td>${jaren.map((y) => {
        const w = ond.jaren?.[y]?.div?.[f.k];
        const aan = f.standaard ? w !== false : !!w;
        return `<td class="invoer"><input type="checkbox" aria-label="${esc(f.label)} ${y}"${aan ? ' checked' : ''} data-bind="ond:${ond.id}.jaren.${y}.div.${f.k}" data-type="bool"></td>`;
      }).join('')}</tr>`).join('')}`;
    }
    correcties = handmatigeCorrecties(d, ond, jaren, r);
  }
  const uitleg = {
    balans: 'Bedragen per balansdatum. Punten zijn duizendtallen, de komma is het decimaalteken. Het verschil tussen activa en passiva moet 0 zijn.',
    vw: 'Kosten en lasten als positief bedrag invullen. Bij het lopende jaar: de cijfers over de periode in de kolomkop.',
    diversen: `Correcties volgen het gekozen kader (${kaderLabel(d.kader)}). Laat incidentele baten/lasten leeg om de bijzondere posten uit de V&W te gebruiken.`,
  }[tab];
  const modusKnop = tab !== 'diversen' ? `<div class="segment" role="group" aria-label="Invoermodus">
      <button type="button" class="${ui.uitgebreid ? '' : 'actief'}" data-actie="modus" data-modus="quick">Quick-scan</button>
      <button type="button" class="${ui.uitgebreid ? 'actief' : ''}" data-actie="modus" data-modus="uitgebreid">Uitgebreide modus</button></div>` : '';
  return `<div class="paneel" style="padding:12px">
    <div class="acties geen-print" style="justify-content:space-between;margin-bottom:8px">
      <span class="dempen klein" style="max-width:70ch">${esc(uitleg)}</span>
      <span class="acties">${modusKnop}
        ${tab !== 'diversen' ? `<button class="knop sec klein" data-actie="grootboek-open" data-ond="${esc(ond.id)}">${icoon('boek')}Grootboek importeren</button>` : ''}
        ${heeftExtra ? '<button class="knop sec klein" data-actie="toggle-extra">Aanvullende posten tonen/verbergen</button>' : ''}</span>
    </div>
    ${ui.uitgebreid && tab !== 'diversen' ? '<p class="dempen klein legenda">▸ dichtgeklapt, ▾ opengeklapt; een post met ingevulde onderdelen is de som van die onderdelen. ⇒ = waarvan-post (telt niet mee in het totaal).</p>' : ''}
    <div class="scroll"><table class="rooster${ui.uitgebreid ? ' uitgebreid' : ''}" id="rooster"><thead>${kop}</thead><tbody>${body}${vlaggen}</tbody></table></div>
  </div>${correcties}`;
}

function roosterRij(d, ond, rij, sectie, jaren) {
  const n = jaren.length;
  if (rij.t === 'kop') return `<tr class="kop"><td colspan="${n + 1}">${esc(rij.label)}</td></tr>`;
  if (rij.t === 'sub') return `<tr class="sub"><td class="ind${rij.ind || 0}">${esc(rij.label)}</td>${'<td></td>'.repeat(n)}</tr>`;
  if (rij.t === 'som') {
    const cls = rij.controle ? 'controle' : rij.sterk ? 'som sterk' : 'som';
    return `<tr class="${cls}"><td>${esc(rij.label)}</td>${jaren.map((y) => {
      const sleutel = `${sectie === 'div' ? 'div' : sectie}|${ond.id}|${y}|${rij.k}`;
      const w = calcWaarde(d, sleutel);
      const fout = rij.controle && Math.abs(num(w)) > 1;
      return `<td class="calc${fout ? ' fout' : ''}" data-calc="${esc(sleutel)}">${fmt.getal(w ?? 0)}</td>`;
    }).join('')}</tr>`;
  }
  const isExtra = rij.t === 'extra';
  const heeftWaarde = isExtra && jaren.some((y) => num(ond.jaren?.[y]?.[sectie]?.[rij.k]) !== 0);
  const isWaarvan = rij.t === 'waarvan';
  const cls = [isExtra && !heeftWaarde ? 'extra' : '', isWaarvan ? 'waarvan' : ''].filter(Boolean).join(' ');
  const detail = ui.uitgebreid && rij.detail && sectie !== 'div';
  const sleutelOpen = `${ond.id}|${sectie}|${rij.k}`;
  const open = detail && ui.open.has(sleutelOpen);
  const heeftDetail = (y) => detail && detailSom(ond.jaren?.[y]?.[`${sectie}Detail`]?.[rij.k]) !== null;
  const toggle = detail ? `<button type="button" class="detail-toggle" data-actie="detail-toggle" data-sleutel="${esc(sleutelOpen)}" aria-expanded="${open}" title="${open ? 'Dichtklappen' : 'Openklappen'}">${open ? '▾' : '▸'}</button>` : '';
  const label = `${toggle}${isWaarvan ? '⇒ ' : ''}${esc(rij.label)}${rij.hint ? `<span class="hint">${esc(rij.hint)}</span>` : ''}`;
  const cellen = jaren.map((y) => {
    const j = ond.jaren?.[y] || {};
    const waarde = j[sectie]?.[rij.k];
    let placeholder = '';
    if (sectie === 'div' && rij.k === 'incidenteleBaten' && num(j.vw?.bijzondereBaten)) placeholder = fmt.getal(num(j.vw.bijzondereBaten));
    if (sectie === 'div' && rij.k === 'incidenteleLasten' && num(j.vw?.bijzondereLasten)) placeholder = fmt.getal(num(j.vw.bijzondereLasten));
    const bind = `ond:${ond.id}.jaren.${y}.${sectie}.${rij.k}`;
    if (rij.soort === 'getal') {
      return `<td class="invoer"><input class="bedrag" inputmode="decimal" value="${isIngevuld(waarde) ? esc(String(waarde).replace('.', ',')) : ''}" data-bind="${esc(bind)}" data-type="getal" aria-label="${esc(rij.label)} ${y}"></td>`;
    }
    if (heeftDetail(y)) {
      return `<td class="calc detail-som" data-calc="detail|${esc(ond.id)}|${y}|${sectie}|${esc(rij.k)}" title="Som van de onderdelen">${fmt.getal(waarde ?? 0)}</td>`;
    }
    return `<td class="invoer">${bedrag(bind, waarde, { placeholder, label: `${rij.label} ${y}` })}</td>`;
  }).join('');
  let html = `<tr class="${cls}${detail ? ' heeft-detail' : ''}"><td class="ind${rij.ind || 0}">${label}</td>${cellen}</tr>`;
  if (open) {
    rij.detail.forEach(([k, l]) => {
      html += `<tr class="detail"><td class="ind${(rij.ind || 0) + 1} detail-label">${esc(l)}</td>${jaren.map((y) => {
        const w = ond.jaren?.[y]?.[`${sectie}Detail`]?.[rij.k]?.[k];
        return `<td class="invoer">${bedrag(`ond:${ond.id}.jaren.${y}.${sectie}Detail.${rij.k}.${k}`, w, { label: `${l} ${y}` }).replace('data-bind=', `data-detail="${esc(`${sectie}|${rij.k}`)}" data-bind=`)}</td>`;
      }).join('')}</tr>`;
    });
  }
  return html;
}

function handmatigeCorrecties(d, ond, jaren, r) {
  const a = r.ondernemingen.find((x) => x.id === ond.id);
  const blok = (lijstNaam, titel, defs, sleutel) => {
    const rijen = [];
    jaren.forEach((y) => (ond.jaren?.[y]?.[sleutel] || []).forEach((c) => rijen.push({ y, c })));
    return `<h3>${esc(titel)}</h3>
      <div class="scroll"><table class="tabel compact"><thead><tr><th>Jaar</th><th>Soort</th><th class="num">Bedrag</th><th>Toelichting</th></tr></thead><tbody>
      ${rijen.map(({ y, c }) => `<tr><td>${y}</td><td>${esc(defs[c.type]?.label || c.type)}</td><td class="num">${esc(fmt.eur(c.bedrag))}</td><td>${esc(c.toelichting || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="dempen">Geen handmatige correcties.</td></tr>'}
      </tbody></table></div>
      <div class="acties" style="margin-top:8px">${jaren.filter((y) => a?.jaren?.[y]).map((y) => `<button class="knop sec klein" data-actie="correctie-open" data-ond="${esc(ond.id)}" data-jaar="${y}" data-lijst="${lijstNaam}">${icoon('correctie')}${y}</button>`).join('')}</div>`;
  };
  return `<div class="paneel"><h2>Handmatige correcties (typen zoals in de rekentool van de bank)</h2>
    <p class="dempen klein">Een handmatige correctie van een type met een automatische tegenhanger (bijvoorbeeld incidentele baat of R/C directie) vervangt de automatische correctie in dat jaar. Correcties tellen in beide kaders mee.</p>
    <div class="raster-2">${`<div>${blok('winst', 'Winstcorrecties', WINST_CORRECTIES, 'winstCorrecties')}</div><div>${blok('vermogen', 'Vermogenscorrecties', VERMOGENS_CORRECTIES, 'vermogensCorrecties')}</div>`}</div></div>`;
}

function tabIB(d, r) {
  const { jaren, kandidaatC } = roosterJaren(d);
  const kop = `<tr><th>IB-aangifte</th>${jaren.map((y) => `<th><div class="jaarkop"><b>${y}${y === kandidaatC ? ' (lopend jaar)' : ''}</b></div></th>`).join('')}</tr>`;
  let body = '';
  (d.ondernemingen || []).forEach((o) => {
    const soort = soortOndernemer(o.rechtsvorm);
    body += `<tr class="kop"><td colspan="${jaren.length + 1}">${esc(o.naam || '(naamloos)')} (${esc(RECHTSVORMEN[o.rechtsvorm]?.label || '')})</td></tr>`;
    IB_ONDERNEMING_RIJEN.filter((x) => !x.soorten || x.soorten.includes(soort)).forEach((rij) => {
      body += `<tr><td class="ind1">${esc(rij.label)}${rij.hint ? `<span class="hint">${esc(rij.hint)}</span>` : ''}</td>${jaren.map((y) => {
        const w = d.ib?.[y]?.perOnd?.[o.id]?.[rij.k];
        const knop = rij.k === 'loon' && y === kandidaatC ? `<button type="button" class="reken-knop" data-actie="salaris-hulp" data-ond="${esc(o.id)}" data-jaar="${y}" title="DGA-inkomen uit de salarisstrook">${icoon('reken')}</button>` : '';
        return `<td class="invoer">${bedrag(`ib.${y}.perOnd.${o.id}.${rij.k}`, w, { label: `${rij.label} ${y}` })}${knop}</td>`;
      }).join('')}</tr>`;
    });
  });
  body += `<tr class="kop"><td colspan="${jaren.length + 1}">Overige box 1 inkomsten en vermogen</td></tr>`;
  IB_PERSOON_RIJEN.forEach((rij) => {
    body += `<tr><td class="ind1">${esc(rij.label)}${rij.hint ? `<span class="hint">${esc(rij.hint)}</span>` : ''}</td>${jaren.map((y) => `<td class="invoer">${bedrag(`ib.${y}.${rij.k}`, d.ib?.[y]?.[rij.k], { label: `${rij.label} ${y}` })}</td>`).join('')}</tr>`;
  });
  const s = Object.values(d.salarisStrook || {}).filter((x) => x?.f);
  return `<div class="paneel" style="padding:12px"><p class="dempen klein">Neem de bedragen over uit de ingediende aangiften inkomstenbelasting. Bij een eenmanszaak of vof is de saldo fiscale winst het eigen aandeel. Bij een DGA het loon uit dienstbetrekking. Het lopende jaar: loon over dezelfde periode als de tussentijdse cijfers (rekenknop bij het loon).</p>
    ${s.length ? `<div style="margin-bottom:8px">${s.map((x) => melding('info', `DGA-inkomen ${esc(String(x.jaar))} uit de salarisstrook${x.strookTm ? ` (t/m ${esc(x.strookTm)})` : ''}: ${esc(x.f)}`)).join('')}</div>` : ''}
    <div class="scroll"><table class="rooster"><thead>${kop}</thead><tbody>${body}</tbody></table></div></div>`;
}

// ---------------------------------------------------------------------------
// Berekening
// ---------------------------------------------------------------------------
function meldingHTML(m) {
  const niveau = { info: 'info', attentie: 'attentie', niet_akkoord: 'niet_akkoord' }[m.niveau] || 'info';
  const knop = m.actie?.soort === 'woonbeleid-overnemen'
    ? `<button class="knop sec klein" data-actie="woonbeleid-overnemen" data-ond="${esc(m.actie.ondId)}" data-bedrag="${esc(m.actie.bedrag)}">Als afwijkend inkomen overnemen</button>` : '';
  return melding(niveau, esc(m.tekst), knop);
}

export function inkomensTabel(d, r) {
  if (d.soort === 'NUL') return '';
  const T = r.T;
  const C = r.C;
  const ink = r.inkomen;
  const TO = ordeJaren(T);
  const recent = ui.jaarVolgorde !== 'oud';
  if (r.familie !== 'ABN') {
    // Kolommen: (lopend jaar gerealiseerd) toetsjaren, gemiddelde, lopend jaar geëxtrapoleerd, box 2
    const cG = (w) => (C ? `<td class="num">${fmt.eur(w)}</td>` : '');
    const rijen = ink.perOnderneming.map((o) => {
      const a = r.ondernemingen.find((x) => x.id === o.id);
      const tj = TO.map((y) => `<td class="num">${fmt.eur(o.jaren[y])}</td>`).join('');
      return `<tr><td><b>${esc(o.naam)}</b></td><td>${esc(a.rechtsvormKort)}</td><td>${a.maandenOndernemer >= 36 ? '≥ 3 jaar' : a.maandenOndernemer >= 12 ? '≥ 1 jaar' : '< 1 jaar'}</td>
        <td>${pil(a.status)}</td>${recent ? cG(o.controleReal) + tj : tj + cG(o.controleReal)}<td class="num">${fmt.eur(o.gemiddelde)}</td>${C ? `<td class="num">${fmt.eur(o.controleExtr)}</td>` : ''}<td class="num">${o.box2 ? fmt.eur(o.box2) : ''}</td></tr>`;
    }).join('');
    const pers = ink.persoonlijk;
    const persTj = TO.map((y) => `<td class="num">${fmt.eur(pers[y].totaal)}</td>`).join('');
    const persC = C ? `<td class="num">${fmt.eur(pers[C]?.totaal ?? 0)}</td>` : '';
    const persRij = T.some((y) => pers[y].totaal) ? `<tr><td>Overige box 1 inkomsten</td><td></td><td></td><td></td>${recent ? persC + persTj : persTj + persC}<td></td>${C ? '<td></td>' : ''}<td></td></tr>` : '';
    const kopTj = TO.map((y) => `<th class="num">${y}</th>`).join('');
    const kopC = C ? `<th class="num">${C} (gerealiseerd)</th>` : '';
    const totTj = TO.map((y) => `<td class="num">${fmt.eur(ink.perJaar[y])}</td>`).join('');
    const totC = C ? `<td class="num">${fmt.eur(ink.controleReal)}</td>` : '';
    return `<div class="scroll"><table class="tabel"><thead><tr><th>Onderneming</th><th>Rechtsvorm</th><th>Jaren ondernemer</th><th>Voorwaarden</th>
      ${recent ? kopC + kopTj : kopTj + kopC}<th class="num">Gemiddelde na correcties</th>${C ? `<th class="num">${C} (geëxtrapoleerd)</th>` : ''}<th class="num">Box 2</th></tr></thead>
      <tbody>${rijen}${persRij}
      <tr class="totaal"><td colspan="4">Toetsinkomen totaal (${esc(kaderLabel(r.kader))})${r.kader === 'OPT' ? '<div class="dempen klein">per jaar: economisch inkomen</div>' : ''}</td>${recent ? totC + totTj : totTj + totC}<td class="num">${fmt.eur(ink.box1)}</td>${C ? `<td class="num">${fmt.eur(ink.controleExtr)}</td>` : ''}<td class="num">${fmt.eur(ink.box2)}</td></tr>
      <tr><td colspan="4"><b>Berekend inkomen</b></td>${TO.map(() => '<td></td>').join('')}${C ? '<td></td>' : ''}<td class="num" colspan="${C ? 3 : 2}"><b>${fmt.eur(ink.toetsinkomen)}</b></td></tr>
      </tbody></table></div>`;
  }
  const rijen = ink.perHoofdbedrijf.map((o) => {
    const groep = o.groep.slice(1).map((id) => r.ondernemingen.find((a) => a.id === id)?.naam).filter(Boolean);
    return `<tr><td><b>${esc(o.naam)}</b><div class="dempen klein">${esc(o.nul ? '0-inkomen' : o.categorie)}${groep.length ? `; met ${esc(groep.join(', '))}` : ''}</div></td>
      <td>${o.nul ? pil('info', '0-inkomen') : pil(o.toetsStatus, o.voldoet ? 'Voldoet' : 'Voldoet niet')}</td>
      ${TO.map((y) => `<td class="num${o.perJaar[y]?.meegeteld ? '' : ' dempen'}">${fmt.eur(o.perJaar[y]?.inkomen ?? 0)}${o.perJaar[y]?.dividend ? `<div class="dempen klein">div. ${fmt.getal(o.perJaar[y].dividend)}</div>` : ''}</td>`).join('')}
      <td class="num">${fmt.eur(o.bziInkomen)}</td><td class="num">${o.bziDividend ? fmt.eur(o.bziDividend) : ''}</td><td class="num"><b>${fmt.eur(o.nul ? 0 : o.berekend)}</b></td>
      <td class="num">${o.nul ? '' : fmt.eur(o.woonbeleid)}${o.overwinstMee ? `<div class="dempen klein">incl. overwinst ${fmt.getal(o.overwinstMee)}</div>` : ''}</td><td class="num">${fmt.eur(o.bijdrage)}${o.bron === 'afwijkend' ? '<div class="dempen klein">afwijkend</div>' : ''}</td></tr>`;
  }).join('');
  return `<div class="scroll"><table class="tabel"><thead><tr><th>Hoofdbedrijf (met deelnemingen)</th><th>Toetskader</th>
    ${TO.map((y) => `<th class="num">${y}</th>`).join('')}<th class="num">Gem. inkomen</th><th class="num">Gem. dividend</th><th class="num">Berekend (BZI)</th><th class="num">Toets Woonbeleid</th><th class="num">Af te geven</th></tr></thead>
    <tbody>${rijen}${ink.row ? `<tr><td>Resultaat uit overige werkzaamheden</td><td></td>${T.map(() => '<td></td>').join('')}<td></td><td></td><td class="num">${fmt.eur(ink.row)}</td><td class="num">${fmt.eur(ink.row)}</td><td class="num">${fmt.eur(ink.row)}</td></tr>` : ''}
    <tr class="totaal"><td colspan="${2 + T.length + 2}">Totaal</td><td class="num">${fmt.eur(ink.berekend)}</td><td class="num">${fmt.eur(ink.toetsinkomen)}</td><td class="num">${fmt.eur(ink.vastgesteld)}</td></tr>
    </tbody></table></div>`;
}

export function kengetallenTabel(a, r) {
  const jaren = ordeJaren(r.C ? [...r.T, r.C] : [...r.T]);
  const J = a.jaren;
  const st = (key) => a.checks.find((c) => c.key === key)?.status || 'akkoord';
  const rij = (label, fn, key) => `<tr><td>${esc(label)}</td>${jaren.map((y) => `<td class="num">${J[y] ? fn(J[y], y) : ''}</td>`).join('')}<td>${key ? pil(st(key)) : ''}</td></tr>`;
  return `<div class="scroll"><table class="tabel"><thead><tr><th>Kengetallen, ratio's en voorwaarden</th>${jaren.map((y) => `<th class="num">${y}${y === r.C ? (J[y]?.factor !== 1 ? ' (extrapolatie)' : ' (controlejaar)') : ''}</th>`).join('')}<th>Resultaat</th></tr></thead><tbody>
    ${rij('Winstgevendheid (nettowinst na correcties)', (j, y) => fmt.eur(y === r.C ? j.winst.NWcorExtr : j.winst.NWcor), 'winst')}
    ${rij('Liquiditeit: current ratio', (j) => (j.heeftBalans ? fmt.ratio(j.CR) : 'n.v.t.'), 'liquiditeit')}
    ${rij('Liquiditeit: werkkapitaal / liquiditeitsruimte', (j) => (j.heeftBalans ? fmt.getal(j.WK) : 'n.v.t.'), 'werkkapitaal')}
    ${rij('Solvabiliteit', (j) => (j.heeftBalans ? fmt.pct(j.SV) : 'n.v.t.'), 'solvabiliteit')}
    ${rij('Solvabiliteitsruimte', (j) => (j.heeftBalans && j.solvRuimte !== null ? fmt.getal(j.solvRuimte) : 'n.v.t.'))}
    <tr><td>Buitenland</td>${jaren.map(() => '<td></td>').join('')}<td>${pil(st('buitenland'))}</td></tr>
    <tr><td>Branche / sector</td>${jaren.map(() => '<td></td>').join('')}<td>${pil(st('branche'))}</td></tr>
    <tr class="totaal"><td>Totaalresultaat</td>${jaren.map(() => '<td></td>').join('')}<td>${pil(a.status)}</td></tr>
  </tbody></table></div>`;
}

function voorwaardenLijst(checks) {
  return `<div class="voorwaarden">${checks.map((c) => `<div class="voorwaarde"><b>${esc(c.label)}</b><div>${pil(c.status)}</div><div class="tekst">${esc(c.tekst)}</div></div>`).join('')}</div>`;
}

/** Hetzelfde dossier volgens alle toetskaders naast elkaar, plus de berekeningswijzen 1-1-1, 1-2-3 en 1-3-4. */
export function methodenTabel(d, r) {
  if (d.soort === 'NUL' || !r.inkomen) return '';
  let v = [];
  try { v = vergelijkKaders(d); } catch { v = []; }
  const m = r.inkomen.methoden;
  const TO = ordeJaren(r.T);
  const rijen = v.map((x) => {
    if (x.fout) return `<tr><td><b>${esc(x.kort)}</b></td><td colspan="5" class="dempen">Niet te berekenen: ${esc(x.fout)}</td></tr>`;
    const huidig = x.id === r.kader;
    const reden = x.status === 'niet_akkoord' && x.nok.length ? `<div class="dempen klein">${esc(x.nok.slice(0, 4).join('; '))}</div>` : '';
    const stap = x.stappen?.length ? `<div class="dempen klein">${esc(x.stappen.slice(0, 2).join(' '))}</div>` : '';
    return `<tr${huidig ? ' class="actief-rij"' : ''}><td><b>${esc(x.kort)}</b>${huidig ? ' <span class="dempen klein">(gekozen)</span>' : ''}<div class="dempen klein">${esc(x.versie)}</div></td>
      <td>${pil(x.status)}${reden}</td>
      <td class="num">${fmt.eur(x.box1 ?? 0)}</td><td class="num">${x.box2 ? fmt.eur(x.box2) : ''}</td>
      <td class="num"><b>${fmt.eur(x.toetsinkomen)}</b>${stap}</td>
      <td class="num">${x.bron === 'geen' ? `<span class="dempen">€ 0 (geen inkomen)</span>` : fmt.eur(x.vastgesteld)}</td></tr>`;
  }).join('');
  const bedragen = v.filter((x) => !x.fout).map((x) => x.vastgesteld);
  const spreiding = bedragen.length ? Math.max(...bedragen) - Math.min(...bedragen) : 0;
  return `<h3>Vergelijking toetskaders</h3>
    <p class="dempen klein">Hetzelfde dossier volgens elk kader, zonder handmatig afwijkend inkomen. Instellingen die per kader verschillen (zoals de box 2-route of een beletperiode) gelden voor alle kaders waar ze bestaan. De afgegeven uitkomst volgt het gekozen kader (${esc(kaderLabel(r.kader))}).</p>
    <div class="scroll"><table class="tabel"><thead><tr><th>Kader</th><th>Oordeel</th><th class="num">Box 1</th><th class="num">Box 2</th><th class="num">Berekend inkomen</th><th class="num">Af te geven</th></tr></thead>
      <tbody>${rijen}</tbody></table></div>
    ${spreiding ? `<p class="dempen klein" style="margin-top:6px">Verschil tussen het hoogste en laagste kader: ${esc(fmt.eur(spreiding))}.</p>` : ''}
    ${m ? `<details class="stappen" style="margin-top:10px"><summary>Berekeningswijzen 1-1-1, 1-2-3 en 1-3-4 op het totaal per jaar</summary><div class="inhoud">
      <div class="scroll"><table class="tabel trace"><thead><tr><th>Berekening</th><th class="num">${TO.join(' / ')}</th><th class="num">Uitkomst</th></tr></thead><tbody>
      <tr><td><b>1-1-1</b><div class="dempen klein">Gemiddelde van drie jaar, maximaal het laatste jaar (NHG, ABN AMRO, ASN Bank)</div></td><td class="num">${TO.map((y) => fmt.getal(m.jaren[y])).join(' / ')}</td><td class="num"><span class="f">${esc(`${m.fGemiddelde} ${fmt.getal(m.gemiddelde)}; max. laatste jaar`)}</span>${fmt.eur(m.m111)}</td></tr>
      <tr><td><b>1-2-3</b><div class="dempen klein">Gewogen: oudste 1×, middelste 2×, laatste 3×, maximaal het laatste jaar (basis van Optimaal en van het Knab-concept 2024, met een grens van 10% boven 1-1-1)</div></td><td class="num">${TO.map((y) => fmt.getal(m.jaren[y])).join(' / ')}</td><td class="num"><span class="f">${esc(`${m.fGewogen} ${fmt.getal(m.gewogen)}; max. laatste jaar`)}</span>${fmt.eur(m.m123)}</td></tr>
      ${m.m134 !== undefined ? `<tr><td><b>1-3-4</b><div class="dempen klein">Gewogen: oudste 1×, middelste 3×, laatste 4×, maximaal het laatste jaar (Knab volgens de acceptatiegids 2026, zonder NHG; ZIB houdt de grens van 10% boven 1-1-1 aan)</div></td><td class="num">${TO.map((y) => fmt.getal(m.jaren[y])).join(' / ')}</td><td class="num"><span class="f">${esc(`${m.fGewogen134} ${fmt.getal(m.gewogen134)}; max. laatste jaar`)}</span>${fmt.eur(m.m134)}</td></tr>` : ''}
      </tbody></table></div></div></details>` : ''}`;
}

function tabBerekening(d, r) {
  const delen = [];
  if (r.meldingen.length) delen.push(`<div class="blok">${r.meldingen.map(meldingHTML).join('')}</div>`);
  if (d.soort === 'NUL') {
    const n = r.nul;
    delen.push(`<div class="paneel"><h2>Beoordeling 0-verklaring ${pil(n.status)}</h2>
      ${n.nhgOpmerking ? melding('info', esc(n.nhgOpmerking)) : ''}
      <p style="margin-top:10px"><b>${esc(n.conclusie)}</b></p>
      ${n.toelichtingCorrectie.length ? `<p class="dempen">${esc(n.toelichtingCorrectie.join('; '))}</p>` : ''}
      ${n.perOnderneming.map((o) => `<h3 style="margin-top:16px">${esc(o.naam)} <span class="dempen klein">${esc(o.rechtsvorm)}</span> ${pil(o.status)}</h3>${voorwaardenLijst(o.checks)}`).join('')}
      <h3 style="margin-top:16px">Zekerheden en verplichtingen</h3>${voorwaardenLijst(n.zekerheden)}
      ${r.toets30 ? `<p class="dempen" style="margin-top:12px">Ter informatie: maximaal 30%-toets bij loondienst ≥ 80%: ${esc(fmt.eur(r.toets30.max))}.</p>` : ''}
    </div>`);
  } else {
    delen.push(`<div class="paneel"><h2>Inkomensvaststelling</h2>${inkomensTabel(d, r)}
      ${r.inkomen.stappen.length ? `<ul class="dempen" style="margin:10px 0 0 18px">${r.inkomen.stappen.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${r.inkomen.nietMeegenomen ? `<h3 style="margin-top:14px">Niet-meegenomen ondernemingen (risicobeoordeling) ${pil(r.inkomen.nietMeegenomen.status)}</h3>${r.inkomen.nietMeegenomen.perOnderneming.map((o) => `<p><b>${esc(o.naam)}</b></p>${voorwaardenLijst(o.checks)}`).join('')}` : ''}
      <div style="margin-top:16px">${methodenTabel(d, r)}</div>
    </div>`);
    const metOverwinst = r.ondernemingen.filter((a) => a.box2?.overwinst);
    if (metOverwinst.length) {
      delen.push(`<div class="paneel"><h2>Overwinst en dubbele balanstoets</h2>${metOverwinst.map((a) => `${metOverwinst.length > 1 ? `<h3>${esc(a.naam)}</h3>` : ''}${overwinstBlok(d, r, a)}`).join('')}</div>`);
    }
    if (r.inkomen.geldstromen?.length) {
      delen.push(`<div class="paneel">${geldstromenTabel(r, r.inkomen.geldstromen)}</div>`);
    }
  }
  r.ondernemingen.forEach((a) => {
    if (d.soort === 'IKV' && !a.meenemen && r.familie !== 'ABN') return;
    const econ = a.belangEconomisch !== undefined && a.belangEconomisch !== null && Math.abs(a.belangEconomisch - a.aandeel) > 0.0001
      ? `, economisch ${fmt.pct(a.belangEconomisch, 1)}` : '';
    delen.push(`<div class="paneel"><h2>${esc(a.naam)} <span class="dempen klein">${esc(a.rechtsvormLabel)}, ${esc(a.soort === 'VPB' ? 'niet-IB (DGA)' : 'IB-ondernemer')}${a.aandeel < 1 ? `, ${fmt.pct(a.aandeel, 0)}` : ''}${econ}${a.isDeelneming ? ', deelneming' : ''}${a.soort === 'VPB' && a.zeggenschap === false ? ', geen zeggenschap' : ''}</span></h2>
      ${kengetallenTabel(a, r)}
      ${d.soort === 'IKV' ? `<h3 style="margin-top:16px">Voorwaarden</h3>${voorwaardenLijst(a.checks)}` : ''}
      <div class="raster-2" style="margin-top:14px">
        <div>${a.maxOnttrekkenNvt ? melding('info', `Maximaal te onttrekken: n.v.t. ${esc(a.maxOnttrekkenNvt)}`) : melding('info', `Maximaal te onttrekken vlottende activa zodat de onderneming nog aan de ratio's voldoet (${a.laatsteBalansJaar}): <b>${esc(fmt.eur(a.maxOnttrekken ?? 0))}</b>`)}</div>
        <div>${a.benodigdBox3 ? melding('attentie', `Minimaal benodigde balansversterking (box 3 vermogen) om aan de normen te voldoen: <b>${esc(fmt.eur(a.benodigdBox3))}</b> (liquiditeit ${esc(fmt.eur(a.benodigdBox3Detail.nodigCr))}, solvabiliteit ${esc(fmt.eur(a.benodigdBox3Detail.nodigSv))}).`) : melding('akkoord', 'Geen aanvullend box 3 vermogen nodig.')}</div>
        ${a.box2?.benodigdVoorOverwinst ? `<div>${melding('info', `Benodigde balansversterking om de volledige overwinst mee te nemen: <b>${esc(fmt.eur(a.box2.benodigdVoorOverwinst))}</b>.`)}</div>` : ''}
      </div>
      <details class="stappen" style="margin-top:14px"><summary>Rekenstappen ${esc(a.naam)}</summary><div class="inhoud">${renderTrace(a.trace)}</div></details>
    </div>`);
  });
  if (d.soort === 'IKV') {
    delen.push(`<div class="paneel"><h2>Totaalberekening</h2>${renderTrace(r.trace)}</div>`);
  }
  return delen.join('');
}

// ---------------------------------------------------------------------------
// Documenten
// ---------------------------------------------------------------------------
export function docAanwezig(docs, item) {
  const n = docs.filter((x) => x.categorie === item.categorie).length;
  return n >= (item.aantal || 1);
}

function tabDocumenten(d, r, docs) {
  const { jaren } = roosterJaren(d);
  const lijstHTML = r.documenten.map((x) => {
    const n = docs.filter((y) => y.categorie === x.categorie).length;
    const ok = n >= (x.aantal || 1);
    return `<tr><td><b>${esc(x.naam)}</b></td><td>${esc(x.wanneer)}</td><td>${esc(x.geldigheid)}</td>
      <td>${x.verplicht ? (ok ? pil('akkoord', 'Aanwezig') : pil('attentie', n ? `${n} van ${x.aantal}` : 'Ontbreekt')) : pil('info', 'Optioneel')}</td></tr>`;
  }).join('');
  const docRijen = docs.sort((a, b) => String(b.aangemaakt).localeCompare(String(a.aangemaakt))).map((x) => {
    const ond = (d.ondernemingen || []).find((o) => o.id === x.ondId);
    return `<tr><td>${esc(x.naam)}</td><td>${esc(CATEGORIEEN[x.categorie] || x.categorie)}</td><td>${esc(x.jaar || '')}</td><td>${esc(ond?.naam || '')}</td>
      <td class="nowrap">${esc(datumKort(x.aangemaakt))}</td><td class="num">${esc(fmt.getal(Math.round(num(x.grootte) / 1024)))} kB</td>
      <td class="nowrap"><button class="knop link klein" data-actie="doc-download" data-id="${esc(x.id)}">Openen</button>
      <button class="knop link klein" data-actie="doc-verwijderen" data-id="${esc(x.id)}">Verwijderen</button></td></tr>`;
  }).join('');
  const ontbrekend = r.documenten.filter((x) => x.verplicht && !docAanwezig(docs, x));
  return `<div class="paneel"><div class="paginakop" style="margin:0 0 8px"><h2>Benodigde stukken</h2>
      ${ontbrekend.length ? `<button class="knop sec" data-actie="mail-adviseur">${icoon('mail')}Ontbrekende stukken mailen naar adviseur</button>` : ''}</div>
    <div class="scroll"><table class="tabel"><thead><tr><th>Document</th><th>Wanneer</th><th>Geldigheid</th><th>Status</th></tr></thead><tbody>${lijstHTML}</tbody></table></div></div>
  <div class="paneel"><h2>Document toevoegen</h2>
    <div class="raster-3">
      <label class="veld"><span>Soort document</span><select id="doc-categorie">${Object.entries(CATEGORIEEN).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
      <label class="veld"><span>Jaar</span><select id="doc-jaar"><option value="">n.v.t.</option>${ordeJaren(jaren).map((y) => `<option>${y}</option>`).join('')}</select></label>
      <label class="veld"><span>Onderneming</span><select id="doc-ond"><option value="">Privé / algemeen</option>${(d.ondernemingen || []).map((o) => `<option value="${esc(o.id)}">${esc(o.naam)}</option>`).join('')}</select></label>
      <label class="veld"><span>Bestand (pdf of afbeelding, max. 15 MB)</span><input id="doc-bestand" type="file" accept=".pdf,image/*,.xlsx,.xls,.csv,.docx,.txt"></label>
    </div>
    <div class="acties" style="margin-top:12px"><button class="knop" data-actie="doc-upload">Uploaden</button></div>
  </div>
  <div class="paneel" style="padding:0"><div class="scroll"><table class="tabel"><thead><tr><th>Bestand</th><th>Soort</th><th>Jaar</th><th>Onderneming</th><th>Toegevoegd</th><th class="num">Grootte</th><th></th></tr></thead>
    <tbody>${docRijen || `<tr><td colspan="7" class="leeg">Nog geen documenten geüpload.</td></tr>`}</tbody></table></div></div>`;
}

// ---------------------------------------------------------------------------
// Notities
// ---------------------------------------------------------------------------
function formatKnop(pad, format) {
  return `<button class="knop link klein" data-actie="format-invoegen" data-pad="${esc(pad)}" data-format="${esc(format)}">Format invoegen</button>`;
}

function tabNotities(d, r) {
  const n = d.notities || {};
  const contr = n.controles || {};
  const bh = n.boekhouder || {};
  const blokTekst = (titel, pad, waarde, format, rijen = 8, extra = '') => `<div class="paneel"><div class="paginakop" style="margin:0 0 6px"><h2>${esc(titel)}</h2><span class="acties">${extra}${format ? formatKnop(pad, format) : ''}</span></div>
    <textarea rows="${rijen}" data-bind="${esc(pad)}" data-type="tekst" data-template="${esc(format || '')}" placeholder="${esc(format ? FORMATS[format] || '' : '')}" aria-label="${esc(titel)}">${esc(waarde || '')}</textarea></div>`;
  return `
    ${blokTekst('Algemene informatie en organogram', 'notities.algemeen', n.algemeen, 'algemeen', 10, '<button class="knop link klein" data-actie="organogram-invoegen">Organogram invoegen</button>')}
    ${(d.ondernemingen || []).map((o) => blokTekst(`Financiële informatie: ${o.naam || 'onderneming'}`, `notities.financieelOnderneming.${o.id}`, n.financieelOnderneming?.[o.id], 'financieelOnderneming', 9,
      `<button class="knop link klein" data-actie="concept-financieel" data-ond="${esc(o.id)}">Concept uit invoer</button>`)).join('')}
    ${blokTekst('Financiële informatie ondernemer in privé', 'notities.priveTekst', n.priveTekst, 'prive', 8)}
    ${blokTekst('Kredietbestemming en aflossing', 'notities.kredietbestemming', n.kredietbestemming, 'kredietbestemming', 4)}
    ${blokTekst(`Conclusie (${d.afdeling === 'RV' ? 'RV' : 'FMD en IMV'})`, 'notities.conclusie', n.conclusie, conclusieFormat(d, r), 9)}
    ${blokTekst('Bijlagen en stukkenlijst', 'notities.bijlagen', n.bijlagen, 'bijlagen', 7)}
    <div class="paneel"><h2>Broncontroles</h2><div class="raster-2">
      ${tekstvak('Insolventieregister en beroepsregisters (BIG/LRK/NBA/NOvA/KNB): datum en resultaat', 'notities.broncontroles', n.broncontroles, { rijen: 3 })}
      ${tekstvak('KvK-adrescheck (zakelijk en privé)', 'notities.kvkCheck', n.kvkCheck, { rijen: 3 })}
      ${tekstvak('Google check (know your customer): website, social media, herkomst omzet en conclusie', 'notities.googleCheck', n.googleCheck, { rijen: 4 })}
    </div></div>
    <div class="paneel"><h2>Maatschappijspecifieke controles</h2><div class="raster-2">
      ${CONTROLES.map(([k, l]) => keuze(l, `notities.controles.${k}`, ['Ja', 'Nee', 'N.v.t.'], contr[k], { leeg: 'Kies' })).join('')}
    </div><div style="margin-top:12px">${vink('Dossier voorleggen aan KYC', 'notities.kyc', !!n.kyc, { render: true })}</div></div>
    <div class="paneel"><h2>Boekhoudgegevens</h2><div class="raster-3">
      ${keuze('Boekhouder', 'notities.boekhouder.optie', { 1: 'Boekhouder aanwezig', 2: 'Geen gegevens van de boekhouder', 3: 'Geen boekhouder, klant doet zelf aangifte' }, bh.optie || '1', { render: true })}
    </div>
    ${(bh.lijst || []).map((x, i) => `<div class="raster-3" style="margin-top:10px">${veld('Naam boekhoudkantoor', `notities.boekhouder.lijst.${i}.naam`, x.naam)}${veld('KvK-nummer boekhoudkantoor', `notities.boekhouder.lijst.${i}.kvk`, x.kvk)}</div>`).join('')}
    <div class="acties" style="margin-top:10px"><button class="knop sec klein" data-actie="boekhouder-toevoegen">Boekhouder toevoegen</button></div></div>`;
}

// ---------------------------------------------------------------------------
// Fiattering en historie
// ---------------------------------------------------------------------------
function tabFiat(d) {
  const f = d.fiat || {};
  const p = state.profiel || {};
  const acc = p.accreditatie || 'Basis';
  const niveau = d.niveau || 'Basis';
  const mag1 = magFiatteren(acc, niveau, 1);
  const mag2 = magFiatteren(acc, niveau, 2);
  const zelfde = f.eerste?.naam && f.eerste.naam === p.naam;
  const antwoorden = f.tweede?.antwoorden || {};
  const afgerond = AFGEROND.includes(d.status);
  const eerste = `<div class="paneel"><h2>Eerste beoordeling</h2>
    ${f.eerste ? `<p>Gereed gemeld door <b>${esc(f.eerste.naam)}</b> op ${esc(fmt.tijdstip(f.eerste.datum))}.</p>${f.eerste.opmerking ? `<p class="dempen">${esc(f.eerste.opmerking)}</p>` : ''}` : '<p class="dempen">Nog niet gereed gemeld.</p>'}
    ${d.teruggezet && d.status === 'beoordeling_1' ? melding('attentie', 'Dit dossier is na de tweede beoordeling teruggezet. Verwerk de bevindingen en meld opnieuw gereed.') : ''}
    ${afgerond ? '' : `
      ${tekstvak('Opmerking bij gereed melden', 'fiat.concept1', f.concept1, { rijen: 2 })}
      <div class="acties" style="margin-top:10px"><button class="knop" data-actie="gereed-melden"${mag1 ? '' : ' disabled'}>Gereedmelden (naar 2e beoordeling)</button>
      ${mag1 ? '' : `<span class="dempen klein">Je accreditatie (${esc(acc)}) is niet toereikend voor een ${esc(niveau)}-dossier.</span>`}</div>`}
  </div>`;
  const tweede = `<div class="paneel"><h2>Tweede beoordeling (vier ogen)</h2>
    ${f.tweede?.resultaat ? `<p>${f.tweede.resultaat === 'akkoord' ? pil('akkoord', 'Definitief akkoord') : pil('niet_akkoord', 'Niet akkoord')} door <b>${esc(f.tweede.naam)}</b> op ${esc(fmt.tijdstip(f.tweede.datum))}.</p>${f.tweede.opmerking ? `<p class="dempen">${esc(f.tweede.opmerking)}</p>` : ''}` : ''}
    ${d.status === 'beoordeling_2' ? `
      ${zelfde ? melding('attentie', 'Je hebt de eerste beoordeling gedaan; de tweede beoordeling moet door een collega worden gedaan.') : ''}
      ${mag2 ? '' : melding('attentie', `Je accreditatie (${esc(acc)}) is niet toereikend voor de tweede beoordeling van een ${esc(niveau)}-dossier.`)}
      <div class="voorwaarden" style="margin-top:10px">${FIAT_VRAGEN.map(([k, l]) => `<div class="voorwaarde"><b>${esc(l)}</b>
        <div>${keuze(null, `fiat.tweede.antwoorden.${k}.antwoord`, ['Ja', 'Nee', 'N.v.t.'], antwoorden[k]?.antwoord, { leeg: 'Kies' })}</div>
        <div><input type="text" placeholder="Motivatie" value="${esc(antwoorden[k]?.motivatie || '')}" data-bind="fiat.tweede.antwoorden.${k}.motivatie" data-type="tekst" style="width:100%" aria-label="Motivatie"></div></div>`).join('')}</div>
      <div style="margin-top:10px">${tekstvak('Opmerking', 'fiat.tweede.opmerking', f.tweede?.opmerking, { rijen: 2 })}</div>
      <div class="acties" style="margin-top:10px">
        <button class="knop" data-actie="fiat-akkoord"${mag2 && !zelfde ? '' : ' disabled'}>Akkoord geven</button>
        <button class="knop gevaar" data-actie="fiat-niet-akkoord"${mag2 && !zelfde ? '' : ' disabled'}>Niet akkoord, terug naar 1e beoordeling</button>
      </div>` : '<p class="dempen">De tweede beoordeling is mogelijk zodra het dossier gereed is gemeld (status "2e beoordeling").</p>'}
  </div>`;
  const historie = `<div class="paneel"><h2>Historie</h2>
    ${(d.historie || []).length ? `<table class="tabel"><thead><tr><th>Tijdstip</th><th>Door</th><th>Actie</th></tr></thead><tbody>${d.historie.map((h) => `<tr><td class="nowrap">${esc(fmt.tijdstip(h.at))}</td><td>${esc(h.door)}</td><td>${esc(h.actie)}</td></tr>`).join('')}</tbody></table>` : '<p class="dempen">Nog geen historie.</p>'}
    <div class="acties" style="margin-top:12px"><button class="knop sec" data-actie="toon-versies">Eerdere versies van dit dossier</button></div>
    <div id="versies"></div>
  </div>`;
  return `${eerste}${tweede}${historie}`;
}

export { hoofdbedrijven };
