import { esc, fmt, naamAanvrager, num, isIngevuld } from '../util.js';
import { get } from '../state.js';
import { RECHTSVORMEN, SOORTEN, kaderVoor, PARAM_LABELS } from '../engine/kaders.js';
import { organogramGraaf } from '../engine/index.js';
import { zkLijst, zkTekst } from '../engine/nul.js';
import { BALANS_RIJEN, VW_RIJEN } from '../schema/fields.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES } from '../schema/correcties.js';
import { balansTotalen, vwTotalen, totalenJaar } from '../engine/financieel.js';
import { tekstDuur } from '../engine/periods.js';
import { pil, STATUS_TEKST } from './ui.js';
import { renderTrace } from './trace-view.js';
import { inkomensTabel, kengetallenTabel, methodenTabel } from './dossier.js';
import { CONTROLES } from './formats.js';
import { ordeJaren } from './uistate.js';
import { organogramSVG, organogramNotitie } from './organogram.js';
import { geldstromenTabel } from './geldstromen.js';
import { overwinstBlok } from './overwinst.js';

const kv = (paren) => `<dl class="kv">${paren.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
const pre = (t) => (t ? `<pre class="notitie">${esc(t)}</pre>` : '<p class="dempen">Niet ingevuld.</p>');

function financieleTabel(ond, r, soort) {
  const jaren = ordeJaren(r.C ? [...r.T, r.C] : [...r.T]);
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

export function renderRapport(d, r) {
  const kader = r.kaderCfg || kaderVoor(d);
  const adv = get(d.advieskantoorId);
  const a = d.aanvrager || {};
  const n = d.notities || {};
  const isNul = d.soort === 'NUL';
  const f = d.fiat || {};

  const titel = isNul ? '0-verklaring ondernemer' : 'Inkomensverklaring ondernemer';
  const bedragTekst = isNul ? '€ 0' : fmt.eur(r.vastgesteld);

  const bedrijven = (d.ondernemingen || []).map((o, i) => kv([
    [`Onderneming ${i + 1}`, `<b>${esc(o.naam || '')}</b>`],
    ['Rechtsvorm', esc(RECHTSVORMEN[o.rechtsvorm]?.label || o.rechtsvorm)],
    ['Startdatum KvK', esc(fmt.datum(o.startdatum))],
    ['KvK-nummer', esc(o.kvk || '')],
    o.website ? ['Website', esc(o.website)] : null,
    ['SBI', esc(o.sbi || '').replace(/\n/g, '<br>')],
    o.rechtsvorm !== 'EZ' ? ['Belang', belangTekst(d, r, o)] : null,
  ])).join('<div style="height:10px"></div>');

  const maxOnttrekken = r.ondernemingen.filter((x) => x.maxOnttrekken !== undefined)
    .map((x) => (x.maxOnttrekkenNvt ? `${esc(x.naam)}: n.v.t. (${esc(x.maxOnttrekkenNvt)})` : `${esc(x.naam)}: ${esc(fmt.eur(x.maxOnttrekken, 2))}`)).join('<br>');

  const zakelijk = isNul
    ? `<p><b>${esc(r.nul.conclusie)}</b></p>${r.nul.nhgOpmerking ? `<p class="dempen">${esc(r.nul.nhgOpmerking)}</p>` : ''}`
    : r.bron === 'geen'
      ? '<p><b>Er kan géén zakelijk inkomen worden afgegeven.</b></p>'
      : `<p>Het vastgesteld zakelijk inkomen bedraagt <b>${esc(fmt.eur(r.vastgesteld, 2))}</b>${r.bron === 'afwijkend' ? ' (afwijkend inkomen, zie handmatige wijzigingen)' : ''}.</p>`;

  const afw = d.afwijkend || {};
  const handmatig = !isNul && afw.actief
    ? kv([
      ['Berekend inkomen', esc(fmt.eur(r.berekend))],
      ['Afwijkend inkomen', esc(fmt.eur(num(afw.bedrag)))],
      ['Motivatie', esc(afw.motivatie || '')],
      ['Rekenkundige onderbouwing', esc(afw.onderbouwing || '')],
      ['Bestendigheid', esc(afw.bestendigheid || '')],
      ['Documentatie', esc(afw.documentatie || '')],
    ])
    : '<p>Geen handmatige wijzigingen.</p>';

  const controles = n.controles || {};
  const controleTabel = `<div class="scroll"><table class="tabel"><thead><tr><th>Controlepunt</th><th>Resultaat</th></tr></thead><tbody>
    ${CONTROLES.map(([k, l]) => `<tr><td>${esc(l)}</td><td>${esc(controles[k] || 'Niet ingevuld')}</td></tr>`).join('')}</tbody></table></div>`;
  const beoordeling = `<div class="scroll"><table class="tabel"><thead><tr><th>Controle</th><th>Tijdstip</th><th>Status</th><th>Behandelaar</th><th>Opmerkingen</th></tr></thead><tbody>
    <tr><td>1e fiat</td><td>${esc(fmt.tijdstip(f.eerste?.datum))}</td><td>${f.eerste ? 'Gereed gemeld' : 'Open'}</td><td>${esc(f.eerste?.naam || d.behandelaar || '')}</td><td>${esc(f.eerste?.opmerking || '')}</td></tr>
    <tr><td>2e fiat</td><td>${esc(fmt.tijdstip(f.tweede?.datum))}</td><td>${f.tweede?.resultaat === 'akkoord' ? 'Definitief akkoord' : f.tweede?.resultaat === 'niet_akkoord' ? 'Niet akkoord' : 'Open'}</td><td>${esc(f.tweede?.naam || '')}</td><td>${esc(f.tweede?.opmerking || '')}</td></tr>
  </tbody></table></div>`;

  const graaf = organogramGraaf(d);
  const structuurDeel = (d.ondernemingen || []).length > 1 || (d.ondernemingen || []).some((o) => o.parentId) || (d.organogram?.knopen || []).length
    ? `<h3>Structuur (organogram)</h3><div class="og-canvas rapport-og">${organogramSVG(graaf, { losstaand: true })}</div>
      <pre class="notitie">${esc(organogramNotitie(d))}</pre>` : '';

  const zk = zkLijst(d);
  const verplichtingen = [
    zk.length ? `<h3>Zakelijke kredieten en lease</h3><ul>${zk.map((x) => `<li>${esc(zkTekst(x))}${x.toelichting ? ` (${esc(x.toelichting)})` : ''}</li>`).join('')}</ul>` : '',
    r.rc?.tekst ? `<h3>Rekening-courant directie</h3><p>${esc(r.rc.tekst)}</p>` : '',
    r.leningDirectie?.maandlast ? `<h3>Lening directie</h3><p>${esc(r.leningDirectie.tekst)}${d.leningDirectie?.hypothecair ? ' Hypothecaire zekerheid (eigen woning).' : ''}${d.leningDirectie?.toelichting ? ` ${esc(d.leningDirectie.toelichting)}` : ''}</p>` : '',
  ].join('');

  const correctieOverzicht = (() => {
    const rijen = [];
    (d.ondernemingen || []).forEach((o) => Object.entries(o.jaren || {}).forEach(([y, jd]) => {
      (jd.winstCorrecties || []).forEach((c) => rijen.push([o.naam, y, WINST_CORRECTIES[c.type]?.label || c.type, c.bedrag, c.toelichting]));
      (jd.vermogensCorrecties || []).forEach((c) => rijen.push([o.naam, y, VERMOGENS_CORRECTIES[c.type]?.label || c.type, c.bedrag, c.toelichting]));
    }));
    if (!rijen.length) return '';
    return `<h3>Handmatige correcties</h3><div class="scroll"><table class="tabel"><thead><tr><th>Onderneming</th><th>Jaar</th><th>Soort</th><th class="num">Bedrag</th><th>Toelichting</th></tr></thead><tbody>
      ${rijen.map(([n, y, t, b, tl]) => `<tr><td>${esc(n)}</td><td>${esc(y)}</td><td>${esc(t)}</td><td class="num">${esc(fmt.eur(num(b)))}</td><td>${esc(tl || '')}</td></tr>`).join('')}</tbody></table></div>`;
  })();

  const geldstromen = r.inkomen?.geldstromen?.length ? geldstromenTabel(r, r.inkomen.geldstromen) : '';

  const overwinstDeel = isNul ? '' : r.ondernemingen.filter((x) => x.box2?.overwinst
    && (kader.box2?.model === 'NHG' ? ['route2', 'combinatie'].includes(d.instellingen?.box2Route) : x.box2.overwinstMeenemen))
    .map((x) => `<h3>Overwinst en dubbele balanstoets: ${esc(x.naam)}</h3>${overwinstBlok(d, r, x, { bewerken: false })}`).join('');

  const perOnderneming = r.ondernemingen.map((x) => {
    const ond = (d.ondernemingen || []).find((o) => o.id === x.id) || {};
    if (!isNul && !x.meenemen && r.familie !== 'ABN') return '';
    return `<div class="paginabreuk"></div><h2>${esc(x.naam)}</h2>
      ${kv([
        ['Soort ondernemer', x.soort === 'VPB' ? 'Niet-IB (DGA)' : 'IB-ondernemer'],
        ['Rechtsvorm', esc(x.rechtsvormLabel)],
        ['Startdatum (KvK of activiteiten)', esc(fmt.datum(x.start))],
        ['Berekeningsdatum', esc(fmt.datum(r.datum))],
        ['Aantal jaren ondernemer', esc(tekstDuur(x.duur))],
      ])}
      <h3>Kengetallen, ratio's en voorwaarden</h3>${kengetallenTabel(x, r)}
      ${isNul ? '' : `<h3>Voorwaarden</h3><table class="tabel"><tbody>${x.checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${pil(c.status)}</td><td>${esc(c.tekst)}</td></tr>`).join('')}</tbody></table>`}
      ${renderTrace(x.trace)}
      <h3>Financiële gegevens</h3>${financieleTabel(ond, r, 'balans')}<div style="height:12px"></div>${financieleTabel(ond, r, 'vw')}`;
  }).join('');

  const nulDeel = isNul ? `<h2>Beoordelingsverklaring</h2>
    ${r.nul.perOnderneming.map((o) => `<h3>${esc(o.naam)} ${pil(o.status)}</h3><table class="tabel"><tbody>${o.checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${pil(c.status)}</td><td>${esc(c.tekst)}</td></tr>`).join('')}</tbody></table>`).join('')}
    <h3>Zekerheden en verplichtingen</h3><table class="tabel"><tbody>${r.nul.zekerheden.map((c) => `<tr><td>${esc(c.label)}</td><td>${pil(c.status)}</td><td>${esc(c.tekst)}</td></tr>`).join('')}</tbody></table>
    ${r.nul.maandlastCorrectie ? `<p><b>Correctie op de toegestane financieringslast: € ${esc(fmt.getal(r.nul.maandlastCorrectie))} per maand.</b></p>` : ''}` : '';

  const aandachtspunten = kv([
    ['Datum afgifte', esc(fmt.datum(r.datum))],
    ['Niveau', esc(d.niveau || 'Basis')],
    ['Eerste fiatteur', esc(f.eerste?.naam || d.behandelaar || '')],
    ['Geldig tot', esc(fmt.datum(r.geldigTot))],
    ['KYC', n.kyc ? 'Ja' : 'Nee'],
    [isNul ? '0-inkomen' : `Berekend inkomen${kader.nhg ? ' (NHG)' : ' (zonder NHG)'}`, esc(isNul ? '€ 0' : fmt.eur(r.berekend))],
    !isNul && afw.actief ? ['Afwijkend inkomen', esc(fmt.eur(num(afw.bedrag)))] : null,
    r.rc?.maandlast ? ['Maandlast R/C directie', esc(fmt.eur(r.rc.maandlast))] : null,
  ]);

  return `<article class="rapport" id="rapport">
    <h1>${esc(titel)}</h1>
    <div class="vertrouwelijk">Uitgebreide rapportage. Vertrouwelijk: uitsluitend bestemd voor intern gebruik.</div>

    <h2>Samenvatting</h2>
    <div class="raster-2">
      <div>${kv([
        ['Dossiernummer', esc(d.nummer || '')],
        ['Bestemd voor', esc(r.familie === 'ABN' ? (d.label || 'ABN AMRO') : kader.bestemdVoor)],
        ['Behandelaar', esc(d.behandelaar || '')],
        ['Fiatteur', esc(f.tweede?.naam || d.fiatteur || '')],
        ['Datum', esc(fmt.datumLang(r.datum))],
        [isNul ? '0-verklaring' : 'Toetsinkomen', `<span class="bedrag-groot">${esc(bedragTekst)}</span> ${pil(r.status)}`],
      ])}</div>
      <div>${kv([
        ['Aanvrager', `<b>${esc(naamAanvrager(a))}</b>`],
        ['Geboortedatum', esc(fmt.datumLang(a.geboortedatum))],
        ['Adres', esc([a.straat, a.huisnummer].filter(Boolean).join(' '))],
        ['Postcode en woonplaats', esc([a.postcode, a.woonplaats].filter(Boolean).join(' '))],
      ])}</div>
    </div>

    <h3>Bedrijfsgegevens</h3>${bedrijven || '<p class="dempen">Geen ondernemingen.</p>'}
    ${structuurDeel}

    <h3>Geldigheid</h3>${kv([
      ['Datum vaststelling', esc(fmt.datumLang(r.datum))],
      ['Geldig voor bindende offertes uitgebracht tot en met', esc(fmt.datumLang(r.geldigTot))],
    ])}

    ${isNul ? '' : `<h3>Inkomensvaststelling</h3>${inkomensTabel(d, r)}${methodenTabel(d, r)}`}
    ${overwinstDeel}
    ${geldstromen}
    ${verplichtingen}
    <h3>Maximaal te onttrekken aan de onderneming</h3>
    <p class="dempen klein">Vlottende activa die kunnen worden onttrokken terwijl de onderneming nog aan de normen voor liquiditeit en solvabiliteit voldoet, op basis van de meest recente geanalyseerde balans.</p>
    <p>${maxOnttrekken || 'n.v.t.'}</p>

    <h3>Kerngegevens</h3>${kv([
      ['Rapportnummer', esc(d.nummer || '')],
      ['Advieskantoor', esc(adv?.naam || 'Niet vastgelegd')],
      ['Ondernemer', esc(naamAanvrager(a))],
      ['Soort aanvraag', esc(SOORTEN[d.soort] || d.soort)],
      ['Gehanteerd toetskader', esc(`${kader.naam}, ${kader.versie}`)],
      ['Status bron', esc(kader.bronStatus || '')],
      kader.aangepast ? ['Aangepaste parameters', esc(Object.entries(kader.aangepast).map(([k, v]) => `${(PARAM_LABELS[k] || [k])[0]}: ${PARAM_LABELS[k]?.[1] === 'pct' ? `${String(Math.round(v * 1000) / 10).replace('.', ',')}%` : String(v).replace('.', ',')}`).join('; '))] : null,
      ['Nationale Hypotheek Garantie', kader.nhg ? 'Ja' : 'Nee'],
      ['Aantal ondernemingen met direct of indirect belang', String((d.ondernemingen || []).length)],
      ['Ondernemingen', esc((d.ondernemingen || []).map((o) => o.naam).join(', '))],
    ])}

    <h2>Toelichting</h2>
    <h3>Algemene informatie en organogram</h3>${pre(n.algemeen)}
    <h3>Broncontroles</h3>${pre(n.broncontroles)}
    <h3>KvK-adrescheck</h3>${pre(n.kvkCheck)}
    <h3>Google check (know your customer)</h3>${pre(n.googleCheck)}
    ${(d.ondernemingen || []).map((o) => (n.financieelOnderneming?.[o.id] ? `<h3>Financiële informatie ${esc(o.naam)}</h3>${pre(n.financieelOnderneming[o.id])}` : '')).join('')}

    ${nulDeel}

    <h2>Inkomen</h2>
    ${isNul ? '' : `<ul>${kader.inkomensberekening.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${r.status !== 'niet_akkoord' ? '<p>Het hierboven vermelde inkomen is voldoende representatief als bestendig zakelijk inkomen.</p>' : ''}`}
    <h3>Handmatige wijzigingen (expert judgement)</h3>${handmatig}
    ${correctieOverzicht}
    <h3>Zakelijk inkomen</h3>${zakelijk}
    ${r.meldingen.length ? `<h3>Aandachtspunten uit de berekening</h3><ul>${r.meldingen.map((m) => `<li>${esc(STATUS_TEKST[m.niveau] || 'Info')}: ${esc(m.tekst)}</li>`).join('')}</ul>` : ''}

    <h2>Controles en beoordeling</h2>
    <h3>Maatschappijspecifieke controles</h3>${controleTabel}
    <h3>Beoordeling inkomensvaststelling</h3>${beoordeling}

    <h2>Dossieraantekeningen</h2>
    <h3>Financiële informatie ondernemer in privé</h3>${pre(n.priveTekst)}
    ${r.rc?.maandlast || r.leningDirectie?.maandlast ? kv([
      r.rc?.maandlast ? ['Maandlast R/C directie', esc(fmt.eur(r.rc.maandlast))] : null,
      r.leningDirectie?.maandlast ? ['Maandlast lening directie', esc(fmt.eur(r.leningDirectie.maandlast, 2))] : null,
    ]) : ''}
    <h3>Kredietbestemming en aflossing</h3>${pre(n.kredietbestemming)}
    <h3>Conclusie</h3>${pre(n.conclusie)}
    <h3>Bijlagen</h3>${pre(n.bijlagen)}
    <h3>Aandachtspunten voor adviseur en acceptant</h3>${aandachtspunten}
    <p class="dempen klein">Vraag altijd na of er nieuwere cijfers beschikbaar zijn of dat er noemenswaardige wijzigingen in de onderneming hebben plaatsgevonden.</p>

    ${perOnderneming}
    ${isNul ? '' : `<div class="paginabreuk"></div><h2>Totaalberekening</h2>${renderTrace(r.trace)}`}
  </article>`;
}

/** Platte tekst in de opbouw van de dossiernotities (om te plakken in een archief- of acceptatiesysteem). */
export function dossierNotitiesTekst(d, r) {
  const n = d.notities || {};
  const regels = [];
  const kader = kaderVoor(d);
  regels.push('Algemeen');
  regels.push(`Aanvrager\t${naamAanvrager(d.aanvrager)}`);
  regels.push(`Soort aanvraag\t${SOORTEN[d.soort]} ${kader.nhg ? 'met NHG' : `zonder NHG (${kader.kort})`}`);
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
    const jaren = ordeJaren(r.C ? [...r.T, r.C] : [...r.T]);
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
    regels.push(d.afwijkend?.actief ? `Afwijkend inkomen ${fmt.eur(num(d.afwijkend.bedrag))}: ${d.afwijkend.motivatie || ''}` : 'Geen handmatige wijzigingen.');
    regels.push('');
    regels.push('Zakelijk inkomen');
    regels.push(r.bron === 'geen' ? 'Er kan géén zakelijk inkomen worden afgegeven.' : `Het zakelijk inkomen bedraagt ${fmt.eur(r.vastgesteld, 2)}`);
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
  const jarenC = ordeJaren(r.C ? [...r.T, r.C] : [...r.T]);
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
