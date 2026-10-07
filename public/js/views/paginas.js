import { esc, fmt, naamAanvrager, todayISO } from '../util.js';
import { lijst, get, state, opslagvoorkeur, mijnNaam } from '../state.js';
import { kaderLabel, SOORTEN } from '../engine/kaders.js';
import { CATEGORIEEN } from '../schema/documenten.js';
import { RUBRIEKEN, postVoorRekening } from '../schema/rekeningschema.js';
import { BALANS_RIJEN, VW_RIJEN } from '../schema/fields.js';
import { paginakop, datumKort } from './layout.js';
import { pil, veld, keuze, leeg, melding, icoon } from './ui.js';
import { samenvatting } from './aanvragen.js';
import { ACCREDITATIES } from './formats.js';
import { ui } from './uistate.js';
import { drive } from '../store/drive.js';

const POST_LABEL = Object.fromEntries([...BALANS_RIJEN, ...VW_RIJEN].filter((r) => r.k).map((r) => [r.k, r.label]));
POST_LABEL.vpb = 'Vennootschapsbelasting';

// ---------------------------------------------------------------------------
export function renderDocumenten() {
  const docs = lijst('document').sort((a, b) => String(b.aangemaakt).localeCompare(String(a.aangemaakt)));
  const rijen = docs.map((x) => {
    const d = get(x.dossierId);
    return `<tr><td>${esc(x.naam)}</td><td>${esc(CATEGORIEEN[x.categorie] || x.categorie)}</td><td>${esc(x.jaar || '')}</td>
      <td>${d ? `<a href="#/dossier/${esc(d.id)}/documenten">${esc(d.nummer)}</a> ${esc(naamAanvrager(d.aanvrager))}` : '<span class="dempen">Dossier verwijderd</span>'}</td>
      <td class="nowrap">${esc(datumKort(x.aangemaakt))}</td>
      <td class="nowrap"><button class="knop link klein" data-actie="doc-download" data-id="${esc(x.id)}">Openen</button></td></tr>`;
  }).join('');
  return `${paginakop('Documenten', 'Alle geüploade stukken. Uploaden doe je in het dossier, tabblad Documenten.')}
    <div class="paneel" style="padding:0">${rijen ? `<div class="scroll"><table class="tabel"><thead><tr><th>Bestand</th><th>Soort</th><th>Jaar</th><th>Dossier</th><th>Toegevoegd</th><th></th></tr></thead><tbody>${rijen}</tbody></table></div>` : leeg('Er zijn nog geen documenten geüpload.')}</div>`;
}

// ---------------------------------------------------------------------------
export function renderAdvieskantoren() {
  const kantoren = lijst('advieskantoor').sort((a, b) => a.naam.localeCompare(b.naam));
  const blokken = kantoren.map((k) => {
    const aantal = lijst('dossier').filter((d) => d.advieskantoorId === k.id).length;
    return `<div class="paneel"><div class="paginakop" style="margin:0 0 8px"><h3>${esc(k.naam || 'Nieuw advieskantoor')} <span class="dempen klein">${aantal} dossiers</span></h3>
      <button class="knop gevaar klein" data-actie="verwijder-record" data-id="${esc(k.id)}" data-vraag="Advieskantoor verwijderen?">Verwijderen</button></div>
      <div class="raster-3">
        ${veld('Kantoornaam', 'naam', k.naam, { rec: k.id })}
        ${veld('AFM-nummer', 'afm', k.afm, { rec: k.id })}
        ${veld('Contactpersoon', 'contactpersoon', k.contactpersoon, { rec: k.id })}
        ${veld('E-mail', 'email', k.email, { rec: k.id, type: 'email' })}
        ${veld('Telefoon', 'telefoon', k.telefoon, { rec: k.id })}
        ${veld('Plaats', 'plaats', k.plaats, { rec: k.id })}
      </div></div>`;
  }).join('');
  return `${paginakop('Advieskantoren', `${kantoren.length} kantoren`, '<button class="knop" data-actie="nieuw-advieskantoor">Advieskantoor toevoegen</button>')}${blokken || leeg('Nog geen advieskantoren.')}`;
}

// ---------------------------------------------------------------------------
export function renderTaken(alleenMijn) {
  const mijn = state.profiel?.naam || '';
  const taken = lijst('taak').filter((t) => !alleenMijn || t.toegewezenAan === mijn)
    .sort((a, b) => (a.status === b.status ? String(a.deadline).localeCompare(String(b.deadline)) : a.status === 'open' ? -1 : 1));
  const vandaag = new Date().toISOString().slice(0, 10);
  const rijen = taken.map((t) => {
    const d = get(t.dossierId);
    const telaat = t.status === 'open' && t.deadline && t.deadline < vandaag;
    return `<tr><td><input type="checkbox" aria-label="Gereed"${t.status === 'gereed' ? ' checked' : ''} data-actie="taak-toggle" data-id="${esc(t.id)}"></td>
      <td>${t.status === 'gereed' ? `<s>${esc(t.titel)}</s>` : `<b>${esc(t.titel)}</b>`}</td>
      <td>${d ? `<a href="#/dossier/${esc(d.id)}">${esc(d.nummer)}</a> ${esc(naamAanvrager(d.aanvrager))}` : ''}</td>
      <td>${esc(t.toegewezenAan || '')}</td><td class="nowrap">${telaat ? pil('niet_akkoord', fmt.datum(t.deadline)) : esc(fmt.datum(t.deadline))}</td>
      <td><button class="knop link klein" data-actie="verwijder-record" data-id="${esc(t.id)}" data-vraag="Taak verwijderen?">Verwijderen</button></td></tr>`;
  }).join('');
  return `${paginakop(alleenMijn ? 'Mijn Taken' : 'Alle Taken', alleenMijn ? `Taken toegewezen aan ${esc(mijn || 'jou')}` : `${taken.length} taken`, '<button class="knop" data-actie="nieuwe-taak">Taak toevoegen</button>')}
    <div class="paneel" style="padding:0">${rijen ? `<div class="scroll"><table class="tabel"><thead><tr><th></th><th>Taak</th><th>Dossier</th><th>Toegewezen aan</th><th>Deadline</th><th></th></tr></thead><tbody>${rijen}</tbody></table></div>` : leeg(alleenMijn ? 'Je hebt geen openstaande taken.' : 'Er zijn geen taken.')}</div>`;
}

// ---------------------------------------------------------------------------
export function renderMeekijken() {
  const ds = lijst('dossier').filter((d) => d.status === 'beoordeling_2').sort((a, b) => String(a.gewijzigd).localeCompare(String(b.gewijzigd)));
  const vandaag = todayISO();
  const meekijk = lijst('dossier').filter((d) => d.meekijken?.datum === vandaag);
  const rijen = ds.map((d) => {
    const s = samenvatting(d);
    return `<tr class="klik${d.meekijken?.datum === vandaag ? ' meekijken' : ''}" data-actie="open-dossier" data-id="${esc(d.id)}" data-tab="fiat">
      <td>${esc(d.nummer)}</td><td><b>${esc(naamAanvrager(d.aanvrager))}</b></td><td>${esc(SOORTEN[d.soort])}</td><td>${esc(kaderLabel(d.kader))}</td>
      <td>${esc(d.niveau || 'Basis')}</td><td>${esc(d.fiat?.eerste?.naam || d.behandelaar || '')}</td><td class="nowrap">${esc(fmt.tijdstip(d.fiat?.eerste?.datum))}</td>
      <td class="num">${d.soort === 'NUL' ? '€ 0' : esc(fmt.eur(s.vastgesteld))}</td><td>${pil(s.status)}</td></tr>`;
  }).join('');
  return `${paginakop('Meekijken', 'Dossiers in de tweede beoordeling (vier-ogenprincipe) en dossiers waarin vandaag mag worden meegekeken.',
    `<button class="knop sec" data-actie="meekijken-toestemming">${icoon('persoon')}Meekijken in een dossier</button>`)}
    <div class="paneel" style="padding:0">${rijen ? `<div class="scroll"><table class="tabel"><thead><tr><th>Dossier</th><th>Aanvrager</th><th>Soort</th><th>Kader</th><th>Niveau</th><th>1e beoordeling</th><th>Gereed gemeld</th><th class="num">Inkomen</th><th>Uitkomst</th></tr></thead><tbody>${rijen}</tbody></table></div>` : leeg('Er wachten geen dossiers op een tweede beoordeling.')}</div>
    <div class="paneel"><h2>Vandaag meekijken</h2>
      ${meekijk.length ? `<ul>${meekijk.map((d) => `<li><a href="#/dossier/${esc(d.id)}">${esc(d.nummer)} ${esc(naamAanvrager(d.aanvrager))}</a> – toestemming vastgelegd door ${esc(d.meekijken.door || '')}</li>`).join('')}</ul>`
    : '<p class="dempen">Geen dossiers. Met toestemming van de behandelaar leg je vast dat je vandaag meekijkt; het dossier krijgt dan een lichtgele achtergrond in de aanvragenlijst.</p>'}</div>`;
}

// ---------------------------------------------------------------------------
export function renderEmail(vooraf = {}) {
  return `${paginakop('E-mail versturen', 'Opstellen in ZIB en verzenden met je eigen e-mailprogramma. Bijlagen voeg je daar toe.')}
    <div class="paneel">${emailFormulier(vooraf)}
      <div class="acties" style="margin-top:12px"><button class="knop" data-actie="email-verzend">${icoon('mail')}Openen in e-mailprogramma</button></div></div>`;
}

export function emailFormulier({ aan = '', bcc = '', onderwerp = '', bericht = '' } = {}) {
  return `<div class="formulier">
    <label class="veld"><span>Van</span><input value="${esc(mijnNaam())}" disabled></label>
    <label class="veld"><span>Aan *</span><input name="aan" type="email" multiple value="${esc(aan)}" autocomplete="off"></label>
    <label class="veld"><span>BCC</span><input name="bcc" type="email" multiple value="${esc(bcc)}" autocomplete="off"></label>
    <label class="veld"><span>Onderwerp *</span><input name="onderwerp" value="${esc(onderwerp)}" autocomplete="off"></label>
    <label class="veld"><span>Bericht</span><textarea name="bericht" rows="10">${esc(bericht)}</textarea></label>
    <p class="dempen klein">Toegestane bijlagen voeg je in je e-mailprogramma toe; ZIB verstuurt zelf geen e-mail en bewaart het bericht niet.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
const FAQ = [
  ['Wat is het verschil tussen het NHG-kader en het ABN AMRO Woonbeleid in ZIB?',
    'NHG: gemiddelde van 3 jaar met maximum laatste jaar; tussentijdse cijfers kunnen alleen verlagen; solvabiliteit ≥ 25% volgens het bandbreedtemodel; positieve balanscorrecties (box 3, stille reserves, FOR, achtergestelde leningen) zijn toegestaan; box 2 via route 1, route 2 (25% afslag) of een gemotiveerde combinatie. ABN AMRO: laagste van gemiddelde en laatste jaar; starters 75% (1-2 boekjaren) of 90% (2-3 boekjaren) met de prognose als maximum; solvabiliteit ≥ 20%; correcties vooral negatief (immateriële activa, R/C en lening directie) plus de cashflowcorrectie.'],
  ['Wanneer gebruik ik een 0-verklaring?',
    'Als het inkomen uit de onderneming niet nodig is voor de aanvraag, bijvoorbeeld bij een fulltime loondienstinkomen naast een kleine onderneming. Je beoordeelt of de onderneming aan haar verplichtingen kan voldoen, of er zekerheden of verplichtingen zijn die de hypotheek raken en of de kasstroom de verplichtingen draagt. Een ongedekt verlies leidt tot een correctie op de maandlast. Het NHG-kader kent geen 0-verklaring; ZIB toetst dan aan de NHG-normen en vermeldt dat het Woonbeleid leidend is.'],
  ['Wat doet de vervanging van het oudste jaar?',
    'Bij NHG mag vanaf 1 april het feitelijk behaalde tussentijdse resultaat het oudste jaar vervangen (met tussentijdse balans, W&V en OB-aangiften). ZIB rekent de stappen uit het toetskader na: aftoppen op het laatste volledige jaar, toets op het gerealiseerde resultaat, en toets op het geëxtrapoleerde resultaat. Het laagste bedrag geldt.'],
  ['Hoe werkt het bandbreedtemodel?',
    'Laatste jaar ≥ 30%: akkoord. Tussen 25% en 30% met een daling van meer dan 10%: tussentijdse cijfers moeten een trendbreuk laten zien. Tussen 20% en 25%: tussentijdse cijfers met ≥ 25% nodig. Onder 20%: geen inkomensverklaring.'],
  ['Waarom wijkt het berekend inkomen af van het toetsinkomen bij ABN AMRO?',
    'Het berekend inkomen is het gemiddelde DGA-inkomen (of de gemiddelde saldo fiscale winst) na correcties plus het gemiddelde dividend over de meegetelde jaren, zoals in de rekentool van de bank. ZIB toetst daarnaast aan het Woonbeleid: het laagste van gemiddelde en laatste boekjaar, de starterafslag van 25% of 10% (die het acceptatiesysteem toepast) en het dividendplafond. Is het Woonbeleid lager, dan stelt ZIB voor een afwijkend inkomen vast te leggen.'],
  ['Hoe werkt de dubbele balanstoets bij overwinst?',
    'Als overwinst (niet-uitgekeerde winst) tot het inkomen wordt gerekend, gaan we ervan uit dat die als dividend uitgekeerd had kunnen worden. ZIB stelt daarom ook een balans op waarin de overwinst fictief is onttrokken aan het eigen vermogen, het balanstotaal en de vlottende activa, en toetst of de onderneming dan nog aan de normen voldoet. Maximale overwinst solvabiliteit: (aansprakelijk vermogen - norm × balanstotaal) / (1 - norm); liquiditeit: vlottende activa - 1 × kort vreemd vermogen (current ratio ≥ 1), of het gemiddelde werkkapitaal met als maximum het laatste jaar. De laagste uitkomst begrenst de overwinst. NHG schrijft de toets voor (25%, gemiddeld werkkapitaal, afslag 25%). Bij ABN AMRO (Woonbeleid 3.63, niet-uitgekeerd dividend) stel je per hoofdbedrijf in: de solvabiliteitsnorm (standaard 20%), de liquiditeitstoets, of je alle toetsjaren toetst, of ook de tussentijdse balans meetelt en of eerdere fictieve onttrekkingen cumulatief meetellen. Verder gelden: zelfstandige bevoegdheid (100% of aangetoond, bijvoorbeeld een dividendbeleid), minimaal 3 boekjaren, winst in het laatste jaar, een onderbouwde vrije kasstroom en de balanstest (vrij uitkeerbare reserves). De rekentool van de bank rekent geen niet-uitgekeerd dividend mee: ZIB stelt dan een afwijkend inkomen voor, met de volledige rekenkundige onderbouwing in de conclusie.'],
  ['Wat staat er op het tabblad BZI-invoer?',
    'De uitkomst van de (gedetailleerde) berekening vertaald naar de velden van de rekentool van de bank, per bedrijf in de volgorde van die tool: vinkje per jaar, status, belang, DGA-inkomen, bijtelling en dividend, omzet en nettowinst, management fee en het interne dividend aan de aandeelhouder, de correcties per type, eigen vermogen, balanstotaal, vlottende activa en kort vreemd vermogen. Daaronder staan de uitkomsten die de rekentool moet laten zien (ter controle) en het advies: berekend inkomen of een afwijkend inkomen met onderbouwing. Met "Kopieer als tabel" plak je een bedrijf in Excel.'],
  ['Hoe bewaar ik dossiers in Google Drive?',
    'In de demo op claude.ai: Downloads → Google Drive → Google Drive koppelen, en sta de koppeling toe. ZIB bewaart je dossiers dan als bestand in de map ZIB in je Google Drive, met de tien nieuwste versies. Na een wijziging slaat ZIB binnen ongeveer twintig seconden op; bij het openen op een ander apparaat haalt ZIB de nieuwste versie op en voegt die samen met wat in die browser staat (per dossier wint de nieuwste wijziging). Bewaar daar alleen fictieve of geanonimiseerde dossiers.'],
  ['Hoe leg ik een STAK, certificaathouders of andere aandeelhouders vast?',
    'Bij het organogram (Bedrijven of Klantgegevens) voeg je partijen toe die niet in de berekening meetellen: personen, een STAK (met de bestuurder in de toelichting) of de holding van een medeaandeelhouder. Met lijnen leg je vast wie welk belang heeft; certificaten tekent ZIB gestippeld. Geeft een STAK certificaten uit voor meer vennootschappen, kies dan bij elke certificaathouder "Certificaten van": elke vennootschap krijgt met haar certificaathouders een eigen kleur. ZIB controleert of de belangen per vennootschap optellen tot 100%, toont het organogram grafisch en als tekst, en de partijen zijn te kiezen als tegenpartij bij de geldstromen (bijvoorbeeld een management fee aan de holding van een medeaandeelhouder). Eerdere structuren leg je vast als situatie; bij "Invoegen in notities" komen ze onder elkaar met de huidige situatie als laatste.'],
  ['Kan ik de volgorde van de jaarkolommen wijzigen?',
    'Standaard staat het meest recente jaar links en het oudste jaar rechts, net als in de rekentool van de bank. In Mijn gegevens kies je eventueel de omgekeerde volgorde; dat geldt voor alle invoer- en overzichtstabellen, de rekenstappen en het rapport.'],
  ['Wat is het verschil tussen de BZI- en de ViiZ-weergave?',
    'Beide werken op hetzelfde dossier en dezelfde rekenkern. De BZI-weergave volgt de stappen van de rekentool van de bank: per bedrijf de totaalposten per jaar (omzet, nettowinst, eigen vermogen, balanstotaal, vlottende activa, kort vreemd vermogen), correcties via een pop-up en de samenvatting met solvabiliteits- en liquiditeitsruimte. De ViiZ-weergave heeft tabbladen met de volledige balans en W&V (quick-scan of uitgebreide modus), de IB-aangifte, de rekenstappen en het uitgebreide rapport. Zodra je in ViiZ een gedetailleerde balans of W&V invult, gebruikt de rekenkern die in plaats van de totaalposten.'],
  ['Wanneer telt een deelneming mee in het toetskader?',
    'Bij ABN AMRO telt het toetskader van het hoofdbedrijf alle (niet-geconsolideerde) deelnemingen mee, ook een deelneming die je met een andere aandeelhouder binnen de structuur deelt. Voldoet één van de bedrijven niet, dan voldoet het hoofdbedrijf niet aan het toetskader. Het berekend inkomen blijft zichtbaar; jij beslist of je afwijkt, geen inkomen afgeeft of een 0-inkomen afgeeft.'],
  ['Hoe bepaal ik het DGA-inkomen in het lopende jaar?',
    'Gebruik de rekenknop bij het DGA-inkomen van het lopende jaar: maandsalaris × 12 × (1 + vakantiegeld) [+ 13e maand] / 12 × het aantal maanden van de tussentijdse cijfers. Zo vergelijk je het loon over dezelfde periode als de tussentijdse winst. De berekening komt in de notities terecht via "Concept uit invoer" en "Organogram invoegen".'],
  ['Wat doe ik met een G-rekening of een R/C directie?',
    'Een G-rekening is niet vrij beschikbaar: vul bij de liquide middelen het "waarvan niet ter vrije beschikking"-bedrag in (of in de BZI-weergave via de rekenknop bij de vlottende activa). ZIB corrigeert dan de vlottende activa. Een rekening-courant van de DGA wordt bij ABN AMRO altijd op de activazijde gecorrigeerd; bij NHG vanaf € 17.500. Een handmatige correctie van hetzelfde type vervangt de automatische.'],
  ['Hoe werkt het importeren van een grootboek?',
    'Plak of upload een saldibalans met rekeningnummer, omschrijving en saldo (debet positief, credit negatief) of met aparte kolommen debet en credit. ZIB verdeelt de rekeningen volgens het decimale rekeningschema over de invoerposten, telt het resultaat van het boekjaar bij het eigen vermogen en toont eerst een voorbeeld. Rekeningen voor kostenverdeling (rubriek 5 en 6) en tussenrekeningen worden niet overgenomen.'],
  ['Hoe voorkom ik dat gegevens verloren gaan?',
    'Gebruik de cloudopslag (Cloudflare D1 met automatische point-in-time-herstel) en maak daarnaast periodiek een back-up via Downloads. In de lokale modus staan gegevens alleen in deze browser.'],
  ['Mag ik echte klantgegevens invoeren?',
    'Alleen als de omgeving daarvoor is goedgekeurd door je werkgever (privacy en informatiebeveiliging). Gebruik voor testen de demodossiers of fictieve gegevens en leg nooit een BSN vast.'],
];

export function renderFAQ() {
  return `${paginakop('FAQ', 'Veelgestelde vragen over de rekenregels en het gebruik van ZIB.')}
    ${FAQ.map(([v, a]) => `<details class="stappen"><summary>${esc(v)}</summary><div class="inhoud"><p>${esc(a)}</p></div></details>`).join('')}`;
}

// ---------------------------------------------------------------------------
export function renderHulp() {
  return `${paginakop('Hulp nodig?', 'Stel een vraag aan beheer of een collega; je vraag wordt als ticket vastgelegd.')}
    <div class="raster-2">
      <div class="paneel"><h2>Vraag stellen</h2>
        <div class="raster-3" style="grid-template-columns:1fr">
          <label class="veld"><span>Onderwerp</span><input id="hulp-onderwerp" type="text" placeholder="Bijvoorbeeld: toetsjaar wijzigen na 1 juli"></label>
          <label class="veld"><span>Vraag of toelichting</span><textarea id="hulp-bericht" rows="6"></textarea></label>
        </div>
        <div class="acties" style="margin-top:12px"><button class="knop" data-actie="hulp-verstuur">Ticket aanmaken</button></div>
      </div>
      <div class="paneel"><h2>Snel op weg</h2>
        <p><b>Nieuwe klant:</b> knop rechtsonder in de aanvragenlijst. Kies de soort aanvraag (met of zonder NHG, inkomensverklaring of 0-verklaring).</p>
        <p><b>ViiZ-weergave (standaard, ook voor ABN AMRO):</b> tabbladen Klantgegevens, Balans, V&W, Diversen, IB-aangifte, Berekening en BZI-invoer. Schakel in Balans en V&W naar de uitgebreide modus om posten open te klappen, of importeer een grootboek. Het tabblad BZI-invoer zet de uitkomst klaar voor de rekentool van de bank.</p>
        <p><b>BZI-weergave:</b> de stappen van de rekentool van de bank: Algemeen, Bedrijven, per bedrijf de cijfers per jaar met correcties, Boekhouders, Geldstromen en verplichtingen, Samenvatting. De notities staan rechts. Kies in Mijn gegevens of ABN AMRO-dossiers standaard in deze weergave openen.</p>
        <p><b>Overwinst:</b> per hoofdbedrijf in te stellen, met de dubbele balanstoets (Berekening of de stap van het hoofdbedrijf).</p>
        <p><b>Rapport:</b> print of sla op als pdf; met "Kopieer dossiernotities" plak je de samenvatting in een ander systeem.</p>
        <p><b>Beoordeling:</b> meld gereed voor de 2e beoordeling; een collega met de juiste accreditatie geeft akkoord via Meekijken.</p>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
/** Google Drive-opslag (alleen in de ingesloten demo op claude.ai). */
function paneelDrive() {
  if (!globalThis.ZIB_ARTIFACT) return '';
  if (!drive.beschikbaar) {
    return `<div class="paneel" id="drive"><h2>Google Drive</h2>
      <p class="dempen">Google Drive is in deze weergave niet beschikbaar. Open de demo op claude.ai, ingelogd met het account waaraan je Google Drive hebt gekoppeld.</p></div>`;
  }
  const tijd = drive.laatst ? `${String(drive.laatst.getHours()).padStart(2, '0')}:${String(drive.laatst.getMinutes()).padStart(2, '0')}` : '';
  const status = drive.status === 'ok' ? pil('akkoord', `Bewaard om ${tijd}`)
    : drive.status === 'bezig' ? pil('info', 'Bezig…')
      : drive.status === 'fout' ? pil('niet_akkoord', 'Niet gelukt')
        : pil('neutraal', drive.uitgezet ? 'Ontkoppeld in deze browser' : 'Niet gekoppeld');
  const gekoppeld = drive.status === 'ok' || (drive.status === 'fout' && drive.toestemming === 'granted');
  const knoppen = [
    gekoppeld || drive.status === 'bezig'
      ? `<button class="knop" data-actie="drive-sync"${drive.status === 'bezig' ? ' disabled' : ''}>Nu opslaan en ophalen</button>`
      : '<button class="knop" data-actie="drive-koppel">Google Drive koppelen</button>',
    drive.mapUrl ? `<a class="knop sec" href="${esc(drive.mapUrl)}" target="_blank" rel="noopener">Map ZIB openen in Google Drive</a>` : '',
    drive.toestemming === 'denied' ? '<button class="knop sec" data-actie="drive-rechten">Rechten beheren</button>' : '',
    gekoppeld ? '<button class="knop link" data-actie="drive-uit">Ontkoppelen in deze browser</button>' : '',
  ].join('');
  return `<div class="paneel" id="drive"><div class="paginakop" style="margin:0 0 8px"><h2>Google Drive</h2>${status}</div>
    <p>ZIB bewaart je dossiers als bestand in de map <b>ZIB</b> in je Google Drive. Elke opslag is een nieuwe versie; de tien nieuwste blijven staan, oudere gaan naar de prullenbak (30 dagen terug te halen). Bij het openen haalt ZIB de nieuwste versie op en voegt die samen met wat in deze browser staat: per dossier wint de nieuwste wijziging. Na een wijziging slaat ZIB binnen ongeveer twintig seconden op.</p>
    ${drive.bestand ? `<p class="dempen klein">Laatste versie: ${esc(drive.bestand)}${drive.versies ? ` · ${drive.versies} ${drive.versies === 1 ? 'versie' : 'versies'} in de map` : ''}</p>` : ''}
    ${drive.status === 'fout' ? melding('niet_akkoord', esc(drive.melding)) : ''}
    <div class="acties" style="margin-top:10px">${knoppen}</div>
    <div style="margin-top:12px">${melding('attentie', 'Alleen fictieve of geanonimiseerde dossiers: echte klantgegevens horen niet in een persoonlijke Google Drive.')}</div>
  </div>`;
}

export function renderDownloads() {
  return `${paginakop('Downloads', 'Back-ups, sjablonen en documentenlijsten.')}
    ${paneelDrive()}
    <div class="raster-2"${globalThis.ZIB_ARTIFACT ? ' style="margin-top:16px"' : ''}>
      <div class="paneel"><h2>Back-up</h2>
        <p>Exporteer alle dossiers, advieskantoren, taken en tickets als JSON-bestand. Bewaar het op een beveiligde locatie; het bestand bevat persoonsgegevens.</p>
        <div class="acties"><button class="knop" data-actie="export">Back-up downloaden</button>
          <label class="knop sec" style="cursor:pointer">Back-up terugzetten<input type="file" accept="application/json,.json" data-actie="import" style="display:none"></label></div>
        <p class="dempen klein" style="margin-top:10px">Geüploade bestanden (pdf's) zitten niet in de JSON; die staan in de bestandsopslag.</p>
      </div>
      <div class="paneel"><h2>Sjablonen</h2>
        <div class="acties"><button class="knop sec" data-actie="download-formats">Formats dossieraantekeningen (.txt)</button>
          <button class="knop sec" data-actie="download-doclijst" data-kader="NHG">Documentenlijst NHG</button>
          <button class="knop sec" data-actie="download-doclijst" data-kader="ABN">Documentenlijst ABN AMRO</button>
          <button class="knop sec" data-actie="download-grootboeksjabloon">Sjabloon grootboekimport (.csv)</button></div>
      </div>
    </div>
    ${renderRubrieken()}`;
}

/** Naslag: invoerposten voor alle rubrieken van het decimale rekeningschema en de ZIB-post waarop ze landen. */
export function renderRubrieken() {
  const post = (nr) => {
    const p = postVoorRekening(nr, 1);
    const pc = postVoorRekening(nr, -1);
    if (!p.sectie) return `<span class="dempen">${esc(p.opmerking || 'Niet overgenomen')}</span>`;
    const label = (x) => `${x.sectie === 'balans' ? 'Balans' : 'W&V'}: ${esc(POST_LABEL[x.k] || x.k)}`;
    return p.k === pc.k ? label(p) : `debet ${label(p)}<br>credit ${label(pc)}`;
  };
  return `<details class="stappen paneel-details"><summary>Invoerposten voor alle rubrieken (decimaal rekeningschema)</summary><div class="inhoud">
    <p class="dempen klein">Naslag voor het invoeren of importeren van een grootboek: per rekening de post in ZIB. Opmerkingen bij de import verschijnen in het voorbeeld.</p>
    <div class="scroll"><table class="tabel compact"><thead><tr><th>Rubriek</th><th>Subrubriek</th><th>Rekening</th><th>Post in ZIB</th></tr></thead><tbody>
    ${RUBRIEKEN.map((rb) => rb.sub.map((s, si) => s.rekeningen.map(([nr, l], ri) => `<tr>
      <td>${si === 0 && ri === 0 ? `<b>${esc(rb.nr)} ${esc(rb.label)}</b>` : ''}</td><td>${ri === 0 ? `${esc(s.nr)} ${esc(s.label)}` : ''}</td>
      <td class="nowrap">${esc(nr)} ${esc(l)}</td><td>${post(nr)}</td></tr>`).join('')).join('')).join('')}
    </tbody></table></div></div></details>`;
}

// ---------------------------------------------------------------------------
export function renderTickets() {
  const tickets = lijst('ticket').sort((a, b) => String(b.aangemaakt).localeCompare(String(a.aangemaakt)));
  const rijen = tickets.map((t) => `<tr class="klik" data-actie="open-ticket" data-id="${esc(t.id)}"><td><b>${esc(t.onderwerp)}</b></td>
    <td>${esc(t.door || '')}</td><td>${t.status === 'gesloten' ? pil('akkoord', 'Gesloten') : pil('attentie', t.status === 'in behandeling' ? 'In behandeling' : 'Open')}</td>
    <td class="nowrap">${esc(datumKort(t.aangemaakt))}</td><td>${(t.reacties || []).length}</td></tr>`).join('');
  return `${paginakop('Tickets', `${tickets.length} tickets`, '<a class="knop" href="#/hulp">Nieuw ticket</a>')}
    <div class="paneel" style="padding:0">${rijen ? `<div class="scroll"><table class="tabel"><thead><tr><th>Onderwerp</th><th>Gemeld door</th><th>Status</th><th>Datum</th><th>Reacties</th></tr></thead><tbody>${rijen}</tbody></table></div>` : leeg('Er zijn geen tickets.')}</div>`;
}

export function renderTicket(id) {
  const t = get(id);
  if (!t) return leeg('Ticket niet gevonden.');
  return `${paginakop(t.onderwerp, `Gemeld door ${esc(t.door || '')} op ${esc(fmt.tijdstip(t.aangemaakt))}`, '<a class="knop sec" href="#/tickets">Alle tickets</a>')}
    <div class="paneel"><p style="white-space:pre-wrap">${esc(t.bericht || '')}</p>
      <div class="raster-3" style="margin-top:10px">${keuze('Status', 'status', { open: 'Open', 'in behandeling': 'In behandeling', gesloten: 'Gesloten' }, t.status, { rec: t.id, render: true })}</div></div>
    ${(t.reacties || []).map((x) => `<div class="paneel"><b>${esc(x.door)}</b> <span class="dempen klein">${esc(fmt.tijdstip(x.at))}</span><p style="white-space:pre-wrap;margin-top:6px">${esc(x.tekst)}</p></div>`).join('')}
    <div class="paneel"><label class="veld"><span>Reactie</span><textarea id="ticket-reactie" rows="4"></textarea></label>
      <div class="acties" style="margin-top:10px"><button class="knop" data-actie="ticket-reageer" data-id="${esc(t.id)}">Reactie plaatsen</button></div></div>`;
}

// ---------------------------------------------------------------------------
export function renderMijnGegevens() {
  const p = state.profiel || {};
  const thema = (() => { try { return localStorage.getItem('zib.thema') || 'systeem'; } catch { return 'systeem'; } })();
  return `${paginakop('Mijn gegevens')}
    <div class="raster-2">
      <div class="paneel"><h2>Profiel</h2><div class="raster-3">
        ${veld('Naam', 'naam', p.naam, { rec: '__profiel' })}
        ${veld('Initialen', 'initialen', p.initialen, { rec: '__profiel' })}
        ${veld('E-mail', 'email', p.email, { rec: '__profiel', type: 'email' })}
        ${keuze('Rol', 'rol', { acceptant: 'Acceptant zakelijk inkomen', fiatteur: 'Fiatteur', adviseur: 'Adviseur', beheer: 'Beheer' }, p.rol || 'acceptant', { rec: '__profiel' })}
        ${keuze('Accreditatie', 'accreditatie', ACCREDITATIES, p.accreditatie || 'Medium', { rec: '__profiel', hint: 'Bepaalt welke dossierniveaus je mag fiatteren.' })}
      </div></div>
      <div class="paneel"><h2>Weergave</h2><div class="raster-3" style="grid-template-columns:1fr">
        <label class="veld"><span>Thema</span><select data-actie="thema"><option value="systeem"${thema === 'systeem' ? ' selected' : ''}>Volg systeem</option><option value="light"${thema === 'light' ? ' selected' : ''}>Licht</option><option value="dark"${thema === 'dark' ? ' selected' : ''}>Donker</option></select></label>
        ${keuze('ABN AMRO-dossiers openen in', 'weergaveABN', { viiz: 'ViiZ-weergave (volledige rekensoftware)', bzi: 'BZI-weergave (stappen van de rekentool van de bank)' }, p.weergaveABN || 'viiz', { rec: '__profiel', hint: 'Per dossier wissel je met de knoppen BZI / ViiZ in de kop.' })}
        <label class="veld"><span>Volgorde jaarkolommen</span><select data-actie="jaarvolgorde"><option value="recent"${ui.jaarVolgorde !== 'oud' ? ' selected' : ''}>Meest recente jaar links, oudste rechts</option><option value="oud"${ui.jaarVolgorde === 'oud' ? ' selected' : ''}>Oudste jaar links, meest recente rechts</option></select><small class="dempen">Geldt voor alle invoer- en overzichtstabellen.</small></label>
      </div></div>
      <div class="paneel"><h2>Opslag</h2>
        <p>Huidige opslag: <b>${esc(state.adapter?.omschrijving || '')}</b>${state.modus === 'cloud' ? ` (ingelogd als ${esc(state.me?.email || '')})` : ''}.</p>
        ${state.modus === 'lokaal' ? melding('attentie', 'Lokale opslag is gebonden aan deze browser en dit apparaat. Wissen van browsergegevens betekent dat de dossiers weg zijn. Gebruik de cloudopslag of maak regelmatig een back-up.') : melding('akkoord', 'Gegevens worden centraal opgeslagen; elke wijziging bewaart ook de vorige versie.')}
        <label class="veld" style="margin-top:12px"><span>Voorkeur</span><select data-actie="opslagvoorkeur"><option value="auto"${opslagvoorkeur() === 'auto' ? ' selected' : ''}>Automatisch (cloud als beschikbaar)</option><option value="lokaal"${opslagvoorkeur() === 'lokaal' ? ' selected' : ''}>Altijd lokaal</option></select></label>
        ${state.modus === 'lokaal' ? `<div class="acties" style="margin-top:12px"><button class="knop sec" data-actie="demo-laden">Demodossiers laden</button>
          <button class="knop gevaar" data-actie="lokaal-wissen">Alle lokale gegevens wissen</button></div>` : ''}
      </div>
      <div class="paneel"><h2>Over ZIB</h2><p>Rekenkern volgens het NHG-toetskader Inkomensverklaring Ondernemer (01.2026) en het ABN AMRO Woonbeleid voor zakelijk inkomen. Het berekende inkomen is een hulpmiddel; de beoordeling en motivering blijven bij de acceptant.</p></div>
    </div>`;
}

// ---------------------------------------------------------------------------
export function renderLogin() {
  return `<div class="inloggen"><div class="paneel">
    <div class="woordmerk-groot">ZIB</div>
    <p class="dempen" style="margin:10px 0 18px">Bepaling van bestendig zakelijk inkomen volgens het NHG-toetskader en het ABN AMRO Woonbeleid.</p>
    <div class="raster-3" style="grid-template-columns:1fr">
      <label class="veld"><span>Naam</span><input id="login-naam" type="text" autocomplete="name" placeholder="Bijv. A. de Groot"></label>
      <label class="veld"><span>Initialen</span><input id="login-initialen" type="text" placeholder="AdG"></label>
      <label class="veld"><span>Accreditatie</span><select id="login-accreditatie">${ACCREDITATIES.map((a) => `<option${a === 'Medium' ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
    </div>
    <div class="acties" style="margin-top:16px"><button class="knop" data-actie="login">Aanmelden</button></div>
    <p class="dempen klein" style="margin-top:14px">Lokale modus: aanmelden legt alleen je naam vast in deze browser. In de cloudversie log je in via Cloudflare Access.</p>
  </div></div>`;
}
