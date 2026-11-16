import {
  ACCREDITATIES, FIAT_VRAGEN, beoordelingsInhoud, fiatBlokkade, getekendeDossierfase,
  inkomensKeuzesGewijzigd, inkomensMotivatiesOntbreken,
  magFiatteren, toegestaneInkomensBesluiten, wijzigingsBlokkade,
  wisInkomensWijzigingen,
} from '../../public/js/engine/beoordelingsrechten.js';
import { dossierbeleid } from '../../public/js/dossierbeleid.js';
import { blokkadeUitkomst } from '../../public/js/fiatteringsuitkomst.js';
import { STATUS_MIGRATIE } from '../../public/js/schema/fields.js';

const tekst = (s) => typeof s === 'string' ? s.trim() : '';
const emailKlein = (s) => tekst(s).toLowerCase();
const json = (x) => JSON.stringify(x ?? null);
const gelijk = (a, b) => json(a) === json(b);
const afwijzing = (fout, status = 403) => ({ status, fout });
const geldigeNiveaus = new Set(['Basis', 'Medium', 'Top']);

export function cloudAccreditatie(email, env = {}) {
  if (!env.ZIB_ACCREDITATIES && env.DEV_ALLOW_ANON === '1' && email === 'ontwikkelaar@localhost') return 'Top+';
  try {
    const waarden = JSON.parse(String(env.ZIB_ACCREDITATIES || '{}'));
    const sleutel = Object.keys(waarden).find((x) => emailKlein(x) === emailKlein(email));
    return ACCREDITATIES.includes(waarden[sleutel]) ? waarden[sleutel] : '';
  } catch {
    return '';
  }
}

export function cloudActor(user, env) {
  const email = emailKlein(user.email);
  return { email, naam: tekst(user.naam) || email, rol: 'acceptant', accreditatie: cloudAccreditatie(email, env) };
}

export function profielRecordId(email) {
  return `profiel_${emailKlein(email).replace(/[^a-z0-9]/g, '_')}`;
}

export function beveiligProfiel(actor, id, profiel, vorige) {
  if (id !== profielRecordId(actor.email) || (vorige?.email && emailKlein(vorige.email) !== actor.email)) {
    return afwijzing('Dit profiel hoort bij een andere gebruiker.');
  }
  profiel.email = actor.email;
  profiel.accreditatie = actor.accreditatie;
  profiel.rol = actor.rol;
  return null;
}

const laatsteFiat = (f) => f?.tweede?.resultaat ? f.tweede : null;
const laatsteFiatAkkoord = (f) => f?.tweede?.resultaat === 'akkoord';
const tweedeConcept = (f) => f?.tweede && !f.tweede.resultaat ? { antwoorden: f.tweede.antwoorden || {}, opmerking: f.tweede.opmerking || '' } : null;

function beleidHeropend(vorige, volgende) {
  return vorige && !gelijk(dossierbeleid(vorige), dossierbeleid(volgende))
    && !volgende.fiat?.eerste && !volgende.fiat?.tweede && !volgende.fiatteur;
}

export function maakImportHerbeoordeling(record) {
  if (!getekendeDossierfase(record) && !record.fiat?.eerste && !record.fiat?.tweede?.resultaat) return false;
  for (const key of ['fiat', 'fiatteur', 'teruggezet']) delete record[key];
  record.status = 'beoordeling_1';
  return true;
}

function fiatMeta(actor, item, nu) {
  item.naam = actor.naam;
  item.email = actor.email;
  item.datum = nu;
}

function toetsInkomensKeuzes(actor, vorige, volgende, ids) {
  if (!ids.length) return null;
  const fout = wijzigingsBlokkade(actor, vorige || volgende);
  if (fout) return afwijzing(fout);
  if (volgende.niveau !== vorige?.niveau && vorige && wijzigingsBlokkade(actor, { ...volgende, status: vorige.status })) {
    return afwijzing('De accreditatie moet toereikend zijn voor beide dossierniveaus.');
  }
  if (inkomensMotivatiesOntbreken(volgende, ids).length) return afwijzing('Leg een geldige uitkomst en motivatie voor de inkomenswijziging vast.', 422);
  for (const id of ids) {
    const o = id ? volgende.ondernemingen?.find((x) => x.id === id) : volgende;
    if (!o || (!o.afwijkend?.actief && !o.geenInkomen && !o.nulInkomen && o.meenemen !== false && !o.inkomensbesluit)) {
      const oud = id ? vorige?.ondernemingen?.find((x) => x.id === id) : vorige;
      // Een besluit vervalt wanneer de onderneming uit de dossierstructuur wordt verwijderd.
      if (!o && id) continue;
      if (oud?.afwijkend?.actief || oud?.geenInkomen || oud?.nulInkomen || oud?.meenemen === false) {
        return afwijzing('Leg een motivatie vast als je teruggaat naar het berekende inkomen.', 422);
      }
      continue;
    }
    const soort = o.geenInkomen ? 'geen' : o.nulInkomen || o.meenemen === false ? 'nul' : o.afwijkend?.actief ? 'afwijkend' : o.inkomensbesluit?.soort;
    if (!toegestaneInkomensBesluiten(volgende, id ? o : null).includes(soort)) {
      return afwijzing('Deze inkomenswijziging is niet beschikbaar voor deze onderneming en dit toetskader.', 422);
    }
  }
  if ((volgende.fiat?.eerste && volgende.status !== 'beoordeling_2') || volgende.fiat?.tweede?.resultaat === 'akkoord') {
    return afwijzing('Wijziging vereist een nieuwe beoordeling.', 422);
  }
  return null;
}

/** Controleer mutaties uit PUT en import tegen de laatst opgeslagen dossierfase. */
export function beveiligDossier(actor, vorige, volgende, { nu = new Date().toISOString(), backUp = false } = {}) {
  if (vorige && Object.hasOwn(STATUS_MIGRATIE, vorige.status)) vorige = { ...vorige, status: STATUS_MIGRATIE[vorige.status] };
  if (Object.hasOwn(STATUS_MIGRATIE, volgende.status)) volgende.status = STATUS_MIGRATIE[volgende.status];
  const oudFiat = vorige?.fiat || {};
  const fiat = volgende.fiat || {};
  const eersteGewijzigd = !gelijk(oudFiat.eerste, fiat.eerste);
  const tweedeGewijzigd = !gelijk(laatsteFiat(oudFiat), laatsteFiat(fiat));
  const statusGewijzigd = vorige?.status !== volgende.status;
  if (volgende.ondernemingen !== undefined && !Array.isArray(volgende.ondernemingen)) {
    return afwijzing('De ondernemingen moeten als lijst worden aangeleverd.', 422);
  }
  const ids = (volgende.ondernemingen || []).map((o) => o?.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== 'string' || !id)) {
    return afwijzing('Iedere onderneming moet een eigen dossierverwijzing hebben.', 422);
  }
  if (backUp && vorige && (eersteGewijzigd || tweedeGewijzigd || (statusGewijzigd && (getekendeDossierfase(vorige) || getekendeDossierfase(volgende))))) {
    return afwijzing('Een back-up kan de fiattering van een bestaand dossier niet wijzigen.');
  }
  const keuzesGewijzigd = inkomensKeuzesGewijzigd(vorige, volgende);
  if (volgende.niveau && !geldigeNiveaus.has(volgende.niveau)) return afwijzing('Ongeldig dossierniveau.', 422);
  if (vorige && (vorige.niveau || 'Basis') !== (volgende.niveau || 'Basis')) {
    const hoogsteNiveau = ['Basis', 'Medium', 'Top'].reduce((hoogste, niveau) =>
      vorige.niveau === niveau || volgende.niveau === niveau ? niveau : hoogste, 'Basis');
    if (!magFiatteren(actor.accreditatie, hoogsteNiveau, 1)) return afwijzing(`Je accreditatie is niet toereikend voor een ${hoogsteNiveau}-dossier.`);
  }
  if (beleidHeropend(vorige, volgende)) {
    const zonderBesluiten = structuredClone(volgende);
    wisInkomensWijzigingen(zonderBesluiten);
    const besluitenGewist = !inkomensKeuzesGewijzigd(zonderBesluiten, volgende).length;
    if (!besluitenGewist) return afwijzing('Een nieuw toetskader vereist een nieuw inkomensbesluit.', 422);
    if (getekendeDossierfase(vorige)) {
      const fase = vorige.status === 'beoordeling_2' ? 1 : 2;
      if (!magFiatteren(actor.accreditatie, vorige.niveau, fase)) return afwijzing('Je accreditatie is niet toereikend om dit dossier te heropenen.');
      if (volgende.status !== 'beoordeling_1') return afwijzing('Start de eerste beoordeling opnieuw voor het gewijzigde toetskader.', 422);
      return null;
    }
    if (getekendeDossierfase(volgende)) return afwijzing('Start een nieuwe beoordeling voordat je het dossier gereedmeldt.');
    if (keuzesGewijzigd.length || oudFiat.eerste || oudFiat.tweede) {
      if (!magFiatteren(actor.accreditatie, vorige.niveau, 1)) return afwijzing('Je accreditatie is niet toereikend om de beoordeling te wijzigen.');
      return null;
    }
  }
  const keuzesFout = toetsInkomensKeuzes(actor, vorige, volgende, keuzesGewijzigd);
  if (keuzesFout) return keuzesFout;
  if (getekendeDossierfase(vorige) && !gelijk(beoordelingsInhoud(vorige), beoordelingsInhoud(volgende))) {
    return afwijzing('De dossierinhoud is vergrendeld tijdens de tweede beoordeling en na akkoord.');
  }
  if (!vorige && (fiat.eerste || fiat.tweede?.resultaat || getekendeDossierfase(volgende))) {
    return afwijzing('Een nieuw dossier doorloopt de eerste en tweede beoordeling in ZIB.');
  }
  if (laatsteFiatAkkoord(oudFiat) || vorige?.status === 'afgerond') {
    if (eersteGewijzigd || tweedeGewijzigd || statusGewijzigd || !gelijk(vorige.fiatteur, volgende.fiatteur)) return afwijzing('Maak een herbeoordeling voor een afgerond dossier.');
    return null;
  }
  if (vorige?.status === 'beoordeling_2') {
    if (eersteGewijzigd) return afwijzing('Het eerste fiat blijft ongewijzigd tijdens de tweede beoordeling.');
    if (!tweedeGewijzigd && statusGewijzigd) return afwijzing('Gebruik de tweede beoordeling om de dossierstatus te wijzigen.');
    if (tweedeGewijzigd || !gelijk(tweedeConcept(oudFiat), tweedeConcept(fiat))) {
      const fout = fiatBlokkade(actor, vorige, 2);
      if (fout) return afwijzing(fout);
    }
    if (tweedeGewijzigd) {
      const besluit = laatsteFiat(fiat);
      const toegestaan = (besluit?.resultaat === 'akkoord' && volgende.status === 'afgerond')
        || (besluit?.resultaat === 'niet_akkoord' && volgende.status === 'beoordeling_1');
      if (!toegestaan) return afwijzing('Kies akkoord of zet het dossier met bevindingen terug naar de eerste beoordeling.', 422);
      if (besluit.resultaat === 'akkoord') {
        const fout = blokkadeUitkomst(volgende);
        if (fout) return afwijzing(fout, 422);
        if (FIAT_VRAGEN.some(([k]) => !['Ja', 'N.v.t.'].includes(besluit.antwoorden?.[k]?.antwoord))) {
          return afwijzing('Beantwoord alle fiatteringsvragen voordat je akkoord geeft.', 422);
        }
      }
      if (besluit.resultaat === 'niet_akkoord' && !tekst(besluit.opmerking)
        && !FIAT_VRAGEN.some(([k]) => besluit.antwoorden?.[k]?.antwoord === 'Nee')) {
        return afwijzing('Leg een bevinding of opmerking vast bij terugzetten.', 422);
      }
      fiatMeta(actor, besluit, nu);
      if (besluit.resultaat === 'akkoord') volgende.fiatteur = actor.naam;
    }
    if (fiat.tweede?.resultaat !== 'akkoord' && !gelijk(vorige.fiatteur, volgende.fiatteur)) return afwijzing('De tweede fiatteur wordt vastgelegd via de beoordeling.');
    return null;
  }
  if (volgende.status === 'beoordeling_2') {
    const fout = fiatBlokkade(actor, vorige || volgende, 1) || fiatBlokkade(actor, { ...volgende, status: vorige?.status }, 1);
    if (fout) return afwijzing(fout);
    if (!fiat.eerste || typeof fiat.eerste !== 'object' || Array.isArray(fiat.eerste) || fiat.tweede) {
      return afwijzing('Vul de eerste beoordeling in voordat je het dossier gereedmeldt.', 422);
    }
    const uitkomstFout = blokkadeUitkomst(volgende);
    if (uitkomstFout) return afwijzing(uitkomstFout, 422);
    fiatMeta(actor, fiat.eerste, nu);
    delete volgende.fiatteur;
    return null;
  }
  const teruggehaald = keuzesGewijzigd.length > 0 && !fiat.eerste && !fiat.tweede;
  if (volgende.status === 'afgerond' || (!teruggehaald && (eersteGewijzigd || tweedeGewijzigd))
    || !gelijk(tweedeConcept(oudFiat), tweedeConcept(fiat)) || (!teruggehaald && !gelijk(vorige?.fiatteur, volgende.fiatteur))) {
    return afwijzing('Leg fiattering vast via de daarvoor bestemde dossieractie.');
  }
  return null;
}
