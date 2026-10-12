/* Dashboard metrics and charts use the same localStorage data as Tasks and Habits. */
const readStore = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const $ = (id) => document.getElementById(id);
const dayKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function renderStatusChart(tasks) {
  const statuses = [
    {
      key: "todo",
      label: "Todo",
      color: "#b5b5b5",
      aliases: ["todo", "to-do", "active"],
    },
    {
      key: "on-hold",
      label: "On hold",
      color: "#f9a008",
      aliases: ["on hold", "on-hold", "stalled"],
    },
    {
      key: "in-progress",
      label: "In progress",
      color: "#3d82ff",
      aliases: ["in progress", "in-progress"],
    },
    {
      key: "completed",
      label: "Completed",
      color: "#10b981",
      aliases: ["completed", "complete", "done"],
    },
  ];
  const counts = statuses.map((status) => ({
    ...status,
    count: tasks.filter((task) =>
      status.aliases.includes(String(task.status || "").toLowerCase()),
    ).length,
  }));
  const total = tasks.length;
  $("total-tasks").textContent = total;

  let cursor = 0;
  const segments = counts.map((status) => {
    const start = total ? (cursor / total) * 100 : 0;
    cursor += status.count;
    return `${status.color} ${start}% ${total ? (cursor / total) * 100 : 100}%`;
  });
  $("status-donut").style.background = total
    ? `conic-gradient(${segments.join(",")})`
    : "var(--soft)";
  $("status-legend").innerHTML = counts
    .map(
      (status) =>
        `<div class="legend-item"><span class="legend-dot" style="background:${status.color}"></span><span>${status.label} - ${status.count}</span></div>`,
    )
    .join("");
}

function renderTrendChart(days, values) {
  const width = 560;
  const height = 300;
  const left = 48;
  const right = 16;
  const top = 18;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(4, ...values, 1);
  const yMax = Math.max(4, Math.ceil(maxValue));
  const x = (index) => left + (index * plotWidth) / 6;
  const y = (value) => top + plotHeight - (value / yMax) * plotHeight;
  const grid = Array.from({ length: yMax + 1 }, (_, index) => {
    const yy = y(index);
    return `<line class="chart-gridline" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/><text class="chart-label" text-anchor="end" x="${left - 9}" y="${yy + 4}">${index}</text>`;
  }).join("");
  const xLabels = days
    .map(
      (date, index) =>
        `<text class="chart-label" text-anchor="middle" x="${x(index)}" y="${height - 20}">${date.toLocaleDateString(undefined, { weekday: "short" })}</text>`,
    )
    .join("");
  const points = values
    .map((value, index) => `${x(index)},${y(value)}`)
    .join(" ");
  const circles = values
    .map(
      (value, index) =>
        `<circle class="chart-point" cx="${x(index)}" cy="${y(value)}" r="4.2"/>`,
    )
    .join("");
  $("trend-chart").innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Habit completions over the past seven days"><g>${grid}</g><line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="chart-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/><polyline class="chart-line" points="${points}"/>${circles}${xLabels}<text class="chart-y-label" text-anchor="middle" transform="translate(13 ${top + plotHeight / 2}) rotate(-90)">Total habits</text></svg>`;
}

function renderDashboard() {
  const tasks = readStore("tasks");
  const habits = readStore("habits");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const since = new Date(today);
  since.setDate(since.getDate() - 6);

  const completed = tasks.filter((task) => {
    if (String(task.status || "").toLowerCase() !== "completed") return false;
    const date = task.completedAt || task.completedOn || task.updatedAt;
    return date ? new Date(date) >= since : false;
  });
  const overdue = tasks.filter((task) => {
    const dueDate = task.dueDate || task.due_date;
    return (
      String(task.status || "").toLowerCase() !== "completed" &&
      dueDate &&
      new Date(`${dueDate}T23:59:59`) < new Date()
    );
  });

  $("completed-count").textContent = completed.length;
  $("overdue-count").textContent = overdue.length;
  $("active-habits-count").textContent = habits.filter(
    (habit) => habit.active !== false,
  ).length;

  /* Find the highest streak value among all habits. */
  const streaks = readStore("habitStreaks");

  const longestHabit = streaks.reduce(
    (best, habit) => (habit.streak > best.streak ? habit : best),
    { name: "", streak: 0 },
  );

  $("longest-streak").textContent =
    `${longestHabit.streak} ${longestHabit.streak === 1 ? "day" : "days"}`;

  $("longest-streak-name").textContent =
    longestHabit.name || "Across all habits";

  renderStatusChart(tasks);

  const days = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    days.push(date);
  }
  const values = days.map((date) => {
    const key = dayKey(date);
    return habits.reduce((sum, habit) => {
      const completions = Array.isArray(habit.completions)
        ? habit.completions.filter(
            (entry) => dayKey(entry.date || entry) === key,
          ).length
        : 0;
      const completedDates = Array.isArray(habit.completedDates)
        ? habit.completedDates.filter((entry) => dayKey(entry) === key).length
        : 0;
      return sum + completions + completedDates;
    }, 0);
  });
  renderTrendChart(days, values);
}

function setDashboardTheme() {
  const theme =
    localStorage.getItem("theme") ||
    localStorage.getItem("app_theme") ||
    "light";
  document.body.dataset.theme = theme;
  const icon = $("theme-image");
  if (icon) {
    icon.src =
      theme === "dark"
        ? "../assets/light_theme_icon.svg"
        : "../assets/dark_theme_icon.svg";
  }
}

$("theme-button").addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", nextTheme);
  localStorage.setItem("app_theme", nextTheme);
  setDashboardTheme();
});
window.addEventListener("storage", renderDashboard);
window.addEventListener("app-data-changed", renderDashboard);
window.addEventListener("app-rules-changed", renderDashboard);
setDashboardTheme();
renderDashboard();
