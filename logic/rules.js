// Grab whatever rules we previously saved in the browser, or default to an empty list
let appRules = JSON.parse(localStorage.getItem("app_rules") || "[]");
let editingRuleId = null;
let toastTimer = null;

// Just a quick helper function to save us from writing document.getElementById everywhere
const $ = (id) => document.getElementById(id);

// Snagging all our important DOM elements upfront so they're easy to use later
const rulesList = $("rules-list"),
  rulesEmpty = $("rules-empty"),
  modal = $("rule-modal"),
  form = $("rule-form");

// Creates a unique timestamped ID string so rules don't accidentally overwrite each other
function ruleId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Syncs our local array to localStorage and screams it out to the window so other pages can listen
function saveRules() {
  localStorage.setItem("app_rules", JSON.stringify(appRules));
  window.dispatchEvent(
    new CustomEvent("app-rules-changed", { detail: appRules })
  );
}

// Shows a quick notification alert on the bottom right and handles clearing old timers automatically
function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// Super simple safety check to replace raw code characters with HTML entities to stop XSS attacks
function escapeText(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// Safe wrapper to pull other store keys (like tasks or habits) without crashing if the data is broken
function readItems(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return []; // fallback to a safe empty array
  }
}

// This is the core engine that checks if a single task or habit triggers our rule criteria
function matchesRule(rule, item, type) {
  // If the rule targets only Tasks and this is a Habit (or vice-versa), skip it immediately
  if (rule.entity !== "both" && rule.entity !== type) return false;
  
  let actual;
  // Map out our user criteria targets to the actual object keys on tasks/habits
  if (rule.field === "priority") actual = item.priority;
  else if (rule.field === "status") actual = item.status;
  else if (rule.field === "dueDate") actual = item.dueDate || item.due_date || "";
  else if (rule.field === "streak") actual = Number(item.streak || item.currentStreak || item.longestStreak || 0);
  else if (rule.field === "frequency") actual = item.frequency;
  
  const expected = rule.value;

  // Special date calculation wrapper to spot overdue items compared against today
  if (rule.field === "dueDate" && rule.operator === "isOverdue") {
    return (
      !!actual &&
      actual < new Date().toISOString().slice(0, 10) &&
      item.status !== "completed"
    );
  }

  // Handle standard mathematical numeric thresholds (like habit streaks)
  if (["greaterThan", "lessThanOrEqual"].includes(rule.operator)) {
    const a = Number(actual),
      b = Number(expected);
    return (
      actual !== undefined &&
      !Number.isNaN(a) &&
      !Number.isNaN(b) &&
      (rule.operator === "greaterThan" ? a > b : a <= b)
    );
  }

  // String inspection options for custom status labels or text parsing
  if (rule.operator === "contains") {
    return String(actual ?? "").toLowerCase().includes(expected.toLowerCase());
  }
  if (rule.operator === "notEquals") {
    return String(actual ?? "").toLowerCase() !== expected.toLowerCase();
  }
  
  // Default fallback is a strict string equality match
  return String(actual ?? "").toLowerCase() === expected.toLowerCase();
}

// Combines tasks and habits into one unified pool to calculate the numeric match counter badge
function countHits(rule) {
  return [
    ...readItems("tasks").map((x) => ({ x, type: "task" })),
    ...readItems("habits").map((x) => ({ x, type: "habit" })),
  ].filter(({ x, type }) => matchesRule(rule, x, type)).length;
}

// Clears the DOM list and prints fresh HTML blocks based on our search filter queries
function renderRules() {
  const query = $("rule-search").value.toLowerCase(),
    status = $("rule-status").value,
    sort = $("rule-sort").value;

  // Filter out any entries that don't match our header filter options
  let shown = appRules
    .map((r, i) => ({ ...r, _order: i, _hits: countHits(r) }))
    .filter(
      (r) =>
        (r.name + " " + (r.description || "")).toLowerCase().includes(query) &&
        (status === "all" || (status === "enabled" ? r.enabled : r.enabled === false))
    );

  // Apply user array sort requests cleanly
  if (sort === "title") shown.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "hits") shown.sort((a, b) => b._hits - a._hits);

  // Re-build card containers using template strings matching our independent layouts
  rulesList.innerHTML = shown
    .map(
      (r) =>
        `<article class="rule-card" data-rule-id="${r.id}">
          <div class="priority-controls">
            <button class="order-button" data-move="-1" data-id="${r.id}" aria-label="Move up" \${r._order === 0 ? "disabled" : ""}>↑</button>
            <button class="order-button" data-move="1" data-id="${r.id}" aria-label="Move down" \${r._order === appRules.length - 1 ? "disabled" : ""}>↓</button>
          </div>
          <div>
            <div class="rule-title-line">
              <h3>\${escapeText(r.name)}</h3>
              <span class="status-pill">\${r.enabled ? "Enabled" : "Disabled"}</span>
              <span class="hit-pill">⚡ \${r._hits} matching</span>
            </div>
            <p class="rule-description">\${escapeText(r.description || "No description provided.")}</p>
            <div class="rule-logic">
              <span class="logic-pill">Condition: \${escapeText(r.entity)} · \${escapeText(r.field)} \${escapeText(r.operator)} \${escapeText(r.value)}</span>
              <span>Action:</span>
              <span class="logic-pill">\${escapeText(r.action.replace("-", " "))}\${r.actionLabel ? " · " + escapeText(r.actionLabel) : ""}</span>
            </div>
          </div>
          <div class="rule-actions">
            <label class="switch" title="Toggle state">
              <input type="checkbox" data-toggle="\${r.id}" \${r.enabled ? "checked" : ""} aria-label="Toggle \${escapeText(r.name)}">
              <span></span>
            </label>
            <button class="action-button" data-edit="\${r.id}" aria-label="Edit">✎</button>
            <button class="action-button" data-delete="\${r.id}" aria-label="Delete">♲</button>
          </div>
        </article>`
    )
    .join("");

  // Toggle the visibility of the "No Rules Yet" graphic view state dynamically
  rulesEmpty.hidden = shown.length > 0;
}

// Opens up our action dialogue form and either updates existing values or sets defaults for a new item
function openModal(rule = null) {
  editingRuleId = rule?.id || null;
  $("rule-modal-title").textContent = rule ? "Edit Automation Rule" : "Create New Rule";
  $("save-rule").textContent = rule ? "Save Changes" : "Create Rule";
  
  // Populate form fields with selected configuration or safe fallback constants
  $("rule-name").value = rule?.name || "";
  $("rule-description").value = rule?.description || "";
  $("rule-entity").value = rule?.entity || "task";
  $("rule-field").value = rule?.field || "priority";
  $("rule-operator").value = rule?.operator || "equals";
  $("rule-value").value = rule?.value || "";
  $("rule-action").value = rule?.action || "highlight-red";
  $("rule-action-label").value = rule?.actionLabel || "";
  
  modal.hidden = false;
  $("rule-name").focus();
}

// Reset form values and turn down modal backdrop cleanly
function closeModal() {
  modal.hidden = true;
  form.reset();
  editingRuleId = null;
}

// Connecting input event click routes to layout buttons
$("add-rule").addEventListener("click", () => openModal());
$("empty-add-rule").addEventListener("click", () => openModal());
$("close-rule-modal").addEventListener("click", closeModal);
$("cancel-rule").addEventListener("click", closeModal);

// Let the user tap out of the form overlay to dim background and close seamlessly
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

// Captures inputs on submit, packages the settings object, and updates or appends to storage array
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const rule = {
    id: editingRuleId || ruleId(),
    name: $("rule-name").value.trim(),
    description: $("rule-description").value.trim(),
    entity: $("rule-entity").value,
    field: $("rule-field").value,
    operator: $("rule-operator").value,
    value: $("rule-value").value.trim(),
    action: $("rule-action").value,
    actionLabel: $("rule-action-label").value.trim(),
    enabled: true,
  };

  // Quick sanity checks to avoid registering blank or corrupt definitions
  if (!rule.name || !rule.value) return;

  if (editingRuleId) {
    const index = appRules.findIndex((r) => r.id === editingRuleId);
    rule.enabled = appRules[index]?.enabled ?? true;
    appRules[index] = rule;
    notify("Rule settings updated");
  } else {
    appRules.push(rule);
    notify("New automation rule saved");
  }

  saveRules();
  closeModal();
  renderRules();
});

// Intercept clicks on our list card template via event delegation to handle sub-actions efficiently
rulesList.addEventListener("click", (e) => {
  const edit = e.target.closest("[data-edit]"),
    del = e.target.closest("[data-delete]"),
    move = e.target.closest("[data-move]");

  if (edit) {
    openModal(appRules.find((r) => r.id === edit.dataset.edit));
  }
  if (del) {
    const rule = appRules.find((r) => r.id === del.dataset.delete);
    if (rule && confirm(`Are you sure you want to delete rule "\${rule.name}"?`)) {
      appRules = appRules.filter((r) => r.id !== rule.id);
      saveRules();
      renderRules();
      notify("Rule removed permanently");
    }
  }
  if (move) {
    const i = appRules.findIndex((r) => r.id === move.dataset.id),
      j = i + Number(move.dataset.move);
    // Boundary check to ensure priority list modifications stay within array bounds
    if (j >= 0 && j < appRules.length) {
      [appRules[i], appRules[j]] = [appRules[j], appRules[i]];
      saveRules();
      renderRules();
      notify("Rule sequence prioritized");
    }
  }
});

// Listens directly for changes on inline input status toggle switches
rulesList.addEventListener("change", (e) => {
  if (e.target.matches("[data-toggle]")) {
    const rule = appRules.find((r) => r.id === e.target.dataset.toggle);
    if (rule) {
      rule.enabled = e.target.checked;
      saveRules();
      renderRules();
      notify(rule.enabled ? "Rule is now active" : "Rule suspended");
    }
  }
});

// Link control interactions inside layout filtering search blocks
["rule-search", "rule-status", "rule-sort"].forEach((id) =>
  $(id).addEventListener(
    id === "rule-search" ? "input" : "change",
    renderRules
  )
);

// Keep our counters fresh if tasks/habits list variables update inside another browser tab context
window.addEventListener("storage", (e) => {
  if (e.key === "app_rules" || e.key === "tasks" || e.key === "habits") {
    appRules = readItems("app_rules");
    renderRules();
  }
});

// Initial boot script execution to populate our container layout
renderRules();
