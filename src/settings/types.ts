export interface HabitDefinition {
  id: string;
  name: string;
  type: "binary" | "quantity";
  unit?: string;
  target_per_day?: number;
  color: string;
  emoji?: string;
}

export interface StudyTag {
  name: string;
  color: string;
}

export interface PomodoroSettings {
  work_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  cycles_before_long: number;
}

export interface PluginSettings {
  // General
  study_module_enabled: boolean;
  habits_module_enabled: boolean;
  show_timer_in_study_view: boolean;
  daily_note_folder: string;
  date_format: string;
  ignored_folders: string[];
  theme: "auto" | "light" | "dark";

  // Study
  study_field_name: string;
  study_field_aliases: string[];
  study_default_unit: "minutes" | "hours";
  study_tags: StudyTag[];
  pomodoro: PomodoroSettings;
  sound_on_phase_end: boolean;
  confetti_on_complete: boolean;
  streak_grace_period: number;

  // Habits
  habit_field_name: string;
  habit_field_aliases: string[];
  habit_definitions: HabitDefinition[];
  mood_field_name: string;
  mood_field_aliases: string[];
  mood_scale_type: "emoji" | "1-5" | "1-10" | "custom";
  mood_emojis: string[];

  // Data
  scan_errors: Array<{ file: string; line: number; message: string }>;
}
