import { num, rond, isIngevuld } from '../util.js';
import { g, r, p } from './trace.js';
import { slechtste } from './onderneming.js';

// 0-verklaring: het zakelijk inkomen wordt op € 0 gesteld. Beoordeeld wordt of de onderneming
// aantoonbaar aan haar korte- en langetermijnverplichtingen kan voldoen, of er beperkende
// zekerheden/verplichtingen zijn en of de operationele kasstroom de verplichtingen draagt
// (ABN AMRO Woonbeleid 3.109). Het NHG-toetskader kent geen nul-verklaring; bij NHG wordt
// dezelfde beoordeling gedaan, getoetst aan de NHG-normen voor liquiditeit en solvabiliteit.

export const ZK_SOORTEN = {
  krediet: 'Zakelijk krediet / rekening-courantkrediet',
  lening: 'Zakelijke lening',
  lease: 'Leaseverplichting',
  borg: 'Borgstelling / garantie',
  overig: 'Overig',
};

/**
 * Lijst zakelijke kredieten en leaseverplichtingen (BKR) van het dossier.
 * Ondersteunt ook het oude formaat met één krediet onder dossier.nul.zk.
 */
export function zkLijst(dossier = {}) {
  if (Array.isArray(dossier.zk)) {
    return dossier.zk.filter((x) => x && typeof x === 'object').map((x) => ({
      id: x.id || '',
      soort: ZK_SOORTEN[x.soort] ? x.soort : 'krediet',
      kredietgever: x.kredietgever || '',
      omschrijving: x.omschrijving || '',
      ondId: x.ondId || '',
      maandlast: num(x.maandlast),
      saldo: isIngevuld(x.saldo) ? num(x.saldo) : null,
      gedragenDoor: x.gedragenDoor === 'prive' ? 'prive' : 'onderneming',
      status: x.status === 'afgelost' ? 'afgelost' : 'lopend',
      afgelostIn: x.afgelostIn || '',
      toelichting: x.toelichting || '',
    }));
  }
  const z = dossier.nul?.zk;
  if (z?.ja) {
    return [{ id: 'zk_legacy', soort: 'krediet', kredietgever: '', omschrijving: 'Zakelijk krediet', ondId: '',
      maandlast: num(z.maandlast), saldo: null, gedragenDoor: z.prive ? 'prive' : 'onderneming', status: 'lopend',
      afgelostIn: '', toelichting: '' }];
  }
  return [];
}

export function zkTekst(x) {
  const naam = [x.kredietgever, x.omschrijving].filter(Boolean).join(', ') || ZK_SOORTEN[x.soort] || 'Krediet';
  if (x.status === 'afgelost') return `${naam}: volledig afgelost${x.afgelostIn ? ` in ${x.afgelostIn}` : ''}`;
  return `${naam}: maandlast ${g(x.maandlast)}${x.saldo !== null ? `, saldo ${g(x.saldo)}` : ''}, gedragen ${x.gedragenDoor === 'prive' ? 'in privé' : 'door de onderneming'}`;
}

export function beoordeelNul(dossier, analyses, ctx) {
  const { kader, T, C } = ctx;
  const T3 = T[2];
  const nul = dossier.nul || {};
  const box3Prive = num(dossier.ib?.[T3]?.box3 ?? dossier.ib?.[String(T3)]?.box3);
  let maandlastCorrectie = 0;
  const toelichtingCorrectie = [];
  const ids = new Set(analyses.map((a) => a.id));
  const zk = zkLijst(dossier).filter((x) => !x.ondId || ids.has(x.ondId));
  const eersteId = analyses[0]?.id;
  // Lasten van lopende kredieten die de onderneming draagt, per onderneming (zonder koppeling: de eerste).
  const zkJaarVoor = (id) => zk
    .filter((x) => x.status === 'lopend' && x.gedragenDoor === 'onderneming' && (x.ondId ? x.ondId === id : id === eersteId))
    .reduce((s, x) => s + x.maandlast * 12, 0);

  const perOnd = analyses.map((a) => {
    const ond = (dossier.ondernemingen || []).find((o) => o.id === a.id) || {};
    const J = a.jaren;
    const L = J[T3];
    const Cj = C ? J[C] : null;
    const checks = [];
    const add = (key, label, status, tekst) => checks.push({ key, label, status, tekst });
    const actief = ond.actief !== false;

    add('activiteit', 'Status onderneming', 'akkoord', actief ? 'Actieve onderneming.' : 'Niet-actieve onderneming.');

    // 1. Korte termijn
    const bj = Cj?.heeftBalans ? Cj : L;
    if (!bj?.heeftBalans) {
      add('kort', 'Kortetermijnverplichtingen', 'akkoord', 'Geen balansposten: geen kortlopende schulden vastgesteld.');
    } else {
      const ok = bj.CR === null || bj.CR >= kader.liquiditeitMin || bj.WK >= 0;
      add('kort', 'Kortetermijnverplichtingen', ok ? 'akkoord' : 'niet_akkoord',
        `${bj.y}: current ratio ${bj.CR === null ? 'n.v.t.' : r(bj.CR)}, werkkapitaal ${g(bj.WK)}.`);
    }

    // 2. Lange termijn
    if (!bj?.heeftBalans) {
      add('lang', 'Langetermijnverplichtingen', 'akkoord', 'Geen langlopende schulden vastgesteld.');
    } else {
      const svNorm = kader.id === 'NHG' ? kader.bandbreedte.norm : kader.solvabiliteitMin;
      if (bj.EVcor < 0) {
        const gedekt = box3Prive >= -bj.EVcor;
        add('lang', 'Langetermijnverplichtingen', gedekt ? 'attentie' : 'niet_akkoord',
          `Negatief eigen vermogen na correcties (${g(bj.EVcor)})${gedekt ? '; gedekt door vrij vermogen in privé, motiveren.' : '.'}`);
      } else {
        add('lang', 'Langetermijnverplichtingen', bj.SV === null || bj.SV >= svNorm ? 'akkoord' : 'attentie',
          `Eigen vermogen na correcties ${g(bj.EVcor)}, solvabiliteit ${bj.SV === null ? 'n.v.t.' : p(bj.SV)} (norm ${p(svNorm)}).`);
      }
    }

    // 3. Resultaat en verlies
    const nw = L?.winst.NWcor ?? 0;
    const nwC = Cj?.heeftVW ? Cj.winst.NWcorExtr : null;
    const verlies = Math.max(0, -nw, nwC !== null ? -nwC : 0);
    if (verlies === 0) {
      add('resultaat', 'Resultaat', 'akkoord', `Nettowinst ${T3}: ${g(nw)}${nwC !== null ? `; lopend jaar (geëxtrapoleerd) ${g(nwC)}` : ''}.`);
    } else if (nul.hobbymatig) {
      add('resultaat', 'Resultaat', 'akkoord', `Verlies van ${g(verlies)}; hobbymatige onderneming met beperkt verlies (eigen inschatting, motiveren).`);
    } else {
      const gedektOnd = (bj?.EVcor ?? 0) >= verlies;
      const gedektPrive = nul.verliesGedektPrive === true || box3Prive >= verlies;
      if (gedektOnd || gedektPrive) {
        add('resultaat', 'Resultaat', 'akkoord',
          `Verlies van ${g(verlies)} kan worden gedragen uit ${gedektOnd ? 'het vermogen van de onderneming' : 'vermogen in privé'}.`);
      } else {
        const ml = rond(verlies / 12);
        maandlastCorrectie += ml;
        toelichtingCorrectie.push(`${a.naam}: verlies ${g(verlies)} / 12 = ${g(ml)} per maand`);
        add('resultaat', 'Resultaat', 'attentie',
          `Verlies van ${g(verlies)} is niet aantoonbaar gedekt: ${g(ml)} per maand in mindering brengen op de toegestane financieringslast.`);
      }
    }

    // 4. Operationele kasstroom
    if (L?.heeftVW) {
      const kasstroom = nw + L.vw.AFSCHRIJVINGEN - num(L.div?.aflossingenLVV);
      const zkJaar = zkJaarVoor(a.id);
      const saldo = kasstroom - zkJaar;
      const tekort = Math.max(0, -saldo);
      const gedekt = tekort > 0 && ((bj?.EVcor ?? 0) >= tekort || nul.verliesGedektPrive === true || box3Prive >= tekort || nul.hobbymatig);
      const status = saldo >= 0 || gedekt ? 'akkoord' : (zkJaar ? 'niet_akkoord' : 'attentie');
      add('kasstroom', 'Operationele kasstroom', status,
        `Nettowinst ${g(nw)} + afschrijvingen ${g(L.vw.AFSCHRIJVINGEN)} - aflossingen ${g(num(L.div?.aflossingenLVV))}${zkJaar ? ` - lasten zakelijk krediet ${g(zkJaar)}` : ''} = ${g(saldo)}${gedekt ? '; het tekort wordt gedragen uit vermogen.' : '.'}`);
    } else {
      add('kasstroom', 'Operationele kasstroom', 'akkoord', 'Geen winst- en verliesrekening: geen exploitatie van betekenis.');
    }
    return { id: a.id, naam: a.naam, rechtsvorm: a.rechtsvormLabel, checks, status: slechtste(checks.map((c) => c.status)) };
  });

  // Dossierbrede zekerheden en verplichtingen
  const zek = [];
  const addZ = (key, label, status, tekst) => zek.push({ key, label, status, tekst });
  addZ('borg', 'Borgstellingen / persoonlijke zekerheden', nul.borgstelling?.ja ? 'attentie' : 'akkoord',
    nul.borgstelling?.ja ? `Borgstelling van ${g(num(nul.borgstelling.bedrag))}: weeg mee in de beoordeling van de hypotheek.` : 'Geen borgstellingen of persoonlijke zekerheden bekend.');
  const heeftHoofdelijk = (dossier.ondernemingen || []).some((o) => ['VOF', 'MTS', 'CV'].includes(o.rechtsvorm));
  if (heeftHoofdelijk) {
    addZ('hoofdelijk', 'Hoofdelijke aansprakelijkheid', nul.hoofdelijkBeoordeeld ? 'akkoord' : 'attentie',
      nul.hoofdelijkBeoordeeld ? 'Hoofdelijke aansprakelijkheid (vof/maatschap) beoordeeld.' : 'Vennoten zijn hoofdelijk aansprakelijk: beoordeel de schulden van de samenwerking.');
  }
  const zkLopend = zk.filter((x) => x.status === 'lopend');
  const zkAfgelost = zk.filter((x) => x.status === 'afgelost');
  if (zkLopend.length) {
    addZ('zk', 'Zakelijke kredieten en lease (BKR)', 'attentie',
      `${zkLopend.map(zkTekst).join('; ')}. Lasten in privé meenemen als financiële verplichting; lasten van de onderneming zijn getoetst in de kasstroom.${zkAfgelost.length ? ` Afgelost: ${zkAfgelost.map(zkTekst).join('; ')}.` : ''}`);
  } else if (zkAfgelost.length) {
    addZ('zk', 'Zakelijke kredieten en lease (BKR)', 'akkoord', `Alle bekende kredieten zijn afgelost (${zkAfgelost.map(zkTekst).join('; ')}).`);
  } else {
    addZ('zk', 'Zakelijke kredieten en lease (BKR)', 'akkoord', 'Geen zakelijk krediet bekend.');
  }
  addZ('fiscus', 'Belastingschulden / achterstanden', nul.belastingachterstand ? 'niet_akkoord' : 'akkoord',
    nul.belastingachterstand ? 'Er zijn achterstanden bij de Belastingdienst.' : 'Geen achterstanden bekend.');
  if (nul.medeaanvragerLoondienst) {
    addZ('medeaanvrager', 'Medeaanvrager in loondienst bij de onderneming', 'attentie',
      'De medeaanvrager ontvangt loon uit de onderneming van de aanvrager: motiveer of dit verantwoord is.');
  }

  const alle = [...perOnd.flatMap((o) => o.checks), ...zek];
  const status = slechtste(alle.map((c) => c.status));
  const rc = ctx.rc;
  let conclusie;
  if (status === 'niet_akkoord') {
    conclusie = 'Geen 0-verklaring: de onderneming vormt een risico voor de betaalbaarheid van de hypotheek in privé. Leg vast op basis van welke risico\'s de hypotheek niet op het loondienstinkomen kan worden verstrekt.';
  } else if (maandlastCorrectie > 0) {
    conclusie = `0-verklaring akkoord met correctie: neem € ${g(maandlastCorrectie)} per maand in mindering op de toegestane financieringslast. Zakelijk inkomen € 0.`;
  } else if (status === 'attentie') {
    conclusie = '0-verklaring onder voorbehoud: motiveer de aandachtspunten. Zakelijk inkomen € 0.';
  } else {
    conclusie = 'De onderneming vormt geen belemmering voor de betaalbaarheid van de hypotheek in privé en kan buiten beschouwing worden gelaten. Zakelijk inkomen € 0.';
  }
  return {
    status,
    perOnderneming: perOnd,
    zekerheden: zek,
    maandlastCorrectie,
    toelichtingCorrectie,
    rcMaandlast: rc?.maandlast || 0,
    conclusie,
    nhgOpmerking: kader.id === 'NHG'
      ? 'Het NHG-toetskader voorziet niet in een nul-verklaring. De beoordeling volgt het Woonbeleid (3.67/3.109) en is getoetst aan de NHG-normen (liquiditeit ≥ 1,00, solvabiliteit ≥ 25%). Bij ABN AMRO wordt het nul-inkomen in een apart dossier zonder NHG vastgelegd.'
      : '',
  };
}
