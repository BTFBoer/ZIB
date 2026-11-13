// Overzicht "Nieuwe en lopende aanvragen" / "Afgeronde aanvragen", opgebouwd zoals de
// aanvragenlijst van de rekensoftware: vaste kolommen, sorteren, zoeken, filter, paginering,
// pop-ups voor status, hypotheekaanvraagnummer, taken, kopiëren en herbeoordelen.
import { esc, fmt, naamAanvrager, todayISO } from '../util.js';
import { lijst, get, state, kanBeleidsvoorbeeldenLaden } from '../state.js';
import { bereken } from '../engine/index.js';
import { dossierMetNhg, soortOndernemer, KADERS, KADER_VOLGORDE } from '../engine/kaders.js';
import { AFGEROND, DOSSIER_STATUSSEN } from '../schema/fields.js';
import { docAanwezig } from '../schema/documenten.js';
import { deadlineKlasse, deadlineTekst, kolomFilterPast } from '../lijsten.js';
import { datumKort } from './layout.js';
import { pil, statusPil, icoon, STATUS_TEKST } from './ui.js';
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
    r = { status: res.status, vastgesteld: res.vastgesteld, soort: res.soort, bron: res.bron, berekend: res.berekend, beleid: res.beleid,
      vereist: (res.documenten || []).filter((x) => x.verplicht).map((x) => ({ categorie: x.categorie, aantal: x.aantal })) };
  } catch (e) {
    r = { status: 'attentie', vastgesteld: 0, fout: e.message };
  }
  cache.set(d.id, { sleutel, r });
  return r;
}

export function soortAanvraagTekst(d) {
  if (d.soort === 'ANALYSE') return 'Inkomensanalyse';
  const k = KADERS[d.kader];
  const label = d.label || (k && d.kader !== 'NHG' ? k.kort : '');
  const nhg = dossierMetNhg(d) ? 'met NHG' : 'zonder NHG';
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

/** Open taken van een dossier, de eerstvolgende bovenaan. */
export function openTaken(d) {
  return lijst('taak').filter((t) => t.dossierId === d.id && t.status !== 'gereed')
    .sort((a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')));
}

/** Aantal verplichte documenten dat nog ontbreekt (op basis van de documentenlijst van het toetskader). */
export function ontbrekendeDocumenten(d) {
  const vereist = samenvatting(d).vereist || [];
  if (!vereist.length) return 0;
  const docs = lijst('document').filter((x) => x.dossierId === d.id);
  return vereist.filter((x) => !docAanwezig(docs, x)).length;
}

function datumStatus(d) { return d.statusDatum || d.gewijzigd || d.aangemaakt || ''; }
function datumAanvraag(d) { return d.datumAanvraag || String(d.aangemaakt || '').slice(0, 10); }

function initialen(naam) {
  if (!naam) return '';
  const p = state.profiel;
  if (p?.naam === naam && p.initialen) return p.initialen;
  return naam.split(/[\s.]+/).filter(Boolean).map((x) => x[0]).join('').slice(0, 4);
}

// Kolommen in de volgorde van de aanvragenlijst van de rekensoftware.
//   std / stdAfg: standaard zichtbaar bij lopende / afgeronde aanvragen (aan te passen via "Kolommen")
//   filter: 'tekst' (bevat) of 'keuze' (exacte waarde) in de filterrij; tekst(d) is de tekst waarop gefilterd wordt
//   w(d): sorteerwaarde
const KOLOMMEN = [
  { k: 'naam', label: 'Naam', std: true, stdAfg: true, filter: 'tekst', w: (d) => naamAanvrager(d.aanvrager).toLowerCase(), tekst: (d) => naamAanvrager(d.aanvrager) },
  { k: 'hypotheek', label: 'Hypotheek<br>aanvr. nr.', lang: 'Hypotheekaanvraagnummer', std: true, stdAfg: true, filter: 'tekst', w: (d) => d.leningnummer || '', tekst: (d) => d.leningnummer || '' },
  { k: 'eerder', label: '', vast: true, sorteer: false, w: () => 0 },
  { k: 'nr', label: 'Nr.', lang: 'Dossiernummer', std: true, stdAfg: true, filter: 'tekst', w: (d) => d.nummer || '', tekst: (d) => d.nummer || '' },
  { k: 'datumAanvraag', label: 'Datum<br>aanvraag', lang: 'Datum aanvraag', filter: 'tekst', w: datumAanvraag, tekst: (d) => fmt.datum(datumAanvraag(d)) },
  { k: 'soort', label: 'Soort<br>aanvraag', lang: 'Soort aanvraag', std: true, stdAfg: true, filter: 'tekst', w: soortAanvraagTekst, tekst: soortAanvraagTekst },
  { k: 'status', label: 'Status', std: true, stdAfg: true, filter: 'keuze', w: (d) => Object.keys(DOSSIER_STATUSSEN).indexOf(d.status), tekst: (d) => DOSSIER_STATUSSEN[d.status] || d.status },
  { k: 'datumStatus', label: 'Datum<br>status', lang: 'Datum status', stdAfg: true, filter: 'tekst', w: datumStatus, tekst: (d) => fmt.tijdstip(datumStatus(d)) },
  { k: 'ibdga', label: 'IB/<br>DGA', lang: 'IB / DGA', filter: 'keuze', w: ibDga, tekst: ibDga },
  { k: 'uiterste', label: 'Uiterste<br>datum', lang: 'Uiterste datum', std: true, filter: 'tekst', w: (d) => d.uitersteDatum || '9999', tekst: (d) => fmt.datum(d.uitersteDatum) },
  { k: 'spoed', label: 'Spoed<br>dossier', lang: 'Spoeddossier', std: true, filter: 'keuze', w: (d) => (d.spoed ? 1 : 0), tekst: (d) => (d.spoed ? 'Ja' : 'Nee') },
  { k: 'behandelaar', label: 'Behan-<br>delaar', lang: 'Behandelaar', std: true, stdAfg: true, filter: 'tekst', w: (d) => d.behandelaar || '', tekst: (d) => `${d.behandelaar || ''} ${initialen(d.behandelaar)}` },
  { k: 'aantal', label: 'Aant.<br>ondern.', lang: 'Aantal ondernemingen', w: (d) => (d.ondernemingen || []).length },
  { k: 'taak', label: 'Lopende taak', std: true, filter: 'tekst', w: (d) => openTaken(d)[0]?.deadline || '9999', tekst: (d) => openTaken(d).map((t) => t.titel).join(' ') },
  { k: 'statutair', label: 'Statutaire naam<br>Onderneming 1', lang: 'Onderneming', std: true, stdAfg: true, filter: 'tekst', w: (d) => (d.ondernemingen?.[0]?.naam || '').toLowerCase(), tekst: (d) => (d.ondernemingen || []).map((o) => o.naam || '').join(' ') },
  { k: 'advies', label: 'Advieskantoor', filter: 'tekst', w: (d) => (get(d.advieskantoorId)?.naam || '').toLowerCase(), tekst: (d) => get(d.advieskantoorId)?.naam || '' },
  { k: 'via', label: 'Via', filter: 'tekst', w: (d) => d.via || '', tekst: (d) => d.via || '' },
  { k: 'opdrachtnemer', label: 'Opdracht-<br>nemer', lang: 'Opdrachtnemer', filter: 'tekst', w: (d) => d.label || '', tekst: (d) => d.label || '' },
  { k: 'uitkomst', label: 'Uitkomst', std: true, stdAfg: true, filter: 'keuze', w: (d) => ['akkoord', 'attentie', 'niet_akkoord'].indexOf(samenvatting(d).status), tekst: (d) => STATUS_TEKST[samenvatting(d).status] || '' },
  { k: 'inkomen', label: 'Zakelijk<br>inkomen', lang: 'Zakelijk inkomen', stdAfg: true, w: (d) => samenvatting(d).vastgesteld || 0, num: true },
];
const KOLOM = Object.fromEntries(KOLOMMEN.map((k) => [k.k, k]));
export const KOLOM_KEUZES = KOLOMMEN.filter((k) => !k.vast).map((k) => [k.k, k.lang || k.label.replace(/<br>/g, ' ')]);

/** Zichtbare kolommen: de eigen keuze van de gebruiker, anders de standaardset voor dit tabblad. */
export function zichtbareKolommen(afgerond) {
  const eigen = ui.aanvragen.kolommen;
  return KOLOMMEN.filter((k) => k.vast || (eigen ? eigen.includes(k.k) : (afgerond ? k.stdAfg : k.std)));
}

function keuzeOpties(k, afgerond) {
  if (k === 'status') return Object.entries(DOSSIER_STATUSSEN).filter(([s]) => (afgerond ? AFGEROND.includes(s) : !AFGEROND.includes(s))).map(([, l]) => l);
  if (k === 'spoed') return ['Ja', 'Nee'];
  if (k === 'ibdga') return ['IB', 'DGA', 'IB+DGA'];
  if (k === 'uitkomst') return ['Akkoord', 'Attentie', 'Niet akkoord'];
  return [];
}

function zoekTekst(d) {
  const adv = get(d.advieskantoorId);
  return [d.nummer, d.leningnummer, naamAanvrager(d.aanvrager), d.aanvrager?.woonplaats, adv?.naam, d.behandelaar, d.via, d.label,
    ...(d.ondernemingen || []).map((o) => `${o.naam} ${o.kvk || ''}`)].join(' ').toLowerCase();
}

const DOCUMENTFASE = ['documenten_uploaden', 'controleren_documenten', 'opnieuw_controleren', 'informatie_aanleveren'];

function vanTab(afgerond) {
  return lijst('dossier').filter((d) => (afgerond ? AFGEROND.includes(d.status) : !AFGEROND.includes(d.status)));
}

// Snelfilters boven de lijst: wat vraagt nu aandacht?
const SNELFILTERS = [
  ['telaat', 'Te laat', (d, v) => deadlineKlasse(d.uitersteDatum, v) === 'te-laat'],
  ['bijna', 'Binnen 2 dagen', (d, v) => deadlineKlasse(d.uitersteDatum, v) === 'bijna'],
  ['spoed', 'Spoed', (d) => !!d.spoed],
  ['taken', 'Met open taken', (d) => openTaken(d).length > 0],
  ['mijn', 'Mijn dossiers', (d) => { const m = state.profiel?.naam || ''; return !!m && (d.behandelaar === m || d.fiatteur === m); }],
  ['beleid-voorbeelden', 'Oefendossiers', (d) => d.id.startsWith('dos_demo_beleid_')],
];

function sortering(afgerond) {
  return afgerond ? ui.aanvragen.sortAfgerond : ui.aanvragen.sort;
}

/** Is er een zoekopdracht, snelfilter of kolomfilter actief? */
export function filterActief() {
  return !!(filters.zoek || filters.kader || filters.soort || filters.status || filters.mijn || filters.spoed || ui.aanvragen.snel
    || Object.values(ui.aanvragen.kolomFilter).some((x) => String(x || '').trim()) || ui.aanvragen.zoekAfgerond);
}

export function gefilterdeDossiers(afgerond) {
  const mijnNaam = state.profiel?.naam || '';
  const vandaag = todayISO();
  const z = afgerond ? ui.aanvragen.zoekAfgerond : null;
  const snel = afgerond ? null : SNELFILTERS.find(([k]) => k === ui.aanvragen.snel);
  const kf = ui.aanvragen.kolomFilter;
  const actieveKf = Object.keys(kf).filter((k) => String(kf[k] || '').trim() && KOLOM[k]?.tekst);
  const rijen = vanTab(afgerond)
    .filter((d) => !filters.kader || d.kader === filters.kader)
    .filter((d) => !filters.soort || d.soort === filters.soort)
    .filter((d) => !filters.status || d.status === filters.status)
    .filter((d) => !filters.spoed || d.spoed)
    .filter((d) => !filters.mijn || d.behandelaar === mijnNaam || d.fiatteur === mijnNaam)
    .filter((d) => !filters.zoek || zoekTekst(d).includes(filters.zoek.toLowerCase()))
    .filter((d) => !snel || snel[2](d, vandaag))
    .filter((d) => !actieveKf.length || kolomFilterPast(Object.fromEntries(actieveKf.map((k) => [k, KOLOM[k].tekst(d)])), kf))
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
  const s = sortering(afgerond);
  const kol = KOLOM[s.kol] || KOLOM.uiterste;
  const r = s.richting === 'asc' ? 1 : -1;
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
      if (!u) return '';
      const vandaag = todayISO();
      const klasse = AFGEROND.includes(d.status) ? '' : deadlineKlasse(u, vandaag);
      return `<span class="deadline ${klasse}"${klasse ? ` title="${esc(deadlineTekst(u, vandaag))}"` : ''}>${esc(fmt.datum(u))}</span>`;
    }
    case 'aantal': return String((d.ondernemingen || []).length);
    case 'spoed': return d.spoed ? 'Ja' : 'Nee';
    case 'taak': {
      const taken = openTaken(d);
      if (!taken.length) return '';
      const alle = taken.map((t) => `${t.deadline ? `${fmt.datum(t.deadline)}: ` : ''}${t.titel}${t.toegewezenAan ? ` (${t.toegewezenAan})` : ''}`).join('\n');
      return `<button type="button" class="grid-taak" data-actie="taken-dossier" data-id="${esc(d.id)}" title="${esc(alle)}"><span>${esc(taken[0].titel)}</span>${taken.length > 1 ? `<b>+${taken.length - 1}</b>` : ''}</button>`;
    }
    case 'statutair': return esc(d.ondernemingen?.[0]?.naam || '');
    case 'advies': return esc(get(d.advieskantoorId)?.naam || '');
    case 'via': return esc(d.via || '');
    case 'opdrachtnemer': return esc(d.label || '');
    case 'inkomen': {
      if (d.soort === 'ANALYSE') return '–';
      if (d.soort === 'NUL') return '€ 0';
      const r = s();
      if (r.beleid) {
        const waarde = r.beleid.bedrag ?? r.beleid.indicatie;
        return waarde === null ? (r.beleid.methode === 'extern' ? 'Bewijsstuk nodig' : 'Invoer aanvullen')
          : `${esc(fmt.eur(waarde))} <span class="dempen klein">${r.beleid.bewijs ? 'bewijsstuk' : 'indicatief'}</span>`;
      }
      return esc(fmt.eur(r.vastgesteld));
    }
    case 'uitkomst': return d.soort === 'ANALYSE' ? pil('neutraal', 'Vergelijking') : pil(s().status);
    default: return '';
  }
}

function filterCel(k, afgerond) {
  const def = KOLOM[k];
  const waarde = ui.aanvragen.kolomFilter[k] || '';
  const naam = def.lang || def.label.replace(/<br>/g, ' ');
  if (def.filter === 'tekst') {
    return `<input type="search" class="kolomfilter" data-kolomfilter="${k}" value="${esc(waarde)}" aria-label="Filter op ${esc(naam)}" autocomplete="off" spellcheck="false">`;
  }
  if (def.filter === 'keuze') {
    return `<select class="kolomfilter" data-kolomfilter="${k}" aria-label="Filter op ${esc(naam)}"><option value=""></option>
      ${keuzeOpties(k, afgerond).map((o) => `<option value="=${esc(o)}"${waarde === `=${o}` ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  return '';
}

/** Alleen de rijen en de paginering (bij typen in een filter blijft de kop met de filterrij staan). */
export function rijenAanvragen(afgerond) {
  const alle = gefilterdeDossiers(afgerond);
  const kolommen = zichtbareKolommen(afgerond);
  const grootte = ui.aanvragen.grootte;
  const paginas = Math.max(1, Math.ceil(alle.length / grootte));
  if (ui.aanvragen.pagina > paginas) ui.aanvragen.pagina = paginas;
  const pagina = ui.aanvragen.pagina;
  const rijen = alle.slice((pagina - 1) * grootte, pagina * grootte);
  const vandaag = todayISO();
  const sel = ui.aanvragen.selectie;
  const breedte = kolommen.length + 3;
  const body = rijen.map((d) => {
    const taken = openTaken(d).length;
    // Ontbrekende stukken tellen zolang het dossier in de documentfase zit.
    const ontbreekt = DOCUMENTFASE.includes(d.status) ? ontbrekendeDocumenten(d) : 0;
    const meekijk = d.meekijken?.datum === vandaag;
    return `<tr class="${meekijk ? 'meekijken' : ''}${sel.has(d.id) ? ' geselecteerd' : ''}" data-id="${esc(d.id)}">
      <td class="sel"><input type="checkbox" aria-label="Selecteer ${esc(d.nummer)}" data-actie="selecteer" data-id="${esc(d.id)}"${sel.has(d.id) ? ' checked' : ''}></td>
      <td class="acties-kol nowrap">
        <a class="grid-ico" href="#/dossier/${esc(d.id)}/klant" title="Klantgegevens openen">${icoon('persoon')}</a>
        <a class="grid-ico${ontbreekt ? ' heeft' : ''}" href="#/dossier/${esc(d.id)}/documenten" title="Documenten${ontbreekt ? ` (${ontbreekt} verplichte ontbreken nog)` : ''}">${icoon('map')}${ontbreekt ? `<sup>${ontbreekt}</sup>` : ''}</a>
        <a class="grid-ico" href="#/dossier/${esc(d.id)}/berekening" title="Berekening en uitkomst">${icoon('reken')}</a>
        <button type="button" class="grid-ico${taken ? ' heeft' : ''}" data-actie="taken-dossier" data-id="${esc(d.id)}" title="Taken (${taken} open)">${icoon('taken')}${taken ? `<sup>${taken}</sup>` : ''}</button>
        <button type="button" class="grid-ico" data-actie="kopieer-dossier" data-id="${esc(d.id)}" title="Dossier kopiëren">${icoon('kopie')}</button>
      </td>
      ${kolommen.map((k) => `<td class="${k.num ? 'num ' : ''}k-${k.k}${k.k === 'spoed' && d.spoed ? ' spoed' : ''}">${cel(d, k.k)}</td>`).join('')}
      <td class="ico-kol"><button type="button" class="grid-ico gevaar" data-actie="verwijder-klant" data-id="${esc(d.id)}" title="Verwijder klant">${icoon('prullenbak')}</button></td>
    </tr>`;
  }).join('') || `<tr class="geen-rijen"><td colspan="${breedte}">${afgerond ? 'Geen afgeronde aanvragen die aan de zoekopdracht of filters voldoen.' : 'Geen lopende aanvragen die aan de zoekopdracht of filters voldoen.'}
      ${filterActief() ? '<button type="button" class="knop sec klein" data-actie="toon-alle-klanten">Filters wissen</button>' : (afgerond ? '' : '<button type="button" class="knop klein" data-actie="nieuwe-aanvraag">Nieuwe klant</button>')}</td></tr>`;
  const nummers = [];
  for (let i = 1; i <= paginas; i += 1) {
    if (i === 1 || i === paginas || Math.abs(i - pagina) <= 2) nummers.push(i);
    else if (nummers[nummers.length - 1] !== '…') nummers.push('…');
  }
  const totaal = vanTab(afgerond).length;
  const pager = `<span class="pager-lead">Pagina ${pagina} van ${paginas} (${alle.length} ${alle.length === 1 ? 'klant' : 'klanten'}${alle.length !== totaal ? ` van ${totaal}` : ''})</span>
    <span class="pager-nrs">${nummers.map((n) => (n === '…' ? '<span class="dempen">…</span>' : `<button type="button" class="${n === pagina ? 'actief' : ''}" data-actie="pagina" data-pagina="${n}">${n}</button>`)).join('')}</span>
    <label class="pager-grootte">Pagina grootte: <select data-actie="paginagrootte">${[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 100, 250].map((n) => `<option${n === grootte ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
  return { body, pager, alle: rijen.every((d) => sel.has(d.id)) && rijen.length > 0 };
}

export function tabelAanvragen(afgerond) {
  const kolommen = zichtbareKolommen(afgerond);
  const { kol: sk, richting } = sortering(afgerond);
  const { body, pager, alle } = rijenAanvragen(afgerond);
  const kop = `<tr><th class="sel"><input type="checkbox" aria-label="Alles selecteren" data-actie="selecteer-alles"${alle ? ' checked' : ''}></th><th class="acties-kol"></th>${kolommen.map((k) => (k.sorteer === false
    ? `<th class="ico-kol k-${k.k}"></th>`
    : `<th class="k-${k.k}${k.num ? ' num' : ''}${k.k === sk ? ` gesorteerd ${richting}` : ''}"${k.k === sk ? ` aria-sort="${richting === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-actie="sorteer" data-kol="${k.k}" title="Sorteren">${k.label}</button></th>`)).join('')}<th class="ico-kol"></th></tr>`;
  const filterrij = `<tr class="filterrij"><th class="sel"></th><th class="acties-kol">${icoon('filter', 'Filter per kolom')}</th>${kolommen.map((k) => `<th class="k-${k.k}">${k.filter ? filterCel(k.k, afgerond) : ''}</th>`).join('')}<th class="ico-kol"></th></tr>`;
  return `<div class="scroll"><table class="grid${ui.aanvragen.kolommen ? '' : ' auto'}"><thead>${kop}${filterrij}</thead><tbody id="aanvragen-body">${body}</tbody></table></div>
    <div class="pager" id="aanvragen-pager">${pager}</div>`;
}

export function renderAanvragen(afgerond) {
  const basis = vanTab(afgerond);
  const lopend = afgerond ? vanTab(false).length : basis.length;
  const klaar = afgerond ? basis.length : vanTab(true).length;
  const sel = ui.aanvragen.selectie.size;
  const z = ui.aanvragen.zoekAfgerond;
  const vandaag = todayISO();
  const eigen = ui.aanvragen.kolommen;
  const zichtbaar = new Set(zichtbareKolommen(afgerond).map((k) => k.k));
  const chips = afgerond ? '' : SNELFILTERS.map(([k, label, test]) => {
    if (k === 'beleid-voorbeelden') return '';
    const n = basis.filter((d) => test(d, vandaag)).length;
    if (!n && ui.aanvragen.snel !== k) return '';
    return `<button type="button" class="snelfilter ${k}${ui.aanvragen.snel === k ? ' actief' : ''}" data-actie="snelfilter" data-snel="${k}" aria-pressed="${ui.aanvragen.snel === k}">${esc(label)} <b>${n}</b></button>`;
  }).join('');
  const urgentie = SNELFILTERS.filter(([k]) => ['telaat', 'bijna', 'taken'].includes(k));
  return `<section class="werkstart geen-print" aria-labelledby="werkstart-titel">
    <div class="werkstart-inhoud">
      <div class="werkstart-label"><span></span> ZIB · WERKRUIMTE</div>
      <h1 id="werkstart-titel">Aanvragen</h1>
      <p>Van jaarcijfers naar een onderbouwd toetsinkomen.</p>
      <div class="werkstart-acties">
        <button class="knop" data-actie="nieuwe-aanvraag">${icoon('plus')} Nieuwe aanvraag</button>
        <a class="knop sec" href="#/toetskaders">${icoon('boek')} Toetskaders</a>
        ${!afgerond && state.me?.hosting === 'sites' ? '<button type="button" class="knop sec" data-actie="browseroverdracht">Dossiers uit deze browser</button>' : ''}
        ${state.me?.hosting === 'sites' ? '<a class="knop sec" href="#/bronarchief">Historische brondossiers</a>' : ''}
        ${!afgerond && kanBeleidsvoorbeeldenLaden() ? `<button type="button" class="knop sec" data-actie="beleid-voorbeelden-laden" aria-pressed="${ui.aanvragen.snel === 'beleid-voorbeelden'}">${icoon('map')} Oefendossiers</button>` : ''}
      </div>
    </div>
    <div class="werkstart-illustratie" aria-hidden="true"><span></span><span></span><span></span><span></span><svg viewBox="0 0 360 110" preserveAspectRatio="none"><path d="M0 99 61 73 113 83 175 49 231 58 285 21 360 9" /><circle cx="285" cy="21" r="5" /></svg></div>
  </section>
  ${afgerond ? '' : `<div class="werkstart-kaarten geen-print" aria-label="Dossiers die aandacht vragen">
    ${urgentie.map(([k, label, test], i) => {
      const n = basis.filter((d) => test(d, vandaag)).length;
      return `<button type="button" class="werkkaart ${k}" data-actie="snelfilter" data-snel="${k}" aria-pressed="${ui.aanvragen.snel === k}">
        <span class="werkkaart-ico">${icoon(['waarschuwing', 'klok', 'taken'][i])}</span>
        <span><b>${n}</b><span>${esc(label)}</span></span>${icoon('pijl')}
      </button>`;
    }).join('')}
  </div>`}
  <div class="viiz-tabs geen-print" role="tablist">
      <a href="#/klanten" role="tab" class="${afgerond ? '' : 'actief'}" aria-selected="${!afgerond}">Nieuwe en lopende aanvragen <span class="teller">${lopend}</span></a>
      <a href="#/klanten/afgerond" role="tab" class="${afgerond ? 'actief' : ''}" aria-selected="${afgerond}">Afgeronde aanvragen <span class="teller">${klaar}</span></a>
    </div>
    <div class="grid-paneel">
      <div class="grid-toolbar geen-print">
        <div class="zoekveld">${icoon('zoek')}<input class="zoek" type="search" placeholder="Zoek op naam, dossiernummer, aanvraagnummer, onderneming of KvK" value="${esc(filters.zoek)}" data-filter="zoek" aria-label="Zoeken"></div>
        ${chips ? `<div class="snelfilters" role="group" aria-label="Snelfilters">${chips}</div>` : ''}
        ${afgerond ? `<button class="knop sec klein" data-actie="zoek-afgerond">${icoon('zoek')}Zoeken in afgeronde aanvragen${z ? ' •' : ''}</button>` : ''}
        <button class="knop link klein" id="filters-wissen" data-actie="toon-alle-klanten"${filterActief() ? '' : ' hidden'} title="Alle zoekopdrachten en filters wissen (toon alle klanten)">${icoon('sluit')}Filters wissen</button>
        <span class="vul"></span>
        <details class="uitklap kolomkeuze">
          <summary class="knop sec klein" title="Kies welke kolommen je ziet">${icoon('kolommen')}Kolommen${eigen ? ' •' : ''}</summary>
          <div class="uitklap-paneel rechts">
            ${KOLOM_KEUZES.map(([k, l]) => `<label class="check"><input type="checkbox" data-actie="kolom-toggle" data-kol="${k}" data-blijf="1"${zichtbaar.has(k) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}
            <hr><button type="button" class="knop link klein" data-actie="kolommen-standaard"${eigen ? '' : ' disabled'}>Standaardkolommen</button>
          </div>
        </details>
        <button class="knop sec klein" data-actie="verzamelmail"${sel ? '' : ' disabled'} title="Eén e-mail per advieskantoor met de ontbrekende stukken van de geselecteerde dossiers">${icoon('mail')}Verzamelmail${sel ? ` (${sel})` : ''}</button>
      </div>
      ${z ? `<div class="melding info geen-print" style="margin:0 12px 10px">Zoekopdracht: ${esc([z.achternaam && `achternaam begint met "${z.achternaam}"`, z.hypotheek && `aanvraagnummer ${z.hypotheek}`, z.nummer && `dossier ${z.nummer}`, z.vanaf && `vanaf ${fmt.datum(z.vanaf)}`, z.tot && `t/m ${fmt.datum(z.tot)}`].filter(Boolean).join(', '))}
        <button class="knop link klein" data-actie="toon-alle-klanten">Wissen</button></div>` : ''}
      <div id="aanvragen-tabel">${tabelAanvragen(afgerond)}</div>
    </div>
    <div class="fab-groep geen-print">
      ${afgerond ? `<button class="fab sec" data-actie="herbeoordeling" title="Aanvraag herbeoordeling">${icoon('herhaal')}<span>Herbeoordeling</span></button>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Inhoud van de pop-ups
// ---------------------------------------------------------------------------
export const SOORT_KEUZES = [
  ['IKV|NHG', 'Inkomensverklaring met NHG'],
  ['IKV|ABN', 'Inkomensverklaring zonder NHG (ABN AMRO Woonbeleid)'],
  ['IKV|ASN', 'Inkomensverklaring zonder NHG (ASN Bank, voorheen de Volksbank)'],
  ['IKV|KNAB', 'Inkomensverklaring zonder NHG (Knab)'],
  ['IKV|OPT', 'Inkomensverklaring volgens het Optimaal toetskader (referentie)'],
  ...KADER_VOLGORDE.filter((id) => KADERS[id].beleid).map((id) => [`IKV|${id}`, KADERS[id].kort]),
  ['NUL|ABN', '0-verklaring / beoordelingsverklaring zonder NHG'],
  ['NUL|NHG', '0-verklaring / beoordelingsverklaring met NHG'],
  ['ANALYSE|ABN', 'Inkomensanalyse (alle toetskaders)'],
];

export function modaalNieuweKlant() {
  const adv = lijst('advieskantoor').sort((a, b) => a.naam.localeCompare(b.naam));
  return `<div class="formulier">
    <label class="veld"><span>Voorletter(s) klant *</span><input name="voorletters" autocomplete="off"></label>
    <label class="veld"><span>Tussenvoegsel</span><input name="tussenvoegsel" autocomplete="off"></label>
    <label class="veld"><span>Achternaam klant *</span><input name="achternaam" autocomplete="off"></label>
    <label class="veld"><span>Soort aanvraag en toetskader *</span><select name="soortkader">
      ${SOORT_KEUZES.map(([k, l], i) => `<option value="${esc(k)}"${i === 1 ? ' selected' : ''}>${esc(l)}</option>`).join('')}
    </select></label>
    <div class="raster-2" style="grid-template-columns:1fr 1fr;gap:12px">
      <label class="veld"><span>Geldverstrekker (label)</span><select name="label">${['ABN AMRO', 'Florius', 'Moneyou', 'ASN Bank', 'Knab', 'Overig'].map((x) => `<option>${x}</option>`).join('')}</select></label>
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
