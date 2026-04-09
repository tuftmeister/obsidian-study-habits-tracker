// Minimal stubs so that Obsidian-importing modules can be loaded in Vitest.
// Only runtime values (functions, classes used with `new` or `instanceof`)
// need stubs here — type-only imports are erased by TypeScript.

export class Plugin {}
export class ItemView {}
export class WorkspaceLeaf {}
export class TFile { path = ""; basename = ""; stat = { mtime: 0, ctime: 0, size: 0 }; }
export class TFolder { path = ""; }
export class App {}
export class Notice { constructor(_msg: string) {} }
export class Modal { titleEl = { setText: () => {} }; contentEl = document.createElement("div"); open() {} close() {} }
export class PluginSettingTab {}
export class Setting { constructor(_: unknown) {} setName() { return this; } setDesc() { return this; } addText() { return this; } addToggle() { return this; } addDropdown() { return this; } addButton() { return this; } }

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
