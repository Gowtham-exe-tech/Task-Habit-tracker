/* Dashboard values are calculated from the same localStorage data as Tasks and Habits. */
const readStore = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
};
const dayKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function renderDashboard() {
  const tasks = readStore("tasks"),
    habits = readStore("habits"),
    today = new Date();
  today.setHours(0, 0, 0, 0);
  const since = new Date(today);
  since.setDate(since.getDate() - 6);
  const completed = tasks.filter(
    (t) =>
      t.status === "completed" &&
      (() => {
        const d = t.completedAt || t.completedOn || t.updatedAt;
        return d ? new Date(d) >= since : false;
      })(),
  );
  const overdue = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      (t.dueDate || t.due_date) &&
      new Date((t.dueDate || t.due_date) + "T23:59:59") < new Date(),
  );
  $("completed-count").textContent = completed.length;
  $("overdue-count").textContent = overdue.length;
  $("active-habits-count").textContent = habits.length;
  const streaks = habits
    .map((h) => ({
      name: h.name || h.title || "Habit",
      streak: Number(h.streak || h.currentStreak || h.longestStreak || 0),
    }))
    .sort((a, b) => b.streak - a.streak);
  $("longest-streak").textContent = `${streaks[0]?.streak || 0} days`;
  $("longest-streak-name").textContent =
    streaks[0]?.name || "Across all habits";
  const statuses = [
    { key: "active", label: "Active", color: "#27b77b" },
    { key: "in-progress", label: "In progress", color: "#e5a23b" },
    { key: "stalled", label: "Stalled", color: "#ed6868" },
    { key: "completed", label: "Completed", color: "#7b8ba6" },
  ];
  const counts = statuses.map((s) => ({
      ...s,
      count: tasks.filter((t) => t.status === s.key).length,
    })),
    total = tasks.length;
  $("total-tasks").textContent = total;
  let cursor = 0;
  const segments = counts.map((s) => {
    const start = total ? (cursor / total) * 100 : 0;
    cursor += s.count;
    return `${s.color} ${start}% ${total ? (cursor / total) * 100 : 100}%`;
  });
  $("status-donut").style.background = total
    ? `conic-gradient(${segments.join(",")})`
    : "var(--soft)";
  $("status-legend").innerHTML = counts
    .map(
      (s) =>
        `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.label}<strong>${s.count}</strong></div>`,
    )
    .join("");
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  const values = days.map((d) => {
    const key = dayKey(d);
    return habits.reduce(
      (sum, h) =>
        sum +
        (Array.isArray(h.completions)
          ? h.completions.filter((x) => dayKey(x.date || x) === key).length
          : 0),
      0,
    );
  });
  // Also accept a simple completedDates array on each habit record.
  days.forEach((d, i) => {
    const key = dayKey(d);
    values[i] += habits.reduce(
      (sum, h) =>
        sum +
        (Array.isArray(h.completedDates)
          ? h.completedDates.filter((x) => dayKey(x) === key).length
          : 0),
      0,
    );
  });
  const chartWidth = 700,
    chartHeight = 190,
    padX = 34,
    padY = 24;
  const max = Math.max(1, ...values),
    step = (chartWidth - padX * 2) / 6;
  const points = values.map((value, index) => ({
    x: padX + index * step,
    y: chartHeight - padY - (value / max) * (chartHeight - padY * 2),
  }));
  const grid = [0, 1, 2, 3]
    .map((index) => {
      const y = padY + (index * (chartHeight - padY * 2)) / 3;
      return `<line x1="${padX}" y1="${y}" x2="${chartWidth - padX}" y2="${y}" class="chart-grid-line" />`;
    })
    .join("");
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const dots = points
    .map(
      (point, index) =>
        `<circle cx="${point.x}" cy="${point.y}" r="4" class="chart-point"><title>${days[index].toLocaleDateString()} : ${values[index]} completions</title></circle>`,
    )
    .join("");
  const labels = days
    .map(
      (day, index) =>
        `<text x="${points[index].x}" y="${chartHeight - 3}" class="chart-day-label">${day.toLocaleDateString(undefined, { weekday: "short" })}</text>`,
    )
    .join("");
  const valueLabels = points
    .map(
      (point, index) =>
        `<text x="${point.x}" y="${Math.max(13, point.y - 10)}" class="chart-value-label">${values[index]}</text>`,
    )
    .join("");
  $("trend-chart").innerHTML =
    `<svg class="trend-line-svg" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Line chart of habit completions over the last seven days">${grid}<polyline points="${line}" class="trend-line" />${dots}${valueLabels}${labels}</svg>`;
  const recent = [
    ...tasks.map((t) => ({
      name: t.title || t.name || "Untitled task",
      type: "Task",
      date: t.updatedAt || t.completedAt || t.dueDate || "",
    })),
    ...habits.map((h) => ({
      name: h.name || h.title || "Untitled habit",
      type: "Habit",
      date: h.updatedAt || "",
    })),
  ]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 5);
  $("recent-activity").innerHTML = recent.length
    ? recent
        .map(
          (x) =>
            `<div class="recent-item"><span>${safe(x.name)} <small>· ${x.type}</small></span><small>${x.date ? safe(String(x.date).slice(0, 10)) : "Tracked"}</small></div>`,
        )
        .join("")
    : '<div class="recent-empty">No activity yet. Add a task or habit to get started.</div>';
}
function safe(v) {
  return String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const $ = (id) => document.getElementById(id);
function setDashboardTheme() {
  const theme =
    localStorage.getItem("app_theme") ||
    localStorage.getItem("theme") ||
    "light";
  document.body.dataset.theme = theme;
  document.body.classList.toggle("dark", theme === "dark");
  $("theme-image").src =
    `../assets/${theme === "dark" ? "light_theme_icon.svg" : "dark_theme_icon.svg"}`;
}
$("theme-button").addEventListener("click", () => {
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("app_theme", next);
  localStorage.setItem("theme", next);
  setDashboardTheme();
});
window.addEventListener("storage", renderDashboard);
window.addEventListener("app-data-changed", renderDashboard);
setDashboardTheme();
renderDashboard();
