import { AFGEROND } from '../schema/fields.js';
import { fmt, isIngevuld, rond } from '../util.js';
import { kaderVoor } from './kaders.js';

export const ACCREDITATIES = ['Basis', 'Basis+', 'Medium', 'Medium+', 'Top', 'Top+'];
export const FIAT_VRAGEN = [
  ['structuur', 'Zijn alle ondernemingen (organogram, KvK, deelnemingen) in beeld en vastgelegd?'],
  ['invoer', 'Zijn de jaarcijfers en IB-aangiften juist en volledig ingevoerd?'],
  ['correcties', 'Zijn de correcties op resultaat en balans juist toegepast en gemotiveerd?'],
  ['kader', 'Is het inkomen conform het beleidskader bepaald, of is de afwijking gemotiveerd?'],
  ['bestendig', 'Zijn bestendigheid en onttrekbaarheid van het inkomen voldoende onderbouwd?'],
  ['prive', 'Zijn privéverplichtingen (BKR, zakelijk krediet, R/C directie) beoordeeld?'],
  ['herleidbaar', 'Zijn aantekeningen en conclusie volledig en herleidbaar?'],
];
const BASIS_KADERS = ['NHG', 'ABN', 'ASN', 'KNAB', 'OPT'];
const EERSTE = { Basis: ['Basis'], 'Basis+': ['Basis'], Medium: ['Basis', 'Medium'], 'Medium+': ['Basis', 'Medium'], Top: ['Basis', 'Medium', 'Top'], 'Top+': ['Basis', 'Medium', 'Top'] };
const TWEEDE = { Basis: [], 'Basis+': ['Basis'], Medium: ['Basis'], 'Medium+': ['Basis', 'Medium'], Top: ['Basis', 'Medium'], 'Top+': ['Basis', 'Medium', 'Top'] };
const DOSSIER_META = new Set(['id', 'type', 'version', 'updated_at', 'updated_by', 'gewijzigd', 'gewijzigdDoor', 'aangemaakt',
  'status', 'statusDatum', 'fiat', 'fiatteur', 'historie', 'teruggezet', 'weergave', 'meekijken', 'spoed', 'uitersteDatum']);

export function getekendeDossierfase(dossier) {
  return ['gereed', 'beoordeling_2', 'afgerond'].includes(dossier?.status) || dossier?.fiat?.tweede?.resultaat === 'akkoord';
}

export function beoordelingsInhoud(dossier) {
  return Object.fromEntries(Object.keys(dossier || {}).filter((key) => !DOSSIER_META.has(key)).sort().map((key) => [key, dossier[key]]));
}

export function magFiatteren(accreditatie, niveau, welke) {
  const tabel = welke === 2 ? TWEEDE : EERSTE;
  return Object.hasOwn(tabel, accreditatie) && tabel[accreditatie].includes(niveau || 'Basis');
}

const tekst = (s) => typeof s === 'string' ? s.trim() : '';
const emailKlein = (s) => tekst(s).toLowerCase();
const heeftMotivatie = (s) => tekst(s).length > 0;
const bedragGeldig = (x) => isIngevuld(x) && (typeof x === 'number' || typeof x === 'string' && tekst(x))
  && Number.isFinite(Number(x)) && Number(x) >= 0;

export function actorVoor(profiel = {}, me = {}) {
  const email = emailKlein(me?.email);
  return {
    email,
    naam: tekst(profiel?.naam) || tekst(me?.naam) || email,
    accreditatie: email ? me?.accreditatie || '' : profiel?.accreditatie || '',
    rol: email ? 'acceptant' : profiel?.rol,
  };
}

const bevoegd = (actor, dossier, stap) => !!actor?.naam && actor.rol !== 'adviseur'
  && magFiatteren(actor.accreditatie, dossier.niveau, stap);

export function wijzigingsBlokkade(actor, dossier) {
  if (!dossier || dossier.soort !== 'IKV') return 'Handmatige inkomensbesluiten horen bij een inkomensbeoordeling met een gekozen toetskader.';
  if (dossier.status === 'beoordeling_2' || AFGEROND.includes(dossier.status) || dossier.fiat?.tweede?.resultaat === 'akkoord') {
    return 'De beoordeling is al aangeboden of afgerond. Gebruik de eerste beoordeling of vraag een herbeoordeling aan.';
  }
  if (!bevoegd(actor, dossier, 1)) return `Een eerste fiatteur met accreditatie voor dossierniveau ${dossier.niveau || 'Basis'} moet deze wijziging vastleggen.`;
  return '';
}

export function fiatBlokkade(actor, dossier, stap) {
  if (!dossier || !['IKV', 'NUL'].includes(dossier.soort)) return 'Kies een toetskader en dossierbeoordeling om te fiatteren.';
  if (!bevoegd(actor, dossier, stap)) return `Je accreditatie is niet toereikend voor de ${stap === 2 ? 'tweede' : 'eerste'} beoordeling van dit ${dossier.niveau || 'Basis'}-dossier.`;
  if (stap === 1) {
    if (dossier.status === 'beoordeling_2' || AFGEROND.includes(dossier.status)) return 'Gereedmelden kan vóór de tweede beoordeling.';
    return '';
  }
  const eerste = dossier.fiat?.eerste;
  if (dossier.status !== 'beoordeling_2' || !eerste?.naam) return 'Meld het dossier eerst gereed voor de tweede beoordeling.';
  const zelfde = actor.email && eerste.email
    ? emailKlein(actor.email) === emailKlein(eerste.email)
    : tekst(actor.naam).toLowerCase() === tekst(eerste.naam).toLowerCase();
  return zelfde ? 'De tweede beoordeling wordt door een andere bevoegde fiatteur gedaan.' : '';
}

export function toegestaneInkomensBesluiten(dossier, onderneming = null) {
  const kader = kaderVoor(dossier).id;
  if (!onderneming) return BASIS_KADERS.includes(kader) ? ['berekend', 'afwijkend'] : [];
  if (kader === 'ABN') return onderneming.parentId ? [] : ['berekend', 'afwijkend', 'geen', 'nul'];
  return BASIS_KADERS.includes(kader) ? ['berekend', 'nul'] : [];
}

/** Bescherm bedrag, keuze en onderbouwing als één besluit. */
export function inkomensWijzigingPad(pad) {
  return /^(?:(?:ond:[^.]+\.)?(?:afwijkend(?:\.|$)|geenInkomen$|nulInkomen$|inkomensbesluit(?:\.|$))|ond:[^.]+\.meenemen$)/.test(String(pad || ''));
}

function keuze(o) {
  if (!o) return null;
  const afw = o.afwijkend || {};
  const nul = !!o.nulInkomen || o.meenemen === false;
  if (!o.geenInkomen && !nul && !afw.actief && !o.inkomensbesluit) return null;
  return {
    geen: !!o.geenInkomen, nul, actief: !!afw.actief,
    bedrag: afw.actief && bedragGeldig(afw.bedrag) ? Number(afw.bedrag) : null,
    motivatie: tekst(afw.motivatie),
    onderbouwing: tekst(afw.onderbouwing), bestendigheid: tekst(afw.bestendigheid), documentatie: tekst(afw.documentatie),
    besluit: o.inkomensbesluit ? { soort: tekst(o.inkomensbesluit.soort), motivatie: tekst(o.inkomensbesluit.motivatie) } : null,
  };
}

function keuzes(d) {
  const uit = new Map([['', keuze(d)]]);
  for (const o of d?.ondernemingen || []) uit.set(o.id, keuze(o));
  return uit;
}

export function inkomensKeuzesGewijzigd(vorige, volgende) {
  const oud = keuzes(vorige);
  const nieuw = keuzes(volgende);
  return [...new Set([...oud.keys(), ...nieuw.keys()])]
    .filter((id) => JSON.stringify(oud.get(id) ?? null) !== JSON.stringify(nieuw.get(id) ?? null));
}

function ruimKeuzesOp(ondernemingOfDossier) {
  for (const sleutel of ['afwijkend', 'geenInkomen', 'nulInkomen', 'inkomensbesluit']) delete ondernemingOfDossier[sleutel];
}

export function wisInkomensWijzigingen(dossier) {
  ruimKeuzesOp(dossier);
  for (const o of dossier.ondernemingen || []) {
    ruimKeuzesOp(o);
    if (o.meenemen === false) o.meenemen = true;
  }
}

export function inkomensMotivatiesOntbreken(dossier, ids = [...keuzes(dossier).keys()]) {
  const alle = keuzes(dossier);
  return ids.filter((id) => {
    const k = alle.get(id);
    if (!k) return false;
    if (k.actief) return k.bedrag === null || !heeftMotivatie(k.motivatie) || k.geen || k.nul;
    if (k.geen || k.nul) return k.geen === k.nul || k.besluit?.soort !== (k.geen ? 'geen' : 'nul') || !heeftMotivatie(k.besluit.motivatie);
    return k.besluit?.soort !== 'berekend' || !heeftMotivatie(k.besluit.motivatie);
  });
}

export function pasInkomensWijzigingToe(dossier, actor, invoer = {}) {
  const fout = wijzigingsBlokkade(actor, dossier);
  if (fout) return { fout };
  const { ondId, soort } = invoer;
  const doel = ondId ? (dossier.ondernemingen || []).find((o) => o.id === ondId) : dossier;
  if (!doel || !toegestaneInkomensBesluiten(dossier, ondId ? doel : null).includes(soort)) {
    return { fout: 'Deze inkomenswijziging is niet beschikbaar voor de gekozen onderneming of het gekozen toetskader.' };
  }
  if (soort === 'berekend' && !doel.afwijkend?.actief && !doel.geenInkomen && !doel.nulInkomen && doel.meenemen !== false) return { gewijzigd: false };
  const motivatie = tekst(invoer.motivatie);
  if (!motivatie) return { fout: 'Leg de motivatie voor deze inkomenswijziging vast.' };
  if (soort === 'afwijkend' && !bedragGeldig(invoer.bedrag)) return { fout: 'Vul een geldig bedrag van € 0 of hoger in.' };
  const vorig = keuze(doel);
  const hadFiat = !!(dossier.fiat?.eerste || dossier.fiat?.tweede);
  ruimKeuzesOp(doel);
  if (ondId && doel.meenemen === false) doel.meenemen = true;
  doel.inkomensbesluit = { soort, motivatie };
  if (soort === 'afwijkend') {
    doel.afwijkend = { actief: true, bedrag: rond(Number(invoer.bedrag)), motivatie, onderbouwing: tekst(invoer.onderbouwing),
      bestendigheid: tekst(invoer.bestendigheid), documentatie: tekst(invoer.documentatie) };
  } else if (soort === 'geen') {
    doel.geenInkomen = true;
  } else if (soort === 'nul') {
    doel.nulInkomen = true;
  }
  if (JSON.stringify(vorig) === JSON.stringify(keuze(doel))) return { gewijzigd: false };
  if (hadFiat) {
    delete dossier.fiat.eerste;
    delete dossier.fiat.tweede;
    delete dossier.fiatteur;
  }
  const label = { afwijkend: `afwijkend inkomen ${fmt.eur(doel.afwijkend?.bedrag)}`, nul: '€ 0 voor de risicobeoordeling',
    geen: 'geen inkomen afgeven', berekend: 'terug naar het berekende inkomen' }[soort];
  return { gewijzigd: true, tekst: `${ondId ? doel.naam || 'Hoofdbedrijf' : 'Dossier'}: ${label}. Motivatie: ${motivatie}${hadFiat ? ' Eerdere fiattering vervalt.' : ''}` };
}
