/* Shared integration layer: debounced history timeline and shortcut bindings */
(() => {
  const tracked = ["tasks", "habits", "app_rules"];
  const undoStack = JSON.parse(sessionStorage.getItem("tracker_undo") || "[]");
  const redoStack = JSON.parse(sessionStorage.getItem("tracker_redo") || "[]");
  
  let restoring = false;
  let saveTimeout = null;
  let preChangeSnapshot = null;

  const originalSet = Storage.prototype.setItem;

  // Helper to capture current state
  const snapshot = () =>
    Object.fromEntries(tracked.map((k) => [k, localStorage.getItem(k)]));

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* 
    DEBOUNCED MONITORING LAYER: 
    Intercepts setItem calls and groups multiple rapid micro-changes together.
  */
  Storage.prototype.setItem = function (key, value) {
    if (!restoring && tracked.includes(String(key))) {
      // Capture the initial baseline state before a sequence of changes starts
      if (!preChangeSnapshot) {
        preChangeSnapshot = snapshot();
      }

      // Execute the native storage operation
      const result = originalSet.call(this, key, value);

      // Debounce history recording to group rapid multiple sets (like tasks + expandedTaskIds)
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        const currentSnapshot = snapshot();

        // Only save to timeline history if data actually modified from baseline
        if (preChangeSnapshot && !same(preChangeSnapshot, currentSnapshot)) {
          undoStack.push(preChangeSnapshot);
          if (undoStack.length > 20) undoStack.shift(); // Increased to 20 steps for safety
          redoStack.length = 0; // Clear redo history on new action
          persistHistory();
          
          window.dispatchEvent(new Event("app-data-changed"));
        }
        preChangeSnapshot = null; // Reset baseline capture engine
      }, 50); // 50ms window groups simultaneous writes seamlessly

      return result;
    }
    return originalSet.call(this, key, value);
  };

  // Reverts and syncs variables inside tasks.js/habits.js cleanly
  function restore(state) {
    restoring = true;
    tracked.forEach((k) => {
      if (state[k] === null) {
        localStorage.removeItem(k);
      } else if (state[k] !== undefined) {
        originalSet.call(localStorage, k, state[k]);
      }
    });
    restoring = false;

    // IMPORTANT: Announce the switch before re-rendering so scripts grab fresh variables
    window.dispatchEvent(new Event("app-data-changed"));
    window.dispatchEvent(new Event("app-rules-changed"));
    
    // Safely re-render visible view layouts instantly
    if (typeof renderTasks === "function") renderTasks();
    if (typeof renderHabits === "function") renderHabits();
    if (typeof applyRulesToVisibleCards === "function") applyRulesToVisibleCards();
    
    persistHistory();
  }

  function persistHistory() {
    sessionStorage.setItem("tracker_undo", JSON.stringify(undoStack));
    sessionStorage.setItem("tracker_redo", JSON.stringify(redoStack));
  }

  function triggerUndo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
  }

  function triggerRedo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
  }

  /* Keyboard Event Dispatcher */
  window.addEventListener("keydown", (e) => {
    const target = e.target;
    const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    if (isTyping) return;

    const isModifier = e.ctrlKey || e.metaKey;
    if (isModifier) {
      const keyLower = e.key.toLowerCase();
      if (keyLower === "z") {
        e.preventDefault();
        if (e.shiftKey) triggerRedo();
        else triggerUndo();
      }
      if (keyLower === "y") {
        e.preventDefault();
        triggerRedo();
      }
    }
  });

  persistHistory();
})();
