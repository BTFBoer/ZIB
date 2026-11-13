// Bouwt dist/zib-demo.html: één zelfstandig bestand met alle code en styling.
// Handig om ZIB te tonen zonder server (dubbelklikken of als bijlage). De demo gebruikt
// altijd lokale opslag in de browser en zoekt geen cloud-API.
// Daarnaast dist/zib-artifact.html: dezelfde demo als pagina-inhoud zonder eigen documentskelet,
// voor een ingesloten voorbeeldweergave. Daar zijn afdrukken en downloaden geblokkeerd; ZIB verbergt
// de afdrukknop en biedt downloads als tekst om te kopiëren (vlag ZIB_ARTIFACT).
//   npm run build:demo
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// npx.cmd cannot be launched directly with execFileSync on current Node for Windows.
const npxCli = process.platform === 'win32' ? [
  process.env.npm_execpath && path.join(path.dirname(process.env.npm_execpath), 'npx-cli.js'),
  ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map((p) => path.join(p, 'node_modules/npm/bin/npx-cli.js')),
].find((p) => p && existsSync(p)) : null;
if (process.platform === 'win32' && !npxCli) throw new Error('npx-cli.js ontbreekt. Start dit script met npm run build:demo.');
const js = execFileSync(npxCli ? process.execPath : 'npx', [...(npxCli ? [npxCli] : []), '--yes', 'esbuild', path.join(root, 'public/js/main.js'),
  '--bundle', '--format=iife', '--minify', '--target=es2020', '--legal-comments=none'],
{ encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).replace(/<\/script/gi, '<\\/script');

const css = ['app.css', 'werkruimte.css', 'dossier.css', 'kerninvoer.css', 'rekenwerkruimte.css'].map((bestand) => readFileSync(path.join(root, 'public/css', bestand), 'utf8')).join('\n');
const favicon = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const faviconData = `data:image/svg+xml,${encodeURIComponent(favicon)}`;
const app = '<div id="app"><div class="pagina"><p class="dempen">ZIB wordt geladen…</p></div></div>';
// De losse demo wordt ook als ingesloten pagina gebruikt (bijvoorbeeld gepubliceerd in een voorbeeldweergave).
// In een ingesloten venster zijn afdrukken en downloaden geblokkeerd; ZIB schakelt dan zelf over op de
// alternatieven (rapport downloaden via de viewer of tekst kopiëren).
const INGESLOTEN = '(function () { try { return window.self !== window.top; } catch (e) { return true; } })()';

const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>ZIB | Zakelijk inkomen (demo)</title>
<link rel="icon" href="${faviconData}">
<style data-zib-stijl>${css}</style>
</head>
<body>
${app}
<script>window.ZIB_DEMO = true; window.ZIB_ARTIFACT = ${INGESLOTEN};</script>
<script>${js}</script>
</body>
</html>`;

const artifact = `<title>ZIB Zakelijk inkomen</title>
<meta name="robots" content="noindex, nofollow">
<style data-zib-stijl>${css}</style>
${app}
<script>window.ZIB_DEMO = true; window.ZIB_ARTIFACT = true; document.documentElement.lang = 'nl';</script>
<script>${js}</script>
`;

const lokaal = html.replace('<title>ZIB | Zakelijk inkomen (demo)</title>', '<title>ZIB | Lokale werkruimte</title>')
  .replace('window.ZIB_DEMO = true; window.ZIB_ARTIFACT = ', 'window.ZIB_LOCAL_PRIVATE = true; window.ZIB_ARTIFACT = ');

mkdirSync(path.join(root, 'dist'), { recursive: true });
const uit = path.join(root, 'dist/zib-demo.html');
writeFileSync(uit, html);
writeFileSync(path.join(root, 'dist/zib-artifact.html'), artifact);
writeFileSync(path.join(root, 'dist/zib-lokaal.html'), lokaal);
console.log(`Demo gebouwd: ${uit} (${Math.round(html.length / 1024)} kB) en dist/zib-artifact.html`);
