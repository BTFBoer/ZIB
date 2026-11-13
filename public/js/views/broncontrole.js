import { esc, fmt } from '../util.js';
import { tekstvak } from './ui.js';

const labels = { bzi: 'Bron: BZI', horizontaal: 'Bron: horizontaal', verticaal: 'Bron: verticaal', afTeGevenBron: 'Uitkomst in bron', inkomen: 'Inkomen in bron' };

export function renderBroncontrole(d, r) {
  const bron = d.broncontrole;
  if (!bron) return '';
  const lonen = Object.entries(bron.aanvrager?.dgaInkomenGecombineerd || {}).sort(([a], [b]) => a.localeCompare(b));
  const uitkomsten = Array.isArray(bron.uitkomsten) ? bron.uitkomsten : [];
  const herkomst = Array.isArray(bron.velden) ? bron.velden : [];
  const punten = [...(Array.isArray(bron.controlepunten) ? bron.controlepunten : []), ...(Array.isArray(bron.afwijkingenBijOvername) ? bron.afwijkingenBijOvername : [])];
  const uitkomst = r.beleid?.bedrag ?? r.beleid?.indicatie ?? (r.beleid ? null : r.toetsinkomen);
  return `<section class="paneel" id="fiat-bronvergelijking"><h2>Uitkomst vergeleken met bronbestanden</h2>
    <p><strong>ZIB-herberekening:</strong> ${Number.isFinite(uitkomst) ? esc(fmt.eur(uitkomst)) : 'Nog te bepalen'} · ${esc(r.kaderCfg.kort)}. ${punten.length ? '<strong>Te controleren</strong> voordat dit bedrag kan worden gebruikt.' : ''}</p>
    ${bron.referentieversie ? `<p><strong>Versie in bron:</strong> ${esc(bron.referentieversie)}</p>` : ''}
    ${uitkomsten.length ? `<div class="scroll"><table class="tabel compact"><thead><tr><th>Bron</th><th>Datum en status in bron</th><th>Uitkomst in bron</th></tr></thead><tbody>${uitkomsten.map((x) => `<tr><th scope="row">${esc(x.bron || '')}</th><td>${esc([x.peildatum ? fmt.datum(x.peildatum) : '', x.statusBron].filter(Boolean).join(' · '))}</td><td>${Object.entries(labels).filter(([k]) => Number.isFinite(x[k])).map(([k, l]) => `<div>${esc(l)}: <strong>${esc(fmt.eur(x[k]))}</strong></div>`).join('') || 'Zie het bronbestand'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${lonen.length ? `<details class="stappen"><summary>Gecombineerd DGA-loon uit de bron</summary><div class="inhoud"><p>De bron vermeldt het loon voor alle vennootschappen samen. De toedeling per onderneming ontbreekt.</p><div class="scroll"><table class="tabel compact"><thead><tr><th>Jaar</th><th>Loon</th><th>Bijtelling</th><th>Bron</th></tr></thead><tbody>${lonen.map(([y, x]) => `<tr><th scope="row">${esc(y)}</th><td>${Number.isFinite(x.loon) ? esc(fmt.eur(x.loon)) : '—'}</td><td>${Number.isFinite(x.bijtelling) ? esc(fmt.eur(x.bijtelling)) : '—'}</td><td>${esc(x.bronnen?.loon?.bestand)} · ${esc(x.bronnen?.loon?.locatie)}</td></tr>`).join('')}</tbody></table></div></div></details>` : ''}
    ${punten.length ? `<details class="stappen" open><summary>Te verifiëren bronpunten (${punten.length})</summary><div class="inhoud"><ul>${punten.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>${tekstvak('Onderbouwing van de bronverschillen', 'notities.bronverschilOnderbouwing', d.notities?.bronverschilOnderbouwing, { rijen: 3, hint: 'Vereist voordat je dit dossier gereedmeldt.' })}</div></details>` : ''}
    ${herkomst.length ? `<details class="stappen"><summary>Herkomst van ${herkomst.length} ingevoerde velden</summary><div class="inhoud scroll bron-import-tabel"><table class="tabel compact"><thead><tr><th>Onderneming</th><th>Jaar</th><th>Post</th><th>Bron</th></tr></thead><tbody>${herkomst.map((x) => `<tr><td>${esc(d.ondernemingen?.find((o) => o.id === x.ondId)?.naam || 'Persoonlijk')}</td><td>${esc(x.jaar)}</td><td>${esc(x.pad)}</td><td>${esc(x.bestand)} · ${esc(x.locatie)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
  </section>`;
}
