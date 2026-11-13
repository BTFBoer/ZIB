import { METHODE_LABEL } from '../engine/beleid.js';
import { esc, fmt } from '../util.js';
import { bedrag, keuze, veld, vink, pil } from './ui.js';

const bronnenLink = (url) => /^https:\/\//i.test(url || '') ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Beleidsbron openen</a>` : '';

export function beleidInvoer(d, r) {
  const p = r.kaderCfg.beleid;
  if (!p) return '';
  const invoer = d.beleidsinvoer?.[p.id] || {};
  const pad = `beleidsinvoer.${p.id}`;
  const render = { render: true };
  const extra = (p.extraVelden || []).map(({ key, label, type, opties, hint, standaard }) => {
    const bind = `${pad}.${key}`;
    const waarde = invoer[key] ?? standaard;
    if (type === 'keuze') return keuze(label, bind, opties, waarde, { ...render, hint, ...(standaard === undefined ? { leeg: 'Maak een keuze' } : {}) });
    if (type === 'bool') return vink(label, bind, waarde, { ...render, hint });
    if (type === 'bedrag') return `<label class="veld"><span>${esc(label)}</span>${bedrag(bind, waarde, { ...render, label })}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
    return veld(label, bind, waarde, { ...render, type, hint });
  }).join('');
  return `<section id="beleid-invoer" class="paneel beleid-invoer">
    <div class="paginakop"><div><h2>${esc(p.kort)} · beleid en bewijs</h2><p class="dempen">${esc(r.beleid?.versie || p.versie)} · ${esc(METHODE_LABEL[r.beleid?.methode || p.methode])}</p></div>${bronnenLink(r.beleid?.bronUrl || p.bronUrl)}</div>
    ${extra ? `<div class="raster-3">${extra}</div>` : ''}
    ${d.soort !== 'NUL' && (r.beleid?.methode === 'extern' || p.ikvOptioneel) ? `<h3>Inkomensverklaring of bankbeoordeling${r.beleid?.methode === 'extern' ? '' : ' (optioneel)'}</h3>
    <div class="raster-3">
      <label class="veld"><span>Toetsinkomen op het bewijsstuk</span>${bedrag(`${pad}.ikvBedrag`, invoer.ikvBedrag, { ...render, label: 'Toetsinkomen op het bewijsstuk' })}</label>
      ${veld('Datum bewijsstuk', `${pad}.ikvDatum`, invoer.ikvDatum, { ...render, type: 'datum' })}
      ${veld('Opsteller van het bewijsstuk', `${pad}.ikvOpsteller`, invoer.ikvOpsteller, render)}
    </div>` : ''}
    <p class="klein dempen beleid-hint">Een geregistreerd bedrag bewijst op zichzelf niet dat de geldverstrekker de aanvraag accepteert.</p>
  </section>`;
}

export function beleidUitkomst(d, r) {
  const p = r.beleid;
  if (!p) return '';
  const extern = p.methode === 'extern';
  const bedragLabel = p.bewijs ? 'Uitkomst op basis van bewijsstuk' : extern ? 'Inkomensverklaring of bankbeoordeling' : 'Voorlopige rekenindicatie';
  const uitkomst = p.bedrag === null ? (extern ? 'Bewijsstuk nodig' : 'Invoer aanvullen') : fmt.eur(p.bedrag);
  return `<div class="beleid-resultaat">
    <div class="beleid-resultaat-kop"><div><div class="dempen klein">${esc(bedragLabel)}</div><strong>${esc(uitkomst)}</strong></div>
    <div>${pil(r.status, r.status === 'akkoord' ? 'Ter beoordeling' : undefined)} <span class="dempen klein">${esc(METHODE_LABEL[p.methode])}</span></div></div>
    ${extern && p.indicatie !== null ? `<p><b>Eigen rekenindicatie:</b> ${esc(fmt.eur(p.indicatie))}. De verklaring of bankbeoordeling bepaalt het te gebruiken bedrag.</p>` : ''}
    ${p.bewijs ? `<p><b>Bewijsstuk:</b> ${esc(p.bewijs.opsteller)} · ${esc(fmt.datum(p.bewijs.datum))}</p>` : ''}
    <p class="dempen klein">Bron: ${esc(r.kaderCfg.bron)} · ${esc(p.versie)}. ${bronnenLink(p.bronUrl)}</p>
    ${p.checks.length ? `<ul class="beleid-checks">${p.checks.map((c) => `<li>${pil(c.status)} <span>${esc(c.tekst)}</span></li>`).join('')}</ul>` : ''}
    ${p.stappen.length ? `<details class="stappen geen-print"><summary>Bekijk ${p.stappen.length} reken- en bewijsstappen</summary><div class="inhoud scroll">
      <table class="tabel"><thead><tr><th>Stap</th><th>Berekening of bron</th><th class="num">Uitkomst</th></tr></thead><tbody>
      ${p.stappen.map((s) => `<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.formule || '')}</td><td class="num">${Number.isFinite(s.waarde) ? esc(fmt.eur(s.waarde)) : esc(s.waarde || '–')}</td></tr>`).join('')}
      </tbody></table></div></details>` : ''}
    <p class="geen-print"><a href="#/dossier/${encodeURIComponent(d.id)}/berekening">Invoer en onderbouwing controleren</a> · <a href="#/dossier/${encodeURIComponent(d.id)}/klant">Naar de beleidsinvoer</a></p>
  </div>`;
}
