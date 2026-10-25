/*
 * The detail panel for one result (e.g. when your student loan is repaid).
 * It shows the result, the inputs and assumptions that drive it (which you
 * can change on a copy of your plan), what your changes do, the changes
 * that would move it most, and the recommendations that go with it. Nothing
 * changes in your plan until you apply it or save it as a scenario.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const A = FP.assumptions;
  const P = FP.profile;
  const O = FP.outcomes;
  const TONE_ICON = { warn: '!', tip: 'i', good: '✓' };
  const MAIN_DRIVERS = 5; // the rest go under "More"

  // How to show and edit one driver (a profile path).
  function driverField(path, p) {
    const parts = path.split('.');
    const base = { path, nullable: false };
    if (parts[0] === 'spending') {
      const row = p.spending[Number(parts[1])];
      return { ...base, label: p.spending.length > 1 && row.category ? `Spending: ${row.category}` : 'Monthly spending', type: 'money', suffix: 'a month' };
    }
    if (parts[0] === 'debts') {
      return { ...base, label: `${p.debts[Number(parts[1])].name || 'Debt'}: monthly payment`, type: 'money', suffix: 'a month' };
    }
    if (parts[0] === 'savings') {
      const row = p.savings[Number(parts[1])];
      const type = (P.SAVING_TYPES.find((t) => t.value === row.type) || { label: 'Saving' }).label;
      return { ...base, label: `Regular saving: ${type}`, type: 'money', suffix: 'a month' };
    }
    if (parts[0] === 'leftover') {
      if (parts[1] === 'emergencyMonths') return { ...P.EMERGENCY_MONTHS_FIELD, path };
      const f = P.leftoverField(P.LEFTOVER_FIELDS.find((x) => x.key === parts[1]), p.leftover.unit);
      return { ...f, path, label: `Left over each month: ${f.label.toLowerCase()}` };
    }
    const setup = P.fieldFor(path);
    if (setup) return setup;
    if (parts[0] === 'assumptions') {
      const d = A.def(parts[1]);
      return { ...P.assumptionField(parts[1]), label: d.label, suffix: A.UNIT_SUFFIX[d.unit] || undefined };
    }
    return null;
  }

  function fmt(kind, v, per) {
    if (v == null) return '—';
    if (kind === 'money') return `${cash(v)}${per ? ` ${per}` : ''}`;
    if (kind === 'age') return `Age ${v}`;
    if (kind === 'months') return `${v >= 99 ? 'Over 24' : v.toFixed(1)} months`;
    return String(v);
  }

  // What a named measure includes, under its name (for example Savings and pensions).
  function includesNote(label) {
    const m = Object.values(FP.dom.MEASURES).find((x) => label.startsWith(x.label));
    return m ? h('small', { class: 'includes' }, m.includes) : null;
  }

  // "2 years sooner", "+£210 a month", "1.5 months more".
  function deltaText(d) {
    if (d.before == null || d.after == null) return d.after == null ? 'no longer in the projection' : 'now in the projection';
    const diff = d.after - d.before;
    if (d.kind === 'age') {
      const n = Math.abs(diff);
      return `${n} year${n === 1 ? '' : 's'} ${diff < 0 ? 'sooner' : 'later'}`;
    }
    if (d.kind === 'months') return `${Math.abs(diff).toFixed(1)} months ${diff > 0 ? 'more' : 'less'}`;
    return `${diff > 0 ? '+' : '−'}${cash(Math.abs(diff))}${d.per ? ` ${d.per}` : ''}`;
  }

  // The retirement sheet's figures are all at retirement: rounded when that's
  // five or more years away, as on Your plan. Set each time a sheet draws.
  let approx = false;
  const cash = (n) => money(n, { approx });

  function miniChart(before, after, changed) {
    const s = after.series;
    if (!s) return null;
    const series = [{ label: changed ? 'With your changes' : s.label, color: '--series-7', values: s.values }];
    if (changed && before.series) series.push({ label: 'Before', color: '--series-neutral', values: before.series.values, dashed: true });
    return h('div', { class: 'sheet-chart' },
      changed ? FP.chart.keys(series.map((x) => ({ label: x.label, color: x.color, line: true }))) : null,
      FP.chart.timeChart({
        type: 'line', series, xLabels: s.xLabels,
        xTitle: (i) => `Age ${s.xLabels[i]}`,
        ariaLabel: `${s.label} by age${s.real ? ', in today’s money' : ''}`,
      }));
  }

  // A short name for a scenario saved from the panel, from its first difference.
  function scenarioName(base, work, title) {
    const d = FP.scenarios.differences(base, work)[0];
    if (!d || d.kind === 'note') return `What if: ${title.toLowerCase()}`;
    const v = d.kind === 'money' ? money(d.to) : d.kind === 'pct' ? `${d.to}%` : String(d.to);
    return `${d.label} ${v}`;
  }

  /*
   * Opens the panel for outcome `id` on the scenario you're editing.
   */
  function open(ctx, id) {
    const o = O.byId(id);
    const base = ctx.profile();
    let work = O.copy(base);
    const before = o.evaluate(base);

    const result = h('div', { class: 'sheet-result', role: 'status', 'aria-live': 'polite' });
    const drivers = h('div', { class: 'sheet-drivers' });
    const levers = h('div', { class: 'sheet-levers' });
    const ideas = h('div', { class: 'sheet-ideas' });
    const extra = h('div', { class: 'sheet-extra' });
    const actions = h('div', { class: 'sheet-actions' });
    let timer = null;

    function changed() {
      return FP.scenarios.differences(base, work).length > 0;
    }

    function drawDrivers() {
      const fields = o.drivers(work).map((path) => {
        const f = driverField(path, work);
        if (!f) return null;
        return FP.field.render(f, {
          value: P.get(work, path), compact: true,
          nullPlaceholder: f.nullPlaceholder,
          onChange: (v) => { P.set(work, path, v); schedule(); },
        });
      }).filter(Boolean);
      FP.dom.fill(drivers,
        h('h3', null, 'What drives it'),
        h('p', { class: 'help' }, 'Change anything here to see the effect. Your plan stays as it is until you apply the changes.'),
        fields.slice(0, MAIN_DRIVERS),
        fields.length > MAIN_DRIVERS ? h('details', { class: 'advanced' }, h('summary', null, `More (${fields.length - MAIN_DRIVERS})`), fields.slice(MAIN_DRIVERS)) : null,
        h('p', { class: 'small' }, h('a', { href: `#setup/${o.drivers(work)[0]}`, onclick: (e) => { sheet.close(); if (sheet.el.open) e.preventDefault(); } }, 'See everything in Your figures')));
    }

    function draw() {
      approx = o.id === 'retirement' && FP.dom.far(work.assumptions.retirementAge - work.about.age);
      const after = o.evaluate(work);
      const isChanged = changed();
      if (!after.ok) {
        FP.dom.fill(result, h('p', null, 'Add your age and spending in Your figures to see this.'));
      } else {
        const diffs = isChanged ? O.compare(before, after) : [];
        FP.dom.fill(result,
          h('p', { class: 'sheet-headline' }, after.headline),
          after.sub ? h('p', { class: 'muted' }, after.sub) : null,
          isChanged ? h('p', { class: 'muted small' }, `Before: ${before.headline}`) : null,
          after.metrics.length ? h('dl', { class: 'facts sheet-metrics' }, (isChanged ? diffs : after.metrics.map((m) => ({ label: m.label, after: m.value, kind: m.kind, per: m.per, change: 'same' }))).map((d) => h('div', null,
            h('dt', null, d.label, includesNote(d.label)),
            h('dd', null, fmt(d.kind, d.after, d.per),
              isChanged && d.change !== 'same' ? h('span', { class: `delta ${d.change}` }, ` ${deltaText(d)}`) : null)))) : null,
          miniChart(before, after, isChanged));
      }

      const effects = after.ok ? O.leverEffects(id, work) : [];
      FP.dom.fill(levers, effects.length ? [
        h('h3', null, 'What would make the biggest difference'),
        h('ul', { class: 'lever-list' }, effects.map((e) => h('li', null,
          h('span', null, h('strong', null, e.lever.label), h('span', { class: `delta ${e.diff.change}` }, ` ${e.diff.label.toLowerCase()}: ${deltaText(e.diff)}`)),
          h('button', {
            type: 'button', class: 'secondary small',
            onclick: () => { e.lever.apply(work); drawDrivers(); draw(); },
          }, 'Try it')))),
      ] : null);

      if (id === 'leftover') drawSplit(after);

      const list = after.ok ? O.ideasFor(id, work).filter((s) => !(work.ideas || {})[s.id]) : [];
      FP.dom.fill(ideas, list.length ? [
        h('h3', null, 'Recommendations'),
        h('ul', { class: 'ideas' }, list.map((s) => h('li', { class: `idea ${s.tone}` },
          h('span', { class: 'idea-icon', 'aria-hidden': 'true' }, TONE_ICON[s.tone]),
          h('div', null, h('strong', null, s.title), h('p', null, s.text))))),
        h('p', { class: 'muted small' }, 'General rules of thumb, not financial advice.'),
      ] : null);

      // A one-line result under the title, so you see it change while you edit further down.
      const first = isChanged && after.ok ? O.compare(before, after).find((d) => d.change !== 'same') : null;
      sheet.setStatus(isChanged && after.ok ? [after.headline, first ? h('span', { class: `delta ${first.change}` }, ` ${deltaText(first)}`) : null] : null);

      FP.dom.fill(actions, isChanged ? [
        h('button', {
          type: 'button',
          onclick: () => {
            ctx.replaceProfile(work);
            sheet.close(true);
            ctx.toast('Changes applied to your plan');
          },
        }, 'Apply to my plan'),
        h('button', {
          type: 'button', class: 'secondary',
          onclick: () => {
            const sc = FP.scenarios.addProfile(ctx.workspace(), work, scenarioName(base, work, o.title));
            if (!sc) { ctx.toast(`You can have up to ${FP.scenarios.MAX_SCENARIOS} scenarios. Delete one first.`); return; }
            ctx.changed();
            sheet.close(true);
            ctx.rerender();
            ctx.toast(`Saved as “${sc.name}” — compare it in What if`);
          },
        }, 'Save as a scenario'),
        h('button', { type: 'button', class: 'link', onclick: () => { work = O.copy(base); drawDrivers(); draw(); } }, 'Undo changes'),
      ] : null);
      actions.hidden = !isChanged;
    }

    // Left over each month: what you do with it, and the suggested split.
    function drawSplit(after) {
      const r = FP.suggest.analyse(work);
      if (!after.ok || !r.split) { FP.dom.fill(extra); return; }
      // Shown as % and £ whichever you entered it in.
      const mine = FP.projection.splitAsPct(work.leftover, r.left);
      const using = P.LEFTOVER_FIELDS.every((f) => Math.abs((mine[f.key] || 0) - r.split[f.key]) < 0.5);
      const parts = (split) => P.LEFTOVER_FIELDS.filter((f) => split[f.key] > 0)
        .map((f) => `${Math.round(split[f.key])}% ${f.label.toLowerCase()} (${money(r.left * split[f.key] / 100)})`).join(' \u00b7 ');
      FP.dom.fill(extra,
        h('h3', null, 'What you do with it'),
        h('p', null, parts(mine) || 'Nothing chosen yet, so none of it is saved in your projection \u2014 it\u2019s treated as spent.'),
        using ? h('p', { class: 'small positive' }, '\u2713 That\u2019s the suggested split.') : [
          h('p', { class: 'suggested-split' }, h('strong', null, 'Suggested: '), parts(r.split), h('br'), h('span', { class: 'muted small' }, r.splitReason)),
          h('button', {
            type: 'button', class: 'secondary small',
            onclick: () => { FP.projection.setSplitFromPct(work.leftover, r.split, r.left); drawDrivers(); draw(); },
          }, 'Use this split'),
        ],
        h('p', { class: 'small' }, h('a', { href: '#setup/leftover', onclick: (e) => { sheet.close(); if (sheet.el.open) e.preventDefault(); } }, 'Change the split in Your figures')));
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(draw, 250);
    }

    const sheet = FP.sheet.open({
      title: o.title,
      // Closing with changes you haven't applied or saved asks first.
      canClose: () => !changed() || confirm('Discard your changes? They haven\u2019t been applied to your plan or saved as a scenario.'),
      body: [result, actions, extra, drivers, levers, ideas],
    });
    drawDrivers();
    draw();
    return sheet;
  }

  FP.explore = { open };
})(globalThis.FP = globalThis.FP || {});
