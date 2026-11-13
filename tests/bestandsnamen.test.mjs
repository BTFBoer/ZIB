// Bestandsnamen moeten ook op Windows werken. Git voor Windows weigert de hele checkout zodra één pad
// daar ongeldig is ("error: invalid path"), en dan blijft de gekloonde map leeg. Ongeldig zijn onder meer
// de gereserveerde apparaatnamen (CON, PRN, AUX, NUL, COM1-9, LPT1-9), ook met een extensie erachter
// (nul.js), de tekens < > : " | ? * en namen die op een spatie of punt eindigen. Windows maakt daarnaast
// geen onderscheid tussen hoofd- en kleine letters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OVERSLAAN = new Set(['.git', 'node_modules', 'dist', '.wrangler']);

/** De bestanden in de repository; zonder Git (bijvoorbeeld uit een zip) de bestanden op schijf. */
function bestanden() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean);
  } catch {
    const uit = [];
    const loop = (map) => {
      for (const d of readdirSync(path.join(root, map), { withFileTypes: true })) {
        if (OVERSLAAN.has(d.name)) continue;
        const rel = map ? `${map}/${d.name}` : d.name;
        if (d.isDirectory()) loop(rel); else uit.push(rel);
      }
    };
    loop('');
    return uit;
  }
}

const GERESERVEERD = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$) *($|[.:])/i;

/** Waarom een naamdeel op Windows niet kan, of '' als het wel kan. */
function windowsProbleem(deel) {
  if (GERESERVEERD.test(deel)) return 'gereserveerde apparaatnaam';
  if (/[<>:"|?*\\]/.test(deel) || /[\x00-\x1f]/.test(deel)) return 'ongeldig teken';
  if (/[ .]$/.test(deel) && deel !== '.' && deel !== '..') return 'eindigt op een spatie of punt';
  return '';
}

test('Windows-namen: de regels zelf', () => {
  for (const fout of ['nul.js', 'NUL', 'Nul.test.mjs', 'con', 'aux.txt', 'prn.md', 'com1.js', 'LPT9', 'nul .js', 'a:b.js', 'vraag?.md', 'map.', 'map ']) {
    assert.notEqual(windowsProbleem(fout), '', fout);
  }
  for (const goed of ['nulverklaring.js', 'null.js', 'console.js', 'auxiliary.md', 'com.js', 'com10.js', 'lpt.js', 'contract.md', '.github', 'app.css']) {
    assert.equal(windowsProbleem(goed), '', goed);
  }
});

test('Windows-namen: alle bestanden in de repository zijn op Windows uit te checken', () => {
  const lijst = bestanden();
  assert.ok(lijst.length > 20, 'bestanden gevonden');
  const problemen = [];
  const gezien = new Map();
  for (const p of lijst) {
    const delen = p.split('/');
    delen.forEach((deel, i) => {
      const pad = delen.slice(0, i + 1).join('/');
      const waarom = windowsProbleem(deel);
      if (waarom) problemen.push(`${pad}: ${waarom}`);
      const sleutel = pad.toLowerCase();
      if (gezien.has(sleutel) && gezien.get(sleutel) !== pad) problemen.push(`${gezien.get(sleutel)} en ${pad}: verschillen alleen in hoofdletters`);
      gezien.set(sleutel, pad);
    });
  }
  assert.deepEqual([...new Set(problemen)], []);
});
