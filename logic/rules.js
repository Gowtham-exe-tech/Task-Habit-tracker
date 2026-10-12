/* Rules are ordered from highest priority (top) to lowest priority. */
let appRules = JSON.parse(localStorage.getItem("app_rules") || "[]");
let editingRuleId = null;
let toastTimer = null;
const $ = (id) => document.getElementById(id);
const rulesList = $("rules-list"),
  rulesEmpty = $("rules-empty"),
  modal = $("rule-modal"),
  form = $("rule-form");
const dayMs = 86400000;
function ruleId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function saveRules() {
  localStorage.setItem("app_rules", JSON.stringify(appRules));
  window.dispatchEvent(
    new CustomEvent("app-rules-changed", { detail: appRules }),
  );
}
function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function escapeText(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function readItems(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function matchesRule(rule, item, type) {
  if (rule.entity !== "both" && rule.entity !== type) return false;
  let actual;
  if (rule.field === "priority") actual = item.priority;
  else if (rule.field === "status") actual = item.status;
  else if (rule.field === "dueDate")
    actual = item.dueDate || item.due_date || "";
  else if (rule.field === "streak")
    actual = Number(
      item.streak || item.currentStreak || item.longestStreak || 0,
    );
  else if (rule.field === "frequency") actual = item.frequency;
  const expected = rule.value;
  if (rule.field === "dueDate" && rule.operator === "isOverdue")
    return (
      !!actual &&
      actual < new Date().toISOString().slice(0, 10) &&
      item.status !== "completed"
    );
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
  if (rule.operator === "contains")
    return String(actual ?? "")
      .toLowerCase()
      .includes(expected.toLowerCase());
  if (rule.operator === "notEquals")
    return String(actual ?? "").toLowerCase() !== expected.toLowerCase();
  return String(actual ?? "").toLowerCase() === expected.toLowerCase();
}
function countHits(rule) {
  return [
    ...readItems("tasks").map((x) => ({ x, type: "task" })),
    ...readItems("habits").map((x) => ({ x, type: "habit" })),
  ].filter(({ x, type }) => matchesRule(rule, x, type)).length;
}
function renderRules() {
  const query = $("rule-search").value.toLowerCase(),
    status = $("rule-status").value,
    sort = $("rule-sort").value;
  let shown = appRules
    .map((r, i) => ({ ...r, _order: i, _hits: countHits(r) }))
    .filter(
      (r) =>
        (r.name + " " + (r.description || "")).toLowerCase().includes(query) &&
        (status === "all" ||
          (status === "enabled" ? r.enabled : r.enabled === false)),
    );
  if (sort === "title") shown.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "hits") shown.sort((a, b) => b._hits - a._hits);
  rulesList.innerHTML = shown
    .map(
      (r) =>
        `<article class="rule-card" data-rule-id="${r.id}"><div class="priority-controls"><button class="order-button" data-move="-1" data-id="${r.id}" aria-label="Move rule up" ${r._order === 0 ? "disabled" : ""}>↑</button><button class="order-button" data-move="1" data-id="${r.id}" aria-label="Move rule down" ${r._order === appRules.length - 1 ? "disabled" : ""}>↓</button></div><div><div class="rule-title-line"><h3>${escapeText(r.name)}</h3><span class="status-pill">${r.enabled ? "Enabled" : "Disabled"}</span><span class="hit-pill">⚡ ${r._hits} matching</span></div><p class="rule-description">${escapeText(r.description || "No description")}</p><div class="rule-logic"><span class="logic-pill">Condition: ${escapeText(r.entity)} · ${escapeText(r.field)} ${escapeText(r.operator)} ${escapeText(r.value)}</span><span>Action:</span><span class="logic-pill">${escapeText(r.action.replace("-", " "))}${r.actionLabel ? " · " + escapeText(r.actionLabel) : ""}</span></div></div><div class="rule-actions"><label class="switch" title="Enable or disable rule"><input type="checkbox" data-toggle="${r.id}" ${r.enabled ? "checked" : ""} aria-label="Enable ${escapeText(r.name)}"><span></span></label><button class="action-button" data-edit="${r.id}" aria-label="Edit rule">✎</button><button class="action-button" data-delete="${r.id}" aria-label="Delete rule">♲</button></div></article>`,
    )
    .join("");
  rulesEmpty.hidden = shown.length > 0;
}
function openModal(rule = null) {
  editingRuleId = rule?.id || null;
  $("rule-modal-title").textContent = rule ? "Edit Rule" : "Add Rule";
  $("save-rule").textContent = rule ? "Save Changes" : "Save Rule";
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
function closeModal() {
  modal.hidden = true;
  form.reset();
  editingRuleId = null;
}
$("add-rule").addEventListener("click", () => openModal());
$("empty-add-rule").addEventListener("click", () => openModal());
$("close-rule-modal").addEventListener("click", closeModal);
$("cancel-rule").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
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
  if (!rule.name || !rule.value) return;
  if (editingRuleId) {
    const index = appRules.findIndex((r) => r.id === editingRuleId);
    rule.enabled = appRules[index]?.enabled ?? true;
    appRules[index] = rule;
    notify("Rule updated successfully");
  } else {
    appRules.push(rule);
    notify("Rule created successfully");
  }
  saveRules();
  closeModal();
  renderRules();
});
rulesList.addEventListener("click", (e) => {
  const edit = e.target.closest("[data-edit]"),
    del = e.target.closest("[data-delete]"),
    move = e.target.closest("[data-move]");
  if (edit) {
    openModal(appRules.find((r) => r.id === edit.dataset.edit));
  }
  if (del) {
    const rule = appRules.find((r) => r.id === del.dataset.delete);
    if (rule && confirm(`Delete rule "${rule.name}"?`)) {
      appRules = appRules.filter((r) => r.id !== rule.id);
      saveRules();
      renderRules();
      notify("Rule deleted");
    }
  }
  if (move) {
    const i = appRules.findIndex((r) => r.id === move.dataset.id),
      j = i + Number(move.dataset.move);
    if (j >= 0 && j < appRules.length) {
      [appRules[i], appRules[j]] = [appRules[j], appRules[i]];
      saveRules();
      renderRules();
      notify("Rule priority updated");
    }
  }
});
rulesList.addEventListener("change", (e) => {
  if (e.target.matches("[data-toggle]")) {
    const rule = appRules.find((r) => r.id === e.target.dataset.toggle);
    if (rule) {
      rule.enabled = e.target.checked;
      saveRules();
      renderRules();
      notify(rule.enabled ? "Rule enabled" : "Rule disabled");
    }
  }
});
["rule-search", "rule-status", "rule-sort"].forEach((id) =>
  $(id).addEventListener(
    id === "rule-search" ? "input" : "change",
    renderRules,
  ),
);
window.addEventListener("storage", (e) => {
  if (e.key === "app_rules" || e.key === "tasks" || e.key === "habits") {
    appRules = readItems("app_rules");
    renderRules();
  }
});
renderRules();
