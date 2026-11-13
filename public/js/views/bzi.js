// Dossierschil in de opbouw van de rekentool van de bank (BZI): stappen links (Algemeen,
// Bedrijven, per bedrijf de resultaten, Boekhouders, Samenvatting), invoer per jaar in kolommen,
// correcties via een pop-up en de notitievelden rechts. ZIB voegt de toetsing uit het Woonbeleid,
// geldstromen binnen de structuur, verplichtingen en de vier-ogencontrole toe.
import { esc, fmt, naamAanvrager, num, isIngevuld, getPath } from '../util.js';
import { lijst } from '../state.js';
import { bepaalJaren } from '../engine/index.js';
import { RECHTSVORMEN, soortOndernemer, BEROEPSGROEPEN, SOORTEN, kaderLabel, solvNorm } from '../engine/kaders.js';
import { DOSSIER_STATUSSEN, JAAR_STATUSSEN } from '../schema/fields.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES, typesVoor } from '../schema/correcties.js';
import { heeftBalans, heeftVW } from '../engine/financieel.js';
import { pil, bedrag, veld, keuze, vink, melding, leeg, chip, kengetal, icoon, tekstvak } from './ui.js';
import { ui, ordeJaren, ordeJarenOverzicht } from './uistate.js';
import { FORMATS, NOTITIE_VELDEN, conclusieFormat } from './formats.js';
import {
  paneelRC, paneelLeningDirectie, paneelZK, paneelLoondienst, paneelNul, rechtsvormOpties,
} from './panelen.js';
import { paneelOrganogram } from './organogram.js';
import { paneelGeldstromen, geldstromenTabel } from './geldstromen.js';
import { overwinstBlok } from './overwinst.js';
import { renderDossierbeleid } from './dossierbeleid.js';

const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// ---------------------------------------------------------------------------
// Structuur: hoofdbedrijven en de (primaire) boom van deelnemingen
// ---------------------------------------------------------------------------
export function hoofdbedrijven(d) {
  const ids = new Set((d.ondernemingen || []).map((o) => o.id));
  return (d.ondernemingen || []).filter((o) => !o.parentId || !ids.has(o.parentId));
}

/** Deelnemingen onder een bedrijf via de primaire aandeelhouder, diepte-eerst. */
export function deelnemingenVan(d, id, diepte = 1, pad = new Set([id])) {
  const uit = [];
  (d.ondernemingen || []).filter((o) => o.parentId === id && !pad.has(o.id)).forEach((o) => {
    uit.push({ o, diepte });
    uit.push(...deelnemingenVan(d, o.id, diepte + 1, new Set([...pad, o.id])));
  });
  return uit;
}

export function hoofdVan(d, id) {
  const byId = new Map((d.ondernemingen || []).map((o) => [o.id, o]));
  let o = byId.get(id);
  const gezien = new Set();
  while (o?.parentId && byId.has(o.parentId) && !gezien.has(o.id)) { gezien.add(o.id); o = byId.get(o.parentId); }
  return o || null;
}

function stappen(d) {
  const lijstStappen = [['algemeen', '', 'Algemeen'], ['bedrijven', '', 'Bedrijven']];
  hoofdbedrijven(d).forEach((h) => {
    lijstStappen.push(['bedrijf', h.id, h.naam || '(naamloos)']);
    deelnemingenVan(d, h.id).forEach(({ o }) => lijstStappen.push(['bedrijf', o.id, o.naam || '(naamloos)']));
  });
  lijstStappen.push(['boekhouders', '', 'Boekhouders'], ['verplichtingen', '', 'Geldstromen en verplichtingen'], ['samenvatting', '', 'Samenvatting']);
  return lijstStappen;
}

function stapHref(d, s, id) {
  return `#/dossier/${esc(d.id)}/${s}${id ? `/${esc(id)}` : ''}`;
}

function navKnoppen(d, stap, ondId) {
  const l = stappen(d);
  const i = l.findIndex(([s, id]) => s === stap && (id || '') === (ondId || ''));
  const vorige = i > 0 ? l[i - 1] : null;
  const volgende = i >= 0 && i < l.length - 1 ? l[i + 1] : null;
  return `<div class="bzi-nav geen-print">
    ${vorige ? `<a class="knop sec" href="${stapHref(d, vorige[0], vorige[1])}">${icoon('links')}Vorige</a>` : '<span></span>'}
    ${volgende ? `<a class="knop" href="${stapHref(d, volgende[0], volgende[1])}">Volgende${icoon('rechts')}</a>` : (stap === 'samenvatting' ? '<button class="knop" data-actie="gereed-melden">Gereedmelden</button>' : '')}
  </div>`;
}

// ---------------------------------------------------------------------------
// Schil
// ---------------------------------------------------------------------------
export function bziKop(d, r) {
  if (r.inkomensanalyse) {
    return `<div class="bzi-kop" id="dossierkop">
      <div class="bzi-kop-naam"><b>${esc(naamAanvrager(d.aanvrager))}</b>
        <span class="dempen">${esc(d.nummer || '')}</span> ${pil('neutraal', 'Inkomensanalyse')}</div>
      ${weergaveSchakelaar(d)}
    </div>`;
  }
  const isNul = d.soort === 'NUL';
  const ink = r.inkomen;
  const ph = ink?.perHoofdbedrijf || [];
  const voldoet = r.familie !== 'ABN' ? r.status !== 'niet_akkoord' : ph.every((x) => x.nul || x.voldoet);
  let label = 'Berekend inkomen';
  let bedragTekst = isNul ? '€ 0' : fmt.eur(r.vastgesteld);
  let sub = '';
  if (isNul) { label = '0-verklaring'; sub = r.nul?.maandlastCorrectie ? `Maandlastcorrectie € ${fmt.getal(r.nul.maandlastCorrectie)} per maand` : ''; }
  else if (r.bron === 'afwijkend') { label = 'Afwijkend inkomen'; sub = `Berekend ${fmt.eur(r.berekend)}`; }
  else if (r.bron === 'geen') { label = 'Af te geven inkomen'; sub = r.berekend > 0 ? `Geen inkomen af te geven (berekend ${fmt.eur(r.berekend)})` : 'Geen inkomen af te geven'; bedragTekst = fmt.eur(0); }
  else if (r.bron === 'nul') { label = '0-inkomen afgegeven'; }
  else if (r.familie === 'ABN' && r.toetsinkomen !== r.berekend) sub = `Toetsinkomen Woonbeleid ${fmt.eur(r.toetsinkomen)}`;
  else if (r.familie !== 'ABN') sub = `Toetsinkomen ${kaderLabel(r.kader)}`;
  return `<div class="bzi-kop" id="dossierkop">
    <div class="bzi-kop-naam"><b>${esc(naamAanvrager(d.aanvrager))}</b>
      <span class="dempen">${esc(d.nummer || '')}</span> ${pil('neutraal', SOORTEN[d.soort] || d.soort)} ${pil('neutraal', r.kader === 'NHG' ? 'Met NHG' : `${kaderLabel(r.kader)} zonder NHG`)}</div>
    <div class="bzi-kop-inkomen">
      ${isNul ? '' : `<span class="badge-toets ${voldoet ? 'ok' : 'nok'}">${voldoet ? 'Voldoet aan toetskader' : 'Voldoet niet aan toetskader'}</span>`}
      <span class="badge-inkomen"><span>${esc(label)}</span><b>${esc(bedragTekst.replace('€ ', ''))}</b></span>
      ${sub ? `<span class="dempen klein">${esc(sub)}</span>` : ''}
    </div>
    ${weergaveSchakelaar(d)}
  </div>`;
}

export function weergaveSchakelaar(d, huidig = 'bzi') {
  return `<div class="weergave geen-print" role="group" aria-label="Weergave">
    <button type="button" class="${huidig === 'bzi' ? 'actief' : ''}" data-actie="weergave" data-weergave="bzi" title="Stappen en invoer per jaar zoals in de rekentool van de bank">BZI</button>
    <button type="button" class="${huidig === 'viiz' ? 'actief' : ''}" data-actie="weergave" data-weergave="viiz" title="Tabbladen met de volledige balans, W&V en uitgebreide rapportage">ViiZ</button>
  </div>`;
}

function zijbalk(d, stap, ondId, r, docsOntbrekend) {
  const status = DOSSIER_STATUSSEN[d.status] || d.status;
  const link = (s, id, label, ico, extra = '') => `<a href="${stapHref(d, s, id)}" class="${s === stap && (s === 'invoer' || (id || '') === (ondId || '')) ? 'actief' : ''} ${extra}">${ico ? icoon(ico) : ''}<span>${esc(label)}</span></a>`;
  const analyse = (id) => r.ondernemingen.find((a) => a.id === id);
  const boom = hoofdbedrijven(d).map((h) => {
    const kinderen = deelnemingenVan(d, h.id);
    const a = analyse(h.id);
    return `${link('bedrijf', h.id, h.naam || '(naamloos)', 'gebouw', `hoofd ${a?.status || ''}`)}
      ${kinderen.map(({ o, diepte }, i) => `<a href="${stapHref(d, 'bedrijf', o.id)}" class="deel d${Math.min(diepte, 3)} ${'bedrijf' === stap && o.id === ondId ? 'actief' : ''} ${analyse(o.id)?.status || ''}"><span class="nr">${i + 1}</span><span>${esc(o.naam || '(naamloos)')}</span></a>`).join('')}`;
  }).join('');
  return `<aside class="bzi-zij geen-print">
    <div class="bzi-dossier">
      <div><b>${esc(d.nummer || '')}</b> <span class="badge-status ${esc(d.status)}">${esc(status)}</span>${d.spoed ? ' <span class="badge-spoed">Spoed</span>' : ''}</div>
      <div class="dempen klein">Laatste wijziging door ${esc(d.gewijzigdDoor || d.behandelaar || 'onbekend')} op ${esc(fmt.tijdstip(d.gewijzigd))}</div>
      <a href="#/aanvragen" class="terug">${icoon('links')}Aanvragen</a>
    </div>
    <div class="bzi-stappen-kop">Stappen</div>
    <nav class="bzi-stappen" aria-label="Stappen">
      ${link('overzicht', '', 'Dossieroverzicht', 'map')}
      ${link('algemeen', '', 'Algemeen', 'notitie')}
      ${link('invoer', '', 'Cijfers invoeren', 'reken')}
      ${link('bedrijven', '', 'Bedrijven', 'organogram')}
      ${boom}
      ${link('boekhouders', '', 'Boekhouders', 'boek')}
      ${link('verplichtingen', '', 'Geldstromen en verplichtingen', 'lijst')}
      ${link('samenvatting', '', 'Samenvatting', 'vink')}
    </nav>
    <div class="bzi-stappen-kop">Dossier</div>
    <nav class="bzi-stappen" aria-label="Dossier">
      <a href="${stapHref(d, 'documenten', '')}" class="${stap === 'documenten' ? 'actief' : ''}">${icoon('document')}<span>Documenten</span>${docsOntbrekend ? `<span class="teller">${docsOntbrekend}</span>` : ''}</a>
      ${link('berekening', '', 'Rekenstappen', 'reken')}
      ${link('bziinvoer', '', 'BZI-invoer (overzicht)', 'lijst')}
      ${link('notities', '', 'Notities', 'notitie')}
      ${link('rapport', '', 'Rapport', 'document')}
      ${link('fiat', '', 'Fiattering en historie', 'check')}
    </nav>
  </aside>`;
}

export function renderBZI(d, stap, ondId, r, gedeeld = {}) {
  const dossierTabs = { documenten: 'Documenten', invoer: 'Cijfers invoeren', berekening: 'Rekenstappen', bziinvoer: 'BZI-invoer (overzicht)', notities: 'Notities', rapport: 'Rapport', fiat: 'Fiattering en historie' };
  const geldig = ['algemeen', 'bedrijven', 'bedrijf', 'boekhouders', 'verplichtingen', 'samenvatting', ...Object.keys(dossierTabs)];
  let s = geldig.includes(stap) ? stap : 'algemeen';
  let id = ondId;
  if (s === 'bedrijf' && !(d.ondernemingen || []).some((o) => o.id === id)) {
    id = hoofdbedrijven(d)[0]?.id || '';
    if (!id) s = 'bedrijven';
  }
  let inhoud;
  switch (s) {
    case 'bedrijven': inhoud = stapBedrijven(d, r, id); break;
    case 'bedrijf': inhoud = stapBedrijf(d, r, id); break;
    case 'boekhouders': inhoud = stapBoekhouders(d); break;
    case 'verplichtingen': inhoud = stapVerplichtingen(d, r); break;
    case 'samenvatting': inhoud = stapSamenvatting(d, r, id); break;
    case 'documenten':
    case 'invoer':
    case 'berekening':
    case 'bziinvoer':
    case 'notities':
    case 'rapport':
    case 'fiat': inhoud = `${s === 'rapport' ? '' : `<h1>${esc(dossierTabs[s])}</h1>`}${gedeeld[s]?.() || ''}`; break;
    default: inhoud = stapAlgemeen(d, r);
  }
  const toonNotities = !ui.notitiesVerborgen && s !== 'notities';
  return `${bziKop(d, r)}
    <div class="bzi${toonNotities ? '' : ' zonder-notities'}">
      ${zijbalk(d, s, id, r, gedeeld.ontbrekend || 0)}
      <section class="bzi-inhoud" id="tabinhoud">${inhoud}${dossierTabs[s] ? '' : navKnoppen(d, s, id)}</section>
      ${toonNotities ? notitiePaneel(d, r, s === 'bedrijf' ? id : '') : ''}
    </div>
    ${s !== 'notities' ? `<button type="button" class="notities-wissel geen-print" data-actie="notities-paneel" title="${ui.notitiesVerborgen ? 'Notities tonen' : 'Notities verbergen'}">${icoon('notitie')}<span>${ui.notitiesVerborgen ? 'Notities' : 'Verberg notities'}</span></button>` : ''}`;
}

// ---------------------------------------------------------------------------
// Notitiepaneel (rechts)
// ---------------------------------------------------------------------------
function notitiePaneel(d, r, ondId) {
  const n = d.notities || {};
  const onds = d.ondernemingen || [];
  const finOnd = onds.find((o) => o.id === (ui.bziNotitiesOnd || ondId)) || onds.find((o) => o.id === ondId) || hoofdbedrijven(d)[0];
  const veldHTML = ([k, label, format]) => {
    const open = ui.notitiesOpen.has(k);
    let pad = `notities.${k}`;
    let waarde = n[k];
    let extra = '';
    let fmtKey = format;
    if (k === 'financieel') {
      pad = finOnd ? `notities.financieelOnderneming.${finOnd.id}` : 'notities.financieel';
      waarde = finOnd ? n.financieelOnderneming?.[finOnd.id] : n.financieel;
      extra = onds.length > 1 ? `<select class="notitie-ond" data-actie="notities-ond" aria-label="Onderneming">${onds.map((o) => `<option value="${esc(o.id)}"${o.id === finOnd?.id ? ' selected' : ''}>${esc(o.naam || '(naamloos)')}</option>`).join('')}</select>` : '';
      extra += finOnd ? `<button type="button" class="knop link klein" data-actie="concept-financieel" data-ond="${esc(finOnd.id)}">Concept uit invoer</button>` : '';
    }
    if (k === 'conclusie') fmtKey = conclusieFormat(d, r);
    if (k === 'algemeen') extra = '<button type="button" class="knop link klein" data-actie="organogram-invoegen">Organogram invoegen</button>';
    const template = fmtKey ? FORMATS[fmtKey] || '' : '';
    return `<div class="notitie-veld${open ? ' open' : ''}">
      <button type="button" class="notitie-kop" data-actie="notitie-toggle" data-veld="${k}" aria-expanded="${open}">${esc(label)}${icoon(open ? 'open' : 'dicht')}</button>
      ${open ? `<div class="notitie-body">
        ${extra || template ? `<div class="notitie-acties">${extra}${template ? `<button type="button" class="knop link klein" data-actie="format-invoegen" data-pad="${esc(pad)}" data-format="${esc(fmtKey)}">Format invoegen</button>` : ''}</div>` : ''}
        <textarea rows="${k === 'kredietbestemming' ? 3 : 8}" data-bind="${esc(pad)}" data-type="tekst" data-template="${esc(fmtKey || '')}" placeholder="${esc(template)}" aria-label="${esc(label)}">${esc(waarde || '')}</textarea>
      </div>` : ''}
    </div>`;
  };
  return `<aside class="bzi-notities geen-print" aria-label="Notities">${NOTITIE_VELDEN.map(veldHTML).join('')}</aside>`;
}

// ---------------------------------------------------------------------------
// Stap: Algemeen
// ---------------------------------------------------------------------------
function stapAlgemeen(d, r) {
  const a = d.aanvrager || {};
  const inst = d.instellingen || {};
  const { jaarNu } = bepaalJaren(d);
  const advOpties = lijst('advieskantoor').sort((x, y) => x.naam.localeCompare(y.naam)).map((x) => [x.id, x.naam]);
  return `<h1>Algemeen</h1>
    <div class="bzi-blok">
      <h3>Geldverstrekker en toetskader</h3>
      ${renderDossierbeleid(d)}
      <h3>Lening</h3>
      <div class="bzi-rij">
        ${keuze(null, 'label', ['ABN AMRO', 'Florius', 'Moneyou', 'Overig'], d.label || 'ABN AMRO')}
        ${keuze(null, 'afdeling', ['FMD', 'IMV', 'RV'], d.afdeling || 'IMV')}
        <input value="${esc(d.leningnummer || '')}" data-bind="leningnummer" data-type="tekst" placeholder="Hypotheekaanvraagnummer" aria-label="Hypotheekaanvraagnummer">
      </div>
      <div class="bzi-rij">
        <label class="check"><input type="checkbox"${d.bestaandeRelatie ? ' checked' : ''} data-bind="bestaandeRelatie" data-type="bool" data-render="1"><span>Bestaande relatie</span></label>
        ${d.bestaandeRelatie ? `<input value="${esc(d.relatienummer || '')}" data-bind="relatienummer" data-type="tekst" placeholder="Relatienummer" aria-label="Relatienummer" style="width:160px">` : ''}
      </div>
      <h3>Aanvrager</h3>
      <div class="bzi-rij">
        <input value="${esc(a.voorletters || '')}" data-bind="aanvrager.voorletters" data-type="tekst" placeholder="Voorletters" aria-label="Voorletters" style="width:110px">
        <input value="${esc(a.tussenvoegsel || '')}" data-bind="aanvrager.tussenvoegsel" data-type="tekst" placeholder="Tussenvoegsel" aria-label="Tussenvoegsel" style="width:120px">
        <input value="${esc(a.achternaam || '')}" data-bind="aanvrager.achternaam" data-type="tekst" placeholder="Achternaam" aria-label="Achternaam">
        <label class="veld inline"><span>Geboortedatum</span><input type="date" value="${esc(a.geboortedatum || '')}" data-bind="aanvrager.geboortedatum" data-type="datum"></label>
      </div>
      <h3>Adres</h3>
      <div class="bzi-rij">
        <input value="${esc(a.postcode || '')}" data-bind="aanvrager.postcode" data-type="tekst" placeholder="Postcode" aria-label="Postcode" style="width:110px">
        <input value="${esc(a.huisnummer || '')}" data-bind="aanvrager.huisnummer" data-type="tekst" placeholder="Huisnummer" aria-label="Huisnummer" style="width:110px">
        <input value="${esc(a.toevoeging || '')}" data-bind="aanvrager.toevoeging" data-type="tekst" placeholder="Toev." aria-label="Toevoeging" style="width:70px">
        <input value="${esc(a.straat || '')}" data-bind="aanvrager.straat" data-type="tekst" placeholder="Straat" aria-label="Straat">
        <input value="${esc(a.woonplaats || '')}" data-bind="aanvrager.woonplaats" data-type="tekst" placeholder="Woonplaats" aria-label="Woonplaats">
      </div>
      <p class="dempen klein">Adressen worden handmatig ingevoerd; ZIB raadpleegt geen externe adresbestanden. Leg geen BSN of rekeningnummers vast.</p>
    </div>
    <div class="bzi-blok">
      <h3>Aanvraag en berekening</h3>
      <div class="raster-3">
        ${keuze('Soort beoordeling', 'soort', { IKV: 'Inkomensverklaring (IKV)', NUL: '0-verklaring (nul-inkomen)' }, d.soort, { render: true })}
        ${veld('Berekeningsdatum', 'berekeningsdatum', d.berekeningsdatum, { type: 'datum', render: true })}
        ${keuze('Laatste toetsjaar', 'instellingen.laatsteToetsjaar', [['', `Standaard (${r.T3})`], ...[jaarNu - 1, jaarNu - 2, jaarNu - 3].map((y) => [String(y), String(y)])], inst.laatsteToetsjaar ?? '', { render: true, type: 'getal' })}
        ${keuze('Status', 'status', DOSSIER_STATUSSEN, d.status, { render: true })}
        ${veld('Behandelaar', 'behandelaar', d.behandelaar)}
        ${keuze('Niveau dossier', 'niveau', ['Basis', 'Medium', 'Top'], d.niveau || 'Basis')}
        ${keuze('Advieskantoor', 'advieskantoorId', advOpties, d.advieskantoorId, { leeg: 'Geen / onbekend' })}
        ${veld('Datum aanvraag', 'datumAanvraag', d.datumAanvraag || String(d.aangemaakt || '').slice(0, 10), { type: 'datum' })}
        ${veld('Uiterste datum', 'uitersteDatum', d.uitersteDatum, { type: 'datum', render: true })}
        ${veld('Via', 'via', d.via, { placeholder: 'Bijv. adviseur, invoerservice, accountant' })}
      </div>
      <div class="raster-2" style="margin-top:12px">${vink('Spoeddossier', 'spoed', !!d.spoed, { render: true })}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Stap: Bedrijven
// ---------------------------------------------------------------------------
function kvkDubbel(d, o) {
  const kvk = String(o.kvk || '').replace(/\s/g, '');
  if (kvk.length < 8) return null;
  const binnen = (d.ondernemingen || []).filter((x) => x.id !== o.id && String(x.kvk || '').replace(/\s/g, '') === kvk);
  const elders = lijst('dossier').filter((x) => x.id !== d.id && (x.ondernemingen || []).some((y) => String(y.kvk || '').replace(/\s/g, '') === kvk));
  if (!binnen.length && !elders.length) return null;
  return binnen.length
    ? 'Dit KvK-nummer komt in dit dossier vaker voor. Gebruik bij een gedeelde deelneming "Andere aandeelhouder binnen de structuur".'
    : `Er is al een bedrijf bekend met dit KvK-nummer in dossier ${elders.map((x) => x.nummer).join(', ')}.`;
}

function bedrijfRij(d, o, { hoofd = false, consolidatie = false } = {}) {
  const b = `ond:${o.id}`;
  const soort = soortOndernemer(o.rechtsvorm);
  const dubbel = kvkDubbel(d, o);
  const ouders = (d.ondernemingen || []).filter((x) => x.id !== o.id).map((x) => [x.id, x.naam || '(naamloos)']);
  return `<div class="bedrijf-rij">
    <div class="bzi-rij">
      <input value="${esc(o.naam || '')}" data-bind="${b}.naam" data-type="tekst" placeholder="Statutaire naam" aria-label="Statutaire naam" class="breed">
      <input value="${esc(o.activiteit || '')}" data-bind="${b}.activiteit" data-type="tekst" placeholder="Activiteit (bijv. Holding)" aria-label="Activiteit" style="width:150px">
      ${keuze(null, `${b}.rechtsvorm`, Object.fromEntries(Object.entries(RECHTSVORMEN).map(([k, v]) => [k, v.kort])), o.rechtsvorm, { render: true })}
      <input value="${esc(o.kvk || '')}" data-bind="${b}.kvk" data-type="tekst" data-render="1" placeholder="KvK-nummer" aria-label="KvK-nummer" style="width:120px">
      <input type="date" value="${esc(o.startdatum || '')}" data-bind="${b}.startdatum" data-type="datum" data-render="1" aria-label="Datum inschrijving KvK" title="Datum inschrijving KvK">
      ${!hoofd || o.rechtsvorm !== 'EZ' ? `<span class="pct-veld"><input inputmode="decimal" value="${esc(String(o.aandeelPct ?? 100).replace('.', ','))}" data-bind="${b}.aandeelPct" data-type="pct" data-render="1" aria-label="Belang (%)" title="Belang (%)"><i>%</i></span>` : ''}
      ${!hoofd ? keuze(null, `${b}.parentId`, ouders, o.parentId || '', { render: true }) : ''}
      ${!hoofd && consolidatie ? `<label class="check" title="Cijfers zijn geconsolideerd in de aandeelhouder"><input type="checkbox"${o.geconsolideerd ? ' checked' : ''} data-bind="${b}.geconsolideerd" data-type="bool" data-render="1"><span>Geconsolideerd</span></label>` : ''}
      <button type="button" class="knop link klein gevaar" data-actie="ond-verwijderen" data-ond="${esc(o.id)}" title="Verwijderen">${icoon('prullenbak')}</button>
    </div>
    ${dubbel ? `<div class="melding attentie klein">${esc(dubbel)}</div>` : ''}
    ${!hoofd ? extraOuders(d, o) : ''}
    <details class="meer"><summary>Meer gegevens (SBI, vestiging, beroepsgroep${soort === 'VPB' ? ', zeggenschap' : ''})</summary>
      <div class="raster-3">
        ${keuze('Rechtsvorm (volledig)', `${b}.rechtsvorm`, rechtsvormOpties(), o.rechtsvorm, { render: true })}
        ${veld('Start activiteiten (indien eerder dan KvK)', `${b}.startActiviteiten`, o.startActiviteiten, { type: 'datum', render: true })}
        ${keuze('Beroepsgroep', `${b}.beroepsgroep`, BEROEPSGROEPEN, o.beroepsgroep || 'overig', { render: true })}
        ${keuze('Gevestigd in', `${b}.land`, { NL: 'Nederland', BE: 'België', DE: 'Duitsland', LU: 'Luxemburg', OV: 'Overig buitenland' }, o.land || 'NL', { render: true })}
        ${veld('Website', `${b}.website`, o.website)}
        ${veld('Aantal medewerkers (gemiddeld)', `${b}.medewerkers`, o.medewerkers, { type: 'getal' })}
      </div>
      <div class="raster-2" style="margin-top:10px">
        ${tekstvak('SBI-code(s) en omschrijving (één per regel)', `${b}.sbi`, o.sbi, { rijen: 2 })}
        <div style="display:grid;gap:6px">
          ${vink('Onderneming is actief', `${b}.actief`, o.actief !== false, { render: true })}
          ${soort === 'VPB' ? vink('Zelfstandig bevoegd om dividend uit te keren (zeggenschap aangetoond)', `${b}.zeggenschap`, !!o.zeggenschap, { render: true }) : ''}
          ${vink('Prognose opgesteld door RA/AA-accountant', `${b}.prognoseRAAA`, !!o.prognoseRAAA, { render: true })}
          ${['medisch_juridisch', 'fysiotherapeut'].includes(o.beroepsgroep) ? vink('Inschrijving beroepsregister gecontroleerd, geen maatregel', `${b}.registerGecontroleerd`, !!o.registerGecontroleerd, { render: true }) : ''}
          ${/(^|\n)\s*45/.test(String(o.sbi || '')) ? keuze('Heeft de onderneming kasgeld?', `${b}.kasgeld`, { ja: 'Ja: kasboek uploaden', nee: 'Nee: verklaring boekhouder uploaden' }, o.kasgeld, { render: true, leeg: 'Maak een keuze' }) : ''}
        </div>
      </div>
    </details>
  </div>`;
}

function extraOuders(d, o) {
  const b = `ond:${o.id}`;
  const extra = o.extraParents || [];
  const ouders = (d.ondernemingen || []).filter((x) => x.id !== o.id && x.id !== o.parentId).map((x) => [x.id, x.naam || '(naamloos)']);
  return `<div class="extra-ouders">
    ${extra.map((x, i) => `<span class="extra-ouder">Ook ${keuze(null, `${b}.extraParents.${i}.id`, ouders, x.id || '', { leeg: 'kies aandeelhouder', render: true })}
      <span class="pct-veld"><input inputmode="decimal" value="${isIngevuld(x.pct) ? esc(String(x.pct).replace('.', ',')) : ''}" data-bind="${b}.extraParents.${i}.pct" data-type="pct" data-render="1" aria-label="Belang (%)"><i>%</i></span>
      <button type="button" class="knop link klein" data-actie="extra-ouder-weg" data-ond="${esc(o.id)}" data-index="${i}" title="Verwijderen">${icoon('prullenbak')}</button></span>`).join('')}
    <button type="button" class="knop link klein" data-actie="extra-ouder-toevoegen" data-ond="${esc(o.id)}">${icoon('plus')}Gedeelde deelneming: andere aandeelhouder</button>
  </div>`;
}

function stapBedrijven(d, r, ondId) {
  const hoofden = hoofdbedrijven(d);
  const h = hoofden.find((x) => x.id === ondId) || hoofden[0];
  const tabs = hoofden.map((x) => `<a href="${stapHref(d, 'bedrijven', x.id)}" class="${x.id === h?.id ? 'actief' : ''}">${esc(x.naam || '(naamloos)')}</a>`).join('');
  if (!h) {
    return `<h1>Bedrijven</h1>
      <button class="knop sec" data-actie="hoofdbedrijf-toevoegen">${icoon('plus')}Hoofdbedrijf toevoegen</button>
      ${leeg('Voeg het bedrijf toe waarin de aanvrager onderneemt (eenmanszaak, vof of de eigen holding/werk-BV).')}`;
  }
  const kinderen = deelnemingenVan(d, h.id);
  const isVPB = soortOndernemer(h.rechtsvorm) === 'VPB';
  const gedeeld = (d.ondernemingen || []).filter((o) => (o.extraParents || []).some((x) => x.id === h.id) || (o.extraParents || []).some((x) => kinderen.some((k) => k.o.id === x.id)));
  return `<h1>Bedrijven</h1>
    <div class="acties"><button class="knop sec" data-actie="hoofdbedrijf-toevoegen">${icoon('plus')}Hoofdbedrijf toevoegen</button></div>
    <nav class="bzi-tabs">${tabs}</nav>
    <div class="bzi-blok">
      <div class="bzi-rij-kop"><span>${isVPB ? 'Holding / werkmaatschappij' : 'Onderneming'}</span><span>KvK-inschrijving</span></div>
      ${bedrijfRij(d, h, { hoofd: true })}
      ${isVPB ? `<label class="check info-vak"><input type="checkbox"${h.consolidatie ? ' checked' : ''} data-bind="ond:${esc(h.id)}.consolidatie" data-type="bool" data-render="1">
        <span>Er zijn geconsolideerde cijfers bekend. Vink hieronder de deelnemingen aan waarvan de cijfers in de geconsolideerde cijfers zitten; die tellen niet apart mee in het toetskader.</span></label>` : ''}
      ${isVPB ? `<div class="deelnemingen">
        <div class="bzi-rij-kop"><span>Deelneming</span><span>KvK-inschrijving, belang en aandeelhouder</span></div>
        ${kinderen.map(({ o, diepte }) => `<div class="deelneming d${Math.min(diepte, 3)}">${bedrijfRij(d, o, { consolidatie: !!h.consolidatie })}</div>`).join('') || '<p class="dempen">Nog geen deelnemingen.</p>'}
        ${gedeeld.length ? `<p class="dempen klein">Gedeelde deelneming(en) met een andere aandeelhouder binnen de structuur: ${gedeeld.map((o) => `${esc(o.naam)} (ingevoerd onder ${esc(d.ondernemingen.find((x) => x.id === o.parentId)?.naam || 'een andere aandeelhouder')})`).join(', ')}. De cijfers voer je één keer in; het belang telt mee in het toetskader van beide hoofdbedrijven.</p>` : ''}
        <button class="knop sec klein" data-actie="deelneming-toevoegen" data-ouder="${esc(h.id)}">${icoon('plus')}Deelneming toevoegen</button>
      </div>` : ''}
    </div>
    ${paneelOrganogram(d, { bewerken: true, titel: 'Organogram en overige aandeelhouders' })}`;
}

// ---------------------------------------------------------------------------
// Stap: resultaten per bedrijf (jaarkolommen)
// ---------------------------------------------------------------------------
function jarenBZI(d) {
  const { T, kandidaatC } = bepaalJaren(d);
  // Zoals in de rekentool: het meest recente jaar links, het oudste rechts.
  return { kolommen: ordeJaren([kandidaatC, ...T]), C: kandidaatC, T };
}

/** Waarde bij een bind-pad (ook "ond:<id>.…" voor een onderneming). */
export function waardeVanPad(d, pad) {
  if (String(pad).startsWith('ond:')) {
    const punt = pad.indexOf('.');
    const ond = (d.ondernemingen || []).find((o) => o.id === pad.slice(4, punt));
    return ond ? getPath(ond, pad.slice(punt + 1)) : undefined;
  }
  return getPath(d, pad);
}

function waardeR(r, ondId, y, pad) {
  const a = r.ondernemingen.find((x) => x.id === ondId);
  return getPath(a?.jaren?.[y], pad);
}

function calcCel(r, ondId, y, pad, { klasse = '', titel = '' } = {}) {
  const w = waardeR(r, ondId, y, pad);
  return `<td class="calc ${klasse}" data-calc="r|${esc(ondId)}|${y}|${esc(pad)}"${titel ? ` title="${esc(titel)}"` : ''}>${w === null || w === undefined ? '' : esc(fmt.getal(w))}</td>`;
}

function tmMaand(jd, C) {
  const tot = jd?.tot;
  if (tot && String(tot).startsWith(String(C))) return Number(String(tot).slice(5, 7));
  return 12;
}

function stapBedrijf(d, r, ondId) {
  const o = (d.ondernemingen || []).find((x) => x.id === ondId);
  if (!o) return leeg('Onderneming niet gevonden.');
  const a = r.ondernemingen.find((x) => x.id === o.id);
  const b = `ond:${o.id}`;
  const soort = soortOndernemer(o.rechtsvorm);
  const isHoofd = !o.parentId || !(d.ondernemingen || []).some((x) => x.id === o.parentId);
  const inst = d.instellingen || {};
  const { kolommen, C, T } = jarenBZI(d);
  const { jaarNu } = bepaalJaren(d);
  const jd = (y) => o.jaren?.[y] || {};
  const kinderen = (d.ondernemingen || []).filter((x) => x.parentId === o.id || (x.extraParents || []).some((e) => e.id === o.id));
  const ouder = (d.ondernemingen || []).find((x) => x.id === o.parentId);
  const n = kolommen.length;

  const periodeOpties = [jaarNu - 1, jaarNu - 2, jaarNu - 3].map((y) => [String(y), `${y - 2} - ${y + 1}`]);
  const kop = `<tr><th></th>${kolommen.map((y) => {
    const isC = y === C;
    const status = jd(y).status || (isC ? 'tussentijds' : 'definitief');
    return `<th class="jaarkaart${isC ? ' lopend' : ''}">
      <div class="jaarkaart-kop">
        ${isC ? `<label class="check" title="Tussentijdse cijfers beoordelen (telt niet mee in het gemiddelde)"><input type="checkbox"${inst.controlejaar !== false ? ' checked' : ''} data-bind="instellingen.controlejaar" data-type="bool" data-render="1"><span>${y}</span></label>
          <label class="tm">t/m <select data-actie="bzi-tm" data-ond="${esc(o.id)}" data-jaar="${y}" aria-label="Tussentijdse cijfers tot en met maand">${MAANDEN_KORT.map((m, i) => `<option value="${i + 1}"${i + 1 === tmMaand(jd(y), C) ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>`
    : `<label class="check" title="Meetellen in het gemiddelde"><input type="checkbox"${jd(y).meetellen !== false ? ' checked' : ''} data-bind="${b}.jaren.${y}.meetellen" data-type="bool" data-render="1"><span>${y}</span></label>`}
      </div>
      ${keuze(null, `${b}.jaren.${y}.status`, JAAR_STATUSSEN, status, { render: true })}
    </th>`;
  }).join('')}</tr>`;

  const sectie = (titel) => `<tr class="sectie"><td>${esc(titel)}</td>${'<td></td>'.repeat(n)}</tr>`;
  const invoer = (label, padFn, opties = {}) => `<tr><td class="label">${esc(label)}${opties.hint ? `<span class="hint">${esc(opties.hint)}</span>` : ''}</td>${kolommen.map((y) => {
    if (opties.uitDetail && opties.uitDetail(y)) return calcCel(r, o.id, y, opties.uitDetail(y), { klasse: 'uit-detail', titel: 'Uit de gedetailleerde invoer (ViiZ-weergave)' });
    const pad = padFn(y);
    const w = waardeVanPad(d, pad);
    return `<td class="invoer">${opties.type === 'pct'
      ? `<input class="bedrag" inputmode="decimal" value="${isIngevuld(w) ? esc(String(w).replace('.', ',')) : ''}" placeholder="${esc(String(opties.placeholder ?? ''))}" data-bind="${esc(pad)}" data-type="pct" data-render="1" aria-label="${esc(label)} ${y}">`
      : bedrag(pad, w, { label: `${label} ${y}`, placeholder: opties.placeholder || label })}${opties.knop ? opties.knop(y) : ''}</td>`;
  }).join('')}</tr>`;
  const berekend = (label, pad, opties = {}) => `<tr class="na-correctie"><td class="label">${esc(label)}</td>${kolommen.map((y) => calcCel(r, o.id, y, pad, opties)).join('')}</tr>`;

  const ibPad = (y, k) => `ib.${y}.perOnd.${o.id}.${k}`;
  const aggPad = (y, k) => `${b}.jaren.${y}.bzi.${k}`;
  const detVW = (y) => heeftVW(jd(y).vw);
  const detBal = (y) => heeftBalans(jd(y).balans);

  // Correcties (chips per type)
  const corrRijen = (lijstNaam) => {
    const labels = new Map();
    kolommen.forEach((y) => {
      const aj = a?.jaren?.[y];
      if (!aj) return;
      const items = lijstNaam === 'winst'
        ? [...aj.winst.pos.map((x) => ({ ...x, effect: x.bedrag })), ...aj.winst.neg.map((x) => ({ ...x, effect: -x.bedrag }))]
        : aj.corr.items.map((x) => ({ label: x.label, effect: x.av, hand: x.hand, type: x.type, bt: x.bt, va: x.va, kvv: x.kvv, toelichting: '' }));
      items.forEach((x) => {
        const key = `${x.hand ? 'h' : 'a'}|${x.label}`;
        if (!labels.has(key)) labels.set(key, { label: x.label, hand: !!x.hand, perJaar: {} });
        const e = labels.get(key).perJaar;
        e[y] = (e[y] || 0) + x.effect;
      });
    });
    const rijen = [...labels.values()].map((l) => `<tr class="correctie-rij"><td class="label sub">${esc(l.label)}${l.hand ? '' : ' <span class="dempen klein">(automatisch)</span>'}</td>${kolommen.map((y) => `<td>${isIngevuld(l.perJaar[y]) && Math.round(l.perJaar[y]) !== 0 ? chip(l.perJaar[y], { soort: l.hand ? '' : 'auto', titel: lijstNaam === 'winst' ? 'Effect op de nettowinst' : 'Effect op het aansprakelijk vermogen' }) : ''}</td>`).join('')}</tr>`).join('');
    const knoppen = `<tr class="correctie-knoppen"><td class="label"></td>${kolommen.map((y) => `<td><button type="button" class="knop sec klein" data-actie="correctie-open" data-ond="${esc(o.id)}" data-jaar="${y}" data-lijst="${lijstNaam}">${icoon('correctie')}Correctie</button></td>`).join('')}</tr>`;
    return rijen + knoppen;
  };

  const vaKnop = (y) => `<button type="button" class="reken-knop" data-actie="va-samenstelling" data-ond="${esc(o.id)}" data-jaar="${y}" title="Samenstelling vlottende activa (R/C directie, niet vrij beschikbare liquide middelen)">${icoon('reken')}</button>`;

  let body = '';
  if (o.rechtsvorm !== 'EZ') body += invoer('Percentage aandeel in bedrijf', (y) => `${b}.jaren.${y}.aandeelPct`, { type: 'pct', placeholder: num(o.aandeelPct ?? 100) });
  if (isHoofd) {
    body += sectie('Privé-onttrekkingen');
    if (soort === 'VPB') {
      body += invoer('DGA-inkomen', (y) => ibPad(y, 'loon'), { hint: '', knop: (y) => (y === C ? `<button type="button" class="reken-knop" data-actie="salaris-hulp" data-ond="${esc(o.id)}" data-jaar="${y}" title="DGA-inkomen uit de salarisstrook over de periode van de tussentijdse cijfers">${icoon('reken')}</button>` : '') });
    } else {
      body += invoer(o.rechtsvorm === 'EZ' ? 'Saldo fiscale winst' : 'Winstaandeel (saldo fiscale winst)', (y) => ibPad(y, 'sfw'));
    }
    body += invoer('Bijtelling privégebruik auto', (y) => ibPad(y, 'bijtelling'));
    body += berekend(soort === 'VPB' ? 'DGA-inkomen (na correctie)' : 'Inkomen (na correctie)', 'inkomen.totaal');
    if (soort === 'VPB') body += invoer('Dividend (box 2)', (y) => ibPad(y, 'dividend'));
  }
  body += sectie('Winstgevendheid');
  body += invoer('Omzet', (y) => aggPad(y, 'omzet'), { uitDetail: (y) => (detVW(y) ? 'vw.OMZET' : null) });
  body += invoer('Nettowinst', (y) => aggPad(y, 'nettowinst'), { uitDetail: (y) => (detVW(y) ? 'winst.NW' : null), hint: soort === 'VPB' ? 'Na vennootschapsbelasting' : '' });
  body += berekend('Nettowinst (na correctie)', 'winst.NWcor');
  if (!isHoofd) {
    body += invoer(`Management fee${ouder ? ` aan ${ouder.naam}` : ''}`, (y) => aggPad(y, 'managementFee'), { placeholder: 'Management fee' });
    const pctOuder = Math.min(1, Math.max(0, num(isIngevuld(o.aandeelPct) ? o.aandeelPct : 100) / 100));
    const gedeeldDiv = (o.extraParents || []).length || pctOuder < 1;
    body += invoer(gedeeldDiv ? 'Intern dividend (totaal uitgekeerd)' : 'Intern dividend', (y) => aggPad(y, 'internDividend'), { placeholder: 'Intern dividend',
      hint: gedeeldDiv ? 'Totaal aan alle aandeelhouders; de rekentool vraagt het deel voor de aandeelhouder in de structuur' : '' });
    if (gedeeldDiv && ouder) {
      body += `<tr class="na-correctie"><td class="label">waarvan aan ${esc(ouder.naam)} (${esc(fmt.pct(pctOuder, 0))})</td>${kolommen.map((y) => {
        const w = num(o.jaren?.[y]?.bzi?.internDividend);
        return `<td class="calc">${w ? esc(fmt.getal(Math.round(w * pctOuder))) : ''}</td>`;
      }).join('')}</tr>`;
    }
  }
  body += sectie('Winstcorrecties') + corrRijen('winst');
  body += sectie('Solvabiliteit');
  body += invoer('Eigen vermogen', (y) => aggPad(y, 'ev'), { uitDetail: (y) => (detBal(y) ? 'bal.EV' : null) });
  body += berekend('Aansprakelijk vermogen', 'EVcor');
  body += invoer('Balanstotaal', (y) => aggPad(y, 'bt'), { uitDetail: (y) => (detBal(y) ? 'bal.TA' : null) });
  body += berekend('Balanstotaal (na correctie)', 'TVcor');
  body += sectie('Liquiditeit');
  body += invoer('Vlottende activa', (y) => aggPad(y, 'va'), { uitDetail: (y) => (detBal(y) ? 'bal.VA' : null), knop: (y) => (detBal(y) ? '' : vaKnop(y)) });
  body += berekend('Vlottende activa (na correctie)', 'VAcor');
  body += invoer('Kort vreemd vermogen', (y) => aggPad(y, 'kvv'), { uitDetail: (y) => (detBal(y) ? 'bal.KVV' : null) });
  body += berekend('Kort vreemd vermogen (na correctie)', 'KVVcor');
  body += sectie('Vermogenscorrecties') + corrRijen('vermogen');

  // Geldstromen binnen de structuur
  let geld = '';
  if (kinderen.length || (isHoofd && soort === 'VPB')) {
    geld += sectie('Geldstromen binnen de structuur');
    kinderen.forEach((k) => {
      const primair = k.parentId === o.id;
      const pctK = Math.min(1, Math.max(0, num(isIngevuld(primair ? k.aandeelPct : (k.extraParents || []).find((x) => x.id === o.id)?.pct)
        ? (primair ? k.aandeelPct : k.extraParents.find((x) => x.id === o.id).pct) : 100) / 100));
      if (primair) {
        geld += `<tr><td class="label">Ontvangen management fee van ${esc(k.naam)}<span class="hint">Volgens de jaarrekening van ${esc(o.naam)}</span></td>${kolommen.map((y) => {
          const w = o.jaren?.[y]?.geldstromen?.ontvangenFee?.[k.id];
          const betaald = num(k.jaren?.[y]?.bzi?.managementFee);
          const vs = isIngevuld(w) && Math.abs(num(w) - betaald) > 1;
          return `<td class="invoer">${bedrag(`${b}.jaren.${y}.geldstromen.ontvangenFee.${k.id}`, w, { label: `Ontvangen fee ${k.naam} ${y}`, render: true })}${vs ? `<span class="verschil" title="Betaald volgens ${esc(k.naam)}: ${esc(fmt.eur(betaald))}">≠ ${esc(fmt.getal(betaald))}</span>` : ''}</td>`;
        }).join('')}</tr>`;
      }
      geld += `<tr><td class="label">Ontvangen dividend van ${esc(k.naam)}${pctK < 1 ? `<span class="hint">Verwacht ${esc(fmt.pct(pctK, 0))} van het uitgekeerde dividend</span>` : ''}</td>${kolommen.map((y) => {
        const w = o.jaren?.[y]?.geldstromen?.ontvangenDividend?.[k.id];
        const betaald = Math.round(num(k.jaren?.[y]?.bzi?.internDividend) * pctK);
        const vs = isIngevuld(w) && Math.abs(num(w) - betaald) > 1;
        return `<td class="invoer">${bedrag(`${b}.jaren.${y}.geldstromen.ontvangenDividend.${k.id}`, w, { label: `Ontvangen dividend ${k.naam} ${y}`, render: true })}${vs ? `<span class="verschil" title="Verwacht volgens ${esc(k.naam)}: ${esc(fmt.eur(betaald))}">≠ ${esc(fmt.getal(betaald))}</span>` : ''}</td>`;
      }).join('')}</tr>`;
    });
    if (kinderen.length) geld += invoer('Nog te ontvangen dividend (overlopende activa)', (y) => `${b}.jaren.${y}.geldstromen.nogTeOntvangenDividend`);
    if (isHoofd && soort === 'VPB') {
      geld += `<tr><td class="label">Betaalbaar gesteld dividend aan DGA<span class="hint">Vergelijk met het dividend in box 2</span></td>${kolommen.map((y) => {
        const w = o.jaren?.[y]?.geldstromen?.dividendDGA;
        const box2 = num(d.ib?.[y]?.perOnd?.[o.id]?.dividend);
        const vs = isIngevuld(w) && Math.abs(num(w) - box2) > 1;
        return `<td class="invoer">${bedrag(`${b}.jaren.${y}.geldstromen.dividendDGA`, w, { label: `Betaalbaar gesteld dividend ${y}`, render: true })}${vs ? `<span class="verschil" title="Box 2 volgens IB-aangifte: ${esc(fmt.eur(box2))}">≠ ${esc(fmt.getal(box2))}</span>` : ''}</td>`;
      }).join('')}</tr>`;
    }
  }

  const badges = `<div class="badges"><span class="badge">${isHoofd ? (o.activiteit || (soort === 'VPB' ? 'Holding' : 'Onderneming')) : 'Deelneming'}</span><span class="badge">${esc(RECHTSVORMEN[o.rechtsvorm]?.kort || o.rechtsvorm)}</span>${a ? pil(a.status) : ''}</div>`;
  const keuzesHoofd = isHoofd && d.soort === 'IKV' ? `<div class="bzi-keuzes">
      ${vink('0-inkomen afgegeven?', `${b}.nulInkomen`, !!o.nulInkomen, { render: true })}
      ${r.familie === 'ABN' ? vink('Geen inkomen afgeven?', `${b}.geenInkomen`, !!o.geenInkomen, { render: true }) : ''}
      ${vink('Afwijkend inkomen?', `${b}.afwijkend.actief`, !!o.afwijkend?.actief, { render: true })}
    </div>
    ${o.afwijkend?.actief ? `<div class="raster-2 afwijkend">
      ${veld('Afwijkend inkomen (af te geven)', `${b}.afwijkend.bedrag`, o.afwijkend.bedrag, { type: 'getal', render: true })}
      ${tekstvak('Motivatie en rekenkundige onderbouwing', `${b}.afwijkend.motivatie`, o.afwijkend.motivatie, { rijen: 3 })}
    </div>` : ''}` : '';

  return `<h1>${esc(o.naam || '(naamloos)')}</h1>${badges}
    ${keuzesHoofd}
    <div class="bzi-periode">
      <label class="veld inline"><span>Periode</span>${keuze(null, 'instellingen.laatsteToetsjaar', periodeOpties, String(inst.laatsteToetsjaar || r.T3), { render: true, type: 'getal' })}</label>
      ${a?.aggBalans || kolommen.some((y) => a?.jaren?.[y]?.aggBalans || a?.jaren?.[y]?.aggVW) ? '<span class="dempen klein">Invoer met totaalposten. Voor een gedetailleerde balans of W&V gebruik je de ViiZ-weergave.</span>' : ''}
    </div>
    <div class="scroll"><table class="bzi-jaren" id="rooster"><thead>${kop}</thead><tbody>${body}${geld}</tbody></table></div>
    ${isHoofd && soort === 'VPB' && d.soort === 'IKV' && a?.box2?.overwinst ? overwinstBlok(d, r, a, { invoer: true }) : ''}
    ${a ? `<details class="stappen" style="margin-top:14px"><summary>Voorwaarden en rekenstappen ${esc(o.naam)}</summary><div class="inhoud">
      <div class="voorwaarden">${a.checks.map((c) => `<div class="voorwaarde"><b>${esc(c.label)}</b><div>${pil(c.status)}</div><div class="tekst">${esc(c.tekst)}</div></div>`).join('')}</div>
    </div></details>` : ''}`;
}

// ---------------------------------------------------------------------------
// Stap: Boekhouders
// ---------------------------------------------------------------------------
function stapBoekhouders(d) {
  const bh = d.notities?.boekhouder || {};
  const lijstBH = bh.lijst || [];
  return `<h1>Boekhouders</h1>
    <div class="bzi-blok">
      ${keuze('Optie boekhouder', 'notities.boekhouder.optie', { 1: 'Boekhouder aanwezig', 2: 'Geen gegevens van de boekhouder', 3: 'Geen boekhouder, klant doet zelf aangifte' }, bh.optie || '1', { render: true })}
      ${(bh.optie || '1') === '1' ? `<div class="bzi-blok binnen"><h3>Boekhouder</h3>
        ${lijstBH.map((x, i) => `<div class="bzi-rij">
          <input value="${esc(x.naam || '')}" data-bind="notities.boekhouder.lijst.${i}.naam" data-type="tekst" placeholder="Kantoornaam" aria-label="Kantoornaam" class="breed">
          <input value="${esc(x.kvk || '')}" data-bind="notities.boekhouder.lijst.${i}.kvk" data-type="tekst" placeholder="KvK-nummer" aria-label="KvK-nummer" style="width:140px">
          <label class="check"><input type="checkbox"${x.raAa ? ' checked' : ''} data-bind="notities.boekhouder.lijst.${i}.raAa" data-type="bool"><span>RA/AA</span></label>
          <button type="button" class="knop link klein gevaar" data-actie="boekhouder-weg" data-index="${i}" title="Verwijderen">${icoon('prullenbak')}</button>
        </div>`).join('') || '<p class="dempen">Nog geen boekhouder vastgelegd.</p>'}
        <button class="knop sec klein" data-actie="boekhouder-toevoegen">${icoon('plus')}Voeg boekhouder toe</button></div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Stap: Kredieten en verplichtingen (ZIB)
// ---------------------------------------------------------------------------
function stapVerplichtingen(d, r) {
  const heeftVPB = (d.ondernemingen || []).some((o) => soortOndernemer(o.rechtsvorm) === 'VPB');
  const nulNodig = d.soort === 'NUL' || (d.ondernemingen || []).some((o) => o.nulInkomen || o.meenemen === false);
  return `<h1>Geldstromen en verplichtingen</h1>
    <p class="dempen">Geldstromen met partijen binnen en buiten de structuur, en verplichtingen die de beoordeling of de financieringslast in privé raken. Deze stap staat niet in de rekentool van de bank; ZIB gebruikt de gegevens in de toetsing, de meldingen en het rapport.</p>
    ${paneelGeldstromen(d, r)}
    ${paneelZK(d)}
    ${heeftVPB ? paneelRC(d, r) : ''}
    ${heeftVPB ? paneelLeningDirectie(d, r) : ''}
    ${nulNodig ? paneelNul(d) : ''}
    ${r.familie !== 'ABN' || d.soort === 'NUL' ? paneelLoondienst(d, r) : ''}`;
}

// ---------------------------------------------------------------------------
// Stap: Samenvatting
// ---------------------------------------------------------------------------
function jaarLabel(r, y) {
  if (y === r.C) {
    const a = r.ondernemingen.find((x) => x.jaren[y]?.heeftVW || x.jaren[y]?.heeftBalans);
    const tot = a?.jaren[y]?.tot;
    return `<span class="badge-tm">t/m ${esc(fmt.datum(tot || `${y}-12-31`))}</span>`;
  }
  return String(y);
}

function correctiesTekst(aj, lijstNaam) {
  if (!aj) return '';
  const n = lijstNaam === 'winst' ? aj.winst.pos.length + aj.winst.neg.length : aj.corr.items.length;
  return n ? `${n} ${n === 1 ? 'correctie' : 'correcties'}` : '';
}

function samenvattingBedrijf(d, r, a, { hoofd = false, ph = null } = {}) {
  const jaren = ordeJarenOverzicht(r.C && Object.keys(a.jaren).map(Number).includes(r.C) ? [r.C, ...r.T] : [...r.T]);
  const isVPB = a.soort === 'VPB';
  const mark = (y) => (y !== r.C && a.jaren[y]?.meegeteld ? icoon('check') : '');
  const svMin = solvNorm(r.kaderCfg, a.soort);
  const crMin = r.kaderCfg.liquiditeitMin;
  const g = a.gemiddeld;
  const knopCorr = (y, lijstNaam, kort = false) => {
    const t = correctiesTekst(a.jaren[y], lijstNaam);
    if (!t) return '';
    const inhoud = kort ? `${icoon('correctie')}${esc(t.split(' ')[0])}` : esc(t);
    return `<button type="button" class="knop link klein" data-actie="correctie-open" data-ond="${esc(a.id)}" data-jaar="${y}" data-lijst="${lijstNaam}" title="${esc(t)} bekijken of wijzigen">${inhoud}</button>`;
  };
  const meldingen = a.checks.filter((c) => c.status !== 'akkoord');
  const aandeel = a.soort === 'VPB' || ['VOF', 'MTS', 'CV'].includes(a.rechtsvorm)
    ? `<h4>Aandeel in bedrijf</h4><table class="tabel compact samenvat"><thead><tr><th class="mk"></th><th>Jaar</th><th>Aandeel in bedrijf</th></tr></thead><tbody>
      ${jaren.map((y) => `<tr><td class="mk">${mark(y)}</td><td>${jaarLabel(r, y)}</td><td>${esc(fmt.pct(a.jaren[y]?.aandeel, 0))}</td></tr>`).join('')}</tbody></table>` : '';
  const prive = hoofd && ph ? `<h4>Privéonttrekkingen</h4><div class="scroll"><table class="tabel compact samenvat"><thead><tr><th class="mk"></th><th>Jaar</th><th class="num">${isVPB ? 'DGA-inkomen (na correctie)' : 'Inkomen (na correctie)'}</th>${isVPB ? '<th class="num">Dividend (box 2)</th>' : ''}</tr></thead><tbody>
      <tr class="gem"><td class="mk"></td><td>Gemiddeld:</td><td class="num">${esc(fmt.getal(ph.bziInkomen))}</td>${isVPB ? `<td class="num">${esc(fmt.getal(ph.bziDividend))}</td>` : ''}</tr>
      ${jaren.map((y) => `<tr><td class="mk">${mark(y)}</td><td>${jaarLabel(r, y)}</td><td class="num">${esc(fmt.getal(a.jaren[y]?.inkomen.totaal ?? 0))}</td>${isVPB ? `<td class="num">${num(a.jaren[y]?.ibOnd?.dividend) ? esc(fmt.getal(num(a.jaren[y]?.ibOnd?.dividend))) : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '';
  const toonDividend = !hoofd || jaren.some((y) => a.jaren[y]?.geldstroom.internDividend);
  const winst = `<h4>Winstgevendheid</h4><div class="scroll"><table class="tabel compact samenvat"><thead><tr><th class="mk"></th><th>Jaar</th><th class="num">Omzet</th><th class="num">Winst</th>${toonDividend ? '<th class="num">Intern dividend</th>' : ''}<th>Correcties</th></tr></thead><tbody>
      <tr class="gem"><td class="mk"></td><td>Gemiddeld:</td><td class="num">${esc(fmt.getal(g.omzet))}</td><td class="num">${esc(fmt.getal(g.winst))}</td>${toonDividend ? `<td class="num">${g.internDividend ? esc(fmt.getal(g.internDividend)) : ''}</td>` : ''}<td></td></tr>
      ${jaren.map((y) => {
    const j = a.jaren[y];
    if (!j) return '';
    return `<tr><td class="mk">${mark(y)}</td><td>${jaarLabel(r, y)}</td><td class="num">${j.heeftVW ? esc(fmt.getal(j.vw.OMZET)) : ''}</td><td class="num">${j.heeftVW ? esc(fmt.getal(j.winst.NWcor)) : ''}</td>${toonDividend ? `<td class="num">${j.geldstroom.internDividend ? esc(fmt.getal(j.geldstroom.internDividend)) : ''}</td>` : ''}<td>${knopCorr(y, 'winst')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  const vermogen = `<h4>Vermogen</h4><div class="scroll"><table class="tabel compact samenvat"><thead><tr><th class="mk"></th><th>Jaar</th><th class="num">Aansprakelijk vermogen</th><th class="num">Balanstotaal</th><th>Solvabiliteit</th><th class="num">Solvabiliteits&shy;ruimte</th><th class="num">Vlottende activa</th><th class="num">Kort vreemd vermogen</th><th>Liquiditeit</th><th class="num">Liquiditeits&shy;ruimte</th><th><abbr title="Correcties">Corr.</abbr></th></tr></thead><tbody>
      <tr class="gem"><td class="mk"></td><td>Gemiddeld:</td><td></td><td></td><td></td><td class="num">${g.solvRuimte === null ? '' : esc(fmt.getal(g.solvRuimte))}</td><td></td><td></td><td></td><td class="num">${g.liqRuimte === null ? '' : esc(fmt.getal(g.liqRuimte))}</td><td></td></tr>
      ${jaren.map((y) => {
    const j = a.jaren[y];
    if (!j || !j.heeftBalans) return j ? `<tr><td class="mk">${mark(y)}</td><td>${jaarLabel(r, y)}</td><td colspan="9" class="dempen">Geen balans</td></tr>` : '';
    return `<tr><td class="mk">${mark(y)}</td><td>${jaarLabel(r, y)}</td><td class="num">${esc(fmt.getal(j.EVcor))}</td><td class="num">${esc(fmt.getal(j.TVcor))}</td>
        <td>${kengetal(j.SV === null ? 'n.v.t.' : fmt.pct(j.SV, 0), j.SV === null ? null : j.SV >= svMin)}</td><td class="num">${esc(fmt.getal(j.solvRuimte))}</td>
        <td class="num">${esc(fmt.getal(j.VAcor))}</td><td class="num">${esc(fmt.getal(j.KVVcor))}</td>
        <td>${kengetal(j.CR === null ? 'n.v.t.' : fmt.ratio(j.CR), j.CR === null ? null : j.CR >= crMin)}</td><td class="num">${esc(fmt.getal(j.liqRuimte))}</td><td>${knopCorr(y, 'vermogen', true)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  return `<section class="samenvat-bedrijf">
    <div class="samenvat-kop"><a href="#/dossier/${esc(d.id)}/bedrijf/${esc(a.id)}">${esc(a.naam)}</a>
      <span class="badge">${hoofd ? 'Hoofdbedrijf' : 'Deelneming'}</span><span class="badge">${esc(a.rechtsvormKort)}</span>
      ${a.geconsolideerd ? '<span class="badge">Geconsolideerd</span>' : ''}
      ${meldingen.length ? `<details class="waarschuwingen"><summary title="${meldingen.length} aandachtspunt(en)">${icoon('waarschuwing')}</summary><ul>${meldingen.map((c) => `<li>${pil(c.status)} <b>${esc(c.label)}</b>: ${esc(c.tekst)}</li>`).join('')}</ul></details>` : ''}
    </div>
    <div class="samenvat-tabellen">${aandeel}${prive}${winst}${vermogen}</div>
  </section>`;
}

function stapSamenvatting(d, r, ondId) {
  if (d.soort === 'NUL') {
    const n = r.nul;
    return `<h1>Samenvatting</h1>
      <div class="bzi-blok"><h3>Beoordeling 0-verklaring ${pil(n.status)}</h3>
        ${n.nhgOpmerking ? melding('info', esc(n.nhgOpmerking)) : ''}
        <p style="margin-top:10px"><b>${esc(n.conclusie)}</b></p>
        ${n.perOnderneming.map((o) => `<h4>${esc(o.naam)} ${pil(o.status)}</h4><div class="voorwaarden">${o.checks.map((c) => `<div class="voorwaarde"><b>${esc(c.label)}</b><div>${pil(c.status)}</div><div class="tekst">${esc(c.tekst)}</div></div>`).join('')}</div>`).join('')}
        <h4>Zekerheden en verplichtingen</h4><div class="voorwaarden">${n.zekerheden.map((c) => `<div class="voorwaarde"><b>${esc(c.label)}</b><div>${pil(c.status)}</div><div class="tekst">${esc(c.tekst)}</div></div>`).join('')}</div>
      </div>
      ${r.ondernemingen.map((a) => samenvattingBedrijf(d, r, a, { hoofd: !a.parentId })).join('')}`;
  }
  const ink = r.inkomen;
  if (r.familie !== 'ABN') {
    return `<h1>Samenvatting</h1>
      ${melding('info', `Dit dossier volgt ${esc(r.kaderCfg.kort)} (${esc(r.kaderCfg.versie)}): het inkomen wordt op totaalniveau bepaald. ${esc(r.kaderCfg.inkomensberekening[0])}. De volledige berekening staat onder Rekenstappen.`)}
      <div class="bzi-blok"><div class="badges"><span class="badge-toets ${r.status !== 'niet_akkoord' ? 'ok' : 'nok'}">${r.status !== 'niet_akkoord' ? 'Voldoet aan toetskader' : 'Voldoet niet aan toetskader'}</span>
        <span class="badge-inkomen"><span>Toetsinkomen ${esc(kaderLabel(r.kader))}</span><b>${esc(fmt.getal(r.vastgesteld))}</b></span></div>
        <div class="bzi-inkomen"><div><span>Box 1</span><b>${esc(fmt.eur(ink.box1))}</b></div><div><span>Box 2</span><b>${esc(fmt.eur(ink.box2))}</b></div><div><span>Gemiddelde 3 jaar</span><b>${esc(fmt.eur(ink.gemiddelde))}</b></div></div>
      </div>
      ${r.meldingen.length ? `<div class="blok">${r.meldingen.map((m) => melding(m.niveau === 'niet_akkoord' ? 'niet_akkoord' : m.niveau === 'attentie' ? 'attentie' : 'info', esc(m.tekst))).join('')}</div>` : ''}
      ${r.ondernemingen.filter((a) => a.meenemen).map((a) => samenvattingBedrijf(d, r, a, { hoofd: !a.parentId })).join('')}
      ${r.ondernemingen.filter((a) => a.box2?.overwinst && r.kaderCfg.box2?.model === 'NHG' && ['route2', 'combinatie'].includes(d.instellingen?.box2Route)).map((a) => overwinstBlok(d, r, a, { kort: true })).join('')}
      ${r.inkomen?.geldstromen?.length ? `<div class="bzi-blok">${geldstromenTabel(r, r.inkomen.geldstromen)}</div>` : ''}
      ${paneelOrganogram(d)}`;
  }
  const ph = ink.perHoofdbedrijf;
  const h = ph.find((x) => x.id === ondId) || ph[0];
  if (!h) return `<h1>Samenvatting</h1>${leeg('Voeg eerst een bedrijf toe.')}`;
  const tabs = ph.length > 1 ? `<nav class="bzi-tabs">${ph.map((x) => `<a href="#/dossier/${esc(d.id)}/samenvatting/${esc(x.id)}" class="${x.id === h.id ? 'actief' : ''}">${esc(x.naam)}</a>`).join('')}</nav>` : '';
  const ond = (d.ondernemingen || []).find((o) => o.id === h.id) || {};
  const groep = h.groep.map((id) => r.ondernemingen.find((a) => a.id === id)).filter(Boolean);
  const hoofdA = groep[0];
  const geenReden = h.maanden < 12 ? 'korter dan 1 boekjaar' : 'keuze acceptant';
  const bron = { nul: '0-inkomen afgegeven', afwijkend: 'Afwijkend inkomen', geen: `Geen inkomen (${geenReden})`, berekend: 'Berekend inkomen' }[h.bron];
  const meldingenH = r.meldingen.filter((m) => m.tekst.startsWith(`${h.naam}:`) || groep.some((a) => m.tekst.startsWith(`${a.naam}:`)) || (m.tekst.includes(h.naam) && /sluit niet aan/.test(m.tekst)));
  const woonbeleid = h.nul ? '' : `<div class="bzi-blok woonbeleid"><h3>Toets Woonbeleid (ZIB)</h3>
      <dl class="kv compact">
        <dt>Categorie</dt><dd>${esc(h.categorie)} (${esc(String(h.maanden).replace('.', ','))} maanden tot ultimo ${r.T3})</dd>
        <dt>Inkomen volgens Woonbeleid</dt><dd>${esc(fmt.eur(h.toets))}${h.factor > 0 && h.factor < 1 ? ` (${h.factor * 100}% van het gemiddelde${h.prognose !== null ? `, maximaal de prognose ${esc(fmt.eur(h.prognose))}` : ''})` : ' (laagste van gemiddelde en laatste boekjaar)'}</dd>
        ${h.soort === 'VPB' ? `<dt>Uitgekeerd dividend</dt><dd>${esc(fmt.eur(h.uitgekeerdDividend))} (laagste van gemiddelde en laatste jaar)</dd>
        ${h.overwinstMee ? `<dt>Overwinst (niet-uitgekeerd dividend)</dt><dd>${esc(fmt.eur(h.overwinstMee))} na de dubbele balanstoets</dd>` : ''}
        <dt>Dividend volgens Woonbeleid</dt><dd>${esc(fmt.eur(h.box2))} (maximaal de gemiddelde nettowinst × belang)</dd>` : ''}
        <dt>Toetsinkomen Woonbeleid</dt><dd><b>${esc(fmt.eur(h.woonbeleid))}</b>${h.factor > 0 && h.factor < 1 ? ` (vóór starterafslag ${esc(fmt.eur(h.woonbeleidVoorAfslag))}; de afslag past het acceptatiesysteem toe)` : ''}</dd>
        <dt>Af te geven</dt><dd><b>${esc(fmt.eur(h.bijdrage))}</b> ${esc(bron || '')}</dd>
      </dl></div>`;
  const actief = ph.filter((x) => !x.nul);
  const totaal = ph.length > 1 ? `<div class="badges totaal-badge"><span class="badge-inkomen"><span>Totaal berekend inkomen</span><b>${esc(fmt.getal(actief.reduce((t, x) => t + x.berekend, 0)))}</b></span>
    ${Math.abs(ink.vastgesteld - actief.reduce((t, x) => t + x.berekend, 0)) > 1 ? `<span class="dempen klein">Af te geven ${esc(fmt.eur(ink.vastgesteld))}</span>` : ''}</div>` : '';
  const owH = hoofdA?.box2?.overwinst;
  const overwinstDeel = h.nul || !owH ? '' : h.overwinstMee || hoofdA.box2.overwinstMeenemen
    ? overwinstBlok(d, r, hoofdA, { kort: true })
    : `<p class="dempen klein ow-hint">Overwinst niet meegenomen. Mogelijk na de dubbele balanstoets: ${esc(fmt.eur(owH.naDbt))} × belang ${esc(fmt.pct(owH.aandeel, 0))} = ${esc(fmt.eur(owH.bruto))}${owH.toegestaan ? '' : ' (voorwaarden nog niet akkoord)'}. Instellen bij <a href="#/dossier/${esc(d.id)}/bedrijf/${esc(h.id)}">${esc(h.naam)}</a>.</p>`;
  const tegels = h.soort === 'VPB'
    ? `<div><span>Inkomen</span><b>${esc(fmt.eur(h.nul ? 0 : h.bziInkomen))}</b></div><div><span>Dividend</span><b>${esc(fmt.eur(h.nul ? 0 : h.bziDividend))}</b></div>${h.overwinstMee ? `<div><span>Overwinst (Woonbeleid)</span><b>${esc(fmt.eur(h.overwinstMee))}</b></div>` : ''}`
    : `<div><span>Winst</span><b>${esc(fmt.eur(h.nul ? 0 : h.bziInkomen))}</b></div>`;
  return `<h1>Samenvatting</h1>${totaal}${tabs}
    <div class="bzi-blok samenvat-hoofd">
      <div class="samenvat-kop"><b>${esc(h.naam)}</b><span class="badge">${esc(ond.activiteit || (h.soort === 'VPB' ? 'Holding' : 'Onderneming'))}</span><span class="badge">${esc(h.rechtsvormKort)}</span></div>
      <div class="badges">${h.nul ? '<span class="badge-toets">0-inkomen</span>' : `<span class="badge-toets ${h.voldoet ? 'ok' : 'nok'}">${h.voldoet ? 'Voldoet aan toetskader' : 'Voldoet niet aan toetskader'}</span>`}
        <span class="badge-inkomen"><span>Berekend inkomen</span><b>${esc(fmt.getal(h.nul ? 0 : h.berekend))}</b></span></div>
      <div class="raster-2" style="margin-top:12px">
        <div class="bzi-inkomen"><div class="groot"><span>Berekend inkomen</span><b>${esc(fmt.eur(h.nul ? 0 : h.berekend))}</b></div>
          ${tegels}</div>
        <div class="verklaring"><div class="verklaring-kop">Verklaring berekend inkomen</div>
          <p>Het berekend inkomen is het gemiddelde ondernemersinkomen over de meegetelde jaren.</p>
          <ul><li>${h.soort === 'VPB' ? 'Gemiddeld DGA-inkomen (loon na bijtelling) plus het gemiddelde dividend in box 2.' : 'Gemiddeld saldo fiscale winst na correcties.'}</li>
          <li>De toetsing aan het Woonbeleid (laagste van gemiddelde en laatste jaar, starters, dividendplafond) staat hieronder.</li>
          ${h.nietVoldoend.length ? `<li>Niet voldaan aan het toetskader: ${esc(h.nietVoldoend.join(', '))}.</li>` : ''}</ul></div>
      </div>
    </div>
    ${woonbeleid}
    ${overwinstDeel}
    ${meldingenH.length ? `<div class="blok">${meldingenH.map((m) => melding(m.niveau === 'niet_akkoord' ? 'niet_akkoord' : m.niveau === 'attentie' ? 'attentie' : 'info', esc(m.tekst), m.actie?.soort === 'woonbeleid-overnemen' ? `<button class="knop sec klein" data-actie="woonbeleid-overnemen" data-ond="${esc(m.actie.ondId)}" data-bedrag="${esc(m.actie.bedrag)}">Als afwijkend inkomen overnemen</button>` : '')).join('')}</div>` : ''}
    ${hoofdA ? samenvattingBedrijf(d, r, hoofdA, { hoofd: true, ph: h }) : ''}
    ${groep.slice(1).map((a) => samenvattingBedrijf(d, r, a)).join('')}
    ${(h.geldstromen || []).length ? `<div class="bzi-blok">${geldstromenTabel(r, h.geldstromen)}</div>` : ''}
    ${paneelOrganogram(d)}
    ${r.meldingen.filter((m) => !meldingenH.includes(m)).length ? `<details class="stappen"><summary>Overige meldingen (${r.meldingen.filter((m) => !meldingenH.includes(m)).length})</summary><div class="inhoud">${r.meldingen.filter((m) => !meldingenH.includes(m)).map((m) => melding(m.niveau === 'niet_akkoord' ? 'niet_akkoord' : m.niveau === 'attentie' ? 'attentie' : 'info', esc(m.tekst))).join('')}</div></details>` : ''}`;
}

// ---------------------------------------------------------------------------
// Pop-ups: correcties en samenstelling vlottende activa
// ---------------------------------------------------------------------------
export function modaalCorrectie(d, r, ondId, y, lijstNaam) {
  const o = (d.ondernemingen || []).find((x) => x.id === ondId);
  const a = r.ondernemingen.find((x) => x.id === ondId);
  const soort = soortOndernemer(o?.rechtsvorm);
  const defs = lijstNaam === 'winst' ? WINST_CORRECTIES : VERMOGENS_CORRECTIES;
  const sleutel = lijstNaam === 'winst' ? 'winstCorrecties' : 'vermogensCorrecties';
  const lijstC = o?.jaren?.[y]?.[sleutel] || [];
  const types = typesVoor(defs, soort);
  const aj = a?.jaren?.[y];
  const auto = lijstNaam === 'winst'
    ? [...(aj?.winst.pos || []).filter((x) => !x.hand).map((x) => [x.label, x.bedrag]), ...(aj?.winst.neg || []).filter((x) => !x.hand).map((x) => [x.label, -x.bedrag])]
    : (aj?.corr.items || []).filter((x) => !x.hand).map((x) => [x.label, x.av, x]);
  return `<p class="dempen">${esc(o?.naam || '')}, ${y}${y === r.C ? ' (tussentijds)' : ''}. ${lijstNaam === 'winst' ? 'Winstcorrecties werken door in de nettowinst na correctie.' : 'Vermogenscorrecties werken door in het aansprakelijk vermogen en, afhankelijk van het type, in het balanstotaal, de vlottende activa of het kort vreemd vermogen.'}</p>
    <div id="correctie-lijst">${correctieLijstHTML(lijstC, defs, ondId, y, lijstNaam)}</div>
    ${auto.length ? `<h4>Automatische correcties uit de invoer</h4><ul class="auto-lijst">${auto.map(([l, bedr, x]) => `<li>${esc(l)}: <b>${esc(fmt.eur(bedr))}</b>${x && (x.bt || x.va || x.kvv) ? ` <span class="dempen klein">(balanstotaal ${esc(fmt.getal(x.bt))}, vlottende activa ${esc(fmt.getal(x.va))}, kort vreemd vermogen ${esc(fmt.getal(x.kvv))})</span>` : ''}</li>`).join('')}</ul>
      <p class="dempen klein">Een handmatige correctie van hetzelfde type vervangt de automatische correctie in dit jaar.</p>` : ''}
    <h4>Correctie toevoegen</h4>
    <div class="raster-3" style="grid-template-columns:2fr 1fr">
      <label class="veld"><span>Soort correctie</span><select name="type">${types.map(([k, t]) => `<option value="${k}">${esc(t.label)}${t.alleenNHG && d.kader !== 'NHG' ? ' (alleen bij NHG)' : ''}</option>`).join('')}</select></label>
      <label class="veld"><span>Bedrag</span><input name="bedrag" class="bedrag" inputmode="decimal" autocomplete="off"></label>
    </div>
    <label class="veld" style="margin-top:10px"><span>Toelichting</span><input name="toelichting" autocomplete="off" placeholder="Bijvoorbeeld: boekwinst verkoop bedrijfsauto"></label>
    <p class="dempen klein" style="margin-top:8px">${esc(types.map(([, t]) => (t.hint ? `${t.label}: ${t.hint}` : '')).filter(Boolean).join(' '))} Verlagende types worden altijd negatief verwerkt, verhogende altijd positief.</p>
    <input type="hidden" name="ond" value="${esc(ondId)}"><input type="hidden" name="jaar" value="${y}"><input type="hidden" name="lijst" value="${lijstNaam}">`;
}

export function correctieLijstHTML(lijstC, defs, ondId, y, lijstNaam) {
  if (!lijstC.length) return '<p class="dempen">Nog geen handmatige correcties in dit jaar.</p>';
  return `<table class="tabel compact"><thead><tr><th>Soort</th><th class="num">Bedrag</th><th>Toelichting</th><th></th></tr></thead><tbody>
    ${lijstC.map((c, i) => `<tr><td>${esc(defs[c.type]?.label || c.type)}</td><td class="num">${esc(fmt.eur(c.bedrag))}</td><td>${esc(c.toelichting || '')}</td>
      <td><button type="button" class="knop link klein gevaar" data-actie="correctie-weg" data-ond="${esc(ondId)}" data-jaar="${y}" data-lijst="${lijstNaam}" data-index="${i}">Verwijderen</button></td></tr>`).join('')}</tbody></table>`;
}

export function modaalVaSamenstelling(d, ondId, y) {
  const o = (d.ondernemingen || []).find((x) => x.id === ondId);
  const det = o?.jaren?.[y]?.bzi?.vaDetail || {};
  const isVPB = soortOndernemer(o?.rechtsvorm) === 'VPB';
  const v = (k) => (isIngevuld(det[k]) ? fmt.getal(det[k]) : '');
  return `<p class="dempen">${esc(o?.naam || '')}, ${y}. De vlottende activa worden de som van de onderdelen. ${isVPB ? 'De R/C directie wordt automatisch gecorrigeerd (ABN AMRO: altijd; NHG: vanaf € 17.500). ' : ''}Niet vrij beschikbare liquide middelen (G-rekening) worden op de vlottende activa gecorrigeerd.</p>
    <div class="raster-3" style="grid-template-columns:1fr 1fr" data-va>
      <label class="veld"><span>Voorraden en onderhanden werk</span><input name="voorraden" class="bedrag" inputmode="decimal" value="${esc(v('voorraden'))}"></label>
      <label class="veld"><span>Vorderingen (excl. R/C directie)</span><input name="vorderingen" class="bedrag" inputmode="decimal" value="${esc(v('vorderingen'))}"></label>
      ${isVPB ? `<label class="veld"><span>Rekening-courant directie (vordering op DGA)</span><input name="rcDirectie" class="bedrag" inputmode="decimal" value="${esc(v('rcDirectie'))}"></label>` : ''}
      <label class="veld"><span>Liquide middelen</span><input name="liquide" class="bedrag" inputmode="decimal" value="${esc(v('liquide'))}"></label>
      <label class="veld"><span>⇒ waarvan niet ter vrije beschikking (G-rekening)</span><input name="nietVrij" class="bedrag" inputmode="decimal" value="${esc(v('nietVrij'))}"></label>
    </div>
    <p style="margin-top:10px">Totaal vlottende activa: <b id="va-totaal">${esc(fmt.eur(num(det.voorraden) + num(det.vorderingen) + num(det.rcDirectie) + num(det.liquide)))}</b></p>
    <input type="hidden" name="ond" value="${esc(ondId)}"><input type="hidden" name="jaar" value="${y}">`;
}

export function modaalSalaris(d, r, ondId, y) {
  const o = (d.ondernemingen || []).find((x) => x.id === ondId);
  const s = d.salarisStrook?.[ondId] || {};
  const jd = o?.jaren?.[y] || {};
  const maanden = s.maanden || tmMaand(jd, y);
  return `<p class="dempen">Bereken het DGA-inkomen over dezelfde periode als de tussentijdse cijfers: maandsalaris × 12 × (1 + vakantiegeld) [+ 13e maand] / 12 × aantal maanden.</p>
    <div class="raster-3" style="grid-template-columns:1fr 1fr" data-salaris>
      <label class="veld"><span>Bruto maandsalaris (salarisstrook)</span><input name="maandsalaris" class="bedrag" inputmode="decimal" value="${esc(isIngevuld(s.maandsalaris) ? fmt.getal(s.maandsalaris) : '')}"></label>
      <label class="veld"><span>Vakantiegeld (%)</span><input name="vakantiegeldPct" inputmode="decimal" value="${esc(String(s.vakantiegeldPct ?? 8).replace('.', ','))}"></label>
      <label class="veld"><span>Aantal maanden (periode tussentijdse cijfers)</span><input name="maanden" inputmode="numeric" value="${esc(String(maanden))}"></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="dertiendeMaand"${s.dertiendeMaand ? ' checked' : ''}><span>Vaste 13e maand</span></label>
      <label class="veld"><span>Salarisstrook t/m (maand)</span><input name="strookTm" value="${esc(s.strookTm || '')}" placeholder="bijv. 08-${y}"></label>
    </div>
    <p style="margin-top:10px">Uitkomst: <b id="salaris-uitkomst">–</b></p>
    <input type="hidden" name="ond" value="${esc(ondId)}"><input type="hidden" name="jaar" value="${y}">`;
}

export { MAANDEN_KORT };
