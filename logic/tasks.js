/* Task data is saved in the browser, so refreshing the page will not remove it. */
let tasks = JSON.parse(localStorage.getItem("tasks") || "[]");
let editingTaskId = null;
let deletingTaskId = null;
let draggedTaskId = null;
let draggedSubtaskId = null;
let draggedSubtaskTaskId = null;
const expandedTaskIds = new Set(
  JSON.parse(localStorage.getItem("expandedTaskIds") || "[]"),
);

/* Keep the HTML elements here so the event handlers can use them. */
const taskList = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const addTaskButton = document.getElementById("add-task-button");
const taskModal = document.getElementById("task-modal");
const closeModalButton = document.getElementById("close-modal-button");
const cancelModalButton = document.getElementById("cancel-modal-button");
const taskForm = document.getElementById("task-form");
const modalTitle = document.getElementById("modal-title");
const submitText = document.getElementById("submit-text");
const taskTitle = document.getElementById("task-title");
const taskDescription = document.getElementById("task-description");
const taskDueDate = document.getElementById("task-due-date");
const taskPriority = document.getElementById("task-priority");
const taskStatus = document.getElementById("task-status");
const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");
const priorityFilter = document.getElementById("priority-filter");
const sortSelect = document.getElementById("sort-select");
const deleteModal = document.getElementById("delete-modal");
const deleteTaskTitle = document.getElementById("delete-task-title");
const closeDeleteButton = document.getElementById("close-delete-button");
const cancelDeleteButton = document.getElementById("cancel-delete-button");
const confirmDeleteButton = document.getElementById("confirm-delete-button");
const themeButton = document.getElementById("theme-button");
const themeIcon = document.getElementById("theme-icon");

/* Save the current task list after every change. */
function saveTasks() {
  localStorage.setItem("tasks", JSON.stringify(tasks));
  localStorage.setItem("expandedTaskIds", JSON.stringify([...expandedTaskIds]));
  window.dispatchEvent(new Event("app-data-changed"));
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value = "") {
  const element = document.createElement("span");
  element.textContent = String(value);
  return element.innerHTML;
}

function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("-", " ");
}

function formatDate(date) {
  if (!date) return "No due date";
  const [year, month, day] = date.split("-");
  return `${Number(day)}/${Number(month)}/${year}`;
}

function showToast(message, highlightedTitle = "") {
  let toast = document.getElementById("task-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "task-toast";
    toast.className = "task-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  // Build the notification with text nodes so task titles are always treated as text.
  toast.replaceChildren();

  const iconBlock = document.createElement("span");
  iconBlock.className = "toast-icon-block";
  const checkIcon = document.createElement("img");
  checkIcon.className = "toast-icon";
  checkIcon.src = "../assets/subway_tick.svg";
  checkIcon.alt = "";
  iconBlock.appendChild(checkIcon);

  const messageElement = document.createElement("span");
  messageElement.className = "toast-message";
  const titleMarker = "{task}";
  const markerIndex = message.indexOf(titleMarker);

  if (highlightedTitle && markerIndex !== -1) {
    messageElement.append(
      document.createTextNode(message.slice(0, markerIndex)),
    );
    const titleElement = document.createElement("strong");
    titleElement.textContent = highlightedTitle;
    messageElement.append(
      titleElement,
      document.createTextNode(message.slice(markerIndex + titleMarker.length)),
    );
  } else {
    messageElement.textContent = message;
  }

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "toast-dismiss";
  dismissButton.setAttribute("aria-label", "Dismiss notification");
  const dismissIcon = document.createElement("img");
  dismissIcon.src = "../assets/close_icon.svg";
  dismissIcon.alt = "";
  dismissButton.appendChild(dismissIcon);
  dismissButton.addEventListener("click", () => {
    clearTimeout(showToast.timer);
    toast.classList.remove("visible");
  });

  toast.append(iconBlock, messageElement, dismissButton);
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function openAddModal() {
  editingTaskId = null;
  modalTitle.textContent = "Add task";
  submitText.textContent = "Submit";
  taskForm.reset();
  taskPriority.value = "medium";
  taskStatus.value = "active";
  taskModal.classList.add("show");
}

function openEditModal(task) {
  editingTaskId = task.id;
  modalTitle.textContent = "Edit task";
  submitText.textContent = "Save changes";
  taskTitle.value = task.title;
  taskDescription.value = task.description || "";
  taskDueDate.value = task.dueDate || "";
  taskPriority.value = task.priority || "medium";
  taskStatus.value = task.status || "active";
  taskModal.classList.add("show");
}

function closeTaskModal() {
  taskModal.classList.remove("show");
  editingTaskId = null;
}

function saveTask(event) {
  event.preventDefault();
  const data = {
    title: taskTitle.value.trim(),
    description: taskDescription.value.trim(),
    dueDate: taskDueDate.value,
    priority: taskPriority.value,
    status: taskStatus.value,
  };
  if (!data.title || !data.dueDate) return;

  if (editingTaskId !== null) {
    const task = tasks.find((item) => item.id === editingTaskId);
    if (!task) return;

    const previousStatus = task.status;
    Object.assign(task, data);

    if (data.status === "completed") {
      if (previousStatus !== "completed" || !task.completedAt) {
        task.completedAt = new Date().toISOString();
      }
    } else {
      delete task.completedAt;
    }
    showToast('All set! "{task}" updated successfully', task.title);
  } else {
    tasks.push({
      id: createId(),
      ...data,
      createdAt: Date.now(),
      subtasks: [],
    });
    showToast(
      'Nice work! Your new task "{task}" is now in the list!',
      data.title,
    );
  }

  saveTasks();
  renderTasks();
  closeTaskModal();
}

function openDeleteModal(task) {
  deletingTaskId = task.id;
  deleteTaskTitle.textContent = task.title;
  deleteModal.classList.add("show");
}

function closeDeleteModal() {
  deleteModal.classList.remove("show");
  deletingTaskId = null;
}

function deleteTask() {
  const deletedTask = tasks.find((task) => task.id === deletingTaskId);
  tasks = tasks.filter((task) => task.id !== deletingTaskId);
  expandedTaskIds.delete(deletingTaskId);
  saveTasks();
  renderTasks();
  closeDeleteModal();
  showToast(
    deletedTask
      ? `Done! Your task ${deletedTask?.title} has been removed.`
      : "Task deleted successfully",
    deletedTask?.title || "",
  );
}

function changeTaskStatus(taskId, status) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.status = status;

  if (status === "completed") {
    task.completedAt = new Date().toISOString();
  } else {
    delete task.completedAt;
  }

  saveTasks();
  renderTasks();
  showToast("Task status updated successfully");
}

function moveItem(items, itemId, direction) {
  const index = items.findIndex((item) => item.id === itemId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return false;
  [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
  return true;
}

function moveTask(taskId, direction) {
  if (moveItem(tasks, taskId, direction)) {
    sortSelect.value = "";
    saveTasks();
    renderTasks();
    showToast("All set! your changes have been saved successfully!");
  }
}

function getVisibleTasks() {
  const search = searchInput.value.toLowerCase().trim();
  const selectedStatus = statusFilter.value;
  const selectedPriority = priorityFilter.value;
  const selectedSort = sortSelect.value;
  const visible = tasks.filter((task) => {
    const matchesSearch = `${task.title} ${task.description || ""}`
      .toLowerCase()
      .includes(search);
    return (
      matchesSearch &&
      (selectedStatus === "all" || task.status === selectedStatus) &&
      (selectedPriority === "all" || task.priority === selectedPriority)
    );
  });
  const priorityOrder = { high: 1, medium: 2, low: 3 };
  visible.sort((a, b) => {
    if (selectedSort === "due-date")
      return (a.dueDate || "").localeCompare(b.dueDate || "");
    if (selectedSort === "priority")
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    if (selectedSort === "title") return a.title.localeCompare(b.title);
    return tasks.indexOf(a) - tasks.indexOf(b);
  });
  return visible;
}

function addSubtask(task, input) {
  const title = input.value.trim();
  if (!title) return;
  task.subtasks = task.subtasks || [];
  task.subtasks.push({ id: createId(), title, completed: false });
  expandedTaskIds.add(task.id);
  saveTasks();
  renderTasks();
  // showToast("Subtask added successfully");
}

function updateSubtask(task, subtaskId, changes) {
  const subtask = (task.subtasks || []).find((item) => item.id === subtaskId);
  if (!subtask) return;
  Object.assign(subtask, changes);
  expandedTaskIds.add(task.id);
  saveTasks();
  renderTasks();
  // if (Object.hasOwn(changes, "completed")) showToast(changes.completed ? "Subtask completed" : "Subtask marked incomplete");
}

function createSubtaskRow(task, subtask, index) {
  const row = document.createElement("div");
  row.className = `subtask-row ${subtask.completed ? "completed" : ""}`;
  row.draggable = true;
  row.dataset.subtaskId = subtask.id;
  row.innerHTML = `
    <span class="subtask-drag-handle" aria-label="Drag subtask" title="Drag to reorder">⠿</span>
    <input class="subtask-checkbox" type="checkbox" aria-label="Complete ${escapeHtml(subtask.title)}" ${subtask.completed ? "checked" : ""}>
    <span class="subtask-title">${escapeHtml(subtask.title)}</span>
    <div class="subtask-actions">
      <button class="subtask-action subtask-edit" type="button" title="Edit subtask" aria-label="Edit subtask">
        <img src="../assets/edit-regular.svg" alt="edit subtask">
      </button>
      <button class="subtask-action subtask-up" type="button" title="Move up" aria-label="Move subtask up" ${index === 0 ? "disabled" : ""}>
        <img src="../assets/angle-up-regular.svg" alt="move up">
      </button>
      <button class="subtask-action subtask-down" type="button" title="Move down" aria-label="Move subtask down" ${index === task.subtasks.length - 1 ? "disabled" : ""}>
        <img src="../assets/angle-down-regular.svg" alt="move down">
      </button>
      <button class="subtask-action subtask-delete" type="button" title="Delete subtask" aria-label="Delete subtask">
        <img src="../assets/trash-regular.svg" alt="delete subtask">
      </button>
    </div>`;

  row
    .querySelector(".subtask-checkbox")
    .addEventListener("change", (event) =>
      updateSubtask(task, subtask.id, { completed: event.target.checked }),
    );

  row.querySelector(".subtask-edit").addEventListener("click", () => {
    if (row.querySelector(".subtask-inline-edit")) return;

    const titleElement = row.querySelector(".subtask-title");
    const editInput = document.createElement("input");
    editInput.type = "text";
    editInput.className = "subtask-inline-edit";
    editInput.value = subtask.title;
    editInput.setAttribute("aria-label", "Edit subtask title");

    titleElement.replaceWith(editInput);
    editInput.focus();
    editInput.select();

    let editingFinished = false;

    function finishEditing(saveChanges = true) {
      if (editingFinished) return;
      editingFinished = true;

      const updatedTitle = editInput.value.trim();

      if (saveChanges && updatedTitle) {
        if (updatedTitle !== subtask.title) {
          subtask.title = updatedTitle;
          saveTasks();
        }

        renderTasks();
        return;
      }

      // Restore the original title if editing is cancelled or left empty.
      editInput.replaceWith(titleElement);
    }

    editInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        editInput.blur();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        finishEditing(false);
      }
    });

    editInput.addEventListener("blur", () => finishEditing());
  });

  row.querySelector(".subtask-delete").addEventListener("click", () => {
    task.subtasks = task.subtasks.filter((item) => item.id !== subtask.id);
    saveTasks();
    renderTasks();
    // showToast("Subtask deleted successfully");
  });

  row.querySelector(".subtask-up").addEventListener("click", () => {
    if (moveItem(task.subtasks, subtask.id, -1)) {
      saveTasks();
      renderTasks();
    }
  });

  row.querySelector(".subtask-down").addEventListener("click", () => {
    if (moveItem(task.subtasks, subtask.id, 1)) {
      saveTasks();
      renderTasks();
    }
  });

  row.addEventListener("dragstart", (event) => {
    draggedSubtaskId = subtask.id;
    draggedSubtaskTaskId = task.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(subtask.id));
    row.classList.add("dragging");
  });
  row.addEventListener("dragend", () => row.classList.remove("dragging"));
  row.addEventListener("dragover", (event) => {
    if (draggedSubtaskTaskId === task.id && draggedSubtaskId !== subtask.id)
      event.preventDefault();
  });
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    if (draggedSubtaskTaskId !== task.id || draggedSubtaskId === subtask.id)
      return;
    const from = task.subtasks.findIndex(
      (item) => item.id === draggedSubtaskId,
    );
    const to = task.subtasks.findIndex((item) => item.id === subtask.id);
    if (from < 0 || to < 0) return;
    const [moving] = task.subtasks.splice(from, 1);
    task.subtasks.splice(to, 0, moving);
    draggedSubtaskId = null;
    draggedSubtaskTaskId = null;
    expandedTaskIds.add(task.id);
    saveTasks();
    renderTasks();
    // showToast("Subtask order updated");
  });
  return row;
}

function createTaskCard(task) {
  task.subtasks = task.subtasks || [];

  const card = document.createElement("article");
  card.className = "task-card";
  card.dataset.id = task.id;
  card.draggable = false;
  const expanded = expandedTaskIds.has(task.id);
  const doneCount = task.subtasks.filter((item) => item.completed).length;
  card.innerHTML = `
    <button class="drag-handle" type="button" title="Drag task to reorder" aria-label="Drag task">⠿</button>
    <div class="task-card-top">
      <div class="task-main">
        <h3 class="task-title">${escapeHtml(task.title)}</h3>
        <p class="task-description">${escapeHtml(task.description || "No description")}</p>
        <div class="task-meta">
          <span class="badge priority-${escapeHtml(task.priority)}"><img src="../assets/flag1-icon.svg" alt="" class="inline-icon"> ${capitalize(task.priority)}</span>
          <span class="badge date-badge"><img src="../assets/calendar-icon.svg" alt="" class="inline-icon"> ${formatDate(task.dueDate)}</span>
        </div>
      </div>
      <div class="task-actions-right">
        <button class="icon-button move-task-up" type="button" title="Move task up" aria-label="Move task up" ${tasks.indexOf(task) === 0 ? "disabled" : ""}>
          <img src="../assets/angle-up-regular.svg" alt="move up">
        </button>
        <button class="icon-button move-task-down" type="button" title="Move task down" aria-label="Move task down" ${tasks.indexOf(task) === tasks.length - 1 ? "disabled" : ""}>
          <img src="../assets/angle-down-regular.svg" alt="move down">
        </button>
        <button class="icon-button edit-button" type="button" title="Edit task" aria-label="Edit task">
          <img src="../assets/edit-regular.svg" alt="edit task">
        </button>
        <button class="icon-button delete-icon delete-button-small" type="button" title="Delete task" aria-label="Delete task">
          <img src="../assets/trash-regular.svg" alt="delete task">
        </button>
        
      </div>
    </div>
    <div class="status-row"><label for="status-${escapeHtml(task.id)}">Status</label>
      <select id="status-${escapeHtml(task.id)}" class="status-select task-status-change">
        <option value="active" ${task.status === "active" ? "selected" : ""}>Active</option>
        <option value="in-progress" ${task.status === "in-progress" ? "selected" : ""}>In progress</option>
        <option value="stalled" ${task.status === "stalled" ? "selected" : ""}>Stalled</option>
        <option value="completed" ${task.status === "completed" ? "selected" : ""}>Completed</option>
      </select>
    </div>
    <button class="subtask-toggle" type="button" aria-expanded="${expanded}"><img src="../assets/dropdown_icon.svg" alt="" class="toggle-icon ${expanded ? "expanded" : ""}"> Subtasks (${task.subtasks.length}) <span class="subtask-progress">${doneCount}/${task.subtasks.length}</span></button>
    <div class="subtask-area" ${expanded ? "" : "hidden"}>
      <div class="subtask-input-row"><input class="subtask-input" type="text" placeholder="Add subtask" aria-label="New subtask"><button class="subtask-add-button" type="button" aria-label="Add subtask">+</button></div>
      <div class="subtask-list"></div>
    </div>`;

  const subtaskArea = card.querySelector(".subtask-area");
  const subtaskToggle = card.querySelector(".subtask-toggle");
  const subtaskList = card.querySelector(".subtask-list");
  task.subtasks.forEach((subtask, index) =>
    subtaskList.appendChild(createSubtaskRow(task, subtask, index)),
  );
  card
    .querySelector(".edit-button")
    .addEventListener("click", () => openEditModal(task));
  card
    .querySelector(".delete-button-small")
    .addEventListener("click", () => openDeleteModal(task));
  card
    .querySelector(".move-task-up")
    .addEventListener("click", () => moveTask(task.id, -1));
  card
    .querySelector(".move-task-down")
    .addEventListener("click", () => moveTask(task.id, 1));
  card
    .querySelector(".task-status-change")
    .addEventListener("change", (event) =>
      changeTaskStatus(task.id, event.target.value),
    );
  subtaskToggle.addEventListener("click", () => {
    if (expandedTaskIds.has(task.id)) expandedTaskIds.delete(task.id);
    else expandedTaskIds.add(task.id);
    localStorage.setItem(
      "expandedTaskIds",
      JSON.stringify([...expandedTaskIds]),
    );
    renderTasks();
  });
  const subtaskInput = card.querySelector(".subtask-input");
  const addButton = card.querySelector(".subtask-add-button");
  addButton.addEventListener("click", () => addSubtask(task, subtaskInput));
  subtaskInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addSubtask(task, subtaskInput);
    }
  });

  /* Dragging a task moves it in the main list; dropping is handled by the target card. */

  const dragHandle = card.querySelector(".drag-handle");
  dragHandle.draggable = true;

  dragHandle.addEventListener("dragstart", (event) => {
    event.stopPropagation();

    draggedTaskId = task.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(task.id));

    card.classList.add("dragging");
  });

  dragHandle.addEventListener("dragend", () => {
    draggedTaskId = null;
    card.classList.remove("dragging");

    // Remove the highlight after dragging finishes.
    document
      .querySelectorAll(".task-card.drop-target-before")
      .forEach((item) => {
        item.classList.remove("drop-target-before");
      });
  });

  card.addEventListener("dragover", (event) => {
    if (draggedTaskId === null || draggedTaskId === task.id) return;

    // Allow the dragged task to be dropped here.
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    // Remove the highlight from the previous target.
    document
      .querySelectorAll(".task-card.drop-target-before")
      .forEach((item) => {
        item.classList.remove("drop-target-before");
      });

    // Show the primary-color line above the current target.
    card.classList.add("drop-target-before");
  });

  card.addEventListener("dragleave", (event) => {
    // Keep the highlight when moving between elements inside this card.
    if (card.contains(event.relatedTarget)) return;
    card.classList.remove("drop-target-before");
  });

  card.addEventListener("drop", (event) => {
    if (draggedTaskId === null || draggedTaskId === task.id) return;
    event.preventDefault();
    const from = tasks.findIndex((item) => item.id === draggedTaskId);
    const to = tasks.findIndex((item) => item.id === task.id);
    card.classList.remove("drop-target-before");

    if (from < 0 || to < 0) return;

    // Remove the task from its old position.
    const [movingTask] = tasks.splice(from, 1);

    // Insert it above the selected target task.
    tasks.splice(to, 0, movingTask);

    draggedTaskId = null;
    sortSelect.value = "";

    saveTasks();
    renderTasks();
    showToast("Task order updated");
  });
  return card;
}

function renderTasks() {
  const visibleTasks = getVisibleTasks();
  taskList.replaceChildren();
  if (!visibleTasks.length) {
    taskList.appendChild(emptyState);
    emptyState.style.display = "flex";
    return;
  }
  emptyState.style.display = "none";
  visibleTasks.forEach((task) => taskList.appendChild(createTaskCard(task)));
}

function resetFilters() {
  searchInput.value = "";
  statusFilter.value = "all";
  priorityFilter.value = "all";
  renderTasks();
  showToast("Filters cleared");
}

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

addTaskButton.addEventListener("click", openAddModal);
closeModalButton.addEventListener("click", closeTaskModal);
cancelModalButton.addEventListener("click", closeTaskModal);
taskForm.addEventListener("submit", saveTask);
closeDeleteButton.addEventListener("click", closeDeleteModal);
cancelDeleteButton.addEventListener("click", closeDeleteModal);
confirmDeleteButton.addEventListener("click", deleteTask);
searchInput.addEventListener("input", renderTasks);
statusFilter.addEventListener("change", renderTasks);
priorityFilter.addEventListener("change", renderTasks);
sortSelect.addEventListener("change", renderTasks);
themeButton.addEventListener("click", toggleTheme);

taskModal.addEventListener("click", (event) => {
  if (event.target === taskModal) closeTaskModal();
});
deleteModal.addEventListener("click", (event) => {
  if (event.target === deleteModal) closeDeleteModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTaskModal();
    closeDeleteModal();
  }
});

/* Keep the clear-filter button working whether it is in the HTML or added here. */
const filterLeft = document.querySelector(".filter-left");
let clearFiltersButton = document.getElementById("clear-filters-button");
if (!clearFiltersButton && filterLeft) {
  clearFiltersButton = document.createElement("button");
  clearFiltersButton.id = "clear-filters-button";
  clearFiltersButton.className = "clear-filters-button";
  clearFiltersButton.type = "button";
  clearFiltersButton.textContent = "Clear filters";
  filterLeft.appendChild(clearFiltersButton);
}
if (clearFiltersButton)
  clearFiltersButton.addEventListener("click", resetFilters);

// Listen for global history undo/redo updates to refresh the UI


loadTheme();
renderTasks();


window.addEventListener("app-data-changed", () => {
  // Re-read data array variables from storage following history shifts
  tasks = JSON.parse(localStorage.getItem("tasks") || "[]");
  renderTasks();
  console.log("Tasks view updated via history rollback.");
});
