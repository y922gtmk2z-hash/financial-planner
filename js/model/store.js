/*
 * Persistence: browser localStorage only. Nothing leaves this device unless you
 * export a file yourself.
 */
(function (FP) {
  'use strict';

  const KEY = 'ukfp.v1';
  const APP_ID = 'uk-finance-planner';

  function storage() {
    try {
      const s = globalThis.localStorage;
      const probe = '__ukfp_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      return null;
    }
  }

  // Returns { profile, source: 'saved' | 'sample', error? }
  function load() {
    const s = storage();
    if (!s) return { profile: FP.sample(), source: 'sample', error: 'Browser storage is unavailable, so changes won’t be saved.' };
    const raw = s.getItem(KEY);
    if (!raw) return { profile: FP.sample(), source: 'sample' };
    try {
      const data = JSON.parse(raw);
      return { profile: FP.profile.normalise(data.profile), source: 'saved' };
    } catch (e) {
      return { profile: FP.sample(), source: 'sample', error: 'Saved data could not be read, so sample data was loaded.' };
    }
  }

  function save(profile) {
    const s = storage();
    if (!s) return false;
    try {
      s.setItem(KEY, JSON.stringify({ schemaVersion: FP.profile.SCHEMA_VERSION, savedAt: new Date().toISOString(), profile }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear() {
    const s = storage();
    if (s) s.removeItem(KEY);
  }

  function exportJson(profile) {
    return JSON.stringify({
      app: APP_ID,
      schemaVersion: FP.profile.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      profile,
    }, null, 2);
  }

  // Returns { ok, profile } or { ok: false, error }
  function importJson(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'That file isn’t valid JSON.' };
    }
    if (!data || data.app !== APP_ID || typeof data.profile !== 'object' || data.profile === null) {
      return { ok: false, error: 'That file wasn’t exported from this planner.' };
    }
    if (typeof data.schemaVersion === 'number' && data.schemaVersion > FP.profile.SCHEMA_VERSION) {
      return { ok: false, error: 'That file is from a newer version of the planner.' };
    }
    return { ok: true, profile: FP.profile.normalise(data.profile) };
  }

  FP.store = { KEY, load, save, clear, exportJson, importJson };
})(globalThis.FP = globalThis.FP || {});
