/*
 * One labelled input with help text and inline validation. Used by Setup,
 * the list editors and the Assumptions panel so every input behaves the same.
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;
  let uid = 0;

  // "Where do I find this?" for figures people often have to look up.
  const P11D = 'Your P11D form from your employer (usually given after April), or your payslip if benefits are taxed through pay. Ask payroll if you don\u2019t have one.';
  const WHERE = {
    'income.taxCode': 'On your payslip, your P60, or in the HMRC app or your personal tax account.',
    'income.studentLoanPlan': 'On your payslip (next to the student loan deduction), or sign in to your Student Loans Company account.',
    'assumptions.statePension': () => ['Get your forecast on ', h('a', { href: 'https://www.gov.uk/check-state-pension', rel: 'noopener noreferrer', target: '_blank' }, 'Check your State Pension forecast'), ' (GOV.UK).'],
    carValue: P11D,
    yearly: P11D,
  };
  // Key figures where a blank box is worth pointing out (it still counts as £0).
  const KEY_FIELDS = ['income.grossSalary'];

  /*
   * Whether a money box is a monthly or a yearly figure: from its suffix, or
   * for list rows ("Per month", a debt's payment) from its key.
   */
  function periodOf(field) {
    if (field.type !== 'money') return null;
    if (field.suffix === 'a month' || field.key === 'monthly' || field.key === 'monthlyPayment') return 'month';
    if (field.suffix === 'a year' || field.key === 'yearly') return 'year';
    return null;
  }
  // "£36,000 a year" under a monthly box, "£3,000 a month" under a yearly one.
  const otherPeriod = (period, v) => (period === 'month' ? `${FP.dom.money(v * 12)} a year` : `${FP.dom.money(v / 12)} a month`);

  const whereFor = (field) => {
    const w = WHERE[field.path] || (field.key === 'carValue' ? WHERE.carValue : null)
      || (field.key === 'yearly' && FP.profile.BENEFIT_FIELDS.includes(field) ? WHERE.yearly : null);
    return typeof w === 'function' ? w() : w;
  };

  /*
   * field: { label, type, help, suffix, placeholder, options, min, max, nullable }
   * opts:  { value, onChange(value), compact, extra (node under help), ariaLabel (when the visible label is hidden or shared),
   *          noBlankNote (don't point out a blank key figure), foldHelp (help behind the "i" even when blank),
   *          check(value): a sense check, null or { text, fix, fixLabel } (fix: a value to offer instead) }
   * Boxes with a check get el.recheck(), to run it again when something it depends on changes.
   */
  function render(field, opts) {
    uid += 1;
    const id = `f${uid}`;
    const helpId = `${id}-help`;
    const errId = `${id}-err`;
    const err = h('p', { class: 'field-error', id: errId, role: 'alert', hidden: true });

    if (field.type === 'toggle') {
      // Segmented radio buttons for a short list of choices.
      const hasHelp = field.help && !opts.compact;
      const fs = h('fieldset', { class: `field${hasHelp ? ' answered' : ''}`, 'aria-describedby': helpId, 'data-path': field.path || null },
        h('legend', { class: 'field-legend label-row' }, field.label, hasHelp ? helpToggle(field, helpId) : null),
        h('div', { class: 'toggle' }, field.options.map((o, i) => [
          h('input', {
            type: 'radio', name: id, id: `${id}-${i}`, value: o.value, checked: o.value === opts.value,
            onchange: (e) => { if (e.target.checked) opts.onChange(o.value); },
          }),
          h('label', { for: `${id}-${i}` }, o.label),
        ])),
        hasHelp ? h('p', { class: 'help help-text', id: helpId }, field.help) : null);
      return fs;
    }

    if (field.type === 'term') return termField(field, opts, { id, helpId, errId, err });

    let input;
    if (field.type === 'select') {
      input = h('select', { id, 'aria-describedby': helpId, 'aria-label': opts.ariaLabel || null },
        field.options.map((o) => h('option', { value: o.value, selected: o.value === opts.value }, o.label)));
      input.addEventListener('change', () => commit(input.value));
    } else {
      const numeric = field.type !== 'text' && field.type !== 'taxcode';
      input = h('input', {
        id,
        type: 'text',
        inputmode: numeric ? (field.type === 'int' ? 'numeric' : 'decimal') : null,
        autocomplete: 'off',
        spellcheck: numeric ? 'false' : null,
        placeholder: field.placeholder || (numeric ? (field.nullable ? opts.nullPlaceholder || field.nullPlaceholder || 'Not set' : '0') : ''),
        value: FP.dom.inputText(field, opts.value),
        'aria-describedby': `${helpId} ${errId}`,
        'aria-label': opts.ariaLabel || null,
        maxlength: numeric ? 16 : 60,
      });
      input.addEventListener('input', () => commit(input.value));
      // Money shows thousands separators, except while you're typing in it.
      // Taking them out clears what the browser selected on focus, so put it
      // back: all of it (as Tab selects), or the caret by the same digit. A
      // microtask later, once the browser has placed its selection.
      input.addEventListener('focus', () => queueMicrotask(() => {
        if (field.type !== 'money' || !input.value.includes(',')) return;
        const v = input.value;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const all = start === 0 && end === v.length;
        const digitsBefore = (i) => v.slice(0, i).replace(/,/g, '').length;
        const at = [digitsBefore(start), digitsBefore(end)];
        input.value = v.replace(/,/g, '');
        if (all) input.select();
        else input.setSelectionRange(at[0], at[1]);
      }));
      input.addEventListener('blur', () => {
        const r = FP.profile.parseValue(field, input.value);
        if (r.ok && field.type === 'money') input.value = FP.dom.inputText(field, r.value);
      });
    }

    const blank = KEY_FIELDS.includes(field.path) && !opts.compact && !opts.noBlankNote
      ? h('p', { class: 'help blank-note', hidden: opts.value > 0 }, 'Not entered yet: counts as \u00a30.')
      : null;

    const period = periodOf(field);
    const periodId = `${id}-per`;
    const perNote = period ? h('p', { class: 'help period-note', id: periodId }) : null;
    const showPeriod = (v) => {
      if (!perNote) return;
      perNote.hidden = !(v > 0);
      perNote.textContent = v > 0 ? otherPeriod(period, v) : '';
    };
    if (perNote) input.setAttribute('aria-describedby', `${input.getAttribute('aria-describedby')} ${periodId}`);
    showPeriod(opts.value);

    // A sense check: just asks, with a one-tap fix when there's an obvious one.
    // A figure that can't be right ({ error }) is an error instead, and isn't kept.
    const checkNote = opts.check ? h('p', { class: 'help sense-check', role: 'status' }) : null;
    let current = opts.value;
    function showError(text) {
      err.hidden = !text;
      err.textContent = text || '';
      if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
    function recheck() {
      if (!checkNote) return;
      const c = input.getAttribute('aria-invalid') ? null : opts.check(current);
      if (c && c.error) {
        showError(c.error);
        checkNote.hidden = true;
        return;
      }
      FP.dom.fill(checkNote, c ? [c.text, c.fix != null ? [' ', h('button', {
        type: 'button', class: 'link',
        onclick: () => {
          input.value = FP.dom.inputText(field, c.fix);
          commit(input.value);
          input.focus();
        },
      }, c.fixLabel)] : null] : null);
      checkNote.hidden = !c;
      // The check gives the yearly figure itself.
      if (c && perNote) perNote.hidden = true; else showPeriod(current);
    }

    function commit(raw) {
      const r = FP.profile.parseValue(field, raw);
      const c = r.ok && opts.check ? opts.check(r.value) : null;
      if (r.ok && !(c && c.error)) {
        current = r.value;
        showPeriod(r.value);
        if (blank) blank.hidden = r.value > 0;
        showError(null);
        opts.onChange(r.value);
        recheck();
      } else {
        showError(r.ok ? c.error : r.error);
        recheck();
      }
    }

    const prefix = field.type === 'money' ? h('span', { class: 'affix', 'aria-hidden': 'true' }, '£') : null;
    const suffix = field.suffix ? h('span', { class: 'affix', 'aria-hidden': 'true' }, field.suffix) : null;

    const where = opts.compact ? null : whereFor(field);
    const hasHelp = (field.help && !opts.compact) || !!where;
    const done = hasHelp && (opts.foldHelp || isAnswered(field, opts.value));
    const el = h('div', { class: `field${opts.compact ? ' compact' : ''}${field.shared ? ' shared' : ''}${done ? ' answered' : ''}`, 'data-path': field.path || null, 'data-check': checkNote ? '' : null },
      h('div', { class: 'label-row' },
        h('label', { for: id }, field.label, field.shared ? h('span', { class: 'badge', title: 'Also in the Assumptions panel' }, 'Assumption') : null),
        done ? helpToggle(field, helpId) : null),
      h('div', { class: 'input-wrap' }, prefix, input, suffix),
      field.help && !opts.compact ? h('p', { class: 'help help-text', id: helpId }, field.help, where ? [' ', h('span', { class: 'where' }, h('strong', null, 'Where do I find this? '), where)] : null)
        : where ? h('p', { class: 'help help-text', id: helpId }, h('strong', null, 'Where do I find this? '), where)
          : h('span', { id: helpId, hidden: true }),
      perNote,
      blank,
      err,
      checkNote,
      opts.extra || null);
    if (checkNote) {
      el.recheck = recheck;
      recheck();
    }
    return el;
  }

  // Runs every sense check on the page again (after a change they depend on).
  function recheckAll(root) {
    (root || document).querySelectorAll('.field[data-check]').forEach((el) => { if (el.recheck) el.recheck(); });
  }

  /*
   * Help stays in view while a box is empty (or you're in it). Once it's
   * answered the help steps aside behind a small "i" by the label, which
   * brings it back; it stays linked to the box for screen readers.
   */
  function isAnswered(field, v) {
    if (field.type === 'select' || field.type === 'toggle') return true;
    if (field.type === 'text' || field.type === 'taxcode') return !!v;
    return v != null && v !== 0;
  }

  function helpToggle(field, helpId) {
    return h('button', {
      type: 'button', class: 'help-toggle', 'aria-expanded': 'false', 'aria-controls': helpId,
      'aria-label': `About \u201c${field.label}\u201d`,
      onclick: (e) => {
        const wrap = e.currentTarget.closest('.field');
        const open = wrap.classList.toggle('show-help');
        e.currentTarget.setAttribute('aria-expanded', String(open));
      },
    }, 'i');
  }

  /*
   * Time left: a number in months or years (your choice), stored in the
   * field's own unit (field.store: 'months' or 'years').
   */
  function termField(field, opts, ids) {
    const toMonths = (v) => (v == null ? null : field.store === 'years' ? v * 12 : v);
    const months = toMonths(opts.value);
    let unit = months && months % 12 !== 0 ? 'months' : 'years';
    const shown = (m) => (m ? String(Number((unit === 'years' ? m / 12 : m).toFixed(2))) : '');
    const input = h('input', {
      id: ids.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', maxlength: 8,
      placeholder: field.nullable === false ? '0' : 'Not sure', value: shown(months),
      'aria-describedby': `${ids.helpId} ${ids.errId}`, 'aria-label': opts.ariaLabel || null,
    });
    const unitSel = h('select', { 'aria-label': `${field.label}: months or years`, class: 'term-unit' },
      ['years', 'months'].map((u) => h('option', { value: u, selected: u === unit }, u)));
    const maxMonths = field.store === 'years' ? field.max * 12 : field.max;
    function commit() {
      const r = FP.profile.parseValue({ type: 'years', nullable: true, min: 0, max: unit === 'years' ? maxMonths / 12 : maxMonths }, input.value);
      if (!r.ok) {
        ids.err.hidden = false;
        ids.err.textContent = r.error;
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      ids.err.hidden = true;
      input.removeAttribute('aria-invalid');
      const m = r.value == null || r.value === 0 ? null : unit === 'years' ? r.value * 12 : r.value;
      const stored = m == null ? (field.nullable ? null : 0) : field.store === 'years' ? m / 12 : m;
      opts.onChange(stored);
    }
    input.addEventListener('input', commit);
    unitSel.addEventListener('change', () => { unit = unitSel.value; commit(); });
    const done = field.help && !opts.compact && isAnswered(field, opts.value);
    return h('div', { class: `field term${opts.compact ? ' compact' : ''}${done ? ' answered' : ''}`, 'data-path': field.path || null },
      h('div', { class: 'label-row' }, h('label', { for: ids.id }, field.label), done ? helpToggle(field, ids.helpId) : null),
      h('div', { class: 'term-row' }, h('div', { class: 'input-wrap' }, input), h('div', { class: 'input-wrap term-unit-wrap' }, unitSel)),
      field.help && !opts.compact ? h('p', { class: 'help help-text', id: ids.helpId }, field.help) : h('span', { id: ids.helpId, hidden: true }),
      ids.err,
      opts.extra || null);
  }

  FP.field = { render, recheckAll };
})(globalThis.FP = globalThis.FP || {});
