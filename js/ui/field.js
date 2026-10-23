/*
 * One labelled input with help text and inline validation. Used by Setup,
 * the list editors and the Assumptions panel so every input behaves the same.
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;
  let uid = 0;

  /*
   * field: { label, type, help, suffix, placeholder, options, min, max, nullable }
   * opts:  { value, onChange(value), compact, extra (node under help) }
   */
  function render(field, opts) {
    uid += 1;
    const id = `f${uid}`;
    const helpId = `${id}-help`;
    const errId = `${id}-err`;
    const err = h('p', { class: 'field-error', id: errId, role: 'alert', hidden: true });

    let input;
    if (field.type === 'select') {
      input = h('select', { id, 'aria-describedby': helpId },
        field.options.map((o) => h('option', { value: o.value, selected: o.value === opts.value }, o.label)));
      input.addEventListener('change', () => commit(input.value));
    } else {
      const numeric = field.type !== 'text';
      input = h('input', {
        id,
        type: 'text',
        inputmode: numeric ? (field.type === 'int' ? 'numeric' : 'decimal') : null,
        autocomplete: 'off',
        spellcheck: numeric ? 'false' : null,
        placeholder: field.placeholder || (numeric ? (field.nullable ? opts.nullPlaceholder || 'Not set' : '0') : ''),
        value: FP.dom.inputText(field, opts.value),
        'aria-describedby': `${helpId} ${errId}`,
        maxlength: numeric ? 16 : 60,
      });
      input.addEventListener('input', () => commit(input.value));
      input.addEventListener('blur', () => {
        const r = FP.profile.parseValue(field, input.value);
        if (r.ok && field.type === 'money') input.value = FP.dom.inputText(field, r.value);
      });
    }

    function commit(raw) {
      const r = FP.profile.parseValue(field, raw);
      if (r.ok) {
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

    return h('div', { class: `field${opts.compact ? ' compact' : ''}${field.shared ? ' shared' : ''}` },
      h('label', { for: id }, field.label, field.shared ? h('span', { class: 'badge', title: 'Also in the Assumptions panel' }, 'Assumption') : null),
      h('div', { class: 'input-wrap' }, prefix, input, suffix),
      field.help && !opts.compact ? h('p', { class: 'help', id: helpId }, field.help) : h('span', { id: helpId, hidden: true }),
      err,
      opts.extra || null);
  }

  FP.field = { render };
})(globalThis.FP = globalThis.FP || {});
