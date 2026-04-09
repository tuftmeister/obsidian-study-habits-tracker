import { App, Menu, TFile } from "obsidian";
import dayjs from "dayjs";
import { EntryStore } from "../../shared/data/EntryStore";
import { StudyEntry } from "../../shared/data/types";
import { fmtMinutes } from "../../shared/utils/time";

const MAX_ROWS = 20;

export class RecentSessions {
  constructor(
    private container: HTMLElement,
    private store: EntryStore,
    private app: App,
  ) {
    container.addClass("tracker-recent-sessions");
  }

  render(): void {
    this.container.empty();

    const sessions = this.store
      .getStudySessions()
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
      .slice(0, MAX_ROWS);

    if (sessions.length === 0) {
      this.container.createEl("p", {
        cls: "tracker-chart-empty",
        text: "No sessions yet — complete a timer session or add one manually.",
      });
      return;
    }

    const list = this.container.createEl("ul", { cls: "tracker-sessions-list" });

    for (const session of sessions) {
      this.renderRow(list, session);
    }
  }

  private renderRow(list: HTMLElement, session: StudyEntry): void {
    const li = list.createEl("li", { cls: "tracker-session-row" });

    // Date
    li.createSpan({
      cls: "tracker-session-date",
      text: dayjs(session.date).format("MMM D"),
    });

    // Duration
    li.createSpan({
      cls: "tracker-session-duration",
      text: fmtMinutes(session.duration_minutes),
    });

    // Tags
    const tagsEl = li.createSpan({ cls: "tracker-session-tags" });
    for (const tag of session.tags) {
      tagsEl.createSpan({ cls: "tracker-tag-chip", text: `#${tag}` });
    }

    // Note
    if (session.note) {
      li.createSpan({ cls: "tracker-session-note", text: session.note });
    }

    // Click to open source file
    li.style.cursor = "pointer";
    li.addEventListener("click", () => {
      this.openSourceFile(session);
    });

    // Right-click context menu
    li.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      this.showContextMenu(e, session);
    });
  }

  private openSourceFile(session: StudyEntry): void {
    const file = this.app.vault.getAbstractFileByPath(session.source_file);
    if (!(file instanceof TFile)) return;
    this.app.workspace.openLinkText(
      session.source_file,
      "",
      false
    ).then(() => {
      // Scroll to line — requires getting the editor
      const leaf = this.app.workspace.getMostRecentLeaf();
      const view = leaf?.view as any;
      if (view?.editor) {
        view.editor.setCursor({ line: session.source_line - 1, ch: 0 });
        view.editor.scrollIntoView(
          { from: { line: session.source_line - 1, ch: 0 }, to: { line: session.source_line - 1, ch: 0 } },
          true
        );
      }
    });
  }

  private showContextMenu(event: MouseEvent, session: StudyEntry): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle("Open source file")
        .setIcon("file-text")
        .onClick(() => this.openSourceFile(session))
    );

    menu.addItem((item) =>
      item
        .setTitle("Delete session")
        .setIcon("trash")
        .onClick(() => this.deleteSession(session))
    );

    menu.showAtMouseEvent(event);
  }

  private async deleteSession(session: StudyEntry): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(session.source_file);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    // Remove the line (1-indexed → 0-indexed)
    const lineIdx = session.source_line - 1;
    if (lineIdx >= 0 && lineIdx < lines.length) {
      lines.splice(lineIdx, 1);
      await this.app.vault.modify(file, lines.join("\n"));
      // Re-render after deletion
      this.render();
    }
  }
}
