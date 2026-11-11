// Overwinst (niet-uitgekeerd dividend) en de dubbele balanstoets: instellingen, uitkomst per jaar en
// de balans na fictieve onttrekking. Gebruikt in de BZI-stap van het hoofdbedrijf, de samenvatting,
// het tabblad Berekening (ViiZ-weergave) en het rapport.
import { esc, fmt } from '../util.js';
import { DBT_KEUZES, naOnttrekking } from '../engine/onderneming.js';
import { keuze, vink, pil, kengetal, melding } from './ui.js';
import { ordeJaren, ordeJarenOverzicht } from './uistate.js';

const g = (x) => (x === null || x === undefined ? '' : fmt.getal(x));

function instellingen(d, a, ow) {
  const o = (d.ondernemingen || []).find((x) => x.id === a.id) || {};
  const b = `ond:${a.id}.overwinst`;
  const k = o.overwinst || {};
  if (a.box2?.route !== undefined) {
    return `<div class="ow-keuzes">
      ${keuze('Box 2 inkomen', 'instellingen.box2Route', { route1: 'Route 1: uitgekeerd dividend', route2: 'Route 2: nog niet uitgekeerde winstreserve (overwinst)', combinatie: 'Uitzonderingsroute: combinatie (motiveren)', geen: 'Geen box 2 inkomen' }, d.instellingen?.box2Route || 'route1', { render: true })}
      <p class="dempen klein">Het toetskader schrijft de dubbele balanstoets voor: ${esc(ow.omschrijving)}${ow.afslag ? `; uitkomst met een afslag van ${Math.round(ow.afslag * 100)}%` : ''}.</p></div>`;
  }
  const ok = a.box2?.overwinstMeenemen;
  return `<div class="ow-keuzes">
    <div class="raster-2">
      ${vink('Overwinst (niet-uitgekeerd dividend) meenemen', `${b}.meenemen`, !!ok, { render: true, hint: 'De rekentool van de bank rekent alleen met uitgekeerd dividend; overwinst leg je vast als afwijkend inkomen.' })}
      ${vink('Vrije kasstroom voldoende en onderbouwd', `${b}.kasstroomBevestigd`, typeof k.kasstroomBevestigd === 'boolean' ? k.kasstroomBevestigd : !!d.instellingen?.abnDividend?.kasstroomBevestigd, { render: true, hint: 'Woonbeleid 3.63: de uitkering is duurzaam en vormt geen risico voor de investerings- of financieringsbehoefte.' })}
    </div>
    <div class="raster-3" style="margin-top:8px">
      ${keuze('Dubbele balanstoets: solvabiliteit', `${b}.solvNorm`, DBT_KEUZES.solvNorm, String(ow.opties.solvNorm), { render: true })}
      ${keuze('Dubbele balanstoets: liquiditeit', `${b}.liqMethode`, DBT_KEUZES.liqMethode, ow.opties.liqMethode, { render: true })}
      ${keuze('Toetsen in', `${b}.jaren`, DBT_KEUZES.jaren, ow.opties.jaren, { render: true })}
    </div>
    <div class="raster-2" style="margin-top:6px">
      ${vink('Ook toetsen op de tussentijdse balans (controlejaar)', `${b}.controlejaar`, !!ow.opties.controlejaar, { render: true })}
      ${vink('Rekening houden met de fictieve onttrekkingen in eerdere jaren (cumulatief)', `${b}.cumulatief`, !!ow.opties.cumulatief, { render: true })}
    </div></div>`;
}

/**
 * Tabellen met overwinst per jaar en de balans na fictieve onttrekking. In een overzicht lopen de jaren van oud naar
 * nieuw; op een invoerpagina (`invoer`) volgen ze de jaarkolommen van de invoer, zodat de hele pagina één richting heeft.
 */
export function overwinstTabellen(r, ow, { invoer = false } = {}) {
  const orde = invoer ? ordeJaren : ordeJarenOverzicht;
  const jaren = orde(Object.keys(ow.ow).map(Number));
  const kop = (y) => `${y}${y === r.C ? ' (t/m, geëxtrapoleerd)' : ''}`;
  const t1 = `<div class="scroll"><table class="tabel compact samenvat"><thead><tr><th>Overwinst</th>${jaren.map((y) => `<th class="num">${esc(kop(y))}</th>`).join('')}</tr></thead><tbody>
    <tr><td>${esc(ow.winstLabel)}</td>${jaren.map((y) => `<td class="num">${g(ow.winst[y])}</td>`).join('')}</tr>
    <tr><td>Uitgekeerd dividend (vennootschap)</td>${jaren.map((y) => `<td class="num">${g(ow.uitkering[y])}</td>`).join('')}</tr>
    <tr class="som"><td>Overwinst per jaar${ow.mee.length < 3 ? ' (meegetelde jaren in het gemiddelde)' : ''}</td>${jaren.map((y) => `<td class="num${y !== r.C && !ow.mee.includes(y) ? ' dempen' : ''}">${g(ow.ow[y])}</td>`).join('')}</tr>
  </tbody></table></div>`;
  const d = ow.dbt;
  const dj = orde(d.jaren);
  const X = ow.naDbt;
  const t2 = dj.length ? `<div class="scroll"><table class="tabel compact samenvat"><thead><tr><th>Dubbele balanstoets</th>${dj.map((y) => `<th class="num">${esc(y === r.C ? `${y} (tussentijds)` : String(y))}</th>`).join('')}</tr></thead><tbody>
    ${d.opties.cumulatief ? `<tr><td>Fictieve onttrekking (aantal jaren)</td>${dj.map((y) => `<td class="num">${d.perJaar[y].k} ×</td>`).join('')}</tr>` : ''}
    <tr><td>Aansprakelijk vermogen</td>${dj.map((y) => `<td class="num">${g(d.perJaar[y].EVcor)}</td>`).join('')}</tr>
    <tr><td>Balanstotaal (na correctie)</td>${dj.map((y) => `<td class="num">${g(d.perJaar[y].TVcor)}</td>`).join('')}</tr>
    <tr><td>Vlottende activa (na correctie)</td>${dj.map((y) => `<td class="num">${g(d.perJaar[y].VAcor)}</td>`).join('')}</tr>
    <tr><td>Kort vreemd vermogen (na correctie)</td>${dj.map((y) => `<td class="num">${g(d.perJaar[y].KVVcor)}</td>`).join('')}</tr>
    <tr class="som"><td>Maximale overwinst solvabiliteit (≥ ${esc(fmt.pct(d.opties.solvNorm, 0))})</td>${dj.map((y) => `<td class="num">${g(d.perJaar[y].maxSolv)}</td>`).join('')}</tr>
    ${d.opties.liqMethode === 'cr'
    ? `<tr class="som"><td>Maximale overwinst liquiditeit (current ratio ≥ ${esc(fmt.ratio(d.opties.crNorm))})</td>${dj.map((y) => `<td class="num">${g(d.perJaar[y].maxCr)}</td>`).join('')}</tr>`
    : `<tr><td>Werkkapitaal</td>${dj.map((y) => `<td class="num">${g(d.perJaar[y].WK)}</td>`).join('')}</tr>`}
    <tr class="kopregel"><td colspan="${dj.length + 1}">Na fictieve onttrekking van ${esc(fmt.eur(X))}${d.opties.cumulatief ? ' per jaar' : ''}</td></tr>
    <tr><td>Solvabiliteit na onttrekking</td>${dj.map((y) => { const n = naOnttrekking(d.perJaar[y], X); return `<td class="num">${n.SV === null ? 'n.v.t.' : kengetal(fmt.pct(n.SV, 0), n.SV >= d.opties.solvNorm - 0.00005)}</td>`; }).join('')}</tr>
    <tr><td>Current ratio na onttrekking</td>${dj.map((y) => { const n = naOnttrekking(d.perJaar[y], X); return `<td class="num">${n.CR === null ? 'n.v.t.' : kengetal(fmt.ratio(n.CR), n.CR >= d.opties.crNorm - 0.005)}</td>`; }).join('')}</tr>
    <tr><td>Werkkapitaal na onttrekking</td>${dj.map((y) => `<td class="num">${g(naOnttrekking(d.perJaar[y], X).WK)}</td>`).join('')}</tr>
  </tbody></table></div>` : melding('attentie', 'Geen balans in het te toetsen jaar: de overwinst kan niet worden getoetst.');
  return { t1, t2 };
}

function uitkomst(r, ow) {
  const d = ow.dbt;
  const rij = (l, w, f = '', cls = '') => `<tr class="${cls}"><td>${esc(l)}${f ? `<div class="f">${esc(f)}</div>` : ''}</td><td class="num">${typeof w === 'number' ? esc(fmt.eur(w)) : w}</td></tr>`;
  return `<table class="tabel compact ow-uitkomst"><tbody>
    ${rij('Gemiddelde overwinst, maximaal laatste jaar', ow.basis, `laagste van ${g(ow.gem)} (gemiddeld) en ${g(ow.ow[r.T[2]] ?? 0)} (${r.T[2]})`)}
    ${rij('Maximum volgens de dubbele balanstoets', d.max, d.jaren.length ? `laagste van ${g(d.maxSolv)} (solvabiliteit) en ${g(d.maxLiq)} (liquiditeit)` : 'geen balans')}
    ${ow.owC !== null ? rij('Maximaal de overwinst in het controlejaar (geëxtrapoleerd)', ow.owC) : ''}
    ${ow.vrij !== null ? rij('Balanstest: vrij uitkeerbare reserves', ow.vrij, ow.vrijLabel) : ''}
    ${rij('Overwinst na dubbele balanstoets', ow.naDbt, '', 'som')}
    ${rij(`× belang ${fmt.pct(ow.aandeel, 0)}${ow.afslag ? ` × ${fmt.pct(1 - ow.afslag, 0)} (afslag)` : ''}`, ow.bruto, '', 'resultaat')}
    ${rij('Mee te nemen overwinst', ow.bedrag, ow.toegestaan ? '' : 'voorwaarden niet akkoord', 'totaal')}
    ${ow.benodigd ? rij('Benodigde balansversterking voor de volledige overwinst', ow.benodigd) : ''}
  </tbody></table>
  <ul class="ow-voorwaarden">${ow.voorwaarden.map((c) => `<li>${pil(c.status)} <b>${esc(c.label)}</b>: ${esc(c.tekst)}</li>`).join('')}</ul>`;
}

/** Volledig blok voor één (hoofd)bedrijf. */
export function overwinstBlok(d, r, a, { bewerken = true, kort = false, invoer = false } = {}) {
  const ow = a.box2?.overwinst;
  if (!ow) return '';
  const isNHG = a.box2?.route !== undefined;
  const mee = isNHG ? ['route2', 'combinatie'].includes(d.instellingen?.box2Route) : !!a.box2?.overwinstMeenemen;
  const status = !mee ? pil('neutraal', 'Niet meegenomen') : ow.toegestaan ? pil('akkoord', `Meegenomen ${fmt.eur(ow.bedrag)}`) : pil('niet_akkoord', 'Voorwaarden niet akkoord');
  const { t1, t2 } = overwinstTabellen(r, ow, { invoer });
  if (kort) {
    return `<div class="bzi-blok overwinst"><h3>Overwinst en dubbele balanstoets ${status}</h3>
      <p class="dempen klein">${esc(ow.omschrijving)}.</p>
      <div class="ow-raster"><div>${t1}</div><div>${uitkomst(r, ow)}</div></div></div>`;
  }
  return `<div class="bzi-blok overwinst" id="overwinst-${esc(a.id)}"><h3>Overwinst (niet-uitgekeerd dividend) en dubbele balanstoets ${status}</h3>
    <p class="dempen klein">Als overwinst tot het inkomen wordt gerekend, gaan we ervan uit dat die als dividend uitgekeerd had kunnen worden. De dubbele balanstoets stelt daarom ook een balans op waarin de overwinst is onttrokken aan het eigen vermogen en de vlottende activa; voldoet de onderneming dan niet meer aan de normen, dan wordt de overwinst verlaagd.</p>
    ${bewerken ? instellingen(d, a, ow) : `<p class="klein">Toets: ${esc(ow.omschrijving)}.</p>`}
    <div class="ow-raster ow-tabellen" style="margin-top:10px"><div>${t1}${t2}</div><div>${uitkomst(r, ow)}</div></div>
  </div>`;
}
