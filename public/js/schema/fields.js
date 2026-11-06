import { num, isIngevuld } from '../util.js';

// Invoerposten per tabblad. De UI bouwt de invoerroosters op uit deze definities,
// de rekenkern gebruikt dezelfde sleutels. Rijtypen:
//   kop     = sectiekop              sub = subkop (inspringing via ind)
//   veld    = invoerveld (standaard)  som = berekend subtotaal (sleutel uit financieel.js)
//   extra   = aanvullende post buiten de quick-scan (inklapbaar)
//   waarvan = "⇒ waarvan"-post: onderdeel van de bovenliggende post, telt niet mee in de totalen
//
// detail: onderverdeling voor de uitgebreide modus (zoals de open te klappen posten in de
// rekensoftware). Zodra een onderdeel is ingevuld, is de post de som van de onderdelen; de
// onderdelen staan per jaar onder jaren[y].balansDetail[post] of jaren[y].vwDetail[post].

export const BALANS_RIJEN = [
  { t: 'kop', label: 'Activa' },
  { t: 'sub', label: 'Immateriële vaste activa' },
  { t: 'sub', label: 'Goodwill', ind: 1 },
  { k: 'ivaGoodwillEV', label: 'Goodwill behorend tot EV', ind: 2,
    hint: 'Goodwill die na beoordeling tot het eigen vermogen gerekend mag worden (wordt bij NHG niet gecorrigeerd).' },
  { k: 'ivaGoodwillNietEV', label: 'Goodwill niet behorend tot EV', ind: 2 },
  { k: 'ivaOverig', label: 'Overig', ind: 1 },
  { t: 'som', k: 'IVA', label: 'Totaal immateriële vaste activa' },

  { t: 'sub', label: 'Materiële vaste activa' },
  { k: 'mvaGebouwen', label: 'Gebouwen en terreinen', ind: 1, detail: [
    ['terreinen', 'Terreinen'], ['gebouwen', 'Gebouwen'], ['verbouwingen', 'Verbouwingen en installaties']] },
  { k: 'mvaMachines', label: 'Machines en installaties', ind: 1, detail: [
    ['machines', 'Machines'], ['gereedschappen', 'Gereedschappen']] },
  { k: 'mvaOverig', label: 'Overig', ind: 1, detail: [
    ['inventaris', 'Inventaris'], ['vervoer', 'Auto\'s en transportmiddelen'], ['overig', 'Overige materiële vaste activa']] },
  { t: 'som', k: 'MVA', label: 'Totaal materiële vaste activa' },

  { t: 'sub', label: 'Financiële vaste activa' },
  { k: 'fvaDeelnemingen', label: 'Deelnemingen', ind: 1, detail: [
    ['groep', 'Deelnemingen groepsmaatschappijen'], ['overig', 'Overige deelnemingen']] },
  { k: 'fvaGroep', label: 'Langlopende vorderingen op groepsmaatschappijen', ind: 1 },
  { k: 'fvaDGA', label: 'Langlopende vorderingen op DGA', ind: 1, hint: 'Lening u/g aan de DGA (lening directie).', detail: [
    ['nietHyp', 'Vorderingen op DGA niet-hypothecair'], ['hyp', 'Vorderingen op DGA hypothecair (eigen woning)']] },
  { k: 'fvaParticipanten', label: 'Langlopende vorderingen op participanten en deelnemingen', ind: 1 },
  { k: 'fvaOverig', label: 'Overig', ind: 1 },
  { t: 'extra', k: 'fvaLatenteBelasting', label: 'Latente belastingvorderingen (lang)', ind: 1 },
  { t: 'som', k: 'FVA', label: 'Totaal financiële vaste activa' },

  { t: 'sub', label: 'Voorraden' },
  { k: 'voorraden', label: 'Voorraden', ind: 1 },
  { k: 'onderhandenWerk', label: 'Onderhanden werken', ind: 1 },

  { t: 'sub', label: 'Vorderingen' },
  { k: 'debiteuren', label: 'Debiteuren', ind: 1, detail: [
    ['debiteuren', 'Handelsdebiteuren'], ['ntf', 'Nog te factureren'], ['voorziening', 'Voorziening dubieuze debiteuren (negatief)']] },
  { k: 'vordOB', label: 'Omzetbelasting', ind: 1 },
  { k: 'vordGroepKort', label: 'Kortlopende vordering groepsmaatschappijen', ind: 1 },
  { k: 'vordDGAKort', label: 'Kortlopende vordering DGA', ind: 1, hint: 'Rekening-courant directie (R/C DGA).' },
  { k: 'vordParticipantenKort', label: 'Kortlopende vordering participanten en deelnemingen', ind: 1 },
  { k: 'vordOverig', label: 'Overig', ind: 1, hint: 'Overige vorderingen en overlopende activa.', detail: [
    ['vooruitbetaald', 'Vooruitbetaalde bedragen'], ['nogTeOntvangen', 'Nog te ontvangen bedragen'],
    ['dividend', 'Nog te ontvangen dividend'], ['overig', 'Overige vorderingen']] },
  { t: 'extra', k: 'vordLatenteBelasting', label: 'Latente belastingvorderingen (kort)', ind: 1 },

  { k: 'effecten', label: 'Effecten' },
  { k: 'liquideMiddelen', label: 'Liquide middelen', detail: [
    ['kas', 'Kas'], ['bank', 'Bank'], ['kruisposten', 'Kruisposten']] },
  { t: 'waarvan', k: 'liquideNietVrij', label: 'waarvan niet ter vrije beschikking (G-rekening)', ind: 1,
    hint: 'Telt niet mee in de totalen; wordt gecorrigeerd op de vlottende activa.' },
  { t: 'som', k: 'VA', label: 'Totaal vlottende activa' },
  { t: 'som', k: 'TA', label: 'Totaal activa', sterk: true },

  { t: 'kop', label: 'Passiva' },
  { t: 'sub', label: 'Eigen vermogen' },
  { k: 'evKapitaal', label: 'Gestort + geplaatst kapitaal', ind: 1, hint: 'Bij een eenmanszaak/vof: het ondernemingsvermogen (kapitaal).' },
  { k: 'evAgio', label: 'Agio', ind: 1 },
  { k: 'evWinstreserve', label: 'Winstreserve', ind: 1 },
  { k: 'evFOR', label: 'Fiscale oudedagsreserve', ind: 1 },
  { k: 'evOverig', label: 'Overig', ind: 1, hint: 'Overige reserves en onverdeeld resultaat boekjaar.', detail: [
    ['herwaardering', 'Herwaarderingsreserve'], ['wettelijk', 'Wettelijke en statutaire reserves'],
    ['resultaat', 'Onverdeeld resultaat boekjaar'], ['overig', 'Overige reserves']] },
  { t: 'som', k: 'EV', label: 'Totaal eigen vermogen' },

  { t: 'sub', label: 'Voorzieningen' },
  { k: 'vzGarantie', label: 'Garantievoorziening', ind: 1 },
  { k: 'vzStamrecht', label: 'Stamrechtvoorziening', ind: 1 },
  { k: 'vzODV', label: 'Oudedagsverplichting', ind: 1, hint: 'Pensioen in eigen beheer / oudedagsverplichting.' },
  { t: 'extra', k: 'vzLatenteBelasting', label: 'Voorziening latente belastingen', ind: 1 },
  { t: 'extra', k: 'vzOverig', label: 'Overige voorzieningen', ind: 1 },
  { t: 'som', k: 'VZ', label: 'Totaal voorzieningen' },

  { t: 'sub', label: 'Langlopende schulden' },
  { k: 'llLeningen', label: 'Leningen', ind: 1, detail: [
    ['hypothecair', 'Hypothecaire leningen'], ['overig', 'Overige leningen'], ['lease', 'Leaseverplichtingen (lang)']] },
  { k: 'llKrediet', label: 'Schulden kredietinstellingen', ind: 1 },
  { k: 'llGroep', label: 'Schulden aan groepsmaatschappijen', ind: 1 },
  { k: 'llDGA', label: 'Schulden aan DGA', ind: 1 },
  { t: 'extra', k: 'llAchtergesteld', label: 'Achtergestelde leningen', ind: 1 },
  { t: 'som', k: 'LVV', label: 'Totaal langlopende schulden' },

  { t: 'sub', label: 'Kortlopende schulden' },
  { k: 'klCrediteuren', label: 'Crediteuren', ind: 1 },
  { k: 'klLoonheffing', label: 'Loonheffing', ind: 1 },
  { k: 'klOB', label: 'Omzetbelasting', ind: 1 },
  { k: 'klGroep', label: 'Kortlopende schuld groepsmaatschappijen', ind: 1 },
  { k: 'klDGA', label: 'Kortlopende schuld DGA', ind: 1 },
  { k: 'klParticipanten', label: 'Kortlopende schuld participanten en deelnemingen', ind: 1 },
  { t: 'extra', k: 'klKrediet', label: 'Schulden kredietinstellingen (kort)', ind: 1 },
  { t: 'extra', k: 'klVPB', label: 'Vennootschapsbelasting', ind: 1 },
  { t: 'extra', k: 'klAflossing', label: 'Aflossingsverplichtingen (< 1 jaar)', ind: 1 },
  { t: 'extra', k: 'klOverig', label: 'Overige schulden en overlopende passiva', ind: 1, detail: [
    ['ntb', 'Nog te betalen bedragen'], ['vooruitontvangen', 'Vooruitontvangen bedragen'],
    ['dividend', 'Te betalen dividend'], ['overig', 'Overige schulden']] },
  { t: 'som', k: 'KVV', label: 'Totaal kortlopende schulden' },
  { t: 'som', k: 'TP', label: 'Totaal passiva', sterk: true },
  { t: 'som', k: 'VERSCHIL', label: 'Verschil activa en passiva', controle: true },
];

export const VW_RIJEN = [
  { t: 'kop', label: 'Opbrengsten' },
  { k: 'omzet', label: 'Netto-omzet', detail: [
    ['hoofd', 'Omzet hoofdactiviteit'], ['managementFee', 'Managementvergoedingen (intercompany)'], ['overig', 'Overige omzet']] },
  { k: 'overigeOpbrengsten', label: 'Overige bedrijfsopbrengsten' },
  { k: 'inkoopwaarde', label: 'Inkoopwaarde van de omzet' },
  { k: 'uitbesteedWerk', label: 'Uitbesteed werk en andere externe kosten' },
  { t: 'som', k: 'BRUTO', label: 'Bruto bedrijfsresultaat' },

  { t: 'kop', label: 'Bedrijfskosten' },
  { k: 'lonen', label: 'Lonen en salarissen (personeel)' },
  { k: 'salarisDGA', label: 'Salaris / managementfee DGA', hint: 'Alleen bij een B.V./N.V.' },
  { k: 'socialeLasten', label: 'Sociale lasten' },
  { k: 'pensioenlasten', label: 'Pensioenlasten' },
  { k: 'afschrijvingIVA', label: 'Afschrijvingen immateriële vaste activa' },
  { k: 'afschrijvingMVA', label: 'Afschrijvingen materiële vaste activa' },
  { k: 'huisvesting', label: 'Huisvestingskosten', detail: [
    ['huur', 'Huur'], ['onderhoud', 'Onderhoud'], ['energie', 'Energie en water'], ['overig', 'Overige huisvestingskosten']] },
  { k: 'autokosten', label: 'Auto- en transportkosten', detail: [
    ['brandstof', 'Brandstof'], ['lease', 'Lease en huur'], ['onderhoud', 'Onderhoud en verzekering'], ['overig', 'Overige autokosten']] },
  { k: 'verkoopkosten', label: 'Verkoopkosten' },
  { k: 'kantoorkosten', label: 'Kantoorkosten' },
  { k: 'algemeneKosten', label: 'Algemene kosten', detail: [
    ['advies', 'Accountants- en advieskosten'], ['verzekering', 'Verzekeringen'], ['telecom', 'Telefoon en internet'], ['overig', 'Overige algemene kosten']] },
  { k: 'overigeKosten', label: 'Overige bedrijfskosten' },
  { t: 'som', k: 'KOSTEN', label: 'Totaal bedrijfskosten' },
  { t: 'som', k: 'BEDRIJFSRESULTAAT', label: '(Netto) bedrijfsresultaat' },

  { t: 'kop', label: 'Financiële en buitengewone posten' },
  { k: 'financieleBaten', label: 'Financiële baten', detail: [
    ['rente', 'Rentebaten'], ['dividend', 'Ontvangen dividend'], ['overig', 'Overige financiële baten']] },
  { k: 'financieleLasten', label: 'Financiële lasten', hint: 'Als positief bedrag invullen.' },
  { k: 'bijzondereBaten', label: 'Bijzondere / incidentele baten', detail: [
    ['boekwinst', 'Boekwinst verkoop activa'], ['subsidies', 'Subsidies'], ['overig', 'Overige bijzondere baten']] },
  { k: 'bijzondereLasten', label: 'Bijzondere / incidentele lasten', hint: 'Als positief bedrag invullen.' },
  { t: 'som', k: 'RVB', label: 'Resultaat vóór belastingen', sterk: true },
  { k: 'resultaatDeelnemingen', label: 'Resultaat deelnemingen' },
  { k: 'vpb', label: 'Vennootschapsbelasting', hint: 'Alleen bij een B.V./N.V. Als positief bedrag invullen.' },
  { t: 'som', k: 'NW', label: 'Netto resultaat', sterk: true },

  { t: 'kop', label: 'Overig' },
  { k: 'prognose', label: 'Prognose resultaat volledig jaar', hint: 'Vul in bij het controlejaar/lopend jaar.' },
  { k: 'fte', label: 'Aantal medewerkers (fte)', soort: 'getal' },
];

/** Som van de ingevulde onderdelen van een post (null als er geen onderdeel is ingevuld). */
export function detailSom(det) {
  const v = Object.values(det || {}).filter(isIngevuld);
  return v.length ? Math.round(v.reduce((a, b) => a + num(b), 0) * 100) / 100 : null;
}

/** Rijdefinitie met onderverdeling voor een post (balans of vw). */
export function detailRij(sectie, k) {
  return (sectie === 'balans' ? BALANS_RIJEN : VW_RIJEN).find((r) => r.k === k && r.detail) || null;
}

/**
 * Zet na een wijziging van een onderdeel de post op de som van de onderdelen.
 * @param {object} jd jaargegevens van een onderneming
 * @param {'balans'|'vw'} sectie
 * @param {string} k sleutel van de post
 * @returns {number|null} de nieuwe waarde van de post (null = onderdelen leeg, post ongewijzigd)
 */
export function pasDetailToe(jd, sectie, k) {
  const det = jd?.[`${sectie}Detail`]?.[k];
  const s = detailSom(det);
  if (s === null) return null;
  jd[sectie] = jd[sectie] || {};
  jd[sectie][k] = s;
  return s;
}

// Diversen: correcties en aanvullende gegevens per onderneming per jaar.
// sign: +1 verhoogt, -1 verlaagt; kaders/soorten beperken waar een post meetelt.
export const DIVERSEN_RIJEN = [
  { t: 'kop', label: 'Correcties op het resultaat' },
  { k: 'incidenteleBaten', label: 'Incidentele baten (corrigeren)', sign: -1,
    hint: 'Leeg = de bijzondere baten uit de V&W. Vul 0 in als die niet incidenteel zijn.' },
  { k: 'incidenteleLasten', label: 'Incidentele lasten (corrigeren)', sign: +1,
    hint: 'Leeg = de bijzondere lasten uit de V&W. NHG: alleen indien fiscaal van aard.' },
  { k: 'willekeurigeAfschrijving', label: 'Willekeurige afschrijving', sign: +1, als: 'fiscaleCorrecties' },
  { k: 'investeringsaftrek', label: 'Investeringsaftrek', sign: +1, als: 'fiscaleCorrecties', soorten: ['IB'],
    hint: 'Fiscale aftrek: positief corrigeren op de saldo fiscale winst.' },
  { k: 'beperktAftrekbaar', label: 'Beperkt / niet aftrekbare kosten', sign: -1, als: 'fiscaleCorrecties', soorten: ['IB'],
    hint: 'Fiscaal bijgeteld: negatief corrigeren op de saldo fiscale winst.' },
  { k: 'vervallenHuurlasten', label: 'Vervallen kale huurlasten (bedrijfsruimte in de nieuwe woning)', sign: +1, als: 'vervallenHuurPct',
    hint: 'Kale jaarhuur die vervalt; ASN telt 85% positief mee op het resultaat.' },
  { k: 'aflossingenLVV', label: 'Contractuele aflossingen langlopende schulden', als: 'cashflowCorrectie',
    hint: 'Werkelijk betaalde contractuele aflossingen in het boekjaar (niet de post op de balans).' },
  { k: 'correctieDeelneming', label: 'Correctie resultaat deelneming', sign: +1,
    hint: 'Negatief bedrag = resultaat deelneming niet meenemen.' },
  { k: 'overigePositief', label: 'Overige positieve correctie', sign: +1 },
  { k: 'overigeNegatief', label: 'Overige negatieve correctie', sign: -1 },

  { t: 'kop', label: 'Balanscorrecties' },
  { k: 'stilleReserves', label: 'Stille reserve onroerend goed', model: 'NHG',
    hint: 'WOZ/taxatie (max. 6 maanden oud) minus boekwaarde.' },
  { k: 'box3Ingezet', label: 'Box 3 vermogen ingezet bij deze onderneming', model: 'NHG' },
  { k: 'dubieuzeDebiteuren', label: 'Dubieuze debiteuren zonder voorziening' },
  { k: 'surplusOntvangen', label: 'Surplus werkkapitaal ontvangen van groep', model: 'NHG' },
  { k: 'surplusIngezet', label: 'Surplus werkkapitaal ingezet bij groep' },
  { k: 'balansOverigPositief', label: 'Overige positieve correctie EV', model: 'NHG' },
  { k: 'balansOverigNegatief', label: 'Overige negatieve correctie EV en balanstotaal' },

  { t: 'kop', label: 'Overige gegevens' },
  { k: 'dividenduitkering', label: 'Dividenduitkering door de onderneming in het boekjaar', soorten: ['VPB'] },
];

export const DIVERSEN_VLAGGEN = [
  { k: 'incidenteleLastenFiscaal', label: 'Incidentele lasten zijn fiscaal van aard', als: 'incidenteelAlleenFiscaal', standaard: true },
  { k: 'leningDGAGedekt', label: 'Lening u/g aan DGA is gedekt (eigen woning of box 3 onroerend goed)', soorten: ['VPB'], standaard: false },
  { k: 'cashflowNietToepassen', label: 'Cashflowcorrectie niet toepassen (gemotiveerd: geen negatieve invloed op verdiencapaciteit)', als: 'cashflowCorrectie', standaard: false },
];

/**
 * Is een invoerregel zichtbaar voor dit kader en deze soort ondernemer? `kaders` = lijst kader-id's,
 * `model` = correctiemodel van het kader, `als` = kaderparameter die waar moet zijn.
 */
export function veldZichtbaar(def, kader, soort) {
  if (def.soorten && !def.soorten.includes(soort)) return false;
  if (def.kaders && !def.kaders.includes(kader.id)) return false;
  if (def.model && kader.correctieModel !== def.model) return false;
  if (def.als && !kader[def.als]) return false;
  return true;
}

// IB-aangifte: per onderneming en persoonlijk.
export const IB_ONDERNEMING_RIJEN = [
  { k: 'sfw', label: 'Saldo fiscale winst', soorten: ['IB'] },
  { k: 'loon', label: 'Loon uit dienstbetrekking (DGA)', soorten: ['VPB'] },
  { k: 'bijtelling', label: 'Bijtelling privégebruik auto', hint: 'Als positief bedrag invullen; wordt in mindering gebracht.' },
  { k: 'dividend', label: 'Ontvangen dividend (box 2, bruto)', soorten: ['VPB'] },
];

export const IB_PERSOON_RIJEN = [
  { k: 'voorStart', label: 'Looninkomsten vóór starten onderneming', hint: 'Excl. eenmalige (ontslag)vergoedingen.' },
  { k: 'naast', label: 'Looninkomen naast/tijdens ondernemerschap' },
  { k: 'uitkeringen', label: 'Inkomensvervangende uitkeringen' },
  { k: 'row', label: 'Resultaat uit overige werkzaamheden' },
  { k: 'box3', label: 'Box 3: vrij beschikbaar vermogen per 31-12' },
];

// Statussen zoals in de aanvragenlijst van de rekensoftware (lopend) plus de afgeronde statussen.
export const DOSSIER_STATUSSEN = {
  documenten_uploaden: 'Documenten uploaden',
  controleren_documenten: 'Controleren documenten',
  opnieuw_controleren: 'Opnieuw doc. controleren',
  informatie_aanleveren: 'Informatie aanleveren',
  beoordeling_1: '1e beoordeling',
  beoordeling_2: '2e beoordeling',
  afgerond: 'Afgerond',
  afgewezen: 'Afgewezen',
  geannuleerd: 'Geannuleerd',
};

export const AFGEROND = ['afgerond', 'afgewezen', 'geannuleerd'];

// Oude statussen (ZIB 1.0) en de nieuwe tegenhanger.
export const STATUS_MIGRATIE = {
  nieuw: 'documenten_uploaden',
  in_behandeling: 'beoordeling_1',
  wacht_op_stukken: 'informatie_aanleveren',
  gereed: 'beoordeling_2',
  teruggezet: 'beoordeling_1',
};

/** Werkt een dossier bij naar het actuele formaat (statussen, weergave). Geeft true bij een wijziging. */
export function migreerDossier(d) {
  if (!d || d.type !== 'dossier') return false;
  let gewijzigd = false;
  if (STATUS_MIGRATIE[d.status]) {
    if (d.status === 'teruggezet') d.teruggezet = true;
    d.status = STATUS_MIGRATIE[d.status];
    gewijzigd = true;
  }
  if (!DOSSIER_STATUSSEN[d.status]) {
    d.status = 'documenten_uploaden';
    gewijzigd = true;
  }
  return gewijzigd;
}

/**
 * Weergave van een dossier: de keuze in het dossier, anders de ViiZ-weergave (volledige rekensoftware).
 * Wie ABN AMRO-dossiers liever in de stappen van de rekentool van de bank opent, kiest dat in Mijn gegevens.
 */
export function weergaveVan(d, voorkeurABN = 'viiz') {
  if (d?.weergave === 'bzi' || d?.weergave === 'viiz') return d.weergave;
  return d?.kader === 'ABN' && voorkeurABN === 'bzi' ? 'bzi' : 'viiz';
}

export const JAAR_STATUSSEN = {
  definitief: 'Definitief',
  concept: 'Concept',
  tussentijds: 'Tussentijds',
};
