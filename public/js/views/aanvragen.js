// Overzicht "Nieuwe en lopende aanvragen" / "Afgeronde aanvragen", opgebouwd zoals de
// aanvragenlijst van de rekensoftware: vaste kolommen, sorteren, zoeken, filter, paginering,
// pop-ups voor status, hypotheekaanvraagnummer, taken, kopiëren en herbeoordelen.
import { esc, fmt, naamAanvrager, todayISO } from '../util.js';
import { lijst, get, state } from '../state.js';
import { bereken } from '../engine/index.js';
import { soortOndernemer } from '../engine/kaders.js';
import { AFGEROND, DOSSIER_STATUSSEN } from '../schema/fields.js';
import { datumKort } from './layout.js';
import { pil, statusPil, leeg, icoon } from './ui.js';
import { ui } from './uistate.js';

export const filters = { zoek: '', kader: '', soort: '', status: '', mijn: false, spoed: false };

const cache = new Map();
export function samenvatting(d) {
  const sleutel = `${d.id}|${d.gewijzigd}|${d.version}`;
  const c = cache.get(d.id);
  if (c && c.sleutel === sleutel) return c.r;
  let r;
  try {
    const res = bereken(d);
    r = { status: res.status, vastgesteld: res.vastgesteld, soort: res.soort, bron: res.bron, berekend: res.berekend };
  } catch (e) {
    r = { status: 'attentie', vastgesteld: 0, fout: e.message };
  }
  cache.set(d.id, { sleutel, r });
  return r;
}

export function soortAanvraagTekst(d) {
  const label = d.label || (d.kader === 'ABN' ? 'ABN AMRO' : '');
  const nhg = d.kader === 'NHG' ? 'met NHG' : 'zonder NHG';
  return `${d.soort === 'NUL' ? '0-verklaring' : 'IKV'} ${label} ${nhg}`.replace(/\s+/g, ' ').trim();
}

export function ibDga(d) {
  const s = new Set((d.ondernemingen || []).map((o) => (soortOndernemer(o.rechtsvorm) === 'VPB' ? 'DGA' : 'IB')));
  if (s.has('IB') && s.has('DGA')) return 'IB+DGA';
  return s.has('DGA') ? 'DGA' : s.has('IB') ? 'IB' : '';
}

function klantSleutel(d) {
  const a = d.aanvrager || {};
  return `${String(a.achternaam || '').toLowerCase().trim()}|${String(a.voorletters || '').toLowerCase().replace(/\s/g, '')}|${a.geboortedatum || ''}`;
}

export function eerdereAanvragen(d) {
  const k = klantSleutel(d);
  return lijst('dossier').filter((x) => x.id !== d.id && klantSleutel(x) === k);
}

function openTaken(d) {
  return lijst('taak').filter((t) => t.dossierId === d.id && t.status !== 'gereed');
}

function datumStatus(d) { return d.statusDatum || d.gewijzigd || d.aangemaakt || ''; }
function datumAanvraag(d) { return d.datumAanvraag || String(d.aangemaakt || '').slice(0, 10); }

const KOLOMMEN = [
  { k: 'naam', label: 'Naam', w: (d) => naamAanvrager(d.aanvrager).toLowerCase() },
  { k: 'hypotheek', label: 'Hypotheek<br>aanvr. nr.', w: (d) => d.leningnummer || '' },
  { k: 'eerder', label: '', w: () => 0, sorteer: false },
  { k: 'nr', label: 'Nr.', w: (d) => d.nummer || '' },
  { k: 'datumAanvraag', label: 'Datum<br>aanvraag', w: datumAanvraag },
  { k: 'soort', label: 'Soort<br>aanvraag', w: soortAanvraagTekst },
  { k: 'status', label: 'Status', w: (d) => Object.keys(DOSSIER_STATUSSEN).indexOf(d.status) },
  { k: 'datumStatus', label: 'Datum<br>status', w: datumStatus },
  { k: 'ibdga', label: 'IB/<br>DGA', w: ibDga },
  { k: 'behandelaar', label: 'Behan-<br>delaar', w: (d) => d.behandelaar || '' },
  { k: 'uiterste', label: 'Uiterste<br>datum', w: (d) => d.uitersteDatum || '9999' },
  { k: 'aantal', label: 'Aant.<br>ondern.', w: (d) => (d.ondernemingen || []).length },
  { k: 'spoed', label: 'Spoed<br>dossier', w: (d) => (d.spoed ? 1 : 0) },
  { k: 'statutair', label: 'Statutaire naam<br>Onderneming 1', w: (d) => (d.ondernemingen?.[0]?.naam || '').toLowerCase() },
  { k: 'advies', label: 'Advieskantoor', w: (d) => (get(d.advieskantoorId)?.naam || '').toLowerCase() },
  { k: 'via', label: 'Via', w: (d) => d.via || '' },
  { k: 'opdrachtnemer', label: 'Opdracht-<br>nemer', w: (d) => d.label || '' },
  { k: 'inkomen', label: 'Zakelijk<br>inkomen', w: (d) => samenvatting(d).vastgesteld || 0, num: true },
  { k: 'uitkomst', label: 'Uitkomst', w: (d) => ['akkoord', 'attentie', 'niet_akkoord'].indexOf(samenvatting(d).status) },
];

function zoekTekst(d) {
  const adv = get(d.advieskantoorId);
  return [d.nummer, d.leningnummer, naamAanvrager(d.aanvrager), d.aanvrager?.woonplaats, adv?.naam, d.behandelaar, d.via, d.label,
    ...(d.ondernemingen || []).map((o) => `${o.naam} ${o.kvk || ''}`)].join(' ').toLowerCase();
}

export function gefilterdeDossiers(afgerond) {
  const mijnNaam = state.profiel?.naam || '';
  const z = afgerond ? ui.aanvragen.zoekAfgerond : null;
  const rijen = lijst('dossier')
    .filter((d) => (afgerond ? AFGEROND.includes(d.status) : !AFGEROND.includes(d.status)))
    .filter((d) => !filters.kader || d.kader === filters.kader)
    .filter((d) => !filters.soort || d.soort === filters.soort)
    .filter((d) => !filters.status || d.status === filters.status)
    .filter((d) => !filters.spoed || d.spoed)
    .filter((d) => !filters.mijn || d.behandelaar === mijnNaam || d.fiatteur === mijnNaam)
    .filter((d) => !filters.zoek || zoekTekst(d).includes(filters.zoek.toLowerCase()))
    .filter((d) => {
      if (!z) return true;
      if (z.achternaam && !String(d.aanvrager?.achternaam || '').toLowerCase().startsWith(z.achternaam.toLowerCase())) return false;
      if (z.hypotheek && !String(d.leningnummer || '').includes(z.hypotheek)) return false;
      if (z.nummer && !String(d.nummer || '').toLowerCase().includes(z.nummer.toLowerCase())) return false;
      const ds = String(datumStatus(d)).slice(0, 10);
      if (z.vanaf && ds < z.vanaf) return false;
      if (z.tot && ds > z.tot) return false;
      return true;
    });
  const kol = KOLOMMEN.find((k) => k.k === ui.aanvragen.sort.kol) || KOLOMMEN[7];
  const r = ui.aanvragen.sort.richting === 'asc' ? 1 : -1;
  return rijen.sort((a, b) => {
    const x = kol.w(a);
    const y = kol.w(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * r;
    return String(x).localeCompare(String(y), 'nl') * r;
  });
}

function cel(d, k) {
  const s = () => samenvatting(d);
  switch (k) {
    case 'naam': return `<a href="#/dossier/${esc(d.id)}" class="grid-naam">${esc(naamAanvrager(d.aanvrager))}</a>`;
    case 'hypotheek': return `<button type="button" class="grid-link" data-actie="hypotheeknummer" data-id="${esc(d.id)}" title="Hypotheekaanvraagnummer wijzigen">${esc(d.leningnummer || '—')}</button>`;
    case 'eerder': {
      const n = eerdereAanvragen(d).length;
      return n ? `<button type="button" class="grid-ico eerder" data-actie="eerdere-aanvragen" data-id="${esc(d.id)}" title="${n} eerdere of andere aanvraag/aanvragen van deze klant">${icoon('info')}</button>` : '';
    }
    case 'nr': return esc(d.nummer || '');
    case 'datumAanvraag': return esc(fmt.datum(datumAanvraag(d)));
    case 'soort': return esc(soortAanvraagTekst(d));
    case 'status': return `<button type="button" class="grid-status ${esc(d.status)}" data-actie="status-wijzigen" data-id="${esc(d.id)}" title="Status wijzigen">${esc(DOSSIER_STATUSSEN[d.status] || d.status)}</button>${d.teruggezet && d.status === 'beoordeling_1' ? ' <span class="pil attentie" title="Teruggezet na de tweede beoordeling">terug</span>' : ''}`;
    case 'datumStatus': return esc(fmt.tijdstip(datumStatus(d)));
    case 'ibdga': return esc(ibDga(d));
    case 'behandelaar': return `<span title="${esc(d.behandelaar || '')}">${esc(initialen(d.behandelaar))}</span>`;
    case 'uiterste': {
      const u = d.uitersteDatum;
      const telaat = u && u < todayISO() && !AFGEROND.includes(d.status);
      return u ? `<span class="${telaat ? 'te-laat' : ''}">${esc(fmt.datum(u))}</span>` : '';
    }
    case 'aantal': return String((d.ondernemingen || []).length);
    case 'spoed': return d.spoed ? 'Ja' : 'Nee';
    case 'statutair': return esc(d.ondernemingen?.[0]?.naam || '');
    case 'advies': return esc(get(d.advieskantoorId)?.naam || '');
    case 'via': return esc(d.via || '');
    case 'opdrachtnemer': return esc(d.label || '');
    case 'inkomen': return d.soort === 'NUL' ? '€ 0' : esc(fmt.eur(s().vastgesteld));
    case 'uitkomst': return pil(s().status);
    default: return '';
  }
}

function initialen(naam) {
  if (!naam) return '';
  const p = state.profiel;
  if (p?.naam === naam && p.initialen) return p.initialen;
  return naam.split(/[\s.]+/).filter(Boolean).map((x) => x[0]).join('').slice(0, 4);
}

export function tabelAanvragen(afgerond) {
  const alle = gefilterdeDossiers(afgerond);
  const grootte = ui.aanvragen.grootte;
  const paginas = Math.max(1, Math.ceil(alle.length / grootte));
  if (ui.aanvragen.pagina > paginas) ui.aanvragen.pagina = paginas;
  const pagina = ui.aanvragen.pagina;
  const rijen = alle.slice((pagina - 1) * grootte, pagina * grootte);
  const vandaag = todayISO();
  const sel = ui.aanvragen.selectie;
  if (!alle.length) {
    return leeg(afgerond ? 'Er zijn geen afgeronde aanvragen die aan de zoekopdracht voldoen.' : 'Geen lopende aanvragen gevonden.',
      afgerond ? '<button class="knop sec" data-actie="toon-alle-klanten">Toon alle klanten</button>' : '<button class="knop" data-actie="nieuwe-aanvraag">Nieuwe klant</button>');
  }
  const { kol: sk, richting } = ui.aanvragen.sort;
  const kop = `<tr><th class="sel"><input type="checkbox" aria-label="Alles selecteren" data-actie="selecteer-alles"${rijen.every((d) => sel.has(d.id)) ? ' checked' : ''}></th><th class="acties-kol"></th>${KOLOMMEN.map((k) => (k.sorteer === false
    ? '<th class="ico-kol"></th>'
    : `<th class="${k.num ? 'num ' : ''}${k.k === sk ? `gesorteerd ${richting}` : ''}"><button type="button" data-actie="sorteer" data-kol="${k.k}">${k.label}</button></th>`)).join('')}<th class="ico-kol"></th></tr>`;
  const body = rijen.map((d) => {
    const taken = openTaken(d).length;
    const meekijk = d.meekijken?.datum === vandaag;
    return `<tr class="${meekijk ? 'meekijken' : ''}${sel.has(d.id) ? ' geselecteerd' : ''}" data-id="${esc(d.id)}">
      <td class="sel"><input type="checkbox" aria-label="Selecteer ${esc(d.nummer)}" data-actie="selecteer" data-id="${esc(d.id)}"${sel.has(d.id) ? ' checked' : ''}></td>
      <td class="acties-kol nowrap">
        <a class="grid-ico" href="#/dossier/${esc(d.id)}" title="Dossier openen">${icoon('persoon')}</a>
        <button type="button" class="grid-ico" data-actie="kopieer-dossier" data-id="${esc(d.id)}" title="Dossier kopiëren">${icoon('kopie')}</button>
        <button type="button" class="grid-ico${taken ? ' heeft' : ''}" data-actie="taken-dossier" data-id="${esc(d.id)}" title="Taken (${taken} open)">${icoon('taken')}${taken ? `<sup>${taken}</sup>` : ''}</button>
      </td>
      ${KOLOMMEN.map((k) => `<td class="${k.num ? 'num ' : ''}k-${k.k}${k.k === 'spoed' && d.spoed ? ' spoed' : ''}">${cel(d, k.k)}</td>`).join('')}
      <td class="ico-kol"><button type="button" class="grid-ico gevaar" data-actie="verwijder-klant" data-id="${esc(d.id)}" title="Verwijder klant">${icoon('prullenbak')}</button></td>
    </tr>`;
  }).join('');
  const nummers = [];
  for (let i = 1; i <= paginas; i += 1) {
    if (i === 1 || i === paginas || Math.abs(i - pagina) <= 2) nummers.push(i);
    else if (nummers[nummers.length - 1] !== '…') nummers.push('…');
  }
  const pager = `<div class="pager">
    <span class="pager-lead">Pagina ${pagina} van ${paginas} (${alle.length} ${alle.length === 1 ? 'klant' : 'klanten'})</span>
    <span class="pager-nrs">${nummers.map((n) => (n === '…' ? '<span class="dempen">…</span>' : `<button type="button" class="${n === pagina ? 'actief' : ''}" data-actie="pagina" data-pagina="${n}">${n}</button>`)).join('')}</span>
    <label class="pager-grootte">Pagina grootte: <select data-actie="paginagrootte">${[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 100, 250].map((n) => `<option${n === grootte ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
  </div>`;
  return `<div class="scroll"><table class="grid">${`<thead>${kop}</thead>`}<tbody>${body}</tbody></table></div>${pager}`;
}

export function renderAanvragen(afgerond) {
  const lopend = lijst('dossier').filter((d) => !AFGEROND.includes(d.status)).length;
  const klaar = lijst('dossier').filter((d) => AFGEROND.includes(d.status)).length;
  const statusOpties = Object.entries(DOSSIER_STATUSSEN).filter(([k]) => (afgerond ? AFGEROND.includes(k) : !AFGEROND.includes(k)));
  const sel = ui.aanvragen.selectie.size;
  const z = ui.aanvragen.zoekAfgerond;
  const filterActief = filters.kader || filters.soort || filters.status || filters.mijn || filters.spoed;
  const filterPaneel = ui.aanvragen.filterOpen ? `<div class="filterpaneel geen-print">
      <select data-filter="kader" aria-label="Kader"><option value="">Alle kaders</option>
        <option value="NHG"${filters.kader === 'NHG' ? ' selected' : ''}>Met NHG</option>
        <option value="ABN"${filters.kader === 'ABN' ? ' selected' : ''}>Zonder NHG (ABN AMRO)</option></select>
      <select data-filter="soort" aria-label="Soort"><option value="">Alle soorten</option>
        <option value="IKV"${filters.soort === 'IKV' ? ' selected' : ''}>Inkomensverklaring</option>
        <option value="NUL"${filters.soort === 'NUL' ? ' selected' : ''}>0-verklaring</option></select>
      <select data-filter="status" aria-label="Status"><option value="">Alle statussen</option>
        ${statusOpties.map(([k, l]) => `<option value="${k}"${filters.status === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" data-filter="mijn"${filters.mijn ? ' checked' : ''}><span>Alleen mijn dossiers</span></label>
      <label class="check"><input type="checkbox" data-filter="spoed"${filters.spoed ? ' checked' : ''}><span>Alleen spoed</span></label>
    </div>` : '';
  return `<div class="viiz-tabs geen-print" role="tablist">
      <a href="#/klanten" role="tab" class="${afgerond ? '' : 'actief'}" aria-selected="${!afgerond}">Nieuwe en lopende aanvragen <span class="teller">${lopend}</span></a>
      <a href="#/klanten/afgerond" role="tab" class="${afgerond ? 'actief' : ''}" aria-selected="${afgerond}">Afgeronde aanvragen <span class="teller">${klaar}</span></a>
    </div>
    <div class="grid-paneel">
      <div class="grid-toolbar geen-print">
        <div class="zoekveld">${icoon('zoek')}<input class="zoek" type="search" placeholder="Zoek op naam, dossiernummer, aanvraagnummer, onderneming of KvK" value="${esc(filters.zoek)}" data-filter="zoek" aria-label="Zoeken"></div>
        <button class="knop sec klein" data-actie="toon-alle-klanten">Toon alle klanten</button>
        <button class="knop sec klein${filterActief ? ' actief' : ''}" data-actie="filter-maken">${ui.aanvragen.filterOpen ? 'Filter sluiten' : 'Filter maken'}${filterActief ? ' •' : ''}</button>
        ${afgerond ? `<button class="knop sec klein" data-actie="zoek-afgerond">${icoon('zoek')}Zoeken in afgeronde aanvragen${z ? ' •' : ''}</button>` : ''}
        <span class="vul"></span>
        <button class="knop sec klein" data-actie="verzamelmail"${sel ? '' : ' disabled'} title="Eén e-mail per advieskantoor met de ontbrekende stukken van de geselecteerde dossiers">${icoon('mail')}Verzamelmail${sel ? ` (${sel})` : ''}</button>
      </div>
      ${filterPaneel}
      ${z ? `<div class="melding info geen-print" style="margin:0 12px 10px">Zoekopdracht: ${esc([z.achternaam && `achternaam begint met "${z.achternaam}"`, z.hypotheek && `aanvraagnummer ${z.hypotheek}`, z.nummer && `dossier ${z.nummer}`, z.vanaf && `vanaf ${fmt.datum(z.vanaf)}`, z.tot && `t/m ${fmt.datum(z.tot)}`].filter(Boolean).join(', '))}
        <button class="knop link klein" data-actie="toon-alle-klanten">Wissen</button></div>` : ''}
      <div id="aanvragen-tabel">${tabelAanvragen(afgerond)}</div>
    </div>
    <div class="fab-groep geen-print">
      ${afgerond ? `<button class="fab sec" data-actie="herbeoordeling" title="Aanvraag herbeoordeling">${icoon('herhaal')}<span>Herbeoordeling</span></button>` : ''}
      <button class="fab" data-actie="nieuwe-aanvraag" title="Nieuwe klant">${icoon('plus')}<span>Nieuwe klant</span></button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Inhoud van de pop-ups
// ---------------------------------------------------------------------------
export const SOORT_KEUZES = [
  ['IKV|NHG', 'Inkomensverklaring met NHG'],
  ['IKV|ABN', 'Inkomensverklaring zonder NHG (ABN AMRO Woonbeleid)'],
  ['NUL|ABN', '0-verklaring / beoordelingsverklaring zonder NHG'],
  ['NUL|NHG', '0-verklaring / beoordelingsverklaring met NHG'],
];

export function modaalNieuweKlant() {
  const adv = lijst('advieskantoor').sort((a, b) => a.naam.localeCompare(b.naam));
  return `<div class="formulier">
    <label class="veld"><span>Voorletter(s) klant *</span><input name="voorletters" autocomplete="off"></label>
    <label class="veld"><span>Tussenvoegsel</span><input name="tussenvoegsel" autocomplete="off"></label>
    <label class="veld"><span>Achternaam klant *</span><input name="achternaam" autocomplete="off"></label>
    <fieldset class="keuzes"><legend>Soort aanvraag *</legend>
      ${SOORT_KEUZES.map(([k, l], i) => `<label class="check"><input type="radio" name="soortkader" value="${k}"${i === 1 ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}
    </fieldset>
    <div class="raster-2" style="grid-template-columns:1fr 1fr;gap:12px">
      <label class="veld"><span>Geldverstrekker (label)</span><select name="label">${['ABN AMRO', 'Florius', 'Moneyou', 'Overig'].map((x) => `<option>${x}</option>`).join('')}</select></label>
      <label class="veld"><span>Hypotheekaanvraagnummer</span><input name="leningnummer" autocomplete="off"></label>
      <label class="veld"><span>Advieskantoor</span><select name="advieskantoor"><option value="">Geen / onbekend</option>${adv.map((a) => `<option value="${esc(a.id)}">${esc(a.naam)}</option>`).join('')}</select></label>
      <label class="veld"><span>Uiterste datum</span><input type="date" name="uiterste"></label>
    </div>
    <label class="check"><input type="checkbox" name="spoed"><span>Spoeddossier</span></label>
  </div>`;
}

export function modaalStatus(d) {
  return `<p>${esc(naamAanvrager(d.aanvrager))}, dossier ${esc(d.nummer)}</p>
    <label class="veld"><span>Status</span><select name="status">${Object.entries(DOSSIER_STATUSSEN).map(([k, l]) => `<option value="${k}"${k === d.status ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="veld" style="margin-top:10px"><span>Toelichting (komt in de historie)</span><input name="toelichting" autocomplete="off"></label>
    <input type="hidden" name="id" value="${esc(d.id)}">`;
}

export function modaalHypotheeknummer(d) {
  return `<label class="veld"><span>Hypotheekaanvraagnummer</span><input name="leningnummer" value="${esc(d.leningnummer || '')}" autocomplete="off"></label>
    <input type="hidden" name="id" value="${esc(d.id)}">`;
}

export function modaalTaken(d) {
  const taken = lijst('taak').filter((t) => t.dossierId === d.id).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
  return `<div class="scroll"><table class="tabel compact"><thead><tr><th>Aangemaakt op</th><th>Aangemaakt door</th><th>Omschrijving</th><th>Uiterste datum</th><th>Taak voor</th><th>Afgerond</th></tr></thead>
    <tbody>${taken.map((t) => `<tr><td class="nowrap">${esc(datumKort(t.aangemaakt))}</td><td>${esc(t.door || '')}</td><td>${esc(t.titel)}</td>
      <td class="nowrap">${esc(fmt.datum(t.deadline))}</td><td>${esc(t.toegewezenAan || '')}</td>
      <td><input type="checkbox" aria-label="Afgerond"${t.status === 'gereed' ? ' checked' : ''} data-actie="taak-toggle" data-id="${esc(t.id)}" data-blijf="1"></td></tr>`).join('')
      || '<tr><td colspan="6" class="leeg">Geen gegevens beschikbaar</td></tr>'}</tbody></table></div>
    <div class="raster-3" style="margin-top:14px;grid-template-columns:2fr 1fr 1fr">
      <label class="veld"><span>Nieuwe taak</span><input name="titel" autocomplete="off"></label>
      <label class="veld"><span>Taak voor</span><input name="wie" value="${esc(state.profiel?.naam || '')}"></label>
      <label class="veld"><span>Uiterste datum</span><input type="date" name="deadline" value="${esc(todayISO())}"></label>
    </div>
    <input type="hidden" name="id" value="${esc(d.id)}">`;
}

export function modaalKopieren(d) {
  return `<p><b>Je maakt een kopie van dossier ${esc(d.nummer)} (${esc(naamAanvrager(d.aanvrager))}).</b></p>
    <p>De kopie krijgt een nieuw dossiernummer en dezelfde klantnaam. Alle invoer gaat mee: klantgegevens, ondernemingen, balans, winst- en verliesrekening, IB-aangifte en notities. Documenten gaan niet mee; die upload je opnieuw in de kopie.</p>
    <p><b>Let op:</b> twee dossiers met dezelfde klantnaam raken snel verward. Kopieer alleen als het nodig is en verwijder een kopie die je niet meer gebruikt.</p>
    <p class="dempen">Handig bij bijvoorbeeld twee vennoten in dezelfde vof: vul eerst alles in behalve de IB-aangifte, kopieer, en pas daarna in de kopie de klantgegevens en de IB-aangifte van de tweede vennoot aan.</p>
    <input type="hidden" name="id" value="${esc(d.id)}">`;
}

export function modaalVerwijderen(d) {
  return `<p>Weet je zeker dat je klant <b>${esc(naamAanvrager(d.aanvrager))}</b> (dossier ${esc(d.nummer)}) definitief wilt verwijderen?</p>
    <p><b>Alle gegevens en documenten van dit dossier worden verwijderd.</b> In de cloudopslag blijven eerdere versies bewaard voor herstel door beheer.</p>
    <input type="hidden" name="id" value="${esc(d.id)}">`;
}

export function modaalEerdereAanvragen(d) {
  const ds = eerdereAanvragen(d).sort((a, b) => String(b.aangemaakt).localeCompare(String(a.aangemaakt)));
  return `<table class="tabel compact"><thead><tr><th>Dossier</th><th>Soort</th><th>Status</th><th>Datum status</th><th class="num">Inkomen</th></tr></thead><tbody>
    ${ds.map((x) => `<tr><td><a href="#/dossier/${esc(x.id)}">${esc(x.nummer)}</a></td><td>${esc(soortAanvraagTekst(x))}</td><td>${statusPil(x.status)}</td>
      <td class="nowrap">${esc(fmt.tijdstip(datumStatus(x)))}</td><td class="num">${x.soort === 'NUL' ? '€ 0' : esc(fmt.eur(samenvatting(x).vastgesteld))}</td></tr>`).join('')}</tbody></table>`;
}

export function modaalHerbeoordeling() {
  const grens = new Date();
  grens.setMonth(grens.getMonth() - 6);
  const grensISO = grens.toISOString().slice(0, 10);
  const ds = lijst('dossier').filter((d) => d.status === 'afgerond')
    .sort((a, b) => String(datumStatus(b)).localeCompare(String(datumStatus(a))));
  return `<p><b>Een herbeoordeling maakt een kopie van een afgerond dossier</b> met de status "Documenten uploaden". Het oorspronkelijke dossier blijft ongewijzigd. Dossiers die langer dan zes maanden geleden zijn afgerond, zijn gemarkeerd.</p>
    <label class="veld"><span>Te herbeoordelen dossier *</span><select name="id"><option value="">Kies een dossier</option>
      ${ds.map((d) => `<option value="${esc(d.id)}">${esc(d.nummer)} – ${esc(naamAanvrager(d.aanvrager))} (${esc(fmt.datum(String(datumStatus(d)).slice(0, 10)))})${String(datumStatus(d)).slice(0, 10) < grensISO ? ' – ouder dan 6 maanden' : ''}</option>`).join('')}</select></label>
    <label class="veld" style="margin-top:10px"><span>Reden van de herbeoordeling *</span><textarea name="toelichting" rows="4" placeholder="Bijvoorbeeld: nieuwe jaarcijfers beschikbaar, wijziging in de structuur."></textarea></label>`;
}

export function modaalZoekAfgerond() {
  const z = ui.aanvragen.zoekAfgerond || {};
  return `<div class="raster-2" style="grid-template-columns:1fr 1fr;gap:12px">
    <label class="veld"><span>Achternaam (begint met…)</span><input name="achternaam" value="${esc(z.achternaam || '')}"></label>
    <label class="veld"><span>Hypotheekaanvraagnummer</span><input name="hypotheek" value="${esc(z.hypotheek || '')}"></label>
    <label class="veld"><span>Dossiernummer</span><input name="nummer" value="${esc(z.nummer || '')}"></label>
    <span></span>
    <label class="veld"><span>Vanaf (datum status)</span><input type="date" name="vanaf" value="${esc(z.vanaf || '')}"></label>
    <label class="veld"><span>Tot en met (datum status)</span><input type="date" name="tot" value="${esc(z.tot || '')}"></label>
  </div>`;
}
