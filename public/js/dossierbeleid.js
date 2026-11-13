import { dossierMetNhg, kaderVoor, KADERS, SOORTEN } from './engine/kaders.js';

export function dossierbeleid(d) {
  const labelKader = Object.values(KADERS).find((k) => k.id !== 'NHG' && k.kort === d.label)?.id;
  return {
    soort: SOORTEN[d.soort] ? d.soort : 'IKV',
    kader: d.kader !== 'NHG' && Object.hasOwn(KADERS, d.kader) ? d.kader : labelKader || 'ABN',
    metNhg: dossierMetNhg(d),
  };
}

/** Past uitsluitend de expliciet opgeslagen keuze toe. Een ouder fiat hoort bij het oude kader. */
export function bewaarDossierbeleid(d, keuze) {
  const oud = dossierbeleid(d);
  const soort = Object.hasOwn(SOORTEN, keuze.soort) ? keuze.soort : oud.soort;
  const kader = Object.hasOwn(KADERS, keuze.kader) ? keuze.kader : oud.kader;
  const metNhg = keuze.metNhg === true || kader === 'NHG';
  const gekozenKader = kader === 'NHG' ? oud.kader : kader;
  if (oud.soort === soort && oud.kader === gekozenKader && oud.metNhg === metNhg) return false;

  const oudKader = kaderVoor(d).id;
  Object.assign(d, { soort, kader: gekozenKader, metNhg });
  if (oud.kader !== gekozenKader) d.label = KADERS[gekozenKader].kort;
  if (soort === 'ANALYSE' || !['ABN', 'NHG'].includes(kaderVoor(d).id)) d.weergave = 'viiz';
  if (oud.soort !== soort || oudKader !== kaderVoor(d).id) {
    delete d.fiat;
    delete d.fiatteur;
    delete d.teruggezet;
    if (d.afwijkend?.actief) d.afwijkend = { ...d.afwijkend, actief: false };
    for (const o of d.ondernemingen || []) {
      if (o.afwijkend?.actief) o.afwijkend = { ...o.afwijkend, actief: false };
    }
    if (['beoordeling_2', 'afgerond'].includes(d.status)) d.status = 'beoordeling_1';
  }
  return true;
}
