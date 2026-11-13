// ZIB API (Cloudflare Pages Functions). Alle routes onder /api/*.
//   GET    /api/health                      status (zonder login)
//   GET    /api/me                          ingelogde gebruiker
//   GET    /api/records                     alle actieve records
//   GET    /api/records/:id                 één record
//   PUT    /api/records/:id                 opslaan met versiecontrole (if_version)
//   DELETE /api/records/:id                 zacht verwijderen (blijft in de historie)
//   GET    /api/records/:id/versions        versiegeschiedenis
//   GET    /api/records/:id/versions/:v     inhoud van een eerdere versie
//   GET    /api/export                      volledige back-up (JSON)
//   POST   /api/import                      back-up terugzetten
//   PUT|GET|DELETE /api/files/:id           documenten in R2
import { gebruiker } from '../_shared/auth.js';
import { beveiligDossier, beveiligProfiel, cloudActor, maakImportHerbeoordeling } from '../_shared/fiat.js';
import { wisInkomensWijzigingen } from '../../public/js/engine/beoordelingsrechten.js';

const MAX_BESTAND = 20 * 1024 * 1024;
const TYPES = new Set(['dossier', 'bronarchief', 'advieskantoor', 'taak', 'ticket', 'document', 'profiel']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function metadataWeg(data) {
  const kopie = { ...data };
  delete kopie.version;
  delete kopie.updated_at;
  delete kopie.updated_by;
  return kopie;
}

function naarRecord(rij) {
  const data = JSON.parse(rij.data);
  return { ...data, id: rij.id, type: rij.type, version: rij.version, updated_at: rij.updated_at, updated_by: rij.updated_by };
}

async function audit(env, user, actie, recordId, detail = '') {
  await env.DB.prepare('INSERT INTO audit (at, user, action, record_id, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), user.email, actie, recordId, detail).run();
}

async function opslaanRecord(env, user, id, type, data, ifVersion, forceer = false, alleenNieuw = false) {
  if (!TYPES.has(type)) return { status: 400, body: { fout: `Onbekend recordtype: ${type}` } };
  const nu = new Date().toISOString();
  const huidig = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();
  if (huidig && alleenNieuw) return { status: 409, body: { overgeslagen: true } };
  if (huidig && huidig.type !== type) return { status: 422, body: { fout: 'Het recordtype kan niet worden gewijzigd.' } };
  if (huidig && !forceer && Number(huidig.version) !== Number(ifVersion || 0)) {
    return { status: 409, body: { fout: 'Versieconflict', huidig: naarRecord(huidig) } };
  }
  const record = metadataWeg({ ...data, id, type });
  if (alleenNieuw && type === 'dossier' && record.nummer) {
    const dubbel = await env.DB.prepare("SELECT id FROM records WHERE type = 'dossier' AND deleted = 0 AND json_extract(data, '$.nummer') = ? LIMIT 1")
      .bind(record.nummer).first();
    if (dubbel) return { status: 409, body: { overgeslagen: true } };
  }
  const vorigRecord = huidig ? naarRecord(huidig) : null;
  const herbeoordelen = forceer && type === 'dossier' && !vorigRecord && maakImportHerbeoordeling(record);
  const actor = cloudActor(user, env);
  const blokkade = type === 'dossier' ? beveiligDossier(actor, vorigRecord, record, { nu, backUp: forceer })
    : type === 'profiel' ? beveiligProfiel(actor, id, record, vorigRecord) : null;
  if (blokkade) return { status: blokkade.status, body: { fout: blokkade.fout } };
  const tekst = JSON.stringify(record);
  if (tekst.length > 950_000) return { status: 413, body: { fout: 'Record te groot (max. ca. 0,9 MB). Sla grote bijlagen op als document.' } };

  if (!huidig) {
    const res = await env.DB.prepare(`INSERT INTO records (id, type, data, version, deleted, created_at, created_by, updated_at, updated_by)
      VALUES (?1, ?2, ?3, 1, 0, ?4, ?5, ?4, ?5) ON CONFLICT(id) DO NOTHING`).bind(id, type, tekst, nu, user.email).run();
    if (!res.meta.changes) return { status: 409, body: { fout: 'Record is tegelijk aangemaakt door een andere gebruiker.' } };
    return { status: 200, body: { version: 1, updated_at: nu, updated_by: user.email, herbeoordelen } };
  }

  const nieuw = Number(huidig.version) + 1;
  const res = await env.DB.prepare(`UPDATE records SET type = ?1, data = ?2, version = ?3, deleted = 0, updated_at = ?4, updated_by = ?5
    WHERE id = ?6 AND version = ?7`).bind(type, tekst, nieuw, nu, user.email, id, huidig.version).run();
  if (!res.meta.changes) {
    const actueel = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();
    return { status: 409, body: { fout: 'Versieconflict', huidig: actueel ? naarRecord(actueel) : null } };
  }
  await env.DB.prepare('INSERT OR IGNORE INTO record_versions (id, version, data, saved_at, saved_by) VALUES (?, ?, ?, ?, ?)')
    .bind(id, huidig.version, huidig.data, huidig.updated_at, huidig.updated_by).run();
  return { status: 200, body: { version: nieuw, updated_at: nu, updated_by: user.email,
    ...(type === 'dossier' ? { fiat: record.fiat ?? null, fiatteur: record.fiatteur ?? null } : {}) } };
}

function dossierVoorOverdracht(bron) {
  const record = structuredClone(bron);
  const besluiten = [{ afwijkend: record.afwijkend, besluit: record.inkomensbesluit }, ...(record.ondernemingen || []).map((o) => ({
    onderneming: o.id, afwijkend: o.afwijkend, besluit: o.inkomensbesluit,
    geenInkomen: o.geenInkomen || undefined, nulInkomen: o.nulInkomen || undefined, uitgesloten: o.meenemen === false || undefined,
  }))].filter(({ afwijkend, besluit, geenInkomen, nulInkomen, uitgesloten }) => afwijkend?.actief || besluit || geenInkomen || nulInkomen || uitgesloten);
  const fiat = record.fiat;
  const wasGetekend = maakImportHerbeoordeling(record);
  if (besluiten.length || wasGetekend) {
    record.eerdereBeoordeling = { status: bron.status, fiat, fiatteur: bron.fiatteur, besluiten };
    wisInkomensWijzigingen(record);
    if (record.soort !== 'ANALYSE') record.status = 'beoordeling_1';
  }
  return { record, herbeoordelen: besluiten.length > 0 || wasGetekend };
}

async function records(request, env, user, seg) {
  const methode = request.method;
  const id = seg[0] ? decodeURIComponent(seg[0]) : '';

  if (!id && methode === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM records WHERE deleted = 0 ORDER BY updated_at DESC').all();
    return json({ records: results.map(naarRecord) });
  }
  if (!id) return json({ fout: 'Methode niet toegestaan' }, 405);

  if (seg[1] === 'versions') {
    if (seg[2]) {
      const rij = await env.DB.prepare('SELECT data FROM record_versions WHERE id = ? AND version = ?').bind(id, Number(seg[2])).first();
      return rij ? json({ data: JSON.parse(rij.data) }) : json({ fout: 'Versie niet gevonden' }, 404);
    }
    const { results } = await env.DB.prepare('SELECT version, saved_at AS at, saved_by AS door FROM record_versions WHERE id = ? ORDER BY version DESC LIMIT 200').bind(id).all();
    return json({ versions: results });
  }

  if (methode === 'GET') {
    const rij = await env.DB.prepare('SELECT * FROM records WHERE id = ? AND deleted = 0').bind(id).first();
    return rij ? json(naarRecord(rij)) : json({ fout: 'Niet gevonden' }, 404);
  }

  if (methode === 'PUT') {
    const body = await request.json();
    const { status, body: uit } = await opslaanRecord(env, user, id, body.type || body.data?.type, body.data || {}, body.if_version);
    if (status === 200) await audit(env, user, 'opslaan', id, `versie ${uit.version}`);
    return json(uit, status);
  }

  if (methode === 'DELETE') {
    const huidig = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();
    if (!huidig) return json({ ok: true });
    const nu = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO record_versions (id, version, data, saved_at, saved_by) VALUES (?, ?, ?, ?, ?)')
        .bind(id, huidig.version, huidig.data, huidig.updated_at, huidig.updated_by),
      env.DB.prepare('UPDATE records SET deleted = 1, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?')
        .bind(nu, user.email, id),
    ]);
    await audit(env, user, 'verwijderen', id);
    return json({ ok: true });
  }
  return json({ fout: 'Methode niet toegestaan' }, 405);
}

async function bestanden(request, env, user, seg) {
  if (!env.FILES) return json({ fout: 'Bestandsopslag (R2-binding "FILES") is niet gekoppeld.' }, 501);
  const id = seg[0] ? decodeURIComponent(seg[0]) : '';
  if (!id || !/^[A-Za-z0-9_-]{4,80}$/.test(id)) return json({ fout: 'Ongeldig bestands-id' }, 400);
  const sleutel = `documenten/${id}`;
  if (request.method === 'PUT') {
    const lengte = Number(request.headers.get('content-length') || 0);
    if (lengte > MAX_BESTAND) return json({ fout: 'Bestand groter dan 20 MB' }, 413);
    const naam = decodeURIComponent(request.headers.get('x-bestandsnaam') || 'document');
    await env.FILES.put(sleutel, request.body, {
      httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' },
      customMetadata: { naam, door: user.email, at: new Date().toISOString() },
    });
    await audit(env, user, 'bestand-upload', id, naam);
    return json({ ok: true });
  }
  if (request.method === 'GET') {
    const obj = await env.FILES.get(sleutel);
    if (!obj) return json({ fout: 'Bestand niet gevonden' }, 404);
    const naam = obj.customMetadata?.naam || 'document';
    return new Response(obj.body, {
      headers: {
        'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(naam)}`,
        'cache-control': 'private, no-store',
        'content-security-policy': "default-src 'none'; sandbox",
        'x-content-type-options': 'nosniff',
      },
    });
  }
  if (request.method === 'DELETE') {
    await env.FILES.delete(sleutel);
    await audit(env, user, 'bestand-verwijderen', id);
    return json({ ok: true });
  }
  return json({ fout: 'Methode niet toegestaan' }, 405);
}

export async function handelApiVerzoek(context, identificeer) {
  const { request, env, params } = context;
  const seg = Array.isArray(params.route) ? params.route : (params.route ? [params.route] : []);
  try {
    if (seg[0] === 'health') {
      return json({ ok: true, app: 'ZIB', database: !!env.DB, bestanden: !!env.FILES,
        access: context.hosting === 'sites' || !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD),
        toegangslijst: !!String(env.ALLOWED_EMAILS || env.ZIB_SITE_OWNER_EMAIL || '').trim() });
    }
    if (!env.DB) return json({ fout: 'D1-binding "DB" ontbreekt. Koppel de database in de Pages-instellingen.' }, 500);
    const user = await identificeer(request, env);
    if (!user) return json({ fout: 'Niet ingelogd of Cloudflare Access is niet ingesteld.' }, 401);
    if (user.toegang === false) return json({ fout: `${user.email} heeft geen toegang tot deze ZIB-omgeving.` }, 403);

    switch (seg[0]) {
      case 'me':
        return json({ email: user.email, naam: user.naam, accreditatie: cloudActor(user, env).accreditatie,
          ...(context.hosting ? { hosting: context.hosting } : {}) });
      case 'records':
        return records(request, env, user, seg.slice(1));
      case 'files':
        return bestanden(request, env, user, seg.slice(1));
      case 'export': {
        const { results } = await env.DB.prepare('SELECT * FROM records WHERE deleted = 0').all();
        await audit(env, user, 'export', null, `${results.length} records`);
        return json({ app: 'ZIB', formaat: 1, geexporteerd: new Date().toISOString(), records: results.map(naarRecord) });
      }
      case 'import': {
        if (request.method !== 'POST') return json({ fout: 'Methode niet toegestaan' }, 405);
        const body = await request.json();
        const lijst = Array.isArray(body.records) ? body.records.slice(0, 5000) : [];
        const overdracht = body.mode === 'browser-migration';
        if (overdracht && context.hosting !== 'sites') return json({ fout: 'Deze overdracht is alleen beschikbaar in de ZIB-werkruimte op Sites.' }, 400);
        let aantal = 0;
        let geweigerd = 0;
        let herbeoordelen = 0;
        let overgeslagen = 0;
        for (const r of lijst) {
          if (!r || !r.id || !TYPES.has(r.type)) continue;
          if (overdracht && (r.type === 'profiel' || r.deleted || !/^[A-Za-z0-9_-]{4,100}$/.test(r.id))) { overgeslagen += 1; continue; }
          const bron = overdracht && r.type === 'dossier' ? dossierVoorOverdracht(r) : { record: r };
          const uitkomst = await opslaanRecord(env, user, r.id, r.type, bron.record, 0, true, overdracht);
          if (uitkomst.status === 200) {
            aantal += 1;
            if (bron.herbeoordelen || uitkomst.body.herbeoordelen) herbeoordelen += 1;
          } else if (uitkomst.body.overgeslagen) overgeslagen += 1;
          else {
            geweigerd += 1;
          }
        }
        await audit(env, user, 'import', null, `${aantal} records`);
        return json({ aantal, geweigerd, herbeoordelen, overgeslagen });
      }
      default:
        return json({ fout: 'Onbekende route' }, 404);
    }
  } catch (e) {
    return json({ fout: e.message || String(e) }, 500);
  }
}

export function onRequest(context) {
  return handelApiVerzoek(context, gebruiker);
}
