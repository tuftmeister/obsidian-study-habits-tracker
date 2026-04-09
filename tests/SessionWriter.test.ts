import { describe, it, expect } from "vitest";
import { formatSessionDuration } from "../src/study/SessionWriter";

// ── formatSessionDuration ─────────────────────────────────────────────────────

describe("formatSessionDuration", () => {
  it("formats whole minutes", () => expect(formatSessionDuration(25)).toBe("25m"));
  it("formats whole hours", () => expect(formatSessionDuration(60)).toBe("1h"));
  it("formats hours + minutes", () => expect(formatSessionDuration(90)).toBe("1h30m"));
  it("formats 2h", () => expect(formatSessionDuration(120)).toBe("2h"));
  it("rounds fractional minutes", () => expect(formatSessionDuration(25.4)).toBe("25m"));
  it("rounds up fractional minutes", () => expect(formatSessionDuration(25.6)).toBe("26m"));
  it("clamps to minimum 1m", () => expect(formatSessionDuration(0)).toBe("1m"));
  it("handles large values: 150m → 2h30m", () => expect(formatSessionDuration(150)).toBe("2h30m"));
});

// ── injectEntry (tested via buildEntryLine behaviour) ─────────────────────────
// The file I/O parts of SessionWriter require the Obsidian vault API and are
// verified manually in the test vault.  The pure formatting helpers are tested
// here; injection logic is covered indirectly through the vault verification.
