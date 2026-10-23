/*
 * Regular savings: monthly amounts into cash savings, a cash ISA or a stocks &
 * shares ISA. Pure functions, no DOM. The projection adds them each year while
 * you're working; they come out of your monthly surplus.
 *
 * ISA rules: cash ISA and stocks & shares ISA payments share the yearly ISA
 * allowance. From April 2027, under-65s can pay at most the cash ISA limit into
 * cash ISAs. Anything over a limit still gets saved - cash ISA overflow stays
 * as cash savings, stocks & shares overflow goes to a general investment account.
 */
(function (FP) {
  'use strict';

  function monthlyTotals(list) {
    const t = { cash: 0, cashIsa: 0, ssIsa: 0, total: 0 };
    (list || []).forEach((s) => {
      const m = Math.max(0, s.monthly || 0);
      if (s.type === 'cashIsa') t.cashIsa += m;
      else if (s.type === 'ssIsa') t.ssIsa += m;
      else t.cash += m;
      t.total += m;
    });
    return t;
  }

  /*
   * One year of contributions.
   * opts: { salaryFactor (growth since today, for 'salary' items),
   *         isaAllowance, cashIsaLimit (null = no separate limit) }
   * Returns yearly amounts: { cash, isa, gia, isaUsed, total, overAllowance, overCashLimit }
   *   cash = into cash savings (plain + cash ISA), isa = into stocks & shares ISA,
   *   gia = stocks & shares overflow.
   */
  function forYear(list, opts) {
    let plain = 0;
    let cashIsa = 0;
    let ssIsa = 0;
    (list || []).forEach((s) => {
      const yearly = Math.max(0, s.monthly || 0) * 12 * (s.grows === 'salary' ? (opts.salaryFactor || 1) : 1);
      if (s.type === 'cashIsa') cashIsa += yearly;
      else if (s.type === 'ssIsa') ssIsa += yearly;
      else plain += yearly;
    });
    const allowance = Math.max(0, opts.isaAllowance || 0);
    const cashCap = opts.cashIsaLimit == null ? allowance : Math.min(allowance, Math.max(0, opts.cashIsaLimit));
    const cashIn = Math.min(cashIsa, cashCap);
    const ssIn = Math.min(ssIsa, allowance - cashIn);
    return {
      cash: plain + cashIsa,
      isa: ssIn,
      gia: ssIsa - ssIn,
      isaUsed: cashIn + ssIn,
      total: plain + cashIsa + ssIsa,
      // Paying more into ISAs than the overall allowance...
      overAllowance: cashIsa + ssIsa > allowance + 0.5,
      // ...or more into cash ISAs than their own (lower) limit.
      overCashLimit: cashCap < allowance && cashIsa > cashCap + 0.5,
    };
  }

  FP.savings = { monthlyTotals, forYear };
})(globalThis.FP = globalThis.FP || {});
