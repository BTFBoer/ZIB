// Fictieve demogegevens. Namen, adressen, KvK- en aanvraagnummers en bedragen zijn verzonnen;
// overeenkomsten met bestaande personen of ondernemingen berusten op toeval.
import { balansTotalen } from '../engine/financieel.js';
import { renewiRecords } from './demo-renewi.js';

/** Sluit de balans door het verschil op de opgegeven eigenvermogenpost te boeken. */
function balans(posten, plug = 'evKapitaal') {
  const t = balansTotalen(posten);
  return { ...posten, [plug]: (posten[plug] || 0) + (t.TA - t.TP) };
}

const nu = '2026-09-15T10:00:00.000Z';

function jansen() {
  const jaren = {
    2023: { status: 'definitief',
      vw: { omzet: 182000, inkoopwaarde: 61000, afschrijvingMVA: 6500, autokosten: 7200, huisvesting: 4800,
        algemeneKosten: 12400, kantoorkosten: 2100, financieleLasten: 900 },
      balans: balans({ mvaMachines: 24000, mvaOverig: 18000, voorraden: 9500, debiteuren: 21400, liquideMiddelen: 31200,
        llKrediet: 22000, klCrediteuren: 11300, klOB: 6200, klOverig: 3100 }) },
    2024: { status: 'definitief',
      vw: { omzet: 196500, inkoopwaarde: 66800, afschrijvingMVA: 7100, autokosten: 7600, huisvesting: 5000,
        algemeneKosten: 13100, kantoorkosten: 2200, financieleLasten: 850, bijzondereBaten: 6000 },
      vwDetail: { bijzondereBaten: { boekwinst: 6000 } },
      balans: balans({ mvaMachines: 21500, mvaOverig: 26000, voorraden: 10200, debiteuren: 23900, liquideMiddelen: 36800,
        llKrediet: 18000, klCrediteuren: 12600, klOB: 6900, klOverig: 3300 }) },
    2025: { status: 'definitief',
      vw: { omzet: 204000, inkoopwaarde: 70100, afschrijvingMVA: 7400, autokosten: 7900, huisvesting: 5200,
        algemeneKosten: 13600, kantoorkosten: 2300, financieleLasten: 800 },
      div: { investeringsaftrek: 4500 },
      balans: balans({ mvaMachines: 19000, mvaOverig: 23500, voorraden: 11000, debiteuren: 25300, liquideMiddelen: 41900,
        llKrediet: 14000, klCrediteuren: 13100, klOB: 7300, klOverig: 3400 }),
      balansDetail: { liquideMiddelen: { kas: 400, bank: 41500 } } },
    2026: { status: 'tussentijds', van: '2026-01-01', tot: '2026-06-30',
      vw: { omzet: 101000, inkoopwaarde: 35200, afschrijvingMVA: 3800, autokosten: 4000, huisvesting: 2700,
        algemeneKosten: 6900, kantoorkosten: 1200, financieleLasten: 380 },
      balans: balans({ mvaMachines: 17800, mvaOverig: 22000, voorraden: 11500, debiteuren: 27000, liquideMiddelen: 38600,
        llKrediet: 12000, klCrediteuren: 12900, klOB: 6800, klOverig: 3100 }) },
  };
  return {
    id: 'dos_demo_jansen', type: 'dossier', nummer: 'ZIB-2026-0001', soort: 'IKV', kader: 'NHG',
    status: 'beoordeling_1', statusDatum: '2026-09-14T13:20:00.000Z', niveau: 'Basis', behandelaar: 'A. de Groot', advieskantoorId: 'adv_demo_westland',
    aangemaakt: nu, gewijzigd: nu, berekeningsdatum: '2026-09-15', datumAanvraag: '2026-09-01', uitersteDatum: '2026-09-29',
    label: 'ABN AMRO', leningnummer: 'DEMO-100201', via: 'Adviseur',
    aanvrager: { voorletters: 'P.A.', achternaam: 'Jansen', geslacht: 'M', geboortedatum: '1984-05-12', geboorteplaats: 'Delft',
      straat: 'Voorbeeldstraat', huisnummer: '14', postcode: '1234 AB', woonplaats: 'Delft', telefoon: '06 00000000', email: 'p.jansen@example.nl' },
    instellingen: { laatsteToetsjaar: 2025, controlejaar: true, initieelAantalOndernemingen: 1, box2Route: 'route1' },
    loondienst: { meenemen: false, voorStartMeenemen: true },
    ondernemingen: [{ id: 'ond_jansen', naam: 'Jansen Installatietechniek', rechtsvorm: 'EZ', kvk: '00000101',
      startdatum: '2014-03-01', sbi: '43.22 Loodgieters- en fitterswerk; installatie van sanitair en verwarming', activiteit: 'Installatietechniek',
      land: 'NL', belastingplichtig: 'NL', actief: true, meenemen: true, medewerkers: 1, jaren }],
    ib: {
      2023: { perOnd: { ond_jansen: { sfw: 90200, bijtelling: 3100 } }, box3: 18500 },
      2024: { perOnd: { ond_jansen: { sfw: 103050, bijtelling: 3200 } }, box3: 22400 },
      2025: { perOnd: { ond_jansen: { sfw: 95500, bijtelling: 3300 } }, box3: 26100 },
    },
    zk: [{ id: 'zk_demo_1', soort: 'lease', kredietgever: 'Voorbeeld Lease B.V.', omschrijving: 'Bedrijfsbus', ondId: 'ond_jansen',
      maandlast: 640, saldo: 14800, gedragenDoor: 'onderneming', status: 'lopend', afgelostIn: '' }],
    weergave: 'viiz',
    notities: {
      algemeen: 'Wie is de klant?\nInstallateur (loodgieter/verwarming) sinds 2014, werkt met één vaste zzp\'er.\n\nKernactiviteiten\nOnderhoud en vervanging cv-installaties voor particulieren in de regio.',
      controles: { google: 'Ja', kvk: 'Ja', boekhouder: 'Ja', aflos: 'Ja', ubo: 'N.v.t.', big: 'N.v.t.', lrk: 'N.v.t.' },
      boekhouder: { optie: '1', lijst: [{ naam: 'Administratiekantoor Voorbeeld', kvk: '00000901' }] },
    },
    historie: [{ at: nu, door: 'A. de Groot', actie: 'Dossier aangemaakt' }],
  };
}

function deVries() {
  const vw = (omzet, loon, lonen, soc, afs, huis, auto, alg, kant, fin, vpb) => ({
    omzet, salarisDGA: loon, lonen, socialeLasten: soc, afschrijvingMVA: afs, huisvesting: huis, autokosten: auto,
    algemeneKosten: alg, kantoorkosten: kant, financieleLasten: fin, vpb });
  const jaren = {
    2023: { status: 'definitief', vw: vw(265000, 72000, 62000, 14000, 5200, 18000, 9000, 21000, 6000, 1200, 10754),
      div: { aflossingenLVV: 6000, dividenduitkering: 20000 },
      balans: balans({ mvaOverig: 28000, debiteuren: 41000, vordDGAKort: 12000, liquideMiddelen: 96000, evKapitaal: 18000,
        llKrediet: 24000, klCrediteuren: 18500, klLoonheffing: 6200, klOB: 9800, klVPB: 10754 }, 'evWinstreserve') },
    2024: { status: 'definitief', vw: vw(281000, 75000, 66000, 15000, 5400, 18500, 9400, 22000, 6200, 1100, 11856),
      div: { aflossingenLVV: 6000, dividenduitkering: 25000 },
      balans: balans({ mvaOverig: 29600, debiteuren: 44500, vordDGAKort: 15000, liquideMiddelen: 101000, evKapitaal: 18000,
        llKrediet: 18000, klCrediteuren: 19800, klLoonheffing: 6500, klOB: 10300, klVPB: 11856 }, 'evWinstreserve') },
    2025: { status: 'definitief', vw: vw(298000, 78000, 70000, 16000, 5600, 19000, 9800, 23500, 6400, 1000, 13053),
      div: { aflossingenLVV: 6000, dividenduitkering: 25000 },
      balans: balans({ mvaOverig: 30000, debiteuren: 47200, vordDGAKort: 16500, liquideMiddelen: 109500, evKapitaal: 18000,
        llKrediet: 12000, klCrediteuren: 20900, klLoonheffing: 6900, klOB: 10900, klVPB: 13053 }, 'evWinstreserve') },
    2026: { status: 'tussentijds', van: '2026-01-01', tot: '2026-06-30',
      vw: vw(156000, 40000, 36000, 8200, 2900, 9700, 5000, 12100, 3300, 480, 7281),
      balans: balans({ mvaOverig: 28600, debiteuren: 49000, vordDGAKort: 17000, liquideMiddelen: 98000, evKapitaal: 18000,
        llKrediet: 9000, klCrediteuren: 19000, klLoonheffing: 7100, klOB: 9400, klVPB: 7281 }, 'evWinstreserve') },
  };
  return {
    id: 'dos_demo_devries', type: 'dossier', nummer: 'ZIB-2026-0002', soort: 'IKV', kader: 'ABN',
    status: 'beoordeling_2', statusDatum: '2026-08-21T09:12:00.000Z', niveau: 'Medium', behandelaar: 'A. de Groot', advieskantoorId: 'adv_demo_vandijk',
    label: 'ABN AMRO', afdeling: 'IMV', leningnummer: 'DEMO-100202', via: 'Adviseur', datumAanvraag: '2026-08-12', uitersteDatum: '2026-09-02',
    aangemaakt: nu, gewijzigd: nu, berekeningsdatum: '2026-08-20',
    aanvrager: { voorletters: 'M.', tussenvoegsel: 'de', achternaam: 'Vries', geslacht: 'V', geboortedatum: '1979-11-03',
      geboorteplaats: 'Leiden', straat: 'Voorbeeldlaan', huisnummer: '7', postcode: '2345 CD', woonplaats: 'Leiden', email: 'm.devries@example.nl' },
    instellingen: { laatsteToetsjaar: 2025, controlejaar: true, initieelAantalOndernemingen: 1,
      abnDividend: { uitgekeerd: true, nietUitgekeerd: false, kasstroomBevestigd: false } },
    ondernemingen: [{ id: 'ond_devries', naam: 'De Vries Advies B.V.', rechtsvorm: 'BV', kvk: '00000102', startdatum: '2012-09-01', activiteit: 'Organisatieadvies',
      sbi: '70.22 Organisatie-adviesbureaus', aandeelPct: 100, direct: true, zeggenschap: true, land: 'NL', belastingplichtig: 'NL',
      actief: true, meenemen: true, beroepsgroep: 'overig', jaren }],
    ib: {
      2023: { perOnd: { ond_devries: { loon: 72000, bijtelling: 4500, dividend: 20000 } }, box3: 41000 },
      2024: { perOnd: { ond_devries: { loon: 75000, bijtelling: 4700, dividend: 25000 } }, box3: 48000 },
      2025: { perOnd: { ond_devries: { loon: 78000, bijtelling: 4800, dividend: 25000 } }, box3: 52500 },
      2026: { perOnd: { ond_devries: { loon: 40000, bijtelling: 2400 } } },
    },
    rc: { saldo: 16500, rente: 4, onderDrempel: true },
    fiat: { eerste: { naam: 'A. de Groot', datum: '2026-08-21T09:12:00.000Z', opmerking: 'Berekend inkomen akkoord, zie conclusie.' } },
    notities: {
      algemeen: 'Wie is de klant?\nZelfstandig organisatieadviseur, DGA (100%) van De Vries Advies B.V. sinds 2012.',
      conclusie: 'Berekend inkomen\nHet loon DGA is bestendig en wordt gedragen door een structureel winstgevende onderneming. Dividend is de afgelopen drie jaar jaarlijks uitgekeerd.',
      controles: { google: 'Ja', kvk: 'Ja', boekhouder: 'Ja', aflos: 'Ja', ubo: 'Ja', big: 'N.v.t.', lrk: 'N.v.t.' },
    },
    historie: [
      { at: '2026-08-21T09:12:00.000Z', door: 'A. de Groot', actie: 'Gereed gemeld voor 2e beoordeling' },
      { at: nu, door: 'A. de Groot', actie: 'Dossier aangemaakt' },
    ],
  };
}

function bakker() {
  return {
    id: 'dos_demo_bakker', type: 'dossier', nummer: 'ZIB-2026-0003', soort: 'NUL', kader: 'ABN', status: 'documenten_uploaden', statusDatum: nu,
    niveau: 'Basis', behandelaar: '', advieskantoorId: 'adv_demo_westland', label: 'ABN AMRO', afdeling: 'FMD',
    aangemaakt: nu, gewijzigd: nu, berekeningsdatum: '2026-09-28', datumAanvraag: '2026-09-15', leningnummer: 'DEMO-100203',
    aanvrager: { voorletters: 'S.', achternaam: 'Bakker', geslacht: 'V', geboortedatum: '1992-02-17', woonplaats: 'Utrecht' },
    instellingen: { laatsteToetsjaar: 2025, controlejaar: true, initieelAantalOndernemingen: 1 },
    loondienst: { actueelPct: 100, loonJaar: 52000 },
    ondernemingen: [{ id: 'ond_bakker', naam: 'Bakker Vintage', rechtsvorm: 'EZ', kvk: '00000103', startdatum: '2023-02-01',
      sbi: '47.91.4 Detailhandel via internet in kleding en mode-artikelen', land: 'NL', actief: true, meenemen: false,
      jaren: {
        2024: { vw: { omzet: 1800, inkoopwaarde: 900, algemeneKosten: 1200 } },
        2025: { vw: { omzet: 2400, inkoopwaarde: 1300, algemeneKosten: 1900 } },
      } }],
    ib: { 2025: { perOnd: { ond_bakker: { sfw: -800 } }, box3: 14500 } },
    nul: { borgstelling: { ja: false }, hobbymatig: false },
    zk: [],
    notities: { algemeen: 'Aanvraagster werkt fulltime in loondienst. Kleinschalige webshop naast het werk.' },
    historie: [{ at: nu, door: 'Systeem', actie: 'Dossier aangemaakt' }],
  };
}

function elAmrani() {
  const jaren = {
    2024: { status: 'definitief', van: '2024-04-01', tot: '2024-12-31',
      vw: { omzet: 39000, uitbesteedWerk: 6500, autokosten: 4200, kantoorkosten: 2400, algemeneKosten: 3100, afschrijvingMVA: 1000, financieleLasten: 300 },
      balans: balans({ mvaOverig: 6000, debiteuren: 4200, liquideMiddelen: 8900, klCrediteuren: 1900, klOB: 2300 }) },
    2025: { status: 'definitief',
      vw: { omzet: 74000, uitbesteedWerk: 9800, autokosten: 6100, kantoorkosten: 3300, algemeneKosten: 4800, afschrijvingMVA: 1000, financieleLasten: 200 },
      balans: balans({ mvaOverig: 5000, debiteuren: 6800, liquideMiddelen: 15400, klCrediteuren: 2400, klOB: 2700 }) },
    2026: { status: 'tussentijds', van: '2026-01-01', tot: '2026-06-30',
      vw: { omzet: 39500, uitbesteedWerk: 4600, autokosten: 3200, kantoorkosten: 1700, algemeneKosten: 2600, afschrijvingMVA: 500, financieleLasten: 100, prognose: 52000 },
      balans: balans({ mvaOverig: 4500, debiteuren: 7900, liquideMiddelen: 17300, klCrediteuren: 2600, klOB: 3000 }) },
  };
  return {
    id: 'dos_demo_elamrani', type: 'dossier', nummer: 'ZIB-2026-0004', soort: 'IKV', kader: 'ABN', status: 'informatie_aanleveren', statusDatum: nu,
    niveau: 'Basis', behandelaar: 'A. de Groot', advieskantoorId: 'adv_demo_rijnmond', label: 'ABN AMRO', afdeling: 'RV',
    aangemaakt: nu, gewijzigd: nu, berekeningsdatum: '2026-09-01', datumAanvraag: '2026-08-25', uitersteDatum: '2026-10-02', leningnummer: 'DEMO-100204',
    aanvrager: { voorletters: 'Y.', achternaam: 'El Amrani', geslacht: 'M', geboortedatum: '1990-07-22', woonplaats: 'Rotterdam' },
    instellingen: { laatsteToetsjaar: 2025, controlejaar: true, initieelAantalOndernemingen: 1 },
    ondernemingen: [{ id: 'ond_elamrani', naam: 'YA Bouwadvies', rechtsvorm: 'EZ', kvk: '00000104', startdatum: '2024-04-01', activiteit: 'Bouwadvies',
      sbi: '71.12 Ingenieurs en overig technisch ontwerp en advies', land: 'NL', actief: true, meenemen: true, prognoseRAAA: true, jaren }],
    ib: {
      2024: { perOnd: { ond_elamrani: { sfw: 21500 } }, voorStart: 11200 },
      2025: { perOnd: { ond_elamrani: { sfw: 47800 } } },
    },
    weergave: 'viiz',
    notities: { algemeen: 'Starter: voorheen in loondienst als constructeur bij een ingenieursbureau, sinds april 2024 zelfstandig.' },
    historie: [{ at: nu, door: 'A. de Groot', actie: 'Stukken opgevraagd: prognose 2026 en btw-aangifte Q2' }],
  };
}

function visser() {
  const jaren = {
    2022: { status: 'definitief', vw: { omzet: 168000, inkoopwaarde: 42000, afschrijvingMVA: 9000, autokosten: 11000, algemeneKosten: 18000, financieleLasten: 4000 },
      balans: balans({ mvaMachines: 46000, mvaOverig: 14000, debiteuren: 15800, liquideMiddelen: 19400, llKrediet: 42000, klCrediteuren: 8700, klOB: 4900, klOverig: 2200 }) },
    2023: { status: 'definitief', vw: { omzet: 178000, inkoopwaarde: 44000, afschrijvingMVA: 9000, autokosten: 11500, algemeneKosten: 18500, financieleLasten: 3500 },
      balans: balans({ mvaMachines: 42000, mvaOverig: 18000, debiteuren: 16900, liquideMiddelen: 22800, llKrediet: 36000, klCrediteuren: 9100, klOB: 5200, klOverig: 2300 }) },
    2024: { status: 'definitief', vw: { omzet: 183000, inkoopwaarde: 45500, afschrijvingMVA: 9000, autokosten: 12000, algemeneKosten: 19400, financieleLasten: 3000 },
      balans: balans({ mvaMachines: 38000, mvaOverig: 22000, debiteuren: 18500, liquideMiddelen: 27400, llKrediet: 30000, klCrediteuren: 9800, klOB: 5600, klOverig: 2500 }) },
  };
  return {
    id: 'dos_demo_visser', type: 'dossier', nummer: 'ZIB-2025-0017', soort: 'IKV', kader: 'NHG', status: 'afgerond', statusDatum: '2025-06-12T15:20:00.000Z',
    niveau: 'Basis', behandelaar: 'A. de Groot', fiatteur: 'R. Smit', advieskantoorId: 'adv_demo_vandijk', label: 'ABN AMRO', leningnummer: 'DEMO-090117',
    aangemaakt: '2025-06-10T08:00:00.000Z', gewijzigd: '2025-06-12T15:20:00.000Z', berekeningsdatum: '2025-06-12', datumAanvraag: '2025-06-10',
    aanvrager: { voorletters: 'L.J.', achternaam: 'Visser', geslacht: 'M', geboortedatum: '1981-03-30', woonplaats: 'Gouda' },
    instellingen: { laatsteToetsjaar: 2024, controlejaar: true, initieelAantalOndernemingen: 1 },
    ondernemingen: [{ id: 'ond_visser', naam: 'Visser & Kok Hoveniers', rechtsvorm: 'VOF', kvk: '00000105', startdatum: '2011-01-01', activiteit: 'Hoveniersbedrijf',
      sbi: '81.30 Landschapsverzorging', aandeelPct: 50, land: 'NL', belastingplichtig: 'NL', actief: true, meenemen: true, jaren }],
    ib: {
      2022: { perOnd: { ond_visser: { sfw: 41200 } } },
      2023: { perOnd: { ond_visser: { sfw: 44900 } } },
      2024: { perOnd: { ond_visser: { sfw: 46300 } } },
    },
    nul: { hoofdelijkBeoordeeld: true },
    fiat: {
      eerste: { naam: 'A. de Groot', datum: '2025-06-12T11:02:00.000Z', opmerking: 'Akkoord zakelijk inkomen.' },
      tweede: { naam: 'R. Smit', datum: '2025-06-12T15:20:00.000Z', resultaat: 'akkoord', opmerking: 'Definitief akkoord.' },
    },
    historie: [
      { at: '2025-06-12T15:20:00.000Z', door: 'R. Smit', actie: '2e beoordeling: akkoord' },
      { at: '2025-06-12T11:02:00.000Z', door: 'A. de Groot', actie: 'Gereed gemeld voor 2e beoordeling' },
    ],
  };
}

/**
 * Holdingstructuur volgens de werkwijze in de rekentool van de bank (totaalposten per jaar):
 *   T. van Dalen
 *     > 100% Dalenburg Holding B.V.
 *         > 30% Polder Groep B.V.  (ook 30% via TVD Beheer B.V.; 40% bij Kade Holding B.V.)
 *             > 100% Polder Techniek B.V.
 *             > 100% Polder Service B.V.
 *     > 100% TVD Beheer B.V. (0-inkomen: alleen risicobeoordeling)
 * Kade Holding B.V. (medeaandeelhouder) is ondergebracht in een STAK met twee certificaathouders.
 * De holding neemt overwinst mee met de dubbele balanstoets. Alle namen en bedragen zijn fictief.
 */
function vanDalen() {
  const j = (status, bzi, extra = {}) => ({ status, bzi, ...extra });
  const holding = {
    id: 'ond_dalen_holding', naam: 'Dalenburg Holding B.V.', rechtsvorm: 'BV', activiteit: 'Holding', kvk: '00000111', startdatum: '2016-02-01',
    aandeelPct: 100, direct: true, zeggenschap: true, land: 'NL', belastingplichtig: 'NL', actief: true, meenemen: true, beroepsgroep: 'overig',
    sbi: '64.21 Financiële holdings',
    overwinst: { meenemen: true, kasstroomBevestigd: true },
    jaren: {
      2023: j('definitief', { omzet: 84000, nettowinst: 205000, ev: 820000, bt: 1240000, va: 310000, kvv: 95000 }, {
        vermogensCorrecties: [{ type: 'leningDirectie', bedrag: 120000, toelichting: 'Lening u/g aan DGA (eigen woning)' }],
        geldstromen: { ontvangenFee: { ond_polder_groep: 84000 }, ontvangenDividend: { ond_polder_groep: 120000 } } }),
      2024: j('definitief', { omzet: 88000, nettowinst: 236000, ev: 1010000, bt: 1390000, va: 365000, kvv: 102000 }, {
        vermogensCorrecties: [{ type: 'leningDirectie', bedrag: 118000, toelichting: 'Lening u/g aan DGA (eigen woning)' }],
        geldstromen: { ontvangenFee: { ond_polder_groep: 88000 }, ontvangenDividend: { ond_polder_groep: 150000 }, dividendDGA: 40000 } }),
      2025: j('definitief', { omzet: 92000, nettowinst: 214000, ev: 1160000, bt: 1520000, va: 402000, kvv: 260000,
        vaDetail: { vorderingen: 117500, rcDirectie: 14500, liquide: 270000 } }, {
        vermogensCorrecties: [{ type: 'leningDirectie', bedrag: 116000, toelichting: 'Lening u/g aan DGA (eigen woning)' }],
        geldstromen: { ontvangenFee: { ond_polder_groep: 90500 }, ontvangenDividend: { ond_polder_groep: 135000 }, nogTeOntvangenDividend: 45000, dividendDGA: 60000 } }),
      2026: j('tussentijds', { omzet: 47000, nettowinst: 66000, ev: 1196000, bt: 1548000, va: 420000, kvv: 250000 }, { van: '2026-01-01', tot: '2026-06-30' }),
    },
  };
  const groep = {
    id: 'ond_polder_groep', naam: 'Polder Groep B.V.', rechtsvorm: 'BV', activiteit: 'Tussenholding', kvk: '00000112', startdatum: '2009-05-01',
    parentId: holding.id, aandeelPct: 30, extraParents: [{ id: 'ond_tvd_beheer', pct: 30 }], direct: false, land: 'NL', actief: true, meenemen: true,
    jaren: {
      2023: j('definitief', { omzet: 260000, nettowinst: 410000, ev: 1450000, bt: 2300000, va: 640000, kvv: 380000, managementFee: 84000, internDividend: 400000 }, {
        geldstromen: { ontvangenFee: { ond_polder_techniek: 180000, ond_polder_service: 80000 }, ontvangenDividend: { ond_polder_techniek: 300000, ond_polder_service: 0 } } }),
      2024: j('definitief', { omzet: 275000, nettowinst: 520000, ev: 1700000, bt: 2520000, va: 702000, kvv: 395000, managementFee: 88000, internDividend: 500000 }, {
        geldstromen: { ontvangenFee: { ond_polder_techniek: 190000, ond_polder_service: 85000 }, ontvangenDividend: { ond_polder_techniek: 350000, ond_polder_service: 20000 } } }),
      2025: j('definitief', { omzet: 290000, nettowinst: 470000, ev: 1880000, bt: 2710000, va: 760000, kvv: 410000, managementFee: 92000, internDividend: 450000 }, {
        geldstromen: { ontvangenFee: { ond_polder_techniek: 200000, ond_polder_service: 90000 }, ontvangenDividend: { ond_polder_techniek: 300000, ond_polder_service: 20000 } } }),
      2026: j('tussentijds', { omzet: 146000, nettowinst: 92000, ev: 1972000, bt: 2780000, va: 790000, kvv: 405000, managementFee: 47000 }, { van: '2026-01-01', tot: '2026-06-30' }),
    },
  };
  const techniek = {
    id: 'ond_polder_techniek', naam: 'Polder Techniek B.V.', rechtsvorm: 'BV', activiteit: 'Installatietechniek', kvk: '00000113', startdatum: '2009-05-01',
    parentId: groep.id, aandeelPct: 100, direct: false, land: 'NL', actief: true, meenemen: true, medewerkers: 30,
    sbi: '43.22 Loodgieters- en fitterswerk; installatie van sanitair en verwarming',
    jaren: {
      2023: j('definitief', { omzet: 4200000, nettowinst: 380000, ev: 1100000, bt: 2600000, va: 1900000, kvv: 1350000, managementFee: 180000, internDividend: 300000 }),
      2024: j('definitief', { omzet: 4650000, nettowinst: 455000, ev: 1260000, bt: 2850000, va: 2050000, kvv: 1420000, managementFee: 190000, internDividend: 350000,
        vaDetail: { voorraden: 205000, vorderingen: 1270000, liquide: 575000, nietVrij: 15800 } }, {
        winstCorrecties: [{ type: 'incidenteleBaat', bedrag: 18500, toelichting: 'Boekwinst verkoop bedrijfswagens' }] }),
      2025: j('definitief', { omzet: 4980000, nettowinst: 498000, ev: 1420000, bt: 3050000, va: 2240000, kvv: 1480000, managementFee: 200000, internDividend: 300000,
        vaDetail: { voorraden: 220000, vorderingen: 1380000, liquide: 640000, nietVrij: 22400 } }, {
        winstCorrecties: [{ type: 'incidenteleBaat', bedrag: 6200, toelichting: 'Boekwinst verkoop gereedschap' }] }),
      2026: j('tussentijds', { omzet: 2410000, nettowinst: 228000, ev: 1480000, bt: 3120000, va: 2300000, kvv: 1510000, managementFee: 100000 }, { van: '2026-01-01', tot: '2026-06-30' }),
    },
  };
  const service = {
    id: 'ond_polder_service', naam: 'Polder Service B.V.', rechtsvorm: 'BV', activiteit: 'Onderhoud en service', kvk: '00000114', startdatum: '2018-01-01',
    parentId: groep.id, aandeelPct: 100, direct: false, land: 'NL', actief: true, meenemen: true, medewerkers: 9,
    jaren: {
      2023: j('definitief', { omzet: 980000, nettowinst: 42000, ev: 95000, bt: 520000, va: 330000, kvv: 345000, managementFee: 80000, internDividend: 0 }),
      2024: j('definitief', { omzet: 1040000, nettowinst: 61000, ev: 140000, bt: 560000, va: 365000, kvv: 352000, managementFee: 85000, internDividend: 20000 }),
      2025: j('definitief', { omzet: 1120000, nettowinst: 74000, ev: 190000, bt: 610000, va: 400000, kvv: 360000, managementFee: 90000, internDividend: 20000 }),
      2026: j('tussentijds', { omzet: 590000, nettowinst: 41000, ev: 231000, bt: 640000, va: 428000, kvv: 371000, managementFee: 46000 }, { van: '2026-01-01', tot: '2026-06-30' }),
    },
  };
  const tvd = {
    id: 'ond_tvd_beheer', naam: 'TVD Beheer B.V.', rechtsvorm: 'BV', activiteit: 'Holding', kvk: '00000115', startdatum: '2019-07-01',
    aandeelPct: 100, direct: true, land: 'NL', actief: true, meenemen: true, nulInkomen: true,
    jaren: {
      2023: j('definitief', { omzet: 0, nettowinst: 118000, ev: 400000, bt: 410000, va: 60000, kvv: 10000 }, { geldstromen: { ontvangenDividend: { ond_polder_groep: 120000 } } }),
      2024: j('definitief', { omzet: 0, nettowinst: 148000, ev: 520000, bt: 530000, va: 75000, kvv: 10000 }, { geldstromen: { ontvangenDividend: { ond_polder_groep: 150000 } } }),
      2025: j('definitief', { omzet: 0, nettowinst: 133000, ev: 640000, bt: 652000, va: 98000, kvv: 12000 }, { geldstromen: { ontvangenDividend: { ond_polder_groep: 135000 } } }),
    },
  };
  return {
    id: 'dos_demo_vandalen', type: 'dossier', nummer: 'ZIB-2026-0005', soort: 'IKV', kader: 'ABN', weergave: 'bzi',
    status: 'beoordeling_1', statusDatum: '2026-09-10T11:45:00.000Z', niveau: 'Top', behandelaar: 'A. de Groot', advieskantoorId: 'adv_demo_westland',
    label: 'ABN AMRO', afdeling: 'IMV', leningnummer: 'DEMO-100205', via: 'Adviseur', spoed: true, bestaandeRelatie: true, relatienummer: 'DEMO-77001',
    aangemaakt: nu, gewijzigd: nu, berekeningsdatum: '2026-09-10', datumAanvraag: '2026-09-03', uitersteDatum: '2026-10-09',
    aanvrager: { voorletters: 'T.', tussenvoegsel: 'van', achternaam: 'Dalen', geslacht: 'M', geboortedatum: '1981-06-14',
      straat: 'Voorbeeldkade', huisnummer: '21', postcode: '8000 AA', woonplaats: 'Zwolle' },
    instellingen: { laatsteToetsjaar: 2025, controlejaar: true, initieelAantalOndernemingen: 5,
      abnDividend: { uitgekeerd: true, nietUitgekeerd: false, kasstroomBevestigd: false } },
    ondernemingen: [holding, groep, techniek, service, tvd],
    organogram: {
      knopen: [
        { id: 'k_kade', soort: 'bv', naam: 'Kade Holding B.V.', toelichting: 'Medeaandeelhouder' },
        { id: 'k_stak', soort: 'stak', naam: 'Stichting Administratiekantoor Kade', toelichting: 'Bestuurder: M. Kade' },
        { id: 'k_mkade', soort: 'persoon', naam: 'M. Kade', toelichting: 'Certificaathouder' },
        { id: 'k_lkade', soort: 'persoon', naam: 'L. Kade', toelichting: 'Certificaathouder' },
      ],
      lijnen: [
        { id: 'l1', van: 'k_kade', naar: 'ond_polder_groep', pct: 40, soort: 'aandelen' },
        { id: 'l2', van: 'k_stak', naar: 'k_kade', pct: 100, soort: 'aandelen' },
        { id: 'l3', van: 'k_mkade', naar: 'k_stak', pct: 50, soort: 'certificaten' },
        { id: 'l4', van: 'k_lkade', naar: 'k_stak', pct: 50, soort: 'certificaten' },
      ],
      situaties: [
        { id: 's1', titel: 'Situatie tot en met 2017', tekst: 'Dalen, T. van\n    > 100% Dalenburg Holding B.V.\n        > 50% Polder Groep B.V.\n            > 100% Polder Techniek B.V.\n(Polder Service B.V. opgericht in 2018; TVD Beheer B.V. opgericht in 2019 en kocht daarna 30% van Polder Groep B.V.)' },
      ],
    },
    geldstromenExtra: [
      { id: 'gs_demo_1', van: 'ond_polder_groep', naar: 'k_kade', soort: 'fee', toelichting: 'Management fee aan de medeaandeelhouder; ontvanger volgens jaarrekening Kade Holding',
        perJaar: { 2024: { van: 35000, naar: 35000 }, 2025: { van: 36000, naar: 34500 } } },
      { id: 'gs_demo_2', van: 'ond_polder_techniek', naar: 'ond_polder_service', soort: 'rc', toelichting: 'Rekening-courant tussen de werkmaatschappijen',
        perJaar: { 2024: { van: 100000, naar: 100000 }, 2025: { van: 103000, naar: 103000 } } },
    ],
    ib: {
      2023: { perOnd: { ond_dalen_holding: { loon: 66000, bijtelling: 3600, dividend: 0 } }, box3: 35000 },
      2024: { perOnd: { ond_dalen_holding: { loon: 69000, bijtelling: 3700, dividend: 40000 } }, box3: 52000 },
      2025: { perOnd: { ond_dalen_holding: { loon: 72000, bijtelling: 3900, dividend: 60000 } }, box3: 74000 },
      2026: { perOnd: { ond_dalen_holding: { loon: 38880, bijtelling: 1950 } } },
    },
    salarisStrook: { ond_dalen_holding: { jaar: 2026, maandsalaris: 6000, vakantiegeldPct: 8, dertiendeMaand: false, maanden: 6, strookTm: '08-2026',
      f: '6.000 × 12 × 1,08 / 12 × 6 = 38.880', bedrag: 38880 } },
    leningDirectie: { ondId: 'ond_dalen_holding', hoofdsom: 120000, rente: 3.4, looptijdMnd: 360, ingangsdatum: '2023-01-01', hypothecair: true,
      toelichting: 'Annuïtaire lening van de holding voor de eigen woning, hypothecaire zekerheid.' },
    zk: [
      { id: 'zk_demo_2', soort: 'lease', kredietgever: 'Voorbeeld Lease B.V.', omschrijving: 'Bedrijfswagens (4 contracten)', ondId: 'ond_polder_techniek',
        maandlast: 2850, saldo: null, gedragenDoor: 'onderneming', status: 'afgelost', afgelostIn: '2025', toelichting: 'Alle contracten in 2025 volledig afgelost' },
      { id: 'zk_demo_3', soort: 'krediet', kredietgever: 'Huisbank', omschrijving: 'Rekening-courantkrediet', ondId: 'ond_polder_techniek',
        maandlast: 0, saldo: 0, gedragenDoor: 'onderneming', status: 'lopend', afgelostIn: '', toelichting: 'Limiet € 250.000, per ultimo 2025 niet opgenomen' },
    ],
    notities: {
      algemeen: 'Wie is de klant?\nDGA van een installatiegroep met twee persoonlijke holdings; via beide holdings samen 60% van de tussenholding.\n\nBijzonderheden\nTVD Beheer B.V. wordt niet meegenomen voor het inkomen (0-inkomen), alleen in de risicobeoordeling.',
      financieelOnderneming: {
        ond_polder_techniek: 'Balans\n- Liquide middelen deels niet ter vrije beschikking (G-rekening), gecorrigeerd op de vlottende activa.\n\nWinst- en verliesrekening\n- Boekwinsten op de verkoop van bedrijfswagens als incidentele baat gecorrigeerd.',
      },
      priveTekst: 'Conform aangifte IB (jaar): 2025\nEigen woning (adres): Voorbeeldkade 21\nWOZ-waarde: € 465.000\nEigenwoningschuld: € 120.000  (geldverstrekker: Dalenburg Holding B.V., lening directie)\nBox 3 (bezittingen en peildatum): € 74.000 per 31-12-2025\nOverige schulden: € 0\nBKR (zakelijk en privé): geen bijzonderheden\nMaandlasten in privé (R/C directie, lening directie, zakelijk krediet): lening directie zie berekening',
      boekhouder: { optie: '1', lijst: [{ naam: 'Accountantskantoor Voorbeeld', kvk: '00000902', raAa: true }] },
      controles: { google: 'Ja', kvk: 'Ja', boekhouder: 'Ja', aflos: 'Ja', ubo: 'Ja', big: 'N.v.t.', lrk: 'N.v.t.' },
    },
    historie: [
      { at: '2026-09-10T11:45:00.000Z', door: 'A. de Groot', actie: 'Status gewijzigd van "Controleren documenten" naar "1e beoordeling"' },
      { at: '2026-09-03T09:00:00.000Z', door: 'A. de Groot', actie: 'Dossier aangemaakt' },
    ],
  };
}

// Knab: zelfstandig fotograaf met een beletperiode (zwangerschaps- en bevallingsverlof) in 2024.
function mulder() {
  const vw = (omzet, uitbesteed, auto, kantoor, alg, afs) => ({ omzet, uitbesteedWerk: uitbesteed, autokosten: auto, kantoorkosten: kantoor, algemeneKosten: alg, afschrijvingMVA: afs });
  const jaren = {
    2023: { status: 'definitief', vw: vw(98000, 18000, 6200, 4300, 13500, 4000),
      balans: balans({ mvaOverig: 14000, debiteuren: 8600, liquideMiddelen: 21500, klCrediteuren: 3900, klOB: 4100 }) },
    2024: { status: 'definitief', vw: vw(68000, 11000, 5900, 4100, 12000, 4000),
      balans: balans({ mvaOverig: 10000, debiteuren: 6100, liquideMiddelen: 19800, klCrediteuren: 3300, klOB: 2900 }) },
    2025: { status: 'definitief', vw: vw(103000, 19500, 6400, 4500, 13600, 4000),
      balans: balans({ mvaOverig: 16000, debiteuren: 9900, liquideMiddelen: 25400, klCrediteuren: 4200, klOB: 4500 }) },
    2026: { status: 'tussentijds', van: '2026-01-01', tot: '2026-06-30',
      vw: vw(54000, 10200, 3300, 2300, 7000, 2000),
      balans: balans({ mvaOverig: 14000, debiteuren: 10400, liquideMiddelen: 27800, klCrediteuren: 4300, klOB: 4700 }) },
  };
  return {
    id: 'dos_demo_mulder', type: 'dossier', nummer: 'ZIB-2026-0101', soort: 'IKV', kader: 'KNAB',
    status: 'beoordeling_1', statusDatum: nu, niveau: 'Basis', behandelaar: 'A. de Groot', advieskantoorId: 'adv_demo_vandijk',
    aangemaakt: nu, gewijzigd: nu, berekeningsdatum: '2026-09-15', datumAanvraag: '2026-09-08', uitersteDatum: '2026-10-06',
    label: 'Knab', leningnummer: 'DEMO-100301', via: 'Adviseur',
    aanvrager: { voorletters: 'R.', achternaam: 'Mulder', geslacht: 'V', geboortedatum: '1989-10-04', woonplaats: 'Amersfoort' },
    instellingen: { controlejaar: true, initieelAantalOndernemingen: 1, box2Route: 'route1',
      belet: { actief: true, jaar: 2024, oorzaak: 'Zwangerschaps- en bevallingsverlof (16 weken)',
        motivatie: 'Verklaring boekhouder: omzetdaling 2024 volledig door verlof van april t/m juli; tussentijdse cijfers 2026 (6 maanden) en btw-aangiften Q1-Q2 tonen herstel naar het niveau van 2023 en 2025.' } },
    loondienst: { meenemen: false, voorStartMeenemen: true },
    ondernemingen: [{ id: 'ond_mulder', naam: 'Mulder Fotografie', rechtsvorm: 'EZ', kvk: '00000301', startdatum: '2016-03-01',
      sbi: '74.20 Fotografie', activiteit: 'Fotografie', land: 'NL', belastingplichtig: 'NL', actief: true, meenemen: true, medewerkers: 0, jaren }],
    ib: {
      2023: { perOnd: { ond_mulder: { sfw: 52000 } } },
      2024: { perOnd: { ond_mulder: { sfw: 31000 } } },
      2025: { perOnd: { ond_mulder: { sfw: 55000 } } },
    },
    weergave: 'viiz',
    notities: { algemeen: 'Fictief voorbeeld. Zelfstandig fotograaf (portret en bedrijfsreportages) sinds 2016. In 2024 vier maanden verlof rond de geboorte van het eerste kind; Knab D.1 (beletperiode) is toegepast.' },
    historie: [{ at: nu, door: 'A. de Groot', actie: 'Dossier aangemaakt' }],
  };
}

// Holding met een minderheidsbelang (25%) dat structureel dividend uitkeert: Optimaal telt het ontvangen dividend
// (met trackrecord, tot de winst van de deelneming) en de eigen winst van de holding naar belang.
function deWit() {
  const hold = (nw, ev, bt, va, kvv) => ({ omzet: 80000, nettowinst: nw, ev, bt, va, kvv, managementFee: 0 });
  const groep = (nw, div) => ({ omzet: 4200000, nettowinst: nw, ev: 1600000, bt: 2600000, va: 1500000, kvv: 700000, managementFee: 80000, internDividend: div });
  return {
    id: 'dos_demo_dewit', type: 'dossier', nummer: 'ZIB-2026-0102', soort: 'IKV', kader: 'OPT',
    status: 'beoordeling_1', statusDatum: nu, niveau: 'Top', behandelaar: 'A. de Groot', advieskantoorId: 'adv_demo_rijnmond',
    aangemaakt: nu, gewijzigd: nu, berekeningsdatum: '2026-09-15', datumAanvraag: '2026-09-09', uitersteDatum: '2026-10-07',
    label: 'Overig', leningnummer: 'DEMO-100302', via: 'Adviseur',
    aanvrager: { voorletters: 'K.', tussenvoegsel: 'de', achternaam: 'Wit', geslacht: 'M', geboortedatum: '1977-01-19', woonplaats: 'Apeldoorn' },
    instellingen: { controlejaar: false, initieelAantalOndernemingen: 2, box2Route: 'route1' },
    loondienst: { meenemen: false, voorStartMeenemen: true },
    ondernemingen: [
      { id: 'ond_dewit_beheer', naam: 'De Wit Beheer B.V.', rechtsvorm: 'BV', activiteit: 'Holding (managementdiensten)', kvk: '00000302',
        startdatum: '2015-01-01', aandeelPct: 100, direct: true, land: 'NL', actief: true, meenemen: true,
        jaren: {
          2023: { status: 'definitief', bzi: hold(112000, 230000, 250000, 150000, 20000), geldstromen: { ontvangenDividend: { ond_rijnstad: 100000 }, ontvangenFee: { ond_rijnstad: 80000 } } },
          2024: { status: 'definitief', bzi: hold(136000, 255000, 275000, 170000, 20000), geldstromen: { ontvangenDividend: { ond_rijnstad: 125000 }, ontvangenFee: { ond_rijnstad: 80000 } } },
          2025: { status: 'definitief', bzi: hold(138000, 260000, 280000, 180000, 20000), geldstromen: { ontvangenDividend: { ond_rijnstad: 125000 }, ontvangenFee: { ond_rijnstad: 80000 } } },
        } },
      { id: 'ond_rijnstad', naam: 'Rijnstad Techniek Groep B.V.', rechtsvorm: 'BV', activiteit: 'Technische installaties', kvk: '00000303',
        startdatum: '2008-06-01', parentId: 'ond_dewit_beheer', aandeelPct: 25, direct: false, land: 'NL', actief: true, meenemen: true,
        jaren: {
          2023: { status: 'definitief', bzi: groep(520000, 400000) },
          2024: { status: 'definitief', bzi: groep(560000, 500000) },
          2025: { status: 'definitief', bzi: groep(600000, 500000) },
        } },
    ],
    ib: {
      2023: { perOnd: { ond_dewit_beheer: { loon: 55000, dividend: 60000 } } },
      2024: { perOnd: { ond_dewit_beheer: { loon: 56000, dividend: 80000 } } },
      2025: { perOnd: { ond_dewit_beheer: { loon: 58000, dividend: 90000 } } },
    },
    organogram: { knopen: [{ id: 'k_partners', soort: 'bv', naam: 'Drie medeaandeelhouders (elk 25%)', toelichting: 'Holdings van de andere directeuren' }],
      lijnen: [{ van: 'k_partners', naar: 'ond_rijnstad', pct: 75 }] },
    weergave: 'viiz',
    notities: { algemeen: 'Fictief voorbeeld. Directeur via zijn holding voor 25% aandeelhouder in een installatiegroep met vier gelijke aandeelhouders; de groep keert al jaren het grootste deel van de winst uit. Vergelijk de kaders: NHG en ABN AMRO (berekend) tellen alleen het dividend aan de DGA, ABN AMRO met de holdingroute en Optimaal het dividend dat de holding ontvangt.' },
    historie: [{ at: nu, door: 'A. de Groot', actie: 'Dossier aangemaakt' }],
  };
}

const sector = { sector: 'toegestaan' };
const achmea = { ...sector, gelijkeActiviteiten: true, bijtellingGecontroleerd: true, balansBeoordeeld: true };
const beleidsvoorbeelden = [
  ['VENN', 'Venn', '0110', { ...sector, bronVersie: '2026-07', faillissement: 'nee', verhuurInOnderneming: 'nee' }],
  ['ING', 'ING', '0111', { ondernemersduur: 'drie' }],
  ['RABO', 'Rabobank', '0112', { raboRoute: 'ikv', raboKanaal: 'intermediair' }, 90500],
  ['NIBC', 'NIBC', '0113', { nibcMethode: 'gewogen', nibcAanboddatum: '2026-09-15' }, 93500],
  ['ATTENS', 'Attens', '0114', achmea],
  ['SYNTRUS', 'Syntrus Achmea', '0115', { ...achmea, kanaal: 'direct', raadhuys: false }],
  ['LLOYDS', 'Lloyds Bank', '0116', { ...sector, balansBeoordeeld: true }, 94000],
  ['MUNT', 'MUNT Hypotheken', '0117', { ...sector, bestaandeMunt: false }, 91500],
  ['MERIUS', 'Merius Hypotheken', '0118', {}, 92000],
  ['NN', 'Nationale-Nederlanden', '0119', {}, 95000],
  ['ASR', 'a.s.r.', '0120', {}, 89750],
  ['BIJBOUWE', 'bijBouwe Basis', '0121', { ...sector, toetreding: false }, 90000],
  ['DYNAMIC', 'Dynamic Verhuurhypotheek', '0122', { ...sector, verhuurDoel: true, toetreding: false, actueelJaarinkomen: 97500 }, 90500],
  ['BUNQ', 'bunq Easy Mortgage', '0123', { ...sector, gewogen: true }, 96000],
  ['TULP', 'Tulp Hypotheek', '0124', { ...sector, actueelJaarinkomen: 52500 }, 42500],
];

function voorbeeldTulp() {
  const dossier = elAmrani();
  const [onderneming] = dossier.ondernemingen;
  onderneming.startdatum = '2025-01-01';
  delete onderneming.jaren[2024];
  dossier.ib[2023] = { voorStart: 38000 };
  dossier.ib[2024] = { voorStart: 42000 };
  return dossier;
}

function oefenverklaring(bedrag) {
  return { bedrag, datum: '2026-08-25', opsteller: 'Fictieve rekenexpert' };
}

function maakBeleidsvoorbeeld([kader, label, nummer, invoer, oefenbedrag]) {
  const analyse = kader === 'ANALYSE';
  const sjabloon = kader === 'TULP' ? voorbeeldTulp() : jansen();
  const beleidsinvoer = analyse
    ? Object.fromEntries(beleidsvoorbeelden.map(([id, , , velden]) => [id, id === 'TULP' ? { ...sector } : { ...velden }]))
    : { [kader]: { ...invoer } };
  // Oefenverklaringen zijn weergavedata. De rekenkern ontvangt ze nooit als externe bewijsinvoer.
  const oefenverklaringen = analyse
    ? Object.fromEntries(beleidsvoorbeelden.filter(([, , , , bedrag]) => bedrag !== undefined)
      .map(([id, , , , bedrag]) => [id, oefenverklaring(id === 'TULP' ? 92000 : bedrag)]))
    : oefenbedrag === undefined ? {} : { [kader]: oefenverklaring(oefenbedrag) };
  let toelichting = 'Vergelijk de beleidsroute, cijferuitkomst en gevraagde onderbouwing.';
  if (analyse) toelichting = 'Vergelijk alle kaders met dezelfde ingevoerde cijfers. Een oefenverklaring simuleert de externe route.';
  if (kader === 'TULP') toelichting = 'De ondernemer begon in januari 2025. Gebruik voor 2023 en 2024 het loon vóór de start en voor 2025 de fiscale winst.';
  if (kader === 'ASR' || kader === 'BIJBOUWE') toelichting = 'Vergelijk de indicatie op NHG-grondslag met het bedrag in de fictieve verklaring. Een rekenexpert stelt het formele inkomen vast.';
  return {
    ...sjabloon,
    id: `dos_demo_beleid_${kader.toLowerCase()}`,
    nummer: `ZIB-2026-${nummer}`,
    kader: analyse ? 'NHG' : kader,
    soort: analyse ? 'ANALYSE' : 'IKV',
    demo: true,
    label,
    status: 'beoordeling_1',
    aanvrager: { voorletters: 'T.', achternaam: `Voorbeeld ${label}` },
    leningnummer: `DEMO-${nummer}`,
    uitersteDatum: '',
    beleidsinvoer,
    oefenverklaringen,
    ...(kader === 'RABO' || analyse ? { berekeningsdatum: '2026-11-13' } : {}),
    notities: { algemeen: `Fictieve oefencasus. ${toelichting}` },
  };
}

const analyseVoorbeeld = ['ANALYSE', 'Inkomensanalyse', '0125'];

export function beleidsvoorbeeldVoor(kader) {
  const voorbeeld = kader === 'ANALYSE' ? analyseVoorbeeld : beleidsvoorbeelden.find(([id]) => id === kader);
  return voorbeeld ? maakBeleidsvoorbeeld(voorbeeld) : null;
}

export function beleidVoorbeelden() {
  return [...beleidsvoorbeelden, analyseVoorbeeld].map(maakBeleidsvoorbeeld);
}

export function demoRecords() {
  return [
    { id: 'adv_demo_westland', type: 'advieskantoor', naam: 'Hypotheekhuis Voorbeeld', afm: '12000001', contactpersoon: 'J. van Leeuwen', email: 'info@hypotheekhuis.example', telefoon: '0100 000000', plaats: 'Naaldwijk', aangemaakt: nu },
    { id: 'adv_demo_vandijk', type: 'advieskantoor', naam: 'Van Dijk Financieel Advies (demo)', afm: '12000002', contactpersoon: 'E. van Dijk', email: 'advies@vandijk.example', telefoon: '0100 000001', plaats: 'Leiden', aangemaakt: nu },
    { id: 'adv_demo_rijnmond', type: 'advieskantoor', naam: 'Rijnmond Hypotheken (demo)', afm: '12000003', contactpersoon: 'K. Bos', email: 'kantoor@rijnmond.example', telefoon: '0100 000002', plaats: 'Rotterdam', aangemaakt: nu },
    vanDalen(), jansen(), deVries(), bakker(), elAmrani(), visser(), mulder(), deWit(), ...renewiRecords(), ...beleidVoorbeelden(),
    { id: 'taak_demo_1', type: 'taak', titel: 'Btw-aangifte Q2 2026 opvragen', dossierId: 'dos_demo_elamrani', toegewezenAan: 'A. de Groot', deadline: '2026-10-07', status: 'open', door: 'A. de Groot', aangemaakt: nu },
    { id: 'taak_demo_2', type: 'taak', titel: '2e beoordeling uitvoeren', dossierId: 'dos_demo_devries', toegewezenAan: 'R. Smit', deadline: '2026-10-03', status: 'open', door: 'A. de Groot', aangemaakt: nu },
    { id: 'taak_demo_3', type: 'taak', titel: 'Google check en KvK-adrescheck vastleggen', dossierId: 'dos_demo_bakker', toegewezenAan: 'A. de Groot', deadline: '2026-10-05', status: 'open', door: 'A. de Groot', aangemaakt: nu },
    { id: 'taak_demo_4', type: 'taak', titel: 'Verschil management fee 2025 (holding) toelichten', dossierId: 'dos_demo_vandalen', toegewezenAan: 'A. de Groot', deadline: '2026-10-08', status: 'open', door: 'A. de Groot', aangemaakt: nu },
    { id: 'tkt_demo_1', type: 'ticket', onderwerp: 'Toetsjaar wijzigen na 1 juli', bericht: 'Kan ik bij ABN AMRO in juli nog met 2022-2024 rekenen als de aangifte 2025 nog niet is ingediend?', status: 'open', door: 'A. de Groot', aangemaakt: nu, reacties: [] },
  ];
}
