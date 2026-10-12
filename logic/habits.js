/* Habit data is stored separately from tasks*/
let habits = JSON.parse(localStorage.getItem("habits") || "[]");
let editingHabitId = null;
let deletingHabitId = null;
let pendingDateChange = null;
let draggedHabitId = null;
let toastTimer = null;

/*page elements */
const habitList = document.getElementById("habit-list");
const emptyState = document.getElementById("empty-state");
const addHabitButton = document.getElementById("add-habit-button");
const habitModal = document.getElementById("habit-modal");
const closeModalButton = document.getElementById("close-modal-button");
const cancelModalButton = document.getElementById("cancel-modal-button");
const habitForm = document.getElementById("habit-form");
const modalTitle = document.getElementById("modal-title");
const submitText = document.getElementById("submit-text");
const habitNameInput = document.getElementById("habit-name");
const habitDescriptionInput = document.getElementById("habit-description");
const habitFrequencyInput = document.getElementById("habit-frequency");
const weeklyDayInput = document.getElementById("weekly-day");
const weeklyDayGroup = document.getElementById("weekly-day-group");
const customDaysGroup = document.getElementById("custom-days-group");
const customDaysToggle = document.getElementById("custom-days-toggle");
const selectedDayChips = document.getElementById("selected-day-chips");
const customPlaceholder = document.getElementById("custom-placeholder");
const customDayChoices = document.getElementById("custom-day-choices");
const frequencyFilter = document.getElementById("frequency-filter");
const sortSelect = document.getElementById("sort-select");
const searchInput = document.getElementById("search-input");
const clearFiltersButton = document.getElementById("clear-filters-button");
const deleteModal = document.getElementById("delete-modal");
const deleteHabitTitle = document.getElementById("delete-habit-title");
const closeDeleteButton = document.getElementById("close-delete-button");
const cancelDeleteButton = document.getElementById("cancel-delete-button");
const confirmDeleteButton = document.getElementById("confirm-delete-button");
const dateConfirmModal = document.getElementById("date-confirm-modal");
const dateConfirmMessage = document.getElementById("date-confirm-message");
const closeDateConfirmButton = document.getElementById("close-date-confirm-button");
const cancelDateConfirmButton = document.getElementById("cancel-date-confirm-button");
const confirmDateChangeButton = document.getElementById("confirm-date-change-button");
const themeButton = document.getElementById("theme-button");
const themeIcon = document.getElementById("theme-icon");
const toast = document.getElementById("task-toast");
const toastMessage = document.getElementById("toast-message");
const toastDismiss = document.getElementById("toast-dismiss");

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const shortDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* Save the habit list whenever a habit or completion changes. */
function saveHabits() {
  localStorage.setItem("habits", JSON.stringify(habits));
  const streaks = habits.map((habit) => ({
    name: habit.name,
    streak: getCurrentStreak(habit),
  }));
  localStorage.setItem("habitStreaks", JSON.stringify(streaks));

  window.dispatchEvent(new Event("app-data-changed"));
}

/* IDs make it possible to edit or delete one habit without relying on its position. */
function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* Use local calendar dates instead of UTC to avoid a one-day shift in some time zones. */
function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
}

function todayKey() {
  return toDateKey(new Date());
}

function formatLongDate(dateKey) {
  return fromDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function escapeHtml(value = "") {
  const element = document.createElement("span");
  element.textContent = String(value);
  return element.innerHTML;
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

function hideToast() {
  toast.classList.remove("visible");
  clearTimeout(toastTimer);
}

/* Modal helpers keep the background blur and keyboard focus behavior consistent. */
function openModal(modal) {
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function selectedCustomDays() {
    return [...customDayChoices.querySelectorAll("input:checked")]
        .map((input) => Number(input.value));
}

function setCustomDays(days = []) {
 customDayChoices.querySelectorAll("input").forEach((input) => {
    input.checked = days.includes(Number(input.value));
  });

  renderCustomDayChips();
}


/* Show each selected weekday as a removable chip inside the field. */
function renderCustomDayChips() {
  selectedDayChips.replaceChildren();

  const selectedDays = selectedCustomDays();

  customPlaceholder.hidden = selectedDays.length > 0;

  selectedDays.forEach((day) => {
    const chip = document.createElement("span");
    chip.className = "custom-day-chip";

    const dayName = document.createElement("span");
    dayName.textContent = dayNames[day];

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-day-chip";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${dayNames[day]}`);

    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();

      const checkbox = customDayChoices.querySelector(
        `input[value="${day}"]`
      );

      if (checkbox) checkbox.checked = false;

      renderCustomDayChips();
    });

    chip.append(dayName, removeButton);
    selectedDayChips.appendChild(chip);
  });
}


/* Show the right day selector for the selected frequency. */
function updateFrequencyFields() {
  const frequency = habitFrequencyInput.value;
  weeklyDayGroup.classList.toggle("visible", frequency === "weekly");
  customDaysGroup.classList.toggle("visible", frequency === "custom");
  weeklyDayInput.required = frequency === "weekly";
  document.querySelectorAll("#custom-day-choices input").forEach((input) => {
    input.required = false;
  });
}

/* Return the weekdays that count as a scheduled habit day. */
function getScheduledDays(habit) {
  if (habit.frequency === "daily") return [0, 1, 2, 3, 4, 5, 6];
  if (habit.frequency === "weekly") return [Number(habit.weeklyDay)];
  return Array.isArray(habit.customDays) ? habit.customDays.map(Number) : [];
}

function isScheduledDay(habit, date) {
  return getScheduledDays(habit).includes(date.getDay());
}

/* The seven-day view advances in blocks after the last visible date passes. */
function getVisibleDates(habit) {
  const createdDate = fromDateKey(habit.createdDate || todayKey());
  const today = fromDateKey(todayKey());
  const elapsedDays = Math.max(0, Math.floor((today - createdDate) / 86400000));
  const blockStart = Math.floor(elapsedDays / 7) * 7;
  const startDate = addDays(createdDate, blockStart);
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
}

/* Count consecutive scheduled completions to display the current streak. */
function getCurrentStreak(habit) {
  const completed = new Set(habit.completedDates || []);
  let checkDate = fromDateKey(todayKey());
  if (!completed.has(toDateKey(checkDate))) checkDate = addDays(checkDate, -1);

  let streak = 0;
  const earliestDate = fromDateKey(habit.createdDate || todayKey());
  while (checkDate >= earliestDate) {
    if (isScheduledDay(habit, checkDate)) {
      if (!completed.has(toDateKey(checkDate))) break;
      streak += 1;
    }
    checkDate = addDays(checkDate, -1);
  }
  return streak;
}

function getFrequencyLabel(habit) {
  if (habit.frequency === "daily") return "Daily";
  if (habit.frequency === "weekly") return `Weekly · ${dayNames[Number(habit.weeklyDay)]}`;
  const names = getScheduledDays(habit).sort((a, b) => a - b).map((day) => dayNames[day]);
  return `Custom · ${names.map((name) => name.slice(0, 3)).join(", ")}`;
}

/* Build a habit card and attach its edit, delete, completion, and drag handlers. */
function createHabitCard(habit) {
  const card = document.createElement("article");
  card.className = "habit-card";
  card.draggable = true;
  card.dataset.habitId = habit.id;

  const header = document.createElement("div");
  header.className = "habit-card-header";

  const copy = document.createElement("div");
  copy.className = "habit-card-copy";

  const title = document.createElement("h3");
  title.className = "habit-card-title";
  title.textContent = habit.name;
  copy.appendChild(title);

  if (habit.description) {
    const description = document.createElement("p");
    description.className = "habit-card-description";
    description.textContent = habit.description;
    copy.appendChild(description);
  }

  const meta = document.createElement("div");
  meta.className = "habit-card-meta";

  const frequency = document.createElement("span");
  frequency.className = "habit-frequency-badge";
  frequency.innerHTML = `<img src="../assets/calendar-icon.svg" class="inline-icon" alt="">`;
  frequency.append(document.createTextNode(getFrequencyLabel(habit)));

  const streak = document.createElement("span");
  streak.className = "habit-streak-badge";
  streak.innerHTML = `<img src="../assets/long-streek_icon.svg" class="inline-icon" alt=""> <strong>${getCurrentStreak(habit)} day${getCurrentStreak(habit) === 1 ? "" : "s"} streak</strong>`;

  meta.append(frequency, streak);
  copy.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "habit-card-actions";

  const today = todayKey();
  const completedToday = (habit.completedDates || []).includes(today);
  const markCompleteButton = document.createElement("button");
  markCompleteButton.type = "button";
  markCompleteButton.className = `habit-mark-button${completedToday ? " completed" : ""}`;
  markCompleteButton.textContent = completedToday ? "Completed" : "Mark Complete";
  markCompleteButton.setAttribute("aria-pressed", String(completedToday));
  markCompleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!isScheduledDay(habit, fromDateKey(today))) {
      showToast("Today is not a scheduled day for this habit");
      return;
    }
    toggleCompletion(habit, today);
  });

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "habit-icon-button";
  editButton.setAttribute("aria-label", `Edit ${habit.name}`);
  editButton.innerHTML = '<img src="../assets/edit-regular.svg" alt="">';
  editButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openEditModal(habit);
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "habit-icon-button delete";
  deleteButton.setAttribute("aria-label", `Delete ${habit.name}`);
  deleteButton.innerHTML = '<img src="../assets/trash-regular.svg" alt="">';
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openDeleteModal(habit);
  });

  actions.append(markCompleteButton, editButton, deleteButton);
  header.append(copy, actions);
  card.appendChild(header);

  const streakTrack = document.createElement("div");
  streakTrack.className = "streak-track";
  streakTrack.setAttribute("aria-label", "Seven-day habit progress");

  const completedDates = new Set(habit.completedDates || []);

  getVisibleDates(habit).forEach((date) => {
    const dateKey = toDateKey(date);
    const scheduled = isScheduledDay(habit, date);
    const isFuture = dateKey > today;
    const isToday = dateKey === today;
    const isCompleted = completedDates.has(dateKey);
    const isMissed = dateKey < today && scheduled && !isCompleted;

    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.className = "streak-day";
    dayButton.disabled = isFuture || !scheduled;
    dayButton.title = !scheduled
      ? "This habit is not scheduled for this day"
      : isFuture
        ? "Future dates cannot be marked complete"
        : `${formatLongDate(dateKey)}${isCompleted ? " · Completed" : isMissed ? " · Not completed" : ""}`;
    dayButton.setAttribute("aria-label", `${formatLongDate(dateKey)}${isCompleted ? ", completed" : isMissed ? ", not completed" : ""}`);

    if (isToday) dayButton.classList.add("today");
    if (isFuture) dayButton.classList.add("future");
    if (!scheduled) dayButton.classList.add("unscheduled");
    if (isCompleted) dayButton.classList.add("completed");
    else if (isMissed) dayButton.classList.add("missed");

    const dayNumber = document.createElement("span");
    dayNumber.className = "streak-day-number";
    dayNumber.textContent = date.getDate();
    dayButton.appendChild(dayNumber);

    dayButton.addEventListener("click", () => {
      if (!scheduled || isFuture) return;
      if (isToday) {
        toggleCompletion(habit, dateKey);
      } else {
        openDateConfirmation(habit, dateKey);
      }
    });

    const dayItem = document.createElement("div");
    dayItem.className = "streak-day-item";
    const dayName = document.createElement("span");
    dayName.className = "streak-day-name";
    dayName.textContent = shortDayNames[date.getDay()];
    dayItem.append(dayButton, dayName);
    streakTrack.appendChild(dayItem);
  });

  card.appendChild(streakTrack);

  /* Drag the card itself; action buttons and the date boxes still work normally. */
  card.addEventListener("dragstart", (event) => {
    if (event.target.closest("button")) {
      event.preventDefault();
      return;
    }
    draggedHabitId = habit.id;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", habit.id);
  });

  card.addEventListener("dragend", () => {
    draggedHabitId = null;
    document.querySelectorAll(".habit-card").forEach((item) => {
      item.classList.remove("dragging", "drop-target");
    });
  });

  card.addEventListener("dragover", (event) => {
    if (!draggedHabitId || draggedHabitId === habit.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".habit-card").forEach((item) => item.classList.remove("drop-target"));
    card.classList.add("drop-target");
  });

  card.addEventListener("dragleave", (event) => {
    if (!card.contains(event.relatedTarget)) card.classList.remove("drop-target");
  });

  card.addEventListener("drop", (event) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedHabitId;
    if (!sourceId || sourceId === habit.id) return;
    const sourceIndex = habits.findIndex((item) => item.id === sourceId);
    const targetIndex = habits.findIndex((item) => item.id === habit.id);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [movedHabit] = habits.splice(sourceIndex, 1);
    habits.splice(targetIndex, 0, movedHabit);
    sortSelect.value = "";
    saveHabits();
    renderHabits();
    showToast("Habit order updated");
  });

  return card;
}

/* Search and frequency filters are applied before sorting the visible habits. */
function getVisibleHabits() {
  const query = searchInput.value.trim().toLowerCase();
  const frequency = frequencyFilter.value;
  const visible = habits.filter((habit) => {
    const matchesName = habit.name.toLowerCase().includes(query);
    const matchesFrequency = frequency === "all" || habit.frequency === frequency;
    return matchesName && matchesFrequency;
  });

  const sortBy = sortSelect.value;
  if (!sortBy) return visible;

  visible.sort((first, second) => {
    if (sortBy === "streak") return getCurrentStreak(second) - getCurrentStreak(first);
    if (sortBy === "frequency") {
      const order = { daily: 0, weekly: 1, custom: 2 };
      return order[first.frequency] - order[second.frequency];
    }
    if (sortBy === "title") return first.name.localeCompare(second.name);
    if (sortBy === "created") return first.createdDate.localeCompare(second.createdDate);
    return 0;
  });
  return visible;
}

function renderHabits() {
  const visibleHabits = getVisibleHabits();
  habitList.replaceChildren();

  if (!visibleHabits.length) {
    habitList.appendChild(emptyState);
    emptyState.style.display = "flex";
    return;
  }

  emptyState.style.display = "none";
  visibleHabits.forEach((habit) => habitList.appendChild(createHabitCard(habit)));
}

/* Today can be marked or unmarked directly; previous dates require confirmation. */
function toggleCompletion(habit, dateKey) {
  if (dateKey > todayKey()) return;
  if (!isScheduledDay(habit, fromDateKey(dateKey))) return;

  if (!Array.isArray(habit.completedDates)) habit.completedDates = [];
  const completed = habit.completedDates.includes(dateKey);

  if (completed) {
    habit.completedDates = habit.completedDates.filter((date) => date !== dateKey);
  } else {
    habit.completedDates.push(dateKey);
  }

  saveHabits();
  renderHabits();
  showToast(completed ? "Habit marked as not completed" : "Habit marked as completed");
}

function openDateConfirmation(habit, dateKey) {
  pendingDateChange = { habitId: habit.id, dateKey };
  const status = (habit.completedDates || []).includes(dateKey) ? "completed" : "not completed";
  dateConfirmMessage.textContent = `Are you sure you want to change the completion of ${formatLongDate(dateKey)}? It is currently marked as ${status}.`;
  openModal(dateConfirmModal);
}

function closeDateConfirmation() {
  closeModal(dateConfirmModal);
  pendingDateChange = null;
}

function confirmDateChange() {
  if (!pendingDateChange) return;
  const { habitId, dateKey } = pendingDateChange;
  const habit = habits.find((item) => item.id === habitId);
  closeDateConfirmation();
  if (!habit) return;
  toggleCompletion(habit, dateKey);
}

/* Open a clean form for a new habit. */
function openAddModal() {
  editingHabitId = null;
  habitForm.reset();
  habitFrequencyInput.value = "daily";
  weeklyDayInput.value = "1";
  setCustomDays([]);
  updateFrequencyFields();
  modalTitle.textContent = "Add habit";
  submitText.textContent = "Add habit";
  openModal(habitModal);
  habitNameInput.focus();
}

/* Fill the same form with existing habit data when editing. */
function openEditModal(habit) {
  editingHabitId = habit.id;
  habitNameInput.value = habit.name;
  habitDescriptionInput.value = habit.description || "";
  habitFrequencyInput.value = habit.frequency;
  weeklyDayInput.value = String(habit.weeklyDay ?? 1);
  setCustomDays(habit.customDays || []);
  updateFrequencyFields();
  modalTitle.textContent = "Edit habit";
  submitText.textContent = "Save changes";
  openModal(habitModal);
  habitNameInput.focus();
}

function closeHabitModal() {
  closeModal(habitModal);
  habitForm.reset();
  editingHabitId = null;
  updateFrequencyFields();
}

/* Validate the frequency choices, then create a habit or update the selected one. */
function saveHabit(event) {
  event.preventDefault();
  const name = habitNameInput.value.trim();
  const description = habitDescriptionInput.value.trim();
  const frequency = habitFrequencyInput.value;
  const customDays = selectedCustomDays();

  if (!name) {
    showToast("Habit name is required");
    habitNameInput.focus();
    return;
  }
  if (frequency === "custom" && customDays.length === 0) {
    showToast("Choose at least one day for this habit");
    return;
  }

  const existingHabit = habits.find((habit) => habit.id === editingHabitId);
  const habitData = {
    id: editingHabitId || createId(),
    name,
    description,
    frequency,
    weeklyDay: frequency === "weekly" ? Number(weeklyDayInput.value) : null,
    customDays: frequency === "custom" ? customDays : [],
    createdDate: existingHabit?.createdDate || todayKey(),
    completedDates: existingHabit?.completedDates || [],
  };

  if (existingHabit) {
    Object.assign(existingHabit, habitData);
    showToast("Habit updated");
  } else {
    habits.push(habitData);
    showToast("Habit created");
  }

  saveHabits();
  closeHabitModal();
  renderHabits();
}

/* Keep deletion separate from editing so accidental clicks cannot remove a habit. */
function openDeleteModal(habit) {
  deletingHabitId = habit.id;
  deleteHabitTitle.textContent = habit.name;
  openModal(deleteModal);
}

function closeDeleteModal() {
  closeModal(deleteModal);
  deletingHabitId = null;
}

function deleteHabit() {
  if (!deletingHabitId) return;
  habits = habits.filter((habit) => habit.id !== deletingHabitId);
  saveHabits();
  closeDeleteModal();
  renderHabits();
  showToast("Habit deleted");
}

function resetFilters() {
  searchInput.value = "";
  frequencyFilter.value = "all";
  renderHabits();
  showToast("Filters cleared");
}

/* Share the same theme preference with the task page. */
function loadTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.classList.toggle("dark", savedTheme === "dark");
  themeIcon.innerHTML = `<img class="theme-icon-image" src="../assets/${savedTheme === "dark" ? "light_theme_icon.svg" : "dark_theme_icon.svg"}" alt="">`;
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  loadTheme();
}

/* Connect buttons and form controls to their actions. */
addHabitButton.addEventListener("click", openAddModal);
closeModalButton.addEventListener("click", closeHabitModal);
cancelModalButton.addEventListener("click", closeHabitModal);
habitForm.addEventListener("submit", saveHabit);
habitFrequencyInput.addEventListener("change", updateFrequencyFields);
frequencyFilter.addEventListener("change", renderHabits);
sortSelect.addEventListener("change", renderHabits);
searchInput.addEventListener("input", renderHabits);
clearFiltersButton.addEventListener("click", resetFilters);
closeDeleteButton.addEventListener("click", closeDeleteModal);
cancelDeleteButton.addEventListener("click", closeDeleteModal);
confirmDeleteButton.addEventListener("click", deleteHabit);
closeDateConfirmButton.addEventListener("click", closeDateConfirmation);
cancelDateConfirmButton.addEventListener("click", closeDateConfirmation);
confirmDateChangeButton.addEventListener("click", confirmDateChange);
themeButton.addEventListener("click", toggleTheme);
toastDismiss.addEventListener("click", hideToast);

/* Clicking outside a modal closes it without saving unfinished form changes. */
[habitModal, deleteModal, dateConfirmModal].forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target !== modal) return;
    if (modal === habitModal) closeHabitModal();
    else if (modal === deleteModal) closeDeleteModal();
    else closeDateConfirmation();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (habitModal.classList.contains("show")) closeHabitModal();
  if (deleteModal.classList.contains("show")) closeDeleteModal();
  if (dateConfirmModal.classList.contains("show")) closeDateConfirmation();
});


/* Open or close the custom weekday dropdown. */
customDaysToggle.addEventListener("click", () => {
  const isOpen = !customDayChoices.hidden;

  customDayChoices.hidden = isOpen;
  customDaysToggle.setAttribute("aria-expanded", String(!isOpen));
});

/* Keep the selected chips updated whenever a weekday is checked. */
customDayChoices.querySelectorAll("input").forEach((input) => {
  input.addEventListener("change", renderCustomDayChips);
});

/* Close the dropdown when clicking outside the custom selector. */
document.addEventListener("click", (event) => {
  const selector = document.getElementById("custom-multiselect");

  if (!selector.contains(event.target)) {
    customDayChoices.hidden = true;
    customDaysToggle.setAttribute("aria-expanded", "false");
  }
});




/* Initialize saved theme and render any habits already in localStorage. */
loadTheme();
updateFrequencyFields();
saveHabits();
renderHabits();

// Listen for global history undo/redo updates to refresh the UI
window.addEventListener("app-data-changed", () => {
  
  // Re-read data array variables from storage following history shifts
  habits = JSON.parse(localStorage.getItem("habits") || "[]");
  renderHabits();
  console.log("Habits view updated via history rollback.");
});

