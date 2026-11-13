import { actorVoor, toegestaneInkomensBesluiten, wijzigingsBlokkade } from '../engine/beoordelingsrechten.js';
import { zkTekst } from '../engine/nulverklaring.js';
import { docAanwezig } from '../schema/documenten.js';
import { state } from '../state.js';
import { esc, fmt, isIngevuld, num } from '../util.js';
import { icoon, melding, pil } from './ui.js';

const STATUS = { niet_akkoord: 0, attentie: 1, info: 2, akkoord: 3, nvt: 4 };
const soortKeuze = {
  berekend: 'Berekend inkomen gebruiken',
  afwijkend: 'Afwijkend bedrag vastleggen',
  geen: 'Geen inkomen afgeven',
  nul: '€ 0, alleen risico beoordelen',
};
const dossierLink = (d, tab, ond = '', veld = '') => `#/dossier/${encodeURIComponent(d.id)}/${tab}${ond ? `/${encodeURIComponent(ond)}` : ''}${veld ? `?veld=${encodeURIComponent(veld)}` : ''}`;

function invoerDoel(check) {
  const key = String(check.key || '');
  if (/^(definitief|tussentijds|plausibel|balans|liquiditeit|solvabiliteit|werkkapitaal)/.test(key)) return 'balans';
  if (/^(winst|omzet|resultaat)/.test(key)) return 'vw';
  if (/^(inkomen|aangifte)/.test(key)) return 'ib';
  return 'klant';
}

function gesorteerd(rijen) {
  return rijen.filter((x) => x.tekst || x.label).sort((a, b) => (STATUS[a.status] ?? STATUS.info) - (STATUS[b.status] ?? STATUS.info));
}

function controleRijen(rijen) {
  if (!rijen.length) return '<p class="dempen">Geen controles in dit onderdeel.</p>';
  return `<ul class="fiat-controlelijst">${rijen.map((rij) => `<li>
    <div>${pil(rij.status || 'info')}${rij.label ? ` <b>${esc(rij.label)}</b>` : ''}</div>
    ${rij.tekst ? `<p>${esc(rij.tekst)}</p>` : ''}
    ${rij.href ? `<a class="klein" href="${esc(rij.href)}">${esc(rij.linkTekst || 'Naar invoer')}</a>` : ''}
  </li>`).join('')}</ul>`;
}

function groep(titel, rijen, standaardOpen = false) {
  if (!rijen.length) return '';
  const open = rijen.filter((x) => x.status === 'attentie' || x.status === 'niet_akkoord').length;
  return `<details class="stappen fiat-controles" ${standaardOpen ? 'open' : ''}>
    <summary>${esc(titel)} <span class="dempen klein">· ${open} open · ${rijen.length} controles</span></summary>
    <div class="inhoud">${controleRijen(gesorteerd(rijen))}</div>
  </details>`;
}

function beoordelingPerOnderneming(d, r) {
  const hoofd = r.inkomen?.perHoofdbedrijf || [];
  return (r.ondernemingen || []).map((a) => {
    const o = (d.ondernemingen || []).find((o) => o.id === a.id);
    const h = hoofd.find((h) => h.id === a.id);
    const c = (a.checks || []).map((check) => ({ ...check, href: dossierLink(d, invoerDoel(check), a.id) }));
    if (a.maxOnttrekkenNvt) c.push({ label: 'Maximaal te onttrekken', status: 'info', tekst: a.maxOnttrekkenNvt });
    else if (Number.isFinite(a.maxOnttrekken)) c.push({ label: 'Maximaal te onttrekken', status: 'info',
      tekst: `${fmt.eur(a.maxOnttrekken)} op basis van de balans over ${a.laatsteBalansJaar || 'het laatste boekjaar'}.`, href: dossierLink(d, 'balans', a.id) });
    if (a.benodigdBox3 > 0) c.push({ label: 'Benodigde balansversterking', status: 'attentie',
      tekst: `${fmt.eur(a.benodigdBox3)}. Liquiditeit: ${fmt.eur(a.benodigdBox3Detail?.nodigCr || 0)}. Solvabiliteit: ${fmt.eur(a.benodigdBox3Detail?.nodigSv || 0)}.`,
      href: dossierLink(d, 'diversen', a.id) });
    if (a.box2?.benodigdVoorOverwinst > 0) c.push({ label: 'Overwinst en balansversterking', status: 'attentie',
      tekst: `Voor volledige overwinst is ${fmt.eur(a.box2.benodigdVoorOverwinst)} aanvullende balansversterking nodig.`, href: dossierLink(d, 'berekening') });
    if (h && isIngevuld(o?.bziWerkelijk) && Math.abs(num(o.bziWerkelijk) - h.berekend) >= 0.01) {
      c.push({ label: 'BZI-verschil', status: 'attentie',
        tekst: `ZIB-indicatie ${fmt.eur(h.berekend)}. Werkelijk in BZI ${fmt.eur(num(o.bziWerkelijk))}. Verschil ${fmt.eur(num(o.bziWerkelijk) - h.berekend, 2)}.`,
        href: dossierLink(d, 'bziinvoer'), linkTekst: 'BZI-invoer openen' });
    }
    return groep(a.naam || 'Onderneming', c);
  }).join('');
}

function dossierControles(d, r, docs) {
  const rekenmeldingen = (r.meldingen || []).map((m) => ({ status: m.niveau, tekst: m.tekst }));
  const stappen = (r.inkomen?.stappen || []).map((tekst) => ({ status: 'info', tekst }));
  const documenten = (r.documenten || []).filter((x) => x.verplicht).map((x) => ({
    status: docAanwezig(docs, x) ? 'akkoord' : 'attentie',
    label: x.naam,
    tekst: [docAanwezig(docs, x) ? 'Geregistreerd per categorie' : 'Ontbreekt', x.wanneer, x.geldigheid].filter(Boolean).join(' · '),
    href: dossierLink(d, 'documenten'), linkTekst: 'Documenten openen',
  }));
  const nul = r.nul || r.inkomen?.nietMeegenomen;
  const risico = (nul?.perOnderneming || []).flatMap((o) => (o.checks || []).map((c) => ({ ...c, label: `${o.naam} · ${c.label}` })));
  const verplichtingen = [...(nul?.zekerheden || []), ...risico];
  if (r.rc?.tekst) verplichtingen.push({ status: r.rc.maandlast ? 'attentie' : 'info', label: 'Rekening-courant directie', tekst: r.rc.tekst });
  if (r.leningDirectie?.tekst) verplichtingen.push({ status: r.leningDirectie.maandlast ? 'attentie' : 'info', label: 'Lening directie', tekst: r.leningDirectie.tekst });
  for (const x of r.zk || []) verplichtingen.push({ status: 'info', label: 'Zakelijk krediet of lease', tekst: zkTekst(x) });
  const byTekst = new Map();
  for (const r of [...rekenmeldingen, ...stappen]) if (r.tekst && !byTekst.has(r.tekst)) byTekst.set(r.tekst, r);
  return [
    groep('Meldingen uit de berekening', [...byTekst.values()], true),
    groep('Benodigde documenten', documenten),
    groep('Verplichtingen en risicobeoordeling', verplichtingen),
  ].join('');
}

function invoervak(label, naam, waarde, rijen) {
  return `<label class="veld"><span>${esc(label)}</span><textarea rows="${rijen}" name="${naam}">${esc(waarde || '')}</textarea></label>`;
}

function inkomensWijziging(d, r, o, blokkade) {
  const doel = o || d;
  const afw = doel.afwijkend || {};
  const opties = toegestaneInkomensBesluiten(d, o);
  if (!opties.length) return '';
  const gekozen = doel.nulInkomen || doel.meenemen === false ? 'nul' : doel.geenInkomen ? 'geen' : afw.actief ? 'afwijkend' : 'berekend';
  const besluit = doel.inkomensbesluit || {};
  const motivatie = besluit.motivatie || afw.motivatie;
  const titel = o?.naam || 'Totaal dossier';
  const h = o && r.inkomen?.perHoofdbedrijf?.find((x) => x.id === o.id);
  const waarden = h ? `ZIB-indicatie ${fmt.eur(h.berekend)} · Woonbeleid ${fmt.eur(h.woonbeleidVoorAfslag)}`
    : o ? 'Het inkomen blijft bij een risicobeoordeling buiten de berekening.' : `Berekend inkomen ${fmt.eur(r.berekend)}`;
  return `<details class="stappen fiat-inkomenswijziging"${gekozen !== 'berekend' ? ' open' : ''}>
    <summary>${esc(titel)} <span class="dempen klein">· ${esc(soortKeuze[gekozen])}</span></summary>
    <div class="inhoud" data-inkomenswijziging>
      <p>${esc(waarden)}${afw.actief && isIngevuld(afw.bedrag) ? ` · Afwijkend bedrag ${esc(fmt.eur(num(afw.bedrag)))}` : ''}</p>
      ${blokkade ? (motivatie ? `<p><b>Motivatie</b> ${esc(motivatie)}</p>` : '') : `
      <div class="raster-2">
        <label class="veld"><span>Inkomensbesluit</span><select name="inkomens-keuze">${opties.map((k) => `<option value="${k}"${k === gekozen ? ' selected' : ''}>${soortKeuze[k]}</option>`).join('')}</select></label>
        ${opties.includes('afwijkend') ? `<label class="veld"><span>Afwijkend bedrag (€)</span><input inputmode="decimal" name="inkomens-bedrag" value="${esc(isIngevuld(afw.bedrag) ? String(afw.bedrag).replace('.', ',') : '')}"></label>` : ''}
        ${invoervak('Motivatie (verplicht)', 'inkomens-motivatie', motivatie, 3)}
        ${opties.includes('afwijkend') ? invoervak('Rekenkundige onderbouwing', 'inkomens-onderbouwing', afw.onderbouwing, 3)
          + invoervak('Bestendigheid', 'inkomens-bestendigheid', afw.bestendigheid, 2)
          + invoervak('Bronstukken', 'inkomens-documentatie', afw.documentatie, 2) : ''}
      </div>
      <div class="acties"><button class="knop sec" type="button" data-actie="inkomenswijziging" data-ond="${esc(o?.id || '')}">Inkomensbesluit overnemen</button></div>`}
    </div>
  </details>`;
}

export function renderFiatBeoordeling(d, r, docs = [], { broncontroles = '' } = {}) {
  const controles = dossierControles(d, r, docs);
  const ondernemingen = beoordelingPerOnderneming(d, r);
  const actor = actorVoor(state.profiel, state.me);
  const blokkade = wijzigingsBlokkade(actor, d);
  const wijzigingen = d.soort === 'IKV' ? [inkomensWijziging(d, r, null, blokkade),
    ...(d.ondernemingen || []).map((o) => inkomensWijziging(d, r, o, blokkade))].join('') : '';
  return `<section class="paneel" id="fiat-controles">
      <div class="paginakop"><h2>Dossiercontroles en financiële signalen</h2><a class="knop sec klein" href="${esc(dossierLink(d, 'berekening'))}">${icoon('reken')} Berekening openen</a></div>
      ${controles || ondernemingen ? controles + ondernemingen : '<p class="dempen">Geen controles beschikbaar.</p>'}
    </section>
    ${wijzigingen ? `<section class="paneel" id="fiat-inkomenswijziging"><h2>Handmatig inkomensbesluit</h2>
      ${blokkade ? melding('attentie', esc(blokkade)) : '<p>Leg hier een onderbouwde wijziging vast. Controleer het resultaat voordat je het dossier gereedmeldt.</p>'}
      ${wijzigingen}
    </section>` : ''}
    ${broncontroles}`;
}
