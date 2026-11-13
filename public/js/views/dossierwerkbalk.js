import { esc } from '../util.js';
import { icoon } from './ui.js';

export function dossierWerkbalk(titel, { toonTitel = true } = {}) {
  return `<div class="dossier-werkbalk geen-print" aria-label="${esc(titel)} opslaan">
    ${toonTitel ? `<h1 class="dossier-titel">${esc(titel)}</h1>` : ''}
    <div class="dossier-bewaren"><span data-dossier-bewaarstatus aria-live="polite" class="dempen klein"></span>
      <button type="button" class="knop dossier-bewaarknop" data-actie="dossier-opslaan">${icoon('vink')} Opslaan</button></div>
  </div>`;
}
