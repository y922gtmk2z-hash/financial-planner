/*
 * Persistence: browser localStorage only. Nothing leaves this device unless you
 * export a file yourself. Saves the whole workspace (all scenarios).
 */
(function (FP) {
  'use strict';

  const KEY = 'ukfp.v1';
  const APP_ID = 'uk-finance-planner';
  // 1: a single profile. 2: a workspace of scenarios.
  const STORE_VERSION = 2;

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

  // Version 1 files hold { profile }; version 2 hold { workspace }.
  function workspaceFrom(data) {
    return FP.scenarios.normalise(data.workspace || { profile: data.profile });
  }

  const fresh = () => FP.scenarios.fromProfile(FP.profile.blank());

  // Returns { workspace, source: 'saved' | 'new', error? }. A first visit
  // starts empty: the sample household is only loaded if you ask for it.
  function load() {
    const s = storage();
    if (!s) return { workspace: fresh(), source: 'new', error: 'Browser storage is unavailable, so changes won’t be saved.' };
    const raw = s.getItem(KEY);
    if (!raw) return { workspace: fresh(), source: 'new' };
    try {
      return { workspace: workspaceFrom(JSON.parse(raw)), source: 'saved' };
    } catch (e) {
      return { workspace: fresh(), source: 'new', error: 'Saved data could not be read, so the planner has started empty. Import a backup in Your data if you have one.' };
    }
  }

  function save(workspace) {
    const s = storage();
    if (!s) return false;
    try {
      s.setItem(KEY, JSON.stringify({ schemaVersion: STORE_VERSION, savedAt: new Date().toISOString(), workspace }));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Removes everything this planner stored, including view preferences.
  function clear() {
    const s = storage();
    if (!s) return;
    const keys = [];
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k && k.startsWith('ukfp.')) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
  }

  function exportJson(workspace) {
    return JSON.stringify({
      app: APP_ID,
      schemaVersion: STORE_VERSION,
      exportedAt: new Date().toISOString(),
      workspace,
    }, null, 2);
  }

  // Returns { ok, workspace } or { ok: false, error }. Accepts older single-profile exports.
  function importJson(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'That file isn’t valid JSON.' };
    }
    const body = data && (data.workspace || data.profile);
    if (!data || data.app !== APP_ID || typeof body !== 'object' || body === null) {
      return { ok: false, error: 'That file wasn’t exported from this planner.' };
    }
    if (typeof data.schemaVersion === 'number' && data.schemaVersion > STORE_VERSION) {
      return { ok: false, error: 'That file is from a newer version of the planner.' };
    }
    return { ok: true, workspace: workspaceFrom(data) };
  }

  // Small per-browser preferences (which view, what you've dismissed). Removed by clear().
  function pref(name, value) {
    const s = storage();
    const key = `ukfp.pref.${name}`;
    try {
      if (value === undefined) return s ? s.getItem(key) : null;
      if (!s) return null;
      if (value === null) s.removeItem(key); else s.setItem(key, String(value));
    } catch (e) { /* storage blocked */ }
    return null;
  }

  FP.store = { KEY, STORE_VERSION, load, save, clear, exportJson, importJson, pref };
})(globalThis.FP = globalThis.FP || {});
