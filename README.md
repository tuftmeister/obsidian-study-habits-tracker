# Study & Habits Tracker

Track study sessions, habits, and mood directly in your Obsidian vault. All data lives in plain Markdown inside your daily notes — no external database, fully portable.

---

## Installation (BRAT)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. In BRAT settings, add this repo: `tuftmeister/obsidian-study-habits-tracker`
3. BRAT will install the plugin and keep it updated automatically

---

## How data is stored

Every entry is written as an inline field in your daily note:

```
(fieldname:: value)
```

The plugin reads these fields on startup and whenever a file changes, so your data is always in sync. You can write entries by hand or use the interactive widgets below.

---

## Study Tracking

### Logging a session manually

Add a line like this anywhere in a daily note:

```
- (study:: 1h30m) #math #calculus "reviewed derivatives"
```

- **Duration formats:** `25m`, `1h30m`, `1:30`, `1.5h`, or a bare number (uses your configured default unit)
- **Tags:** any `#hashtag` on the line is captured as a tag
- **Note:** optional quoted text at the end

### Timer widget

Embed an interactive timer in any note:

````
```study-timer
```
````

The timer supports three modes:

| Mode | Description |
|---|---|
| **Pomodoro** | Work → short break → work → ... → long break. Configurable phase lengths. |
| **Stopwatch** | Counts up from zero. |
| **Custom** | Set a target duration and count down. |

When a session ends, the plugin automatically writes the entry to today's daily note. The timer state persists across Obsidian restarts — if you close the app mid-session, time is recovered when you reopen.

---

## Habits

### Defining habits

Go to **Settings → Habits** to create habits. Each habit has:

- **Name** — used to identify it in your notes
- **Type** — `binary` (done/not done) or `quantity` (a number with an optional unit and daily target)
- **Color & emoji** — for visual display

### Logging habits manually

```
- (habit:: Exercise) true
- (habit:: Water) 6
```

For binary habits any truthy value counts. For quantity habits the number after the field is the logged value.

### Habit widget

Embed a checklist of all your habits in a note:

````
```habit
```
````

Or show only specific habits by listing their names:

````
```habit
Exercise
Water
Reading
```
````

Each row shows the habit name, its emoji/color dot, and for quantity habits a progress bar toward the daily target. Tap a habit to log it.

---

## Mood Tracking

### Logging mood manually

```
(mood:: 🙂)
```

or numerically:

```
(mood:: 4)
```

### Mood widget

Embed an interactive mood picker in a note:

````
```mood
```
````

Tap an emoji or number to log your mood for the day. The entry is stored inside the code block so nothing extra renders in your note. Tap **Change** to update it.

Scale types (configurable in Settings):

| Type | Options |
|---|---|
| `emoji` | Customizable emoji list (default: 😢 😕 😐 🙂 😊) |
| `1-5` | Numeric buttons 1–5 |
| `1-10` | Numeric buttons 1–10 |

---

## Charts & Visualizations

All charts are embedded as code blocks and update automatically as you log data.

### Study heatmap

A GitHub-style 52-week activity grid. Color intensity = minutes studied.

````
```study-heatmap
```
````

Click any cell to open that day's note. Use the dropdowns to filter by tag or switch between views (all time, by tag, etc.).

### Study bar chart

Recent activity as a bar chart, broken down by tag.

````
```study-bars
```
````

Use the view selector to switch between daily, weekly, and monthly groupings (last 7d / 30d / 12 weeks / 12 months).

### Mood chart

A line chart of your mood over time.

````
```mood-chart
```
````

---

## Sidebar Views

The plugin adds two sidebar panels (accessible from the ribbon):

- **Study view** — timer controls, today's sessions, total time, recent stats
- **Habits view** — today's habit checklist with streaks and progress

---

## Settings Reference

| Setting | Description |
|---|---|
| `daily_note_folder` | Where your daily notes live (leave blank for vault root) |
| `date_format` | Format used to parse daily note filenames (default: `YYYY-MM-DD`) |
| `ignored_folders` | Folders to skip when scanning |
| `study_field_name` | Field name for study entries (default: `study`) |
| `study_field_aliases` | Additional field names that count as study entries |
| `study_default_unit` | Unit for bare numbers — `minutes` or `hours` |
| `pomodoro.*` | Work, short break, and long break durations; cycles before long break |
| `sound_on_phase_end` | Play a sound when a timer phase ends |
| `confetti_on_complete` | Confetti animation when a full Pomodoro set completes |
| `habit_field_name` | Field name for habit entries (default: `habit`) |
| `mood_field_name` | Field name for mood entries (default: `mood`) |
| `mood_scale_type` | `emoji`, `1-5`, or `1-10` |
| `mood_emojis` | Emoji options when scale type is `emoji` |
| `streak_grace_period` | Days you can miss without breaking a streak |
