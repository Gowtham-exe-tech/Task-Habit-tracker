
/* Shared integration layer: theme, undo/redo history, and rules. */
(() => {
  const tracked = ["tasks", "habits", "app_rules"];
  const undoStack = JSON.parse(sessionStorage.getItem("tracker_undo") || "[]");
  const redoStack = JSON.parse(sessionStorage.getItem("tracker_redo") || "[]");
  let restoring = false;
  let rulesUpdateScheduled = false;

  const originalSet = Storage.prototype.setItem;

  // Capture the current application data for undo/redo.
  const snapshot = () =>
    Object.fromEntries(tracked.map((key) => [key, localStorage.getItem(key)]));

  const same = (first, second) =>
    JSON.stringify(first) === JSON.stringify(second);

  // Track changes made to the application's localStorage data.
  Storage.prototype.setItem = function (key, value) {
    if (!restoring && this === localStorage && tracked.includes(String(key))) {
      const before = snapshot();
      const result = originalSet.call(this, key, value);
      const after = snapshot();

      if (!same(before, after)) {
        undoStack.push(before);

        if (undoStack.length > 5) undoStack.shift();

        redoStack.length = 0;
        updateButtons();
        window.dispatchEvent(new Event("app-data-changed"));
      }

      return result;
    }

    return originalSet.call(this, key, value);
  };

  // Restore a previous application state.
  function restore(state) {
    restoring = true;

    try {
      tracked.forEach((key) => {
        if (state[key] === null) {
          localStorage.removeItem(key);
        } else if (state[key] !== undefined) {
          originalSet.call(localStorage, key, state[key]);
        }
      });
    } finally {
      restoring = false;
    }

    window.dispatchEvent(new Event("app-data-changed"));
    window.dispatchEvent(new Event("app-rules-changed"));
    updateButtons();
  }

  // Read saved JSON data without breaking the page if storage is invalid.
  function readStorage(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  // Check whether a rule matches a task or habit.
  function matchesRule(rule, item, type) {
    if (rule.entity !== "both" && rule.entity !== type) return false;

    const actual =
      rule.field === "priority"
        ? item.priority
        : rule.field === "status"
          ? item.status
          : rule.field === "dueDate"
            ? item.dueDate || item.due_date || ""
            : rule.field === "streak"
              ? Number(item.streak || item.currentStreak || 0)
              : rule.field === "frequency"
                ? item.frequency
                : undefined;

    const actualValue = String(actual ?? "").toLowerCase();
    const expectedValue = String(rule.value ?? "").toLowerCase();

    if (rule.operator === "isOverdue") {
      const dueDate = String(actual ?? "").slice(0, 10);
      const today = new Date();
      const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      return (
        !!dueDate &&
        dueDate < localToday &&
        String(item.status || "").toLowerCase() !== "completed"
      );
    }

    if (rule.operator === "greaterThan") {
      return Number(actual) > Number(rule.value);
    }

    if (rule.operator === "lessThanOrEqual") {
      return Number(actual) <= Number(rule.value);
    }

    if (rule.operator === "contains") {
      return actualValue.includes(expectedValue);
    }

    if (rule.operator === "notEquals") {
      return actualValue !== expectedValue;
    }

    return actualValue === expectedValue;
  }

  // Apply saved rules to task and habit cards currently on the page.
  function applyRulesToVisibleCards() {
    const rules = readStorage("app_rules").filter((rule) => rule.enabled);

    const cardGroups = [
      {
        selector: ".task-card",
        storageKey: "tasks",
        type: "task",
        idAttribute: "id",
      },
      {
        selector: ".habit-card",
        storageKey: "habits",
        type: "habit",
        idAttribute: "habitId",
      },
    ];

    cardGroups.forEach(({ selector, storageKey, type, idAttribute }) => {
      const items = readStorage(storageKey);

      document.querySelectorAll(selector).forEach((card) => {
        // Remove effects from the previous rule evaluation.
        card.style.removeProperty("outline");
        card.style.removeProperty("background-color");
        card.querySelectorAll(".app-rule-badge").forEach((badge) => badge.remove());

        // Task cards use data-id; habit cards use data-habit-id.
        const itemId = card.dataset[idAttribute];
        const item = items.find((entry) => String(entry.id) === String(itemId));

        if (!item) return;

        const matchingRules = rules.filter((rule) =>
          matchesRule(rule, item, type),
        );

        matchingRules.forEach((rule) => {
          if (rule.action === "highlight-red") {
            card.style.outline = "2px solid #e65c5c";
          } else if (rule.action === "highlight-yellow") {
            card.style.outline = "2px solid #e7b544";
          } else {
            const badge = document.createElement("span");
            badge.className = "app-rule-badge";
            badge.textContent = rule.actionLabel || rule.name || "Rule matched";
            badge.style.cssText =
              "display:inline-block;margin:5px;padding:3px 7px;border-radius:12px;background:#dff7ea;color:#176b45;font-size:11px";
            card.appendChild(badge);
          }
        });
      });
    });
  }

  // Schedule one rule update for a group of related DOM changes.
  function scheduleRulesUpdate() {
    if (rulesUpdateScheduled) return;

    rulesUpdateScheduled = true;

    requestAnimationFrame(() => {
      rulesUpdateScheduled = false;
      applyRulesToVisibleCards();
    });
  }

  // Persist undo/redo history for the current browser session.
  function persistHistory() {
    sessionStorage.setItem("tracker_undo", JSON.stringify(undoStack));
    sessionStorage.setItem("tracker_redo", JSON.stringify(redoStack));
  }

  // Keep the undo/redo buttons in sync with history.
  function updateButtons() {
    persistHistory();

    const undoButton = document.getElementById("global-undo");
    const redoButton = document.getElementById("global-redo");

    if (undoButton) undoButton.disabled = !undoStack.length;
    if (redoButton) redoButton.disabled = !redoStack.length;
  }

  // Add shared undo/redo controls.
  const bar = document.createElement("div");
  bar.className = "history-controls";
  bar.innerHTML =
    '<button id="global-undo" type="button" title="Undo last change (up to 5)">↶ Undo</button><button id="global-redo" type="button" title="Redo change">↷ Redo</button>';

  document.body.appendChild(bar);

  const style = document.createElement("style");
  style.textContent =
    ".history-controls{position:fixed;right:16px;bottom:16px;z-index:40;display:flex;gap:7px;padding:6px;background:var(--surface,#fff);border:1px solid var(--border,#ddd);border-radius:9px;box-shadow:0 4px 18px #0001}.history-controls button{border:1px solid var(--border,#ddd);border-radius:6px;padding:8px 11px;background:var(--surface,#fff);color:var(--text,#222);cursor:pointer}.history-controls button:disabled{opacity:.4;cursor:not-allowed}@media(max-width:500px){.history-controls{right:8px;bottom:8px}.history-controls button{padding:7px 9px}}";

  document.head.appendChild(style);

  bar.querySelector("#global-undo").addEventListener("click", () => {
    if (!undoStack.length) return;

    redoStack.push(snapshot());
    restore(undoStack.pop());
  });

  bar.querySelector("#global-redo").addEventListener("click", () => {
    if (!redoStack.length) return;

    undoStack.push(snapshot());
    restore(redoStack.pop());
  });

  // Share theme selection across pages.
  const themeButton = document.getElementById("theme-button");

  function applySharedTheme() {
    const dark = localStorage.getItem("theme") === "dark";

    document.body.classList.toggle("dark", dark);
    document.body.dataset.theme = dark ? "dark" : "light";

    const image = document.querySelector("#theme-icon img, #theme-image");

    if (image) {
      image.src = `./assets/${dark ? "light_theme_icon.svg" : "dark_theme_icon.svg"}`;
    }
  }

  if (themeButton) {
    applySharedTheme();

    themeButton.addEventListener("click", () => {
      requestAnimationFrame(() => {
        localStorage.setItem(
          "app_theme",
          localStorage.getItem("theme") || "light",
        );

        applySharedTheme();
      });
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === "theme") applySharedTheme();

    if (tracked.includes(event.key)) {
      scheduleRulesUpdate();
    }
  });

  // Reapply rules when saved data changes.
  window.addEventListener("app-rules-changed", scheduleRulesUpdate);
  window.addEventListener("app-data-changed", scheduleRulesUpdate);

  // Detect dynamically added or removed task and habit cards.
  const cardObserver = new MutationObserver((mutations) => {
    const cardsChanged = mutations.some((mutation) => {
      const changedNodes = [
        ...mutation.addedNodes,
        ...mutation.removedNodes,
      ];

      return changedNodes.some((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.classList.contains("app-rule-badge")) return false;

        return (
          node.matches(".task-card, .habit-card") ||
          node.querySelector(".task-card, .habit-card")
        );
      });
    });

    if (cardsChanged) scheduleRulesUpdate();
  });

  cardObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Apply rules to cards already rendered when this script runs.
  applyRulesToVisibleCards();
  updateButtons();
})();
