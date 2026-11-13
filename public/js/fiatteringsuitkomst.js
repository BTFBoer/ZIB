import { bereken } from './engine/index.js';
import { inkomensMotivatiesOntbreken } from './engine/beoordelingsrechten.js';

export function blokkadeUitkomst(dossier) {
  if (inkomensMotivatiesOntbreken(dossier).length) return 'Onderbouw alle handmatige inkomensbesluiten in Fiattering.';
  if (dossier.broncontrole?.controlepunten?.length && !dossier.notities?.bronverschilOnderbouwing?.trim()) {
    return 'Leg bij Fiattering vast hoe de verschillen met de bron zijn beoordeeld.';
  }
  if (dossier.soort !== 'IKV') return '';
  const uitkomst = bereken(dossier);
  if (uitkomst.inkomen?.gecombineerdDgaOpen && uitkomst.bron !== 'afwijkend') {
    return 'Controleer het gezamenlijke DGA-loon en de toerekening voordat je het inkomen vastlegt.';
  }
  if (uitkomst.beleid?.bedrag === null) return 'Onderbouw eerst het inkomen volgens het gekozen toetskader.';
  if (uitkomst.beleid && uitkomst.status === 'niet_akkoord') return 'Verwerk de dossiercontroles in Fiattering.';
  return '';
}
