import { bereken } from './engine/index.js';
import { voorstelBroncijfers } from './schema/broncijfers.js';
import { state, lijst, bewaarDossier, volgendDossiernummer, logHistorie } from './state.js';
import { esc, fmt, nowISO } from './util.js';
import { openModaal, sluitModaal, toast } from './views/ui.js';

const lokaal = () => globalThis.ZIB_LOCAL_PRIVATE === true && state.modus === 'lokaal';

function voorstel(pakket) {
  const [prefix, volg] = volgendDossiernummer().split(/-(?=\d+$)/);
  return voorstelBroncijfers(pakket, lijst('dossier'), { nummerVoorNieuw: (i) => `${prefix}-${String(Number(volg) + i).padStart(4, '0')}` });
}

/** Alleen de lokale werkbestanden kunnen een voorbereide werkkopie bevatten. */
export async function laadPriveStart() {
  if (!lokaal()) return;
  const klaar = document.getElementById('zib-prive-start');
  if (!klaar) return;
  const pakket = JSON.parse(klaar.textContent);
  const sleutel = 'zib.prive.broninvoer.v1';
  try { if (localStorage.getItem(sleutel)) return; } catch { /* opslag meldt zelf een fout */ }
  const plannen = voorstel(pakket).filter((p) => p.nieuw && p.dossier);
  if (!plannen.length) return;
  let compleet = true;
  for (const p of plannen) {
    const d = p.dossier;
    d.aangemaakt = nowISO();
    d.statusDatum = d.aangemaakt;
    d.historie = [{ at: d.aangemaakt, door: 'ZIB · broninvoer', actie: `${p.wijzigingen.length} velden voorbereid uit aangeleverde bronbestanden; herbeoordeling vereist.` }];
    if (!await bewaarDossier(d)) compleet = false;
  }
  if (compleet) try { localStorage.setItem(sleutel, '1'); } catch { /* niet beschikbaar */ }
}

function uitkomsten(p) {
  if (!p.dossier) return '';
  try {
    const r = bereken(p.dossier);
    const bron = r.beleid?.bedrag ?? r.beleid?.indicatie;
    const bedrag = r.beleid ? (Number.isFinite(bron) ? fmt.eur(bron) : 'Bewijs of cijfers nodig') : fmt.eur(r.toetsinkomen);
    return `<p><strong>Nieuwe rekenuitkomst in ZIB:</strong> ${esc(bedrag)} · ${esc(r.kaderCfg.kort)}. Dit dossier is nog in beoordeling.</p>`;
  } catch { return '<p>ZIB kan met deze invoer nog geen uitkomst geven.</p>'; }
}

export function initBroncijfersImport(ververs) {
  let pakket = null;
  let handtekening = '';
  const sign = (plannen) => JSON.stringify(plannen.map((p) => [p.dossier?.id, p.dossier?.version, p.wijzigingen]));
  document.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-broncijfers-bestand]') || !lokaal()) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('Het broncijfersbestand is groter dan 5 MB.');
      pakket = JSON.parse(await file.text());
      const plannen = voorstel(pakket);
      handtekening = sign(plannen);
      const uitvoerbaar = plannen.filter((p) => p.dossier).length;
      openModaal('Broncijfers controleren', `<p>Controleer de herkomst en kies welke voorstellen je lokaal wilt opslaan. Alleen lege velden worden gevuld.</p>
        ${plannen.map((p, i) => `<details class="stappen"${plannen.length === 1 ? ' open' : ''}><summary>${esc([p.match.aanvrager?.voorletters, p.match.aanvrager?.achternaam, p.match.nummer || p.match.onderneming].filter(Boolean).join(' · '))} · ${p.wijzigingen.length} velden</summary>
        <div class="inhoud">${p.dossier ? `<label class="check"><input type="checkbox" data-broncijfers-keuze="${i}"${p.nieuw ? '' : ' checked'}><span>${p.nieuw ? 'Maak een nieuw dossier in eerste beoordeling' : 'Vul het bestaande dossier aan'}</span></label>` : ''}${uitkomsten(p)}
        ${p.issues.length ? `<ul>${p.issues.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${(p.broncontrole?.controlepunten || []).length ? `<ul>${p.broncontrole.controlepunten.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${p.wijzigingen.length ? `<div class="scroll bron-import-tabel"><table class="tabel compact"><thead><tr><th>Onderneming</th><th>Jaar</th><th>Post</th><th>Waarde</th><th>Bron</th></tr></thead><tbody>${p.wijzigingen.map((x) => `<tr><td>${esc(x.onderneming)}</td><td>${x.jaar}</td><td>${esc(x.pad)}</td><td>${esc(typeof x.waarde === 'number' ? fmt.getal(x.waarde, x.waarde % 1 ? 2 : 0) : Array.isArray(x.waarde) ? `${x.waarde.length} correcties` : x.waarde)}</td><td>${esc(x.bestand)} · ${esc(x.locatie)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        </div></details>`).join('')}`, uitvoerbaar ? '<button type="button" class="knop" data-broncijfers-opslaan>Gekozen dossiers opslaan</button>' : '', { breed: true });
    } catch (err) { pakket = null; toast(err.message || 'Het broncijfersbestand kon niet worden gelezen.'); }
  });
  document.addEventListener('click', async (e) => {
    const knop = e.target.closest('[data-broncijfers-opslaan]');
    if (!knop || !pakket || !lokaal()) return;
    const gekozen = [...document.querySelectorAll('[data-broncijfers-keuze]:checked')].map((el) => Number(el.dataset.broncijfersKeuze));
    if (!gekozen.length) { toast('Kies minstens één dossier.'); return; }
    const plannen = voorstel(pakket);
    if (sign(plannen) !== handtekening) { pakket = null; sluitModaal(); toast('Een dossier is intussen gewijzigd. Open het broncijfersbestand opnieuw.'); return; }
    knop.disabled = true;
    const bewaard = [];
    for (const i of gekozen) {
      const p = plannen[i];
      if (!p?.dossier) continue;
      const d = p.dossier;
      if (p.nieuw) { d.aangemaakt = nowISO(); d.statusDatum = d.aangemaakt; }
      logHistorie(d, `${p.wijzigingen.length} velden overgenomen uit lokale broncijfers; controleer de uitkomst bij Fiattering.`);
      if (await bewaarDossier(d)) bewaard.push(d.id);
    }
    pakket = null;
    sluitModaal();
    if (bewaard.length === 1) location.hash = `#/dossier/${encodeURIComponent(bewaard[0])}/fiat`;
    else ververs?.();
    toast(`${bewaard.length} van ${gekozen.length} ${gekozen.length === 1 ? 'dossier' : 'dossiers'} lokaal opgeslagen.`);
  });
}
