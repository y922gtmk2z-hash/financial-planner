/* Small DOM and formatting helpers shared by the screens. */
(function (FP) {
  'use strict';

  // h('div', { class: 'x', onclick: fn }, child, 'text', [more])
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    append(el, children);
    return el;
  }

  function append(el, children) {
    children.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
  }

  // Like el.append, but accepts nested arrays and skips null/false.
  function add(el, ...children) {
    append(el, children);
    return el;
  }

  // Like replaceChildren, but accepts nested arrays and skips null/false.
  function fill(el, ...children) {
    el.replaceChildren();
    append(el, children);
    return el;
  }

  const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

  // Figures this many years or more ahead are estimates, shown rounded (see money).
  const APPROX_YEARS = 5;
  const far = (yearsAhead) => yearsAhead >= APPROX_YEARS;

  /*
   * £ to the pound, or with { approx: true } to three significant figures:
   * £1.20m, £292k, £45.7k, £3,800. For projected figures five or more years
   * ahead, so they don't look more exact than they are.
   */
  function money(n, opts) {
    if (!Number.isFinite(n)) return '—';
    if (opts && opts.approx) return approxMoney(n);
    const s = gbp0.format(Math.round(n));
    return s === '-£0' ? '£0' : s;
  }

  function approxMoney(n) {
    const a = Math.abs(n);
    const sign = n < 0 && Number(a.toPrecision(3)) >= 0.5 ? '-' : '';
    if (Number((a / 1e3).toPrecision(3)) >= 1000) return `${sign}£${(a / 1e6).toPrecision(3)}m`;
    if (Number(a.toPrecision(3)) >= 1e4) return `${sign}£${(a / 1e3).toPrecision(3)}k`;
    return `${sign}${gbp0.format(Math.round(Number(a.toPrecision(3))))}`;
  }

  function pct(n, dp = 1) {
    if (!Number.isFinite(n)) return '—';
    return `${Number(n.toFixed(dp))}%`;
  }

  function months(m) {
    if (!Number.isFinite(m)) return '—';
    const y = Math.floor(m / 12);
    const r = m % 12;
    const parts = [];
    if (y) parts.push(`${y} year${y === 1 ? '' : 's'}`);
    if (r) parts.push(`${r} month${r === 1 ? '' : 's'}`);
    return parts.join(' ') || '0 months';
  }

  function date(iso) {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // How a stored number is shown in an input box.
  function inputText(field, value) {
    if (value == null) return '';
    if (field.type === 'money') {
      if (value === 0) return ''; // show the placeholder rather than a 0
      return value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
    }
    return String(value);
  }

  function chips(items) {
    return h('ul', { class: 'chips', 'aria-label': 'Assumptions used' },
      items.filter(Boolean).map((t) => h('li', { class: 'chip' }, t)));
  }

  // A tab's heading and its one-line subtitle. (Your figures is in the header.)
  function pageHead(title, sub) {
    return h('div', { class: 'page-head' },
      h('div', null, h('h1', null, title), h('p', { class: 'page-sub' }, sub)));
  }

  // A text link at the foot of a card, to the figures behind it.
  function cardFoot(href, text) {
    return h('p', { class: 'card-foot' }, h('a', { href: href || '#setup' }, text || 'Edit your figures'));
  }

  /*
   * One name for each measure, used on every screen (see the README glossary),
   * with what it includes for the detail sheets. of(row): its value from a
   * projection row.
   */
  const MEASURES = {
    savingsPensions: { label: 'Savings and pensions', includes: 'Includes cash, ISAs, other investments and pensions. Not your home.', of: (r) => r.cash + r.isa + r.gia + r.pension },
    pensionPots: { label: 'Pension pots', includes: 'Includes your pensions only.', of: (r) => r.pension },
    netWorth: { label: 'Net worth', includes: 'Includes everything you own, your home too, minus everything you owe.', of: (r) => r.netWorth },
    moneyLastsTo: { label: 'Money lasts to', includes: 'The age your savings and pensions last to, spending your retirement goal each month.' },
    couldSpend: { label: 'Could spend in retirement', includes: 'The most you could spend each month from retirement, in today\u2019s money, without running short.' },
  };
  const measure = (id, age) => (age == null ? MEASURES[id].label : `${MEASURES[id].label} at ${age}`);

  // "Money lasts to", from FP.projection.retirementNeed: an age, or "95+" when it lasts.
  const lastsTo = (need) => (need.lastsUntil ? `Age ${need.lastsUntil}` : `${need.endAge}+`);

  // One plain-English line under a chart: what it means for you.
  function soWhat(text) {
    return h('p', { class: 'so-what' }, h('strong', null, 'So what: '), text);
  }

  /*
   * A card folded to one line: a title and a short summary of what's inside.
   * The id lets it stay open or closed as you move between screens.
   */
  function foldCard(id, title, summary, ...children) {
    return h('details', { class: 'card fold-card', id },
      h('summary', null, h('span', { class: 'fold-title' }, title), summary ? h('span', { class: 'fold-sum' }, summary) : null),
      h('div', { class: 'fold-body' }, children));
  }

  /*
   * When your plan's retirement goal starts, on your age: when you retire, or
   * with a partner, once you've both retired (need: from retirementNeed, if worked out).
   */
  function retireAt(p, need) {
    return need && need.retirementAge != null ? need.retirementAge : p.assumptions.retirementAge;
  }
  // "you at 63 and Sam at 60": each of you and the age you retire, or '' for just you.
  function bothRetire(p) {
    if (!p.partner) return '';
    return FP.profile.people(p).map((x, i) => `${FP.profile.who(p, i)} at ${x.retirementAge}`).join(' and ');
  }

  FP.dom = { h, append, add, fill, money, far, APPROX_YEARS, pct, months, date, inputText, chips, pageHead, cardFoot, soWhat, foldCard, MEASURES, measure, lastsTo, retireAt, bothRetire };
})(globalThis.FP = globalThis.FP || {});
