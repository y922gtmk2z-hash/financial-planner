/*
 * Life events on Year by year: dated costs or money coming in (a house move,
 * childcare, a career break, an inheritance...), one card each, with presets.
 * They go into the projection and show as markers on the charts.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const P = FP.profile;
  const F = (key) => P.EVENT_FIELDS.find((f) => f.key === key);

  // "Childcare: £900 a month, 2027 to 2030" / "Inheritance: £50,000 in 2040".
  function describe(e) {
    const t = P.eventType(e.type);
    const name = e.name || t.label;
    const yearsText = e.endYear == null ? `from ${e.startYear}` : e.endYear === e.startYear ? `in ${e.startYear}` : `${e.startYear} to ${e.endYear}`;
    if (t.payCut) return `${name}: ${e.payPct == null ? 100 : e.payPct}% of your pay ${yearsText}${e.endYear == null ? ' until you retire' : ''}${e.amount > 0 ? `, plus ${money(e.amount)} a month` : ''}`;
    if (t.outMonths) return `${name}: no pay for ${e.months} month${e.months === 1 ? '' : 's'} from ${e.startYear}${e.amount > 0 ? `, ${money(e.amount)} a month still coming in` : ''}`;
    if (t.move) return `${name}: a ${money(e.price || 0)} home in ${e.startYear}${e.mortgage > 0 ? ` with a ${money(e.mortgage)} mortgage over ${e.term} years` : ', bought outright'}${e.amount > 0 ? `, ${money(e.amount)} to move` : ''}`;
    if (!(e.amount > 0) && !t.pause) return `${name}: no amount yet`;
    const when = e.per === 'lump' || e.endYear == null || e.endYear === e.startYear ? `in ${e.startYear}` : `${e.startYear} to ${e.endYear}`;
    if (t.pause) return `${name}: pay stops ${when}${e.amount > 0 ? `, ${money(e.amount)} a month still coming in` : ''}`;
    return `${name}: ${money(e.amount)}${e.per === 'lump' ? '' : e.per === 'year' ? ' a year' : ' a month'} ${when}${t.dir === 'in' ? ' coming in' : ''}`;
  }

  // The fold on Year by year. onChange: the projection needs drawing again.
  function card(ctx, onChange) {
    const sum = h('span', { class: 'muted small' });
    const list = h('div', { class: 'events-body' });
    const el = h('details', { class: 'leftover-fold events-fold', id: 'future-events' },
      h('summary', null, h('span', null, 'Life events'), sum),
      list);
    const changed = () => { ctx.changed(); drawSum(); onChange(); };
    const drawSum = () => {
      const n = ctx.profile().events.length;
      sum.textContent = n ? `${n} planned: ${ctx.profile().events.slice(0, 2).map((e) => e.name || P.eventType(e.type).label).join(', ')}${n > 2 ? '…' : ''}` : 'A house move, childcare, a career break…';
    };

    // A change to a box saves and redraws the projection; a change of type,
    // how it's paid or a removal also draws the list again.
    const hooks = { update: changed, rebuild: () => { changed(); draw(); } };
    const draw = (focusLast) => {
      const p = ctx.profile();
      const events = p.events;
      const typeSelect = h('select', { id: 'event-add-type', 'aria-describedby': 'event-add-help' },
        P.EVENT_TYPES.map((t) => h('option', { value: t.value }, t.label)));
      FP.dom.fill(list,
        h('p', { class: 'help' }, 'Costs you can see coming, or money you expect, in today’s money. They’re added to that year’s spending (or income) in your projection and shown on the charts.'),
        events.length ? h('ul', { class: 'pension-list event-list' }, events.map((e, i) => row(ctx, e, i, hooks))) : null,
        h('div', { class: 'field add-event' },
          h('label', { for: 'event-add-type' }, 'Add a life event'),
          h('div', { class: 'add-row' },
            h('div', { class: 'input-wrap' }, typeSelect),
            h('button', {
              type: 'button', class: 'secondary', disabled: events.length >= P.MAX_EVENTS,
              onclick: () => { events.push(P.newEvent(typeSelect.value)); changed(); draw(true); },
            }, 'Add')),
          h('p', { class: 'help', id: 'event-add-help' }, events.length >= P.MAX_EVENTS ? `You can add up to ${P.MAX_EVENTS}.` : 'Choose one; you can change its amount and years next.')));
      if (focusLast) {
        const items = list.querySelectorAll('.event-item');
        const last = items[items.length - 1];
        const amount = last && last.querySelector('[data-path$=".amount"] input');
        if (amount) amount.focus();
      }
    };

    drawSum();
    draw();
    return el;
  }

  // One event as a card: its type, name, how it's paid, amount, years and whose.
  function row(ctx, e, i, hooks) {
    const p = ctx.profile();
    const t = P.eventType(e.type);
    const at = (key) => `events.${i}.${key}`;
    const legend = h('legend', null, e.name || t.label);
    const status = h('p', { class: 'help event-sum', role: 'status' }, describe(e));
    const box = (key, over) => FP.field.render({ ...F(key), path: at(key), ...over }, {
      value: e[key],
      nullPlaceholder: over && over.placeholder,
      onChange: (v) => {
        e[key] = v;
        if (key === 'type') {
          const nt = P.eventType(v);
          e.per = nt.per;
          if (nt.per === 'lump' || nt.ongoing || nt.outMonths) e.endYear = null;
          else if (e.endYear == null) e.endYear = e.startYear + Math.max(0, nt.years - 1);
          P.EVENT_FIELDS.filter((f) => f.only && nt[f.only] && e[f.key] == null).forEach((f) => { e[f.key] = P.EVENT_DEFAULTS[f.key]; });
          hooks.rebuild();
          return;
        }
        if (key === 'per') {
          if (v === 'lump') e.endYear = null;
          hooks.rebuild();
          return;
        }
        if (key === 'endYear' && v != null && e.startYear != null && v < e.startYear) e.endYear = null;
        if (key === 'name') legend.textContent = e.name || t.label;
        status.textContent = describe(e);
        hooks.update();
      },
    });
    const monthly = e.per !== 'lump';
    // Boxes only some kinds of event have (pay share, months, a new home).
    const extra = P.EVENT_FIELDS.filter((f) => f.only && t[f.only]).map((f) => box(f.key));
    const amountLabel = t.payCut ? { label: 'Extra coming in (optional)', suffix: 'a month', help: 'Anything on top of your reduced pay, after tax. Leave blank if nothing.' }
      : t.outMonths ? { label: 'Still coming in (optional)', suffix: 'a month', help: 'After tax, for example benefits. Leave blank if nothing.' }
        : t.move ? { label: 'Cost of moving (today\u2019s money)', suffix: 'once', help: 'Stamp duty, legal fees, removals.' }
          : null;
    return h('li', { class: 'pension-item event-item' }, h('fieldset', { class: 'row-card' },
      legend,
      box('type', { help: t.help }),
      box('name', { placeholder: `e.g. ${t.label}` }),
      t.pause || t.payCut || t.outMonths || t.move ? null : box('per'),
      extra,
      box('amount', t.pause
        ? { label: 'Still coming in (optional)', suffix: 'a month', help: 'After tax, for example statutory pay. Leave blank if nothing.' }
        : amountLabel || { suffix: e.per === 'year' ? 'a year' : monthly ? 'a month' : 'once', label: t.dir === 'in' ? 'Amount you’d receive (today’s money)' : 'Amount (today’s money)' }),
      h('div', { class: 'year-pair' },
        box('startYear', { label: monthly && !t.outMonths ? 'From' : 'In', placeholder: 'Year' }),
        monthly && !t.outMonths ? box('endYear', { placeholder: t.ongoing ? 'Until you retire' : String(e.startYear || 'Same year') }) : null),
      p.partner ? FP.field.render({ label: 'Whose?', type: 'select', options: [
        { value: 'you', label: p.about.name ? `${p.about.name} (you)` : 'You' },
        { value: 'partner', label: p.partner.name || 'Your partner' },
        { value: 'joint', label: 'Both of you' },
      ] }, { value: e.owner || 'you', compact: true, ariaLabel: `${e.name || t.label}: whose?`, onChange: (v) => { e.owner = v; hooks.update(); } }) : null,
      status,
      h('button', { type: 'button', class: 'link danger', onclick: () => { ctx.profile().events.splice(i, 1); hooks.rebuild(); } }, 'Remove this event')));
  }

  /*
   * Chart markers for the events in a projection's rows: [{ index, label }].
   * An event starting in a year marks the projection year that starts then.
   */
  function markers(p, rows) {
    const first = rows[0].year;
    return (p.events || []).filter((e) => Number.isFinite(e.startYear)).map((e) => {
      const index = e.startYear - first + 1;
      return index >= 1 && index < rows.length ? { index, label: e.name || P.eventType(e.type).label } : null;
    }).filter(Boolean);
  }

  FP.eventsUi = { card, describe, markers };
})(globalThis.FP = globalThis.FP || {});
