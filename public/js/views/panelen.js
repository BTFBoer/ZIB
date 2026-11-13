// Panelen die zowel in de ViiZ-weergave (tabblad Klantgegevens) als in de BZI-weergave
// (stap Kredieten en verplichtingen) worden gebruikt.
import { esc, fmt, num, isIngevuld } from '../util.js';
import { soortOndernemer, RECHTSVORMEN, kaderVoor } from '../engine/kaders.js';
import { ZK_SOORTEN } from '../engine/nulverklaring.js';
import { bedrag, veld, keuze, vink, tekstvak, melding, icoon } from './ui.js';

const ondOpties = (d, filter = () => true) => (d.ondernemingen || []).filter(filter).map((o) => [o.id, o.naam || '(naamloos)']);

export function paneelRC(d, r) {
  const rc = d.rc || {};
  return `<div class="paneel"><h2>Rekening-courant directie</h2>
    <div class="raster-3">
      ${veld('Uitstaand saldo (verklaring accountant)', 'rc.saldo', rc.saldo, { type: 'getal', render: true })}
      ${veld('Rentepercentage', 'rc.rente', rc.rente, { type: 'pct', render: true })}
      ${veld('Kredietlimiet (indien bekend)', 'rc.limiet', rc.limiet, { type: 'getal', render: true })}
    </div>
    <div class="raster-2" style="margin-top:12px">
      ${vink('Kasrondje aangetoond (verklaring en aangifte dividendbelasting)', 'rc.kasrondje', !!rc.kasrondje, { render: true })}
      ${vink('Saldo het hele boekjaar onder € 17.500', 'rc.onderDrempel', !!rc.onderDrempel, { render: true })}
      ${vink('Explain: afbouw R/C met voldoende aantoonbaar vermogen', 'rc.explain', !!rc.explain, { render: true })}
    </div>
    ${r.rc?.tekst ? `<div style="margin-top:12px">${melding('info', `Maandlast: ${esc(r.rc.tekst)} Ter vergelijking 2% van de limiet: ${esc(fmt.eur(r.rc.gedragscode))} per maand.`)}</div>` : ''}
  </div>`;
}

export function paneelLeningDirectie(d, r) {
  const ld = d.leningDirectie || {};
  const vpb = ondOpties(d, (o) => soortOndernemer(o.rechtsvorm) === 'VPB');
  return `<div class="paneel"><h2>Lening directie (lening van de BV aan de DGA)</h2>
    <p class="dempen klein">Bijvoorbeeld een annuïtaire lening van de BV voor de eigen woning van de DGA. De maandlast is een verplichting in privé; de vordering wordt op de balans van de BV gecorrigeerd.</p>
    <div class="raster-3">
      ${keuze('Verstrekt door', 'leningDirectie.ondId', vpb, ld.ondId, { leeg: 'Kies de BV', render: true })}
      ${veld('Hoofdsom', 'leningDirectie.hoofdsom', ld.hoofdsom, { type: 'getal', render: true })}
      ${veld('Rente (% per jaar)', 'leningDirectie.rente', ld.rente, { type: 'pct', render: true })}
      ${veld('Looptijd (maanden)', 'leningDirectie.looptijdMnd', ld.looptijdMnd, { type: 'getal', render: true })}
      ${veld('Contractuele termijn per maand (optioneel)', 'leningDirectie.termijn', ld.termijn, { type: 'getal', render: true, hint: 'Leeg = annuïteit berekenen.' })}
      ${veld('Ingangsdatum', 'leningDirectie.ingangsdatum', ld.ingangsdatum, { type: 'datum' })}
    </div>
    <div class="raster-2" style="margin-top:12px">
      ${vink('Hypothecaire zekerheid (eigen woning DGA)', 'leningDirectie.hypothecair', !!ld.hypothecair, { render: true })}
      ${tekstvak('Toelichting (bron, overeenkomst)', 'leningDirectie.toelichting', ld.toelichting, { rijen: 2 })}
    </div>
    ${r.leningDirectie?.maandlast ? `<div style="margin-top:12px">${melding('info', `Maandlast lening directie: ${esc(r.leningDirectie.tekst)}`)}</div>` : ''}
  </div>`;
}

export function paneelZK(d) {
  const zk = Array.isArray(d.zk) ? d.zk : [];
  const onds = ondOpties(d);
  const rij = (x, i) => `<tr>
    <td>${keuze(null, `zk.${i}.soort`, ZK_SOORTEN, x.soort || 'krediet', { render: true })}</td>
    <td><input value="${esc(x.kredietgever || '')}" data-bind="zk.${i}.kredietgever" data-type="tekst" aria-label="Kredietgever" placeholder="Kredietgever"></td>
    <td><input value="${esc(x.omschrijving || '')}" data-bind="zk.${i}.omschrijving" data-type="tekst" aria-label="Omschrijving" placeholder="Omschrijving / object"></td>
    <td>${keuze(null, `zk.${i}.ondId`, onds, x.ondId || '', { leeg: 'Privé / algemeen', render: true })}</td>
    <td class="num">${bedrag(`zk.${i}.maandlast`, x.maandlast, { label: 'Maandlast', render: true })}</td>
    <td class="num">${bedrag(`zk.${i}.saldo`, x.saldo, { label: 'Saldo', render: true })}</td>
    <td>${keuze(null, `zk.${i}.gedragenDoor`, { onderneming: 'Onderneming', prive: 'Privé' }, x.gedragenDoor || 'onderneming', { render: true })}</td>
    <td>${keuze(null, `zk.${i}.status`, { lopend: 'Lopend', afgelost: 'Afgelost' }, x.status || 'lopend', { render: true })}</td>
    <td><input value="${esc(x.afgelostIn || '')}" data-bind="zk.${i}.afgelostIn" data-type="tekst" aria-label="Afgelost in (jaar)" placeholder="jaar" style="width:64px"></td>
    <td><button type="button" class="knop link klein" data-actie="zk-verwijderen" data-index="${i}" title="Verwijderen">${icoon('prullenbak')}</button></td>
  </tr>`;
  return `<div class="paneel"><div class="paginakop" style="margin:0 0 8px"><h2>Zakelijke kredieten en lease (ZK / BKR)</h2>
      <button class="knop sec klein" data-actie="zk-toevoegen">${icoon('plus')}Krediet toevoegen</button></div>
    <p class="dempen klein">Leg per krediet of leaseverplichting vast of het nog loopt. Lopende lasten van de onderneming worden getoetst in de kasstroom (0-verklaring); lasten in privé zijn een financiële verplichting.</p>
    ${zk.length ? `<div class="scroll"><table class="tabel compact invoer-tabel"><thead><tr><th>Soort</th><th>Kredietgever</th><th>Omschrijving</th><th>Onderneming</th><th class="num">Maandlast</th><th class="num">Saldo</th><th>Gedragen door</th><th>Status</th><th>Afgelost in</th><th></th></tr></thead>
      <tbody>${zk.map(rij).join('')}</tbody></table></div>` : '<p class="dempen">Geen zakelijke kredieten vastgelegd.</p>'}
  </div>`;
}

export function paneelLoondienst(d, r) {
  const ld = d.loondienst || {};
  return `<div class="paneel"><h2>Loondienst</h2>
    <div class="raster-3">
      ${veld('Actueel dienstverband (%)', 'loondienst.actueelPct', ld.actueelPct, { type: 'pct', render: true })}
      ${veld('Actueel loondienstinkomen op jaarbasis', 'loondienst.loonJaar', ld.loonJaar, { type: 'getal', render: true })}
    </div>
    <div class="raster-2" style="margin-top:12px">
      ${kaderVoor(d).familie === 'NHG' && d.soort === 'IKV' ? `
        ${vink('Looninkomen naast de onderneming meenemen in de inkomensverklaring', 'loondienst.meenemen', !!ld.meenemen, { render: true, hint: 'Situatie 1 en 2 uit de toelichting; bij gestegen loon (situatie 3) in principe niet.' })}
        ${vink('Looninkomsten vóór de start van de onderneming meenemen', 'loondienst.voorStartMeenemen', ld.voorStartMeenemen !== false, { render: true, hint: 'Alleen uit dezelfde branche; exclusief ontslagvergoedingen.' })}
        ${vink('Resultaat uit overige werkzaamheden meenemen', 'loondienst.rowMeenemen', ld.rowMeenemen !== false, { render: true })}
        ${vink('Er loopt nog een inkomensvervangende uitkering', 'uitkeringLooptNog', !!d.uitkeringLooptNog, { render: true })}` : ''}
    </div>
    ${r.toets30 ? `<div style="margin-top:12px">${melding('info', `Loondienst ≥ 80%: maximaal ondernemersinkomen ${esc(fmt.eur(r.toets30.max))} (${esc(r.toets30.f)}).`)}</div>` : ''}
  </div>`;
}

export function paneelNul(d) {
  const nul = d.nul || {};
  return `<div class="paneel"><h2>Zekerheden en verplichtingen (0-verklaring)</h2>
    <div class="raster-2">
      ${vink('Hobbymatige onderneming met beperkt verlies', 'nul.hobbymatig', !!nul.hobbymatig, { render: true })}
      ${vink('Verlies kan aantoonbaar uit privévermogen worden gedragen', 'nul.verliesGedektPrive', !!nul.verliesGedektPrive, { render: true })}
      ${vink('Borgstelling of persoonlijke zekerheid', 'nul.borgstelling.ja', !!nul.borgstelling?.ja, { render: true })}
      ${vink('Hoofdelijke aansprakelijkheid (vof/maatschap) beoordeeld', 'nul.hoofdelijkBeoordeeld', !!nul.hoofdelijkBeoordeeld, { render: true })}
      ${vink('Achterstanden bij de Belastingdienst', 'nul.belastingachterstand', !!nul.belastingachterstand, { render: true })}
      ${vink('Medeaanvrager ontvangt loon uit de onderneming', 'nul.medeaanvragerLoondienst', !!nul.medeaanvragerLoondienst, { render: true })}
    </div>
    <div class="raster-3" style="margin-top:12px">
      ${veld('Bedrag borgstelling', 'nul.borgstelling.bedrag', nul.borgstelling?.bedrag, { type: 'getal', render: true })}
    </div>
    <p class="dempen klein" style="margin-top:8px">Zakelijke kredieten leg je vast in de lijst "Zakelijke kredieten en lease".</p></div>`;
}

export function paneelAfwijkend(d, r) {
  const afw = d.afwijkend || {};
  const ph = r?.familie === 'ABN' ? (r?.inkomen?.perHoofdbedrijf || []).filter((h) => !h.nul) : [];
  const perHoofd = ph.length ? `<h3 style="margin-top:4px">Per hoofdbedrijf (zoals in de rekentool van de bank)</h3>
    ${ph.map((h) => {
    const o = (d.ondernemingen || []).find((x) => x.id === h.id) || {};
    const a = o.afwijkend || {};
    const b = `ond:${h.id}.afwijkend`;
    return `<div class="afw-hoofd"><div class="bzi-rij"><b>${esc(h.naam)}</b><span class="dempen klein">berekend ${esc(fmt.eur(h.berekend))} · Woonbeleid ${esc(fmt.eur(h.woonbeleidVoorAfslag))}${h.overwinstMee ? ` (incl. overwinst ${esc(fmt.eur(h.overwinstMee))})` : ''}</span></div>
      ${vink('Geen inkomen afgeven voor dit hoofdbedrijf', `ond:${h.id}.geenInkomen`, !!o.geenInkomen, { render: true })}
      ${o.geenInkomen ? '' : vink('Afwijkend inkomen voor dit hoofdbedrijf', `${b}.actief`, !!a.actief, { render: true })}
      ${a.actief && !o.geenInkomen ? `<div class="raster-3" style="margin-top:8px">${veld('Afwijkend inkomen', `${b}.bedrag`, a.bedrag, { type: 'getal', render: true })}</div>
        <div style="margin-top:8px">${tekstvak('Motivatie en rekenkundige onderbouwing', `${b}.motivatie`, a.motivatie, { rijen: 6 })}</div>` : ''}</div>`;
  }).join('')}
    <h3 style="margin-top:14px">Totaal (alle hoofdbedrijven samen)</h3>` : '';
  return `<div class="paneel"><h2>Afwijkend inkomen (expert judgement)</h2>
    ${perHoofd}
    ${vink(ph.length ? 'Ik wijk gemotiveerd af van het totale berekende inkomen' : 'Ik wijk gemotiveerd af van het berekende inkomen', 'afwijkend.actief', !!afw.actief, { render: true })}
    ${afw.actief ? `<div class="raster-3" style="margin-top:12px">${veld('Afwijkend inkomen', 'afwijkend.bedrag', afw.bedrag, { type: 'getal', render: true })}</div>
      <div class="raster-2" style="margin-top:12px">
        ${tekstvak('Motivatie voor de afwijking', 'afwijkend.motivatie', afw.motivatie, { rijen: 3 })}
        ${tekstvak('Vaststelling en volledig uitgeschreven rekenkundige onderbouwing', 'afwijkend.onderbouwing', afw.onderbouwing, { rijen: 4 })}
        ${tekstvak('Bestendigheid van het afwijkende inkomen', 'afwijkend.bestendigheid', afw.bestendigheid, { rijen: 3 })}
        ${tekstvak('Onderliggende documentatie', 'afwijkend.documentatie', afw.documentatie, { rijen: 2 })}
      </div>` : '<p class="dempen klein" style="margin-top:8px">Een afwijking is geen explain op inkomen; leg de motivatie herleidbaar vast.</p>'}
  </div>`;
}

/** Structuurvelden van een onderneming: onderdeel van (ouder), belang en gedeelde deelnemingen. */
export function structuurVelden(d, o, { render = true } = {}) {
  const b = `ond:${o.id}`;
  const andere = (d.ondernemingen || []).filter((x) => x.id !== o.id);
  const ouders = andere.map((x) => [x.id, x.naam || '(naamloos)']);
  const extra = o.extraParents || [];
  return `<div class="structuur">
    ${keuze('Onderdeel van', `${b}.parentId`, ouders, o.parentId || '', { leeg: 'Geen (hoofdbedrijf)', render })}
    ${o.rechtsvorm !== 'EZ' ? veld(soortOndernemer(o.rechtsvorm) === 'VPB' ? 'Belang (%)' : 'Winstaandeel (%)', `${b}.aandeelPct`, o.aandeelPct ?? 100, { type: 'pct', render }) : ''}
    ${o.parentId ? `<div class="veld"><span class="label">Ook deelneming van</span>
      ${extra.map((x, i) => `<div class="extra-ouder">${keuze(null, `${b}.extraParents.${i}.id`, ouders.filter(([id]) => id !== o.parentId), x.id || '', { leeg: 'Kies', render })}
        <input class="pct" inputmode="decimal" value="${isIngevuld(x.pct) ? esc(String(x.pct).replace('.', ',')) : ''}" data-bind="${b}.extraParents.${i}.pct" data-type="pct" data-render="1" aria-label="Belang (%)" placeholder="%">
        <input class="pct" inputmode="numeric" value="${isIngevuld(x.vanaf) ? esc(String(x.vanaf)) : ''}" data-bind="${b}.extraParents.${i}.vanaf" data-type="getal" data-render="1" aria-label="Belang vanaf jaar" placeholder="vanaf" title="Vanaf welk jaar bestaat dit belang? Leeg = altijd">
        <input class="pct" inputmode="numeric" value="${isIngevuld(x.tot) ? esc(String(x.tot)) : ''}" data-bind="${b}.extraParents.${i}.tot" data-type="getal" data-render="1" aria-label="Belang tot en met jaar" placeholder="t/m" title="Tot en met welk jaar? Leeg = nog steeds">
        <button type="button" class="knop link klein" data-actie="extra-ouder-weg" data-ond="${esc(o.id)}" data-index="${i}" title="Verwijderen">${icoon('prullenbak')}</button></div>`).join('')}
      <button type="button" class="knop link klein" data-actie="extra-ouder-toevoegen" data-ond="${esc(o.id)}">${icoon('plus')}Andere aandeelhouder binnen de structuur</button></div>` : ''}
  </div>`;
}

export function rechtsvormOpties() {
  return Object.fromEntries(Object.entries(RECHTSVORMEN).map(([k, v]) => [k, `${v.label} (${v.soort === 'IB' ? 'IB' : 'VPB/DGA'})`]));
}

export function heeftWaarde(x) {
  return isIngevuld(x) && num(x) !== 0;
}
