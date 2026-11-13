import { esc, fmt, naamAanvrager, num, isIngevuld, getPath } from '../util.js';
import { get, lijst, state } from '../state.js';
import { bepaalJaren } from '../engine/index.js';
import { bronDgaGezamenlijk } from '../engine/abn-aanvrager.js';
import {
  RECHTSVORMEN, BEROEPSGROEPEN, SOORTEN, kaderLabel, soortOndernemer, KADERS, kaderVoor, PARAM_LABELS, leesPad,
} from '../engine/kaders.js';
import {
  BALANS_RIJEN, VW_RIJEN, DIVERSEN_RIJEN, DIVERSEN_VLAGGEN, IB_ONDERNEMING_RIJEN, IB_PERSOON_RIJEN,
  DOSSIER_STATUSSEN, JAAR_STATUSSEN, AFGEROND, weergaveVan, detailSom, veldZichtbaar,
} from '../schema/fields.js';
import { CATEGORIEEN, docAanwezig } from '../schema/documenten.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES } from '../schema/correcties.js';
import { balansTotalen, vwTotalen } from '../engine/financieel.js';
import { pil, statusPil, bedrag, veld, tekstvak, keuze, vink, melding, leeg, STATUS_TEKST, icoon } from './ui.js';
import { rekenInvoerStatus } from '../engine/reken-invoer.js';
import { renderRapportPagina } from './rapport.js';
import { FORMATS, CONTROLES, FIAT_VRAGEN, conclusieFormat } from './formats.js';
import { actorVoor, fiatBlokkade } from '../engine/beoordelingsrechten.js';
import { datumKort } from './layout.js';
import { ui, ordeJaren, ordeJarenOverzicht, ingeklapt } from './uistate.js';
import { voortgang, voortgangTelling } from './voortgang.js';
import { sparkSVG } from './spark.js';
import { renderBZI, bziKop, weergaveSchakelaar, hoofdbedrijven } from './bzi.js';
import {
  paneelRC, paneelLeningDirectie, paneelZK, paneelLoondienst, paneelNul,
  structuurVelden, rechtsvormOpties,
} from './panelen.js';
import { paneelOrganogram } from './organogram.js';
import { paneelGeldstromen, geldstromenTabel } from './geldstromen.js';
import { overwinstBlok } from './overwinst.js';
import { renderBziInvoer } from './bziinvoer.js';
import { beleidInvoer, beleidUitkomst } from './beleid.js';
import { renderDossierbeleid } from './dossierbeleid.js';
import { renderKerninvoer } from './kerninvoer.js';
import { renderAnalyseTabel, renderRekenwerkruimte, renderOndernemingBerekening, renderRekenInvoercontroles, renderUitkomstentabel } from './rekenwerkruimte.js';
import { dossierWerkbalk } from './dossierwerkbalk.js';
import { renderFiatBeoordeling } from './fiatbeoordeling.js';
import { renderBroncontrole } from './broncontrole.js';

export const TABS = [
  ['overzicht', 'Dossieroverzicht'],
  ['klant', 'Klantgegevens'],
  ['documenten', 'Documenten'],
  ['invoer', 'Cijfers invoeren'],
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
  ['Cijfers', ['invoer', 'balans', 'vw', 'diversen', 'ib', 'bziinvoer']],
  ['Beoordeling', ['berekening', 'notities', 'rapport', 'fiat']],
];
const dossierPad = (d, tab, ondId = '') => `#/dossier/${encodeURIComponent(d.id)}/${tab}${ondId ? `/${encodeURIComponent(ondId)}` : ''}`;

// Overgang tussen de weergaven: welk tabblad hoort bij welke stap.
export const NAAR_BZI = { klant: 'algemeen', balans: 'bedrijf', vw: 'bedrijf', diversen: 'bedrijf', bziinvoer: 'bziinvoer' };
export const NAAR_VIIZ = { algemeen: 'klant', bedrijven: 'klant', bedrijf: 'balans', boekhouders: 'notities', verplichtingen: 'klant', samenvatting: 'berekening', bziinvoer: 'bziinvoer' };

// ---------------------------------------------------------------------------
// Kop en tabbladen
// ---------------------------------------------------------------------------
export function dossierKop(d, r) {
  const adv = get(d.advieskantoorId);
  const isNul = d.soort === 'NUL';
  let label = 'Vastgesteld zakelijk inkomen';
  let toelichting = `Geldig voor bindende offertes t/m ${fmt.datum(r.geldigTot)}`;
  if (r.inkomensanalyse) {
    label = 'Inkomensanalyse';
    toelichting = 'Vergelijk de uitkomsten per toetskader.';
  } else if (isNul) {
    label = '0-verklaring';
    toelichting = r.nul?.maandlastCorrectie ? `Maandlastcorrectie € ${fmt.getal(r.nul.maandlastCorrectie)} per maand` : r.nul ? STATUS_TEKST[r.nul.status] : '';
  } else if (r.bron === 'afwijkend') {
    label = 'Afwijkend inkomen (gemotiveerd)';
    toelichting = `Berekend inkomen ${fmt.eur(r.berekend)}`;
  } else if (r.beleid) {
    label = r.beleid.bewijs ? 'Uitkomst op basis van bewijsstuk' : r.beleid.indicatie !== null || r.beleid.bedrag !== null ? 'Voorlopige rekenindicatie' : 'Uitkomst volgens toetskader';
    toelichting = `${r.kaderCfg.kort} · ${r.kaderVersie}`;
  } else if (r.bron === 'geen') {
    toelichting = 'Voorwaarden niet akkoord: geen zakelijk inkomen afgeven';
  } else if (r.bron === 'open') {
    label = 'Zakelijk inkomen';
    toelichting = 'Bekijk de open invoer bij Fiattering.';
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
        ${pil('neutraal', SOORTEN[d.soort] || d.soort)} ${r.inkomensanalyse ? '' : pil('neutraal', kaderLabel(r.kader))} ${statusPil(d.status)}${d.spoed ? ' <span class="badge-spoed">Spoed</span>' : ''}
        ${adv ? `<span>${esc(adv.naam)}</span>` : ''}
        <span>Berekeningsdatum ${esc(fmt.datum(r.datum))}</span>
        ${r.inkomensanalyse ? '' : `<span>Toetsjaren ${esc(r.T.join(', '))}${r.C ? ` + ${r.C}` : ''}</span>`}
      </div>
      <div class="kop-onder">${!r.inkomensanalyse && ['ABN', 'NHG'].includes(r.kader) ? weergaveSchakelaar(d, 'viiz') : ''}${voortgangKop(d, r)}</div>
    </div>
    <div class="toetsinkomen">
      <div class="label">${esc(label)} ${r.inkomensanalyse ? '' : pil(r.status, r.beleid && r.status === 'akkoord' ? 'Ter beoordeling' : undefined)}</div>
      ${r.inkomensanalyse ? '' : `<div class="bedrag">${isNul ? '€ 0' : r.beleid ? r.beleid.bedrag !== null || r.beleid.indicatie !== null ? esc(fmt.eur(r.beleid.bedrag ?? r.beleid.indicatie)) : r.beleid.methode === 'extern' ? 'Bewijsstuk nodig' : 'Invoer aanvullen' : r.bron === 'open' ? 'Nog te beoordelen' : esc(fmt.eur(r.vastgesteld))}</div>`}
      <div class="toelichting">${esc(toelichting)}</div>
    </div>
  </div>`;
}

/** Weergave van dit dossier, rekening houdend met de voorkeur van de gebruiker voor ABN AMRO-dossiers. */
export function weergaveDossier(d) {
  if (d.soort === 'ANALYSE' || !['ABN', 'NHG'].includes(kaderVoor(d).id)) return 'viiz';
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
    return `<a href="${dossierPad(d, k, PER_ONDERNEMING.includes(k) || k === 'invoer' ? ondId : '')}" class="${k === tab ? 'actief' : ''}"${k === tab ? ' aria-current="page"' : ''}${s ? ` title="${esc(s.tekst)}"` : ''}>${stip}${esc(TAB_LABEL[k])}${teller}${s ? `<span class="sr"> (${esc(STIP_TEKST[s.status])})</span>` : ''}</a>`;
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
    if (k !== 'invoer') return;
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

export function renderDossier(d, tab, ondId, r, { documenten, berekend = false } = {}) {
  const docs = documenten ?? dossierDocs(d);
  const bzi = weergaveDossier(d) === 'bzi';
  const onds = d.ondernemingen || [];
  const ond = onds.find((o) => o.id === ondId) || onds[0];
  if (!tab || tab === 'overzicht') {
    return `${kopVoor(d, r)}${bzi ? '' : `<div class="dossier-schil">${tabsHTML(d, 'overzicht', '', r, docs)}<div class="dossier-werkblad">`}
      ${dossierWerkbalk('Dossieroverzicht', { toonTitel: false })}
      <div id="tabinhoud">${tabOverzicht(d, r, docs, bzi)}</div>${bzi ? '' : '</div></div>'}`;
  }
  if (bzi) {
    const ontbrekend = r.documenten.filter((x) => x.verplicht && !docAanwezig(docs, x)).length;
    return renderBZI(d, NAAR_BZI[tab] || tab, ondId, r, {
      ontbrekend,
      documenten: () => tabDocumenten(d, r, docs),
      invoer: () => renderKerninvoer(d, ond, roosterJaren(d), r),
      ib: () => tabIB(d, r),
      berekening: () => tabBerekening(d, r, ondId, berekend),
      bziinvoer: () => renderBziInvoer(d, r),
      notities: () => tabNotities(d, r),
      rapport: () => renderRapportPagina(d, r),
      fiat: () => tabFiat(d, r, docs),
    });
  }
  const t = NAAR_VIIZ[tab] || tab;
  let inhoud;
  switch (t) {
    case 'invoer': inhoud = renderKerninvoer(d, ond, roosterJaren(d), r); break;
    case 'balans': inhoud = ond ? tabRooster(d, ond, 'balans', r) : geenOnderneming(d); break;
    case 'vw': inhoud = ond ? tabRooster(d, ond, 'vw', r) : geenOnderneming(d); break;
    case 'diversen': inhoud = ond ? tabRooster(d, ond, 'diversen', r) : geenOnderneming(d); break;
    case 'ib': inhoud = tabIB(d, r); break;
    case 'berekening': inhoud = tabBerekening(d, r, ondId, berekend); break;
    case 'bziinvoer': inhoud = renderBziInvoer(d, r); break;
    case 'rapport': inhoud = renderRapportPagina(d, r); break;
    case 'documenten': inhoud = tabDocumenten(d, r, docs); break;
    case 'notities': inhoud = tabNotities(d, r); break;
    case 'fiat': inhoud = tabFiat(d, r, docs); break;
    default: inhoud = tabKlant(d, r);
  }
  const tabGeldig = TABS.some(([k]) => k === t) ? t : 'klant';
  const keuzeOnd = PER_ONDERNEMING.includes(t) && onds.length > 1
    ? `<div class="ondkeuze geen-print">${onds.map((o) => `<a href="#/dossier/${esc(d.id)}/${t}/${esc(o.id)}" class="${o.id === ond?.id ? 'actief' : ''}">${esc(o.naam || '(naamloos)')}</a>`).join('')}</div>` : '';
  return `${dossierKop(d, r)}<div class="dossier-schil">${tabsHTML(d, tabGeldig, ond?.id, r, docs)}<div class="dossier-werkblad">${keuzeOnd}
    ${dossierWerkbalk(TAB_LABEL[tabGeldig], { toonTitel: t !== 'rapport' })}
    <div id="tabinhoud">${inhoud}</div>${stapNav(d, tabGeldig, ond?.id)}</div></div>`;
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
  const vervolg = { klant: 'Klantgegevens aanvullen', documenten: 'Stukken controleren', balans: 'Balans controleren', vw: 'V&W controleren', ib: 'IB-gegevens aanvullen', berekening: 'Berekening bekijken', notities: 'Onderbouwing vastleggen', fiat: 'Naar fiattering', rapport: 'Rapport openen' };
  const bevindingen = (r.meldingen || []).filter((m) => m.niveau === 'niet_akkoord' || m.niveau === 'attentie');
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
          ${detailLink('invoer', 'Cijfers invoeren', 'reken')}${volgende !== 'rapport' ? detailLink('rapport', 'Rapport', 'document') : ''}</div>
      </div>
      <div class="overzicht-meters">
        <div><span>Invoer compleet</span><strong>${klaar}<small> / ${totaal}</small></strong>
          <progress max="${totaal || 1}" value="${klaar}" aria-label="Invoer compleet"></progress></div>
        <div><span>Verplichte stukken ontbreken</span><strong>${v.documenten?.teller || 0}</strong>
          <a href="${href('documenten')}">Bekijk stukken ${icoon('rechts')}</a></div>
        <div><span>Rekenmeldingen</span><strong>${bevindingen.length}</strong>
          <a href="${href('fiat')}">Bekijk controles bij Fiattering ${icoon('rechts')}</a></div>
      </div>
    </section>
    <div class="overzicht-kolommen">
      ${groep('Aanvraag en cijfers', ['klant', 'documenten', 'balans', 'vw', 'ib'])}
      <div class="overzicht-stapel">
        ${groep('Beoordeling', ['berekening', 'notities', 'fiat'])}
      </div>
    </div>
    <section class="paneel overzicht-ondernemingen"><h2>Ondernemingen</h2>
      ${onds.length ? `<ul>${onds.map((o) => {
        return `<li><a href="${dossierPad(d, bzi ? 'bedrijf' : 'balans', o.id)}">${icoon('gebouw')}
          <span><strong>${esc(o.naam || 'Naamloze onderneming')}</strong><small>${esc(RECHTSVORMEN[o.rechtsvorm]?.label || o.rechtsvorm || '')}</small></span>
          ${icoon('rechts')}</a></li>`;
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

  const aanvraag = `<section class="paneel"><h2>Aanvraag</h2>${renderDossierbeleid(d)}<div class="raster-3">
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
      hint: kader.beleid ? 'Controleer of de geselecteerde boekjaren passen bij de beleidsroute.' : `Definitieve cijfers vorig jaar verplicht vanaf ${kader.definitiefVerplichtVanaf.d}-${kader.definitiefVerplichtVanaf.m}.` })}
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
    ${d.soort === 'NUL' || (d.ondernemingen || []).some((o) => o.meenemen === false || o.nulInkomen) ? paneelNul(d) : ''}`);
  return `<div class="intake-basis">${aanvraag}${aanvrager}</div>
    ${r.inkomensanalyse ? '' : beleidInvoer(d, r)}
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
function kaderParameters(d, kader, { render = true } = {}) {
  const over = d.instellingen?.kaderParams?.[kader.id] || {};
  const basis = KADERS[kader.id];
  const velden = kader.instelbaar.map((pad) => {
    const [label, eenheid] = PARAM_LABELS[pad] || [pad, 'getal'];
    const std = leesPad(basis, pad);
    const stdTekst = eenheid === 'pct' ? `${String(Math.round(std * 1000) / 10).replace('.', ',')}%` : String(std).replace('.', ',');
    const raw = over[pad] ?? leesPad(over, pad);
    return veld(`${label}${eenheid === 'pct' ? ' (%)' : ''}`, `instellingen.kaderParams.${kader.id}.${pad}`, raw ?? '',
      { type: eenheid === 'pct' ? 'pct' : 'getal', render, placeholder: stdTekst, hint: `Standaard ${stdTekst}` });
  }).join('');
  const aantal = Object.keys(kader.aangepast || {}).length;
  return `<details class="stappen" style="margin-top:14px"${aantal ? ' open' : ''}><summary>Parameters ${esc(kader.kort)}${aantal ? ` (${aantal} aangepast)` : ' (standaard)'}</summary>
    <div class="inhoud"><p class="dempen klein">Laat een veld leeg voor de standaardwaarde. Aangepaste parameters staan in de rekenstappen en het rapport.</p><div class="raster-3">${velden}</div></div></details>`;
}

export function renderAnalyseKaderKeuzes(d, id) {
  const kader = kaderVoor(id, d.instellingen);
  if (kader.beleid || !Object.hasOwn(KADERS, id)) return '';
  const algemeen = d.instellingen || {};
  const lokaal = algemeen.analyseKaders?.[id] || {};
  const inst = { ...algemeen, ...lokaal };
  const prefix = `instellingen.analyseKaders.${id}`;
  const velden = [];
  if (kader.vervangenVanaf && id === 'NHG') velden.push(vink('Oudste toetsjaar vervangen', `${prefix}.vervangOudsteJaar`, !!inst.vervangOudsteJaar));
  if (kader.box2?.model === 'NHG') velden.push(keuze('Box 2-route', `${prefix}.box2Route`, {
    route1: 'Uitgekeerd dividend', route2: 'Niet-uitgekeerde winst', combinatie: 'Combinatie', geen: 'Geen box 2',
  }, inst.box2Route || 'route1'));
  if (id === 'ABN') {
    velden.push(vink('Uitgekeerd dividend meenemen', `${prefix}.abnDividend.uitgekeerd`, (lokaal.abnDividend?.uitgekeerd ?? algemeen.abnDividend?.uitgekeerd) !== false));
    velden.push(keuze('ABN AMRO-bronmethode', `${prefix}.abnVaststelling`, { standaard: 'Standaard Woonbeleid', horizontaal: 'Horizontaal', verticaal: 'Verticaal' }, inst.abnVaststelling || (d.abnGroep ? 'horizontaal' : 'standaard')));
  }
  if (['ASN', 'KNAB', 'OPT'].includes(id)) velden.push(vink('Relevant voorafgaand dienstverband', `${prefix}.relevantDienstverband`, !!inst.relevantDienstverband));
  if (id === 'ASN') velden.push(vink('Trackrecord bij dezelfde onderneming bevestigd', `${prefix}.trackrecordZelfdeOnderneming`, !!inst.trackrecordZelfdeOnderneming));
  if (kader.beletRegel || kader.incidentRegel) {
    const belet = { ...algemeen.belet, ...lokaal.belet };
    velden.push(vink(kader.incidentRegel ? 'Incidenteel jaar toepassen' : 'Beletperiode toepassen', `${prefix}.belet.actief`, !!belet.actief));
    const { T } = bepaalJaren({ ...d, kader: id, metNhg: false, soort: 'IKV' });
    velden.push(keuze('Jaar van het belet', `${prefix}.belet.jaar`, T.map((y) => String(y)), belet.jaar, { type: 'getal', leeg: 'Kies' }));
    velden.push(veld('Oorzaak', `${prefix}.belet.oorzaak`, belet.oorzaak));
    velden.push(tekstvak('Motivatie en stukken', `${prefix}.belet.motivatie`, belet.motivatie, { rijen: 2 }));
  }
  if (!velden.length && !kader.instelbaar?.length) return '';
  return `<section class="paneel beleid-invoer" data-analyse-invoer><h3>Rekenkeuzes ${esc(kader.kort)}</h3>
    ${velden.length ? `<div class="raster-3">${velden.join('')}</div>` : ''}
    ${kader.instelbaar?.length ? kaderParameters(d, kader, { render: false }) : ''}</section>`;
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
        ${soort === 'VPB' ? vink('Zelfstandig bevoegd om dividend uit te keren (zeggenschap aangetoond)', `${b}.zeggenschap`, !!o.zeggenschap, { render: true }) : ''}
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
    diversen: `Correcties volgen ${r.inkomensanalyse ? 'het kader per rekenuitkomst' : `het gekozen kader (${kaderLabel(r.kader)})`}. Laat incidentele baten/lasten leeg om de bijzondere posten uit de V&W te gebruiken.`,
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
  const dga = r.kader === 'ABN' && (d.ondernemingen || []).some((o) => soortOndernemer(o.rechtsvorm) === 'VPB');
  if (dga) {
    body += `<tr class="kop"><td colspan="${jaren.length + 1}">Gezamenlijk DGA-loon van de aanvrager</td></tr>`;
    for (const [k, label] of [['loon', 'Gezamenlijk bruto DGA-loon'], ['bijtelling', 'Bijtelling privégebruik auto (gezamenlijk)']]) {
      body += `<tr><th class="ind1" scope="row">${label}</th>${jaren.map((y) => `<td class="invoer">${bedrag(`ib.${y}.dgaGezamenlijk.${k}`, bronDgaGezamenlijk(d, y)?.[k], { label: `${label} ${y}` })}</td>`).join('')}</tr>`;
    }
    for (const [k, label] of [['van', 'Gezamenlijk DGA-loon vanaf'], ['tot', 'Gezamenlijk DGA-loon tot en met']]) {
      body += `<tr><th class="ind1" scope="row">${label}</th>${jaren.map((y) => y === kandidaatC
        ? `<td>${veld(`${label} ${y}`, `ib.${y}.dgaGezamenlijk.${k}`, bronDgaGezamenlijk(d, y)?.[k], { type: 'datum' })}</td>` : '<td></td>').join('')}</tr>`;
    }
  }
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
    ${dga ? '<p class="dempen klein">Vul bij ABN AMRO de gezamenlijke bedragen in als de bron alleen een totaal vermeldt. Vul de bijtelling met 0 in als er geen bijtelling was. Als je ook bedragen per onderneming invult, moeten beide reeksen aansluiten.</p>' : ''}
    ${s.length ? `<div style="margin-bottom:8px">${s.map((x) => melding('info', `DGA-inkomen ${esc(String(x.jaar))} uit de salarisstrook${x.strookTm ? ` (t/m ${esc(x.strookTm)})` : ''}: ${esc(x.f)}`)).join('')}</div>` : ''}
    <div class="scroll"><table class="rooster"><thead>${kop}</thead><tbody>${body}</tbody></table></div></div>`;
}

// ---------------------------------------------------------------------------
// Berekening
// ---------------------------------------------------------------------------
export function inkomensTabel(d, r) {
  if (d.soort === 'NUL') return '';
  if (r.beleid) return beleidUitkomst(d, r);
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
  const dgaGezamenlijk = ink.dgaGezamenlijk;
  const dgaRij = dgaGezamenlijk ? `<tr><th scope="row">DGA-loon op aanvragerniveau</th><td>${dgaGezamenlijk.inUitkomst ? '' : 'Ter controle'}</td>
    ${TO.map((y) => `<td class="num">${fmt.eur(dgaGezamenlijk.perJaar[y]?.inkomen)}</td>`).join('')}
    <td class="num">${fmt.eur(dgaGezamenlijk.berekend)}</td><td></td><td class="num">${dgaGezamenlijk.inUitkomst ? fmt.eur(dgaGezamenlijk.berekend) : '—'}</td>
    <td class="num">${dgaGezamenlijk.inUitkomst ? fmt.eur(dgaGezamenlijk.toetsinkomen) : '—'}</td><td class="num">${dgaGezamenlijk.inUitkomst ? fmt.eur(dgaGezamenlijk.berekend) : '—'}</td></tr>` : '';
  const rijen = ink.perHoofdbedrijf.map((o) => {
    const groep = o.groep.slice(1).map((id) => r.ondernemingen.find((a) => a.id === id)?.naam).filter(Boolean);
    const loonGezamenlijk = o.soort === 'VPB' && dgaGezamenlijk?.inUitkomst;
    return `<tr><td><b>${esc(o.naam)}</b><div class="dempen klein">${esc(o.nul ? '0-inkomen' : o.categorie)}${groep.length ? `; met ${esc(groep.join(', '))}` : ''}</div></td>
      <td>${o.nul ? pil('info', '0-inkomen') : pil(o.toetsStatus, o.voldoet ? 'Voldoet' : 'Voldoet niet')}</td>
      ${TO.map((y) => `<td class="num${o.perJaar[y]?.meegeteld ? '' : ' dempen'}">${loonGezamenlijk ? '—' : fmt.eur(o.perJaar[y]?.inkomen ?? 0)}${o.perJaar[y]?.dividend ? `<div class="dempen klein">div. ${fmt.getal(o.perJaar[y].dividend)}</div>` : ''}</td>`).join('')}
      <td class="num">${loonGezamenlijk ? '—' : fmt.eur(o.bziInkomen)}</td><td class="num">${o.bziDividend ? fmt.eur(o.bziDividend) : ''}</td><td class="num"><b>${fmt.eur(o.nul ? 0 : loonGezamenlijk ? o.bziDividend : o.berekend)}</b></td>
      <td class="num">${o.nul ? '' : fmt.eur(loonGezamenlijk ? o.box2 : o.woonbeleid)}${o.overwinstMee ? `<div class="dempen klein">incl. overwinst ${fmt.getal(o.overwinstMee)}</div>` : ''}</td><td class="num">${fmt.eur(loonGezamenlijk ? o.bziDividend : o.bijdrage)}${o.bron === 'afwijkend' ? '<div class="dempen klein">afwijkend</div>' : ''}</td></tr>`;
  }).join('');
  return `<div class="scroll"><table class="tabel"><thead><tr><th>Hoofdbedrijf (met deelnemingen)</th><th>Toetskader</th>
    ${TO.map((y) => `<th class="num">${y}</th>`).join('')}<th class="num">Gem. inkomen</th><th class="num">Gem. dividend</th><th class="num">Berekend (BZI)</th><th class="num">Toets Woonbeleid</th><th class="num">Af te geven</th></tr></thead>
    <tbody>${dgaRij}${rijen}${ink.row ? `<tr><td>Resultaat uit overige werkzaamheden</td><td></td>${T.map(() => '<td></td>').join('')}<td></td><td></td><td class="num">${fmt.eur(ink.row)}</td><td class="num">${fmt.eur(ink.row)}</td><td class="num">${fmt.eur(ink.row)}</td></tr>` : ''}
    <tr class="totaal"><td colspan="${2 + T.length + 2}">Totaal</td><td class="num">${fmt.eur(r.berekend) || '—'}</td><td class="num">${fmt.eur(r.toetsinkomen) || '—'}</td><td class="num">${fmt.eur(r.vastgesteld) || 'Nog niet vastgesteld'}</td></tr>
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
  const st = (key) => a.checks.find((c) => c.key === key)?.status || (r.beleid ? 'nvt' : 'akkoord');
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
  const st = (a, key) => a.checks.find((c) => c.key === key)?.status || (r.beleid ? 'nvt' : 'akkoord');
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

/** Geselecteerd kader uit de rekenuitkomst. */
function beoordelingskader(r) {
  return `<p class="dempen" data-beoordelingskader="${esc(r.kader)}"><b>Toetskader</b> ${esc(r.kaderCfg.kort)} · ${esc(r.kaderVersie)}</p>`;
}

/** Alle uitkomsten op dezelfde invoer, beschikbaar voor een inkomensanalyse. */
export function methodenTabel(d, r, { kop = true } = {}) {
  if (!r.inkomensanalyse) return '';
  return `<div data-inkomensanalyse>${kop ? '<h3>Uitkomsten per toetskader</h3>' : ''}${renderAnalyseTabel(d)}</div>`;
}

/** Schakelaar voor de formules in de rekenstappen en de knoppen om alles in of uit te klappen. */
export function weergaveOpties({ formules = true } = {}) {
  return `<div class="subnav-opties">
    ${formules ? `<label class="schakel" title="Formules onder de bedragen in de rekenstappen tonen of verbergen"><input type="checkbox" data-actie="formules"${ui.formules ? ' checked' : ''}><span>Formules</span></label>` : ''}
    <button type="button" class="knop link klein" data-actie="alles-klap" data-stand="uit" title="Alles uitklappen">${icoon('uitklappen')}<span>Alles uit</span></button>
    <button type="button" class="knop link klein" data-actie="alles-klap" data-stand="in" title="Alles inklappen">${icoon('inklappen')}<span>Alles in</span></button>
  </div>`;
}

function tabBerekening(d, r, ondId, berekend) {
  const a = ondId && r.ondernemingen.find((o) => o.id === ondId);
  if (!a) return renderRekenwerkruimte(d, r, { berekend });
  const over = a.box2?.overwinst ? `<details class="stappen reken-uitklap"><summary>Berekening overwinst</summary><div class="reken-uitklap-inhoud">${overwinstBlok(d, r, a)}</div></details>` : '';
  const stroom = r.inkomen?.geldstromen?.filter((x) => x.van === a.id || x.naar === a.id);
  const geld = stroom?.length ? `<details class="stappen reken-uitklap"><summary>Geldstromen van de onderneming</summary><div class="reken-uitklap-inhoud">${geldstromenTabel(r, stroom)}</div></details>` : '';
  return renderOndernemingBerekening(d, r, a, { details: over + geld, weergave: weergaveOpties() });
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
  const docRijen = [...docs].sort((a, b) => String(b.aangemaakt).localeCompare(String(a.aangemaakt))).map((x) => {
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
    <div class="acties" style="margin-top:12px"><button class="knop" data-actie="doc-upload">Toevoegen</button><span class="dempen klein">Klik op Opslaan om de documenten te bewaren.</span></div>
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
  const bh = n.boekhouder || {};
  const blokTekst = (titel, pad, waarde, format, rijen = 8, extra = '') => `<div class="paneel"><div class="paginakop" style="margin:0 0 6px"><h2>${esc(titel)}</h2><span class="acties">${extra}${format ? formatKnop(pad, format) : ''}</span></div>
    <textarea rows="${rijen}" data-bind="${esc(pad)}" data-type="tekst" data-template="${esc(format || '')}" placeholder="${esc(format ? FORMATS[format] || '' : '')}" aria-label="${esc(titel)}">${esc(waarde || '')}</textarea></div>`;
  return `
    ${r.inkomensanalyse ? `<section class="paneel">${methodenTabel(d, r)}</section>` : beoordelingskader(r)}
    ${blokTekst('Algemene informatie en organogram', 'notities.algemeen', n.algemeen, 'algemeen', 10, '<button class="knop link klein" data-actie="organogram-invoegen">Organogram invoegen</button>')}
    ${(d.ondernemingen || []).map((o) => blokTekst(`Financiële informatie: ${o.naam || 'onderneming'}`, `notities.financieelOnderneming.${o.id}`, n.financieelOnderneming?.[o.id], 'financieelOnderneming', 9,
      `<button class="knop link klein" data-actie="concept-financieel" data-ond="${esc(o.id)}">Concept uit invoer</button>`)).join('')}
    ${blokTekst('Financiële informatie ondernemer in privé', 'notities.priveTekst', n.priveTekst, 'prive', 8)}
    ${blokTekst('Kredietbestemming en aflossing', 'notities.kredietbestemming', n.kredietbestemming, 'kredietbestemming', 4)}
    ${blokTekst('Conclusie', 'notities.conclusie', n.conclusie, r.inkomensanalyse ? null : conclusieFormat(d, r), 9)}
    ${blokTekst('Bijlagen en stukkenlijst', 'notities.bijlagen', n.bijlagen, 'bijlagen', 7)}
    <div class="paneel"><h2>Boekhoudgegevens</h2><div class="raster-3">
      ${keuze('Boekhouder', 'notities.boekhouder.optie', { 1: 'Boekhouder aanwezig', 2: 'Geen gegevens van de boekhouder', 3: 'Geen boekhouder, klant doet zelf aangifte' }, bh.optie || '1', { render: true })}
    </div>
    ${(bh.lijst || []).map((x, i) => `<div class="raster-3" style="margin-top:10px">${veld('Naam boekhoudkantoor', `notities.boekhouder.lijst.${i}.naam`, x.naam)}${veld('KvK-nummer boekhoudkantoor', `notities.boekhouder.lijst.${i}.kvk`, x.kvk)}</div>`).join('')}
    <div class="acties" style="margin-top:10px"><button class="knop sec klein" data-actie="boekhouder-toevoegen">Boekhouder toevoegen</button></div></div>`;
}

// ---------------------------------------------------------------------------
// Fiattering en historie
// ---------------------------------------------------------------------------
function renderBroncontroles(d) {
  const n = d.notities || {};
  return `<div class="paneel"><h2>Broncontroles</h2><div class="raster-2">
      ${tekstvak('Insolventieregister en beroepsregisters (BIG/LRK/NBA/NOvA/KNB): datum en resultaat', 'notities.broncontroles', n.broncontroles, { rijen: 3 })}
      ${tekstvak('KvK-adrescheck (zakelijk en privé)', 'notities.kvkCheck', n.kvkCheck, { rijen: 3 })}
      ${tekstvak('Google check: website, social media, herkomst omzet en conclusie', 'notities.googleCheck', n.googleCheck, { rijen: 4 })}
    </div></div>
    <div class="paneel"><h2>Maatschappijspecifieke controles</h2><div class="raster-2">
      ${CONTROLES.map(([k, l]) => keuze(l, `notities.controles.${k}`, ['Ja', 'Nee', 'N.v.t.'], n.controles?.[k], { leeg: 'Kies' })).join('')}
    </div><div class="acties">${vink('Dossier voorleggen aan KYC', 'notities.kyc', !!n.kyc)}</div></div>`;
}

function renderOpenOnderbouwing(d) {
  const perOnderneming = d.notities?.openOnderbouwingPerOnderneming || {};
  const ondernemingen = d.ondernemingen || [];
  return `<section class="paneel" id="fiat-open-onderbouwing" aria-labelledby="fiat-open-titel">
    <h2 id="fiat-open-titel">Openstaande onderbouwing</h2>
    ${tekstvak('Dossierbreed', 'notities.openOnderbouwingDossier', d.notities?.openOnderbouwingDossier, { rijen: 7, hint: 'Leg vast welke stukken of aansluitingen nog nodig zijn voor de beoordeling.' })}
    ${ondernemingen.map((o) => `<details class="stappen"${perOnderneming[o.id] ? ' open' : ''}>
      <summary>${esc(o.naam || 'Onderneming')}</summary><div class="inhoud">${tekstvak(`Nog nodig · ${o.naam || 'Onderneming'}`, `notities.openOnderbouwingPerOnderneming.${o.id}`, perOnderneming[o.id], { rijen: 5 })}</div>
    </details>`).join('')}
  </section>`;
}

function tabFiat(d, r, docs) {
  const uitkomsten = renderUitkomstentabel(d, r, { controles: true });
  const controles = `${renderOpenOnderbouwing(d)}${renderBroncontrole(d, r)}${renderRekenInvoercontroles(d, rekenInvoerStatus(d, r))}${renderFiatBeoordeling(d, r, docs, { broncontroles: renderBroncontroles(d) })}`;
  if (r.inkomensanalyse) {
    return `${uitkomsten}<section class="paneel"><p>Kies en bewaar één toetskader bij <a href="${dossierPad(d, 'klant')}">Klantgegevens</a> om een inkomensbeoordeling te fiatteren.</p></section>${controles}`;
  }
  const f = d.fiat || {};
  const actor = actorVoor(state.profiel, state.me);
  const blokkade1 = fiatBlokkade(actor, d, 1);
  const blokkade2 = fiatBlokkade(actor, d, 2);
  const antwoorden = f.tweede?.antwoorden || {};
  const afgerond = AFGEROND.includes(d.status);
  const eerste = `<div class="paneel"><h2>Eerste beoordeling</h2>
    ${f.eerste ? `<p>Gereed gemeld door <b>${esc(f.eerste.naam)}</b> op ${esc(fmt.tijdstip(f.eerste.datum))}.</p>${f.eerste.opmerking ? `<p class="dempen">${esc(f.eerste.opmerking)}</p>` : ''}` : '<p class="dempen">Nog niet gereed gemeld.</p>'}
    ${d.teruggezet && d.status === 'beoordeling_1' ? melding('attentie', 'Dit dossier is na de tweede beoordeling teruggezet. Verwerk de bevindingen en meld opnieuw gereed.') : ''}
    ${afgerond || d.status === 'beoordeling_2' ? '' : `
      ${tekstvak('Opmerking bij gereed melden', 'fiat.concept1', f.concept1, { rijen: 2 })}
      <div class="acties" style="margin-top:10px"><button class="knop" data-actie="gereed-melden"${blokkade1 ? ' disabled' : ''}>Gereedmelden (naar 2e beoordeling)</button>
      ${blokkade1 ? `<span class="dempen klein">${esc(blokkade1)}</span>` : ''}</div>`}
  </div>`;
  const tweede = `<div class="paneel"><h2>Tweede beoordeling (vier ogen)</h2>
    ${f.tweede?.resultaat ? `<p>${f.tweede.resultaat === 'akkoord' ? pil('akkoord', 'Definitief akkoord') : pil('niet_akkoord', 'Niet akkoord')} door <b>${esc(f.tweede.naam)}</b> op ${esc(fmt.tijdstip(f.tweede.datum))}.</p>${f.tweede.opmerking ? `<p class="dempen">${esc(f.tweede.opmerking)}</p>` : ''}` : ''}
    ${d.status === 'beoordeling_2' ? `
      ${blokkade2 ? melding('attentie', esc(blokkade2)) : `
      <div class="voorwaarden" style="margin-top:10px">${FIAT_VRAGEN.map(([k, l]) => `<div class="voorwaarde"><b>${esc(l)}</b>
        <div>${keuze(null, `fiat.tweede.antwoorden.${k}.antwoord`, ['Ja', 'Nee', 'N.v.t.'], antwoorden[k]?.antwoord, { leeg: 'Kies' })}</div>
        <div><input type="text" placeholder="Motivatie" value="${esc(antwoorden[k]?.motivatie || '')}" data-bind="fiat.tweede.antwoorden.${k}.motivatie" data-type="tekst" style="width:100%" aria-label="Motivatie"></div></div>`).join('')}</div>
      <div style="margin-top:10px">${tekstvak('Opmerking', 'fiat.tweede.opmerking', f.tweede?.opmerking, { rijen: 2 })}</div>
      <div class="acties" style="margin-top:10px">
        <button class="knop" data-actie="fiat-akkoord">Akkoord geven</button>
        <button class="knop gevaar" data-actie="fiat-niet-akkoord">Niet akkoord, terug naar 1e beoordeling</button>
      </div>`}` : '<p class="dempen">De tweede beoordeling is mogelijk zodra het dossier gereed is gemeld (status "2e beoordeling").</p>'}
  </div>`;
  const historie = `<div class="paneel"><h2>Historie</h2>
    ${(d.historie || []).length ? `<table class="tabel"><thead><tr><th>Tijdstip</th><th>Door</th><th>Actie</th></tr></thead><tbody>${d.historie.map((h) => `<tr><td class="nowrap">${esc(fmt.tijdstip(h.at))}</td><td>${esc(h.door)}</td><td>${esc(/^Toetskader gewijzigd\b/i.test(h.actie) ? 'Toetskader gewijzigd' : h.actie)}</td></tr>`).join('')}</tbody></table>` : '<p class="dempen">Nog geen historie.</p>'}
    <div class="acties" style="margin-top:12px"><button class="knop sec" data-actie="toon-versies">Eerdere versies van dit dossier</button></div>
    <div id="versies"></div>
  </div>`;
  return `${beoordelingskader(r)}${uitkomsten}${controles}${eerste}${tweede}${historie}`;
}

export { hoofdbedrijven };
