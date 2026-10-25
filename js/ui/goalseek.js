/*
 * "What would it take to…" on What if: pick a goal (retire at an age, spend
 * an amount a month in retirement, be debt-free by an age) and one thing to
 * change, and the planner works out how much (FP.goalSeek). The answer is a
 * patch: Apply it to the scenario you're editing, or try it as a scenario.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const GS = () => FP.goalSeek;

  // Remembered while you move around, so the card keeps your last question.
  const state = { goal: 'spend', values: {}, lever: {} };

  function defaults(p) {
    const a = p.assumptions;
    const rs = FP.projection.retirementSpend(p);
    const free = GS().debtFreeAge(p);
    return {
      retireAt: Math.max((p.about.age || 30) + 1, a.retirementAge - 3),
      spend: rs ? Math.ceil((rs.monthly * 1.2) / 100) * 100 : 2000,
      debtFree: free ? Math.max((p.about.age || 30) + 1, free - 5) : (p.about.age || 30) + 10,
    };
  }

  // What the answer means, in plain words.
  function answerText(r, p) {
    const goalText = {
      retireAt: `retire at ${r.goal.value} with your money lasting to ${p.assumptions.endAge}`,
      spend: `spend ${money(r.goal.value)} a month in retirement (today’s money)`,
      debtFree: `be debt-free by ${r.goal.value}`,
    }[r.goal.id];
    if (r.already) return `You’re on course to ${goalText} already${r.goal.id === 'retireAt' ? ', with nothing else changed' : ''}.`;
    const lever = {
      pension: `pay ${FP.dom.pct(r.value)} of your salary into your pension (now ${FP.dom.pct(r.now)})`,
      retireAge: `retire at ${r.value} (now ${r.now})`,
      spending: `spend ${money(r.value)} a month (now ${money(r.now)})`,
      overpay: `pay ${money(r.value)} a month extra on ${(r.targets || []).join(' and ')}`,
    }[r.lever];
    return `To ${goalText}, you’d need to ${lever}.`;
  }

  // A scenario's name for the answer.
  function scenarioName(r) {
    const g = { retireAt: `Retire at ${r.goal.value}`, spend: `${money(r.goal.value)} in retirement`, debtFree: `Debt-free by ${r.goal.value}` }[r.goal.id];
    const l = { pension: `pension ${FP.dom.pct(r.value)}`, retireAge: `retire at ${r.value}`, spending: `spend ${money(r.value)}`, overpay: `${money(r.value)} extra` }[r.lever];
    return r.already ? g : `${g}: ${l}`;
  }

  function card(ctx) {
    const out = h('div', { class: 'goal-answer', role: 'status', 'aria-live': 'polite' });
    const form = h('div');
    const body = h('section', { class: 'card goal-seek', 'aria-labelledby': 'goal-h' },
      h('h2', { id: 'goal-h' }, 'What would it take to…'),
      h('p', { class: 'muted' }, 'Choose a goal and one thing to change. The planner works out how much, on your assumptions.'),
      form, out);
    let run = 0;

    const draw = () => {
      const p = ctx.profile();
      const d = defaults(p);
      const goal = GS().GOALS.find((g) => g.id === state.goal);
      if (state.values[goal.id] == null) state.values[goal.id] = d[goal.id];
      if (!goal.levers.includes(state.lever[goal.id])) state.lever[goal.id] = goal.levers[0];
      const valueField = goal.unit === 'money'
        ? { label: 'How much a month, in today’s money', type: 'money', suffix: 'a month' }
        : { label: 'By what age', type: 'int', min: (p.about.age || 16) + 1, max: 100, suffix: 'years old' };
      FP.dom.fill(form,
        FP.field.render({
          label: 'Goal', type: 'select',
          options: GS().GOALS.map((g) => ({ value: g.id, label: { retireAt: 'Retire at an age', spend: 'Spend in retirement', debtFree: 'Be debt-free by an age' }[g.id] })),
        }, { value: goal.id, onChange: (v) => { state.goal = v; FP.dom.fill(out); draw(); } }),
        FP.field.render({ ...valueField, path: null }, { value: state.values[goal.id], onChange: (v) => { state.values[goal.id] = v; FP.dom.fill(out); } }),
        FP.field.render({
          label: 'By changing', type: 'select',
          options: goal.levers.map((l) => ({ value: l, label: GS().LEVERS[l] })),
          help: goal.id === 'debtFree' ? 'Extra payments go on each debt still owing at that age: your mortgage, other debts and student loan.' : null,
        }, { value: state.lever[goal.id], onChange: (v) => { state.lever[goal.id] = v; FP.dom.fill(out); } }),
        h('button', { type: 'button', onclick: () => solve() }, 'Work it out'));
    };

    // Runs the solver after the page has said it's working (it re-runs the plan many times).
    function solve() {
      const p = JSON.parse(JSON.stringify(ctx.profile()));
      const goal = { id: state.goal, value: state.values[state.goal] };
      const lever = state.lever[state.goal];
      run += 1;
      const mine = run;
      FP.dom.fill(out, h('p', { class: 'muted' }, 'Working it out…'));
      setTimeout(() => {
        if (mine !== run || !out.isConnected) return;
        const r = GS().solve(p, goal, lever);
        FP.dom.fill(out, r.ok ? answer(ctx, r, p) : h('p', { class: 'notice info' }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, 'i'), h('span', null, r.reason)));
      }, 30);
    }

    draw();
    return body;
  }

  function answer(ctx, r, p) {
    const can = r.patch.length > 0;
    return h('div', { class: 'goal-result' },
      h('p', null, h('strong', null, answerText(r, p))),
      r.lever === 'spending' && !r.already ? h('p', { class: 'help' }, 'Every spending category, and your estimate of everything going out, changes by the same share.') : null,
      can ? h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'small', onclick: () => apply(ctx, r) }, 'Apply'),
        h('button', { type: 'button', class: 'small secondary', onclick: () => tryIt(ctx, r) }, 'Try as a scenario')) : null,
      h('p', { class: 'help' }, 'On your assumptions, with average returns every year. Planning illustration only, not advice.'));
  }

  // Makes the change in the scenario you're editing, with Undo.
  function apply(ctx, r) {
    const before = JSON.parse(JSON.stringify(ctx.profile()));
    ctx.replaceProfile(FP.patch.applyPatch(before, r.patch));
    const saved = JSON.stringify(ctx.profile());
    ctx.toast(`Applied: ${scenarioName(r)}`, {
      action: {
        label: 'Undo',
        run: () => {
          if (JSON.stringify(ctx.profile()) !== saved) { ctx.toast('Your plan has changed since, so this can’t be undone here.'); return; }
          ctx.replaceProfile(before);
          ctx.toast('Undone');
        },
      },
    });
  }

  function tryIt(ctx, r) {
    const sc = FP.scenarios.addProfile(ctx.workspace(), FP.patch.applyPatch(ctx.profile(), r.patch), scenarioName(r));
    if (!sc) { ctx.toast(`You have ${FP.scenarios.MAX_SCENARIOS} scenarios already. Delete one to add another.`); return; }
    ctx.changed();
    ctx.rerender();
    ctx.toast(`Added “${sc.name}” — compare it with your plan`);
  }

  FP.goalSeekUi = { card };
})(globalThis.FP = globalThis.FP || {});
