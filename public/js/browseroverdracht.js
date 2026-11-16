import { LocalAdapter } from './store/local.js';
import { state, importeer } from './state.js';
import { openModaal, sluitModaal, toast } from './views/ui.js';

const oefendossier = (d) => d.demo === true || d.id.startsWith('dos_demo_');

export async function biedBrowseroverdrachtAan(ververs) {
  if (state.me?.hosting !== 'sites' || state.modus !== 'cloud') return;
  const lokaal = new LocalAdapter();
  await lokaal.init();
  const bron = await lokaal.list();
  const actueleIds = new Set(state.records.keys());
  const actueleNummers = new Set([...state.records.values()].filter((r) => r.type === 'dossier').map((r) => r.nummer).filter(Boolean));
  const dossiers = bron.filter((r) => r.type === 'dossier' && !actueleIds.has(r.id) && (!r.nummer || !actueleNummers.has(r.nummer)));
  const eerderOvergezet = new Set(bron.filter((r) => r.type === 'dossier' && state.records.get(r.id)?.type === 'dossier').map((r) => r.id));
  const nogBijlagen = bron.filter((r) => r.type === 'document' && eerderOvergezet.has(r.dossierId) && !actueleIds.has(r.id)).length;
  if (!dossiers.length && !nogBijlagen) { toast('Deze browser heeft geen nog over te dragen dossiers of bijlagen.'); return; }
  const echt = dossiers.filter((d) => !oefendossier(d)).length;
  const kiezen = `<p>In deze browser staan ${echt} eigen dossiers en ${dossiers.length - echt} oefendossiers die nog niet centraal zijn opgeslagen. De overdracht bewaart ook de beschikbare bijlagen. Eerdere fiatteringen en inkomensbesluiten blijven als historie bewaard en worden opnieuw beoordeeld.</p>
    ${nogBijlagen ? `<p>${nogBijlagen} bijlagen van eerder overgezette dossiers kunnen nog worden opgehaald.</p>` : ''}
    ${dossiers.length > echt ? `<label class="check"><input type="checkbox" id="overdracht-oefen"${echt ? '' : ' checked'}> <span>Oefendossiers meenemen</span></label>` : ''}`;
  const venster = openModaal('Dossiers uit deze browser overzetten', kiezen, '<button type="button" class="knop" id="overdracht-bevestigen">Dossiers overzetten</button>');
  venster.querySelector('#overdracht-bevestigen').addEventListener('click', async (e) => {
    const knop = e.currentTarget;
    knop.disabled = true;
    try {
      const inclusiefOefen = venster.querySelector('#overdracht-oefen')?.checked;
      const selectie = dossiers.filter((d) => inclusiefOefen || !oefendossier(d));
      if (!selectie.length && !nogBijlagen) { toast('Kies welke dossiers je wilt overzetten.'); return; }
      const ids = new Set(selectie.map((d) => d.id));
      const adviesIds = new Set(selectie.map((d) => d.advieskantoorId).filter(Boolean));
      const andere = bron.filter((r) => !actueleIds.has(r.id) && ((r.type === 'advieskantoor' && adviesIds.has(r.id)) || (r.type === 'taak' && ids.has(r.dossierId))));
      const docIds = new Set([...ids, ...eerderOvergezet]);
      const documenten = bron.filter((r) => r.type === 'document' && docIds.has(r.dossierId) && !actueleIds.has(r.id));
      const resultaat = await importeer({ app: 'ZIB', formaat: 1, mode: 'browser-migration', records: [...andere, ...selectie] });
      let bestanden = 0;
      let ontbrekend = 0;
      for (const doc of documenten) {
        if (!state.records.has(doc.dossierId)) continue;
        try {
          if (doc.opslag === 'demo' && oefendossier(state.records.get(doc.dossierId))) {
            const r = await state.adapter.importAll({ app: 'ZIB', formaat: 1, mode: 'browser-migration', records: [doc] });
            if (r.aantal) bestanden += 1;
            continue;
          }
          const bestand = await lokaal.getFile(doc.id);
          if (!bestand) { ontbrekend += 1; continue; }
          await state.adapter.putFile(doc.id, new File([bestand], doc.naam || 'Document', { type: bestand.type || doc.mime }));
          const r = await state.adapter.importAll({ app: 'ZIB', formaat: 1, mode: 'browser-migration', records: [{ ...doc, opslag: 'r2' }] });
          if (r.aantal) bestanden += 1;
        } catch { ontbrekend += 1; }
      }
      if (bestanden) await importeer({ app: 'ZIB', formaat: 1, mode: 'browser-migration', records: [] });
      const over = selectie.filter((d) => state.records.has(d.id)).length;
      sluitModaal();
      ververs();
      toast(`${over} dossiers, ${bestanden} documentregels overgezet.${ontbrekend ? ` ${ontbrekend} bestanden konden niet worden overgezet.` : ''}${resultaat.herbeoordelen ? ` ${resultaat.herbeoordelen} dossiers vragen herbeoordeling.` : ''}${resultaat.geweigerd ? ` ${resultaat.geweigerd} records konden niet worden bewaard.` : ''}`);
    } catch (err) { toast(err.message || 'De overdracht kon niet worden voltooid.'); }
    finally { knop.disabled = false; }
  });
}
