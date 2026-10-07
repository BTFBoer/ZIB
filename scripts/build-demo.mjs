// Bouwt dist/zib-demo.html: één zelfstandig bestand met alle code en styling.
// Handig om ZIB te tonen zonder server (dubbelklikken of als bijlage). De demo gebruikt
// altijd lokale opslag in de browser en zoekt geen cloud-API.
// Daarnaast dist/zib-artifact.html: dezelfde demo als pagina-inhoud zonder eigen documentskelet,
// voor een ingesloten voorbeeldweergave. Daar zijn afdrukken en downloaden geblokkeerd; ZIB verbergt
// de afdrukknop en biedt downloads als tekst om te kopiëren (vlag ZIB_ARTIFACT).
//   npm run build:demo
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const js = execFileSync(npx, ['--yes', 'esbuild', path.join(root, 'public/js/main.js'),
  '--bundle', '--format=iife', '--minify', '--target=es2020', '--legal-comments=none'],
{ encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).replace(/<\/script/gi, '<\\/script');

const css = readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
const favicon = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const faviconData = `data:image/svg+xml,${encodeURIComponent(favicon)}`;
const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">`;
const app = '<div id="app"><div class="pagina"><p class="dempen">ZIB wordt geladen…</p></div></div>';

const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>ZIB | Zakelijk inkomen (demo)</title>
<link rel="icon" href="${faviconData}">
${fonts}
<style>${css}</style>
</head>
<body>
${app}
<script>window.ZIB_DEMO = true;</script>
<script>${js}</script>
</body>
</html>`;

const artifact = `<title>ZIB Zakelijk inkomen</title>
<meta name="robots" content="noindex, nofollow">
${fonts}
<style>${css}</style>
${app}
<script>window.ZIB_DEMO = true; window.ZIB_ARTIFACT = true; document.documentElement.lang = 'nl';</script>
<script>${js}</script>
`;

mkdirSync(path.join(root, 'dist'), { recursive: true });
const uit = path.join(root, 'dist/zib-demo.html');
writeFileSync(uit, html);
writeFileSync(path.join(root, 'dist/zib-artifact.html'), artifact);
console.log(`Demo gebouwd: ${uit} (${Math.round(html.length / 1024)} kB) en dist/zib-artifact.html`);
