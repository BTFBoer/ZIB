import { esc, fmt, naamAanvrager, num, isIngevuld } from '../util.js';
import { get, lijst } from '../state.js';
import { RECHTSVORMEN, SOORTEN, kaderVoor, PARAM_LABELS } from '../engine/kaders.js';
import { organogramGraaf, vergelijkKaders } from '../engine/index.js';
import { zkLijst, zkTekst } from '../engine/nulverklaring.js';
import { BALANS_RIJEN, VW_RIJEN } from '../schema/fields.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES } from '../schema/correcties.js';
import { balansTotalen, vwTotalen, totalenJaar } from '../engine/financieel.js';
import { tekstDuur } from '../engine/periods.js';
import { docAanwezig } from '../schema/documenten.js';
import { kernPunten, toelichtingRijen } from '../toelichting.js';
import { pil, STATUS_TEKST, icoon } from './ui.js';
import { renderTrace } from './trace-view.js';
import { inkomensTabel, kengetallenTabel, methodenTabel, ondernemingenMatrix, weergaveOpties, stip } from './dossier.js';
import { analyseBedragVoorDossier } from './rekenwerkruimte.js';
import { CONTROLES } from './formats.js';
import { ui, ordeJarenOverzicht, ingeklapt } from './uistate.js';
import { organogramSVG, organogramNotitie } from './organogram.js';
import { geldstromenTabel } from './geldstromen.js';
import { overwinstBlok } from './overwinst.js';

const kv = (paren) => `<dl class="kv">${paren.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
const pre = (t) => (t ? `<pre class="notitie">${esc(t)}</pre>` : '<p class="dempen">Niet ingevuld.</p>');
const gevuld = (t) => String(t ?? '').trim() !== '';

function financieleTabel(ond, r, soort) {
  const jaren = ordeJarenOverzicht(r.C ? [...r.T, r.C] : [...r.T]);
  const rijen = soort === 'balans' ? BALANS_RIJEN : VW_RIJEN;
  const sectie = soort === 'balans' ? 'balans' : 'vw';
  const metAgg = jaren.some((y) => {
    const t = totalenJaar(ond.jaren?.[y] || {});
    return soort === 'balans' ? t.aggBalans : t.aggVW;
  });
  if (metAgg) {
    // Invoer met totaalposten (BZI): toon de totalen.
    const posten = soort === 'balans'
      ? [['ev', 'Eigen vermogen'], ['bt', 'Balanstotaal'], ['va', 'Vlottende activa'], ['kvv', 'Kort vreemd vermogen']]
      : [['omzet', 'Omzet'], ['nettowinst', 'Nettowinst'], ['managementFee', 'Management fee (betaald)'], ['internDividend', 'Intern dividend (uitgekeerd)']];
    const body = posten.filter(([k]) => jaren.some((y) => isIngevuld(ond.jaren?.[y]?.bzi?.[k])))
      .map(([k, l]) => `<tr><td>${esc(l)}</td>${jaren.map((y) => `<td class="num">${isIngevuld(ond.jaren?.[y]?.bzi?.[k]) ? fmt.getal(num(ond.jaren[y].bzi[k])) : ''}</td>`).join('')}</tr>`).join('');
    return `<div class="scroll"><table class="tabel"><thead><tr><th>${soort === 'balans' ? 'Balans' : 'Winst- en verliesrekening'} (${esc(ond.naam)}, totaalposten)</th>${jaren.map((y) => `<th class="num">${y}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  const tot = (y) => (soort === 'balans' ? balansTotalen(ond.jaren?.[y]?.balans) : vwTotalen(ond.jaren?.[y]?.vw));
  const body = rijen.map((rij) => {
    if (rij.t === 'kop') return `<tr class="kopregel"><td colspan="${jaren.length + 1}">${esc(rij.label)}</td></tr>`;
    if (rij.t === 'sub') return '';
    if (rij.t === 'som') {
      if (rij.controle) return '';
      return `<tr class="${rij.sterk ? 'totaal' : 'som'}"><td>${esc(rij.label)}</td>${jaren.map((y) => `<td class="num">${fmt.getal(tot(y)[rij.k] ?? 0)}</td>`).join('')}</tr>`;
    }
    if (rij.soort === 'getal') return '';
    const heeft = jaren.some((y) => num(ond.jaren?.[y]?.[sectie]?.[rij.k]) !== 0);
    if (!heeft) return '';
    return `<tr${rij.t === 'waarvan' ? ' class="waarvan"' : ''}><td>${rij.t === 'waarvan' ? '⇒ ' : ''}${esc(rij.label)}</td>${jaren.map((y) => `<td class="num">${fmt.getal(num(ond.jaren?.[y]?.[sectie]?.[rij.k]))}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="scroll"><table class="tabel"><thead><tr><th>${soort === 'balans' ? 'Balans' : 'Winst- en verliesrekening'} (${esc(ond.naam)})</th>${jaren.map((y) => `<th class="num">${y}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Belang in de samenvatting: direct, in welke aandeelhouder, en het economische belang van de aanvrager. */
function belangTekst(d, r, o) {
  const an = r.ondernemingen.find((x) => x.id === o.id);
  const direct = num(o.aandeelPct ?? 100) / 100;
  const ouder = (d.ondernemingen || []).find((x) => x.id === o.parentId);
  const econ = an?.belangEconomisch;
  const delen = [`${fmt.pct(direct, 0)}${ouder ? ` (gehouden door ${esc(ouder.naam || '')})` : ''}`];
  if (econ !== undefined && econ !== null && Math.abs(econ - direct) > 0.0001) delen.push(`economisch belang aanvrager ${fmt.pct(econ, 1)}`);
  if (an && an.soort === 'VPB' && an.zeggenschap === false) delen.push('geen zeggenschap');
  return delen.join('; ');
}

const voorwaardenTabel = (checks) => `<div class="scroll"><table class="tabel"><tbody>${checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${pil(c.status)}</td><td>${esc(c.tekst)}</td></tr>`).join('')}</tbody></table></div>`;

/**
 * Toelichting op de berekening van het toetsinkomen in drie kolommen (omschrijving, berekening, uitkomst):
 * de stappen van de totaalberekening achter elkaar, zodat de uitkomst zonder de rekenstappen te volgen is.
 */
function toelichtingTabel(r) {
  const secties = (r.trace?.secties || []).filter((s) => s.groep === 'inkomen');
  if (!secties.length) return '';
  const rijHTML = (x) => {
    if (x.soort === 'groep') return `<tr class="groep"><td colspan="3">${esc(x.label)}</td></tr>`;
    if (x.soort === 'tekst') return `<tr><td>${esc(x.label)}</td><td colspan="2">${esc(x.formule)}</td></tr>`;
    if (x.soort === 'reeks') return `<tr class="reeks ${esc(x.stijl)}"><td>${esc(x.label)}</td><td class="num formule" colspan="2">${esc(x.formule)}</td></tr>`;
    return `<tr class="${esc(x.stijl)}${x.sub ? ' sub' : ''}"><td>${esc(x.label)}</td><td class="num formule">${esc(x.formule)}</td><td class="num uitkomst">${esc(x.uitkomst)}</td></tr>`;
  };
  return `<h3>Toelichting berekening toetsinkomen</h3>${secties.map((s) => `
    <p class="dempen klein">${esc(s.titel)}${s.richtlijn ? `. ${esc(s.richtlijn)}` : ''}</p>
    <div class="scroll"><table class="tabel toelichting"><thead><tr><th>Omschrijving</th><th class="num">Berekening</th><th class="num">Uitkomst</th></tr></thead>
      <tbody>${toelichtingRijen(s).map(rijHTML).join('')}</tbody></table></div>`).join('')}`;
}

const PUNT_MAX = 6;

/** Historische bedragen uit de rekenkern, in de vaste volgorde oud → nieuw. */
function inkomensVerloop(d, r) {
  if (d.soort === 'NUL' || r.inkomen?.gecombineerdDgaOpen) return '';
  const waarden = ordeJarenOverzicht(r.T).map((jaar) => [jaar, r.inkomen.perJaar?.[jaar]])
    .filter(([, waarde]) => Number.isFinite(waarde));
  if (!waarden.length) return '';
  const schaal = Math.max(1, ...waarden.map(([, waarde]) => Math.abs(waarde)));
  return `<figure class="rapport-verloop">
    <figcaption><b>Inkomensverloop</b><span>${r.familie === 'ABN' ? 'BZI-jaarinkomen inclusief meegeteld dividend' : 'Jaarinkomen uit de totaalberekening'}</span></figcaption>
    <ol>${waarden.map(([jaar, waarde]) => `<li><b>${esc(jaar)}</b><span class="verloop-baan" aria-hidden="true"><span class="${waarde < 0 ? 'negatief' : ''}" style="--balklengte:${Math.abs(waarde) / schaal * 100}%"></span></span><strong>${esc(fmt.eur(waarde))}</strong></li>`).join('')}</ol>
  </figure>`;
}

/** De kern bovenaan: de uitkomst, de belangrijkste gegevens en de aandachtspunten. */
function kernBlok(d, r, kader) {
  const isNul = d.soort === 'NUL';
  const a = d.aanvrager || {};
  const f = d.fiat || {};
  const ink = r.inkomen || {};
  let label = r.status === 'akkoord' ? 'Vastgesteld zakelijk inkomen' : 'Voorlopige inkomensuitkomst';
  let zin = '';
  if (isNul) {
    label = '0-verklaring';
    zin = r.nul?.conclusie || '';
  } else if (r.beleid) {
    label = r.beleid.bewijs ? 'Uitkomst op basis van bewijsstuk' : 'Voorlopige rekenindicatie';
    zin = 'Ter beoordeling volgens de route van de geldverstrekker.';
  } else if (r.bron === 'geen') {
    zin = 'Er kan geen zakelijk inkomen worden afgegeven.';
  } else if (r.bron === 'open') {
    zin = 'Beoordeel de broncijfers en het gezamenlijke DGA-loon bij Fiattering.';
  } else if (r.bron === 'afwijkend') {
    label = r.status === 'akkoord' ? 'Afwijkend inkomen (gemotiveerd)' : 'Voorgesteld afwijkend inkomen';
    zin = `Berekend inkomen ${fmt.eur(r.berekend)}; afgegeven wordt het gemotiveerde afwijkende inkomen.`;
  } else if (r.familie === 'ABN' && r.toetsinkomen !== r.berekend) {
    zin = `Berekend inkomen (BZI). Toetsinkomen Woonbeleid ${fmt.eur(r.toetsinkomen)}.`;
  } else if (num(ink.box2) > 0) {
    zin = `Box 1 ${fmt.eur(ink.box1)} en box 2 ${fmt.eur(ink.box2)}.`;
  }
  const punten = kernPunten(d, r);
  const zichtbaar = punten.slice(0, PUNT_MAX);
  const rest = punten.length - zichtbaar.length;
  const puntenLijst = (items) => `<ul class="punten">${items.map((p) => `<li>${stip(p.status)}<span><b>${esc(STATUS_TEKST[p.status])}:</b> ${esc(p.tekst)}</span></li>`).join('')}</ul>`;
  const status = f.tweede?.resultaat === 'akkoord' ? 'Tweede fiat geregistreerd' : f.tweede?.resultaat === 'niet_akkoord' ? 'Tweede fiat niet akkoord' : f.eerste ? 'Wacht op tweede fiat' : 'Concept · nog te beoordelen';
  const adres = [[a.straat, a.huisnummer].filter(Boolean).join(' '), [a.postcode, a.woonplaats].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return `<section class="kern" id="rap-kern" aria-label="Kern van het rapport" data-beoordelingskader="${esc(r.kader)}">
    <div class="kern-uitkomst ${esc(r.status)}">
      <div class="kern-label">${esc(label)}</div>
      <div class="bedrag-groot">${esc(isNul ? '€ 0' : r.beleid ? r.beleid.bedrag === null ? 'Nog te bepalen' : fmt.eur(r.beleid.bedrag) : r.bron === 'geen' ? 'Geen inkomen' : r.bron === 'open' ? 'Nog te beoordelen' : fmt.eur(r.vastgesteld))}</div>
      <div class="kern-oordeel">${pil(r.status, r.beleid && r.status === 'akkoord' ? 'Ter beoordeling' : undefined)} <span class="rapport-fiatstatus">${esc(status)}</span></div>
      ${zin ? `<p>${esc(zin)}</p>` : ''}
      ${r.beleid || r.bron === 'open' ? '' : `<p class="dempen klein">Geldig voor bindende offertes uitgebracht tot en met ${esc(fmt.datumLang(r.geldigTot))}.</p>`}
    </div>
    <div class="kern-feiten">${kv([
      ['Aanvrager', `<b>${esc(naamAanvrager(a))}</b>${a.geboortedatum ? `, geboren ${esc(fmt.datumLang(a.geboortedatum))}` : ''}`],
      adres ? ['Adres', esc(adres)] : null,
      ['Dossier', esc([d.nummer, SOORTEN[d.soort] || d.soort].filter(Boolean).join(' · '))],
      ['Bestemd voor', esc(kader.bestemdVoor)],
      ['Toetskader', esc(`${kader.naam}, ${r.kaderVersie}`)],
      ['Toetsjaren', esc(`${r.T.join(', ')}${r.C ? `; controlejaar ${r.C}` : ''}`)],
      ['Behandelaar', esc(d.behandelaar || '')],
      ['Fiatteur', esc(f.tweede?.naam || d.fiatteur || '')],
      ['Datum', esc(fmt.datumLang(r.datum))],
    ])}</div>
    <div class="kern-punten">
      <h3>Aandachtspunten</h3>
      ${zichtbaar.length ? `${puntenLijst(zichtbaar)}
        ${rest > 0 ? `<details class="rapport-extra-punten"><summary>Toon nog ${rest} ${rest === 1 ? 'punt' : 'punten'}</summary>${puntenLijst(punten.slice(PUNT_MAX))}</details>` : ''}`
    : `<p class="kern-geen">${stip('akkoord')}<span>De berekening meldt geen aandachtspunten.</span></p>`}
    </div>
  </section>`;
}

/**
 * Bouwt het rapport op als genummerde hoofdstukken. Kort = kern, inkomen, kengetallen, toelichting en conclusie;
 * uitgebreid = daarnaast geldstromen, alle voorwaarden en als bijlagen de rekenstappen en cijfers.
 * @returns {{kern: string, hoofdstukken: {key: string, nr: string, titel: string, html: string, bijlage?: boolean}[], titel: string}}
 */
function bouwRapport(d, r, modus) {
  if (r.inkomensanalyse) {
    const n = d.notities || {};
    const toelichting = [
      ['Algemene informatie en organogram', n.algemeen],
      ...(d.ondernemingen || []).map((o) => [`Financiële informatie ${o.naam || 'onderneming'}`, n.financieelOnderneming?.[o.id]]),
      ['Financiële informatie ondernemer in privé', n.priveTekst],
      ['Kredietbestemming en aflossing', n.kredietbestemming],
      ['Conclusie', n.conclusie],
      ['Bijlagen', n.bijlagen],
    ].filter(([, waarde]) => gevuld(waarde));
    const hoofdstukken = [{ key: 'inkomen', nr: '1', titel: 'Uitkomsten per toetskader', html: methodenTabel(d, r, { kop: false }) }];
    if (toelichting.length) hoofdstukken.push({
      key: 'toelichting', nr: '2', titel: 'Toelichting',
      html: toelichting.map(([label, waarde]) => `<h3>${esc(label)}</h3>${pre(waarde)}`).join(''),
    });
    return {
      titel: 'Rapport inkomensanalyse',
      kern: `<section class="kern" id="rap-kern" aria-label="Kern van het rapport">${kv([
        ['Dossier', esc(d.nummer || '')],
        ['Datum analyse', esc(fmt.datumLang(r.datum))],
        ['Behandelaar', esc(d.behandelaar || '')],
      ])}</section>`,
      hoofdstukken,
    };
  }
  const uitgebreid = modus === 'uitgebreid';
  const kader = r.kaderCfg || kaderVoor(d);
  const adv = get(d.advieskantoorId);
  const a = d.aanvrager || {};
  const n = d.notities || {};
  const isNul = d.soort === 'NUL';
  const f = d.fiat || {};
  const afw = r.beleid ? {} : d.afwijkend || {};
  const onds = d.ondernemingen || [];
  const analyses = r.ondernemingen.filter((x) => isNul || x.meenemen || r.familie === 'ABN');
  const hoofdstukken = [];
  const voeg = (key, titel, html, extra = {}) => { if (gevuld(html)) hoofdstukken.push({ key, titel, html, ...extra }); };

  // ---- 1. Inkomen (of de beoordeling bij een 0-verklaring) ---------------------------------
  if (isNul) {
    voeg('inkomen', 'Beoordeling 0-verklaring', `<p><b>${esc(r.nul.conclusie)}</b></p>${r.kader === 'NHG' ? '<p class="dempen">Het NHG-toetskader voorziet niet in een nulverklaring. De kengetallen zijn beoordeeld op basis van de NHG-normen.</p>' : ''}
      ${r.nul.perOnderneming.map((o) => `<h3>${esc(o.naam)} ${pil(o.status)}</h3>${voorwaardenTabel(o.checks)}`).join('')}
      <h3>Zekerheden en verplichtingen</h3>${voorwaardenTabel(r.nul.zekerheden)}
      ${r.nul.maandlastCorrectie ? `<p><b>Correctie op de toegestane financieringslast: € ${esc(fmt.getal(r.nul.maandlastCorrectie))} per maand.</b></p>` : ''}`);
  } else {
    const handmatig = afw.actief
      ? kv([
        ['Berekend inkomen', esc(fmt.eur(r.berekend))],
        ['Afwijkend inkomen', esc(fmt.eur(num(afw.bedrag)))],
        ['Motivatie', esc(afw.motivatie || '')],
        ['Rekenkundige onderbouwing', esc(afw.onderbouwing || '')],
        ['Bestendigheid', esc(afw.bestendigheid || '')],
        ['Documentatie', esc(afw.documentatie || '')],
      ])
      : '<p>Geen handmatige wijzigingen.</p>';
    const correctieRijen = [];
    onds.forEach((o) => Object.entries(o.jaren || {}).forEach(([y, jd]) => {
      (jd.winstCorrecties || []).forEach((c) => correctieRijen.push([o.naam, y, WINST_CORRECTIES[c.type]?.label || c.type, c.bedrag, c.toelichting]));
      (jd.vermogensCorrecties || []).forEach((c) => correctieRijen.push([o.naam, y, VERMOGENS_CORRECTIES[c.type]?.label || c.type, c.bedrag, c.toelichting]));
    }));
    const correctieOverzicht = correctieRijen.length ? `<h3>Handmatige correcties</h3><div class="scroll"><table class="tabel"><thead><tr><th>Onderneming</th><th>Jaar</th><th>Soort</th><th class="num">Bedrag</th><th>Toelichting</th></tr></thead><tbody>
      ${correctieRijen.map(([naam, y, t, b, tl]) => `<tr><td>${esc(naam)}</td><td>${esc(y)}</td><td>${esc(t)}</td><td class="num">${esc(fmt.eur(num(b)))}</td><td>${esc(tl || '')}</td></tr>`).join('')}</tbody></table></div>` : '';
    const overwinstDeel = r.ondernemingen.filter((x) => x.box2?.overwinst
      && (kader.box2?.model === 'NHG' ? ['route2', 'combinatie'].includes(d.instellingen?.box2Route) : x.box2.overwinstMeenemen))
      .map((x) => `<h3>Overwinst en dubbele balanstoets: ${esc(x.naam)}</h3>${overwinstBlok(d, r, x, { bewerken: false })}`).join('');
    const geldstromen = uitgebreid && r.inkomen?.geldstromen?.length ? geldstromenTabel(r, r.inkomen.geldstromen) : '';
    voeg('inkomen', 'Inkomensvaststelling', `${inkomensVerloop(d, r)}${inkomensTabel(d, r)}
      ${toelichtingTabel(r)}
      ${r.inkomen?.stappen?.length ? `<ul class="rapport-stappen">${r.inkomen.stappen.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      <h3>Uitgangspunten van de berekening</h3>
      <ul>${kader.inkomensberekening.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h3>Handmatige wijzigingen (expert judgement)</h3>${handmatig}
      ${correctieOverzicht}
      ${overwinstDeel}
      ${geldstromen}`);
  }

  // ---- 2. Ondernemingen en structuur ---------------------------------------------------------
  const bedrijven = onds.map((o, i) => kv([
    [`Onderneming ${i + 1}`, `<b>${esc(o.naam || '')}</b>`],
    ['Rechtsvorm', esc(RECHTSVORMEN[o.rechtsvorm]?.label || o.rechtsvorm)],
    ['Startdatum KvK', esc(fmt.datum(o.startdatum))],
    ['KvK-nummer', esc(o.kvk || '')],
    o.website ? ['Website', esc(o.website)] : null,
    ['SBI', esc(o.sbi || '').replace(/\n/g, '<br>')],
    o.rechtsvorm !== 'EZ' ? ['Belang', belangTekst(d, r, o)] : null,
  ])).join('<div class="kv-tussen"></div>');
  const structuurDeel = onds.length > 1 || onds.some((o) => o.parentId) || (d.organogram?.knopen || []).length
    ? `<h3>Structuur (organogram)</h3><div class="og-canvas rapport-og">${organogramSVG(organogramGraaf(d), { losstaand: true })}</div>
      <pre class="notitie">${esc(organogramNotitie(d))}</pre>` : '';
  voeg('ondernemingen', onds.length === 1 ? 'Onderneming' : 'Ondernemingen en structuur', `${bedrijven || '<p class="dempen">Geen ondernemingen.</p>'}${structuurDeel}`);

  // ---- 3. Kengetallen en voorwaarden --------------------------------------------------------
  const perOnderneming = analyses.map((x) => {
    const aandacht = x.checks.filter((c) => c.status !== 'akkoord');
    const akkoord = x.checks.length - aandacht.length;
    const voorwaarden = isNul ? '' : uitgebreid
      ? `<h4>Voorwaarden</h4>${voorwaardenTabel(x.checks)}`
      : `${aandacht.length ? `<h4>Voorwaarden die aandacht vragen</h4>${voorwaardenTabel(aandacht)}` : ''}
        <p class="dempen klein">${aandacht.length ? `De overige ${akkoord} ${akkoord === 1 ? 'voorwaarde is' : 'voorwaarden zijn'} akkoord.` : `Alle ${akkoord} voorwaarden zijn akkoord.`}</p>`;
    return `<h3>${esc(x.naam)} ${pil(x.status)}</h3>
      ${kv([
        ['Soort ondernemer', x.soort === 'VPB' ? 'Niet-IB (DGA)' : 'IB-ondernemer'],
        ['Rechtsvorm', esc(x.rechtsvormLabel)],
        ['Startdatum (KvK of activiteiten)', esc(fmt.datum(x.start))],
        ['Aantal jaren ondernemer', esc(tekstDuur(x.duur))],
      ])}
      ${kengetallenTabel(x, r)}${voorwaarden}`;
  }).join('');
  voeg('kengetallen', isNul ? 'Kengetallen' : 'Kengetallen en voorwaarden',
    `${analyses.length > 1 ? ondernemingenMatrix(d, r, analyses, { links: false }) : ''}${perOnderneming}`);

  // ---- 4. Verplichtingen en onttrekking ------------------------------------------------------
  const zk = zkLijst(d);
  const maxOnttrekken = r.ondernemingen.filter((x) => x.maxOnttrekken !== undefined)
    .map((x) => (x.maxOnttrekkenNvt ? `${esc(x.naam)}: n.v.t. (${esc(x.maxOnttrekkenNvt)})` : `${esc(x.naam)}: ${esc(fmt.eur(x.maxOnttrekken, 2))}`)).join('<br>');
  voeg('verplichtingen', 'Verplichtingen en onttrekking', `
    ${zk.length ? `<h3>Zakelijke kredieten en lease</h3><ul>${zk.map((x) => `<li>${esc(zkTekst(x))}${x.toelichting ? ` (${esc(x.toelichting)})` : ''}</li>`).join('')}</ul>` : ''}
    ${r.rc?.tekst ? `<h3>Rekening-courant directie</h3><p>${esc(r.rc.tekst)}</p>` : ''}
    ${r.leningDirectie?.maandlast ? `<h3>Lening directie</h3><p>${esc(r.leningDirectie.tekst)}${d.leningDirectie?.hypothecair ? ' Hypothecaire zekerheid (eigen woning).' : ''}${d.leningDirectie?.toelichting ? ` ${esc(d.leningDirectie.toelichting)}` : ''}</p>` : ''}
    ${r.rc?.maandlast || r.leningDirectie?.maandlast ? kv([
      r.rc?.maandlast ? ['Maandlast R/C directie', esc(fmt.eur(r.rc.maandlast))] : null,
      r.leningDirectie?.maandlast ? ['Maandlast lening directie', esc(fmt.eur(r.leningDirectie.maandlast, 2))] : null,
    ]) : ''}
    <h3>Maximaal te onttrekken aan de onderneming</h3>
    <p class="dempen klein">Vlottende activa die kunnen worden onttrokken terwijl de onderneming nog aan de normen voor liquiditeit en solvabiliteit voldoet, op basis van de meest recente geanalyseerde balans.</p>
    <p>${maxOnttrekken || 'n.v.t.'}</p>`);

  // ---- 5. Toelichting --------------------------------------------------------------------------
  const notities = [
    ['Algemene informatie en organogram', n.algemeen],
    ['Broncontroles', n.broncontroles],
    ['KvK-adrescheck', n.kvkCheck],
    ['Google check (know your customer)', n.googleCheck],
    ...onds.map((o) => [`Financiële informatie ${o.naam || 'onderneming'}`, n.financieelOnderneming?.[o.id]]),
    ['Financiële informatie ondernemer in privé', n.priveTekst],
    ['Kredietbestemming en aflossing', n.kredietbestemming],
  ];
  const nietIngevuld = notities.filter(([, v]) => !gevuld(v)).map(([l]) => l);
  voeg('toelichting', 'Toelichting', `${notities.filter(([, v]) => gevuld(v)).map(([l, v]) => `<h3>${esc(l)}</h3>${pre(v)}`).join('')}
    ${nietIngevuld.length ? `<p class="dempen klein niet-ingevuld">Niet ingevuld: ${esc(nietIngevuld.join('; '))}.</p>` : ''}`);

  // ---- 6. Conclusie en beoordeling ------------------------------------------------------------
  const zakelijk = isNul
    ? `<p><b>${esc(r.nul.conclusie)}</b></p>`
    : r.beleid ? `<p>${r.beleid.bedrag === null ? 'Het toetsinkomen moet nog worden vastgesteld.' : `${r.beleid.bewijs ? 'Uitkomst op basis van bewijsstuk' : 'Voorlopige rekenindicatie'}: <b>${esc(fmt.eur(r.beleid.bedrag))}</b>.`} Leg de beoordeling volgens de route van de geldverstrekker vast.</p>`
    : r.bron === 'geen'
      ? '<p><b>Er kan géén zakelijk inkomen worden afgegeven.</b></p>'
      : r.bron === 'open' ? '<p>Het toetsinkomen staat open. Bekijk de onderbouwing bij Fiattering.</p>'
      : `<p>Het ${r.status === 'akkoord' ? 'vastgestelde' : 'voorlopige'} zakelijk inkomen bedraagt <b>${esc(fmt.eur(r.vastgesteld, 2))}</b>${r.bron === 'afwijkend' ? ' (afwijkend inkomen, zie handmatige wijzigingen)' : ''}.</p>
        ${r.status === 'akkoord' ? '<p>De berekende voorwaarden geven geen belemmering. De acceptant beoordeelt de bestendigheid en de onderliggende stukken.</p>' : '<p>Beoordeel de aandachtspunten en leg de onderbouwing vast voordat je het inkomen gebruikt.</p>'}`;
  const controles = n.controles || {};
  voeg('conclusie', 'Conclusie en beoordeling', `
    <h3>Zakelijk inkomen</h3>${zakelijk}
    <h3>Conclusie</h3>${pre(n.conclusie)}
    ${r.meldingen.length ? `<h3>Aandachtspunten uit de berekening</h3><ul>${r.meldingen.map((m) => `<li>${esc(STATUS_TEKST[m.niveau] || 'Info')}: ${esc(m.tekst)}</li>`).join('')}</ul>` : ''}
    <h3>Aandachtspunten voor adviseur en acceptant</h3>${kv([
      ['Datum afgifte', esc(fmt.datum(r.datum))],
      ['Niveau', esc(d.niveau || 'Basis')],
      ['Eerste fiatteur', esc(f.eerste?.naam || d.behandelaar || '')],
      r.beleid ? null : ['Geldig tot', esc(fmt.datum(r.geldigTot))],
      ['KYC', n.kyc ? 'Ja' : 'Nee'],
      r.beleid ? null : [isNul ? '0-inkomen' : `Berekend inkomen${kader.nhg ? ' (NHG)' : ' (zonder NHG)'}`, esc(isNul ? '€ 0' : fmt.eur(r.berekend))],
      !isNul && afw.actief ? ['Afwijkend inkomen', esc(fmt.eur(num(afw.bedrag)))] : null,
      r.rc?.maandlast ? ['Maandlast R/C directie', esc(fmt.eur(r.rc.maandlast))] : null,
    ])}
    <p class="dempen klein">Vraag altijd na of er nieuwere cijfers beschikbaar zijn of dat er noemenswaardige wijzigingen in de onderneming hebben plaatsgevonden.</p>
    <h3>Maatschappijspecifieke controles</h3>
    <div class="scroll"><table class="tabel"><thead><tr><th>Controlepunt</th><th>Resultaat</th></tr></thead><tbody>
      ${CONTROLES.map(([k, l]) => `<tr><td>${esc(l)}</td><td>${esc(controles[k] || 'Niet ingevuld')}</td></tr>`).join('')}</tbody></table></div>
    <h3>Beoordeling inkomensvaststelling</h3>
    <div class="scroll"><table class="tabel"><thead><tr><th>Controle</th><th>Tijdstip</th><th>Status</th><th>Behandelaar</th><th>Opmerkingen</th></tr></thead><tbody>
      <tr><td>1e fiat</td><td>${esc(fmt.tijdstip(f.eerste?.datum))}</td><td>${f.eerste ? 'Gereed gemeld' : 'Open'}</td><td>${esc(f.eerste?.naam || d.behandelaar || '')}</td><td>${esc(f.eerste?.opmerking || '')}</td></tr>
      <tr><td>2e fiat</td><td>${esc(fmt.tijdstip(f.tweede?.datum))}</td><td>${f.tweede?.resultaat === 'akkoord' ? 'Definitief akkoord' : f.tweede?.resultaat === 'niet_akkoord' ? 'Niet akkoord' : 'Open'}</td><td>${esc(f.tweede?.naam || '')}</td><td>${esc(f.tweede?.opmerking || '')}</td></tr>
    </tbody></table></div>
    <h3>Bijlagen</h3>${pre(n.bijlagen)}`);

  // ---- 7. Verantwoording ------------------------------------------------------------------------
  const algemeen = (r.trace?.secties || []).find((s) => s.groep === 'algemeen');
  const uitgangspunten = algemeen ? toelichtingRijen(algemeen).filter((x) => x.soort === 'stap' && x.uitkomst) : [];
  const bronnen = lijst('document').filter((x) => x.dossierId === d.id);
  const bronRijen = (r.documenten || []).map((x) => `<tr><th scope="row">${esc(x.naam)}</th><td>${esc(x.wanneer || '')}</td><td>${docAanwezig(bronnen, x) ? 'Geregistreerd' : x.verplicht ? 'Ontbreekt' : 'Indien van toepassing'}</td></tr>`).join('');
  voeg('verantwoording', 'Bronnen en toetskader', `${kv([
    ['Rapportnummer', esc(d.nummer || '')],
    ['Advieskantoor', esc(adv?.naam || 'Niet vastgelegd')],
    ['Ondernemer', esc(naamAanvrager(a))],
    ['Soort aanvraag', esc(SOORTEN[d.soort] || d.soort)],
    ['Gehanteerd toetskader', esc(`${kader.naam}, ${r.kaderVersie}`)],
    ['Status bron', esc(kader.bronStatus || '')],
    kader.aangepast ? ['Aangepaste parameters', esc(Object.entries(kader.aangepast).map(([k, v]) => `${(PARAM_LABELS[k] || [k])[0]}: ${PARAM_LABELS[k]?.[1] === 'pct' ? `${String(Math.round(v * 1000) / 10).replace('.', ',')}%` : String(v).replace('.', ',')}`).join('; '))] : null,
    ['Nationale Hypotheek Garantie', kader.nhg ? 'Ja' : 'Nee'],
    ['Aantal ondernemingen met direct of indirect belang', String(onds.length)],
    ['Ondernemingen', esc(onds.map((o) => o.naam).join(', '))],
    ['Datum vaststelling', esc(fmt.datumLang(r.datum))],
    r.beleid ? null : ['Geldig voor bindende offertes uitgebracht tot en met', esc(fmt.datumLang(r.geldigTot))],
  ])}
    ${uitgangspunten.length ? `<h3>Toetsjaren en controlejaar</h3>${kv(uitgangspunten.map((x) => [x.label, esc(x.uitkomst)]))}` : ''}
    ${bronRijen ? `<h3>Documentencheck</h3><p class="dempen klein">Geregistreerd geeft aan dat een stuk in het dossier staat. Controleer zelf inhoud en geldigheid.</p><div class="scroll"><table class="tabel"><thead><tr><th scope="col">Bronstuk</th><th scope="col">Periode of toepassing</th><th scope="col">Dossierstatus</th></tr></thead><tbody>${bronRijen}</tbody></table></div>` : ''}`);

  // ---- Bijlagen (alleen uitgebreid): rekenstappen en cijfers ------------------------------------
  if (uitgebreid) {
    analyses.forEach((x) => {
      const ond = onds.find((o) => o.id === x.id) || {};
      voeg(`ond-${x.id}`, `${x.naam}: rekenstappen en cijfers`, `${renderTrace(x.trace)}
        <h3>Financiële gegevens</h3>${financieleTabel(ond, r, 'balans')}<div class="kv-tussen"></div>${financieleTabel(ond, r, 'vw')}`, { bijlage: true });
    });
    if (!isNul) voeg('totaal', 'Totaalberekening', renderTrace(r.trace), { bijlage: true });
  }

  let nr = 0;
  let letter = 0;
  hoofdstukken.forEach((h) => {
    if (h.bijlage) { h.nr = String.fromCharCode(65 + letter); letter += 1; } else { nr += 1; h.nr = String(nr); }
  });
  return {
    titel: isNul ? 'Rapport 0-verklaring' : 'Rapport zakelijk inkomen',
    kern: kernBlok(d, r, kader),
    hoofdstukken,
  };
}

function hoofdstukHTML(h) {
  const sleutel = `rap:${h.key}`;
  const dicht = ingeklapt(sleutel, h.key !== 'inkomen');
  const id = `rap-${h.key}`;
  return `${h.bijlage ? '<div class="paginabreuk"></div>' : ''}<section class="hoofdstuk klap${dicht ? ' ingeklapt' : ''}${h.bijlage ? ' bijlage' : ''}" id="${esc(id)}" data-klap="${esc(sleutel)}">
    <h2 class="hoofdstuk-kop"><button type="button" data-actie="klap" data-sleutel="${esc(sleutel)}" aria-expanded="${!dicht}" aria-controls="${esc(id)}-inhoud">
      <span class="nr">${h.bijlage ? `Bijlage ${esc(h.nr)}` : esc(h.nr)}</span><span class="hoofdstuk-titel">${esc(h.titel)}</span>${icoon('open')}</button></h2>
    <div class="klap-inhoud" id="${esc(id)}-inhoud">${h.html}</div></section>`;
}

/** Het rapport zelf (zonder werkbalk en inhoudsopgave), in de gekozen weergave. */
export function renderRapport(d, r, modus = ui.rapportModus, gebouwd = bouwRapport(d, r, modus)) {
  const { titel, kern, hoofdstukken } = gebouwd;
  return `<article class="rapport" id="rapport">
    <header class="rapport-kop">
      <div class="rapport-soort">${esc(titel)}</div>
      <h1>${esc(naamAanvrager(d.aanvrager))}</h1>
      <div class="vertrouwelijk">${modus === 'uitgebreid' ? 'Uitgebreide rapportage' : 'Korte rapportage'}${d.nummer ? `, dossier ${esc(d.nummer)}` : ''}. Vertrouwelijk: uitsluitend bestemd voor intern gebruik.</div>
    </header>
    ${kern}
    ${hoofdstukken.map(hoofdstukHTML).join('')}
  </article>`;
}

/** Rapport met werkbalk (kort of uitgebreid, formules, in- en uitklappen, afdrukken) en een inhoudsopgave die meeloopt. */
export function renderRapportPagina(d, r) {
  const modus = ui.rapportModus;
  const gebouwd = bouwRapport(d, r, modus);
  const { hoofdstukken } = gebouwd;
  // In een ingesloten voorbeeldweergave (ZIB_ARTIFACT) kan de pagina niet afdrukken: download het rapport
  // dan als HTML-bestand en druk dat af vanuit de browser.
  const afdrukken = globalThis.ZIB_ARTIFACT ? '' : `<button class="knop" data-actie="afdrukken">${icoon('afdruk')}Afdrukken of pdf</button>`;
  const inhoud = [['rap-kern', '', 'Kern'], ...hoofdstukken.map((h) => [`rap-${h.key}`, h.nr, h.titel, h.bijlage])];
  return `<div class="rapport-werkbalk geen-print">
      ${r.inkomensanalyse ? '' : `<div class="segment" role="group" aria-label="Weergave van het rapport">
        <button type="button" class="${modus === 'kort' ? 'actief' : ''}" aria-pressed="${modus === 'kort'}" data-actie="rapport-modus" data-modus="kort">Kort</button>
        <button type="button" class="${modus === 'uitgebreid' ? 'actief' : ''}" aria-pressed="${modus === 'uitgebreid'}" data-actie="rapport-modus" data-modus="uitgebreid">Uitgebreid</button>
      </div>
      <span class="dempen klein rapport-modus-uitleg">${modus === 'kort'
    ? 'Kern, inkomen, kengetallen en conclusie. Uitgebreid voegt geldstromen en per onderneming de rekenstappen en cijfers toe.'
    : 'Alles, met als bijlagen de rekenstappen, balans en winst- en verliesrekening per onderneming.'}</span>`}
      <span class="vul"></span>
      ${r.inkomensanalyse ? '' : weergaveOpties({ formules: modus === 'uitgebreid' })}
      ${afdrukken}
      <button class="knop sec" data-actie="rapport-download" title="Download het complete rapport als zelfstandig HTML-bestand">${icoon('download')} HTML downloaden</button>
      <button class="knop sec" data-actie="kopieer-notities">Kopieer dossiernotities</button>
    </div>
    <div class="rapport-wrap${ui.formules ? '' : ' zonder-formules'}"><div class="rapport-opmaak">
      <nav class="rapport-inhoud geen-print" data-spy aria-label="Inhoud van het rapport">
        <div class="rapport-inhoud-kop">Inhoud</div>
        ${inhoud.map(([doel, nr, titel, bijlage]) => `<button type="button" data-actie="naar-sectie" data-doel="${esc(doel)}"${bijlage ? ' class="bijlage"' : ''}><span class="nr">${esc(nr)}</span><span>${esc(titel)}</span></button>`).join('')}
      </nav>
      ${renderRapport(d, r, modus, gebouwd)}
    </div></div>`;
}

/** Platte tekst in de opbouw van de dossiernotities (om te plakken in een archief- of acceptatiesysteem). */
export function dossierNotitiesTekst(d, r) {
  const n = d.notities || {};
  const regels = [];
  if (r.inkomensanalyse) {
    regels.push('Inkomensanalyse', `Aanvrager\t${naamAanvrager(d.aanvrager)}`, '', 'Uitkomsten per toetskader');
    for (const x of vergelijkKaders(d)) regels.push(`${x.kort}\t${analyseBedragVoorDossier(d, x)}\t${STATUS_TEKST[x.status] || ''}`);
    if (n.algemeen) regels.push('', 'Toelichting', n.algemeen);
    if (n.conclusie) regels.push('', 'Conclusie', n.conclusie);
    return regels.join('\n');
  }
  const kader = r.kaderCfg || kaderVoor(d);
  regels.push('Algemeen');
  regels.push(`Aanvrager\t${naamAanvrager(d.aanvrager)}`);
  regels.push(`Soort aanvraag\t${SOORTEN[d.soort] || d.soort}`);
  regels.push(`Toetskader\t${kader.kort}, ${r.kaderVersie}`);
  regels.push(`Aantal ondernemingen\t${(d.ondernemingen || []).length}`);
  regels.push('');
  regels.push('Onderneming(en)');
  (d.ondernemingen || []).forEach((o, i) => {
    regels.push(`Onderneming ${i + 1}\t${o.naam}`);
    regels.push(`Rechtsvorm\t${RECHTSVORMEN[o.rechtsvorm]?.label || o.rechtsvorm}`);
    regels.push(`KvK nummer\t${o.kvk || ''}`);
    regels.push(`Startdatum KvK\t${fmt.datum(o.startdatum)}`);
    regels.push(`Bedrijfsactiviteiten\t${String(o.sbi || '').replace(/\n/g, '; ')}`);
    regels.push('');
  });
  regels.push('Toelichting vooraf');
  regels.push(n.algemeen || '');
  regels.push('');
  if (n.broncontroles) { regels.push('Broncontroles', n.broncontroles, ''); }
  if (n.kvkCheck) { regels.push('KvK check', n.kvkCheck, ''); }
  if (n.googleCheck) { regels.push('Google check', n.googleCheck, ''); }
  regels.push("Ratio's en voorwaarden");
  r.ondernemingen.forEach((a) => {
    const jaren = ordeJarenOverzicht(r.C ? [...r.T, r.C] : [...r.T]);
    regels.push(a.naam);
    regels.push(`KENGETALLEN\t${jaren.join('\t')}\tResultaat`);
    regels.push(`Winstgevendheid\t${jaren.map((y) => fmt.eur(y === r.C ? a.jaren[y]?.winst.NWcorExtr : a.jaren[y]?.winst.NWcor)).join('\t')}\t${STATUS_TEKST[a.checks.find((c) => c.key === 'winst')?.status] || ''}`);
    regels.push(`Liquiditeit - current ratio\t${jaren.map((y) => fmt.ratio(a.jaren[y]?.CR)).join('\t')}\t${STATUS_TEKST[a.checks.find((c) => c.key === 'liquiditeit')?.status] || ''}`);
    regels.push(`Liquiditeit - werkkapitaal\t${jaren.map((y) => fmt.getal(a.jaren[y]?.WK ?? 0)).join('\t')}`);
    regels.push(`Solvabiliteit\t${jaren.map((y) => fmt.pct(a.jaren[y]?.SV)).join('\t')}\t${STATUS_TEKST[a.checks.find((c) => c.key === 'solvabiliteit')?.status] || ''}`);
    regels.push(`TOTAALRESULTAAT\t${STATUS_TEKST[a.status]}`);
    regels.push('');
  });
  regels.push('Inkomen');
  if (d.soort === 'NUL') {
    regels.push(r.nul.conclusie);
  } else {
    kader.inkomensberekening.forEach((x) => regels.push(`- ${x}`));
    regels.push('');
    regels.push('Handmatige wijzigingen (expert / professional judgement)');
    regels.push(!r.beleid && d.afwijkend?.actief ? `Afwijkend inkomen ${fmt.eur(num(d.afwijkend.bedrag))}: ${d.afwijkend.motivatie || ''}` : 'Geen handmatige wijzigingen.');
    regels.push('');
    regels.push('Zakelijk inkomen');
    regels.push(r.beleid ? r.beleid.bedrag === null ? 'Toetsinkomen nog te bepalen.' : `${r.beleid.bewijs ? 'Uitkomst op basis van bewijsstuk' : 'Voorlopige rekenindicatie'}: ${fmt.eur(r.beleid.bedrag)}; ter beoordeling.`
      : r.bron === 'geen' ? 'Er kan géén zakelijk inkomen worden afgegeven.' : r.bron === 'open' ? 'Het toetsinkomen staat open.' : `Het zakelijk inkomen bedraagt ${fmt.eur(r.vastgesteld, 2)}`);
  }
  if (n.priveTekst) { regels.push('', 'Financiële informatie ondernemer in privé', n.priveTekst); }
  if (n.kredietbestemming) { regels.push('', 'Kredietbestemming en aflossing', n.kredietbestemming); }
  if (n.conclusie) { regels.push('', 'Conclusie', n.conclusie); }
  if (n.bijlagen) { regels.push('', 'Bijlagen', n.bijlagen); }
  return regels.join('\n');
}

// ---------------------------------------------------------------------------
// Concepttekst voor de notities, opgebouwd uit de invoer (zoals de eigen dossiernotities:
// per onderneming de W&V, balansbijzonderheden, geldstromen, dividend en kredieten).
// ---------------------------------------------------------------------------
const e = (x) => fmt.eur(num(x));

function perJaar(jaren, fn) {
  return jaren.map((y) => [y, fn(y)]).filter(([, v]) => v !== null && v !== undefined && v !== '' && (typeof v === 'string' || num(v) !== 0));
}

function jaarLijst(paren) {
  return paren.map(([y, v]) => `${y}: ${typeof v === 'string' ? v : e(v)}`).join(', ');
}

export function conceptFinancieel(d, r, ondId) {
  const o = (d.ondernemingen || []).find((x) => x.id === ondId);
  const a = r.ondernemingen.find((x) => x.id === ondId);
  if (!o || !a) return '';
  const jarenC = ordeJarenOverzicht(r.C ? [...r.T, r.C] : [...r.T]);
  const ouder = (d.ondernemingen || []).find((x) => x.id === o.parentId);
  const kinderen = (d.ondernemingen || []).filter((x) => x.parentId === o.id || (x.extraParents || []).some((p) => p.id === o.id));
  const regels = [];
  regels.push(`${o.naam} (${RECHTSVORMEN[o.rechtsvorm]?.label || o.rechtsvorm}${o.rechtsvorm !== 'EZ' ? `, belang ${fmt.pct(a.aandeel, 0)}` : ''}${ouder ? `, deelneming van ${ouder.naam}` : ''})`);
  regels.push('Algemeen');
  if (o.activiteit) regels.push(`- Activiteit: ${o.activiteit}`);
  if (isIngevuld(o.medewerkers)) regels.push(`- Gemiddeld ongeveer ${o.medewerkers} medewerkers`);
  regels.push(`- Onderneming sinds ${fmt.datum(a.start) || 'onbekend'} (${tekstDuur(a.duur)})`);
  const statussen = jarenC.filter((y) => a.jaren[y]).map((y) => `${y} ${a.jaren[y].status}${a.jaren[y].isC ? ` t/m ${fmt.datum(a.jaren[y].tot)}` : ''}`);
  if (statussen.length) regels.push(`- Cijfers: ${statussen.join(', ')}`);
  regels.push('');
  regels.push('Winst- en verliesrekening');
  const omzet = perJaar(jarenC, (y) => (a.jaren[y]?.heeftVW ? a.jaren[y].vw.OMZET : null));
  if (omzet.length) regels.push(`- Omzet: ${jaarLijst(omzet)}`);
  const nw = perJaar(jarenC, (y) => (a.jaren[y]?.heeftVW ? a.jaren[y].winst.NWcor : null));
  if (nw.length) regels.push(`- Nettowinst na correcties: ${jaarLijst(nw)}`);
  const wc = [];
  jarenC.forEach((y) => {
    const j = a.jaren[y];
    if (!j) return;
    [...j.winst.pos.map((x) => [x, 1]), ...j.winst.neg.map((x) => [x, -1])].forEach(([x, t]) => wc.push(`${x.label} ${y}: ${e(t * x.bedrag)}${x.toelichting ? ` (${x.toelichting})` : ''}`));
  });
  if (wc.length) regels.push(`- Correcties: ${wc.join('; ')}`);
  if (ouder) {
    const fee = perJaar(jarenC, (y) => num(o.jaren?.[y]?.bzi?.managementFee) || null);
    if (fee.length) {
      regels.push(`- Management fee aan ${ouder.naam}: ${fee.map(([y, v]) => {
        const ontv = ouder.jaren?.[y]?.geldstromen?.ontvangenFee?.[o.id];
        return `${y}: ${e(v)}${isIngevuld(ontv) ? ` (verantwoord bij ${ouder.naam}: ${e(ontv)}${Math.abs(num(ontv) - v) > 1 ? `, verschil ${e(v - num(ontv))}` : ''})` : ''}`;
      }).join(', ')}`);
    }
  }
  kinderen.forEach((k) => {
    const ontv = perJaar(jarenC, (y) => (isIngevuld(o.jaren?.[y]?.geldstromen?.ontvangenFee?.[k.id]) ? num(o.jaren[y].geldstromen.ontvangenFee[k.id]) : null));
    if (ontv.length) regels.push(`- Ontvangen management fee van ${k.naam}: ${jaarLijst(ontv)}`);
  });
  regels.push('');
  regels.push('Balans');
  const sv = perJaar(jarenC, (y) => (a.jaren[y]?.heeftBalans && a.jaren[y].SV !== null ? fmt.pct(a.jaren[y].SV, 0) : null));
  if (sv.length) regels.push(`- Solvabiliteit na correcties: ${sv.map(([y, v]) => `${y}: ${v}`).join(', ')}`);
  const cr = perJaar(jarenC, (y) => (a.jaren[y]?.heeftBalans && a.jaren[y].CR !== null ? fmt.ratio(a.jaren[y].CR) : null));
  if (cr.length) regels.push(`- Current ratio na correcties: ${cr.map(([y, v]) => `${y}: ${v}`).join(', ')}`);
  const vc = [];
  jarenC.forEach((y) => (a.jaren[y]?.corr.items || []).forEach((x) => vc.push(`${x.label} ${y}: ${e(x.av)}`)));
  if (vc.length) regels.push(`- Vermogenscorrecties: ${vc.join('; ')}`);
  const nietVrij = perJaar(jarenC, (y) => {
    const jd = o.jaren?.[y] || {};
    return num(jd.balans?.liquideNietVrij) || num(jd.bzi?.vaDetail?.nietVrij) || null;
  });
  if (nietVrij.length) regels.push(`- Liquide middelen niet ter vrije beschikking (G-rekening): ${jaarLijst(nietVrij)}`);
  const ntv = perJaar(jarenC, (y) => a.jaren[y]?.geldstroom.nogTeOntvangenDividend || null);
  if (ntv.length) regels.push(`- Nog te ontvangen dividend (overlopende activa): ${jaarLijst(ntv)}`);
  const rcDga = perJaar(jarenC, (y) => num(o.jaren?.[y]?.balans?.vordDGAKort) || num(o.jaren?.[y]?.bzi?.vaDetail?.rcDirectie) || null);
  if (rcDga.length) regels.push(`- Rekening-courant directie (vordering op DGA): ${jaarLijst(rcDga)}`);
  const dga = perJaar(jarenC, (y) => num(o.jaren?.[y]?.balans?.fvaDGA) || null);
  if (dga.length) regels.push(`- Lening u/g aan DGA: ${jaarLijst(dga)}`);
  regels.push('');
  const dividendRegels = [];
  if (ouder) {
    const pctOuder = Math.min(1, Math.max(0, (isIngevuld(o.aandeelPct) ? num(o.aandeelPct) : 100) / 100));
    const id = perJaar(jarenC, (y) => num(o.jaren?.[y]?.bzi?.internDividend) || null);
    if (id.length && pctOuder < 1) dividendRegels.push(`- Intern dividend uitgekeerd (totaal): ${jaarLijst(id)}`);
    if (id.length) {
      dividendRegels.push(`- Uitgekeerd dividend aan ${ouder.naam}${pctOuder < 1 ? ` (${fmt.pct(pctOuder, 0)})` : ''}: ${id.map(([y, v]) => {
        const ontv = ouder.jaren?.[y]?.geldstromen?.ontvangenDividend?.[o.id];
        const deel = Math.round(v * pctOuder);
        return `${y}: ${e(deel)}${isIngevuld(ontv) ? ` (ontvangen volgens ${ouder.naam}: ${e(ontv)}${Math.abs(num(ontv) - deel) > 1 ? `, verschil ${e(deel - num(ontv))}` : ''})` : ''}`;
      }).join(', ')}`);
    }
  }
  kinderen.forEach((k) => {
    const ontv = perJaar(jarenC, (y) => (isIngevuld(o.jaren?.[y]?.geldstromen?.ontvangenDividend?.[k.id]) ? num(o.jaren[y].geldstromen.ontvangenDividend[k.id]) : null));
    if (ontv.length) dividendRegels.push(`- Ontvangen dividend van ${k.naam}: ${jaarLijst(ontv)}`);
  });
  if (!o.parentId) {
    const bg = perJaar(jarenC, (y) => (isIngevuld(o.jaren?.[y]?.geldstromen?.dividendDGA) ? num(o.jaren[y].geldstromen.dividendDGA) : null));
    if (bg.length) dividendRegels.push(`- Betaalbaar gesteld dividend (DGA in privé): ${bg.map(([y, v]) => `${y}: ${e(v)} (box 2: ${e(d.ib?.[y]?.perOnd?.[o.id]?.dividend)})`).join(', ')}`);
  }
  if (dividendRegels.length) regels.push('Dividend', ...dividendRegels, '');
  const zk = zkLijst(d).filter((x) => x.ondId === o.id);
  if (zk.length) regels.push('ZK', ...zk.map((x) => `- ${zkTekst(x)}${x.toelichting ? ` (${x.toelichting})` : ''}`), '');
  return regels.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Algemene concepttekst: (eerdere en huidige) structuur en DGA-inkomen lopend jaar uit de salarisstrook. */
export function conceptAlgemeen(d) {
  const regels = [];
  if (d.bestaandeRelatie) regels.push(`Betreft een bestaande relatie van ${d.label || 'ABN AMRO'}${d.relatienummer ? ` (${d.relatienummer})` : ''}.`, '');
  regels.push(organogramNotitie(d));
  Object.entries(d.salarisStrook || {}).forEach(([id, s]) => {
    if (!s?.f) return;
    const o = (d.ondernemingen || []).find((x) => x.id === id);
    regels.push('', `DGA-inkomen ${s.jaar}${o ? ` (${o.naam})` : ''} geëxtrapoleerd voor invoer (salarisstrook${s.strookTm ? ` t/m ${s.strookTm}` : ''}, tussentijdse cijfers t/m maand ${s.maanden}): ${s.f}`);
  });
  return regels.join('\n');
}
