// Calendar reminders (js/ui/ics.js): valid iCalendar text, built with no network.
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.FP = globalThis.FP || {};
require('../js/ui/ics.js');
const { reminder, escape, fold } = globalThis.FP.ics;

const NOW = new Date('2026-10-24T12:00:00Z');

test('a reminder is an all-day event on the chosen date', () => {
  const text = reminder({ date: '2026-11-03', title: 'Higher-rate pension relief', description: 'Ask payroll.', uid: 'x@y', now: NOW });
  const lines = text.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  assert.ok(lines.includes('VERSION:2.0'));
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261103'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20261104'));
  assert.ok(lines.includes('DTSTAMP:20261024T120000Z'));
  assert.ok(lines.includes('UID:x@y'));
  assert.ok(lines.includes('SUMMARY:Higher-rate pension relief'));
  assert.ok(!/\r(?!\n)|(?<!\r)\n/.test(text), 'every line ends in CRLF');
});

test('the end of a month and of a year roll over', () => {
  assert.match(reminder({ date: '2026-12-31', title: 'x', now: NOW }), /DTEND;VALUE=DATE:20270101/);
  assert.match(reminder({ date: '2028-02-28', title: 'x', now: NOW }), /DTEND;VALUE=DATE:20280229/);
});

test('text is escaped and long lines are folded at 75 octets', () => {
  assert.equal(escape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = reminder({ date: '2026-11-03', title: 'Use your ISA allowance', description: `${'£ and – text, '.repeat(20)}end`, now: NOW });
  long.split('\r\n').forEach((line) => assert.ok(Buffer.byteLength(line) <= 75, `${Buffer.byteLength(line)}: ${line}`));
  const unfolded = long.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DESCRIPTION:£ and – text\\, £'));
  assert.equal(fold('short'), 'short');
});

test('no reminder without a real date', () => {
  assert.equal(reminder({ date: '', title: 'x' }), null);
  assert.equal(reminder({ date: '2026-02-30', title: 'x' }), null);
  assert.equal(reminder({ date: '3 Nov', title: 'x' }), null);
});
