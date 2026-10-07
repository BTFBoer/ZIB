// Organogram: grafisch (SVG, zoals een getekend organogram met personen als ovaal, een STAK als
// driehoek en vennootschappen als rechthoek) en als ingesprongen tekst voor de dossiernotities.
// De structuur komt uit de ondernemingen in de berekening (onderdeel van, belang, gedeelde
// deelnemingen) aangevuld met overige knopen: medeaandeelhouders, certificaathouders, een STAK of
// vennootschappen buiten de berekening.
import { esc, fmt, isIngevuld } from '../util.js';
import { organogramGraaf, organogramTekst, KNOOP_SOORTEN } from '../engine/index.js';
import { keuze, melding, icoon } from './ui.js';
import { ui } from './uistate.js';

const GAP_X = 28;
const RIJ_Y = 132;
const MARGE = 24;

function woorden(tekst, max) {
  const regels = [];
  let r = '';
  String(tekst || '').split(/\s+/).filter(Boolean).forEach((w) => {
    if (!r) r = w;
    else if ((`${r} ${w}`).length <= max) r = `${r} ${w}`;
    else { regels.push(r); r = w; }
  });
  if (r) regels.push(r);
  return regels.slice(0, 3);
}

function maat(k) {
  const naam = woorden(k.naam, k.soort === 'persoon' ? 18 : 24);
  const sub = k.sub ? woorden(k.sub, 26).slice(0, 2) : [];
  const breedsteTekst = Math.max(...[...naam, ...sub].map((x) => x.length), 6);
  if (k.soort === 'persoon') return { w: Math.max(132, breedsteTekst * 7 + 34), h: 52 + 13 * (naam.length + sub.length - 1), naam, sub };
  if (k.soort === 'stak') return { w: Math.max(196, breedsteTekst * 7 + 70), h: 96 + 12 * Math.max(0, naam.length + sub.length - 2), naam, sub };
  return { w: Math.max(150, breedsteTekst * 6.8 + 26), h: 34 + 14 * (naam.length + sub.length), naam, sub };
}

/** Gelaagde indeling: niveau = langste pad vanaf een knoop zonder aandeelhouders; volgorde met barycentra. */
function indeling(graaf) {
  const knopen = graaf.knopen.map((k, i) => ({ ...k, ...maat(k), i }));
  const byId = new Map(knopen.map((k) => [k.id, k]));
  const lijnen = graaf.lijnen.filter((l) => byId.has(l.van) && byId.has(l.naar));
  const ouders = new Map(knopen.map((k) => [k.id, []]));
  const kinderen = new Map(knopen.map((k) => [k.id, []]));
  lijnen.forEach((l) => { ouders.get(l.naar).push(l.van); kinderen.get(l.van).push(l.naar); });
  // Losse knopen (zonder lijnen) en de aanvrager zonder ondernemingen tonen we gewoon op niveau 0.
  const niveau = new Map();
  const bepaal = (id, pad) => {
    if (niveau.has(id)) return niveau.get(id);
    const p = ouders.get(id).filter((x) => !pad.has(x));
    const n = p.length ? Math.max(...p.map((x) => bepaal(x, new Set([...pad, id])))) + 1 : 0;
    niveau.set(id, n);
    return n;
  };
  knopen.forEach((k) => bepaal(k.id, new Set([k.id])));
  const aantal = Math.max(0, ...niveau.values()) + 1;
  const lagen = Array.from({ length: aantal }, () => []);
  knopen.forEach((k) => { k.niveau = niveau.get(k.id); lagen[k.niveau].push(k); });
  const pos = () => { lagen.forEach((laag) => laag.forEach((k, i) => { k.pos = i; })); };
  pos();
  const gem = (ids) => (ids.length ? ids.reduce((s, id) => s + byId.get(id).pos, 0) / ids.length : null);
  for (let iter = 0; iter < 6; iter += 1) {
    for (let n = 1; n < aantal; n += 1) {
      lagen[n].sort((a, b) => (gem(ouders.get(a.id)) ?? a.pos) - (gem(ouders.get(b.id)) ?? b.pos) || a.i - b.i);
      lagen[n].forEach((k, i) => { k.pos = i; });
    }
    for (let n = aantal - 2; n >= 0; n -= 1) {
      lagen[n].sort((a, b) => (gem(kinderen.get(a.id)) ?? a.pos) - (gem(kinderen.get(b.id)) ?? b.pos) || a.i - b.i);
      lagen[n].forEach((k, i) => { k.pos = i; });
    }
  }
  // Horizontale posities: eerst gecentreerd, daarna naar het midden van de aandeelhouders/deelnemingen.
  const breedte = (laag) => laag.reduce((s, k) => s + k.w, 0) + GAP_X * Math.max(0, laag.length - 1);
  const W = Math.max(...lagen.map(breedte), 200);
  lagen.forEach((laag) => {
    let x = (W - breedte(laag)) / 2;
    laag.forEach((k) => { k.x = x + k.w / 2; x += k.w + GAP_X; });
  });
  const plaats = (laag, gewenst) => {
    if (!laag.length) return;
    const x = laag.map((k, i) => gewenst[i] ?? k.x);
    for (let i = 1; i < laag.length; i += 1) {
      const min = x[i - 1] + (laag[i - 1].w + laag[i].w) / 2 + GAP_X;
      if (x[i] < min) x[i] = min;
    }
    const verschuiving = laag.reduce((s, k, i) => s + ((gewenst[i] ?? k.x) - x[i]), 0) / laag.length;
    laag.forEach((k, i) => { k.x = x[i] + verschuiving; });
  };
  const midden = (ids) => (ids.length ? ids.reduce((s, id) => s + byId.get(id).x, 0) / ids.length : null);
  for (let iter = 0; iter < 4; iter += 1) {
    for (let n = 1; n < aantal; n += 1) plaats(lagen[n], lagen[n].map((k) => midden(ouders.get(k.id))));
    for (let n = aantal - 2; n >= 0; n -= 1) plaats(lagen[n], lagen[n].map((k) => midden(kinderen.get(k.id))));
  }
  for (let n = 1; n < aantal; n += 1) plaats(lagen[n], lagen[n].map((k) => midden(ouders.get(k.id))));
  const minX = Math.min(...knopen.map((k) => k.x - k.w / 2));
  knopen.forEach((k) => { k.x = k.x - minX + MARGE; k.y = MARGE + k.niveau * RIJ_Y + 48; });
  const maxX = Math.max(...knopen.map((k) => k.x + k.w / 2)) + MARGE;
  const maxY = Math.max(...knopen.map((k) => k.y + k.h / 2)) + MARGE;
  return { knopen, byId, lijnen, breedte: Math.ceil(maxX), hoogte: Math.ceil(maxY) };
}

const KLEUREN = { inkt: '#1f2d2b', grijs: '#5f6b69', lijn: '#9aa6a3', accent: '#00716b', vlak: '#ffffff', mint: '#e6f2ef', extern: '#f4f6f5' };
// Kleuren per certificaatklasse (STAK → vennootschap) voor de losse afbeelding; in de app via de tokens --og-k0..4.
const KLASSE_KLEUREN = ['#c0392b', '#2563c9', '#7b4bb7', '#a86a12', '#2f855a'];

function tekstBlok(k, cx, startY, kleur) {
  const regels = [];
  let y = startY;
  k.naam.forEach((t) => { regels.push(`<text x="${cx}" y="${y}" text-anchor="middle" class="og-naam" font-weight="700" font-size="12"${kleur ? ` fill="${kleur.inkt}"` : ''}>${esc(t)}</text>`); y += 14; });
  k.sub.forEach((t) => { regels.push(`<text x="${cx}" y="${y}" text-anchor="middle" class="og-sub" font-size="10.5"${kleur ? ` fill="${kleur.grijs}"` : ''}>${esc(t)}</text>`); y += 13; });
  return regels.join('');
}

function vorm(k, kleur) {
  const { x, y, w, h } = k;
  const stijl = (fill, stroke, dik = 1.4, streep = '') => (kleur
    ? ` fill="${fill}" stroke="${stroke}" stroke-width="${dik}"${streep ? ` stroke-dasharray="${streep}"` : ''}` : '');
  const regels = k.naam.length + k.sub.length;
  if (k.soort === 'persoon') {
    const cls = k.rol === 'aanvrager' ? 'og-persoon og-aanvrager' : 'og-persoon';
    return `<ellipse class="${cls}" cx="${x}" cy="${y}" rx="${w / 2}" ry="${h / 2}"${stijl(k.rol === 'aanvrager' ? KLEUREN.mint : KLEUREN.vlak, KLEUREN.inkt)}/>${tekstBlok(k, x, y - ((regels - 1) * 13.5) / 2 + 4, kleur)}`;
  }
  if (k.soort === 'stak') {
    const top = y - h / 2;
    const bodem = y + h / 2;
    return `<polygon class="og-stak" points="${x},${top} ${x + w / 2},${bodem} ${x - w / 2},${bodem}"${stijl(KLEUREN.vlak, KLEUREN.inkt)}/>${tekstBlok(k, x, bodem - 12 - (regels - 1) * 13.5, kleur)}`;
  }
  const cls = k.rol === 'analyse' ? 'og-bv og-analyse' : 'og-bv og-extern';
  const s = k.rol === 'analyse' ? stijl(KLEUREN.vlak, KLEUREN.accent, 2) : stijl(KLEUREN.extern, KLEUREN.grijs, 1.2, '4 3');
  return `<rect class="${cls}" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3"${s}/>${tekstBlok(k, x, y - ((regels - 1) * 13.5) / 2 + 4, kleur)}`;
}

/** Organogram als SVG. Met `losstaand` krijgt elk element vaste kleuren (voor downloaden en afdrukken). */
export function organogramSVG(graaf, { losstaand = false } = {}) {
  if (!graaf.knopen.length) return '';
  const L = indeling(graaf);
  const kleur = losstaand ? KLEUREN : null;
  const lijnen = L.lijnen.map((l) => {
    const a = L.byId.get(l.van);
    const b = L.byId.get(l.naar);
    const x1 = a.x;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y - b.h / 2;
    const t = 0.24;
    const lx = x1 + (x2 - x1) * t;
    const ly = y1 + (y2 - y1) * t;
    const pct = l.pct !== null && l.pct !== undefined ? `${fmt.getal(Math.round(l.pct * 1000) / 10, l.pct * 100 % 1 ? 1 : 0)}%` : '';
    const k = Number.isInteger(l.klasse) ? l.klasse % KLASSE_KLEUREN.length : null;
    const cls = `og-lijn${l.soort === 'certificaten' ? ' og-cert' : ''}${l.extern ? ' og-lijn-extern' : ''}${k !== null ? ` og-k${k}` : ''}`;
    const st = !kleur ? '' : k !== null ? ` stroke="${KLASSE_KLEUREN[k]}" stroke-width="1.6" stroke-dasharray="4 3"`
      : ` stroke="${l.extern ? KLEUREN.grijs : KLEUREN.inkt}" stroke-width="1.3"${l.soort === 'certificaten' ? ' stroke-dasharray="3 3"' : ''}`;
    return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${st}/>${pct ? `<text class="og-pct" x="${lx + 6}" y="${ly + 4}" font-size="11"${kleur ? ` fill="${KLEUREN.inkt}" stroke="#ffffff" stroke-width="3" paint-order="stroke"` : ''}>${esc(pct)}${l.soort === 'certificaten' ? ' cert.' : ''}</text>` : ''}`;
  }).join('');
  const knopen = L.knopen.map((k) => `<g class="og-knoop">${vorm(k, kleur)}</g>`).join('');
  const font = losstaand ? ' font-family="Arial, Helvetica, sans-serif"' : '';
  return `<svg class="organogram-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.breedte} ${L.hoogte}" width="${L.breedte}" height="${L.hoogte}" role="img" aria-label="Organogram"${font}>
    ${losstaand ? `<rect width="100%" height="100%" fill="#ffffff"/>` : ''}<g>${lijnen}</g><g>${knopen}</g></svg>`;
}

const SOORT_LIJN = { aandelen: 'Aandelen', certificaten: 'Certificaten (via STAK)' };

/** Vennootschappen waarvan een STAK aandelen houdt (keuze "Certificaten van"); zonder lijnen alle knopen. */
function certOpties(graaf, stakId, alle) {
  const gehouden = new Set(graaf.lijnen.filter((l) => l.van === stakId && l.soort === 'aandelen').map((l) => l.naar));
  const opties = alle.filter(([id]) => gehouden.has(id));
  return opties.length ? opties : alle.filter(([id]) => id !== 'aanvrager' && id !== stakId);
}

/** Organogram met (optioneel) de invoer voor overige aandeelhouders, een STAK en eerdere situaties. */
export function paneelOrganogram(d, { bewerken = false, titel = 'Organogram' } = {}) {
  const graaf = organogramGraaf(d);
  const og = d.organogram || {};
  const tekst = organogramTekst(d);
  const grafisch = ui.organogramWeergave !== 'tekst';
  const knoopOpties = graaf.knopen.map((k) => [k.id, k.naam]);
  const editor = bewerken ? `<details class="stappen og-editor"${(og.knopen || []).length ? ' open' : ''}><summary>Overige aandeelhouders, personen en STAK</summary><div class="inhoud">
      <p class="dempen klein">Leg hier vast wie de overige aandelen houdt (medeaandeelhouders, hun holdings, een STAK met certificaathouders). Deze partijen tellen niet mee in de berekening en het toetskader, maar maken het organogram compleet en zijn te kiezen als tegenpartij bij de geldstromen.</p>
      <div class="scroll"><table class="tabel compact invoer-tabel"><thead><tr><th>Soort</th><th>Naam</th><th>Toelichting (bijv. bestuurder STAK)</th><th></th></tr></thead><tbody>
        ${(og.knopen || []).map((k, i) => `<tr>
          <td>${keuze(null, `organogram.knopen.${i}.soort`, KNOOP_SOORTEN, k.soort || 'persoon', { render: true })}</td>
          <td><input value="${esc(k.naam || '')}" data-bind="organogram.knopen.${i}.naam" data-type="tekst" data-render="1" aria-label="Naam" placeholder="Naam"></td>
          <td><input value="${esc(k.toelichting || '')}" data-bind="organogram.knopen.${i}.toelichting" data-type="tekst" data-render="1" aria-label="Toelichting" placeholder="Bijv. Bestuurder: ..."></td>
          <td><button type="button" class="knop link klein" data-actie="og-knoop-weg" data-index="${i}" title="Verwijderen">${icoon('prullenbak')}</button></td></tr>`).join('') || '<tr><td colspan="4" class="dempen">Nog geen overige partijen.</td></tr>'}
      </tbody></table></div>
      <div class="acties" style="margin:8px 0 14px"><button class="knop sec klein" data-actie="og-knoop-toevoegen">${icoon('plus')}Partij toevoegen</button></div>
      <div class="scroll"><table class="tabel compact invoer-tabel"><thead><tr><th>Van (aandeelhouder)</th><th>Naar</th><th>Belang</th><th>Soort</th><th>Certificaten van</th><th></th></tr></thead><tbody>
        ${(og.lijnen || []).map((l, i) => `<tr>
          <td>${keuze(null, `organogram.lijnen.${i}.van`, knoopOpties, l.van || '', { leeg: 'Kies', render: true })}</td>
          <td>${keuze(null, `organogram.lijnen.${i}.naar`, knoopOpties.filter(([id]) => id !== 'aanvrager'), l.naar || '', { leeg: 'Kies', render: true })}</td>
          <td><span class="pct-veld"><input inputmode="decimal" value="${isIngevuld(l.pct) ? esc(String(l.pct).replace('.', ',')) : ''}" data-bind="organogram.lijnen.${i}.pct" data-type="pct" data-render="1" aria-label="Belang (%)"><i>%</i></span></td>
          <td>${keuze(null, `organogram.lijnen.${i}.soort`, SOORT_LIJN, l.soort || 'aandelen', { render: true })}</td>
          <td>${l.soort === 'certificaten' ? keuze(null, `organogram.lijnen.${i}.voor`, certOpties(graaf, l.naar, knoopOpties), l.voor || '', { leeg: 'Alle', render: true }) : ''}</td>
          <td><button type="button" class="knop link klein" data-actie="og-lijn-weg" data-index="${i}" title="Verwijderen">${icoon('prullenbak')}</button></td></tr>`).join('') || '<tr><td colspan="6" class="dempen">Nog geen lijnen. De lijnen tussen de aanvrager en de ondernemingen in de berekening tekent ZIB zelf.</td></tr>'}
      </tbody></table></div>
      <p class="dempen klein">Administreert een STAK aandelen in meer vennootschappen, kies dan bij elke certificaathouder van welke vennootschap de certificaten zijn. Het organogram toont elke vennootschap met haar certificaathouders in een eigen kleur.</p>
      <div class="acties" style="margin-top:8px"><button class="knop sec klein" data-actie="og-lijn-toevoegen">${icoon('plus')}Lijn toevoegen</button></div>
    </div></details>
    <details class="stappen og-editor"${(og.situaties || []).length ? ' open' : ''}><summary>Eerdere situaties (wijzigingen in de structuur)</summary><div class="inhoud">
      <p class="dempen klein">Leg een eerdere structuur vast als momentopname (bijvoorbeeld "Situatie tot en met ${new Date().getFullYear() - 3}"). Bij "Invoegen in notities" komen de situaties in volgorde onder elkaar, met de huidige situatie als laatste.</p>
      ${(og.situaties || []).map((s, i) => `<div class="og-situatie">
        <div class="bzi-rij"><input value="${esc(s.titel || '')}" data-bind="organogram.situaties.${i}.titel" data-type="tekst" aria-label="Titel" placeholder="Situatie tot en met ..." class="breed">
          <button type="button" class="knop link klein gevaar" data-actie="og-situatie-weg" data-index="${i}" title="Verwijderen">${icoon('prullenbak')}</button></div>
        <textarea rows="5" class="mono" data-bind="organogram.situaties.${i}.tekst" data-type="tekst" aria-label="Organogram ${esc(s.titel || '')}">${esc(s.tekst || '')}</textarea></div>`).join('')}
      <div class="acties"><button class="knop sec klein" data-actie="og-situatie-toevoegen">${icoon('plus')}Huidige structuur vastleggen als situatie</button></div>
    </div></details>` : '';
  return `<div class="paneel organogram-paneel"><div class="paginakop" style="margin:0 0 8px"><h2>${esc(titel)}</h2>
      <span class="acties geen-print">
        <span class="segment" role="group" aria-label="Weergave organogram">
          <button type="button" class="${grafisch ? 'actief' : ''}" data-actie="og-weergave" data-weergave="grafisch">Grafisch</button>
          <button type="button" class="${grafisch ? '' : 'actief'}" data-actie="og-weergave" data-weergave="tekst">Tekst</button></span>
        <button class="knop sec klein" data-actie="og-download" title="Organogram als afbeelding (SVG)">${icoon('document')}Download</button>
        <button class="knop sec klein" data-actie="organogram-invoegen">${icoon('organogram')}Invoegen in notities</button></span></div>
    ${grafisch ? `<div class="og-canvas">${organogramSVG(graaf)}</div>
      <p class="dempen klein og-legenda">Groen omlijnd: in de berekening · gestippeld grijs: buiten de berekening · ovaal: persoon · driehoek: STAK · gestippelde lijn: certificaten${graaf.lijnen.some((l) => Number.isInteger(l.klasse)) ? ' · gekleurde stippellijnen: certificaathouders en de vennootschap waarvan zij certificaten hebben in dezelfde kleur' : ''}. Percentages zijn het directe belang.</p>`
    : `<pre class="organogram">${esc(tekst)}</pre>`}
    ${graaf.controles.length ? `<div style="margin-top:8px">${graaf.controles.map((c) => melding(c.niveau === 'attentie' ? 'attentie' : 'info', esc(c.tekst))).join('')}</div>` : ''}
    ${editor}
  </div>`;
}

/** Tekst voor de notities: eerdere situaties en de huidige structuur. */
export function organogramNotitie(d) {
  const og = d.organogram || {};
  const delen = (og.situaties || []).filter((s) => String(s.tekst || '').trim()).map((s) => `${s.titel || 'Situatie'}\n\n${s.tekst.trim()}`);
  delen.push(`${delen.length ? 'Situatie nu\n\n' : ''}${organogramTekst(d)}`);
  return delen.join('\n\n');
}
