/*
 * Your commitments: what you said you'd do when you applied an action or
 * marked it done, kept in the scenario (profile.commitments, since version
 * 11). Each: { id, action (the idea's id), what, amount (£, or null), per
 * ('month' | 'year', or null), due ('YYYY-MM-DD', or null), status ('open'
 * or 'done'), made ('YYYY-MM-DD') }. One per action. Pure: no DOM.
 */
(function (FP) {
  'use strict';

  const MAX = 40;
  const STATUSES = ['open', 'done'];
  const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  let idCounter = 0;
  const newId = () => { idCounter += 1; return `cm${Date.now().toString(36)}${idCounter}`; };

  // Any saved list → valid commitments (bad rows dropped).
  function normalise(list) {
    if (!Array.isArray(list)) return [];
    return list.filter((c) => c && typeof c === 'object' && typeof c.action === 'string' && /^[a-zA-Z]{1,30}$/.test(c.action))
      .slice(0, MAX).map((c) => {
        const amount = typeof c.amount === 'number' && Number.isFinite(c.amount) && c.amount >= 0 ? c.amount : null;
        return {
          id: typeof c.id === 'string' && c.id ? c.id.slice(0, 40) : newId(),
          action: c.action,
          what: typeof c.what === 'string' ? c.what.replace(/\s+/g, ' ').trim().slice(0, 160) : '',
          amount,
          per: amount != null && (c.per === 'month' || c.per === 'year') ? c.per : null,
          due: isDate(c.due) ? c.due : null,
          status: STATUSES.includes(c.status) ? c.status : 'open',
          made: isDate(c.made) ? c.made : null,
        };
      });
  }

  /*
   * Records what an action commits you to (idea.commitment()), as still to
   * do ('open') or done, made `today`. Replaces any earlier one for the same action.
   */
  function record(profile, c, status, today) {
    const list = (profile.commitments || []).filter((x) => x.action !== c.action);
    const old = (profile.commitments || []).find((x) => x.action === c.action);
    list.push(normalise([{ ...c, id: old ? old.id : undefined, status, made: today }])[0]);
    profile.commitments = list.slice(-MAX);
    return profile.commitments[profile.commitments.length - 1];
  }

  // Takes the commitment for an action off the list (when you bring the action back).
  function remove(profile, action) {
    profile.commitments = (profile.commitments || []).filter((x) => x.action !== action);
  }

  function setStatus(profile, id, status) {
    const c = (profile.commitments || []).find((x) => x.id === id);
    if (c && STATUSES.includes(status)) c.status = status;
    return c || null;
  }

  // How many you've kept: { done, open, total, overdue (open and past due on `today`) }.
  function kept(profile, today) {
    const list = profile.commitments || [];
    const done = list.filter((c) => c.status === 'done').length;
    return { done, open: list.length - done, total: list.length, overdue: list.filter((c) => c.status === 'open' && c.due && today && c.due < today).length };
  }

  FP.commitments = { MAX, normalise, record, remove, setStatus, kept };
})(globalThis.FP = globalThis.FP || {});
