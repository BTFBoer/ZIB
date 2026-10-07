// Decimaal rekeningschema (rubrieken 0 t/m 9) als naslag bij de invoerposten, en de verdeling
// van een grootboek- of saldibalans over de invoerposten van ZIB.
//
// Conventie bij import: saldo = debet - credit. Activa en kosten hebben dus een positief saldo,
// passiva en opbrengsten een negatief saldo. Een kolom debet en een kolom credit mag ook.

import { parseBedrag } from '../util.js';

export const RUBRIEKEN = [
  { nr: '0', label: 'Vaste activa, eigen vermogen, voorzieningen en lang vreemd vermogen', sub: [
    { nr: '00', label: 'Materiële vaste activa', rekeningen: [['000', 'Terreinen'], ['001', 'Gebouwen'], ['002', 'Verbouwingen en installaties'], ['003', 'Machines'], ['004', 'Gereedschappen'], ['005', 'Inventaris'], ['006', 'Auto\'s']] },
    { nr: '01', label: 'Cumulatieve afschrijvingen op materiële vaste activa', rekeningen: [['011', 'Afschrijving gebouwen (cumulatief)'], ['012', 'Afschrijving verbouwingen en installaties (cumulatief)'], ['013', 'Afschrijving machines (cumulatief)'], ['014', 'Afschrijving gereedschappen (cumulatief)'], ['015', 'Afschrijving inventaris (cumulatief)'], ['016', 'Afschrijving auto\'s (cumulatief)']] },
    { nr: '02', label: 'Goodwill', rekeningen: [['020', 'Goodwill'], ['021', 'Afschrijving op goodwill (cumulatief)']] },
    { nr: '03', label: 'Leningen u/g op lange termijn', rekeningen: [['030', 'Leningen u/g (lange termijn)']] },
    { nr: '04', label: 'Eigen vermogen (nv/bv)', rekeningen: [['040', 'Aandelenkapitaal (geplaatst, nominaal)'], ['041', 'Aandelen in portefeuille'], ['042', 'Uit te reiken aandelen'], ['043', 'Agioreserve'], ['044', 'Winstreserve'], ['045', 'Herwaarderingsreserve'], ['047', 'Oprichtingskosten'], ['048', 'Winst na belasting lopend boekjaar'], ['049', 'Onverdeelde winst na belasting']] },
    { nr: '04', label: 'Eigen vermogen (vof)', rekeningen: [['040', 'Kapitaal firmant A'], ['041', 'Kapitaal firmant B (ook privé-opnamen)'], ['048', 'Winstsaldo lopend boekjaar (onverdeeld)'], ['049', 'Onverdeelde winst vorige boekjaren']] },
    { nr: '04', label: 'Eigen vermogen (eenmanszaak)', rekeningen: [['040', 'Eigen vermogen'], ['041', 'Oudedagsreserve'], ['042', 'Privé-opnamen (kan ook in rubriek 2)']] },
    { nr: '06', label: 'Voorzieningen', rekeningen: [['060', 'Onderhoudsvoorziening'], ['061', 'Garantievoorziening'], ['062', 'Assurantievoorziening'], ['065', 'Voorziening debiteuren'], ['066', 'Voorziening incourante goederen']] },
    { nr: '07', label: 'Lang vreemd vermogen', rekeningen: [['070', 'Obligatielening (geplaatst)'], ['071', 'Obligaties in portefeuille'], ['072', 'Converteerbare obligatielening'], ['073', 'Agio op obligaties'], ['074', 'Disagio op obligaties'], ['075', 'Emissiekosten obligaties'], ['076', 'Leningen o/g op lange termijn'], ['077', 'Hypothecaire lening o/g']] },
  ] },
  { nr: '1', label: 'Financiële rekeningen', sub: [
    { nr: '10', label: 'Kassen', rekeningen: [['100', 'Kas'], ['105', 'Kassa contante verkopen']] },
    { nr: '11', label: 'Banken', rekeningen: [['110', 'Bank'], ['111', 'Postbank']] },
    { nr: '12', label: 'Kruisposten', rekeningen: [['120', 'Kruisposten kas-bank'], ['121', 'Kruisposten pinbetalingen'], ['122', 'Kruisposten cheques en bonnen'], ['123', 'Overige kruisposten en vraagposten']] },
    { nr: '13', label: 'Handelsvorderingen', rekeningen: [['130', 'Debiteuren'], ['131', 'Dubieuze debiteuren'], ['132', 'Nog te factureren werkzaamheden en installaties'], ['134', 'Afgeleverde goederen'], ['135', 'Afschrijving dubieuze debiteuren']] },
    { nr: '14', label: 'Leverancierskredieten', rekeningen: [['140', 'Crediteuren'], ['145', 'Nog te ontvangen facturen']] },
    { nr: '15', label: 'Schulden in verband met personeel', rekeningen: [['150', 'Te betalen nettosalarissen'], ['151', 'Te betalen loonheffing'], ['152', 'Te betalen sociale lasten'], ['153', 'Te betalen pensioenpremies']] },
    { nr: '16', label: 'Schulden en vorderingen in verband met de vennootschap', rekeningen: [['160', 'Te betalen tantièmes'], ['161', 'Te betalen vennootschapsbelasting'], ['162', 'Te betalen interim-dividend'], ['163', 'Te betalen dividend'], ['164', 'Te betalen dividendbelasting'], ['165', 'Aandeelhouders nog te storten (vordering)']] },
    { nr: '17', label: 'Diverse korte schulden', rekeningen: [['170', 'Te betalen interest'], ['171', 'Te betalen coupons'], ['177', 'Uitgelote obligaties'], ['178', 'Rekening-courant directeur']] },
    { nr: '18', label: 'Omzetbelasting', rekeningen: [['180', 'Te vorderen omzetbelasting (voorheffing)'], ['181', 'Verschuldigde omzetbelasting (verkopen)'], ['182', 'Verschuldigde btw verlegd (Nederland)'], ['183', 'Verschuldigde btw verlegd (EU)'], ['188', 'Af te dragen omzetbelasting (aangifte)'], ['189', 'Te vorderen omzetbelasting (aangifte)']] },
    { nr: '19', label: 'Overlopende posten', rekeningen: [['190', 'Vooruitbetaalde bedragen (vordering)'], ['191', 'Vooruitontvangen bedragen (schuld)'], ['192', 'Nog te ontvangen bedragen (vordering)'], ['193', 'Nog te betalen bedragen (schuld)']] },
  ] },
  { nr: '2', label: 'Neutrale rekeningen', sub: [
    { nr: '20', label: 'Tussenrekeningen', rekeningen: [['200', 'Tussenrekening inkopen'], ['201', 'Tussenrekening verkopen']] },
    { nr: '21', label: 'Ondernemerspremie', rekeningen: [['210', 'Ondernemersloon vennoot A'], ['211', 'Privé-opnamen vennoot A'], ['212', 'Eigen bijdragen vennoot A'], ['213', 'Rente eigen vermogen vennoot A'], ['214', 'Ondernemersloon / privé-opnamen vennoot B'], ['215', 'Eigen bijdragen vennoot B'], ['216', 'Rente eigen vermogen vennoot B']] },
    { nr: '22', label: 'Reserverekeningen verschil economisch en fiscaal winstbegrip', rekeningen: [['221', 'Calculatorische afschrijving incourante goederen'], ['222', 'Comptabele afschrijving incourante goederen'], ['223', 'Reserve incourante goederen']] },
  ] },
  { nr: '3', label: 'Grond- en hulpstoffen', sub: [
    { nr: '30', label: 'Voorraad', rekeningen: [['300', 'Voorraad grondstoffen'], ['301', 'Voorraad onderdelen'], ['302', 'Voorraad hulpstoffen']] },
    { nr: '31', label: 'Besteld', rekeningen: [['310', 'Nog te ontvangen grondstoffen']] },
    { nr: '32', label: 'Prijsverschillen', rekeningen: [['320', 'Prijsverschillen bij inkoop grondstoffen']] },
  ] },
  { nr: '4', label: 'Kostenrekeningen', sub: [
    { nr: '40', label: 'Grondstofverbruik', rekeningen: [['400', 'Verbruik grondstoffen'], ['401', 'Verbruik onderdelen'], ['402', 'Verbruik hulpstoffen']] },
    { nr: '41', label: 'Personeelskosten', rekeningen: [['410', 'Directe loonkosten'], ['411', 'Indirecte loonkosten'], ['412', 'Sociale kosten'], ['413', 'Kosten pensioenen']] },
    { nr: '42', label: 'Huisvestings- en inventariskosten', rekeningen: [['420', 'Huurkosten'], ['421', 'Assurantiekosten'], ['422', 'Onderhoudskosten'], ['423', 'Energie en water'], ['424', 'Hygiënische kosten']] },
    { nr: '43', label: 'Kosten vervoer en verzenden', rekeningen: [['430', 'Autokosten'], ['435', 'Pakketpost en -diensten verkochte goederen']] },
    { nr: '44', label: 'Verkoopkosten', rekeningen: [['440', 'Directe verkoopkosten'], ['441', 'Advertenties'], ['442', 'Kosten website'], ['445', 'Indirecte verkoopkosten'], ['446', 'Incassokosten']] },
    { nr: '45', label: 'Algemene kosten', rekeningen: [['450', 'Kantoorkosten'], ['451', 'Representatiekosten'], ['452', 'Contributies en abonnementen'], ['453', 'Telecommunicatie en internet'], ['454', 'Accountancy- en advieskosten']] },
    { nr: '46', label: 'Interestkosten', rekeningen: [['460', 'Interestkosten']] },
    { nr: '47', label: 'Afschrijvingskosten', rekeningen: [['471', 'Afschrijvingskosten gebouwen'], ['472', 'Afschrijvingskosten inventaris'], ['473', 'Afschrijvingskosten auto\'s'], ['474', 'Afschrijvingskosten machines'], ['475', 'Afschrijvingskosten gereedschappen'], ['478', 'Afschrijvingskosten debiteuren'], ['479', 'Afschrijvingskosten voorraden']] },
    { nr: '48', label: 'Belastingen', rekeningen: [['480', 'Belastingen']] },
    { nr: '49', label: 'Verschillen', rekeningen: [['490', 'Kasverschillen'], ['491', 'Voorraadverschillen'], ['499', 'Overboekingsrekening rubriek 4']] },
  ] },
  { nr: '5', label: 'Verdeling indirecte kosten', sub: [
    { nr: '54', label: 'Fabricage', rekeningen: [['540', 'Indirecte fabricagekosten'], ['545', 'Opslag indirecte fabricagekosten']] },
    { nr: '55', label: 'Verkoop', rekeningen: [['550', 'Indirecte verkoopkosten'], ['555', 'Opslag indirecte verkoopkosten']] },
    { nr: '59', label: 'Overboeken', rekeningen: [['599', 'Overboekingsrekening rubriek 5']] },
  ] },
  { nr: '6', label: 'Fabricage (kostentoerekening)', sub: [
    { nr: '60', label: 'Fabricage', rekeningen: [['600', 'Fabricagerekening / fabricagekosten / verbruik grondstoffen'], ['601', 'Directe lonen'], ['602', 'Toeslag indirecte fabricagekosten']] },
    { nr: '61', label: 'Fabricage gecalculeerd', rekeningen: [['610', 'Gecalculeerde fabricagekosten / standaardverbruik grondstoffen'], ['611', 'Standaard directe lonen'], ['612', 'Standaardtoeslag indirecte fabricagekosten']] },
    { nr: '69', label: 'Overboeken', rekeningen: [['699', 'Overboekingsrekening rubriek 6']] },
  ] },
  { nr: '7', label: 'Voorraad gereed product en goederen in bewerking', sub: [
    { nr: '70', label: 'Handelsgoederen / gereed product', rekeningen: [['700', 'Voorraad goederen / gereed product'], ['701', 'Voorraad incourante goederen / handelsgoederen'], ['705', 'Afschrijving incourante goederen (cumulatief)']] },
    { nr: '71', label: 'Nog te ontvangen / in bewerking', rekeningen: [['710', 'Nog te ontvangen goederen / goederen in bewerking'], ['711', 'Installaties in aanleg']] },
    { nr: '72', label: 'Voorraadverschillen', rekeningen: [['720', 'Prijsverschillen bij inkoop']] },
    { nr: '73', label: 'In order / verkocht', rekeningen: [['735', 'Af te leveren goederen']] },
  ] },
  { nr: '8', label: 'Verkoopresultaat', sub: [
    { nr: '80', label: 'Omzetten', rekeningen: [['800', 'Omzet (hoog tarief)'], ['801', 'Winkelomzet'], ['805', 'Omzet goederen EU (verlegd)'], ['806', 'Omzet diensten EU (verlegd)']] },
    { nr: '81', label: 'Verkrijgingswaarde van de omzetten', rekeningen: [['810', 'Kostprijs verkopen (eigen productie)'], ['811', 'Inkoopprijs verkopen (handelsgoederen)']] },
    { nr: '82', label: 'Verkoopkosten', rekeningen: [['820', 'Directe verkoopkosten'], ['825', 'Toeslag indirecte verkoopkosten']] },
    { nr: '83', label: 'Rabatten', rekeningen: [['830', 'Kortingen bij verkoop']] },
  ] },
  { nr: '9', label: 'Rekeningen voor de opstelling van de resultatenrekening', sub: [
    { nr: '90', label: 'Indirecte kosten', rekeningen: [['900', 'Resultaat indirecte kosten']] },
    { nr: '91', label: 'Fabricage', rekeningen: [['910', 'Fabricageresultaat']] },
    { nr: '92', label: 'Verkoop', rekeningen: [['920', 'Verkoopresultaat']] },
    { nr: '95', label: 'Inkoop', rekeningen: [['950', 'Resultaat prijsverschillen']] },
    { nr: '96', label: 'Overige resultaten', rekeningen: [['960', 'Huuropbrengst'], ['961', 'Interestopbrengst']] },
    { nr: '97', label: 'Buitengewone resultaten', rekeningen: [['975', 'Resultaat ten gevolge van inhaalafschrijving']] },
    { nr: '98', label: 'Incidentele resultaten', rekeningen: [['980', 'Incidentele resultaten']] },
    { nr: '99', label: 'Vennootschap', rekeningen: [['990', 'Tantièmes'], ['991', 'Vennootschapsbelasting (last W&V)'], ['999', 'Overboekingsrekening rubriek 9']] },
  ] },
];

// Soort post: A = activa (saldo), P = passiva/EV (-saldo), K = kosten (saldo), O = opbrengst (-saldo)
// X = neutraal / verdeling (niet overnemen), S = teken bepaalt de post (bank, R/C, btw)
const POSTEN = {
  balans: {
    mvaGebouwen: 'A', mvaMachines: 'A', mvaOverig: 'A', ivaGoodwillNietEV: 'A', fvaOverig: 'A', fvaDGA: 'A',
    voorraden: 'A', onderhandenWerk: 'A', debiteuren: 'A', vordOB: 'A', vordDGAKort: 'A', vordOverig: 'A', liquideMiddelen: 'A',
    evKapitaal: 'P', evAgio: 'P', evWinstreserve: 'P', evFOR: 'P', evOverig: 'P',
    vzGarantie: 'P', vzOverig: 'P', llLeningen: 'P', llKrediet: 'P',
    klCrediteuren: 'P', klLoonheffing: 'P', klOB: 'P', klDGA: 'P', klKrediet: 'P', klVPB: 'P', klOverig: 'P',
  },
  vw: {
    omzet: 'O', overigeOpbrengsten: 'O', financieleBaten: 'O', bijzondereBaten: 'O',
    inkoopwaarde: 'K', lonen: 'K', socialeLasten: 'K', pensioenlasten: 'K', afschrijvingIVA: 'K', afschrijvingMVA: 'K',
    huisvesting: 'K', autokosten: 'K', verkoopkosten: 'K', kantoorkosten: 'K', algemeneKosten: 'K', overigeKosten: 'K',
    financieleLasten: 'K', bijzondereLasten: 'K', vpb: 'K',
  },
};

function bij(sectie, k, opmerking = '') { return { sectie, k, opmerking }; }

/**
 * Bepaalt de ZIB-post voor een rekeningnummer (3 cijfers, het decimale schema).
 * @returns {{sectie:'balans'|'vw'|null, k:string|null, opmerking:string, teken?:'S'}}
 */
export function postVoorRekening(rekening, saldo, rechtsvorm = 'BV') {
  const nr = String(rekening || '').replace(/\D/g, '').padEnd(3, '0').slice(0, 3);
  const n = Number(nr);
  const isEZ = rechtsvorm === 'EZ';
  const isVOF = ['VOF', 'MTS', 'CV'].includes(rechtsvorm);
  const debet = saldo >= 0;
  if (!/^\d{3}$/.test(nr)) return bij(null, null, 'Geen rekeningnummer');
  // Rubriek 0
  if (n <= 2 || n === 11 || n === 12) return bij('balans', 'mvaGebouwen');
  if (n === 3 || n === 4 || n === 13 || n === 14) return bij('balans', 'mvaMachines');
  if (n === 5 || n === 6 || n === 15 || n === 16 || (n >= 7 && n <= 9) || (n >= 17 && n <= 19)) return bij('balans', 'mvaOverig');
  if (n >= 20 && n <= 29) return bij('balans', 'ivaGoodwillNietEV', 'Beoordeel of de goodwill tot het eigen vermogen behoort.');
  if (n >= 30 && n <= 39) return bij('balans', 'fvaOverig', 'Lening u/g: betreft het een lening aan de DGA, verplaats naar "Langlopende vorderingen op DGA".');
  if (n >= 40 && n <= 49) {
    if (isEZ) {
      if (n === 41) return bij('balans', 'evFOR');
      return bij('balans', 'evKapitaal', n === 42 ? 'Privé-opnamen verlagen het ondernemingsvermogen.' : '');
    }
    if (isVOF) return bij('balans', n >= 48 ? 'evOverig' : 'evKapitaal');
    if (n === 43) return bij('balans', 'evAgio');
    if (n === 44) return bij('balans', 'evWinstreserve');
    if (n <= 42) return bij('balans', 'evKapitaal');
    return bij('balans', 'evOverig');
  }
  if (n >= 60 && n <= 69) {
    if (n === 61) return bij('balans', 'vzGarantie');
    if (n === 65) return bij('balans', 'debiteuren', 'Voorziening debiteuren verlaagt de debiteuren.');
    if (n === 66) return bij('balans', 'voorraden', 'Voorziening incourante goederen verlaagt de voorraad.');
    return bij('balans', 'vzOverig');
  }
  if (n >= 70 && n <= 79) return bij('balans', n === 77 ? 'llKrediet' : 'llLeningen');
  if (n >= 50 && n <= 59) return bij('balans', 'evOverig', 'Rubriek 05 is niet standaard; controleer de post.');
  if (n < 100) return bij(null, null, 'Onbekende rekening in rubriek 0');
  // Rubriek 1
  if (n >= 100 && n <= 109) return bij('balans', 'liquideMiddelen');
  if (n >= 110 && n <= 119) return debet ? bij('balans', 'liquideMiddelen') : bij('balans', 'klKrediet', 'Bank met creditsaldo: schuld aan kredietinstelling.');
  if (n >= 120 && n <= 129) return bij('balans', 'liquideMiddelen', 'Kruisposten horen per balansdatum nihil te zijn.');
  if (n >= 130 && n <= 139) return bij('balans', 'debiteuren');
  if (n >= 140 && n <= 149) return bij('balans', 'klCrediteuren');
  if (n === 150) return bij('balans', 'klOverig');
  if (n >= 151 && n <= 159) return bij('balans', 'klLoonheffing');
  if (n === 161) return bij('balans', 'klVPB');
  if (n === 165) return bij('balans', 'vordOverig');
  if (n >= 160 && n <= 169) return bij('balans', 'klOverig', n === 162 || n === 163 ? 'Te betalen dividend: let op betaalbaar gesteld dividend aan de DGA.' : '');
  if (n === 178) return debet ? bij('balans', 'vordDGAKort', 'Rekening-courant directie (vordering op de DGA).') : bij('balans', 'klDGA', 'Rekening-courant directie (schuld aan de DGA).');
  if (n >= 170 && n <= 179) return bij('balans', 'klOverig');
  if (n >= 180 && n <= 189) return debet ? bij('balans', 'vordOB') : bij('balans', 'klOB');
  if (n === 190 || n === 192) return bij('balans', 'vordOverig');
  if (n >= 190 && n <= 199) return bij('balans', 'klOverig');
  // Rubriek 2
  if (n >= 200 && n <= 209) return bij(null, null, 'Tussenrekening: hoort per balansdatum nihil te zijn.');
  if (n >= 210 && n <= 219) return bij('balans', 'evKapitaal', 'Ondernemersloon/privé: verrekend met het eigen vermogen.');
  if (n >= 220 && n <= 229) return bij('balans', 'evOverig', 'Reserverekening: controleer de verwerking.');
  if (n < 300) return bij(null, null, 'Onbekende rekening in rubriek 2');
  // Rubriek 3 en 7
  if (n >= 300 && n <= 399) return bij('balans', 'voorraden');
  if (n === 710 || n === 711) return bij('balans', 'onderhandenWerk');
  if (n >= 700 && n <= 799) return bij('balans', 'voorraden');
  // Rubriek 4
  if (n >= 400 && n <= 409) return bij('vw', 'inkoopwaarde');
  if (n === 410 || n === 411) return bij('vw', 'lonen', ['BV', 'NV'].includes(rechtsvorm) ? 'Verplaats het salaris van de DGA naar "Salaris / managementfee DGA".' : '');
  if (n === 412) return bij('vw', 'socialeLasten');
  if (n === 413) return bij('vw', 'pensioenlasten');
  if (n >= 414 && n <= 419) return bij('vw', 'lonen');
  if (n >= 420 && n <= 429) return bij('vw', 'huisvesting');
  if (n === 430) return bij('vw', 'autokosten');
  if (n >= 431 && n <= 439) return bij('vw', 'verkoopkosten');
  if (n >= 440 && n <= 449) return bij('vw', 'verkoopkosten');
  if (n === 450) return bij('vw', 'kantoorkosten');
  if (n >= 451 && n <= 459) return bij('vw', 'algemeneKosten');
  if (n >= 460 && n <= 469) return bij('vw', 'financieleLasten');
  if (n >= 470 && n <= 477) return bij('vw', 'afschrijvingMVA');
  if (n >= 478 && n <= 479) return bij('vw', 'overigeKosten', 'Afschrijving op debiteuren/voorraden.');
  if (n >= 480 && n <= 498) return bij('vw', 'overigeKosten');
  if (n === 499) return bij(null, null, 'Overboekingsrekening: hoort nihil te zijn.');
  // Rubriek 5 en 6: kostenverdeling
  if (n >= 500 && n <= 699) return bij(null, null, 'Kostenverdeling/-toerekening: niet overgenomen (anders dubbel geteld).');
  // Rubriek 8
  if (n >= 800 && n <= 809) return bij('vw', 'omzet');
  if (n >= 810 && n <= 819) return bij('vw', 'inkoopwaarde');
  if (n >= 820 && n <= 829) return bij('vw', 'verkoopkosten');
  if (n >= 830 && n <= 839) return bij('vw', 'omzet', 'Kortingen verlagen de omzet.');
  if (n >= 840 && n <= 899) return bij('vw', 'omzet');
  // Rubriek 9
  if (n === 960) return bij('vw', 'overigeOpbrengsten');
  if (n === 961) return bij('vw', 'financieleBaten');
  if (n >= 970 && n <= 989) return { sectie: 'vw', k: debet ? 'bijzondereLasten' : 'bijzondereBaten', opmerking: 'Beoordeel of het resultaat incidenteel is.' };
  if (n === 990) return bij('vw', 'overigeKosten', 'Tantièmes.');
  if (n === 991) return bij('vw', 'vpb');
  if (n === 999) return bij(null, null, 'Overboekingsrekening: hoort nihil te zijn.');
  if (n >= 900 && n <= 959) return bij('vw', 'overigeOpbrengsten', 'Resultaatrekening uit kostprijssysteem: controleer of de kosten niet dubbel zijn opgenomen.');
  if (n >= 962 && n <= 969) return bij('vw', 'overigeOpbrengsten');
  return bij(null, null, 'Onbekende rekening');
}

/**
 * Leest geplakte of geüploade grootboekregels: rekening; omschrijving; saldo
 * of rekening; omschrijving; debet; credit. Scheidingsteken ; of tab (of komma bij 3 kolommen
 * zonder decimale komma's). Kopregels en lege regels worden overgeslagen.
 */
export function parseGrootboekTekst(tekst) {
  const regels = [];
  const fouten = [];
  String(tekst || '').split(/\r?\n/).forEach((r, i) => {
    const regel = r.trim();
    if (!regel) return;
    let delen = regel.split(/\t|;/).map((x) => x.trim());
    if (delen.length < 3) delen = regel.split(/\s{2,}/).map((x) => x.trim());
    if (delen.length < 3 && (regel.match(/,/g) || []).length >= 2) delen = regel.split(',').map((x) => x.trim());
    const rekening = (delen[0] || '').replace(/"/g, '');
    if (!/^\d{1,6}$/.test(rekening.replace(/\s/g, ''))) {
      if (i > 0 || !/rekening|grootboek|omschrijving|saldo|debet|credit/i.test(regel)) fouten.push({ regel: i + 1, tekst: regel });
      return;
    }
    const omschrijving = (delen[1] || '').replace(/"/g, '');
    let saldo = null;
    if (delen.length >= 4) {
      const d = parseBedrag(delen[2]) ?? 0;
      const c = parseBedrag(delen[3]) ?? 0;
      saldo = d - c;
    } else {
      saldo = parseBedrag(delen[2]);
    }
    if (saldo === null) { fouten.push({ regel: i + 1, tekst: regel }); return; }
    regels.push({ rekening: rekening.replace(/\s/g, ''), omschrijving, saldo });
  });
  return { regels, fouten };
}

/**
 * Verdeelt grootboeksaldi over de invoerposten van ZIB.
 * @param {{rekening:string, omschrijving:string, saldo:number}[]} regels
 * @returns {{balans:object, vw:object, toegewezen:object[], nietOvergenomen:object[], resultaat:number, verschil:number}}
 */
export function verdeelGrootboek(regels, { rechtsvorm = 'BV' } = {}) {
  const balans = {};
  const vw = {};
  const toegewezen = [];
  const nietOvergenomen = [];
  let resultaat = 0; // credit (opbrengsten) minus debet (kosten) van de resultatenrekening
  let heeftVW = false;
  (regels || []).forEach((r) => {
    const saldo = Number(r.saldo) || 0;
    const p = postVoorRekening(r.rekening, saldo, rechtsvorm);
    if (!p.sectie) { nietOvergenomen.push({ ...r, opmerking: p.opmerking }); return; }
    const soort = POSTEN[p.sectie][p.k];
    const doel = p.sectie === 'balans' ? balans : vw;
    const bedrag = soort === 'A' || soort === 'K' ? saldo : -saldo;
    doel[p.k] = Math.round(((doel[p.k] || 0) + bedrag) * 100) / 100;
    if (p.sectie === 'vw') { resultaat -= saldo; heeftVW = true; }
    toegewezen.push({ ...r, sectie: p.sectie, k: p.k, bedrag, opmerking: p.opmerking });
  });
  // Bij een saldibalans staat het resultaat van het boekjaar nog op de resultatenrekeningen:
  // tel het op bij het eigen vermogen zodat de balans sluit.
  if (heeftVW && Object.keys(balans).length) {
    const sleutel = rechtsvorm === 'EZ' || ['VOF', 'MTS', 'CV'].includes(rechtsvorm) ? 'evKapitaal' : 'evOverig';
    balans[sleutel] = Math.round(((balans[sleutel] || 0) + resultaat) * 100) / 100;
  }
  const activa = Object.entries(balans).filter(([k]) => POSTEN.balans[k] === 'A').reduce((s, [, v]) => s + v, 0);
  const passiva = Object.entries(balans).filter(([k]) => POSTEN.balans[k] === 'P').reduce((s, [, v]) => s + v, 0);
  return { balans, vw, toegewezen, nietOvergenomen, resultaat: Math.round(resultaat * 100) / 100,
    verschil: Math.round((activa - passiva) * 100) / 100, resultaatGeboektOp: heeftVW && Object.keys(balans).length ? (rechtsvorm === 'EZ' || ['VOF', 'MTS', 'CV'].includes(rechtsvorm) ? 'evKapitaal' : 'evOverig') : null };
}
