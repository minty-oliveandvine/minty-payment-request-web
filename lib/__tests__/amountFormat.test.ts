// How money is shown and typed (lib/amountFormat.ts). All string work, never parseFloat, so a
// 12-digit amount keeps every digit - the cases below that go through a float are the ones that
// prove the 8dp bridge in numberToPlainString still collapses the noise.

import { describe, expect, it } from "vitest";

import {
  MAX_AMOUNT_DECIMALS,
  MAX_AMOUNT_INT_DIGITS,
  acceptAmountInput,
  amountIntegerDigits,
  cleanAmountString,
  formatAmount,
  formatMoney,
  isWithinAmountLimits,
  parseAmount,
  toAmountEditString,
  toAmountString,
} from "@/lib/amountFormat";

describe("the limits", () => {
  it("are 11 digits before the point and 2 after", () => {
    expect(MAX_AMOUNT_INT_DIGITS).toBe(11);
    expect(MAX_AMOUNT_DECIMALS).toBe(2);
  });
});

describe("cleanAmountString", () => {
  it("trims and drops the grouping commas", () => {
    expect(cleanAmountString("  1,234.50  ")).toBe("1234.50");
    expect(cleanAmountString("")).toBe("");
  });
});

describe("amountIntegerDigits", () => {
  it("counts the digits before the point", () => {
    expect(amountIntegerDigits("1234.50")).toBe(4);
    expect(amountIntegerDigits("0.50")).toBe(1);
    expect(amountIntegerDigits(".50")).toBe(0);
    expect(amountIntegerDigits("1234")).toBe(4);
  });
});

describe("toAmountString", () => {
  it("normalises to exactly two decimals", () => {
    expect(toAmountString("12,312,312.5")).toBe("12312312.50");
    expect(toAmountString("7")).toBe("7.00");
    expect(toAmountString(".5")).toBe("0.50");
  });

  it("truncates past the second decimal rather than rounding", () => {
    expect(toAmountString("9.999")).toBe("9.99");
    expect(toAmountString("9.991")).toBe("9.99");
  });

  it("keeps every digit of a twelve-digit amount", () => {
    expect(toAmountString("999999999999.99")).toBe("999999999999.99");
  });

  it("strips leading zeros but keeps a lone one", () => {
    expect(toAmountString("007.50")).toBe("7.50");
    expect(toAmountString("0.50")).toBe("0.50");
    expect(toAmountString("0")).toBe("0.00");
  });

  it("keeps a minus only when something is left to be negative about", () => {
    expect(toAmountString("-7.50")).toBe("-7.50");
    expect(toAmountString("-0.00")).toBe("0.00");
    expect(toAmountString("-0")).toBe("0.00");
  });

  it.each([["", ""], ["a dot alone", "."], ["words", "abc"], ["two dots", "1.2.3"], ["a stray sign", "1-2"]])(
    "is undefined for %s",
    (_label, raw) => {
      expect(toAmountString(raw)).toBeUndefined();
    },
  );
});

describe("formatAmount", () => {
  it("groups in threes and always shows two decimals", () => {
    expect(formatAmount(12000)).toBe("12,000.00");
    expect(formatAmount("6000")).toBe("6,000.00");
    expect(formatAmount("1500.5")).toBe("1,500.50");
    expect(formatAmount(999)).toBe("999.00");
    expect(formatAmount("1234567890.12")).toBe("1,234,567,890.12");
  });

  it("groups a negative amount after the sign", () => {
    expect(formatAmount(-12000)).toBe("-12,000.00");
  });

  it("collapses float noise instead of truncating it down", () => {
    expect(formatAmount(0.1 + 0.2)).toBe("0.30");
    expect(formatAmount(3 - 1.0000000000000002)).toBe("2.00");
  });

  it("is empty for nothing usable", () => {
    expect(formatAmount(null)).toBe("");
    expect(formatAmount(undefined)).toBe("");
    expect(formatAmount("")).toBe("");
    expect(formatAmount("abc")).toBe("");
    expect(formatAmount(Number.NaN)).toBe("");
    expect(formatAmount(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("isWithinAmountLimits", () => {
  it("allows exactly eleven integer digits and two decimals", () => {
    expect(isWithinAmountLimits("12345678901.99")).toBe(true);
    expect(isWithinAmountLimits("123,456,789,01.99")).toBe(true);
  });

  it("refuses a twelfth integer digit or a third decimal", () => {
    expect(isWithinAmountLimits("123456789012")).toBe(false);
    expect(isWithinAmountLimits("1.234")).toBe(false);
  });

  it("does not count the minus sign", () => {
    expect(isWithinAmountLimits("-12345678901.99")).toBe(true);
  });
});

describe("formatMoney", () => {
  it("puts the currency label in front", () => {
    expect(formatMoney(12000, "HKD")).toBe("HKD 12,000.00");
    expect(formatMoney("1500.5", "HK$")).toBe("HK$ 1,500.50");
  });

  it("drops the space when there is no label", () => {
    expect(formatMoney(12000, "")).toBe("12,000.00");
    expect(formatMoney(12000, "   ")).toBe("12,000.00");
  });

  it("is empty when the amount is not usable, label or not", () => {
    expect(formatMoney(null, "HKD")).toBe("");
    expect(formatMoney("abc", "HKD")).toBe("");
  });
});

describe("parseAmount", () => {
  it("reads a displayed amount back as a number", () => {
    expect(parseAmount("12,000.00")).toBe(12000);
    expect(parseAmount("0.50")).toBe(0.5);
    expect(parseAmount("-7")).toBe(-7);
  });

  it("is null for nothing usable", () => {
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(".")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("acceptAmountInput", () => {
  it("keeps the value as plain digits while typing", () => {
    expect(acceptAmountInput("12,000")).toBe("12000");
    expect(acceptAmountInput("1500.5")).toBe("1500.5");
    expect(acceptAmountInput("")).toBe("");
  });

  it("rejects the keystroke rather than truncating, so the caret never jumps", () => {
    expect(acceptAmountInput("123456789012")).toBeNull();
    expect(acceptAmountInput("1.234")).toBeNull();
    expect(acceptAmountInput("abc")).toBeNull();
    expect(acceptAmountInput("1.2.3")).toBeNull();
  });

  it("refuses a minus sign - amounts are typed unsigned", () => {
    expect(acceptAmountInput("-5")).toBeNull();
  });

  it("lets a lone decimal point stand so the next digit can be typed", () => {
    expect(acceptAmountInput(".")).toBe(".");
  });
});

describe("toAmountEditString", () => {
  it("strips the grouping so a formatted amount can be edited", () => {
    expect(toAmountEditString("12,000.00")).toBe("12000.00");
  });

  it("is empty for null and undefined", () => {
    expect(toAmountEditString(null)).toBe("");
    expect(toAmountEditString(undefined)).toBe("");
  });

  it("round-trips a formatted amount back through formatAmount", () => {
    expect(formatAmount(toAmountEditString(formatAmount(1234567.891)))).toBe("1,234,567.89");
  });
});
