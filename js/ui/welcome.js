/*
 * Welcome: the front page (the app's name, what happens next and Get
 * started), then the quick start, shown on Your plan until it's done.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;

  // The answers behind a first, rough plan. Same profile fields as Your figures.
  const QUICK = ['about.age', 'income.grossSalary', 'outgoings.estimate', 'assumptions.retirementAge', 'goals.retirementIncome'];
  const SPEND_FIELD = { path: 'outgoings.estimate', label: 'Everything going out each month', type: 'money', suffix: 'a month', nullable: true,
    nullPlaceholder: '0',
    help: 'Include your rent or mortgage, bills and any loan or card payments, as well as everyday spending. An estimate is fine: you can refine it later.' };

  const spendTotal = (p) => p.spending.reduce((t, r) => t + (Number(r.monthly) || 0), 0);
  // Outgoings already itemised without an estimate are edited in Your figures, not here.
  const itemisedOnly = (p) => p.outgoings.estimate == null && spendTotal(p) > 0;
  function quickPaths(p) {
    return QUICK.filter((path) => path !== SPEND_FIELD.path || !itemisedOnly(p));
  }
  // With a partner, four more: their name, age, salary and retirement age.
  const PARTNER_QUICK = FP.profile.PARTNER_FIELDS.filter((f) => !f.more);
  const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const questionCount = (p) => COUNT_WORDS[quickPaths(p).length + (p.partner ? PARTNER_QUICK.length : 0)];
  const introText = (p) => `${questionCount(p).replace(/^./, (c) => c.toUpperCase())} questions for a first look at your plan. You can add detail afterwards.`;

  function quickField(path) {
    if (path === SPEND_FIELD.path) return SPEND_FIELD;
    return FP.profile.SECTIONS.flatMap((sec) => sec.fields).find((f) => f.path === path);
  }

  /*
   * Sense checks on the figures most often typed in the wrong period (a yearly
   * amount in a monthly box, or the other way round). Most never block: each asks,
   * and offers the likely figure. Returns null or { text, fix, fixLabel }, or
   * { error } for a figure that can't be right (the box shows it as an error).
   */
  const maybeYearly = (v) => ({
    text: `That\u2019s ${money(v * 12)} a year. Did you mean ${money(v)} a year (${money(v / 12)} a month)?`,
    // To the penny, so the yearly figure comes back exactly.
    fix: Math.round((v / 12) * 100) / 100,
    fixLabel: `Use ${money(v / 12)} a month`,
  });
  // Figures no household could have (a month): an error in the box, not a question.
  const LIMITS = { 'goals.retirementIncome': 100000, 'outgoings.estimate': 200000 };
  const tooHigh = (path) => ({ error: `More than ${money(LIMITS[path])} a month can\u2019t be right. Check the figure: is it a yearly amount?` });
  const CHECKS = {
    'goals.retirementIncome': (v, p) => {
      if (!(v > 0)) return null;
      if (v > LIMITS['goals.retirementIncome']) return tooHigh('goals.retirementIncome');
      const takeHome = FP.tax.household(p).takeHomeMonthly;
      const out = FP.summary.compute(p, takeHome).cashFlow.outgoings;
      return (out > 0 && v > out * 2) || (takeHome > 0 && v > takeHome) ? maybeYearly(v) : null;
    },
    'outgoings.estimate': (v, p) => {
      if (v > LIMITS['outgoings.estimate']) return tooHigh('outgoings.estimate');
      const takeHome = FP.tax.household(p).takeHomeMonthly;
      return v > 0 && takeHome > 0 && v > takeHome * 1.5 ? maybeYearly(v) : null;
    },
    'income.grossSalary': (v) => {
      if (v > 0 && v < 1000) {
        return { text: `That\u2019s ${money(v)} a year. Did you mean ${money(v * 12)} a year (${money(v)} a month)?`, fix: v * 12, fixLabel: `Use ${money(v * 12)} a year` };
      }
      if (v > 1000000) {
        const fix = Math.round(v / 10);
        return { text: `That\u2019s ${money(v)} a year. Did you mean ${money(fix)} a year?`, fix, fixLabel: `Use ${money(fix)} a year` };
      }
      return null;
    },
  };
  // The sense check for a field in this profile, as FP.field.render's `check`, or undefined.
  // Your partner's salary has the same check as yours.
  function senseCheck(path, profile) {
    const c = CHECKS[path] || (path === 'partner.income.grossSalary' ? CHECKS['income.grossSalary'] : null);
    return c ? (v) => c(v, profile()) : undefined;
  }

  /*
   * Every figure in this profile that fails its sense check, for Plan's
   * warning line: [{ path, label, value, shown ("£40,000 a month"), error }] (error: an impossible figure,
   * saved before it was refused).
   */
  function failedChecks(p) {
    const paths = Object.keys(CHECKS).concat(p.partner ? ['partner.income.grossSalary'] : []);
    return paths.map((path) => {
      const v = FP.profile.get(p, path);
      const c = senseCheck(path, () => p)(v);
      if (!c) return null;
      const partner = path === 'partner.income.grossSalary';
      const f = partner ? FP.profile.fieldFor('income.grossSalary') : FP.profile.fieldFor(path);
      const label = partner ? `${FP.profile.capital(FP.profile.whose(p, 1))} salary` : f.label;
      return { path, label, value: v, shown: `${money(v)} ${f.suffix}`, error: !!c.error };
    }).filter(Boolean);
  }

  // How many of the quick-start questions have an answer.
  function answerCount(p) {
    return quickPaths(p).filter((path) => {
      const v = FP.profile.get(p, path);
      return v != null && v !== 0;
    }).length;
  }

  /*
   * Quick start: up to five answers, then a first look at your plan. Where the same
   * fields also appear further down the page (Setup), typing in one copy
   * updates the other.
   */
  // A partner taken off in the quick start, kept for this visit in case you change your mind.
  let keptPartner = null;

  /*
   * Who the plan is for, as FP.field.render's toggle: adding a partner (or
   * bringing back the one you took off) and taking them off. onSwitch() after.
   */
  // opts.confirm: ask before taking off a partner whose figures you've entered.
  function householdToggle(ctx, onSwitch, opts) {
    const el = FP.field.render(FP.profile.HOUSEHOLD_FIELD, {
      value: ctx.profile().partner ? 'couple' : 'me',
      onChange: (v) => {
        const p = ctx.profile();
        const x = p.partner;
        const entered = x && (x.name || x.age != null || x.income.grossSalary > 0 || x.pension > 0 || p.pensions.some((y) => y.owner === 'partner'));
        if (v === 'me' && opts && opts.confirm && entered
          && !confirm(`Take ${FP.profile.who(p, 1)} off your plan? Their pay and pensions go, and what they own becomes yours. Choose \u2018Me and a partner\u2019 again before you close the planner to bring them back.`)) {
          el.querySelector('input[value="couple"]').checked = true;
          return;
        }
        if (v === 'couple') { FP.profile.addPartner(p, keptPartner); keptPartner = null; } else keptPartner = FP.profile.removePartner(p);
        ctx.changed();
        onSwitch();
      },
    });
    return el;
  }

  /*
   * Quick start: who the plan is for, then up to five answers (four more with
   * a partner), then a first look at your plan. Where the same fields also
   * appear further down the page (Setup), typing in one copy updates the other.
   */
  function quickStart(ctx, root) {
    const p = ctx.profile();
    // Older plans started with nine empty categories: clear them for your estimate.
    if (p.spending.length > 1 && !(spendTotal(p) > 0)) p.spending = [FP.profile.newRest()];
    const paths = quickPaths(p);
    const ask = (f) => FP.field.render(f, {
      value: FP.profile.get(ctx.profile(), f.path),
      nullPlaceholder: f.nullPlaceholder,
      noBlankNote: true,
      check: senseCheck(f.path, ctx.profile),
      onChange: (v) => {
        FP.profile.set(ctx.profile(), f.path, v);
        // Your estimate goes into your outgoings as the rest not itemised yet.
        if (f.path === SPEND_FIELD.path) FP.summary.syncOutgoings(ctx.profile());
        ctx.changed();
        // The checks compare your answers with each other.
        FP.field.recheckAll(card);
      },
    });
    const intro = h('p', { class: 'muted' }, introText(p));
    // Your partner's questions, only once you've said there's a partner.
    const partnerBox = h('div', { class: 'partner-questions' });
    const drawPartner = () => {
      const pp = ctx.profile();
      intro.textContent = introText(pp);
      FP.dom.fill(partnerBox, pp.partner ? h('fieldset', { class: 'field-group person-group' },
        h('legend', null, 'Your partner'),
        PARTNER_QUICK.map(ask)) : null);
      FP.field.recheckAll(card);
    };
    const fields = paths.map((path) => ask(quickField(path)));
    // Their questions follow your pay.
    const at = paths.indexOf('income.grossSalary') + 1;
    const card = h('section', { class: 'card quick-start', 'aria-labelledby': 'quick-h' },
      h('h1', { id: 'quick-h' }, 'Quick start'),
      intro,
      householdToggle(ctx, drawPartner),
      fields.slice(0, at), partnerBox, fields.slice(at),
      h('button', { type: 'button', class: 'quick-go', onclick: () => {
        const bad = card.querySelector('[aria-invalid="true"]');
        if (bad) { bad.focus(); ctx.toast('Fix the highlighted box first.'); return; }
        // Your plan shows this page again until these are in, so say what's missing.
        const missing = FP.summary.checklist(ctx.profile()).blocking;
        if (missing.length) {
          const first = missing[0].target;
          const input = card.querySelector(`[data-path="${CSS.escape(first)}"] input`);
          if (input) input.focus();
          ctx.toast(`Add ${missing.map((i) => i.label.toLowerCase()).join(' and ')} first.`);
          return;
        }
        ctx.go('plan');
      } }, 'See my plan'));
    drawPartner();
    (root || card).addEventListener('input', (e) => {
      const wrap = e.target.closest && e.target.closest('[data-path]');
      if (!wrap || !(paths.includes(wrap.dataset.path) || wrap.dataset.path.startsWith('partner.'))) return;
      (root || card).querySelectorAll(`[data-path="${CSS.escape(wrap.dataset.path)}"] input[type="text"]`).forEach((i) => { if (i !== e.target) i.value = e.target.value; });
    });
    return card;
  }

  // Set when Get started couldn't be saved (storage blocked), so the button still works this visit.
  let startedUnsaved = false;

  /*
   * Until you start: a front page with the app's name, what happens next and
   * one button. Then the quick start on its own. Someone who has already
   * entered something goes straight to the quick start.
   */
  function render(root, ctx) {
    const started = startedUnsaved || FP.store.pref('started') === '1' || !FP.checklist.isEmpty(ctx.profile());
    if (started) quickStartPage(root, ctx); else frontPage(root, ctx);
  }

  const steps = (p) => [
    [`Answer ${questionCount(p)} quick questions`, 'Your age, pay, what goes out each month and when you’d like to retire. About a minute; rough figures are fine.'],
    ['See your first plan', 'What’s left each month, and how much you’d need for retirement.'],
    ['Add detail when you’re ready', 'Savings, pensions and debts sharpen the picture and unlock your next steps.'],
  ];

  // Ways in other than the quick start: the sample household, or a backup.
  function otherWays(ctx) {
    return h('p', { class: 'gate-other' }, 'Just looking? ',
      h('button', {
        type: 'button', class: 'link',
        onclick: () => {
          // The front page has just shown the notice, so the bar stays one line.
          document.getElementById('disclaimer').open = false;
          ctx.replaceWorkspace(FP.sampleWorkspace());
          ctx.toast('Sample data loaded');
        },
      }, 'See a fictional example'),
      ' · Used it before? ', h('a', { href: '#data' }, 'Import a backup'));
  }

  function frontPage(root, ctx) {
    FP.dom.add(root,
      h('section', { class: 'gate', 'aria-labelledby': 'gate-h' },
        h('span', { class: 'gate-mark', 'aria-hidden': 'true' }, '£'),
        h('h1', { id: 'gate-h' }, 'Finance planner'),
        h('p', { class: 'gate-tag' }, 'Plan your money, privately. A UK planner for your pay, spending, debts and retirement.'),
        h('ol', { class: 'gate-steps' }, steps(ctx.profile()).map(([title, text]) => h('li', null, h('strong', null, title), h('span', null, text)))),
        h('button', {
          type: 'button', class: 'gate-go',
          onclick: () => {
            FP.store.pref('started', '1');
            startedUnsaved = FP.store.pref('started') !== '1';
            // The front page has just shown the notice, so the bar stays one line.
            document.getElementById('disclaimer').open = false;
            ctx.rerender();
            window.scrollTo(0, 0);
            const head = document.getElementById('quick-h');
            if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); }
          },
        }, 'Get started'),
        otherWays(ctx),
        h('p', { class: 'gate-note' }, 'Everything stays in this browser: no accounts, nothing sent anywhere.'),
        h('p', { class: 'gate-note' }, h('a', { href: '#data' }, 'Your data'), ' · ', h('a', { href: '#settings' }, 'Settings')),
        h('details', { class: 'gate-notice', open: true },
          h('summary', null, 'A planning illustration, not financial advice'),
          // Same wording as the notice under the header, kept in one place (index.html).
          h('p', null, document.querySelector('#disclaimer p').textContent))));
  }

  function quickStartPage(root, ctx) {
    FP.dom.add(root, quickStart(ctx), h('section', { class: 'card', 'aria-label': 'Other ways to start' }, otherWays(ctx)));
  }

  /*
   * Whether your plan rests on little more than the quick-start answers: no
   * savings, pensions or debts entered, no pay details beyond salary, and you
   * haven't yet been through the Assets and Debts sections of Your figures
   * (someone with none of those has nothing to add there).
   */
  function isRough(p) {
    const inc = p.income;
    const visited = (FP.store.pref('setupVisited') || '').split(',');
    const added = Object.values(p.assets).some((v) => v > 0) || p.mortgage.balance > 0 || (p.debts || []).length > 0
      || (p.savings || []).length > 0 || p.spending.some((r) => !r.rest && r.monthly > 0) || FP.projection.splitShares(p.leftover, 1).total > 0
      || inc.studentLoanPlan !== 'none' || inc.bonuses.length > 0 || inc.sacrifices.length > 0 || (inc.benefits || []).length > 0
      || inc.otherIncome > 0 || inc.taxFreeIncome > 0 || !!inc.taxCode;
    return !added && !(visited.includes('assets') && visited.includes('debts'));
  }

  FP.welcome = { render, householdToggle, isRough, senseCheck, failedChecks, answerCount, LIMITS };
})(globalThis.FP = globalThis.FP || {});
