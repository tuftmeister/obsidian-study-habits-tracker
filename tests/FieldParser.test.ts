import { describe, it, expect } from "vitest";
import { parseDuration } from "../src/shared/data/FieldParser";

describe("parseDuration", () => {
  // ── minutes ───────────────────────────────────────────────────────────────
  describe("minutes", () => {
    it("parses 25m", () => expect(parseDuration("25m")).toBe(25));
    it("parses 25 min", () => expect(parseDuration("25 min")).toBe(25));
    it("parses 25 mins", () => expect(parseDuration("25 mins")).toBe(25));
    it("parses 25 minute", () => expect(parseDuration("25 minute")).toBe(25));
    it("parses 25 minutes", () => expect(parseDuration("25 minutes")).toBe(25));
    it("parses 25M (case-insensitive)", () => expect(parseDuration("25M")).toBe(25));
    it("parses decimal minutes: 1.5m", () => expect(parseDuration("1.5m")).toBe(1.5));
  });

  // ── hours ─────────────────────────────────────────────────────────────────
  describe("hours", () => {
    it("parses 1h", () => expect(parseDuration("1h")).toBe(60));
    it("parses 1 hr", () => expect(parseDuration("1 hr")).toBe(60));
    it("parses 1 hrs", () => expect(parseDuration("1 hrs")).toBe(60));
    it("parses 1 hour", () => expect(parseDuration("1 hour")).toBe(60));
    it("parses 1 hours", () => expect(parseDuration("1 hours")).toBe(60));
    it("parses 2H (case-insensitive)", () => expect(parseDuration("2H")).toBe(120));
    it("parses decimal hours: 1.5h", () => expect(parseDuration("1.5h")).toBe(90));
    it("parses decimal hours: 0.5h", () => expect(parseDuration("0.5h")).toBe(30));
    it("parses 2.5h → 150", () => expect(parseDuration("2.5h")).toBe(150));
  });

  // ── combined hours + minutes ───────────────────────────────────────────────
  describe("hours + minutes", () => {
    it("parses 1h30m", () => expect(parseDuration("1h30m")).toBe(90));
    it("parses 1h 30m (with space)", () => expect(parseDuration("1h 30m")).toBe(90));
    it("parses 1:30", () => expect(parseDuration("1:30")).toBe(90));
    it("parses 2:00", () => expect(parseDuration("2:00")).toBe(120));
    it("parses 0:45", () => expect(parseDuration("0:45")).toBe(45));
    it("parses 1h30min", () => expect(parseDuration("1h30min")).toBe(90));
    it("parses 1hour30minutes", () => expect(parseDuration("1hour30minutes")).toBe(90));
  });

  // ── seconds ───────────────────────────────────────────────────────────────
  describe("seconds", () => {
    it("parses 90s → 1.5", () => expect(parseDuration("90s")).toBe(1.5));
    it("parses 90 sec", () => expect(parseDuration("90 sec")).toBe(1.5));
    it("parses 90 secs", () => expect(parseDuration("90 secs")).toBe(1.5));
    it("parses 90 second", () => expect(parseDuration("90 second")).toBe(1.5));
    it("parses 90 seconds", () => expect(parseDuration("90 seconds")).toBe(1.5));
    it("parses 60s → 1", () => expect(parseDuration("60s")).toBe(1));
    it("rounds seconds to 2 decimals: 100s → 1.67", () =>
      expect(parseDuration("100s")).toBe(1.67));
  });

  // ── bare numbers ─────────────────────────────────────────────────────────
  describe("bare numbers", () => {
    it("bare number defaults to minutes", () =>
      expect(parseDuration("90")).toBe(90));
    it("bare number with defaultUnit=minutes", () =>
      expect(parseDuration("90", "minutes")).toBe(90));
    it("bare number with defaultUnit=hours → converts to minutes", () =>
      expect(parseDuration("2", "hours")).toBe(120));
    it("bare decimal with defaultUnit=hours: 1.5 → 90", () =>
      expect(parseDuration("1.5", "hours")).toBe(90));
  });

  // ── whitespace handling ───────────────────────────────────────────────────
  describe("whitespace", () => {
    it("trims leading/trailing whitespace", () =>
      expect(parseDuration("  25m  ")).toBe(25));
  });

  // ── invalid inputs ────────────────────────────────────────────────────────
  describe("invalid inputs", () => {
    it("returns null for empty string", () =>
      expect(parseDuration("")).toBeNull());
    it("returns null for letters only", () =>
      expect(parseDuration("abc")).toBeNull());
    it("returns null for nonsense", () =>
      expect(parseDuration("xyz123")).toBeNull());
    it("returns null for just whitespace", () =>
      expect(parseDuration("   ")).toBeNull());
    it("returns null for malformed colon time: 1:3 (not 2-digit minutes)", () =>
      expect(parseDuration("1:3")).toBeNull());
  });
});
