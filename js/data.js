// Datenschicht: Supabase online, lokaler Cache offline.
// Dokumente (Tickets, Bestätigungen) werden zusätzlich im Cache Storage
// des Geräts abgelegt, damit sie ohne Internet aufgehen.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { demoData, demoTicketSvg } from './demo.js';

const DATA_KEY = 'tb-data-v1';
const DOC_CACHE = 'tb-docs-v1';
const BUCKET = 'documents';

export const isDemo = new URLSearchParams(location.search).has('demo')
  || localStorage.getItem('tb-demo') === '1';
export const isConfigured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_KEY.startsWith('YOUR-');

export const sb = (!isDemo && isConfigured && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const dataKey = () => (isDemo ? DATA_KEY + '-demo' : DATA_KEY);

export const state = {
  stays: [],
  transports: [],
  documents: [],
  fetchedAt: null,
  cachedDocs: new Set(),
};

// ---------------------------------------------------------------- Cache

export function loadCache() {
  try {
    const raw = localStorage.getItem(dataKey());
    if (raw) Object.assign(state, JSON.parse(raw), { cachedDocs: state.cachedDocs });
    else if (isDemo) Object.assign(state, demoData());
  } catch { /* leerer Cache */ }
  return !!state.fetchedAt || isDemo;
}

function saveCache() {
  const { stays, transports, documents, fetchedAt } = state;
  try {
    localStorage.setItem(dataKey(), JSON.stringify({ stays, transports, documents, fetchedAt }));
  } catch { /* Speicher voll – ignorieren */ }
}

export function clearLocal() {
  localStorage.removeItem(DATA_KEY);
  if ('caches' in window) caches.delete(DOC_CACHE);
}

// ---------------------------------------------------------------- Auth

export async function getSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signInWithGoogle() {
  const redirectTo = location.origin + location.pathname;
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

export async function signOut() {
  if (sb) await sb.auth.signOut();
  clearLocal();
}

/** true/false, oder null wenn offline nicht prüfbar */
export async function checkMembership(email) {
  if (!sb) return true;
  const { data, error } = await sb.from('members').select('email').eq('email', (email || '').toLowerCase());
  if (error) return null;
  return data.length > 0;
}

// ---------------------------------------------------------------- Laden

export async function refresh() {
  if (isDemo) { saveCache(); return; }
  const [s, t, d] = await Promise.all([
    sb.from('stays').select('*').order('check_in'),
    sb.from('transports').select('*').order('departure_local'),
    sb.from('documents').select('*').order('created_at'),
  ]);
  const err = s.error || t.error || d.error;
  if (err) throw err;
  state.stays = s.data;
  state.transports = t.data;
  state.documents = d.data;
  state.fetchedAt = new Date().toISOString();
  saveCache();
}

// ---------------------------------------------------------------- Schreiben

function demoWrite(table, row) {
  const list = state[table];
  if (row.id) {
    const i = list.findIndex((x) => x.id === row.id);
    if (i >= 0) list[i] = { ...list[i], ...row };
    else list.push(row);
  } else {
    row = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    list.push(row);
  }
  saveCache();
  return list.find((x) => x.id === row.id);
}

export async function save(table, row) {
  if (isDemo) return demoWrite(table, row);
  const { id, ...fields } = row;
  const q = id
    ? sb.from(table).update(fields).eq('id', id).select().single()
    : sb.from(table).insert(fields).select().single();
  const { data, error } = await q;
  if (error) throw error;
  const list = state[table];
  const i = list.findIndex((x) => x.id === data.id);
  if (i >= 0) list[i] = data; else list.push(data);
  saveCache();
  return data;
}

export async function remove(table, id) {
  const docs = state.documents.filter((d) => d.stay_id === id || d.transport_id === id);
  if (!isDemo) {
    if (docs.length) await sb.storage.from(BUCKET).remove(docs.map((d) => d.storage_path));
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  }
  state[table] = state[table].filter((x) => x.id !== id);
  state.documents = state.documents.filter((d) => !docs.includes(d));
  for (const d of docs) await uncacheDoc(d);
  saveCache();
}

// ---------------------------------------------------------------- Dokumente

const safeName = (n) => n.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80);

export async function uploadDocument(file, parent) {
  const folder = parent.stay_id ? `stays/${parent.stay_id}` : `transports/${parent.transport_id}`;
  const path = `${folder}/${crypto.randomUUID()}-${safeName(file.name || 'dokument')}`;
  const row = {
    ...parent,
    storage_path: path,
    file_name: file.name || 'Dokument',
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
  };
  if (!isDemo) {
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: row.mime_type });
    if (error) throw error;
  }
  let saved;
  try {
    saved = await save('documents', row);
  } catch (e) {
    if (!isDemo) await sb.storage.from(BUCKET).remove([path]);
    throw e;
  }
  await putDocCache(saved, file);
  return saved;
}

export async function deleteDocument(doc) {
  if (!isDemo) {
    await sb.storage.from(BUCKET).remove([doc.storage_path]);
    const { error } = await sb.from('documents').delete().eq('id', doc.id);
    if (error) throw error;
  }
  state.documents = state.documents.filter((d) => d.id !== doc.id);
  await uncacheDoc(doc);
  saveCache();
}

const docKey = (doc) => new URL(`./__doc/${encodeURIComponent(doc.storage_path)}`, location.href).href;

async function putDocCache(doc, blob) {
  if (!('caches' in window)) return;
  const c = await caches.open(DOC_CACHE);
  await c.put(docKey(doc), new Response(blob, { headers: { 'content-type': doc.mime_type || blob.type } }));
  state.cachedDocs.add(doc.id);
}

async function uncacheDoc(doc) {
  if (!('caches' in window)) return;
  const c = await caches.open(DOC_CACHE);
  await c.delete(docKey(doc));
  state.cachedDocs.delete(doc.id);
}

/** Datei als Blob – aus dem Gerätespeicher oder (online) frisch geladen. */
export async function getDocBlob(doc) {
  if ('caches' in window) {
    const c = await caches.open(DOC_CACHE);
    const hit = await c.match(docKey(doc));
    if (hit) return hit.blob();
  }
  if (isDemo && doc.storage_path.startsWith('demo/')) {
    const t = state.transports.find((x) => x.id === doc.transport_id);
    return new Blob([demoTicketSvg(doc.file_name.replace(/\.svg$/, ''), t?.confirmation_code || 'DEMO')], { type: 'image/svg+xml' });
  }
  if (isDemo || !sb) throw new Error('Datei ist auf diesem Gerät nicht gespeichert.');
  const { data, error } = await sb.storage.from(BUCKET).download(doc.storage_path);
  if (error) throw error;
  await putDocCache(doc, data);
  return data;
}

/** Lädt alle noch fehlenden Dokumente aufs Gerät. Gibt die Anzahl neu gespeicherter zurück. */
export async function syncDocuments(onProgress) {
  if (!('caches' in window)) return 0;
  const c = await caches.open(DOC_CACHE);
  const keys = new Set((await c.keys()).map((r) => r.url));
  const wanted = new Set();
  let added = 0;
  for (const doc of state.documents) {
    const k = docKey(doc);
    wanted.add(k);
    if (keys.has(k) || (isDemo && doc.storage_path.startsWith('demo/'))) { state.cachedDocs.add(doc.id); continue; }
    if (isDemo || !sb || !navigator.onLine) continue;
    try {
      const { data, error } = await sb.storage.from(BUCKET).download(doc.storage_path);
      if (error) throw error;
      await putDocCache(doc, data);
      added++;
      onProgress?.();
    } catch (e) {
      console.warn('Dokument nicht geladen', doc.file_name, e);
    }
  }
  // Dateien gelöschter Dokumente entfernen
  for (const k of keys) if (!wanted.has(k)) await c.delete(k);
  return added;
}

export function docsFor(field, id) {
  return state.documents.filter((d) => d[field] === id);
}
