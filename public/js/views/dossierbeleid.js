import { dossierbeleid } from '../dossierbeleid.js';
import { kaderVoor, kaderOpties, SOORTEN } from '../engine/kaders.js';
import { esc } from '../util.js';

const concepten = new Map();
const opties = Object.entries(kaderOpties()).filter(([id]) => id !== 'NHG');
const soorten = { ...SOORTEN, IKV: 'Inkomensverklaring (IKV)', NUL: '0-verklaring (nul-inkomen)' };
const optiesHtml = (regels, waarde) => regels.map(([id, label]) => `<option value="${esc(id)}"${id === waarde ? ' selected' : ''}>${esc(label)}</option>`).join('');
const gelijk = (a, b) => a.soort === b.soort && a.kader === b.kader && a.metNhg === b.metNhg;

export function leesKeuze(form) {
  return {
    soort: form.elements.beleidSoort.value,
    kader: form.elements.beleidKader.value,
    metNhg: form.elements.beleidNhg.checked,
  };
}

export function werkBeleidsconceptBij(form, d) {
  const keuze = leesKeuze(form);
  const gewijzigd = !gelijk(keuze, dossierbeleid(d));
  if (gewijzigd) concepten.set(d.id, keuze);
  else concepten.delete(d.id);
  form.querySelector('[data-beleid-lender]').hidden = keuze.soort === 'ANALYSE';
  form.querySelector('[data-beleid-nhg]').hidden = keuze.soort === 'ANALYSE';
  form.querySelector('[data-beleid-melding]').textContent = gewijzigd ? 'Gewijzigd. Klik op Opslaan om de beoordeling bij te werken.' : '';
}

export function wisBeleidsconcept(id) {
  concepten.delete(id);
}

export function leesBeleidsconcept(id) {
  return concepten.get(id);
}

export function renderDossierbeleid(d) {
  const opgeslagen = dossierbeleid(d);
  const v = concepten.get(d.id) || opgeslagen;
  const analyse = v.soort === 'ANALYSE';
  const actief = d.soort === 'ANALYSE' ? 'Inkomensanalyse' : kaderVoor(d).kort;
  return `<form class="dossierbeleid" data-dossierbeleid aria-label="Toetskader opslaan">
    <div class="raster-3">
      <label class="veld"><span>Soort aanvraag</span><select name="beleidSoort">${optiesHtml(Object.entries(soorten), v.soort)}</select></label>
      <label class="veld" data-beleid-lender${analyse ? ' hidden' : ''}><span>Geldverstrekker / beleid</span><select name="beleidKader">${optiesHtml(opties, v.kader)}</select></label>
      <label class="check beleid-nhg" data-beleid-nhg${analyse ? ' hidden' : ''}><input type="checkbox" name="beleidNhg"${v.metNhg ? ' checked' : ''}><span>Met NHG<br><small class="dempen">In de beoordeling geldt dan alleen NHG.</small></span></label>
    </div>
    <div class="dossierbeleid-opslaan"><button type="submit" class="knop">Opslaan</button>
      <span class="dempen klein">Actief in beoordeling: <b>${esc(actief)}</b></span>
      <span class="klein" role="status" data-beleid-melding>${gelijk(v, opgeslagen) ? '' : 'Gewijzigd. Klik op Opslaan om de beoordeling bij te werken.'}</span>
    </div>
  </form>`;
}
