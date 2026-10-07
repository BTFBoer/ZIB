// Cloudopslag via de eigen API (Cloudflare Pages Functions + D1, bestanden in R2).
// De API draait op hetzelfde domein onder /api en wordt afgeschermd met Cloudflare Access.

export class ConflictError extends Error {
  constructor(huidig) {
    super('Dit record is intussen door iemand anders gewijzigd.');
    this.huidig = huidig;
  }
}

export class ApiAdapter {
  constructor(basis = '/api') {
    this.basis = basis;
    this.naam = 'cloud';
    this.omschrijving = 'Cloud (Cloudflare D1)';
    this.persistent = true;
  }

  async req(methode, pad, body, opties = {}) {
    const init = { method: methode, headers: { accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined && !(body instanceof Blob)) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    } else if (body instanceof Blob) {
      init.headers['content-type'] = body.type || 'application/octet-stream';
      if (opties.bestandsnaam) init.headers['x-bestandsnaam'] = encodeURIComponent(opties.bestandsnaam);
      init.body = body;
    }
    const res = await fetch(this.basis + pad, init);
    if (res.status === 409) {
      const j = await res.json().catch(() => ({}));
      throw new ConflictError(j.huidig || null);
    }
    if (!res.ok) {
      const tekst = await res.text().catch(() => '');
      throw new Error(`Serverfout ${res.status}: ${tekst.slice(0, 200)}`);
    }
    if (opties.blob) return res.blob();
    return res.json();
  }

  async init() {
    const me = await this.req('GET', '/me');
    this.me = me;
    return me;
  }

  async list() {
    const j = await this.req('GET', '/records');
    return j.records || [];
  }

  async put(rec) {
    const j = await this.req('PUT', `/records/${encodeURIComponent(rec.id)}`, {
      type: rec.type, data: rec, if_version: rec.version || 0,
    });
    return { ...rec, version: j.version, updated_at: j.updated_at, updated_by: j.updated_by };
  }

  async remove(id, version) {
    await this.req('DELETE', `/records/${encodeURIComponent(id)}?if_version=${version || 0}`);
  }

  async versions(id) {
    const j = await this.req('GET', `/records/${encodeURIComponent(id)}/versions`);
    return j.versions || [];
  }

  async getVersion(id, version) {
    const j = await this.req('GET', `/records/${encodeURIComponent(id)}/versions/${version}`);
    return j.data || null;
  }

  async exportAll() {
    return this.req('GET', '/export');
  }

  async importAll(json) {
    const j = await this.req('POST', '/import', json);
    return j.aantal || 0;
  }

  async putFile(id, file) {
    await this.req('PUT', `/files/${encodeURIComponent(id)}`, file, { bestandsnaam: file.name });
    return { opslag: 'r2' };
  }

  async getFile(id) {
    return this.req('GET', `/files/${encodeURIComponent(id)}`, undefined, { blob: true });
  }

  async removeFile(id) {
    await this.req('DELETE', `/files/${encodeURIComponent(id)}`);
  }
}
