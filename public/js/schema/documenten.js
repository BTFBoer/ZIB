// Benodigde stukken, afgeleid van de dossiersituatie. "categorie" koppelt een geüpload document
// aan een regel van de lijst, zodat het tabblad Documenten kan tonen wat nog ontbreekt.

export const CATEGORIEEN = {
  kvk: 'Uittreksel KvK',
  ib_aangifte: 'IB-aangifte',
  ib_aanslag: 'IB-aanslag',
  vgi: 'Verklaring geregistreerd inkomen (Belastingdienst)',
  jaarrekening: 'Jaarrekening',
  tussentijds: 'Tussentijdse cijfers (balans en W&V)',
  ob_aangifte: 'Aangifte omzetbelasting',
  prognose: 'Prognose (RA/AA)',
  werkgeversverklaring: 'Werkgeversverklaring',
  loonstrook: 'Loonstrook',
  loonstrook_dec: 'Loonstrook december laatste jaar',
  uwv: 'UWV verzekeringsbericht',
  organogram: 'Organogram',
  woz: 'WOZ-beschikking / taxatierapport zakelijk pand',
  box3: 'Bankafschrift box 3 vermogen',
  beroepsregister: 'Uittreksel beroepsregister (BIG/NBA/NOvA/KNB)',
  rc_verklaring: 'Verklaring saldo en rente rekening-courant directie',
  kredietovereenkomst: 'Kredietovereenkomst zakelijk krediet + BKR',
  kasboek: 'Kasboek laatste volledige boekjaar',
  verklaring_boekhouder: 'Verklaring vaste boekhouder/accountant',
  samenwerking: 'VOF-/maatschapsovereenkomst',
  dividendbeleid: 'Dividendbeleid / aandeelhoudersbesluit',
  leningovereenkomst: 'Overeenkomst lening directie',
  grootboek: 'Grootboek- of saldibalans',
  overig: 'Overig',
};

function item(categorie, naam, wanneer, opties = {}) {
  return { categorie, naam, wanneer, geldigheid: opties.geldigheid || '', verplicht: opties.verplicht !== false,
    aantal: opties.aantal || 1, jaren: opties.jaren || null };
}

/**
 * @param {object} d dossier
 * @param {object} ctx { kader, T:[y1,y2,y3], C, heeftVPB, heeftSamenwerking, sbi45, nul, ... }
 */
export function documentenlijst(d, ctx) {
  const lijst = [];
  const { T = [], C, heeftVPB, heeftSamenwerking, sbi45 } = ctx;
  const jaren3 = T.join(', ');

  if (d.soort === 'NUL') {
    const actief = (d.ondernemingen || []).some((o) => o.actief !== false);
    lijst.push(item('kvk', 'Uittreksel KvK', 'Alle ondernemingen', { geldigheid: 'Niet ouder dan 6 maanden op datum bindend aanbod' }));
    lijst.push(item('jaarrekening', `Jaarcijfers laatste afgesloten boekjaar (${T[2] ?? ''})`, 'Altijd', { jaren: [T[2]] }));
    lijst.push(item('ib_aangifte', `Aangifte IB laatste afgesloten boekjaar (${T[2] ?? ''})`, 'Altijd', { jaren: [T[2]] }));
    if (actief) lijst.push(item('tussentijds', 'Cijfers lopend boekjaar', 'Bij een actieve onderneming'));
    if (ctx.zk) lijst.push(item('kredietovereenkomst', 'Kredietovereenkomst zakelijk krediet en BKR-uitdraai', 'Bij een zakelijk krediet'));
    if (d.notities?.kyc) lijst.push(item('jaarrekening', 'Jaarcijfers en aangiftes laatste drie boekjaren', 'Bij voorleggen aan KYC', { aantal: 3 }));
    if (sbi45) lijst.push(item(d.ondernemingen?.some((o) => o.kasgeld === 'ja') ? 'kasboek' : 'verklaring_boekhouder',
      d.ondernemingen?.some((o) => o.kasgeld === 'ja') ? 'Kasboek laatste volledige boekjaar' : 'Verklaring vaste boekhouder/accountant over kasgeld',
      'SBI-code begint met 45 (autobranche)'));
    return lijst;
  }

  const familie = ctx.familie || (ctx.kader === 'ABN' ? 'ABN' : 'NHG');
  const k = ctx.kaderCfg || {};
  const dv = k.definitiefVerplichtVanaf ? `${String(k.definitiefVerplichtVanaf.d).padStart(2, '0')}-${String(k.definitiefVerplichtVanaf.m).padStart(2, '0')}` : '01-05';
  if (familie === 'NHG') {
    lijst.push(item('kvk', 'Uittreksel KvK', 'Bij KvK-plichtige ondernemers', { geldigheid: 'Niet ouder dan 3 maanden' }));
    lijst.push(item('ib_aangifte', `IB-aangiftes laatste drie jaar (${jaren3})`, `Laatste jaar vanaf ${dv}; de aangifte moet zijn ingediend`, { aantal: 3, jaren: T }));
    lijst.push(item('jaarrekening', `Jaarrekeningen (${jaren3})`, `Laatste jaar vanaf ${dv}`, { aantal: 3, jaren: T }));
    if (ctx.starter) lijst.push(item('prognose', k.id === 'KNAB' || k.id === 'OPT' ? 'Prognose volgens NBA-standaard 3400 (lopend en komend jaar)' : 'Prognose met gerealiseerde cijfers lopend jaar en onderbouwing', 'Bij starters (12 tot 36 maanden); opgesteld door de vaste accountant of boekhouder'));
    if (k.beletRegel && ctx.belet) lijst.push(item('verklaring_boekhouder', 'Verklaring boekhouder over de oorzaak van het belet en tussentijdse cijfers ná het belet (min. 6 maanden)', 'Bij een beletperiode'));
    if (k.incidentRegel && ctx.belet) lijst.push(item('tussentijds', 'Tussentijdse cijfers die het herstel na het incident aantonen (opgesteld door de vaste accountant)', 'Bij een incidenteel jaar (§3.8)'));
    lijst.push(item('ib_aanslag', 'IB-aanslagen: de laatste twee definitieve', 'Altijd', { aantal: 2 }));
    lijst.push(item('vgi', 'Verklaring geregistreerd inkomen (oudste twee jaren)', 'Digitaal, onder de oorspronkelijke bestandsnaam', { aantal: 2 }));
    lijst.push(item('uwv', 'UWV verzekeringsbericht', 'In alle situaties'));
    if (C || ctx.tussentijdsVerplicht) {
      lijst.push(item('tussentijds', 'Winst- en verliesrekening lopend jaar', 'Vanaf 01-08 verplicht (positief resultaat)'));
      lijst.push(item('ob_aangifte', 'Aangiften omzetbelasting lopend jaar', 'Q1-Q2 vanaf 01-08, Q3 vanaf 01-11, alle kwartalen vanaf 01-02'));
    }
    if (ctx.vervanging) lijst.push(item('tussentijds', 'Tussentijdse balans (geen kolommenbalans) en W&V', 'Bij vervangen oudste jaar door lopend jaar (vanaf 01-04, hele maanden)'));
    if (d.loondienst?.meenemen || num(d.loondienst?.loonJaar) > 0) {
      lijst.push(item('werkgeversverklaring', 'Werkgeversverklaring', 'Bij meenemen loondienstinkomen', { geldigheid: 'Niet ouder dan 3 maanden' }));
      lijst.push(item('loonstrook', 'Recente loonstrook', 'Bij meenemen loondienstinkomen', { geldigheid: 'Niet ouder dan 3 maanden' }));
    }
    if (heeftVPB) {
      lijst.push(item('loonstrook', 'Recente loonstrook DGA', 'Bij directeur-grootaandeelhouder'));
      lijst.push(item('loonstrook_dec', 'Loonstrook december laatste boekjaar', 'Bij directeur-grootaandeelhouder'));
    }
    if (ctx.meerdereBV || ctx.deelnemingen) lijst.push(item('organogram', 'Organogram met belangen per vennootschap', 'Bij meerdere BV\'s of deelnemingen'));
    if (ctx.stilleReserves) lijst.push(item('woz', 'WOZ zakelijk pand of taxatierapport', 'Bij correctie stille reserve', { geldigheid: 'Meest recente / taxatie niet ouder dan 6 maanden' }));
    if (ctx.box3) lijst.push(item('box3', 'Dagafschriften box 3 vermogen (tenaamstelling, saldo, datum)', 'Bij inzet box 3 vermogen boven € 1.000'));
    if (ctx.leningDirectie) lijst.push(item('leningovereenkomst', 'Overeenkomst lening u/g aan de DGA (hoofdsom, rente, aflossing, zekerheid)', 'Bij een vordering op de DGA'));
    if (ctx.dividendbeleid) lijst.push(item('dividendbeleid', 'Dividendbeleid of aandeelhoudersbesluit', 'Bij box 2 inkomen uit een structuur met minderheidsbelangen'));
  } else {
    lijst.push(item('kvk', 'Uittreksel KvK (B143)', 'Altijd', { geldigheid: 'Niet ouder dan 6 maanden op datum bindend aanbod' }));
    lijst.push(item('ib_aangifte', `Aangiftes IB (B02) ${jaren3}`, 'De aangifte is verzonden aan de Belastingdienst', { aantal: 3, jaren: T }));
    lijst.push(item('jaarrekening', `Jaarcijfers (B72) ${jaren3}`, 'Vanaf 1 juli de afgelopen drie boekjaren; balans, W&V en toelichting', { aantal: 3, jaren: T }));
    if (C || ctx.tussentijdsVerplicht) lijst.push(item('tussentijds', 'Tussentijdse cijfers (B76)', 'Vanaf 1/8 t/m Q2, 1/11 t/m Q3, 1/2 t/m Q4; PDF uit het accountantspakket'));
    if (ctx.starter) lijst.push(item('prognose', 'Prognose jaarcijfers (B112)', 'Bij starters; opgesteld door RA/AA, met naam opsteller'));
    if (ctx.accountantsverklaring) lijst.push(item('jaarrekening', 'Accountantsverklaring bij de jaarcijfers', 'Middelgrote/grote onderneming, 3 of meer BV\'s / fiscale eenheid, of inbreng in een BV'));
    if (ctx.beroepsregister) lijst.push(item('beroepsregister', 'Uittreksel BIG-, NBA-, NOvA- of KNB-register', 'Bij zorgverleners, accountants, advocaten en notarissen'));
    if (ctx.rc) lijst.push(item('rc_verklaring', 'Verklaring van accountant met uitstaand saldo en rente R/C directie', 'Bij een rekening-courant directie'));
    if (ctx.leningDirectie) lijst.push(item('leningovereenkomst', 'Overeenkomst lening directie (hoofdsom, rente, looptijd, termijn)', 'Bij een lening van de BV aan de DGA'));
    if (ctx.zk) lijst.push(item('kredietovereenkomst', 'Kredietovereenkomst zakelijk krediet en BKR-uitdraai', 'Bij een zakelijk krediet in BKR'));
    if (heeftVPB) lijst.push(item('organogram', 'Organogram met belangen per vennootschap', 'Bij een BV-structuur', { verplicht: !!(ctx.meerdereBV || ctx.deelnemingen) }));
    if (ctx.dividendbeleid) lijst.push(item('dividendbeleid', 'Dividendbeleid of aandeelhoudersbesluit (2 jaar)', 'Bij dividend uit een structuur met minderheidsbelangen of bij niet-uitgekeerd dividend'));
    if (heeftVPB && C) lijst.push(item('loonstrook', 'Recente salarisstrook DGA', 'Voor het DGA-inkomen over de periode van de tussentijdse cijfers'));
  }

  if (heeftSamenwerking) lijst.push(item('samenwerking', 'VOF-/maatschapsovereenkomst (winstverdeling)', 'Bij een vof, maatschap of cv'));
  if (sbi45) {
    const kas = (d.ondernemingen || []).some((o) => o.kasgeld === 'ja');
    lijst.push(item(kas ? 'kasboek' : 'verklaring_boekhouder',
      kas ? 'Kasboek laatste volledige boekjaar' : 'Verklaring vaste boekhouder/accountant over kasgeld',
      'SBI-code begint met 45 (handel/reparatie auto\'s)'));
  }
  return lijst;
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Is een vereist document aanwezig? (op categorie, met het gevraagde aantal) */
export function docAanwezig(docs, item) {
  const n = docs.filter((x) => x.categorie === item.categorie).length;
  return n >= (item.aantal || 1);
}
