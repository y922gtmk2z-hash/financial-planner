/*
 * A calendar reminder as an .ics file (iCalendar, RFC 5545), built in the
 * browser: no network. An all-day event on the date you choose. No DOM here,
 * so it can be tested in Node; actions.js downloads it.
 */
(function (FP) {
  'use strict';

  // Text values escape backslashes, semicolons, commas and new lines.
  const escape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  // Lines longer than 75 octets are folded: a line break, then a space.
  function fold(line) {
    const out = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const n = new TextEncoder().encode(ch).length;
      if (bytes + n > (out.length ? 74 : 75)) {
        out.push(cur);
        cur = '';
        bytes = 0;
      }
      cur += ch;
      bytes += n;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  const ymd = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

  /*
   * { date: 'YYYY-MM-DD', title, description, uid?, now?, everyMonths? } →
   * the file's text, or null when the date isn't a real date. everyMonths
   * (1 to 12) makes it repeat: every month, or every three (a quarterly
   * check-in), as RRULE:FREQ=MONTHLY;INTERVAL=n.
   */
  function reminder(opts) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opts.date || '');
    if (!m) return null;
    const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (ymd(day) !== `${m[1]}${m[2]}${m[3]}`) return null;
    const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const now = opts.now || new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const uid = opts.uid || `${stamp}-${Math.random().toString(36).slice(2, 10)}@uk-finance-planner`;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//UK finance planner//Reminder//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(day)}`,
      `DTEND;VALUE=DATE:${ymd(next)}`,
      repeatRule(opts.everyMonths),
      `SUMMARY:${escape(opts.title)}`,
      opts.description ? `DESCRIPTION:${escape(opts.description)}` : null,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean);
    return `${lines.map(fold).join('\r\n')}\r\n`;
  }

  // RRULE for repeating every n months, or null (n = 1: just FREQ=MONTHLY).
  function repeatRule(n) {
    if (!Number.isInteger(n) || n < 1 || n > 12) return null;
    return n === 1 ? 'RRULE:FREQ=MONTHLY' : `RRULE:FREQ=MONTHLY;INTERVAL=${n}`;
  }

  FP.ics = { reminder, escape, fold, repeatRule };
})(globalThis.FP = globalThis.FP || {});
