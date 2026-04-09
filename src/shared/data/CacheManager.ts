import { App } from "obsidian";
import { Entry } from "./types";

// ── Schema ────────────────────────────────────────────────────────────────────

export const CACHE_VERSION = 1;

export interface CacheData {
  version: number;
  last_full_scan: string;        // ISO 8601 datetime string
  entries: Entry[];
  file_hashes: Record<string, string>; // path → md5-ish hash (reserved for future use)
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class CacheManager {
  private cachePath: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 5000;

  constructor(private app: App, pluginId: string) {
    this.cachePath = `.obsidian/plugins/${pluginId}/cache.json`;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async load(): Promise<CacheData | null> {
    try {
      const raw = await this.app.vault.adapter.read(this.cachePath);
      const data = JSON.parse(raw) as CacheData;
      if (data.version !== CACHE_VERSION) {
        console.log("Tracker: cache version mismatch, will rescan");
        return null;
      }
      return data;
    } catch {
      // File doesn't exist yet or is corrupt — that's fine, we'll build it
      return null;
    }
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  async save(data: CacheData): Promise<void> {
    try {
      await this.app.vault.adapter.write(
        this.cachePath,
        JSON.stringify(data, null, 2)
      );
    } catch (e) {
      console.error("Tracker: failed to write cache", e);
    }
  }

  /**
   * Schedule a cache write, debounced by 5 seconds.
   * Multiple calls within the window collapse into one write.
   */
  scheduleSave(data: CacheData): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.save(data);
    }, this.DEBOUNCE_MS);
  }

  /** Flush any pending debounced write immediately (call on plugin unload). */
  async flushPending(data: CacheData): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      await this.save(data);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  static empty(): CacheData {
    return {
      version: CACHE_VERSION,
      last_full_scan: new Date(0).toISOString(), // epoch → forces full scan on first load
      entries: [],
      file_hashes: {},
    };
  }
}
