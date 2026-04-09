import { PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  // General
  study_module_enabled: true,
  habits_module_enabled: true,
  daily_note_folder: "",
  date_format: "YYYY-MM-DD",
  ignored_folders: [],
  theme: "auto",

  // Study
  study_field_name: "study",
  study_field_aliases: [],
  study_default_unit: "minutes",
  study_tags: [
    { name: "general", color: "#7c6af7" },
  ],
  pomodoro: {
    work_minutes: 25,
    short_break_minutes: 5,
    long_break_minutes: 15,
    cycles_before_long: 4,
  },
  sound_on_phase_end: true,
  confetti_on_complete: true,
  streak_grace_period: 0,

  // Habits
  habit_field_name: "habit",
  habit_field_aliases: [],
  habit_definitions: [],
  mood_field_name: "mood",
  mood_field_aliases: [],
  mood_scale_type: "emoji",
  mood_emojis: ["😢", "😕", "😐", "🙂", "😊"],

  // Data
  scan_errors: [],
};
