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

  function money(n) {
    if (!Number.isFinite(n)) return '—';
    const s = gbp0.format(Math.round(n));
    return s === '-£0' ? '£0' : s;
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

  FP.dom = { h, append, add, fill, money, pct, months, date, inputText, chips };
})(globalThis.FP = globalThis.FP || {});
