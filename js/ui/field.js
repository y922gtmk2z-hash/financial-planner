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
  const KEY_FIELDS = ['income.grossSalary', 'spending.0.monthly'];

  const whereFor = (field) => {
    const w = WHERE[field.path] || (field.key === 'carValue' ? WHERE.carValue : null)
      || (field.key === 'yearly' && FP.profile.BENEFIT_FIELDS.includes(field) ? WHERE.yearly : null);
    return typeof w === 'function' ? w() : w;
  };

  /*
   * field: { label, type, help, suffix, placeholder, options, min, max, nullable }
   * opts:  { value, onChange(value), compact, extra (node under help), ariaLabel (when the visible label is hidden or shared) }
   */
  function render(field, opts) {
    uid += 1;
    const id = `f${uid}`;
    const helpId = `${id}-help`;
    const errId = `${id}-err`;
    const err = h('p', { class: 'field-error', id: errId, role: 'alert', hidden: true });

    if (field.type === 'toggle') {
      // Segmented radio buttons for a short list of choices.
      return h('fieldset', { class: 'field', 'aria-describedby': helpId, 'data-path': field.path || null },
        h('legend', { class: 'field-legend' }, field.label),
        h('div', { class: 'toggle' }, field.options.map((o, i) => [
          h('input', {
            type: 'radio', name: id, id: `${id}-${i}`, value: o.value, checked: o.value === opts.value,
            onchange: (e) => { if (e.target.checked) opts.onChange(o.value); },
          }),
          h('label', { for: `${id}-${i}` }, o.label),
        ])),
        field.help && !opts.compact ? h('p', { class: 'help', id: helpId }, field.help) : null);
    }

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
      input.addEventListener('focus', () => {
        if (field.type === 'money' && input.value.includes(',')) input.value = input.value.replace(/,/g, '');
      });
      input.addEventListener('blur', () => {
        const r = FP.profile.parseValue(field, input.value);
        if (r.ok && field.type === 'money') input.value = FP.dom.inputText(field, r.value);
      });
    }

    const blank = KEY_FIELDS.includes(field.path) && !opts.compact
      ? h('p', { class: 'help blank-note', hidden: opts.value > 0 }, 'Not entered yet: counts as \u00a30.')
      : null;

    function commit(raw) {
      const r = FP.profile.parseValue(field, raw);
      if (r.ok) {
        if (blank) blank.hidden = r.value > 0;
        err.hidden = true;
        err.textContent = '';
        input.removeAttribute('aria-invalid');
        opts.onChange(r.value);
      } else {
        err.hidden = false;
        err.textContent = r.error;
        input.setAttribute('aria-invalid', 'true');
      }
    }

    const prefix = field.type === 'money' ? h('span', { class: 'affix', 'aria-hidden': 'true' }, '£') : null;
    const suffix = field.suffix ? h('span', { class: 'affix', 'aria-hidden': 'true' }, field.suffix) : null;

    const where = opts.compact ? null : whereFor(field);
    return h('div', { class: `field${opts.compact ? ' compact' : ''}${field.shared ? ' shared' : ''}`, 'data-path': field.path || null },
      h('label', { for: id }, field.label, field.shared ? h('span', { class: 'badge', title: 'Also in the Assumptions panel' }, 'Assumption') : null),
      h('div', { class: 'input-wrap' }, prefix, input, suffix),
      field.help && !opts.compact ? h('p', { class: 'help', id: helpId }, field.help, where ? [' ', h('span', { class: 'where' }, h('strong', null, 'Where do I find this? '), where)] : null)
        : where ? h('p', { class: 'help', id: helpId }, h('strong', null, 'Where do I find this? '), where)
          : h('span', { id: helpId, hidden: true }),
      blank,
      err,
      opts.extra || null);
  }

  /*
   * The fields of a Setup section: ungrouped basic fields, then `between`
   * (e.g. the bonus editor), then each field group under its heading, then
   * advanced fields behind "Advanced". `make(field)` renders one field.
   */
  function sectionBody(sec, make, between) {
    const basic = sec.fields.filter((f) => !f.advanced && !f.group);
    const groups = [...new Set(sec.fields.filter((f) => f.group).map((f) => f.group))];
    const adv = sec.fields.filter((f) => f.advanced && !f.group);
    return [
      basic.map(make),
      between || null,
      groups.map((g) => {
        const info = FP.profile.FIELD_GROUPS[g];
        return h('div', { class: 'field-group', role: 'group', 'aria-labelledby': `grp-${sec.id}-${g}` },
          h('h3', { id: `grp-${sec.id}-${g}` }, info.title),
          info.intro ? h('p', { class: 'help' }, info.intro) : null,
          sec.fields.filter((f) => f.group === g).map(make));
      }),
      adv.length ? h('details', { class: 'advanced' }, h('summary', null, 'Advanced'), adv.map(make)) : null,
    ];
  }

  FP.field = { render, sectionBody };
})(globalThis.FP = globalThis.FP || {});
