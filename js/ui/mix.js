/*
 * What each pot is invested in, in Your figures: a fold under each ISA,
 * investment and pension pot with its mix of shares, bonds and cash, and the
 * typical mix for your risk level (an illustration, not a recommendation)
 * with Use this mix and Try as a scenario. About you shows the three model
 * mixes under the risk question.
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;
  const LEVEL_LABEL = (v) => (FP.profile.RISK_LEVELS.find((o) => o.value === v) || {}).label || v;
  const MIX_FIELDS = [
    { key: 'shares', label: 'Shares', help: 'Shares (equities) in companies, including in funds. They’ve grown most over the long run, and fall furthest in a bad year.' },
    { key: 'bonds', label: 'Bonds', help: 'Loans to governments and companies (gilts and corporate bonds), including in funds. They usually move less than shares.' },
  ].map((f) => ({ ...f, type: 'pct', min: 0, max: 100, suffix: '%' }));

  const notice = () => h('p', { class: 'notice info mix-notice' },
    h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, 'i'), h('span', null, FP.mix.NOTICE));

  const potOf = (p, id) => FP.mix.pots(p).find((x) => x.id === id);

  // "40% shares, 60% bonds · about 4.6% a year after fees"
  function summary(pot, a) {
    return `${FP.mix.describe(pot.mix)} · about ${FP.dom.pct(FP.mix.netRate(pot.mix, a, pot.kind))} a year after fees`;
  }

  /*
   * The fold under one pot (by its id in FP.mix.pots). Its id keeps it open
   * or closed as you move around.
   */
  function fold(ctx, id) {
    const pot0 = potOf(ctx.profile(), id);
    if (!pot0) return null;
    const sum = h('span', { class: 'fold-sum' });
    const body = h('div', { class: 'mix-body' });
    const el = h('details', { class: 'advanced mix-fold', id: `mix-${id}` },
      h('summary', null, h('span', { class: 'fold-title' }, 'What it’s invested in'), sum),
      body);

    const draw = () => {
      const p = ctx.profile();
      const pot = potOf(p, id);
      if (!pot) return;
      const a = p.assumptions;
      sum.textContent = summary(pot, a);
      const cash = h('p', { class: 'mix-cash' });
      const err = h('p', { class: 'field-error', role: 'alert', hidden: true });
      const growth = h('p', { class: 'mix-growth', role: 'status' });
      let now = { ...pot.mix };
      const show = () => {
        const rest = Math.round((100 - now.shares - now.bonds) * 10) / 10;
        err.hidden = rest >= 0;
        err.textContent = rest >= 0 ? '' : `Shares and bonds add up to more than 100%. Take ${-rest}% off one of them.`;
        cash.textContent = rest >= 0 ? `Cash: ${rest}% (the rest)` : 'Cash: none';
        growth.textContent = FP.mix.tradeOffText(rest >= 0 ? { ...now, cash: rest } : pot.mix, a, pot.kind);
      };
      const box = (f) => FP.field.render({ ...f, path: `${pot.path}.${f.key}` }, {
        value: now[f.key],
        ariaLabel: `${pot.label}: ${f.label.toLowerCase()}, % of the pot`,
        onChange: (v) => {
          now = { ...now, [f.key]: v || 0 };
          const rest = Math.round((100 - now.shares - now.bonds) * 1e6) / 1e6;
          if (rest >= 0) {
            ctx.update(pot.path, { shares: now.shares, bonds: now.bonds, cash: rest });
            sum.textContent = summary(potOf(ctx.profile(), id), a);
          }
          show();
        },
      });
      FP.dom.fill(body,
        h('p', { class: 'help' }, 'From your provider’s app or statement: how much of the pot is in shares, bonds and cash. Not sure? Leave it as it is.'),
        h('div', { class: 'mix-boxes' }, MIX_FIELDS.map(box)),
        cash, err, growth,
        modelBox(ctx, pot));
      show();
    };
    draw();
    // Your figures draws every section at once, so a risk answer given in
    // About you since shows when the fold is opened.
    el.addEventListener('toggle', () => { if (el.open) draw(); });
    el.redraw = draw;
    return el;
  }

  // The typical mix for your risk level, beside a pot, with Use this mix.
  function modelBox(ctx, pot) {
    const p = ctx.profile();
    const level = p.about.riskAppetite;
    const m = FP.mix.model(level);
    if (!m) {
      return h('p', { class: 'help mix-ask' }, 'To see a typical mix for your risk level, answer ',
        h('a', { href: '#setup/about.riskAppetite' }, 'how you feel about investment risk'), ' in About you.');
    }
    const same = FP.mix.sameMix(pot.mix, m);
    return h('div', { class: 'model-mix', role: 'group', 'aria-label': `A typical mix for this risk level: ${LEVEL_LABEL(level)}` },
      h('p', { class: 'model-mix-head' }, h('strong', null, 'A typical mix for this risk level'), ` · ${LEVEL_LABEL(level)}`),
      h('p', { class: 'model-mix-parts' }, FP.profile.capital(FP.mix.describe(m))),
      h('p', { class: 'help' }, FP.mix.tradeOffText(m, p.assumptions, pot.kind)),
      notice(),
      same ? h('p', { class: 'muted small' }, 'This pot has this mix.') : h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'small', onclick: () => use(ctx, pot, level) }, 'Use this mix'),
        h('button', { type: 'button', class: 'small secondary', onclick: () => tryIt(ctx, pot, level) }, 'Try as a scenario')));
  }

  // Gives the pot the model mix in the scenario you're editing (which draws
  // the screen again), with Undo.
  function use(ctx, pot, level) {
    const before = JSON.parse(JSON.stringify(ctx.profile()));
    const after = FP.patch.applyPatch(before, FP.mix.usePatch(pot.path, level));
    ctx.replaceProfile(after);
    const saved = JSON.stringify(ctx.profile());
    ctx.toast(`${pot.label}: using a typical ${level} mix`, {
      action: {
        label: 'Undo',
        run: () => {
          if (JSON.stringify(ctx.profile()) !== saved) { ctx.toast('Your plan has changed since, so this can’t be undone here.'); return; }
          ctx.replaceProfile(before);
          ctx.toast(`Undone: ${pot.label} mix`);
        },
      },
    });
  }

  function tryIt(ctx, pot, level) {
    const p = ctx.profile();
    const sc = FP.scenarios.addProfile(ctx.workspace(), FP.patch.applyPatch(p, FP.mix.usePatch(pot.path, level)), `${pot.label}: typical ${level} mix`);
    if (!sc) { ctx.toast(`You have ${FP.scenarios.MAX_SCENARIOS} scenarios already. Delete one on What if to add another.`); return; }
    ctx.changed();
    ctx.go('what-if');
    ctx.toast(`Added “${sc.name}” — compare it with your plan`);
  }

  /*
   * Under the risk question in About you: the three model mixes, each with
   * its trade-off in one line and the notice, yours marked.
   */
  function levels(ctx) {
    const wrap = h('div', { class: 'mix-levels', id: 'mix-levels' });
    const draw = () => {
      const p = ctx.profile();
      const mine = p.about.riskAppetite;
      FP.dom.fill(wrap,
        h('p', { class: 'help' }, 'A typical mix for each risk level, before fees. Your figures show yours beside each pot, where you can try it.'),
        h('ul', { class: 'mix-level-list' }, FP.mix.LEVELS.map((l) => {
          const m = FP.mix.model(l);
          return h('li', { class: `mix-level${l === mine ? ' mine' : ''}` },
            h('p', { class: 'model-mix-head' }, h('strong', null, LEVEL_LABEL(l)), l === mine ? h('span', { class: 'badge' }, 'Your answer') : null),
            h('p', { class: 'model-mix-parts' }, FP.profile.capital(FP.mix.describe(m))),
            h('p', { class: 'help' }, FP.mix.tradeOffText(m, p.assumptions)),
            notice());
        })));
    };
    draw();
    wrap.redraw = draw;
    return wrap;
  }

  FP.mixUi = { fold, levels, summary };
})(globalThis.FP = globalThis.FP || {});
