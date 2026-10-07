// How a failure becomes something a user can read (lib/api.ts's four error helpers).
//
// The oracle is docs/ERROR_COPY.md, clause by clause: `normalizeApiErrorDetail` flattens what
// the server sent, `readsAsProse` refuses machinery, and whatever is refused falls back to the
// status copy. The two shape-detectors below it match on `detail` - the server's raw words -
// because `message` is now scrubbed of exactly the shapes they look for.

import { describe, expect, it } from "vitest";

import {
  ApiError,
  XERO_RECONNECT_MESSAGE,
  isDuplicateBillReferenceError,
  isRawStatusText,
  isXeroAuthError,
  normalizeApiErrorDetail,
  readsAsProse,
  resolveApiErrorMessage,
} from "@/lib/api";

const HOUSE_FALLBACK = "Something went wrong on my end. Mind trying again?";

describe("ApiError", () => {
  it("keeps the server's words in detail and the readable copy in message", () => {
    const err = new ApiError(422, "That invoice number is taken.", '{"reference":"dup"}');
    expect(err.status).toBe(422);
    expect(err.message).toBe("That invoice number is taken.");
    expect(err.detail).toBe('{"reference":"dup"}');
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("falls back to the message when no detail was given", () => {
    expect(new ApiError(500, "Something went wrong.").detail).toBe("Something went wrong.");
  });
});

describe("normalizeApiErrorDetail", () => {
  it("falls back for nothing at all", () => {
    expect(normalizeApiErrorDetail(null, "fallback")).toBe("fallback");
    expect(normalizeApiErrorDetail(undefined, "fallback")).toBe("fallback");
    expect(normalizeApiErrorDetail("", "fallback")).toBe("fallback");
  });

  it("passes a string through untouched", () => {
    expect(normalizeApiErrorDetail("That invoice number is taken.", "fallback")).toBe(
      "That invoice number is taken.",
    );
  });

  it("reduces django-ninja's schema failure to its msg fields", () => {
    // Stringifying this put {"type":"missing","loc":["body","email"]} in front of payers.
    const detail = [
      { type: "missing", loc: ["body", "email"], msg: "Field required" },
      { type: "value_error", loc: ["body", "amount"], msg: "Amount must be positive" },
    ];
    expect(normalizeApiErrorDetail(detail, "fallback")).toBe("Field required; Amount must be positive");
  });

  it("takes strings straight out of an array", () => {
    expect(normalizeApiErrorDetail(["First thing.", "Second thing."], "fallback")).toBe(
      "First thing.; Second thing.",
    );
  });

  it("drops an array entry that is still object-shaped rather than rendering [object Object]", () => {
    const detail = [{ type: "missing", loc: ["body"] }, { msg: "Field required" }];
    const flattened = normalizeApiErrorDetail(detail, "fallback");
    expect(flattened).toBe("Field required");
    expect(flattened).not.toContain("[object Object]");
  });

  it("falls back when an array has nothing readable in it", () => {
    expect(normalizeApiErrorDetail([{ type: "missing" }], "fallback")).toBe("fallback");
    expect(normalizeApiErrorDetail([], "fallback")).toBe("fallback");
    expect(normalizeApiErrorDetail(["", "   "], "fallback")).toBe("fallback");
  });

  it("keeps a field-error map's sentences and discards the field keys", () => {
    expect(
      normalizeApiErrorDetail({ email: ["This field is required."], amount: ["Must be positive."] }, "fallback"),
    ).toBe("This field is required.; Must be positive.");
  });

  it("takes a field map's plain string values too", () => {
    expect(normalizeApiErrorDetail({ email: "This field is required." }, "fallback")).toBe(
      "This field is required.",
    );
  });

  it("falls back for a map with nothing readable in it", () => {
    expect(normalizeApiErrorDetail({ email: [{ code: "required" }] }, "fallback")).toBe("fallback");
    expect(normalizeApiErrorDetail({}, "fallback")).toBe("fallback");
  });

  it("falls back for a number or a boolean", () => {
    expect(normalizeApiErrorDetail(422, "fallback")).toBe("fallback");
    expect(normalizeApiErrorDetail(true, "fallback")).toBe("fallback");
  });
});

describe("readsAsProse", () => {
  it("accepts a real sentence", () => {
    expect(readsAsProse("That invoice number is taken.")).toBe(true);
    expect(readsAsProse("Files need to be under 10MB.")).toBe(true);
  });

  it.each([
    ["a serialised body", '{"type":"missing"}'],
    ["an array", '["body","email"]'],
    ["markup", "<p>Server Error</p>"],
    ["a stack", "Traceback (most recent call last)"],
    ["the word exception", "An exception was raised while saving"],
    ["a dunder", "__all__ must be a list"],
  ])("refuses %s", (_label, text) => {
    expect(readsAsProse(text)).toBe(false);
  });

  // CHARACTERISATION, and two gaps in the guard worth knowing about before touching it.
  //
  // 1. `lib/api.ts:100` has a literal backspace byte (0x08) in front of `null,` in the regex -
  //    `/traceback|exception|__|<BS>null,/i`. It is in the committed file, not introduced here,
  //    and it is the only control byte in this repo's own source. The alternative therefore
  //    matches a backspace followed by "null,", which no server sends, so the `null,` guard
  //    never fires and a body carrying it reads as prose.
  // 2. Only the literal word "exception" is matched, so a Python exception CLASS name
  //    (ValueError, KeyError, TypeError) is not machinery as far as this guard is concerned.
  //
  // Both let text through that the guard exists to stop. Pinned, not fixed: fixing either
  // changes what users see, which is a separate decision from adding tests.
  it("lets a body with 'null,' in it through, because that guard's regex holds a backspace byte", () => {
    expect(readsAsProse("detail: null, status: 500")).toBe(true);
  });

  it("lets a Python exception class name through - only the word 'exception' is matched", () => {
    expect(readsAsProse("ValueError: bad input")).toBe(true);
    expect(readsAsProse("KeyError: entity_id")).toBe(true);
  });

  it("refuses a bare machine code, which is not a sentence however short", () => {
    expect(readsAsProse("invalid_state")).toBe(false);
    expect(readsAsProse("bill.not_found")).toBe(false);
    expect(readsAsProse("ERR-1234")).toBe(false);
  });

  it("refuses anything with no whitespace at all", () => {
    expect(readsAsProse("Unauthorized")).toBe(false);
  });

  it("refuses text longer than 300 characters", () => {
    expect(readsAsProse(`${"word ".repeat(59)}end`)).toBe(true);
    expect(readsAsProse("word ".repeat(70))).toBe(false);
  });

  it("refuses an empty or blank string", () => {
    expect(readsAsProse("")).toBe(false);
    expect(readsAsProse("   ")).toBe(false);
  });
});

describe("isRawStatusText", () => {
  it("spots the reason phrase having fallen through as the message", () => {
    expect(isRawStatusText("Bad Gateway", "Bad Gateway")).toBe(true);
    expect(isRawStatusText("", "Bad Gateway")).toBe(true);
  });

  it("leaves real copy alone", () => {
    expect(isRawStatusText("I couldn't reach the server just now.", "Bad Gateway")).toBe(false);
  });
});

describe("resolveApiErrorMessage", () => {
  it.each([
    [403, "You don't have access to that."],
    [404, "I couldn't find that."],
    [408, "That took too long to come back. Mind trying again?"],
    [409, "Someone else changed that first. Refresh and try again."],
    [429, "That's a lot of requests at once. Give it a moment and try again."],
    [500, "Something went wrong on my end. Mind trying again?"],
    [502, "I couldn't reach the server just now. Mind trying again?"],
    [503, "The server is busy right now. Mind trying again in a moment?"],
    [504, "The server took too long to answer. Mind trying again?"],
  ])("stands in friendly copy for a bare reason phrase on %i", (status, copy) => {
    expect(resolveApiErrorMessage(status, "Internal Server Error", "Internal Server Error")).toBe(copy);
    expect(resolveApiErrorMessage(status, null, "")).toBe(copy);
  });

  it("falls back to the house line for a status it has no copy for", () => {
    expect(resolveApiErrorMessage(418, null, "I'm a teapot")).toBe(HOUSE_FALLBACK);
    expect(resolveApiErrorMessage(451, '{"detail":"x"}', "")).toBe(HOUSE_FALLBACK);
  });

  it("shows the server's own sentence when it is one", () => {
    expect(resolveApiErrorMessage(409, "Someone paid this bill a moment ago.", "Conflict")).toBe(
      "Someone paid this bill a moment ago.",
    );
  });

  it("never lets a reason phrase reach the user", () => {
    for (const phrase of ["Bad Gateway", "Internal Server Error", "Not Found", "Forbidden"]) {
      expect(resolveApiErrorMessage(502, phrase, phrase)).not.toBe(phrase);
    }
  });

  it("lets a real 422 sentence through untouched - its body carries the field detail", () => {
    expect(
      resolveApiErrorMessage(422, "That invoice number already exists in this company.", "Unprocessable Entity"),
    ).toBe("That invoice number already exists in this company.");
  });

  // 422 is deliberately absent from the fallback table, so a MACHINE-shaped 422 has nothing to
  // fall back to but the house line. The docstring's "must pass through untouched" is only true
  // of prose, and this is the case that says so.
  it("falls back to the house line for a 422 whose detail is machinery", () => {
    expect(resolveApiErrorMessage(422, "invalid_state", "Unprocessable Entity")).toBe(HOUSE_FALLBACK);
    expect(resolveApiErrorMessage(422, [{ type: "missing", loc: ["body"] }], "Unprocessable Entity")).toBe(
      HOUSE_FALLBACK,
    );
  });

  it("shows a flattened schema failure, because its msg fields read as prose", () => {
    expect(
      resolveApiErrorMessage(422, [{ type: "missing", loc: ["body", "email"], msg: "Field required" }], "x"),
    ).toBe("Field required");
  });
});

describe("isDuplicateBillReferenceError", () => {
  it("matches a 422 whose detail says the invoice number already exists", () => {
    const err = new ApiError(422, HOUSE_FALLBACK, "Invoice number already exists for this entity");
    expect(isDuplicateBillReferenceError(err)).toBe(true);
  });

  it("matches on detail, not on message - message is scrubbed of exactly that shape", () => {
    const scrubbed = new ApiError(422, "Invoice number already exists", "invalid_state");
    expect(isDuplicateBillReferenceError(scrubbed)).toBe(false);
  });

  it("wants the status to be 422", () => {
    expect(isDuplicateBillReferenceError(new ApiError(409, "x", "Invoice number already exists"))).toBe(false);
  });

  it("is false for anything that is not an ApiError", () => {
    expect(isDuplicateBillReferenceError(new Error("Invoice number already exists"))).toBe(false);
    expect(isDuplicateBillReferenceError(null)).toBe(false);
    expect(isDuplicateBillReferenceError("Invoice number already exists")).toBe(false);
  });
});

describe("isXeroAuthError", () => {
  it.each([
    ["Xero's own phrase", "AuthenticationUnsuccessful"],
    ["a serialised 403", '{"status": 403, "title": "Forbidden"}'],
    ["a bare forbidden", "The request was forbidden by Xero"],
    ["an expired token", "The access token has expired"],
    ["a short expired token", "token expired"],
    ["unauthorized, either spelling", "unauthorized"],
    ["unauthorised, either spelling", "unauthorised"],
  ])("matches %s in the detail", (_label, detail) => {
    expect(isXeroAuthError(new ApiError(400, HOUSE_FALLBACK, detail))).toBe(true);
  });

  it("is false when Xero refused the bill's contents rather than the connection", () => {
    expect(
      isXeroAuthError(new ApiError(400, HOUSE_FALLBACK, "Account code 999 is not a valid code")),
    ).toBe(false);
  });

  it("is false for anything that is not an ApiError", () => {
    expect(isXeroAuthError(new Error("unauthorized"))).toBe(false);
    expect(isXeroAuthError(undefined)).toBe(false);
  });
});

describe("XERO_RECONNECT_MESSAGE", () => {
  it("says what happened and who can fix it, in the app's voice", () => {
    expect(XERO_RECONNECT_MESSAGE).toBe(
      "The Xero connection needs reconnecting. An admin can do that in Settings, then I'll publish this.",
    );
  });
});
