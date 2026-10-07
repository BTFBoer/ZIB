import { fmt } from '../util.js';

// Een trace bestaat uit secties (tabellen) met rijen. Elke cel bevat een formule-tekst (f)
// en een waarde (w) met opmaak (eur, ratio, pct, tekst). Zo kan de rapportage elke uitkomst
// herleidbaar tonen, net als "(35.638 + 45.087 + 57.029) / 3 =".

export class Trace {
  constructor() {
    this.secties = [];
  }

  sectie(titel, opties = {}) {
    const s = {
      titel,
      groep: opties.groep || '',
      kolommen: opties.kolommen || [],
      kolomLabels: opties.kolomLabels || {},
      richtlijn: opties.richtlijn || '',
      formule: opties.formule || '',
      rijen: [],
    };
    this.secties.push(s);
    const api = {
      rij(label, cellen = {}, extra = {}) {
        s.rijen.push({ label, cellen, ...extra });
        return api;
      },
      kop(label) {
        s.rijen.push({ label, kop: true, cellen: {} });
        return api;
      },
      tekst(label, tekst, extra = {}) {
        s.rijen.push({ label, tekst, cellen: {}, ...extra });
        return api;
      },
      sectie: s,
    };
    return api;
  }
}

export const g = (x) => fmt.getal(x);
export const r = (x) => fmt.ratio(x);
export const p = (x) => fmt.pct(x);

export function cel(w, f = '', opmaak = 'eur', status) {
  return { w, f, opmaak, status };
}

/** Somformule zoals "35.638 + 0 - 0 =" */
export function somF(basis, plus = [], min = []) {
  let s = g(basis);
  plus.forEach((x) => { s += ` + ${g(x)}`; });
  min.forEach((x) => { s += ` - ${g(x)}`; });
  return `${s} =`;
}

export function lijstF(waarden, deler) {
  return `(${waarden.map(g).join(' + ')}) / ${deler} =`;
}

export function laagsteF(waarden) {
  if (waarden.length === 2) return `Laagste van ${g(waarden[0])} en ${g(waarden[1])} =`;
  return `Laagste van ${waarden.slice(0, -1).map(g).join(', ')} en ${g(waarden[waarden.length - 1])} =`;
}
