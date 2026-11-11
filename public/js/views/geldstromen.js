// Geldstromen binnen de structuur (management fee, intern dividend, DGA-loon, betaalbaar gesteld
// dividend) en overige geldstromen of posities, ook met partijen buiten de berekening (bijvoorbeeld
// een management fee aan de holding van een medeaandeelhouder, of een rekening-courant tussen
// zustermaatschappijen). Per jaar: bedrag volgens de betaler / schuldeiser en volgens de ontvanger /
// schuldenaar, met het verschil.
import { esc, fmt, isIngevuld } from '../util.js';
import { organogramGraaf, GELDSTROOM_SOORTEN, geldstroomLabel } from '../engine/index.js';
import { bedrag, keuze, icoon } from './ui.js';
import { ordeJaren, ordeJarenOverzicht } from './uistate.js';

const SOORT_STRUCTUUR = { fee: 'Management fee', dividend: 'Intern dividend', loon: 'Loon DGA', winst: 'Winst (IB)', dividendDGA: 'Betaalbaar gesteld dividend / box 2' };

export function geldstromenTabel(r, gs, { titel = 'Geldstromen binnen de structuur' } = {}) {
  if (!gs?.length) return '';
  const jaren = ordeJarenOverzicht(r.C ? [...r.T, r.C] : [...r.T]);
  const cel = (x, soort) => {
    if (!x) return '';
    if (soort === 'loon' || soort === 'winst') return x.betaald ? esc(fmt.getal(x.betaald)) : '';
    if ((x.betaald === null || x.betaald === undefined) && (x.ontvangen === null || x.ontvangen === undefined)) return '';
    const b = x.betaald === null || x.betaald === undefined ? '–' : fmt.getal(x.betaald);
    const o = x.ontvangen === null || x.ontvangen === undefined ? '–' : fmt.getal(x.ontvangen);
    const v = x.verschil;
    return `${esc(b)} / ${esc(o)}${v !== null && v !== undefined && Math.abs(v) > 1 ? ` <span class="verschil">Δ ${esc(fmt.getal(v))}</span>` : ''}`;
  };
  return `${titel ? `<h3>${esc(titel)}</h3>` : ''}
    <p class="dempen klein">Per jaar: volgens de betaler (of schuldeiser) / volgens de ontvanger (of schuldenaar). Een verschil (Δ) licht je toe in de notities.</p>
    <div class="scroll"><table class="tabel compact geldstromen"><thead><tr><th>Van</th><th>Naar</th><th>Soort</th>${jaren.map((y) => `<th class="num">${y}${y === r.C ? ' (t/m)' : ''}</th>`).join('')}</tr></thead><tbody>
    ${gs.map((x) => `<tr><td>${esc(x.vanNaam)}</td><td>${esc(x.naarNaam)}</td><td>${esc(x.extra ? GELDSTROOM_SOORTEN[x.soort] || x.soort : SOORT_STRUCTUUR[x.soort] || geldstroomLabel(x))}${x.toelichting ? `<div class="dempen klein">${esc(x.toelichting)}</div>` : ''}</td>${jaren.map((y) => `<td class="num">${cel(x.perJaar[y], x.soort)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

/** Invoer van overige geldstromen en posities (ook met partijen buiten de berekening). */
export function paneelGeldstromen(d, r) {
  const lijst = Array.isArray(d.geldstromenExtra) ? d.geldstromenExtra : [];
  const graaf = organogramGraaf(d);
  const partijen = [...graaf.knopen.map((k) => [k.id, k.naam]), ['derde', 'Andere partij (vrije tekst)']];
  const jaren = ordeJaren(r.C ? [...r.T, r.C] : [...r.T]);
  const rij = (x, i) => {
    const b = `geldstromenExtra.${i}`;
    const partij = (kant) => `${keuze(null, `${b}.${kant}`, partijen, x[kant] || '', { leeg: 'Kies', render: true })}${x[kant] === 'derde'
      ? `<input value="${esc(x[`${kant}Tekst`] || '')}" data-bind="${b}.${kant}Tekst" data-type="tekst" data-render="1" placeholder="Naam" aria-label="Naam partij" style="margin-top:4px">` : ''}`;
    return `<tr>
      <td>${partij('van')}</td><td>${partij('naar')}</td>
      <td>${keuze(null, `${b}.soort`, GELDSTROOM_SOORTEN, x.soort || 'fee', { render: true })}
        <input value="${esc(x.toelichting || '')}" data-bind="${b}.toelichting" data-type="tekst" placeholder="Toelichting" aria-label="Toelichting" style="margin-top:4px"></td>
      ${jaren.map((y) => {
    const v = x.perJaar?.[y] || {};
    const verschil = isIngevuld(v.van) && isIngevuld(v.naar) && Math.abs(Number(v.van) - Number(v.naar)) > 1;
    return `<td class="gs-jaar">${bedrag(`${b}.perJaar.${y}.van`, v.van, { label: `${y} volgens van`, placeholder: 'van', render: true })}${bedrag(`${b}.perJaar.${y}.naar`, v.naar, { label: `${y} volgens naar`, placeholder: 'naar', render: true })}${verschil ? `<span class="verschil">Δ ${esc(fmt.getal(Number(v.van) - Number(v.naar)))}</span>` : ''}</td>`;
  }).join('')}
      <td><button type="button" class="knop link klein" data-actie="gs-weg" data-index="${i}" title="Verwijderen">${icoon('prullenbak')}</button></td></tr>`;
  };
  return `<div class="paneel"><div class="paginakop" style="margin:0 0 8px"><h2>Overige geldstromen en posities</h2>
      <button class="knop sec klein" data-actie="gs-toevoegen">${icoon('plus')}Geldstroom toevoegen</button></div>
    <p class="dempen klein">Bijvoorbeeld een management fee aan de holding van een medeaandeelhouder (met het bedrag volgens diens jaarrekening), rente of huur, of een rekening-courant tussen zustermaatschappijen (vordering volgens de ene / schuld volgens de andere balans). Partijen buiten de berekening voeg je toe bij het organogram.</p>
    ${lijst.length ? `<div class="scroll"><table class="tabel compact invoer-tabel geldstromen-invoer"><thead><tr><th>Van (betaler / schuldeiser)</th><th>Naar (ontvanger / schuldenaar)</th><th>Soort</th>${jaren.map((y) => `<th class="num">${y}${y === r.C ? ' (t/m)' : ''}<div class="dempen klein">van / naar</div></th>`).join('')}<th></th></tr></thead>
      <tbody>${lijst.map(rij).join('')}</tbody></table></div>` : '<p class="dempen">Geen overige geldstromen vastgelegd.</p>'}
  </div>`;
}
