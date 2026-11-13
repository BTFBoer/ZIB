import { getekendeDossierfase } from '../engine/beoordelingsrechten.js';
import { esc, fmt } from '../util.js';
import { renderBronUitkomsten } from './broncontrole.js';

function opties(waarden, huidig) {
  return waarden.map(([waarde, label]) => `<option value="${esc(waarde)}"${waarde === huidig ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

export function renderRekenkeuzes(d, r, toonUitkomst) {
  const inst = d.instellingen || {};
  const keuze = r.rekenkeuzes || {};
  const controleAan = inst.controlejaar !== false;
  const heeftVervanging = keuze.vervanging?.beschikbaar === true;
  const vervangPad = r.kader === 'VENN' ? 'beleidsinvoer.VENN.tussentijdsVervangen' : 'instellingen.vervangOudsteJaar';
  const vervang = r.kader === 'VENN' ? d.beleidsinvoer?.VENN?.tussentijdsVervangen === true : inst.vervangOudsteJaar === true;
  const methode = ['horizontaal', 'verticaal'].includes(inst.abnVaststelling) ? inst.abnVaststelling : d.abnGroep ? 'horizontaal' : 'standaard';
  const heeftMethode = r.soort === 'IKV' && r.kader === 'ABN';
  const gesloten = getekendeDossierfase(d);
  const jaNee = [['true', 'Ja'], ['false', 'Nee']];
  const kies = (id, pad, waarde, waarden, { kenmerk = '', uit = false } = {}) => `<select aria-labelledby="${id}" data-bind="${pad}" data-rekenkeuze${kenmerk ? ` ${kenmerk}` : ''}${uit ? ' disabled' : ''}>${opties(waarden, waarde)}</select>`;
  const controleToelichting = toonUitkomst && controleAan
    ? `<small data-reken-keuze-uitkomst>${r.C ? esc(r.C) : 'Geen bruikbare cijfers voor het controlejaar'}</small>` : '';
  const vervangToelichting = toonUitkomst && keuze.vervanging?.reden
    ? `<small data-reken-keuze-uitkomst>${esc(keuze.vervanging.reden)}</small>` : '';
  const regels = [
    ['Toetsjaren', esc(r.T.join(' · '))],
    ['Controlejaar', `${kies('reken-controlejaar', 'instellingen.controlejaar', String(controleAan), [['true', 'Aan'], ['false', 'Uit']], { kenmerk: 'data-reken-controlejaar', uit: gesloten })}${controleToelichting}`, 'reken-controlejaar'],
    ['Oudste toetsjaar vervangen', heeftVervanging ? `${kies('reken-vervanging', vervangPad, String(vervang), jaNee, { kenmerk: 'data-reken-vervanging', uit: gesloten || !controleAan })}${vervangToelichting}` : 'Niet van toepassing', 'reken-vervanging'],
    ['Vaststellingsmethode', heeftMethode ? kies('reken-methode', 'instellingen.abnVaststelling', methode, [...(!d.abnGroep ? [['standaard', 'Standaard volgens Woonbeleid']] : []), ['horizontaal', 'Horizontaal'], ['verticaal', 'Verticaal']], { uit: gesloten }) : 'Volgens het gekozen toetskader', 'reken-methode'],
  ];
  return `<section class="reken-paneel reken-algemeen" aria-labelledby="reken-algemeen-titel"${r.inkomensanalyse ? ' data-inkomensanalyse' : ` data-beoordelingskader="${esc(r.kader)}"`}>
    <div class="reken-paneel-kop"><div><h2 id="reken-algemeen-titel">Algemene rekenkeuzes</h2><p class="reken-neutraal">${esc(r.inkomensanalyse ? 'Inkomensanalyse' : [r.kaderCfg.kort, r.kaderVersie].filter(Boolean).join(' · '))}</p></div></div>
    <div class="scroll"><table class="tabel reken-keuzetabel"><thead><tr><th scope="col">Rekeninstelling</th><th scope="col">Keuze</th></tr></thead><tbody>${regels.map(([label, veld, id]) => `<tr><th scope="row"${id ? ` id="${id}"` : ''}>${esc(label)}</th><td>${veld}</td></tr>`).join('')}</tbody></table></div>
    <div class="reken-keuze-acties"><button type="button" class="knop" data-actie="dossier-berekenen">Berekenen</button><span class="reken-neutraal" role="status" data-rekenstatus>${gesloten ? 'Dit dossier is vergrendeld. Je kunt de opgeslagen keuzes doorrekenen.' : toonUitkomst ? 'Uitkomst berekend met de getoonde keuzes.' : 'Bereken het inkomen en de ratio’s met deze keuzes.'}</span></div>
  </section>`;
}

export function renderRekenBronvergelijking(d, r) {
  const vergelijking = r.inkomen?.abnBronVergelijking;
  const model = r.inkomen?.abnVaststelling;
  const uitkomsten = Array.isArray(d.broncontrole?.uitkomsten) ? d.broncontrole.uitkomsten : [];
  if (r.inkomensanalyse || r.kader !== 'ABN' || (!vergelijking && !model && !uitkomsten.length)) return '';
  const modellen = [['horizontaal', 'Horizontaal'], ['verticaal', 'Verticaal']];
  const geld = (bedrag) => Number.isFinite(bedrag) ? fmt.eur(bedrag, 2) : '—';
  const cijfers = modellen.map(([id, label]) => {
    const bedrag = vergelijking?.[id] ?? model?.[id];
    const getal = Number.isFinite(bedrag) ? fmt.eur(bedrag, 2) : 'Onvoldoende grondslag';
    return `<tr${model?.methode === id ? ' class="totaal"' : ''}><th scope="row">${label}${model?.methode === id ? ' <small>Gekozen methode</small>' : ''}</th><td class="num">${esc(getal)}</td></tr>`;
  }).join('');
  const jaarposten = [
    ['Gezamenlijk DGA-loon', 'dga'], ['Winst na correcties', 'winst'], ['Ontvangen minderheidsdividend', 'minderheidsdividend'],
    ['Uitgekeerd dividend', 'uitgekeerd'], ['Niet-uitgekeerde winst', 'nietUitgekeerd'], ['Uitkeringsruimte', 'uitkeringsruimte'],
  ];
  const jaarTabel = vergelijking?.perJaar && !vergelijking.open?.length
    ? `<details class="stappen reken-uitklap"><summary>Jaarbedragen uit het groepsmodel</summary><div class="reken-uitklap-inhoud scroll"><table class="tabel reken-tabel reken-toetsingstabel"><thead><tr><th scope="col">Post</th>${r.T.map((jaar) => `<th scope="col" class="num">${jaar}</th>`).join('')}</tr></thead><tbody>${jaarposten.map(([label, veld]) => `<tr><th scope="row">${label}</th>${r.T.map((jaar) => `<td class="num">${esc(geld(vergelijking.perJaar[jaar]?.[veld]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : '';
  return `<section class="reken-paneel" aria-labelledby="reken-bronnen-titel">
    <h2 id="reken-bronnen-titel">Uitkomst vergeleken met bronbestanden</h2>
    ${vergelijking || model ? `<div class="scroll"><table class="tabel reken-tabel reken-bronnentabel"><thead><tr><th scope="col">Methode</th><th scope="col" class="num">Herberekend per jaar</th></tr></thead><tbody>${cijfers}</tbody></table></div>` : ''}
    ${jaarTabel}
    ${uitkomsten.length ? `<details class="stappen reken-uitklap"><summary>Bedragen uit het rapport en Excel</summary><div class="reken-uitklap-inhoud">${renderBronUitkomsten(uitkomsten)}</div></details>` : ''}
  </section>`;
}
