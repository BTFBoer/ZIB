// Oefendossier met echte jaarcijfers en een fictieve aanvrager. De cijfers komen uit de herpresentaties in
// Nederlandse indeling van de geconsolideerde en enkelvoudige jaarrekeningen van Renewi Limited (voorheen
// Renewi plc) over de boekjaren 2022/2023 tot en met 2025/2026 (openbare bron, bedragen x € 1.000).
// De aanvrager, zijn loon, privégegevens en de aanvraag zijn verzonnen. In de bronstukken was Renewi tot juni
// 2025 beursgenoteerd en daarna een 100%-dochter van Earth Bidco B.V.; in dit dossier houdt de aanvrager in
// alle toetsjaren direct 100% van de aandelen en is Earth Bidco B.V. een derde (financier en houder van 33,9%
// van Renewi Europe B.V.).
//
// Gebroken boekjaar (1 april - 31 maart). Het jaar in ZIB is het boekjaar dat in dat kalenderjaar begint:
// 2023 = 2023/2024, 2024 = 2024/2025, 2025 = 2025/2026; het lopende boekjaar 2026/2027 is het controlejaar.

const k = (x) => Math.round(x * 1000); // bronbedragen x € 1.000 naar euro's
const ID = 'dos_demo_renewi';
const OND = 'ond_renewi';
const AANGEMAAKT = '2026-11-02T09:00:00.000Z';
const GEWIJZIGD = '2026-11-06T10:00:00.000Z';

// DGA-loon (fictief) per kalenderjaar; opgenomen in de personeelskosten van de groep.
const LOON = { 2023: 384000, 2024: 396000, 2025: 408000 };

/**
 * Winst-en-verliesrekening naar soort (ViiZ-indeling) uit de functionele IFRS-indeling en de toelichting.
 * De externe kosten (verwerking, transport, energie, uitbesteed werk) zijn het saldo dat resteert na de
 * afzonderlijk toegelichte kostensoorten, zodat het bedrijfsresultaat aansluit op de jaarrekening.
 */
function vw({ jaar, omzet, bedrijfsresultaat, lonen, aandelen, sociaal, pensioen, afsIVA, afsMVA, overig, bijzonderInBR = 0,
  finBaten, finLasten, bijzBaten = 0, bijzLasten, deelnemingen, vpb, fte }) {
  const kostenBR = omzet - bedrijfsresultaat; // alle bedrijfslasten volgens de jaarrekening
  const extern = kostenBR - (lonen + aandelen + sociaal + pensioen) - afsIVA - afsMVA - overig - bijzonderInBR;
  return {
    omzet: k(omzet),
    uitbesteedWerk: k(extern),
    lonen: k(lonen + aandelen) - LOON[jaar],
    salarisDGA: LOON[jaar],
    socialeLasten: k(sociaal),
    pensioenlasten: k(pensioen),
    afschrijvingIVA: k(afsIVA),
    afschrijvingMVA: k(afsMVA),
    overigeKosten: k(overig),
    financieleBaten: k(finBaten),
    financieleLasten: k(finLasten),
    bijzondereBaten: k(bijzBaten),
    bijzondereLasten: k(bijzLasten),
    resultaatDeelnemingen: k(deelnemingen),
    vpb: k(vpb),
    fte,
  };
}

const jaren = {
  // ---- 2023 = boekjaar 2023/2024 (jaarrekening 2024) -------------------------------------------------
  2023: {
    status: 'definitief', van: '2023-04-01', tot: '2024-03-31',
    vw: vw({ jaar: 2023, omzet: 1689200, bedrijfsresultaat: 97600,
      lonen: 332900, aandelen: 1200, sociaal: 67400, pensioen: 33100,
      afsIVA: 12300, afsMVA: 69200 + 2800 - 800 + 51500, // MVA, per saldo bijzondere waardeverminderingen, gebruiksrechten
      overig: 94500 + 22200 + 12800 - 700 - 1900 - 100 - 200, // onderhoud, korte en kleine leases, onderverhuur, boekwinst, valuta, kredietverliezen
      finBaten: 1500, finLasten: 39500,
      bijzLasten: 62800, // resultaat beëindigde bedrijfsactiviteiten UK Municipal vóór belastingen
      deelnemingen: 500, vpb: 14900 + 13300, fte: 5715 }),
    balans: {
      ivaGoodwillNietEV: k(568300), ivaOverig: k(65200),
      mvaGebouwen: k(326200), mvaMachines: k(281500), mvaOverig: k(11000 + 253900), // stortplaatsen en gebruiksrechten (leases)
      fvaDeelnemingen: k(9000), fvaParticipanten: k(400), fvaOverig: k(17700 + 100 + 1100), fvaLatenteBelasting: k(28000),
      voorraden: k(23400), debiteuren: k(217400), vordParticipantenKort: k(600),
      vordOverig: k(1300 + 6200 + 28200 + 137700), // derivaten, Vpb, overige vorderingen, activa aangehouden voor verkoop
      liquideMiddelen: k(79000),
      evKapitaal: k(100100), evAgio: k(474500), evOverig: k(-14400 - 259200 + 13000),
      vzLatenteBelasting: k(44900), vzOverig: k(12900 + 199000),
      llLeningen: k(124700 + 11000 + 207500), llKrediet: k(242200),
      klAflossing: k(75000 + 45500), klKrediet: k(100), klCrediteuren: k(145500), klLoonheffing: k(51400), klVPB: k(20500),
      klOverig: k(277000 + 285000), // overige schulden en overlopende passiva, verplichtingen aangehouden voor verkoop
    },
    balansDetail: {
      evOverig: { wettelijk: k(-14400), overig: k(-259200 + 13000) },
      llLeningen: { overig: k(124700 + 11000), lease: k(207500) },
    },
    div: { aflossingenLVV: k(55300 + 5300), dividenduitkering: 0 },
    winstCorrecties: [
      { type: 'incidenteleLast', bedrag: k(76100), toelichting: 'Resultaat beëindigde bedrijfsactiviteiten UK Municipal na belastingen (in de V&W € 62,8 mln vóór belastingen onder de bijzondere lasten en € 13,3 mln belastinglast onder de Vpb). Bevat het waardeverlies tot reële waarde minus verkoopkosten van € 63,5 mln. Onderdeel in 2024/2025 verkocht; niet bestendig.' },
      { type: 'incidenteleBaat', bedrag: k(4400), toelichting: 'Belastingbate uit correcties over voorgaande jaren (aansluiting belastinglast); hoort niet bij dit boekjaar.' },
      { type: 'overig', bedrag: k(-3200), toelichting: 'Aandeel derden in het resultaat (minderheidsbelangen in groepsmaatschappijen); komt niet toe aan de aandeelhouder.' },
    ],
    geldstromen: { dividendDGA: 0 },
  },
  // ---- 2024 = boekjaar 2024/2025 (jaarrekening 2025) -------------------------------------------------
  2024: {
    status: 'definitief', van: '2024-04-01', tot: '2025-03-31',
    vw: vw({ jaar: 2024, omzet: 1741300, bedrijfsresultaat: 73600,
      lonen: 336600, aandelen: 1400, sociaal: 69800, pensioen: 34200,
      afsIVA: 12600, afsMVA: 73800 + 400 - 100 + 48900,
      overig: 95800 + 25500 + 13100 - 600 - 3400 + 500 - 400,
      bijzonderInBR: 15600, // afwaardering goodwill: uit de bedrijfslasten naar de bijzondere lasten
      finBaten: 3000 - 1700, finLasten: 45300,
      bijzBaten: 1700, // rente op terug te ontvangen Belgische belastingen (bijzondere financiële bate)
      bijzLasten: 15600 + 15500, // afwaardering goodwill en beëindigde bedrijfsactiviteiten vóór belastingen
      deelnemingen: 200, vpb: 12300 + 400, fte: 5641 }),
    vwDetail: { bijzondereBaten: { overig: k(1700) } },
    balans: {
      ivaGoodwillNietEV: k(552700), ivaOverig: k(63500),
      mvaGebouwen: k(329400), mvaMachines: k(291500), mvaOverig: k(9900 + 253200),
      fvaDeelnemingen: k(8900), fvaParticipanten: k(400), fvaOverig: k(14900 + 1400 + 700), fvaLatenteBelasting: k(29400),
      voorraden: k(27100), debiteuren: k(198900), vordParticipantenKort: k(200),
      vordOverig: k(4000 + 28400 + 6400),
      liquideMiddelen: k(35100),
      evKapitaal: k(100100), evAgio: k(474500), evOverig: k(-6300 - 257500 + 14700),
      vzLatenteBelasting: k(44800), vzOverig: k(5600 + 210400),
      llLeningen: k(124800 + 1200 + 214900), llKrediet: k(254800),
      klAflossing: k(43600), klKrediet: k(134500), klCrediteuren: k(138800), klLoonheffing: k(49800), klVPB: k(14300),
      klOverig: k(292900 + 100),
    },
    balansDetail: {
      evOverig: { wettelijk: k(-6300), overig: k(-257500 + 14700) },
      llLeningen: { overig: k(124800 + 1200), lease: k(214900) },
    },
    div: { aflossingenLVV: k(54100 + 75000 + 2900), dividenduitkering: k(4700) },
    winstCorrecties: [
      { type: 'incidenteleLast', bedrag: k(15900), toelichting: 'Resultaat beëindigde bedrijfsactiviteiten UK Municipal tot de verkoop aan Biffa, na belastingen (€ 15,5 mln vóór belastingen onder de bijzondere lasten, € 0,4 mln belasting).' },
      { type: 'incidenteleLast', bedrag: k(15600), toelichting: 'Bijzondere waardevermindering goodwill (niet-kasmatig, geen belastingeffect).' },
      { type: 'incidenteleBaat', bedrag: 1275000, toelichting: 'Rente op terug te ontvangen Belgische belastingen: € 1,7 mln vóór belastingen, na 25% belasting € 1,275 mln.' },
      { type: 'incidenteleBaat', bedrag: k(1400), toelichting: 'Belastingbate uit correcties over voorgaande jaren.' },
      { type: 'overig', bedrag: k(-2000), toelichting: 'Aandeel derden in het resultaat.' },
    ],
    geldstromen: { dividendDGA: k(4700) },
  },
  // ---- 2025 = boekjaar 2025/2026 (jaarrekening 2026) -------------------------------------------------
  2025: {
    status: 'definitief', van: '2025-04-01', tot: '2026-03-31',
    vw: vw({ jaar: 2025, omzet: 1752400, bedrijfsresultaat: 20600,
      lonen: 349700, aandelen: 1800, sociaal: 72200, pensioen: 34800,
      afsIVA: 12200, afsMVA: 81500 + 100 - 500 + 45800,
      overig: 104000 + 23700 + 13400 - 1200 + 2000 + 1000,
      bijzonderInBR: 33100, // kosten van de transactie met Earth Bidco B.V. (juni 2025)
      finBaten: 4800 - 4000, finLasten: 37600,
      bijzBaten: 4000, bijzLasten: 33100,
      deelnemingen: 200, vpb: -200, fte: 5675 }),
    vwDetail: { bijzondereBaten: { overig: k(4000) } },
    balans: {
      ivaGoodwillNietEV: k(552700), ivaOverig: k(56000),
      mvaGebouwen: k(329500), mvaMachines: k(312200), mvaOverig: k(14200 + 264700),
      fvaDeelnemingen: k(7800), fvaParticipanten: k(500), fvaOverig: k(13000 + 200 + 9400 + 700), fvaLatenteBelasting: k(18300),
      voorraden: k(30700), debiteuren: k(211400),
      vordOverig: k(4300 + 17100 + 40300 + 1200),
      liquideMiddelen: k(103100),
      evKapitaal: k(100900), evAgio: k(474500), evOverig: k(-5400 - 67200 + 185900),
      vzLatenteBelasting: k(30800), vzOverig: k(4900 + 195000),
      llLeningen: k(48600 + 201300 + 5700 + 232900), llKrediet: k(19100),
      klAflossing: k(40700), klKrediet: k(1200), klCrediteuren: k(193700), klLoonheffing: k(54300), klVPB: k(21900),
      klOverig: k(248500),
    },
    balansDetail: {
      evOverig: { wettelijk: k(-5400), overig: k(-67200 + 185900) },
      llLeningen: { overig: k(48600 + 201300 + 5700), lease: k(232900) },
    },
    div: { aflossingenLVV: k(53700 + 76300), dividenduitkering: k(9000) },
    winstCorrecties: [
      { type: 'incidenteleLast', bedrag: k(33100), toelichting: 'Kosten van de transactie en herkapitalisatie met Earth Bidco B.V. (juni 2025); eenmalig. Aangenomen fiscaal niet aftrekbaar, dus zonder belastingeffect.' },
      { type: 'incidenteleBaat', bedrag: k(3000), toelichting: 'Rente op terug te ontvangen Belgische belastingen: € 4,0 mln vóór belastingen, na 25% belasting € 3,0 mln.' },
      { type: 'incidenteleBaat', bedrag: k(12500), toelichting: 'Belastingbate uit correcties over voorgaande jaren (€ 12,5 mln); verklaart dat over een verlies vóór belastingen per saldo een belastingbate is geboekt.' },
      { type: 'overig', bedrag: k(-10900), toelichting: 'Aandeel derden in het resultaat, vooral het belang van 33,9% van Earth Bidco B.V. in Renewi Europe B.V.' },
    ],
    geldstromen: { dividendDGA: k(9000) },
  },
  // ---- 2026 = lopend boekjaar 2026/2027: tussentijdse cijfers over het eerste halfjaar nog op te vragen ------
  2026: { status: 'tussentijds', van: '2026-04-01', tot: '2026-09-30' },
};

const onderneming = {
  id: OND, naam: 'Renewi Limited', rechtsvorm: 'BV', rechtNL: false,
  activiteit: 'Houdster- en financieringsmaatschappij (afval-tot-product)', kvk: 'SC077438 (Companies House)',
  startdatum: '1982-02-04', aandeelPct: 100, direct: true, zeggenschap: true,
  land: 'OV', belastingplichtig: 'OV', actief: true, meenemen: true, beroepsgroep: 'overig', consolidatie: true,
  website: 'www.renewi.com', medewerkers: 5675,
  sbi: '38.11 Inzameling van niet-gevaarlijk afval\n38.21 Behandeling en verwijdering van niet-gevaarlijk afval\n38.32 Voorbereiding tot recycling\n64.21 Financiële holdings',
  overwinst: { meenemen: false, kasstroomBevestigd: false },
  // Besluit acceptant (ABN AMRO): het toetskader wordt niet gehaald, dus geen inkomen afgeven.
  geenInkomen: true,
  jaren,
};

const notities = {
  algemeen: `Fictief oefendossier: echte jaarcijfers van Renewi Limited (herpresentaties in Nederlandse indeling van de jaarrekeningen 2022/2023 t/m 2025/2026), met een verzonnen aanvrager.

Wie is de klant?
- Omschrijving: R.J. Hoogendam houdt direct 100% van de aandelen Renewi Limited en is uitvoerend bestuurder (executive director); loon via de Nederlandse loonadministratie.
- Leeftijd: 55 jaar.
- Ondernemer sinds: 2017 (aandeelhouder en bestuurder sinds de vorming van de Renewi-groep).

Organisatiestructuur
- Organogram en rechtsvormen: Hoogendam > 100% Renewi Limited (private limited company naar Schots recht, Edinburgh, Companies House SC077438) > 66,1% Renewi Europe B.V. en groepsmaatschappijen in Nederland en België. Earth Bidco B.V. (Macquarie Asset Management en BCI) houdt 33,9% van Renewi Europe B.V.
- Samenhang: Renewi Limited is houdster- en financieringsmaatschappij met de hoofdkantoorfunctie (12 medewerkers); de activiteiten zitten in de groepsmaatschappijen. De cijfers zijn geconsolideerd ingevoerd.
- Datum oprichting: 4 februari 1982.
- Historie: verkoop UK Municipal (Britse PPP-afvalcontracten) in 2024/2025. Herkapitalisatie juni 2025: Earth Bidco B.V. nam voor € 373,9 mln nieuwe aandelen Renewi Europe B.V. (33,9%) en verstrekte € 575,2 mln aan leningen, waarvan € 115,0 mln is afgelost; de bankfinanciering (€ 512,9 mln) is afgelost. In de bronstukken was Renewi tot juni 2025 beursgenoteerd en daarna 100%-dochter van Earth Bidco B.V.; voor dit dossier is aangenomen dat de aanvrager in alle toetsjaren enig aandeelhouder was.

Kernactiviteiten
- Branche: inzameling, verwerking en recycling van bedrijfsafval (segmenten Commercial Waste NL/BE, Mineralz & Water, Specialities).
- Uit welke onderneming(en) komt het inkomen: Renewi Limited (DGA-loon en dividend).
- Activiteiten: omzet 2025/2026 € 1.752 mln (Nederland 66%, België 31%), gemiddeld 5.675 medewerkers.

Bijzonderheden
- Gebroken boekjaar (1 april - 31 maart). Jaar in ZIB = boekjaar dat in dat kalenderjaar begint: 2023 = 2023/2024, 2024 = 2024/2025, 2025 = 2025/2026. Het lopende boekjaar 2026/2027 is het controlejaar; tussentijdse cijfers ontbreken.
- Buitenlandse vennootschap (Schots recht, gevestigd en belastingplichtig in het Verenigd Koninkrijk).
- Boekjaar 2022/2023 (alleen ter informatie): omzet € 1.892 mln, resultaat na belastingen € 66,6 mln, toe te rekenen aan de aandeelhouder € 62,9 mln.`,
  financieelOnderneming: {
    [OND]: `Winst- en verliesrekening
- Omzet stabiel rond € 1,7 mld (2023/24 € 1.689 mln, 2024/25 € 1.741 mln, 2025/26 € 1.752 mln). De onderliggende bedrijfsresultaatmarge daalt van 6,2% naar 5,8% en 3,3%.
- Kostenstructuur: personeel 26% van de omzet, verwerking, transport en overige externe kosten 53-55%, afschrijvingen 8%. Past bij een kapitaalintensief afvalbedrijf.
- Ingevoerd naar soort; de externe kosten zijn het saldo na de toegelichte kostensoorten. Beëindigde activiteiten (UK Municipal), de goodwillafwaardering 2024/25, de transactiekosten 2025 en de rente op de Belgische belastingteruggave staan onder de bijzondere baten en lasten.
- Gecorrigeerd (na belastingen): beëindigde activiteiten (+€ 76,1 mln en +€ 15,9 mln), goodwillafwaardering (+€ 15,6 mln), transactiekosten (+€ 33,1 mln), Belgische belastingrente (-€ 1,3 mln en -€ 3,0 mln), belastingcorrecties voorgaande jaren (-€ 4,4 mln, -€ 1,4 mln en -€ 12,5 mln) en aandeel derden (-€ 3,2 mln, -€ 2,0 mln en -€ 10,9 mln).
- Niet gecorrigeerd: de terugkerende 'bijzondere posten' (reorganisaties, mutaties voorzieningen door de disconteringsvoet, afschrijving op overgenomen immateriële activa). Die komen elk jaar terug en horen bij het verdienmodel.
- Nettowinst na correcties: € 37,6 mln (2023/24), € 30,1 mln (2024/25) en -€ 5,1 mln (2025/26). Het laatste boekjaar is ook na correcties verlieslatend.

Balans
- Goodwill (€ 553 mln) en overige immateriële activa tellen niet als eigen vermogen; latente belastingen volgens het toetskader.
- Groepsvermogen inclusief aandeel derden: € 314,0 mln, € 325,5 mln en € 688,7 mln (aandeel derden € 13,0 mln, € 14,7 mln en € 185,9 mln, ingevoerd onder overige reserves). Na aftrek van de immateriële activa negatief tot en met 2024/25 en € 80 mln per 31-3-2026.
- Solvabiliteit (groepsvermogen / balanstotaal) 15,3%, 17,5% en 34,7%; current ratio 0,55, 0,45 en 0,73 (kortlopend deel voorzieningen onder de voorzieningen).
- Netto schuld inclusief leases € 616 mln, € 738 mln en € 441 mln. Leaseverplichtingen (IFRS 16) onder de leningen en aflossingsverplichtingen; gebruiksrechten onder overige materiële vaste activa.
- Per 31-3-2024 zijn de activa (€ 137,7 mln) en verplichtingen (€ 285,0 mln) aangehouden voor verkoop (UK Municipal) opgenomen onder de overige vorderingen en overige schulden.
- Garanties € 123,2 mln; investeringsverplichtingen € 21,4 mln.

Onttrekbaarheid
- DGA-loon € 384.000, € 396.000 en € 408.000 via Renewi Limited (fictief; in de personeelskosten begrepen).
- Dividend: slotdividend 2023/24 € 4,7 mln (uitbetaald 31-7-2024) en interimdividend 2025/26 € 9,0 mln (£ 7,9 mln), verrekend met een vordering op de aandeelhouder die in het boekjaar is ontstaan (rekening-courant; geen kasstroom).
- De geconsolideerde overige reserves zijn negatief (-€ 67,2 mln per 31-3-2026). De enkelvoudige reserves van Renewi Limited (£ 312,4 mln, deelnemingen tegen kostprijs) maken een uitkering juridisch mogelijk, maar de groep heeft haar kasstroom nodig voor investeringen (ruim € 90 mln per jaar) en schuldafbouw. Het dividend is niet uit bestendige winst betaald.
- Het DGA-loon is rekenkundig onttrekbaar; dividend en overwinst niet.`,
  },
  priveTekst: `Conform aangifte IB (jaar): 2025 (fictief)
Eigen woning (adres): Voorbeeldlaan 7, Eindhoven
WOZ-waarde: € 1.285.000
Eigenwoningschuld: € 0  (geldverstrekker: geen)
Box 3 (bezittingen en peildatum): € 10.400.000 per 31-12-2025
Overige schulden: € 0
BKR (zakelijk en privé): geen bijzonderheden
Maandlasten in privé (R/C directie, lening directie, zakelijk krediet): geen; de rekening-courant met Renewi Limited is in 2025 afgewikkeld via het interimdividend.`,
  kredietbestemming: `- Achtergrond (starter, doorstromer, bestaande klant, meeneemregeling): doorstromer; de huidige woning is hypotheekvrij en wordt verkocht.
- Waarvoor is de aanvraag bestemd: aankoop woning in Eindhoven, koopsom € 3.250.000; gevraagde hypotheek € 1.600.000, rest uit eigen middelen (box 3).`,
  conclusie: `Geen inkomen afgegeven
- Motivatie: Renewi Limited voldoet op vier punten niet aan het toetskader. (1) Buitenland: de vennootschap is opgericht naar Schots recht en gevestigd in Edinburgh; ABN AMRO accepteert alleen ondernemingen die gevestigd zijn in Nederland, België, Duitsland of Luxemburg. De uitzondering voor een buitenlandse onderneming (exploitatie vanuit het hoofdverblijf in Nederland, LTV maximaal 85%) is niet aangetoond en lost de andere punten niet op. (2) Positief netto resultaat: 2025/2026 is ook na correcties verlieslatend (-€ 5,1 mln; gerapporteerd -€ 11,8 mln, toe te rekenen aan de aandeelhouder -€ 22,7 mln). (3) Solvabiliteit: aansprakelijk vermogen na aftrek van de immateriële activa 5,8% per 31-3-2026 en negatief in de twee jaren daarvoor. (4) Liquiditeit: current ratio 0,73 (eerder 0,45 en 0,55).
- Onderbouwing: de rekentool berekent € 4.952.867: gemiddeld DGA-loon na bijtelling € 386.200 plus gemiddeld dividend € 4.566.667 (begrensd op de gemiddelde nettowinst na correcties × belang, € 20,9 mln). De toets Woonbeleid komt op € 386.200: het dividend is niet uit bestendige winst betaald (slotdividend € 4,7 mln in 2024/2025, interimdividend € 9,0 mln in 2025/2026, in een verliesjaar en verrekend met een rekening-courantvordering op de aandeelhouder). NHG, ASN Bank, Knab en Optimaal komen op dezelfde punten tot niet akkoord; rekenkundig zou het box 1-inkomen bij NHG € 392.600 en bij Knab € 408.000 zijn, bij ASN Bank en Optimaal € 0 omdat het verlies van 2025/2026 meetelt.`,
  bijlagen: `- Conclusie over de aangeleverde boekhoudgegevens: herpresentaties in Nederlandse indeling van gecontroleerde jaarrekeningen (geconsolideerd IFRS; enkelvoudig IFRS en vanaf 2025/26 FRS 101, in Britse ponden). Controlerend accountant BDO LLP t/m 2024/25, Ernst & Young LLP 2025/26. Op de herpresentaties zelf is geen controle verricht.
- Afwijkingen van de vormvereisten (welke): geen KvK-uittreksel (Britse vennootschap, Companies House); IFRS-waardering; enkelvoudige cijfers in ponden; geen enkelvoudige W&V (section 408 Companies Act).
- Jaarcijfers (jaren) waarop de analyse is gebaseerd: 2023/24, 2024/25 en 2025/26 geconsolideerd; 2022/23 ter informatie.
- Aanwezige IB-aangiften (jaren): nog aan te leveren (fictieve bedragen ingevoerd).
- Onregelmatigheden in de stukken (bijv. aangiften kort na elkaar ingediend): geen; let op de aangepaste vergelijkende cijfers (beëindigde activiteiten 2022/23 en 2023/24, herindeling crediteuren 2024/25).
- Stukkenlijst (alle gebruikte documenten): acht jaarrekeningen (pdf), geconsolideerd en enkelvoudig, 2022/23 t/m 2025/26.`,
  controles: { aflos: 'Ja', ubo: 'Nee', big: 'N.v.t.', lrk: 'N.v.t.', google: 'Ja', kvk: 'N.v.t.', boekhouder: 'Ja', sfh: 'Nee' },
  boekhouder: { optie: '1', lijst: [
    { naam: 'Ernst & Young LLP (controlerend accountant 2025/2026)', kvk: '', raAa: false },
    { naam: 'BDO LLP (controlerend accountant tot en met 2024/2025)', kvk: '', raAa: false },
  ] },
};

const dossier = {
  id: ID, type: 'dossier', nummer: 'ZIB-2026-0103', soort: 'IKV', kader: 'ABN', weergave: 'bzi',
  status: 'beoordeling_1', statusDatum: GEWIJZIGD, niveau: 'Top', behandelaar: 'A. de Groot', advieskantoorId: 'adv_demo_westland',
  label: 'ABN AMRO', afdeling: 'IMV', leningnummer: 'DEMO-100303', via: 'Adviseur',
  aangemaakt: AANGEMAAKT, gewijzigd: GEWIJZIGD, berekeningsdatum: '2026-11-06', datumAanvraag: '2026-11-02', uitersteDatum: '2026-12-02',
  aanvrager: { voorletters: 'R.J.', achternaam: 'Hoogendam', geslacht: 'M', geboortedatum: '1971-03-09', geboorteplaats: 'Tilburg',
    straat: 'Voorbeeldlaan', huisnummer: '7', postcode: '5600 AA', woonplaats: 'Eindhoven', telefoon: '06 00000000', email: 'r.hoogendam@example.nl' },
  instellingen: { laatsteToetsjaar: 2025, controlejaar: true, initieelAantalOndernemingen: 1, box2Route: 'route1',
    abnDividend: { uitgekeerd: true, nietUitgekeerd: false, kasstroomBevestigd: false } },
  loondienst: { meenemen: false, voorStartMeenemen: false },
  ondernemingen: [onderneming],
  ib: {
    2023: { perOnd: { [OND]: { loon: LOON[2023], bijtelling: 9600, dividend: 0 } }, box3: 1850000 },
    2024: { perOnd: { [OND]: { loon: LOON[2024], bijtelling: 9600, dividend: k(4700) } }, box3: 4900000 },
    2025: { perOnd: { [OND]: { loon: LOON[2025], bijtelling: 10200, dividend: k(9000) } }, box3: 10400000 },
  },
  organogram: {
    knopen: [
      { id: 'k_renewi_europe', soort: 'bv', naam: 'Renewi Europe B.V. en groepsmaatschappijen', toelichting: 'Werkmaatschappijen in Nederland en België; geconsolideerd in Renewi Limited' },
      { id: 'k_earth_bidco', soort: 'bv', naam: 'Earth Bidco B.V.', toelichting: 'Macquarie Asset Management en BCI; financier en minderheidsaandeelhouder sinds juni 2025' },
    ],
    lijnen: [
      { id: 'l_renewi_1', van: OND, naar: 'k_renewi_europe', pct: 66.1, soort: 'aandelen' },
      { id: 'l_renewi_2', van: 'k_earth_bidco', naar: 'k_renewi_europe', pct: 33.9, soort: 'aandelen' },
    ],
    situaties: [
      { id: 's_renewi_1', titel: 'Situatie tot en met boekjaar 2024/2025', tekst: 'Hoogendam, R.J.\n    > 100% Renewi Limited (tot juni 2025 Renewi plc)\n        > 100% Renewi Europe B.V. en groepsmaatschappijen (geconsolideerd)\n(tot de verkoop in 2024/2025 ook UK Municipal)' },
    ],
  },
  zk: [
    { id: 'zk_renewi_1', soort: 'lening', kredietgever: 'Earth Bidco B.V.', omschrijving: 'Leningen herfinanciering 2025 (vaste en variabele rente)', ondId: OND,
      maandlast: '', saldo: k(201300), gedragenDoor: 'onderneming', status: 'lopend', afgelostIn: '',
      toelichting: '€ 575,2 mln opgenomen in 2025/2026, € 115,0 mln afgelost. De senior financiering en de convenanten liggen bij Earth Bidco B.V.' },
    { id: 'zk_renewi_2', soort: 'lening', kredietgever: 'Obligatiehouders', omschrijving: 'Groene retailobligatie 3,00%, vervalt juli 2027', ondId: OND,
      maandlast: 121500, saldo: k(48600), gedragenDoor: 'onderneming', status: 'lopend', afgelostIn: '',
      toelichting: 'Van € 125 mln is € 76,3 mln vervroegd afgelost na uitoefening van de put-optie bij wijziging van zeggenschap. Maandlast = rente 3,00% / 12. Niet door zekerheden gedekt; groepsmaatschappijen staan hoofdelijk garant.' },
    { id: 'zk_renewi_3', soort: 'krediet', kredietgever: 'Banken', omschrijving: 'Revolving creditfaciliteit en bankleningen', ondId: OND,
      maandlast: '', saldo: k(19100 + 1200), gedragenDoor: 'onderneming', status: 'lopend', afgelostIn: '',
      toelichting: 'Per 31-3-2026 langlopend € 19,1 mln (vast € 9,9 mln, variabel € 9,2 mln) en kortlopend € 1,2 mln. In 2025/2026 € 512,9 mln afgelost en € 141,5 mln opgenomen.' },
    { id: 'zk_renewi_4', soort: 'lease', kredietgever: 'Diverse lessors', omschrijving: 'Leaseverplichtingen (IFRS 16): voertuigen, terreinen en gebouwen', ondId: OND,
      maandlast: Math.round(k(53700 + 10900) / 12), saldo: k(232900 + 40700), gedragenDoor: 'onderneming', status: 'lopend', afgelostIn: '',
      toelichting: 'Langlopend € 232,9 mln, kortlopend € 40,7 mln. Maandlast = (aflossing € 53,7 mln + rente € 10,9 mln over 2025/2026) / 12.' },
    { id: 'zk_renewi_5', soort: 'borg', kredietgever: 'Banken en borgen', omschrijving: 'Garanties en contragaranties', ondId: OND,
      maandlast: '', saldo: k(123200), gedragenDoor: 'onderneming', status: 'lopend', afgelostIn: '',
      toelichting: 'Afgegeven voor door borgen en banken namens de groep verstrekte zekerheden (vorig jaar € 134,2 mln).' },
  ],
  notities,
  historie: [
    { at: GEWIJZIGD, door: 'A. de Groot', actie: 'Status gewijzigd van "Controleren documenten" naar "1e beoordeling"' },
    { at: '2026-11-02T09:15:00.000Z', door: 'A. de Groot', actie: 'Documenten toegevoegd: acht jaarrekeningen Renewi Limited (2022/2023 t/m 2025/2026)' },
    { at: AANGEMAAKT, door: 'A. de Groot', actie: 'Dossier aangemaakt' },
  ],
};

// De jaarrekeningen zelf zitten niet in de demo; de documentregels laten zien wat aanwezig is.
const DOCS = [
  ['2022', 'geconsolideerd', 1844284], ['2022', 'enkelvoudig', 996095],
  ['2023', 'geconsolideerd', 1922985], ['2023', 'enkelvoudig', 999803],
  ['2024', 'geconsolideerd', 1847539], ['2024', 'enkelvoudig', 1024444],
  ['2025', 'geconsolideerd', 1826331], ['2025', 'enkelvoudig', 1111454],
];

export function renewiRecords() {
  const documenten = DOCS.map(([jaar, soort, grootte]) => ({
    id: `doc_demo_renewi_${jaar}_${soort}`, type: 'document', dossierId: ID, categorie: 'jaarrekening', jaar, ondId: OND,
    naam: `Renewi_jaarrekening_${Number(jaar) + 1}_${soort}.pdf`, mime: 'application/pdf', grootte, opslag: 'demo',
    door: 'A. de Groot', aangemaakt: '2026-11-02T09:15:00.000Z',
  }));
  const taken = [
    { id: 'taak_demo_5', type: 'taak', titel: 'Tussentijdse cijfers boekjaar 2026/2027 (april t/m september 2026) opvragen', dossierId: ID,
      toegewezenAan: 'A. de Groot', deadline: '2026-11-13', status: 'open', door: 'A. de Groot', aangemaakt: GEWIJZIGD },
    { id: 'taak_demo_6', type: 'taak', titel: 'IB-aangiften 2023-2025, loonstroken en het dividendbesluit 2025 opvragen', dossierId: ID,
      toegewezenAan: 'A. de Groot', deadline: '2026-11-13', status: 'open', door: 'A. de Groot', aangemaakt: GEWIJZIGD },
  ];
  return [dossier, ...documenten, ...taken];
}
