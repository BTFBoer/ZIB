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
import { CATEGORIEEN, docAanwezig } from '../schema/documenten.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES } from '../schema/correcties.js';
import { balansTotalen, vwTotalen } from '../engine/financieel.js';
import { pil, statusPil, bedrag, veld, tekstvak, keuze, vink, melding, leeg, STATUS_TEKST, icoon } from './ui.js';
import { renderTrace } from './trace-view.js';
import { renderRapportPagina } from './rapport.js';
import { FORMATS, CONTROLES, FIAT_VRAGEN, magFiatteren, conclusieFormat } from './formats.js';
import { datumKort } from './layout.js';
import { ui, ordeJaren, ordeJarenOverzicht, ingeklapt } from './uistate.js';
import { voortgang, voortgangTelling } from './voortgang.js';
import { sparkSVG } from './spark.js';
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
  ['overzicht', 'Dossieroverzicht'],
  ['klant', 'Klantgegevens'],
  ['documenten', 'Documenten'],
  ['balans', 'Balans'],
  ['vw', 'V&W'],
  ['diversen', 'Diversen'],
  ['ib', 'IB-aangifte'],
  ['bziinvoer', 'BZI-invoer'],
  ['berekening', 'Berekening'],
  ['notities', 'Notities'],
  ['rapport', 'Rapport'],
  ['fiat', 'Fiattering'],
];

const PER_ONDERNEMING = ['balans', 'vw', 'diversen'];
const TAB_LABEL = Object.fromEntries(TABS);
const TAB_GROEPEN = [
  ['Start', ['overzicht', 'klant', 'documenten']],
  ['Cijfers', ['balans', 'vw', 'diversen', 'ib', 'bziinvoer']],
  ['Beoordeling', ['berekening', 'notities', 'rapport', 'fiat']],
];
const dossierPad = (d, tab, ondId = '') => `#/dossier/${encodeURIComponent(d.id)}/${tab}${ondId ? `/${encodeURIComponent(ondId)}` : ''}`;

// Overgang tussen de weergaven: welk tabblad hoort bij welke stap.
export const NAAR_BZI = { klant: 'algemeen', balans: 'bedrijf', vw: 'bedrijf', diversen: 'bedrijf', ib: 'bedrijf', bziinvoer: 'bziinvoer' };
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
      <div class="kop-onder">${weergaveSchakelaar(d, 'viiz')}${voortgangKop(d, r)}</div>
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

const dossierDocs = (d) => lijst('document').filter((x) => x.dossierId === d.id);
const STIP_TEKST = { ok: 'compleet', aandacht: 'aandacht nodig', fout: 'fout in de invoer', open: 'nog niet ingevuld' };
const INVOER_TABS = [['klant', 'Klantgegevens'], ['balans', 'Balans'], ['vw', 'V&W'], ['ib', 'IB-aangifte'], ['documenten', 'Documenten'], ['notities', 'Notities']];

/** Voortgang van de invoer in de dossierkop: per onderdeel een blokje, met een link naar het eerste onderdeel dat nog open staat. */
function voortgangKop(d, r) {
  const v = voortgang(d, r, dossierDocs(d));
  const { klaar, totaal } = voortgangTelling(v);
  const delen = INVOER_TABS.filter(([k]) => v[k]);
  const open = delen.filter(([k]) => v[k].status !== 'ok');
  const titel = open.length ? open.map(([k, l]) => `${l}: ${v[k].tekst}`).join('\n') : 'Alle onderdelen van de invoer zijn compleet';
  return `<a class="voortgang geen-print" href="#/dossier/${esc(d.id)}/${open.length ? open[0][0] : 'berekening'}" title="${esc(titel)}">
    <span class="voortgang-balk" aria-hidden="true">${delen.map(([k]) => `<i class="${v[k].status}"></i>`).join('')}</span>
    <span>Invoer ${klaar} van ${totaal} compleet</span></a>`;
}

/** Vaste routes, gegroepeerd per taak in het dossier. */
export function tabsHTML(d, tab, ondId, r, docs = dossierDocs(d)) {
  const v = voortgang(d, r, docs);
  const link = (k) => {
    const s = v[k];
    const stip = s ? `<i class="stip ${s.status}" aria-hidden="true"></i>` : '';
    const teller = k === 'documenten' && s?.teller ? `<span class="teller">${s.teller}</span>` : '';
    return `<a href="${dossierPad(d, k, PER_ONDERNEMING.includes(k) ? ondId : '')}" class="${k === tab ? 'actief' : ''}"${k === tab ? ' aria-current="page"' : ''}${s ? ` title="${esc(s.tekst)}"` : ''}>${stip}${esc(TAB_LABEL[k])}${teller}${s ? `<span class="sr"> (${esc(STIP_TEKST[s.status])})</span>` : ''}</a>`;
  };
  return `<nav class="dossier-tabs geen-print" id="dossiertabs" aria-label="Dossier" data-tab="${esc(tab)}" data-ond="${esc(ondId || '')}">
    ${TAB_GROEPEN.map(([naam, sleutels]) => `<div class="dossier-tabgroep" role="group" aria-label="${naam}"><span aria-hidden="true">${naam}</span>
      <div>${sleutels.map(link).join('')}</div></div>`).join('')}
  </nav>`;
}

/** Alle stappen van de ViiZ-weergave op volgorde: per onderneming eerst balans, V&W en diversen, dan de volgende onderneming. */
function viizStappen(d) {
  const onds = d.ondernemingen || [];
  const label = Object.fromEntries(TABS);
  const stappen = [];
  TABS.forEach(([k, l]) => {
    if (PER_ONDERNEMING.includes(k)) return;
    stappen.push({ k, id: '', label: l });
    if (k !== 'documenten') return;
    (onds.length ? onds : [null]).forEach((o) => PER_ONDERNEMING.forEach((p) => stappen.push({
      k: p, id: o?.id || '', label: `${label[p]}${onds.length > 1 ? ` · ${o.naam || '(naamloos)'}` : ''}`,
    })));
  });
  return stappen;
}

/** Vorige en volgende stap onder elk tabblad, zodat je het dossier van links naar rechts kunt doorlopen. */
function stapNav(d, tab, ondId) {
  const stappen = viizStappen(d);
  const eersteOnd = (d.ondernemingen || [])[0]?.id || '';
  const i = stappen.findIndex((s) => s.k === tab && (!PER_ONDERNEMING.includes(tab) || s.id === (ondId || eersteOnd)));
  if (i < 0) return '';
  const href = (s) => `#/dossier/${esc(d.id)}/${s.k}${s.id ? `/${esc(s.id)}` : ''}`;
  const vorige = stappen[i - 1];
  const volgende = stappen[i + 1];
  return `<nav class="stapnav geen-print" aria-label="Vorige en volgende stap">
    ${vorige ? `<a class="knop sec" href="${href(vorige)}">${icoon('links')}<span><small>Vorige</small>${esc(vorige.label)}</span></a>` : '<span></span>'}
    <span class="dempen klein stapnav-pos">Stap ${i + 1} van ${stappen.length}</span>
    ${volgende ? `<a class="knop" href="${href(volgende)}"><span><small>Volgende</small>${esc(volgende.label)}</span>${icoon('rechts')}</a>` : '<span></span>'}
  </nav>`;
}

export function renderDossier(d, tab, ondId, r) {
  const docs = dossierDocs(d);
  const bzi = weergaveDossier(d) === 'bzi';
  if (!tab || tab === 'overzicht') {
    return `${kopVoor(d, r)}${bzi ? '' : tabsHTML(d, 'overzicht', '', r, docs)}
      <div id="tabinhoud">${tabOverzicht(d, r, docs, bzi)}</div>`;
  }
  if (bzi) {
    const ontbrekend = r.documenten.filter((x) => x.verplicht && !docAanwezig(docs, x)).length;
    return renderBZI(d, NAAR_BZI[tab] || tab, ondId, r, {
      ontbrekend,
      documenten: () => tabDocumenten(d, r, docs),
      berekening: () => tabBerekening(d, r),
      bziinvoer: () => renderBziInvoer(d, r),
      notities: () => tabNotities(d, r),
      rapport: () => renderRapportPagina(d, r),
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
    case 'rapport': inhoud = renderRapportPagina(d, r); break;
    case 'documenten': inhoud = tabDocumenten(d, r, docs); break;
    case 'notities': inhoud = tabNotities(d, r); break;
    case 'fiat': inhoud = tabFiat(d, r); break;
    default: inhoud = tabKlant(d, r);
  }
  const tabGeldig = TABS.some(([k]) => k === t) ? t : 'klant';
  const keuzeOnd = PER_ONDERNEMING.includes(t) && onds.length > 1
    ? `<div class="ondkeuze geen-print">${onds.map((o) => `<a href="#/dossier/${esc(d.id)}/${t}/${esc(o.id)}" class="${o.id === ond?.id ? 'actief' : ''}">${esc(o.naam || '(naamloos)')}</a>`).join('')}</div>` : '';
  return `${dossierKop(d, r)}${tabsHTML(d, tabGeldig, ond?.id, r, docs)}${keuzeOnd}
    ${t !== 'rapport' ? `<h1 class="dossier-titel">${esc(TAB_LABEL[tabGeldig])}</h1>` : ''}
    <div id="tabinhoud">${inhoud}</div>${stapNav(d, tabGeldig, ond?.id)}`;
}

const TRIAGE_LABEL = { ok: 'Compleet', aandacht: 'Te controleren', fout: 'Actie nodig', open: 'Open' };
const TRIAGE_PIL = { ok: 'akkoord', aandacht: 'attentie', fout: 'niet_akkoord', open: 'neutraal' };

function tabOverzicht(d, r, docs, bzi) {
  const v = voortgang(d, r, docs);
  const { klaar, totaal } = voortgangTelling(v);
  const stappen = ['klant', 'documenten', 'balans', 'vw', 'ib', 'berekening', 'notities', 'fiat'];
  const links = {
    klant: dossierPad(d, bzi ? 'algemeen' : 'klant'),
    balans: dossierPad(d, bzi ? 'bedrijf' : 'balans'),
    vw: dossierPad(d, bzi ? 'bedrijf' : 'vw'),
    ib: dossierPad(d, bzi ? 'bedrijf' : 'ib'),
  };
  const href = (k) => links[k] || dossierPad(d, k);
  const volgende = AFGEROND.includes(d.status) ? 'rapport'
    : d.status === 'beoordeling_2' ? 'fiat'
    : stappen.find((k) => v[k] && v[k].status !== 'ok') || 'rapport';
  const vervolg = { klant: 'Klantgegevens aanvullen', documenten: 'Stukken controleren', balans: 'Balans controleren', vw: 'V&W controleren', ib: 'IB-gegevens aanvullen', berekening: 'Voorwaarden beoordelen', notities: 'Onderbouwing vastleggen', fiat: 'Naar fiattering', rapport: 'Rapport openen' };
  const bevindingen = (r.meldingen || []).filter((m) => m.niveau === 'niet_akkoord' || m.niveau === 'attentie');
  const zwaar = bevindingen.filter((m) => m.niveau === 'niet_akkoord');
  const selectie = [...zwaar, ...bevindingen.filter((m) => m.niveau === 'attentie')];
  const onds = d.ondernemingen || [];
  const status = (k) => pil(TRIAGE_PIL[v[k].status], TRIAGE_LABEL[v[k].status]);
  const rij = (k) => `<li><a href="${href(k)}"><span><strong>${esc(TAB_LABEL[k])}</strong><small>${esc(v[k].tekst)}</small></span>${status(k)}${icoon('rechts')}</a></li>`;
  const groep = (titel, sleutels) => `<section class="paneel overzicht-lijst"><h2>${titel}</h2>
    <ul>${sleutels.filter((k) => v[k]).map(rij).join('')}</ul></section>`;
  const detailLink = (k, label, ico) => `<a class="knop sec" href="${href(k)}">${icoon(ico)}${label}</a>`;
  return `<div class="dossier-overzicht">
    <section class="overzicht-start" aria-labelledby="overzicht-titel">
      <div class="overzicht-intro">
        <a class="overzicht-terug" href="#/aanvragen">${icoon('links')}Aanvragen</a>
        <h1 id="overzicht-titel">Dossieroverzicht</h1>
        <p>${esc(v[volgende]?.tekst || (AFGEROND.includes(d.status) ? 'Bekijk de vastgelegde beoordeling en onderbouwing.' : 'Bekijk de inkomensvaststelling en onderbouwing.'))}</p>
        <div class="acties"><a class="knop" href="${href(volgende)}">${vervolg[volgende]}${icoon('pijl')}</a>
          ${volgende !== 'rapport' ? detailLink('rapport', 'Rapport', 'document') : ''}</div>
      </div>
      <div class="overzicht-meters">
        <div><span>Invoer compleet</span><strong>${klaar}<small> / ${totaal}</small></strong>
          <progress max="${totaal || 1}" value="${klaar}" aria-label="Invoer compleet"></progress></div>
        <div><span>Verplichte stukken ontbreken</span><strong>${v.documenten?.teller || 0}</strong>
          <a href="${href('documenten')}">Bekijk stukken ${icoon('rechts')}</a></div>
        <div><span>Rekenmeldingen</span><strong>${bevindingen.length}</strong>
          <a href="${href('berekening')}">Bekijk berekening ${icoon('rechts')}</a></div>
      </div>
    </section>
    <div class="overzicht-kolommen">
      ${groep('Aanvraag en cijfers', ['klant', 'documenten', 'balans', 'vw', 'ib'])}
      <div class="overzicht-stapel">
        ${groep('Beoordeling', ['berekening', 'notities', 'fiat'])}
        ${selectie.length ? `<section class="paneel overzicht-bevindingen"><h2>Rekenmeldingen</h2>
          <ul>${selectie.slice(0, 3).map((m) => `<li>${stip(m.niveau)}<span>${esc(m.tekst)}</span></li>`).join('')}</ul>
          <a href="${href('berekening')}">${selectie.length > 3 ? `Alle ${selectie.length} meldingen bekijken` : 'Onderbouwing in de berekening'} ${icoon('rechts')}</a></section>` : ''}
      </div>
    </div>
    <section class="paneel overzicht-ondernemingen"><h2>Ondernemingen</h2>
      ${onds.length ? `<ul>${onds.map((o) => {
        const analyse = r.ondernemingen.find((a) => a.id === o.id);
        return `<li><a href="${dossierPad(d, bzi ? 'bedrijf' : 'balans', o.id)}">${icoon('gebouw')}
          <span><strong>${esc(o.naam || 'Naamloze onderneming')}</strong><small>${esc(RECHTSVORMEN[o.rechtsvorm]?.label || o.rechtsvorm || '')}</small></span>
          ${analyse ? pil(analyse.status) : ''}${icoon('rechts')}</a></li>`;
      }).join('')}</ul>` : `<p class="dempen">Er is nog geen onderneming toegevoegd.</p>${detailLink('klant', 'Naar klantgegevens', 'plus')}`}
      ${bzi ? `<div class="acties overzicht-snel">${detailLink('bedrijven', 'Structuur', 'organogram')}${detailLink('verplichtingen', 'Verplichtingen', 'lijst')}${detailLink('bziinvoer', 'BZI-invoer', 'reken')}${detailLink('samenvatting', 'Samenvatting', 'notitie')}</div>` : ''}
    </section>
  </div>`;
}

function geenOnderneming(d) {
  return leeg('Dit dossier heeft nog geen onderneming.', `<a class="knop" href="#/dossier/${esc(d.id)}/klant">Onderneming toevoegen</a>`);
}

// ---------------------------------------------------------------------------
// Klantgegevens
// ---------------------------------------------------------------------------
function intakeKlap(d, onderdeel, titel, inhoud) {
  const id = `intake-${onderdeel}`;
  const sleutel = `intake:${d.id}:${onderdeel}`;
  return klapPaneel(sleutel, id, esc(titel), inhoud, { standaardDicht: true });
}

function tabKlant(d, r) {
  const a = d.aanvrager || {};
  const inst = d.instellingen || {};
  const kader = kaderVoor(d);
  const { jaarNu } = bepaalJaren(d);
  const advOpties = lijst('advieskantoor').sort((x, y) => x.naam.localeCompare(y.naam)).map((x) => [x.id, x.naam]);
  const toetsjaarOpties = [['', `Standaard (${r.T3})`], ...[jaarNu - 1, jaarNu - 2, jaarNu - 3].map((y) => [String(y), String(y)])];
  const heeftVPB = (d.ondernemingen || []).some((o) => soortOndernemer(o.rechtsvorm) === 'VPB');

  const aanvraag = `<section class="paneel"><h2>Aanvraag</h2><div class="raster-3">
    ${keuze('Soort aanvraag', 'soort', { IKV: 'Inkomensverklaring (IKV)', NUL: '0-verklaring (nul-inkomen)' }, d.soort, { render: true })}
    ${keuze('Toetskader', 'kader', kaderOpties(), d.kader, { render: true, hint: `${kader.versie}. ${kader.bronStatus || ''}` })}
    ${veld('Berekeningsdatum', 'berekeningsdatum', d.berekeningsdatum, { type: 'datum', render: true })}
    ${keuze('Status', 'status', DOSSIER_STATUSSEN, d.status, { render: true })}
    ${keuze('Advieskantoor', 'advieskantoorId', advOpties, d.advieskantoorId, { leeg: 'Geen / onbekend' })}
    ${veld('Uiterste datum', 'uitersteDatum', d.uitersteDatum, { type: 'datum', render: true })}
  </div></section>`;
  const behandeling = intakeKlap(d, 'behandeling', 'Behandeling en dossieradministratie', `<div class="raster-3">
    ${keuze('Niveau dossier', 'niveau', ['Basis', 'Medium', 'Top'], d.niveau || 'Basis')}
    ${veld('Behandelaar (1e fiat)', 'behandelaar', d.behandelaar)}
    ${keuze('Opdrachtnemer (label)', 'label', ['ABN AMRO', 'Florius', 'Moneyou', 'ASN Bank', 'Knab', 'Overig'], d.label || ({ ASN: 'ASN Bank', KNAB: 'Knab' }[d.kader] || 'ABN AMRO'))}
    ${keuze('Afdeling', 'afdeling', ['FMD', 'IMV', 'RV'], d.afdeling || 'IMV', { hint: 'Bepaalt het format van de conclusie.' })}
    ${veld('Hypotheekaanvraagnummer', 'leningnummer', d.leningnummer)}
    ${veld('Aantal ondernemingen bij aanvraag', 'instellingen.initieelAantalOndernemingen', inst.initieelAantalOndernemingen, { type: 'getal' })}
    ${veld('Datum aanvraag', 'datumAanvraag', d.datumAanvraag || String(d.aangemaakt || '').slice(0, 10), { type: 'datum' })}
    ${veld('Via', 'via', d.via, { placeholder: 'Bijv. adviseur, invoerservice, accountant' })}
    ${veld('Relatienummer (bestaande relatie)', 'relatienummer', d.relatienummer, { placeholder: 'Alleen bij een bestaande relatie' })}
  </div>
  <div class="raster-2" style="margin-top:14px">
    <div>${vink('Spoeddossier', 'spoed', !!d.spoed, { render: true })}</div>
    <div>${vink('Bestaande relatie van de geldverstrekker', 'bestaandeRelatie', !!d.bestaandeRelatie, { render: true })}</div>
  </div>`);
  const toetsopties = intakeKlap(d, 'toetsing', 'Toetsjaren en inkomenskeuzes', `<div class="raster-3">
    ${keuze('Laatste toetsjaar', 'instellingen.laatsteToetsjaar', toetsjaarOpties, inst.laatsteToetsjaar ?? '', { render: true, type: 'getal',
      hint: `Definitieve cijfers vorig jaar verplicht vanaf ${kader.definitiefVerplichtVanaf.d}-${kader.definitiefVerplichtVanaf.m}.` })}
  </div><div class="raster-2" style="margin-top:14px">
    <div>${vink('Controlejaar / lopend jaar meenemen (als er cijfers zijn)', 'instellingen.controlejaar', inst.controlejaar !== false, { render: true })}</div>
    ${kader.vervangenVanaf && kader.familie === 'NHG' && d.soort === 'IKV' ? `<div>${vink('Oudste jaar vervangen door het gerealiseerde resultaat van het lopende jaar', 'instellingen.vervangOudsteJaar', !!inst.vervangOudsteJaar, { render: true, hint: `${kader.kort}: vanaf ${kader.vervangenVanaf.d}-${kader.vervangenVanaf.m} met tussentijdse balans en W&V${kader.id === 'ASN' ? '; op basis van het werkelijke aantal maanden, maximaal het laatste volledige jaar' : kader.id === 'KNAB' ? '; het vervangende jaar weegt 3×' : '; alleen hele maanden'}.` })}
      ${r.inkomen?.vergelijking ? `<p class="dempen klein" style="margin:6px 0 0 24px">Box 1 zonder vervanging ${esc(fmt.eur(r.inkomen.vergelijking.zonder))}, met vervanging ${esc(fmt.eur(r.inkomen.vergelijking.met))}.</p>` : ''}</div>` : ''}
  </div>
  ${heeftVPB && d.soort === 'IKV' ? box2Keuzes(d, kader, inst) : ''}
  ${d.soort === 'IKV' && kader.familie === 'NHG' && kader.id !== 'NHG' ? kaderKeuzes(d, kader, inst) : ''}
  ${kader.instelbaar?.length && d.soort === 'IKV' ? kaderParameters(d, kader) : ''}
  `);

  const aanvrager = `<section class="paneel"><h2>Aanvrager</h2><div class="raster-3">
    ${veld('Voorletters', 'aanvrager.voorletters', a.voorletters)}
    ${veld('Tussenvoegsel', 'aanvrager.tussenvoegsel', a.tussenvoegsel)}
    ${veld('Achternaam', 'aanvrager.achternaam', a.achternaam)}
    ${veld('Geboortedatum', 'aanvrager.geboortedatum', a.geboortedatum, { type: 'datum' })}
  </div></section>`;
  const contact = intakeKlap(d, 'contact', 'Adres en contactgegevens', `<div class="raster-3">
    ${keuze('Geslacht', 'aanvrager.geslacht', { M: 'Man', V: 'Vrouw', X: 'Anders/onbekend' }, a.geslacht, { leeg: '' })}
    ${veld('Geboorteplaats', 'aanvrager.geboorteplaats', a.geboorteplaats)}
    ${veld('Straat', 'aanvrager.straat', a.straat)}
    ${veld('Huisnummer', 'aanvrager.huisnummer', a.huisnummer)}
    ${veld('Postcode', 'aanvrager.postcode', a.postcode)}
    ${veld('Woonplaats', 'aanvrager.woonplaats', a.woonplaats)}
    ${veld('Telefoon', 'aanvrager.telefoon', a.telefoon)}
    ${veld('E-mail', 'aanvrager.email', a.email, { type: 'email' })}
  </div><p class="dempen klein" style="margin-top:10px">Leg geen BSN of rekeningnummers vast; die zijn voor de inkomensbepaling niet nodig.</p>`);

  const ondernemingen = `<div class="paneel"><div class="paginakop" style="margin:0 0 6px"><h2>Ondernemingen en structuur</h2>
    <button class="knop sec" data-actie="ond-toevoegen">${icoon('plus')}Onderneming toevoegen</button></div>
    ${(d.ondernemingen || []).map((o, i) => ondernemingKaart(d, o, i, r)).join('') || leeg('Nog geen ondernemingen vastgelegd.')}</div>`;

  const structuur = intakeKlap(d, 'organogram', 'Organogram en overige aandeelhouders',
    paneelOrganogram(d, { bewerken: true, titel: 'Organogram en overige aandeelhouders' }));
  const verplichtingen = intakeKlap(d, 'verplichtingen', 'Geldstromen en verplichtingen', `
    ${paneelGeldstromen(d, r)}${heeftVPB ? paneelRC(d, r) + paneelLeningDirectie(d, r) : ''}${paneelZK(d)}`);
  const aanvullende = intakeKlap(d, 'inkomen', 'Loondienst, 0-inkomen en afwijkingen', `
    ${kader.familie === 'NHG' || d.soort === 'NUL' ? paneelLoondienst(d, r) : ''}
    ${d.soort === 'NUL' || (d.ondernemingen || []).some((o) => o.meenemen === false || o.nulInkomen) ? paneelNul(d) : ''}
    ${d.soort === 'IKV' ? paneelAfwijkend(d, r) : ''}`);
  return `<div class="intake-basis">${aanvraag}${aanvrager}</div>
    ${ondernemingen}
    <div class="intake-aanvullend">${behandeling}${contact}${toetsopties}${structuur}${verplichtingen}${aanvullende}</div>`;
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
  // Overzicht: van oud naar nieuw.
  const TO = ordeJarenOverzicht(T);
  if (r.familie !== 'ABN') {
    // Kolommen: toetsjaren, lopend jaar gerealiseerd, gemiddelde, lopend jaar geëxtrapoleerd, box 2
    const cG = (w) => (C ? `<td class="num">${fmt.eur(w)}</td>` : '');
    const rijen = ink.perOnderneming.map((o) => {
      const a = r.ondernemingen.find((x) => x.id === o.id);
      const tj = TO.map((y) => `<td class="num">${fmt.eur(o.jaren[y])}</td>`).join('');
      return `<tr><td><b>${esc(o.naam)}</b></td><td>${esc(a.rechtsvormKort)}</td><td>${a.maandenOndernemer >= 36 ? '≥ 3 jaar' : a.maandenOndernemer >= 12 ? '≥ 1 jaar' : '< 1 jaar'}</td>
        <td>${pil(a.status)}</td>${tj}${cG(o.controleReal)}<td class="num">${fmt.eur(o.gemiddelde)}</td>${C ? `<td class="num">${fmt.eur(o.controleExtr)}</td>` : ''}<td class="num">${o.box2 ? fmt.eur(o.box2) : ''}</td></tr>`;
    }).join('');
    const pers = ink.persoonlijk;
    const persTj = TO.map((y) => `<td class="num">${fmt.eur(pers[y].totaal)}</td>`).join('');
    const persC = C ? `<td class="num">${fmt.eur(pers[C]?.totaal ?? 0)}</td>` : '';
    const persRij = T.some((y) => pers[y].totaal) ? `<tr><td>Overige box 1 inkomsten</td><td></td><td></td><td></td>${persTj}${persC}<td></td>${C ? '<td></td>' : ''}<td></td></tr>` : '';
    const kopTj = TO.map((y) => `<th class="num">${y}</th>`).join('');
    const kopC = C ? `<th class="num">${C} (gerealiseerd)</th>` : '';
    const totTj = TO.map((y) => `<td class="num">${fmt.eur(ink.perJaar[y])}</td>`).join('');
    const totC = C ? `<td class="num">${fmt.eur(ink.controleReal)}</td>` : '';
    return `<div class="scroll"><table class="tabel"><thead><tr><th>Onderneming</th><th>Rechtsvorm</th><th>Jaren ondernemer</th><th>Voorwaarden</th>
      ${kopTj}${kopC}<th class="num">Gemiddelde na correcties</th>${C ? `<th class="num">${C} (geëxtrapoleerd)</th>` : ''}<th class="num">Box 2</th></tr></thead>
      <tbody>${rijen}${persRij}
      <tr class="totaal"><td colspan="4">Toetsinkomen totaal (${esc(kaderLabel(r.kader))})${r.kader === 'OPT' ? '<div class="dempen klein">per jaar: economisch inkomen</div>' : ''}</td>${totTj}${totC}<td class="num">${fmt.eur(ink.box1)}</td>${C ? `<td class="num">${fmt.eur(ink.controleExtr)}</td>` : ''}<td class="num">${fmt.eur(ink.box2)}</td></tr>
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

/**
 * Kengetallen per jaar (van oud naar nieuw) met het oordeel per voorwaarde. De kolom Verloop toont dezelfde reeks
 * als staafjes, met het laatste jaar in de accentkleur en de trend uit de rekenkern: stijgend, dalend, wisselend of gelijk.
 */
export function kengetallenTabel(a, r) {
  const chrono = r.C ? [...r.T, r.C] : [...r.T];
  const jaren = ordeJarenOverzicht(chrono);
  const J = a.jaren;
  const st = (key) => a.checks.find((c) => c.key === key)?.status || 'akkoord';
  const geenTrend = '<td class="trend"></td>';
  const verloop = (reeks, naam, opmaak, label = '') => {
    if ((reeks || []).filter((v) => v !== null && v !== undefined).length < 2) return geenTrend;
    return `<td class="trend"><span class="trend-cel">${sparkSVG(reeks, { labels: chrono, opmaak, titel: `Verloop ${naam}` })}<span>${esc(label)}</span></span></td>`;
  };
  const trend = (sleutel, naam, opmaak) => verloop(a.trends?.[sleutel], naam, opmaak, a.trendLabels?.[sleutel] || '');
  const rij = (label, fn, key, trendCel = geenTrend) => `<tr><td>${esc(label)}</td>${jaren.map((y) => `<td class="num">${J[y] ? fn(J[y], y) : ''}</td>`).join('')}${trendCel}<td>${key ? pil(st(key)) : ''}</td></tr>`;
  const leegJaren = jaren.map(() => '<td></td>').join('');
  const heeft = (k) => chrono.some((y) => J[y]?.[k] !== null && J[y]?.[k] !== undefined);
  const dagen = (k, label) => (heeft(k)
    ? rij(label, (j) => (j[k] === null || j[k] === undefined ? '' : fmt.getal(j[k])), null, verloop(chrono.map((y) => J[y]?.[k] ?? null), label.toLowerCase(), (v) => `${fmt.getal(v)} dagen`)) : '');
  const omloop = `${dagen('omlDeb', 'Omlooptijd debiteuren (dagen)')}${dagen('omlCred', 'Omlooptijd crediteuren (dagen)')}`;
  return `<div class="scroll"><table class="tabel kengetallen"><thead><tr><th>Kengetallen, ratio's en voorwaarden</th>${jaren.map((y) => `<th class="num">${y}${y === r.C ? (J[y]?.factor !== 1 ? ' (extrapolatie)' : ' (controlejaar)') : ''}</th>`).join('')}<th>Verloop</th><th>Resultaat</th></tr></thead><tbody>
    ${rij('Winstgevendheid (nettowinst na correcties)', (j, y) => fmt.eur(y === r.C ? j.winst.NWcorExtr : j.winst.NWcor), 'winst', trend('winst', 'winstgevendheid', (v) => fmt.eur(v)))}
    ${rij('Liquiditeit: current ratio', (j) => (j.heeftBalans ? fmt.ratio(j.CR) : 'n.v.t.'), 'liquiditeit', trend('cr', 'current ratio', (v) => fmt.ratio(v)))}
    ${rij('Liquiditeit: werkkapitaal / liquiditeitsruimte', (j) => (j.heeftBalans ? fmt.getal(j.WK) : 'n.v.t.'), 'werkkapitaal', trend('wk', 'werkkapitaal', (v) => fmt.eur(v)))}
    ${rij('Solvabiliteit', (j) => (j.heeftBalans ? fmt.pct(j.SV) : 'n.v.t.'), 'solvabiliteit', trend('sv', 'solvabiliteit', (v) => fmt.pct(v)))}
    ${rij('Solvabiliteitsruimte', (j) => (j.heeftBalans && j.solvRuimte !== null ? fmt.getal(j.solvRuimte) : 'n.v.t.'))}
    <tr><td>Buitenland</td>${leegJaren}${geenTrend}<td>${pil(st('buitenland'))}</td></tr>
    <tr><td>Branche / sector</td>${leegJaren}${geenTrend}<td>${pil(st('branche'))}</td></tr>
    <tr class="totaal"><td>Totaalresultaat</td>${leegJaren}${geenTrend}<td>${pil(a.status)}</td></tr>
    ${omloop ? `<tr class="kopregel"><td colspan="${jaren.length + 3}">Ter informatie (telt niet mee in het oordeel)</td></tr>${omloop}` : ''}
  </tbody></table></div>`;
}

function voorwaardenLijst(checks) {
  return `<div class="voorwaarden">${checks.map((c) => `<div class="voorwaarde"><b>${esc(c.label)}</b><div>${pil(c.status)}</div><div class="tekst">${esc(c.tekst)}</div></div>`).join('')}</div>`;
}

// Waar een voorwaarde wordt ingevoerd: het tabblad (ViiZ) of de stap (BZI) achter "Naar invoer".
function invoerVoorCheck(key) {
  if (key === 'winst') return ['vw', 'V&W'];
  if (/^(liquiditeit|werkkapitaal|solvabiliteit|definitief|tussentijds|balans\d{4}|plausibel(Cor)?\d{4})$/.test(key)) return ['balans', 'Balans'];
  return ['klant', 'Klantgegevens'];
}

function invoerLink(d, a, key) {
  const [tab, label] = invoerVoorCheck(key);
  if (weergaveDossier(d) === 'bzi') {
    const stap = tab === 'klant' ? 'bedrijven' : `bedrijf/${esc(a.id)}`;
    return `<a class="naar-invoer geen-print" href="#/dossier/${esc(d.id)}/${stap}">Naar invoer${icoon('rechts')}</a>`;
  }
  return `<a class="naar-invoer geen-print" href="#/dossier/${esc(d.id)}/${tab}${tab === 'klant' ? '' : `/${esc(a.id)}`}">Naar invoer (${esc(label)})${icoon('rechts')}</a>`;
}

/** Voorwaarden van één onderneming: wat aandacht vraagt staat bovenaan met een link naar de invoer; wat akkoord is, klapt in. */
function voorwaardenBlok(d, a) {
  const aandacht = a.checks.filter((c) => c.status !== 'akkoord');
  const akkoord = a.checks.filter((c) => c.status === 'akkoord');
  const rij = (c, link) => `<div class="voorwaarde"><b>${esc(c.label)}</b><div>${pil(c.status)}</div><div class="tekst">${esc(c.tekst)}${link ? ` ${invoerLink(d, a, c.key)}` : ''}</div></div>`;
  const sleutel = `vw:${a.id}`;
  const dicht = ingeklapt(sleutel, true);
  const lijstId = `vw-${a.id}`;
  return `${aandacht.length ? `<div class="voorwaarden">${aandacht.map((c) => rij(c, true)).join('')}</div>` : ''}
    ${akkoord.length ? `<div class="klap vw-akkoord${dicht ? ' ingeklapt' : ''}" data-klap="${esc(sleutel)}">
      <button type="button" class="vw-akkoord-kop" data-actie="klap" data-sleutel="${esc(sleutel)}" aria-expanded="${!dicht}" aria-controls="${esc(lijstId)}">${icoon('open')}
        <span>${aandacht.length ? `${akkoord.length} ${akkoord.length === 1 ? 'voorwaarde' : 'voorwaarden'} akkoord` : `Alle ${akkoord.length} voorwaarden akkoord`}</span></button>
      <div class="klap-inhoud voorwaarden" id="${esc(lijstId)}">${akkoord.map((c) => rij(c, false)).join('')}</div></div>` : ''}`;
}

/** Paneel dat via de kop in- en uitklapt. De keuze blijft staan zolang de pagina open is. */
function klapPaneel(sleutel, id, kopHTML, inhoud, { standaardDicht = false } = {}) {
  const dicht = ingeklapt(sleutel, standaardDicht);
  return `<section class="paneel klap${dicht ? ' ingeklapt' : ''}" id="${esc(id)}" data-klap="${esc(sleutel)}">
    <h2 class="klap-kop"><button type="button" data-actie="klap" data-sleutel="${esc(sleutel)}" aria-expanded="${!dicht}" aria-controls="${esc(id)}-inhoud">${icoon('open')}<span class="klap-titel">${kopHTML}</span></button></h2>
    <div class="klap-inhoud" id="${esc(id)}-inhoud">${inhoud}</div></section>`;
}

const STIP_STATUS = { akkoord: 'ok', attentie: 'aandacht', niet_akkoord: 'fout', info: 'info' };
/** Statusstip met vorm én kleur (rond = akkoord, ruit = attentie, vierkant = niet akkoord), plus tekst voor schermlezers. */
export function stip(status) {
  return `<i class="stip ${STIP_STATUS[status] || 'open'}" aria-hidden="true"></i><span class="sr">${esc(STATUS_TEKST[status] || '')}: </span>`;
}

/** Alle ondernemingen naast elkaar: de drie hoofdtoetsen over het laatste toetsjaar, wat verder aandacht vraagt en het oordeel. */
export function ondernemingenMatrix(d, r, analyses, { links = true } = {}) {
  const T3 = r.T[r.T.length - 1];
  const st = (a, key) => a.checks.find((c) => c.key === key)?.status || 'akkoord';
  const hoofd = ['winst', 'liquiditeit', 'solvabiliteit'];
  const rijen = analyses.map((a) => {
    const j = a.jaren?.[T3];
    const cel = (key, tekst) => `<td class="num"><span class="kg">${stip(st(a, key))}${tekst}</span></td>`;
    const overig = a.checks.filter((c) => !hoofd.includes(c.key) && c.status !== 'akkoord');
    const naam = links
      ? `<button type="button" class="grid-link" data-actie="naar-sectie" data-doel="ber-ond-${esc(a.id)}">${esc(a.naam)}</button>` : `<b>${esc(a.naam)}</b>`;
    return `<tr><td>${naam}<div class="dempen klein">${esc(a.rechtsvormKort || a.rechtsvormLabel || '')}${a.aandeel < 1 ? `, ${fmt.pct(a.aandeel, 0)}` : ''}${a.isDeelneming ? ', deelneming' : ''}</div></td>
      ${cel('winst', j ? fmt.eur(j.winst.NWcor) : 'n.v.t.')}
      ${cel('liquiditeit', j?.heeftBalans ? fmt.ratio(j.CR) : 'n.v.t.')}
      ${cel('solvabiliteit', j?.heeftBalans ? fmt.pct(j.SV) : 'n.v.t.')}
      <td>${overig.length ? overig.map((c) => `<div class="kg">${stip(c.status)}${esc(c.label)}</div>`).join('') : '<span class="dempen">Geen</span>'}</td>
      <td>${pil(a.status)}</td></tr>`;
  }).join('');
  return `<div class="scroll"><table class="tabel matrix"><thead><tr><th>Onderneming</th><th class="num">Winst na correcties ${T3}</th><th class="num">Current ratio ${T3}</th><th class="num">Solvabiliteit ${T3}</th><th>Overige aandachtspunten</th><th>Oordeel</th></tr></thead>
    <tbody>${rijen}</tbody></table></div>
    <p class="dempen klein" style="margin:8px 0 0">De bedragen en ratio's gelden voor ${T3}; de stip ervoor geeft het oordeel over alle toetsjaren${r.C ? ' en het controlejaar' : ''} (rond = akkoord, ruit = attentie, vierkant = niet akkoord).</p>`;
}

/** Hetzelfde dossier volgens alle toetskaders naast elkaar, plus de berekeningswijzen 1-1-1, 1-2-3 en 1-3-4. */
export function methodenTabel(d, r, { kop = true } = {}) {
  if (d.soort === 'NUL' || !r.inkomen) return '';
  let v = [];
  try { v = vergelijkKaders(d); } catch { v = []; }
  const m = r.inkomen.methoden;
  const TO = ordeJarenOverzicht(r.T);
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
  return `${kop ? '<h3>Vergelijking toetskaders</h3>' : ''}
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

/** Schakelaar voor de formules in de rekenstappen en de knoppen om alles in of uit te klappen. */
export function weergaveOpties({ formules = true } = {}) {
  return `<div class="subnav-opties">
    ${formules ? `<label class="schakel" title="Formules onder de bedragen in de rekenstappen tonen of verbergen"><input type="checkbox" data-actie="formules"${ui.formules ? ' checked' : ''}><span>Formules</span></label>` : ''}
    <button type="button" class="knop link klein" data-actie="alles-klap" data-stand="uit" title="Alles uitklappen">${icoon('uitklappen')}<span>Alles uit</span></button>
    <button type="button" class="knop link klein" data-actie="alles-klap" data-stand="in" title="Alles inklappen">${icoon('inklappen')}<span>Alles in</span></button>
  </div>`;
}

function tabBerekening(d, r) {
  const isNul = d.soort === 'NUL';
  const analyses = r.ondernemingen.filter((a) => !(d.soort === 'IKV' && !a.meenemen && r.familie !== 'ABN'));
  // Bij drie of meer ondernemingen starten de ondernemingen die akkoord zijn ingeklapt: de aandacht gaat naar de rest.
  const veel = analyses.length >= 3;
  const nav = [];
  const delen = [];
  if (r.meldingen.length) {
    // Zwaarste meldingen bovenaan; binnen hetzelfde niveau blijft de volgorde van de rekenkern staan.
    const zwaarte = { niet_akkoord: 0, attentie: 1 };
    const gesorteerd = r.meldingen.map((m, i) => [m, i]).sort((a, b) => (zwaarte[a[0].niveau] ?? 2) - (zwaarte[b[0].niveau] ?? 2) || a[1] - b[1]).map(([m]) => m);
    delen.push(`<div class="blok" id="ber-meldingen">${gesorteerd.map(meldingHTML).join('')}</div>`);
  }
  if (isNul) {
    const n = r.nul;
    nav.push(['ber-inkomen', 'Beoordeling', n.status]);
    delen.push(klapPaneel('ber:inkomen', 'ber-inkomen', `Beoordeling 0-verklaring ${pil(n.status)}`, `
      ${n.nhgOpmerking ? melding('info', esc(n.nhgOpmerking)) : ''}
      <p style="margin-top:10px"><b>${esc(n.conclusie)}</b></p>
      ${n.toelichtingCorrectie.length ? `<p class="dempen">${esc(n.toelichtingCorrectie.join('; '))}</p>` : ''}
      ${n.perOnderneming.map((o) => `<h3 style="margin-top:16px">${esc(o.naam)} <span class="dempen klein">${esc(o.rechtsvorm)}</span> ${pil(o.status)}</h3>${voorwaardenLijst(o.checks)}`).join('')}
      <h3 style="margin-top:16px">Zekerheden en verplichtingen</h3>${voorwaardenLijst(n.zekerheden)}
      ${r.toets30 ? `<p class="dempen" style="margin-top:12px">Ter informatie: maximaal 30%-toets bij loondienst ≥ 80%: ${esc(fmt.eur(r.toets30.max))}.</p>` : ''}`));
  } else {
    nav.push(['ber-inkomen', 'Inkomen', '']);
    delen.push(klapPaneel('ber:inkomen', 'ber-inkomen', 'Inkomensvaststelling', `${inkomensTabel(d, r)}
      ${r.inkomen.stappen.length ? `<ul class="dempen" style="margin:10px 0 0 18px">${r.inkomen.stappen.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${r.inkomen.nietMeegenomen ? `<h3 style="margin-top:14px">Niet-meegenomen ondernemingen (risicobeoordeling) ${pil(r.inkomen.nietMeegenomen.status)}</h3>${r.inkomen.nietMeegenomen.perOnderneming.map((o) => `<p><b>${esc(o.naam)}</b></p>${voorwaardenLijst(o.checks)}`).join('')}` : ''}`));
    nav.push(['ber-kaders', 'Toetskaders', '']);
    delen.push(klapPaneel('ber:kaders', 'ber-kaders', 'Vergelijking toetskaders', methodenTabel(d, r, { kop: false })));
    const metOverwinst = r.ondernemingen.filter((a) => a.box2?.overwinst);
    if (metOverwinst.length) {
      nav.push(['ber-overwinst', 'Overwinst', '']);
      delen.push(klapPaneel('ber:overwinst', 'ber-overwinst', 'Overwinst en dubbele balanstoets',
        metOverwinst.map((a) => `${metOverwinst.length > 1 ? `<h3>${esc(a.naam)}</h3>` : ''}${overwinstBlok(d, r, a)}`).join('')));
    }
    if (r.inkomen.geldstromen?.length) {
      nav.push(['ber-geldstromen', 'Geldstromen', '']);
      delen.push(`<section class="paneel" id="ber-geldstromen">${geldstromenTabel(r, r.inkomen.geldstromen)}</section>`);
    }
  }
  if (analyses.length > 1) {
    nav.push(['ber-ondernemingen', 'Ondernemingen', '']);
    delen.push(klapPaneel('ber:ondernemingen', 'ber-ondernemingen', `Samenvatting ondernemingen <span class="dempen klein">${analyses.length} ondernemingen</span>`, ondernemingenMatrix(d, r, analyses)));
  }
  analyses.forEach((a) => {
    const econ = a.belangEconomisch !== undefined && a.belangEconomisch !== null && Math.abs(a.belangEconomisch - a.aandeel) > 0.0001
      ? `, economisch ${fmt.pct(a.belangEconomisch, 1)}` : '';
    nav.push([`ber-ond-${a.id}`, a.naam, a.status]);
    delen.push(klapPaneel(`ber:ond:${a.id}`, `ber-ond-${a.id}`,
      `${esc(a.naam)} ${pil(a.status)} <span class="dempen klein">${esc(a.rechtsvormLabel)}, ${esc(a.soort === 'VPB' ? 'niet-IB (DGA)' : 'IB-ondernemer')}${a.aandeel < 1 ? `, ${fmt.pct(a.aandeel, 0)}` : ''}${econ}${a.isDeelneming ? ', deelneming' : ''}${a.soort === 'VPB' && a.zeggenschap === false ? ', geen zeggenschap' : ''}</span>`,
      `${kengetallenTabel(a, r)}
      ${d.soort === 'IKV' ? `<h3 style="margin-top:16px">Voorwaarden</h3>${voorwaardenBlok(d, a)}` : ''}
      <div class="raster-2" style="margin-top:14px">
        <div>${a.maxOnttrekkenNvt ? melding('info', `Maximaal te onttrekken: n.v.t. ${esc(a.maxOnttrekkenNvt)}`) : melding('info', `Maximaal te onttrekken vlottende activa zodat de onderneming nog aan de ratio's voldoet (${a.laatsteBalansJaar}): <b>${esc(fmt.eur(a.maxOnttrekken ?? 0))}</b>`)}</div>
        <div>${a.benodigdBox3 ? melding('attentie', `Minimaal benodigde balansversterking (box 3 vermogen) om aan de normen te voldoen: <b>${esc(fmt.eur(a.benodigdBox3))}</b> (liquiditeit ${esc(fmt.eur(a.benodigdBox3Detail.nodigCr))}, solvabiliteit ${esc(fmt.eur(a.benodigdBox3Detail.nodigSv))}).`) : melding('akkoord', 'Geen aanvullend box 3 vermogen nodig.')}</div>
        ${a.box2?.benodigdVoorOverwinst ? `<div>${melding('info', `Benodigde balansversterking om de volledige overwinst mee te nemen: <b>${esc(fmt.eur(a.box2.benodigdVoorOverwinst))}</b>.`)}</div>` : ''}
      </div>
      <details class="stappen" style="margin-top:14px"><summary>Rekenstappen ${esc(a.naam)}</summary><div class="inhoud">${renderTrace(a.trace)}</div></details>`,
      { standaardDicht: veel && a.status === 'akkoord' }));
  });
  if (d.soort === 'IKV') {
    nav.push(['ber-totaal', 'Totaalberekening', '']);
    delen.push(klapPaneel('ber:totaal', 'ber-totaal', 'Totaalberekening', renderTrace(r.trace)));
  }
  const subnav = `<div class="subnav geen-print" data-spy>
    <nav class="subnav-links" aria-label="Onderdelen van de berekening">${nav.map(([doel, label, status]) => `<button type="button" data-actie="naar-sectie" data-doel="${esc(doel)}">${status ? stip(status) : ''}${esc(label)}</button>`).join('')}</nav>
    ${weergaveOpties()}
  </div>`;
  return `<div class="berekening${ui.formules ? '' : ' zonder-formules'}">${subnav}${delen.join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Documenten
// ---------------------------------------------------------------------------
export { docAanwezig };

function tabDocumenten(d, r, docs) {
  const { jaren } = roosterJaren(d);
  const ontbrekend = r.documenten.filter((x) => x.verplicht && !docAanwezig(docs, x));
  const aanwezig = r.documenten.filter((x) => x.verplicht && docAanwezig(docs, x));
  const optioneel = r.documenten.filter((x) => !x.verplicht);
  const checklist = (items) => `<div class="scroll"><table class="tabel"><thead><tr><th>Document</th><th>Wanneer</th><th>Geldigheid</th><th>Uploadstatus</th></tr></thead>
    <tbody>${items.map((x) => {
      const n = docs.filter((y) => y.categorie === x.categorie).length;
      const aantal = x.aantal || 1;
      const label = x.verplicht ? (n >= aantal ? pil('akkoord', 'Aanwezig per categorie') : pil('attentie', n ? `${n} van ${aantal}` : 'Ontbreekt')) : pil('info', 'Optioneel');
      return `<tr><td><b>${esc(x.naam)}</b></td><td>${esc(x.wanneer)}</td><td>${esc(x.geldigheid)}</td><td>${label}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  const docRijen = docs.sort((a, b) => String(b.aangemaakt).localeCompare(String(a.aangemaakt))).map((x) => {
    const ond = (d.ondernemingen || []).find((o) => o.id === x.ondId);
    return `<tr><td>${esc(x.naam)}</td><td>${esc(CATEGORIEEN[x.categorie] || x.categorie)}</td><td>${esc(x.jaar || '')}</td><td>${esc(ond?.naam || '')}</td>
      <td class="nowrap">${esc(datumKort(x.aangemaakt))}</td><td class="num">${esc(fmt.getal(Math.round(num(x.grootte) / 1024)))} kB</td>
      <td class="nowrap"><button class="knop link klein" data-actie="doc-download" data-id="${esc(x.id)}">Openen</button>
      <button class="knop link klein" data-actie="doc-verwijderen" data-id="${esc(x.id)}">Verwijderen</button></td></tr>`;
  }).join('');
  return `<div class="paneel documenten-checklist"><div class="paginakop" style="margin:0 0 8px"><h2>Benodigde stukken</h2>
      ${ontbrekend.length ? `<button class="knop sec" data-actie="mail-adviseur">${icoon('mail')}Ontbrekende stukken mailen naar adviseur</button>` : ''}</div>
    <p class="dempen klein">De uploadstatus telt bestanden per categorie. Controleer zelf het boekjaar, de onderneming, de inhoud en de geldigheid.</p>
    ${ontbrekend.length ? `<h3>Ontbrekend (${ontbrekend.length})</h3>${checklist(ontbrekend)}` : '<p>Voor alle verplichte categorieën zijn voldoende bestanden geüpload.</p>'}
    ${aanwezig.length ? `<details><summary>Aanwezige stukken (${aanwezig.length})</summary>${checklist(aanwezig)}</details>` : ''}
    ${optioneel.length ? `<details><summary>Optionele stukken (${optioneel.length})</summary>${checklist(optioneel)}</details>` : ''}
  </div>
  <div class="paneel"><h2>Document toevoegen</h2>
    <div class="raster-3">
      <label class="veld"><span>Soort document</span><select id="doc-categorie">${Object.entries(CATEGORIEEN).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
      <label class="veld"><span>Jaar</span><select id="doc-jaar"><option value="">n.v.t.</option>${ordeJaren(jaren).map((y) => `<option>${y}</option>`).join('')}</select></label>
      <label class="veld"><span>Onderneming</span><select id="doc-ond"><option value="">Privé / algemeen</option>${(d.ondernemingen || []).map((o) => `<option value="${esc(o.id)}">${esc(o.naam)}</option>`).join('')}</select></label>
      <label class="veld"><span>Bestand (max. 15 MB)</span><input id="doc-bestand" type="file" accept=".pdf,image/*,.xlsx,.xls,.csv,.docx,.txt"></label>
    </div>
    <div class="acties" style="margin-top:12px"><button class="knop" data-actie="doc-upload">Uploaden</button></div>
  </div>
  <div class="paneel"><h2>Geüploade bestanden (${docs.length})</h2><div class="scroll"><table class="tabel"><thead><tr><th>Bestand</th><th>Soort</th><th>Jaar</th><th>Onderneming</th><th>Toegevoegd</th><th class="num">Grootte</th><th></th></tr></thead>
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
