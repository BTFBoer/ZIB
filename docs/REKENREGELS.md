# Rekenregels

Dit document beschrijft wat de rekenkern (`public/js/engine/`) doet, per kader. Waar een beleidstekst ruimte laat, staat de gekozen interpretatie erbij. Parameters staan in `kaders.js` (per kader, inclusief de dubbele balanstoets in `dbt`); de totaalberekeningen van ASN Bank, Knab en Optimaal in `totaal.js`.

ZIB kent vijf kaders: NHG, ABN AMRO, ASN Bank (voorheen de Volksbank), Knab en Optimaal. De rekenkern vergelijkt nergens op de naam van een kader maar leest parameters (`familie`, `totaal`, `correctieModel`, `toetsen`, `box2.model`, `overwinst`, `dbt`, ...). Per dossier zijn de parameters die een kader als `instelbaar` aanmerkt aan te passen; `vergelijkKaders(dossier)` rekent hetzelfde dossier volgens alle kaders door (zonder handmatig afwijkend inkomen).

Afronding: tussenstappen worden op hele euro's afgerond, zoals in gangbare rapportages ((18.519 + 25.091 + 11.731) / 3 = 18.447). Ratio's op twee decimalen, percentages op één decimaal.

Inhoud: [Gemeenschappelijk](#gemeenschappelijk) · [Overwinst en dubbele balanstoets](#overwinst-en-dubbele-balanstoets) · [NHG](#nhg--toetskaders-inkomensverklaring-ondernemer-012026) · [ABN AMRO](#abn-amro--woonbeleid-zakelijk-inkomen) · [ASN Bank](#asn-bank--risk-policy-v15) · [Knab](#knab--concept-toetskader-2024013) · [Optimaal](#optimaal--eigen-referentiekader) · [Structuur en organogram](#structuur-en-organogram) · [Geldstromen](#geldstromen) · [0-verklaring](#0-verklaring) · [Eindoordeel](#eindoordeel) · [Weergave](#weergave-en-jaarvolgorde)

## Gemeenschappelijk

### Toetsjaren, controlejaar en meetellen

- Laatste toetsjaar (TJr-1) standaard: het vorige kalenderjaar vanaf de datum waarop definitieve cijfers verplicht zijn (NHG 1 mei, ABN AMRO 1 juli), anders het jaar daarvoor. Handmatig te overschrijven.
- Controlejaar: het jaar na het laatste toetsjaar, zodra daar cijfers (W&V, balans of loon) voor zijn ingevoerd. Uit te zetten.
- Meetellen: per onderneming en per jaar is een jaar uit te vinken (zoals het vinkje in de rekentool van de bank). Jaren vóór de start tellen niet mee; het controlejaar telt nooit mee in een gemiddelde.
- Extrapolatiefactor: 360 / aantal dagen van de tussentijdse periode volgens 30/360. 01-01 t/m 31-05 = 150 dagen = factor 2,4.
- Duur ondernemerschap: 30/360 vanaf de KvK-datum (of de eerdere start activiteiten). 19-05-2021 tot 03-06-2024 = 3 jaar, 0 maanden en 14 dagen. Voor de starterregels bij ABN AMRO telt het aantal maanden tot en met 31 december van het laatste toetsjaar.
- Kort boekjaar: beslaat een toetsjaar minder dan 11,5 maanden (bijvoorbeeld een eerste boekjaar vanaf de oprichting), dan meldt ZIB dat met de periode. De cijfers worden niet naar 12 maanden herleid; de acceptant beslist of het jaar meetelt.
- Geldigheid: datum vaststelling + 6 maanden - 1 dag.

### Detailbalans of totaalposten

Een jaar kan worden ingevoerd als volledige balans en W&V (ViiZ-weergave) of als totaalposten zoals in de rekentool van de bank: omzet, nettowinst (NHG: ook winst vóór belasting), eigen vermogen, balanstotaal, vlottende activa en kort vreemd vermogen. Bij totaalposten leidt ZIB de automatische correcties af uit de opgegeven samenstelling van de vlottende activa (R/C directie, niet vrij beschikbare liquide middelen); de overige correcties voer je per type in.

### Box 1 per jaar

| Soort | Basis | Correcties |
|---|---|---|
| IB-ondernemer (ez, vof, maatschap, cv) | Saldo fiscale winst uit de IB-aangifte; zonder aangifte (bijv. lopend jaar) de nettowinst × winstaandeel | Zie per kader; bedrijfscorrecties × winstaandeel, bijtelling auto volledig |
| Niet-IB (DGA) | Loon uit de IB-aangifte; zonder aangifte het salaris DGA uit de V&W | Bijtelling auto (NHG: alleen laatste toetsjaar en lopend jaar; ABN AMRO: alle jaren) |

Incidentele baten en lasten: leeg in Diversen = de bijzondere baten/lasten uit de V&W. Vul 0 in als ze niet incidenteel zijn.

### Winstgevendheid

Nettowinst uit de V&W, gecorrigeerd voor incidentele posten (en bij ABN AMRO de cashflowcorrectie). De bijtelling auto is een fiscale post en wordt alleen op box 1 gecorrigeerd.

### Liquiditeit en solvabiliteit

- Current ratio = vlottende activa na correcties / kort vreemd vermogen na correcties. Zonder kortlopende schulden: n.v.t. (voldoet).
- Werkkapitaal (liquiditeitsruimte) = vlottende activa na correcties - kort vreemd vermogen na correcties.
- Solvabiliteit = aansprakelijk vermogen (eigen vermogen na correcties) / balanstotaal na correcties. Zonder balans: n.v.t.
- Solvabiliteitsruimte = (aansprakelijk vermogen - norm × balanstotaal na correcties) / (1 - norm): het bedrag dat aan het vermogen kan worden onttrokken voordat de solvabiliteit onder de norm komt.

### Maximaal te onttrekken en benodigd box 3

Op de meest recente balans (controlejaar als daar een balans voor is, anders het laatste toetsjaar):

- Maximaal te onttrekken = laagste van VA - norm × KVV, (EV - s × TV) / (1 - s), VA - KVV en VA.
- Benodigd box 3 = hoogste van norm × KVV - VA en (s × TV - EV) / (1 - s).

## Overwinst en dubbele balanstoets

Overwinst is de winst die in de vennootschap is achtergebleven. Wie die tot het inkomen rekent, gaat ervan uit dat ze als dividend had kunnen worden uitgekeerd. De dubbele balanstoets stelt daarom naast de werkelijke balans een tweede balans op waarin de overwinst fictief is onttrokken aan het eigen vermogen, het balanstotaal en de vlottende activa. Voldoet de onderneming op die balans niet meer aan de normen, dan wordt de overwinst verlaagd tot het bedrag waarbij de normen nog net worden gehaald.

ZIB berekent de overwinst voor elke vennootschap waarvoor box 2 relevant is (NHG: meegenomen BV's; ABN AMRO: hoofdbedrijven met rechtsvorm BV/NV) en toont haar ook als ze niet wordt meegenomen, zodat zichtbaar is wat erin zit.

### Stap 1: overwinst per jaar

| | NHG (route 2) | ABN AMRO (niet-uitgekeerd dividend) |
|---|---|---|
| Winstbegrip | Winst vóór belasting na correcties (incl. resultaat deelnemingen) | Nettowinst na correcties (incl. cashflowcorrectie) |
| Dividenduitkering | Dividenduitkering ten laste van het boekjaar (Diversen); niet ingevuld: box 2-dividend van de aanvrager / belang | idem |
| Overwinst per jaar | max(0, winst - min(max(0, winst), uitkering)) | idem |
| Gemiddelde over | De drie toetsjaren | De meegetelde toetsjaren |
| Controlejaar | Geëxtrapoleerde overwinst is een extra maximum | idem |

Basis = laagste van de gemiddelde overwinst en de overwinst in het laatste toetsjaar (niet negatief).

### Stap 2: dubbele balanstoets

Per getoetst jaar, met EV = aansprakelijk vermogen, TV = balanstotaal, VA = vlottende activa en KVV = kort vreemd vermogen (alle na correcties), n = solvabiliteitsnorm, r = norm current ratio en k = aantal jaren onttrekking (1, of cumulatief zie hieronder):

- Maximale overwinst solvabiliteit: (EV - k × O) / (TV - k × O) ≥ n ⇔ O ≤ (EV - n × TV) / ((1 - n) × k).
- Maximale overwinst liquiditeit, methode current ratio: (VA - k × O) / KVV ≥ r ⇔ O ≤ (VA - r × KVV) / k. Zonder kort vreemd vermogen: VA / k.
- Maximale overwinst liquiditeit, methode werkkapitaal: laagste van het gemiddelde werkkapitaal over de toetsjaren met een balans, het werkkapitaal in het laatste toetsjaar en (als het controlejaar wordt getoetst) het werkkapitaal in het controlejaar, elk gedeeld door k.
- Maximum dubbele balanstoets = laagste van solvabiliteit en liquiditeit over de getoetste jaren (niet negatief). Zonder balans in het te toetsen jaar: € 0.

| Instelling | NHG (vast, volgens het toetskader) | ABN AMRO (standaard, per hoofdbedrijf aan te passen) |
|---|---|---|
| Solvabiliteitsnorm | 25% | 20% (keuze 15%, 20% of 25%) |
| Liquiditeit | Werkkapitaal: gemiddeld, maximaal laatste jaar | Current ratio ≥ 1 na onttrekking (keuze: werkkapitaal) |
| Getoetste jaren | Laatste toetsjaar | Laatste toetsjaar (keuze: alle toetsjaren) |
| Tussentijdse balans | Nee | Ja, als er een balans van het controlejaar is |
| Cumulatief | Nee | Nee (keuze: ja) |

Cumulatief: wie elk jaar de overwinst had uitgekeerd, heeft in het tweede toetsjaar al twee keer onttrokken. In toetsjaar i (1, 2 of 3) is k = i; in het controlejaar k = 3. Dit is strenger dan de standaard en bedoeld voor dossiers waarin de overwinst structureel in de onderneming achterblijft.

De interpretatie voor ABN AMRO: het Woonbeleid vraagt dat de onderneming na de uitkering nog voldoet aan de solvabiliteits- en liquiditeitseisen (uitkeringstest) en dat er voldoende vrij uitkeerbare reserves zijn (balanstest). De dubbele balanstoets is de rekenkundige uitwerking van de uitkeringstest; de normen zijn die van het toetskader (20% en 1). Wijk je af, motiveer dat dan in de notities.

### Stap 3: balanstest (ABN AMRO)

Vrij uitkeerbare reserves in de meest recente getoetste balans: agio, winstreserve en overige reserves inclusief het onverdeeld resultaat, zonder het geplaatst kapitaal en zonder de herwaarderingsreserve en wettelijke of statutaire reserves (als die in de uitsplitsing van "Overig" staan). Bij totaalposten gebruikt ZIB het aansprakelijk vermogen als benadering en vermeldt dat.

### Stap 4: vaststelling

- Overwinst na dubbele balanstoets = laagste van de basis, het maximum van de dubbele balanstoets, de overwinst in het controlejaar (indien aanwezig) en de vrij uitkeerbare reserves (ABN AMRO).
- NHG: × belang × 75% (afslag 25%). ABN AMRO: × belang.
- De uitkomst telt alleen mee als alle voorwaarden akkoord zijn.

| Voorwaarde | NHG | ABN AMRO |
|---|---|---|
| Zeggenschap | Belang > 50% of aangetoonde zeggenschap | Belang 100% of aangetoond zelfstandig bevoegd (bijv. vast dividendbeleid) |
| Duur | ≥ 36 maanden ondernemer | ≥ 3 boekjaren |
| Winst | Laatste jaar en een van de voorgaande jaren positief | Laatste boekjaar positief |
| Kasstroom | n.v.t. | Vrije kasstroom voldoende en onderbouwd (vinkje), de uitkering brengt de investerings- of financieringsbehoefte niet in gevaar |

Benodigde balansversterking (indicatief): het bedrag dat in de meest recente balans gestort moet worden om de volledige basis door de toets te krijgen. Een storting verhoogt EV, TV en VA met hetzelfde bedrag, dus: solvabiliteit basis - maximum solvabiliteit; current ratio basis - maximum liquiditeit; werkkapitaal het hoogste van aantal jaren × (basis - gemiddeld werkkapitaal) en basis - werkkapitaal laatste jaar. Een strengere toets in een eerder jaar los je hiermee niet op.

### Voorbeeld (ABN AMRO, fictief)

Holding BV, belang 100%, drie jaar nettowinst € 100.000, box 2-dividend € 20.000 en DGA-loon € 60.000 per jaar. Balans laatste jaar (totaalposten): EV € 300.000, balanstotaal € 600.000, VA € 200.000, KVV € 150.000.

| Stap | Berekening | Uitkomst |
|---|---|---|
| Overwinst per jaar | 100.000 - 20.000 | € 80.000 |
| Basis | laagste van gemiddeld 80.000 en laatste jaar 80.000 | € 80.000 |
| Solvabiliteit ≥ 20% | (300.000 - 20% × 600.000) / 80% | € 225.000 |
| Current ratio ≥ 1 | 200.000 - 1 × 150.000 | € 50.000 |
| Balanstest | aansprakelijk vermogen (benadering) | € 300.000 |
| Na dubbele balanstoets | laagste van 80.000, 225.000, 50.000 en 300.000 | € 50.000 |
| Controle na onttrekking | EV 250.000 / TV 550.000 = 45,5%; VA 150.000 / KVV 150.000 = 1,00 | voldoet |
| Benodigde balansversterking | 80.000 - 50.000 | € 30.000 |

Met de instelling cumulatief en alle toetsjaren wordt het maximum liquiditeit 50.000 / 3 = € 16.667 in het laatste toetsjaar. Hoe dit doorwerkt in het inkomen staat bij [ABN AMRO, dividend](#dividend-en-overwinst).

## NHG – Toetskaders Inkomensverklaring Ondernemer 01.2026

### Voorwaarden

| Voorwaarde | Regel |
|---|---|
| Duur | ≥ 12 maanden na KvK-inschrijving (of aantoonbaar eerder actief) |
| Definitieve cijfers | Vanaf 1/5 over het vorige jaar |
| Lopend jaar | Vanaf 1/8 tussentijdse W&V verplicht, met positief resultaat |
| Winstgevendheid | Laatste boekjaar ≥ 0 (en lopend jaar geëxtrapoleerd ≥ 0) |
| Liquiditeit | Current ratio ≥ 1,00 na correcties (laatste jaar en lopend jaar met balans) |
| Solvabiliteit | ≥ 25% volgens het bandbreedtemodel (hieronder) |
| Buitenland | Gevestigd en belastingplichtig in Nederland, Nederlandse rechtsvorm |
| DGA | Belang ≥ 5% (anders geen niet-IB ondernemer) |

### Bandbreedtemodel

| Laatste jaar | Uitkomst |
|---|---|
| ≥ 30% | Akkoord |
| 25-30%, daling > 10% t.o.v. vorig jaar | Tussentijdse cijfers nodig; lopend jaar ≥ laatste jaar → akkoord, anders niet akkoord |
| 25-30%, geen daling > 10% | Akkoord |
| 20-25% | Tussentijdse cijfers nodig met ≥ 25% |
| < 20% | Niet akkoord |

Een tussentijdse solvabiliteit onder 25% is altijd niet akkoord.

### Balanscorrecties

| Post | EV | TV | VA | KVV |
|---|---|---|---|---|
| Immateriële vaste activa (behalve goodwill "behorend tot EV") | - | - | | |
| R/C DGA ≥ € 17.500 (niet-IB) | - | - | - | |
| Lening u/g aan DGA, niet gedekt door eigen woning/box 3 OG (niet-IB) | - | - | | |
| Pensioen in eigen beheer / ODV, stamrecht (niet-IB) | + | | | |
| Schulden aan DGA en participanten (niet-IB) | + | | | - (kort deel) |
| Vorderingen op groepsmaatschappijen | - | - | - (kort) | |
| Schulden aan groepsmaatschappijen | + | | | - (kort deel) |
| Voorziening latente belastingen | + | | | |
| Latente belastingvorderingen | - | - | - (kort) | |
| Achtergestelde leningen | + | | | |
| Stille reserve OG (WOZ/taxatie - boekwaarde) | + | + | | |
| Box 3 vermogen ingezet | + | + | + | |
| Surplus werkkapitaal ontvangen / ingezet | + / - | + / - | + / - | |

De FOR staat in de quick-scan onder eigen vermogen en wordt daarom niet nogmaals gecorrigeerd.

### Correcties op het inkomen (IB)

Investeringsaftrek +, beperkt/niet aftrekbare kosten -, incidentele baten -, incidentele lasten + (alleen indien fiscaal van aard), willekeurige afschrijving +, bijtelling auto -, overige ±.

### Inkomensberekening

Op totaalniveau (alle meegenomen ondernemingen plus meegenomen loon, uitkeringen en ROW per jaar):

1. Basisinkomen = laagste van het gemiddelde van de 3 toetsjaren en het laatste toetsjaar.
2. Lopend jaar: geëxtrapoleerd inkomen lager → inkomen naar beneden bijstellen. Nooit verhogen.
3. Vervanging (optioneel, vanaf 1/4): B = gemiddelde van TJr-2, TJr-1 en het gerealiseerde resultaat lopend jaar. Daarna:
   - a) TJr-1 < B én TJr-1 > gerealiseerd → aftoppen op TJr-1;
   - b) gerealiseerd < B → aftoppen op gerealiseerd, tenzij (c) TJr-1 > B;
   - d) geëxtrapoleerd < B → aftoppen op geëxtrapoleerd;
   - uitkomst = laagste van a, b en d. Dit reproduceert de zes voorbeelden uit bijlage II.
4. Loondienst ≥ 80%: ondernemersinkomen maximaal A + B, met A = (100/y) × loon × 30% en B = ((100 - y)/100) × fulltime loon. Bij 80% en € 36.000: € 22.500.

Loondienstinkomen vóór de start (zelfde branche) en naast de onderneming kan worden meegenomen; een gestegen loon (situatie 3) wordt gesignaleerd.

### Box 2 (DGA, ≥ 36 maanden)

- Route 1, uitgekeerd dividend: gemiddelde bruto dividend 3 jaar, max. laatste jaar; begrensd op de gemiddelde winst vóór belasting (max. laatste jaar) × belang.
- Route 2, nog niet uitgekeerde winstreserve: de overwinst na de dubbele balanstoets × belang × 75%, zie [Overwinst en dubbele balanstoets](#overwinst-en-dubbele-balanstoets). Ter controle: met een balans van EV € 253.026, balanstotaal € 256.331 en werkkapitaal € 75.455 is het maximum solvabiliteit (253.026 - 25% × 256.331) / 75% = € 251.924 en het maximum liquiditeit € 75.455.
- Uitzonderingsroute: route 1 + route 2, maximaal 75% van de gemiddelde winst (max. laatste jaar) × belang.

## ABN AMRO – Woonbeleid zakelijk inkomen

De rekentool van de bank (BZI) werkt per hoofdbedrijf: het hoofdbedrijf met al zijn deelnemingen vormt één toetskader, en het berekend inkomen is een gemiddelde. ZIB rekent dezelfde uitkomst uit, met de diepgang van de rekensoftware (volledige balans, correcties per post, rekenstappen), en toetst daarnaast het Woonbeleid. Verschillen tussen beide leiden tot een voorstel voor een afwijkend inkomen met de rekenkundige onderbouwing.

### Voorwaarden

| Voorwaarde | Regel |
|---|---|
| Duur | < 12 maanden: geen inkomen |
| Definitieve cijfers | Vanaf 1/7 de afgelopen drie boekjaren |
| Lopend jaar | Vanaf 1/8 tussentijdse cijfers (signalering) |
| Winst | IB: saldo fiscale winst laatste jaar positief én in een van de twee jaren daarvoor. DGA: idem netto resultaat |
| DGA | Belang ≥ 20% direct of indirect |
| Solvabiliteit | Richtlijn ≥ 20% in het laatste jaar, of gemiddelde solvabiliteitsruimte over 3 jaar ≥ 0 (interpretatie van "of in de afgelopen 3 jaren") |
| Liquiditeit | Richtlijn ≥ 1 in het laatste jaar, of gemiddelde liquiditeitsruimte over 3 jaar ≥ 0; bij een DGA vlottende activa minus R/C directie |
| Buitenland | Gevestigd in NL, BE, DE of LU |
| Beroepsregister | Zorg, accountancy, advocatuur, notariaat: inschrijving controleren |

Toetskader per hoofdbedrijf: het slechtste oordeel van het hoofdbedrijf en de niet-geconsolideerde deelnemingen (een geconsolideerde deelneming zit al in de cijfers van de aandeelhouder). Net als in de rekentool blijven alle deelnemingen in het toetskader; bij een indirect belang onder 20% vermeldt ZIB dat het belang vooral relevant is voor de risicobeoordeling en de geldstromen.

### Correcties

- Inkomen IB: bijtelling auto -, cashflowcorrectie - (contractuele aflossingen minus afschrijvingen, alleen als positief; gemotiveerd uit te zetten), incidentele baten -, incidentele lasten +.
- Inkomen DGA: loon - bijtelling (alle jaren). Correcties op de winst werken door in winstgevendheid en dividend.
- Balans: immateriële vaste activa negatief. Goodwill bij medisch specialisten, huisartsen, tandartsen, verloskundigen, apothekers, advocaten, notarissen en accountants niet; bij fysiotherapeuten voor 25%. Bij een DGA ook R/C directie en lening directie (activa) negatief. Positieve correcties alleen bij NHG; ZIB signaleert ze in een ABN AMRO-dossier.

### Berekend inkomen en toets Woonbeleid per hoofdbedrijf

| | Berekend inkomen (zoals de rekentool) | Toets Woonbeleid |
|---|---|---|
| Basis | Gemiddelde over de meegetelde jaren van het DGA-inkomen (loon - bijtelling) of het saldo fiscale winst na correcties | Laagste van het gemiddelde en het laatste boekjaar |
| Dividend | + gemiddeld box 2-dividend over de meegetelde jaren, maximaal de gemiddelde nettowinst × belang (een gemiddeld verlies verlaagt het inkomen; afgeleid uit de uitkomst van de rekentool in een praktijkdossier) | + dividend volgens 3.63 (hieronder), inclusief overwinst als die wordt meegenomen, of de holdingroute |
| < 1 boekjaar | € 0 | € 0 |
| 1-2 boekjaren | Gemiddelde | 75% van het gemiddelde, maximaal de prognose (RA/AA) |
| 2-3 boekjaren | Gemiddelde | 90% van het gemiddelde, maximaal de prognose |
| ≥ 3 boekjaren | Gemiddelde | Laagste van gemiddelde en laatste jaar |

De starterafslag past het acceptatiesysteem toe op het berekend inkomen; daarom geeft ZIB het berekend inkomen zonder afslag af en vergelijkt het met de toets Woonbeleid vóór afslag. De prognose is het opgegeven bedrag of de prognose in de W&V van het lopende jaar × belang.

Af te geven per hoofdbedrijf:

1. 0-inkomen gekozen of hoofdbedrijf niet meegenomen → € 0 (de structuur telt mee in de risicobeoordeling).
2. Afwijkend inkomen vastgelegd → dat bedrag (motivatie verplicht).
3. Korter dan 1 boekjaar → geen inkomen.
4. Anders het berekend inkomen. Voldoet het toetskader niet, dan blijft het berekend inkomen zichtbaar (zoals in de rekentool) met een melding; de acceptant beslist.

Ligt het inkomen volgens het Woonbeleid lager dan het berekend inkomen (laatste jaar lager, dividendplafond of prognose), of hoger doordat er overwinst wordt meegenomen, dan stelt ZIB een afwijkend inkomen voor. De knop "Overnemen als afwijkend inkomen" vult het bedrag, de motivatie en de rekenkundige onderbouwing in en zet die in de conclusie van de notities. De onderbouwing bevat: het berekend inkomen, het inkomen per jaar (recent eerst), de toets Woonbeleid, het uitgekeerde dividend, de overwinst per jaar, de dubbele balanstoets, het belang en het totaal, met plaatshouders voor bestendigheid en documentatie.

### Dividend en overwinst

Alleen bij een hoofdbedrijf met rechtsvorm BV/NV en ≥ 3 boekjaren:

- Uitgekeerd dividend: laagste van het gemiddelde en het laatste bruto dividend over de drie toetsjaren, maximaal de gemiddelde nettowinst (max. laatste jaar) × belang. Uit te zetten.
- Niet-uitgekeerd dividend: de overwinst na de dubbele balanstoets × belang, alleen als "Overwinst meenemen" is aangevinkt en alle voorwaarden akkoord zijn. Zie [Overwinst en dubbele balanstoets](#overwinst-en-dubbele-balanstoets).
- Dividendplafond: uitgekeerd + niet-uitgekeerd samen maximaal de gemiddelde nettowinst (max. laatste jaar) × belang.
- Holdingroute (per hoofdbedrijf aan te zetten): de persoonlijke holding ontvangt structureel dividend uit een minderheidsdeelneming (≤ 50%). Inkomen = DGA-loon + het ontvangen dividend (gemiddelde van drie jaar, maximaal het laatste jaar); uitkering en winst van de holding tellen dan niet mee. Het ontvangen dividend komt uit de geldstromen, anders uit het uitgekeerde interne dividend × het belang van dat jaar. Zonder dividend in alle drie de jaren: attentie (bestendigheid onderbouwen).

In het voorbeeld hierboven: uitgekeerd € 20.000 + overwinst € 50.000 = € 70.000 (onder het plafond van € 100.000). Berekend inkomen volgens de rekentool 60.000 + 20.000 = € 80.000; volgens het Woonbeleid 60.000 + 70.000 = € 130.000. Omdat de rekentool geen niet-uitgekeerd dividend kent, wordt € 130.000 vastgelegd als afwijkend inkomen met de onderbouwing.

### Overige regels

- Resultaat uit overige werkzaamheden (3.69): laagste van gemiddelde en laatste jaar, opgeteld bij het totaal.
- Nog te ontvangen dividend per ultimo van het laatste toetsjaar (overlopende activa): attentie, want het dividend is niet in liquide middelen ontvangen.
- Geëxtrapoleerd inkomen in het controlejaar onder het gemiddelde: attentie, beoordeel de bestendigheid.

### R/C directie (maandlast)

Saldo × rente / 12. Geen maandlast bij een aangetoond kasrondje of een saldo dat het hele jaar onder € 17.500 bleef. Ter vergelijking toont ZIB 2% van de limiet per maand.

### BZI-invoer

Het tabblad BZI-invoer zet de uitkomst om naar de velden van de rekentool, per bedrijf en per jaar (recent links):

| Rekentool | Uit ZIB |
|---|---|
| Vinkje meetellen, t/m (lopend jaar), status, percentage aandeel | Instelling per jaar, einddatum tussentijdse periode, status van de cijfers, belang |
| Privé-onttrekkingen (alleen hoofdbedrijf) | DGA-inkomen, bijtelling (negatief) en box 2-dividend uit de IB-aangifte; bij een IB-ondernemer het saldo fiscale winst |
| Omzet, nettowinst | Totalen uit de V&W (vóór correcties) |
| Management fee, intern dividend (deelneming) | Ingevoerde bedragen; intern dividend × belang van de aandeelhouder |
| Winstcorrecties | Automatische en handmatige correcties per type (incidenteel, cashflow, resultaat deelneming, overig), met teken |
| Eigen vermogen, balanstotaal, vlottende activa, kort vreemd vermogen | Totalen uit de balans (vóór correcties); rekenknop G-rekening als die er is |
| Vermogenscorrecties | Automatische correcties uit de detailbalans omgezet naar het type van de rekentool (bijv. immateriële activa, R/C directie, lening directie, overige vlottende/vaste activa), met het effect op het aansprakelijk vermogen |
| Controle | Nettowinst, aansprakelijk vermogen, balanstotaal, VA en KVV na correctie, solvabiliteit en liquiditeit zoals de rekentool ze zou moeten tonen |

Daaronder per hoofdbedrijf het verwachte berekend inkomen, het inkomen volgens het Woonbeleid en het advies (berekend inkomen, afwijkend inkomen of 0-inkomen), met de onderbouwing om te kopiëren.

## ASN Bank – Risk Policy v1.5

Bron: de Volksbank, Risk Policy "Vaststellen zakelijk inkomen door een geaccrediteerde partij", versie 1.5 (1 juli 2024), aangevuld met de openbare informatie van ASN Bank (2026). Sinds 1 juli 2025 heet de Volksbank ASN Bank. Het document is intern (voor de geaccrediteerde partijen); ZIB beschrijft de regels in eigen woorden.

- Inkomen (§3.1/3.2): gemiddelde van drie boekjaren, maximaal het laatste jaar. IB: saldo fiscale winst; een verlies telt mee. DGA: gemiddeld loon; een verlies van de BV (na correcties × belang) telt mee in het jaar zelf; het maximum is loon plus resultaat na Vpb van het laatste jaar.
- Box 2 (§3.2), bij meer dan 50% zeggenschap en ≥ 36 maanden: gemiddelde winst na Vpb × belang (alleen winstjaren; verliezen zitten al in box 1), begrensd door de dubbele balanstoets (current ratio ≥ 1 en solvabiliteit ≥ 20% na onttrekking, laatste balans), plus het gemiddeld uitgekeerde dividend (per jaar maximaal de winst na Vpb). Het totaal is maximaal loon + winst na Vpb van het laatste jaar (zonder winst: loon + dividend). Interpretatie: de policy noemt winst én dividend; de begrenzing voorkomt dat een uitgekeerde winst dubbel telt.
- Minderheidsbelang: alleen een jaarlijks terugkerend dividend uit één minderheidsdeelneming (expert judgement, per onderneming aan te vinken), gemiddeld en maximaal het laatste jaar.
- Structuur (§3.3): maximaal drie entiteiten (geconsolideerd telt als één) en maximaal twee minderheidsdeelnemingen; anders niet akkoord (bij een bestaande relatie attentie).
- Correcties (§3.6): de NHG-set, met als verschillen: alle immateriële activa (ook goodwill) negatief; bijtelling auto alleen het deel boven 15% van winst of loon; R/C directie vanaf € 17.500 minimaal 2% (of de werkelijke rente) op het loon, tenzij kasrondje; vervallen huurlasten voor 85% van de kale huur positief.
- Ratio's: laatste boekjaar positief, current ratio ≥ 1, solvabiliteit ≥ 20%. Herstel in het lopende jaar (tussentijdse balans): attentie, tweede fiat (§3.10).
- Lopend jaar: geen verplichte toets; een lager geëxtrapoleerd inkomen geeft een attentie. Vanaf 1 april kan het lopende jaar het oudste vervangen op basis van het werkelijke aantal maanden: (TJr-2 + TJr-1 + gerealiseerd) / (24 + maanden) × 12, maximaal het laatste volledige jaar.
- Starters (§3.7), 12-36 maanden: inkomen over de werkelijke maanden (inclusief het lopende jaar) × 12, × 75% (12 maanden definitieve cijfers) of 90% (24 maanden); het startjaar vervalt bij twee volle boekjaren; maximaal het laatste volledige jaar en de prognose (die kan alleen verlagen). Voorbeeld uit de policy: (15.000 + 20.000 + 15.000) / 30 × 12 × 90% = € 18.000. Bij partnerschap waar de aanvrager werknemer was of een leidinggevende functie in de overgenomen onderneming telt loon vóór de start mee; met een trackrecord van drie jaar vervalt de afslag (§3.4).
- Incidenteel jaar (§3.8): één toetsjaar mag worden vervangen door de geëxtrapoleerde tussentijdse cijfers; voorleggen aan een senior specialist.
- Loondienst ≥ 80%: maximaal 30% (§3.11). Loon naast de onderneming telt niet mee in het zakelijk inkomen.

## Knab – concept toetskader 2024.013

Bron: Knab, Concept toetskader zakelijk inkomen versie 2024.013 met werkinstructies (25 april 2024) en de lijst risicosectoren. Het is een conceptversie; controleer of Knab deze heeft vastgesteld.

- Box 1 (B.1.1): 1-2-3-methode, (1 × oudste + 2 × middelste + 3 × laatste) / 6, maximaal het laatste jaar en maximaal 10% boven het gewone gemiddelde. Het totaal is maximaal 20% boven het NHG-inkomen (B.1.1.0; ZIB rekent het NHG-inkomen van hetzelfde dossier mee).
- Dividend (B.4.1, route 1): per jaar in het totaalinkomen, per jaar maximaal de winst vóór belasting × belang. Overwinst (B.4.2, route 2): winst vóór belasting na correcties (niet verminderd met dividend), 75%, na dubbele balanstoets (werkkapitaal alle jaren, solvabiliteit ≥ 25% in het laatste jaar en het controlejaar). Combinatie: dividend en overwinst samen maximaal 75% van de gemiddelde winst.
- Lopend jaar (B.1.3): conform NHG; voor de vergelijking telt het gemiddelde dividend bij het geëxtrapoleerde inkomen (dividend wordt niet geëxtrapoleerd). Vervangen vanaf 1 april: het vervangende jaar telt 3× in de 1-2-3, maximaal 10% boven 1-1-1, daarna de stappen a, b en d van NHG.
- Dalende trend (B.1.2.1): inkomen > € 10.000 en > 40% daling van oudste naar laatste én > 20% van middelste naar laatste jaar: attentie (prognose NBA 3400, verklaring boekhouder).
- Starters (B.2): vanaf 12 maanden. Zonder relevant voorafgaand dienstverband: gemiddelde over de actieve jaren × 80% (12-24 maanden) of 90% (24-36), maximaal het laatste jaar en de prognose; het startjaar na 1 juli telt niet mee; de 10%- en 20%-grens gelden niet. Met relevant dienstverband (zelfde branche én vergelijkbare activiteiten): loon + zakelijk inkomen via 1-2-3, zonder afslag.
- Beletperiode (D.1): zwangerschap, ziekte, calamiteit (max. 12 maanden, minimaal 6 maanden geleden, alleen bij ≥ 36 maanden): het jaar wordt vervangen door het laagste omliggende jaar; het inkomen is maximaal het (geëxtrapoleerde) inkomen ná het belet.
- Correcties (B.3/C): de NHG-set; incidentele lasten ook als ze niet fiscaal van aard zijn; bijtelling auto alleen boven 15%; lasten R/C directie (≥ € 17.500) en lening directie minimaal 2% per jaar, tenzij kasrondje.
- Ratio's (C): winst ≥ 0, current ratio ≥ 1, werkkapitaal ≥ 0 in het laatste jaar en/of het controlejaar; solvabiliteit IB 15/20/25%, DGA 20/25/30% (bandbreedte).
- Sectoren: SBI-codes uit de lijst risicosectoren zijn niet akkoord (Nee) of attentie (voorleggen).

## Optimaal – eigen referentiekader

Een eigen kader dat het inkomen zo eerlijk en realistisch mogelijk bepaalt: wat de ondernemer werkelijk verdient en duurzaam kan onttrekken. Het is geen beleid van een geldverstrekker. Parameters (tussen haakjes de standaard) zijn per dossier instelbaar.

1. Economisch inkomen per jaar = box 1 (saldo fiscale winst of DGA-loon, na correcties) + het aandeel in de eigen winst na Vpb van elke vennootschap met zeggenschap (look-through) + bestendig dividend uit minderheidsbelangen.
   - Zeggenschap: meer dan 50%, ook samen via meer eigen vennootschappen (30% + 30% = 60%), of aangetoond. Het economisch belang voor het inkomen telt alleen via ondernemingen die meetellen (niet via een holding met 0-inkomen).
   - Groepseliminatie: resultaat deelnemingen, of als dat niet apart staat het ontvangen dividend van deelnemingen, hoort bij de bron en telt bij de ontvanger niet mee.
   - Minderheidsbelang (geen zeggenschap): alleen het werkelijk ontvangen dividend, per jaar maximaal de winst van de deelneming × belang (uitkering uit reserves is geen inkomen), met een trackrecord van (3) jaar. Voldoet de deelneming niet aan de normen, dan telt het dividend niet en weegt haar oordeel niet mee in het dossieroordeel.
2. Normalisatie: incidentele baten én lasten (niet alleen fiscale), fiscale posten teruggedraaid, bijtelling auto in alle jaren, cashflowcorrectie (aflossingen boven afschrijvingen), lasten R/C en lening directie minimaal 2%.
3. Weging: 1-2-3, maximaal (10%) boven het gewone gemiddelde en maximaal het laatste jaar.
4. Lopend jaar: is het geëxtrapoleerde inkomen lager, dan weegt het verschil mee naar rato van de lengte van de periode: 0 bij (3) maanden, volledig vanaf (9) maanden. Dividend uit minderheidsbelangen wordt niet geëxtrapoleerd (gemiddelde).
5. Uitkeerbaarheid: per vennootschap telt het aandeel in de winst maximaal tot het uitgekeerde deel plus de ruimte na de dubbele balanstoets (solvabiliteit 25%, werkkapitaal) en de vrije reserves. Is meer dan de helft van het inkomen ingehouden winst: attentie (dividendbeleid vastleggen).
6. Beweeglijkheid: variatiecoëfficiënt (populatie) boven (20%) kost (0,5) × het meerdere, maximaal (25%).
7. Starters: 12-24 maanden (80%), 24-36 maanden (90%), maar 100% bij aantoonbaar relevante ervaring in dezelfde branche; altijd maximaal het laatste jaar en de prognose. Beletperiode zoals Knab.
8. Toetsing: winst ≥ 0, current ratio ≥ 1 en werkkapitaal ≥ 0 in het laatste jaar en/of het controlejaar; solvabiliteit IB 15/20/25%, BV 20/25/30%; buitenland NL, BE, DE en LU (attentie buiten NL).

## Controles op de invoer

- Onmogelijke balans: eigen vermogen, vlottende activa of kort vreemd vermogen groter dan het balanstotaal, een negatief balanstotaal, of bij totaalposten een negatief lang vreemd vermogen: niet akkoord. Aansprakelijk vermogen na correcties groter dan het balanstotaal na correcties: attentie.
- Een correctie "Overig – passivazijde (kortlopend)" verhoogt het aansprakelijk vermogen (zoals een achtergestelde lening). Gaat het alleen om de looptijd, gebruik dan "Herrubricering kort ↔ lang vreemd vermogen": die verlaagt (of verhoogt) alleen het kort vreemd vermogen. ZIB signaleert het eerste.
- Belang per jaar: het percentage van een jaar (bij de onderneming) en de periode van een extra aandeelhouder (vanaf/tot) bepalen het belang in de geldstromen en het economisch belang; een nieuwe aandeelhouder krijgt geen dividend uit eerdere jaren.
- Een onderneming zonder eigen inkomen die korter bestaat dan de minimale duur zet bij de totaalkaders het hele inkomen op € 0; ZIB stelt dan een 0-inkomen (beoordelingsverklaring) voor. Een 0-inkomen telt bij alle kaders alleen mee in de risicobeoordeling.
- Maximaal te onttrekken is n.v.t. bij een vennootschap zonder zeggenschap (ook via de keten).
- Het toetskader, een afwijkend inkomen (aan/uit, bedrag, motivatie) en een beletperiode komen met naam en tijdstip in de historie.


## Structuur en organogram

- Ondernemingen in de berekening hangen aan elkaar via "onderdeel van" met een belang per jaar. Een gedeelde deelneming (bijv. 30% via de holding van de aanvrager en 50% via een tussenholding) krijgt een extra aandeelhouder; het indirecte belang is het product van de belangen langs het pad.
- Overige knopen: personen (medeaandeelhouders, certificaathouders), een STAK of vennootschappen buiten de berekening. Ze tellen niet mee in het inkomen of het toetskader, maar maken de structuur compleet en zijn te kiezen als tegenpartij bij de geldstromen.
- Lijnen: aandelen of certificaten (via een STAK), met een percentage. De lijn tussen de aanvrager en een hoofdbedrijf tekent ZIB zelf, tenzij de aanvrager het hoofdbedrijf via een eigen lijn of via een partij buiten de berekening houdt (bijvoorbeeld certificaten van een STAK die de aandelen houdt).
- STAK met meer vennootschappen: administreert een STAK aandelen in meer vennootschappen met elk eigen certificaathouders, dan geef je per certificaathouder aan van welke vennootschap de certificaten zijn. Het organogram tekent de certificaathouders en de lijn van de STAK naar die vennootschap in dezelfde kleur; de tekstversie noemt per vennootschap alleen haar eigen certificaathouders.
- Controle: per vennootschap tellen de belangen (aandelenlijnen) op. Meer dan 100% → attentie; minder dan 100% terwijl er meerdere aandeelhouders zijn vastgelegd → melding van het niet-toegewezen deel. Certificaten per vennootschap samen meer dan 100% → attentie; een STAK met meer vennootschappen en certificaathouders zonder gekozen vennootschap → melding.
- Tekstorganogram voor de notities: ingesprongen per niveau, met per vennootschap eenmalig "(overige aandeelhouders: …)" en de herkomst via "←" (bijv. "60% Holding B.V. ← 100% STAK ← certificaten …"). Eerdere situaties leg je vast als momentopname; ze komen bij "Invoegen in notities" in volgorde boven de huidige situatie.

## Geldstromen

Per hoofdbedrijf, per jaar, telkens volgens beide partijen met het verschil (betaler - ontvanger). Een verschil groter dan € 1 geeft een melding.

| Stroom | Betaler | Ontvanger |
|---|---|---|
| Management fee | Deelneming (alleen aan de primaire aandeelhouder) | Ontvangen fee bij de aandeelhouder |
| Intern dividend | Totaal uitgekeerd × belang van die aandeelhouder (bij een gedeelde deelneming ontvangt elke aandeelhouder zijn deel) | Ontvangen dividend bij de aandeelhouder |
| Loon DGA / winst | Hoofdbedrijf | Privé (informatief) |
| Dividend aan de DGA | Betaalbaar gesteld dividend in de vennootschap | Box 2-dividend in de IB-aangifte |
| Overige stromen en posities | Opgegeven bedrag volgens de ene partij (fee, dividend, rente, huur, rekening-courant, lening, overig) | Opgegeven bedrag volgens de andere partij, ook als die buiten de berekening valt |

Een stroom die onder meer hoofdbedrijven valt (gedeelde deelneming), telt één keer.

## 0-verklaring

Zakelijk inkomen € 0. Per onderneming:

1. Kortetermijnverplichtingen: current ratio ≥ 1 of werkkapitaal ≥ 0.
2. Langetermijnverplichtingen: eigen vermogen na correcties ≥ 0 (negatief en niet gedekt door privévermogen: niet akkoord); solvabiliteit onder de norm: attentie.
3. Resultaat: verlies gedekt door het vermogen van de onderneming of privé (box 3) → akkoord. Hobbymatig met beperkt verlies → akkoord. Anders verlies / 12 als correctie op de toegestane financieringslast.
4. Operationele kasstroom: nettowinst + afschrijvingen - aflossingen (- lasten zakelijk krediet als die door de onderneming worden gedragen).

Dossierbreed: borgstellingen, hoofdelijke aansprakelijkheid (vof/maatschap), zakelijk krediet in BKR, belastingachterstanden en een medeaanvrager in loondienst bij de onderneming.

Bij een inkomensverklaring met een niet-meegenomen onderneming voert ZIB dezelfde beoordeling uit; een ongedekt verlies wordt dan verrekend met het toetsinkomen.

Het NHG-toetskader voorziet niet in een nul-verklaring. ZIB voert de beoordeling dan uit volgens het Woonbeleid, getoetst aan de NHG-normen, en vermeldt dat in de uitkomst.

## Eindoordeel

- Alle voorwaarden akkoord → vastgesteld inkomen = toetsinkomen (NHG) of het af te geven inkomen per hoofdbedrijf opgeteld (ABN AMRO).
- Een of meer aandachtspunten → inkomen wordt getoond met status Attentie (bijv. ontbrekende tussentijdse cijfers, kort boekjaar, geldstroom die niet aansluit).
- NHG: een voorwaarde niet akkoord → € 0 ("Er kan géén zakelijk inkomen worden afgegeven"), tenzij een gemotiveerd afwijkend inkomen is vastgelegd.
- ABN AMRO: het berekend inkomen blijft zichtbaar, zoals in de rekentool; de acceptant kiest afwijkend inkomen, geen inkomen of 0-inkomen per hoofdbedrijf.

## Weergave en jaarvolgorde

- Elk dossier opent standaard in de ViiZ-weergave, ook een ABN AMRO-dossier. In Mijn gegevens kies je of ABN AMRO-dossiers in de BZI-weergave openen; per dossier wissel je met de knop in de kop.
- Jaarkolommen lopen in alle invoer- en overzichtstabellen, de rekenstappen, de BZI-invoer en het rapport van het meest recente jaar (links) naar het oudste (rechts), met het lopende jaar het meest links. In Mijn gegevens is dit om te draaien. De rekenkern zelf werkt chronologisch; formules als (a + b + c) / 3 staan in de rekenstappen in de volgorde oud naar recent, in de onderbouwing van een afwijkend inkomen recent eerst.
