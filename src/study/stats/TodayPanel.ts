import dayjs from "dayjs";
import { EntryStore } from "../../shared/data/EntryStore";
import { calculateStreak, fmtMinutes, mondayOf } from "../../shared/utils/time";
import { StudyEntry } from "../../shared/data/types";

export class TodayPanel {
  constructor(
    private container: HTMLElement,
    private store: EntryStore,
    private gracePeriod = 0,
  ) {
    container.addClass("tracker-today-panel");
  }

  render(): void {
    this.container.empty();

    const today  = dayjs().format("YYYY-MM-DD");
    const monday = mondayOf(today);

    const todayMin = this.store.getTotalMinutes({ date_from: today, date_to: today });
    const weekMin  = this.store.getTotalMinutes({ date_from: monday, date_to: today });
    const allStudy = this.store.getStudySessions() as StudyEntry[];
    const streak   = calculateStreak(allStudy, today, this.gracePeriod);

    // ── Three stat cards ──────────────────────────────────────────────────────
    this.card(this.container, fmtMinutes(todayMin), "Today's total");
    this.card(this.container, streak > 0 ? `🔥 ${streak}` : "—", "Day streak");
    this.card(this.container, fmtMinutes(weekMin), "This week");
  }

  private card(parent: HTMLElement, value: string, label: string): HTMLElement {
    const card = parent.createDiv({ cls: "tracker-stat-card" });
    card.createDiv({ cls: "tracker-stat-value", text: value });
    card.createDiv({ cls: "tracker-stat-label", text: label });
    return card;
  }
}
