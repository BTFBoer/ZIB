import { esc, fmt } from '../util.js';
import { tekstvak } from './ui.js';

const labels = { bzi: 'Bron: BZI', horizontaal: 'Bron: horizontaal', verticaal: 'Bron: verticaal', afTeGevenBron: 'Uitkomst in bron', inkomen: 'Inkomen in bron' };
const bedrag = (waarde) => Number.isFinite(waarde) ? fmt.eur(waarde) : '—';
const bronTekst = (bron) => typeof bron === 'string' ? bron : [bron?.bestand, bron?.locatie].filter(Boolean).join(' · ');

function renderBronUitkomsten(uitkomsten) {
  if (!uitkomsten.length) return '';
  const rijen = uitkomsten.map((x) => {
    const datumStatus = [x.peildatum ? fmt.datum(x.peildatum) : '', x.statusBron].filter(Boolean).join(' · ');
    const bedragen = Object.entries(labels).filter(([k]) => Number.isFinite(x[k])).map(([k, l]) =>
      `<div>${esc(l)}: <strong>${esc(bedrag(x[k]))}</strong></div>`).join('');
    return `<tr><th scope="row">${esc(bronTekst(x.bron))}</th><td>${esc(datumStatus)}</td><td>${bedragen || 'Zie het bronbestand'}</td></tr>`;
  });
  return `<div class="scroll"><table class="tabel compact"><thead><tr><th>Bron</th><th>Datum en status in bron</th><th>Uitkomst in bron</th></tr></thead><tbody>${rijen.join('')}</tbody></table></div>`;
}

function renderGezamenlijkLoon(d, r, bron) {
  const lonen = Object.entries(bron.aanvrager?.dgaInkomenGecombineerd || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!lonen.length) return '';
  const uitkomst = r.inkomen?.dgaGezamenlijk?.toetsinkomen;
  const rijen = lonen.map(([jaar, x]) => {
    const canoniek = d.ib?.[jaar]?.dgaGezamenlijk;
    const periode = canoniek?.van && canoniek?.tot ? `${fmt.datum(canoniek.van)} – ${fmt.datum(canoniek.tot)}` : '—';
    return `<tr><th scope="row">${esc(jaar)}</th><td>${esc(periode)}</td><td>${esc(bedrag(x.loon))}</td><td>${esc(bedrag(x.bijtelling))}</td><td>${esc(bronTekst(x.bronnen?.loon))}</td></tr>`;
  });
  return `<details class="stappen"><summary>Gezamenlijk DGA-loon uit de bron</summary><div class="inhoud">
    <p>De bron vermeldt het loon voor alle vennootschappen samen. De toedeling per onderneming ontbreekt.</p>
    ${Number.isFinite(uitkomst) ? `<p><strong>Gezamenlijk loon volgens de loonberekening:</strong> ${esc(bedrag(uitkomst))} per jaar.</p>` : ''}
    <div class="scroll"><table class="tabel compact"><thead><tr><th>Jaar</th><th>Periode</th><th>Loon</th><th>Bijtelling</th><th>Bron</th></tr></thead><tbody>${rijen.join('')}</tbody></table></div></div></details>`;
}

function renderAbnBronVergelijking(vergelijking) {
  if (!vergelijking) return '';
  const jaren = Object.entries(vergelijking.perJaar || {}).sort(([a], [b]) => a.localeCompare(b));
  const open = vergelijking.open || [];
  const posten = [
    ['Gezamenlijk DGA-loon', 'dga'], ['Uitgekeerd dividend', 'uitgekeerd'], ['Niet-uitgekeerd dividend', 'nietUitgekeerd'],
    ['Overige inkomsten', 'overigeInkomsten'], ['Winstplafond voor dividend', 'winstplafond'], ['Uitkeringsruimte', 'uitkeringsruimte'],
  ];
  const cellen = (regel, sleutels) => sleutels.map((k) => `<td class="num">${esc(bedrag(regel[k]))}</td>`).join('');
  return `<details class="stappen" open><summary>Horizontale herberekening volgens de bronwerkmap</summary><div class="inhoud">
    ${Number.isFinite(vergelijking.horizontaal) ? `<p><strong>${esc(fmt.eur(vergelijking.horizontaal, 2))} per jaar</strong> · vergelijkingsbedrag voor de beoordeling.</p>` : '<p>Er ontbreken gegevens voor de herberekening van de bronwerkmap.</p>'}
    ${open.length ? `<ul>${open.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    ${Number.isFinite(vergelijking.horizontaal) ? `<dl class="reken-metrieken">${posten.map(([label, key]) => `<div class="reken-metriek"><dt>${esc(label)}</dt><dd>${esc(bedrag(vergelijking[key]))}</dd></div>`).join('')}</dl>` : ''}
    ${jaren.length ? `<div class="scroll"><table class="tabel compact"><thead><tr><th>Jaar</th><th class="num">DGA-loon</th><th class="num">Winst na correcties</th><th class="num">Minderheidsdividend</th><th class="num">Uitgekeerd</th><th class="num">Niet uitgekeerd</th><th class="num">Uitkeringsruimte</th></tr></thead><tbody>
      ${jaren.map(([jaar, x]) => `<tr><th scope="row">${esc(jaar)}</th>${cellen(x, ['dga', 'winst', 'minderheidsdividend', 'uitgekeerd', 'nietUitgekeerd', 'uitkeringsruimte'])}</tr>`).join('')}</tbody></table></div>` : ''}
    </div></details>`;
}

export function renderBroncontrole(d, r, { archief = false } = {}) {
  const bron = d.broncontrole;
  if (!bron) return '';
  const uitkomsten = Array.isArray(bron.uitkomsten) ? bron.uitkomsten : [];
  const herkomst = Array.isArray(bron.velden) ? bron.velden : [];
  const punten = [...(Array.isArray(bron.controlepunten) ? bron.controlepunten : []), ...(Array.isArray(bron.afwijkingenBijOvername) ? bron.afwijkingenBijOvername : [])];
  const uitkomst = r.beleid?.bedrag ?? r.beleid?.indicatie ?? (r.beleid ? null : r.toetsinkomen);
  const vergelijking = r.inkomen?.abnBronVergelijking;
  const beoordelingNodig = punten.length && !d.notities?.bronverschilOnderbouwing?.trim();
  return `<section class="paneel" id="fiat-bronvergelijking"><h2>Uitkomst vergeleken met bronbestanden</h2>
    <p>${archief ? 'Historisch dossier. De uitkomsten hieronder komen uit de bron.' : `<strong>Toetsinkomen in ZIB:</strong> ${!beoordelingNodig && Number.isFinite(uitkomst) ? esc(bedrag(uitkomst)) : 'Nog te beoordelen'} · ${esc(r.kaderCfg.kort)}.`}</p>
    ${bron.referentieversie ? `<p><strong>Versie in bron:</strong> ${esc(bron.referentieversie)}</p>` : ''}
    ${renderBronUitkomsten(uitkomsten)}
    ${renderAbnBronVergelijking(vergelijking)}
    ${renderGezamenlijkLoon(d, r, bron)}
    ${punten.length ? `<details class="stappen" open><summary>Te verifiëren bronpunten (${punten.length})</summary><div class="inhoud"><ul>${punten.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>${archief ? '' : tekstvak('Onderbouwing van de bronverschillen', 'notities.bronverschilOnderbouwing', d.notities?.bronverschilOnderbouwing, { rijen: 3, hint: 'Vereist voordat je dit dossier gereedmeldt.' })}</div></details>` : ''}
    ${herkomst.length ? `<details class="stappen"><summary>Herkomst van ${herkomst.length} ingevoerde velden</summary><div class="inhoud scroll bron-import-tabel"><table class="tabel compact"><thead><tr><th>Onderneming</th><th>Jaar</th><th>Post</th><th>Bron</th></tr></thead><tbody>${herkomst.map((x) => `<tr><td>${esc(d.ondernemingen?.find((o) => o.id === x.ondId)?.naam || 'Persoonlijk')}</td><td>${esc(x.jaar)}</td><td>${esc(x.pad)}</td><td>${esc(x.bestand)} · ${esc(x.locatie)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
  </section>`;
}
