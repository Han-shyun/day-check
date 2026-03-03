import { bucketApi } from './api.js';
import { bucketModel, normalizeBucketLabel, sanitizeBucketId } from './model.js';
import { createBucketUi } from './ui.js';
import { state, runtime } from '../../core/app-context.js';
import { buckets, defaultBucketLabels } from '../../core/constants.js';
import {
  ensureProjectLaneIntegrity,
  normalizeBucketIdOrDefault,
  normalizeBucketOrder,
  normalizeBucketVisibility,
  normalizeProjectLaneName,
} from '../../state/index.js';
import { addProjectColumnBtn, bucketSelect, boardEl, removeProjectColumnBtn } from '../../core/dom-refs.js';

let _deps = {
  addProjectLane: () => {},
  addNextHiddenBucket: () => '',
  beginEditLaneName: () => {},
  canRemoveBucketFromMenu: () => false,
  closeBucketActionMenus: () => {},
  createBucketColumn: () => null,
  ensureActiveBucketMenu: () => false,
  ensureBucketActionMenu: () => null,
  ensureBucketColumns: () => {},
  ensureBucketSelectOptions: () => {},
  applyBucketLabels: () => {},
  applyBucketOrder: () => {},
  applyBucketSizes: () => {},
  applyBucketVisibility: () => {},
  applyProjectLaneSizes: () => {},
  getActiveBucketCount: () => 0,
  getBucketLabel: () => '',
  getProjectLaneName: () => '',
  getTodoGroupLabel: () => '',
  removeBucket: () => false,
  render: () => {},
  renderProjectLaneColumns: () => {},
  registerBucketDragControls: () => {},
  registerBucketLaneControls: () => {},
  registerBucketMenuHandlers: () => {},
  registerBucketResizeObserver: () => {},
  registerBucketTitleEditors: () => {},
  registerProjectColumnControls: () => {},
  renderProjectLaneGroups: () => {},
  renderProjectLaneOptions: () => {},
  removeProjectLane: () => false,
  renderTodoItems: () => {},
  queueSync: () => {},
  sanitizeBucketLabel: () => '',
  setBucketCount: () => false,
  showToast: () => {},
  sortTodos: (list) => list,
  syncBucketActionMenus: () => {},
  syncBucketOrderFromDom: () => {},
};

export function initBucketDeps({
  addProjectLane,
  addNextHiddenBucket,
  beginEditLaneName,
  canRemoveBucketFromMenu,
  closeBucketActionMenus,
  createBucketColumn,
  ensureBucketActionMenu,
  ensureBucketColumns,
  ensureBucketSelectOptions,
  applyBucketLabels,
  applyBucketOrder,
  applyBucketVisibility,
  applyBucketSizes,
  applyProjectLaneSizes,
  getActiveBucketCount,
  getBucketLabel,
  getProjectLaneName,
  getTodoGroupLabel,
  removeBucket,
  render,
  renderProjectLaneColumns,
  renderProjectLaneOptions,
  registerBucketDragControls,
  registerBucketLaneControls,
  registerBucketMenuHandlers,
  registerBucketResizeObserver,
  registerBucketTitleEditors,
  registerProjectColumnControls,
  renderProjectLaneGroups,
  removeProjectLane,
  syncBucketActionMenus,
  queueSync,
  renderTodoItems,
  setBucketCount,
  showToast,
  sortTodos,
  syncBucketOrderFromDom,
}) {
  if (typeof addProjectLane === 'function') {
    _deps.addProjectLane = addProjectLane;
  }
  if (typeof addNextHiddenBucket === 'function') {
    _deps.addNextHiddenBucket = addNextHiddenBucket;
  }
  if (typeof beginEditLaneName === 'function') {
    _deps.beginEditLaneName = beginEditLaneName;
  }
  if (typeof canRemoveBucketFromMenu === 'function') {
    _deps.canRemoveBucketFromMenu = canRemoveBucketFromMenu;
  }
  if (typeof closeBucketActionMenus === 'function') {
    _deps.closeBucketActionMenus = closeBucketActionMenus;
  }
  if (typeof createBucketColumn === 'function') {
    _deps.createBucketColumn = createBucketColumn;
  }
  if (typeof ensureBucketActionMenu === 'function') {
    _deps.ensureBucketActionMenu = ensureBucketActionMenu;
  }
  if (typeof ensureBucketColumns === 'function') {
    _deps.ensureBucketColumns = ensureBucketColumns;
  }
  if (typeof ensureBucketSelectOptions === 'function') {
    _deps.ensureBucketSelectOptions = ensureBucketSelectOptions;
  }
  if (typeof applyBucketLabels === 'function') {
    _deps.applyBucketLabels = applyBucketLabels;
  }
  if (typeof applyBucketOrder === 'function') {
    _deps.applyBucketOrder = applyBucketOrder;
  }
  if (typeof applyBucketVisibility === 'function') {
    _deps.applyBucketVisibility = applyBucketVisibility;
  }
  if (typeof applyBucketSizes === 'function') {
    _deps.applyBucketSizes = applyBucketSizes;
  }
  if (typeof applyProjectLaneSizes === 'function') {
    _deps.applyProjectLaneSizes = applyProjectLaneSizes;
  }
  if (typeof getActiveBucketCount === 'function') {
    _deps.getActiveBucketCount = getActiveBucketCount;
  }
  if (typeof getBucketLabel === 'function') {
    _deps.getBucketLabel = getBucketLabel;
  }
  if (typeof getProjectLaneName === 'function') {
    _deps.getProjectLaneName = getProjectLaneName;
  }
  if (typeof getTodoGroupLabel === 'function') {
    _deps.getTodoGroupLabel = getTodoGroupLabel;
  }
  if (typeof removeBucket === 'function') {
    _deps.removeBucket = removeBucket;
  }
  if (typeof render === 'function') {
    _deps.render = render;
  }
  if (typeof renderProjectLaneColumns === 'function') {
    _deps.renderProjectLaneColumns = renderProjectLaneColumns;
  }
  if (typeof renderProjectLaneOptions === 'function') {
    _deps.renderProjectLaneOptions = renderProjectLaneOptions;
  }
  if (typeof registerBucketDragControls === 'function') {
    _deps.registerBucketDragControls = registerBucketDragControls;
  }
  if (typeof registerBucketLaneControls === 'function') {
    _deps.registerBucketLaneControls = registerBucketLaneControls;
  }
  if (typeof registerBucketMenuHandlers === 'function') {
    _deps.registerBucketMenuHandlers = registerBucketMenuHandlers;
  }
  if (typeof registerBucketResizeObserver === 'function') {
    _deps.registerBucketResizeObserver = registerBucketResizeObserver;
  }
  if (typeof registerBucketTitleEditors === 'function') {
    _deps.registerBucketTitleEditors = registerBucketTitleEditors;
  }
  if (typeof registerProjectColumnControls === 'function') {
    _deps.registerProjectColumnControls = registerProjectColumnControls;
  }
  if (typeof renderProjectLaneGroups === 'function') {
    _deps.renderProjectLaneGroups = renderProjectLaneGroups;
  }
  if (typeof removeProjectLane === 'function') {
    _deps.removeProjectLane = removeProjectLane;
  }
  if (typeof syncBucketActionMenus === 'function') {
    _deps.syncBucketActionMenus = syncBucketActionMenus;
  }
  if (typeof queueSync === 'function') {
    _deps.queueSync = queueSync;
  }
  if (typeof renderTodoItems === 'function') {
    _deps.renderTodoItems = renderTodoItems;
  }
  if (typeof setBucketCount === 'function') {
    _deps.setBucketCount = setBucketCount;
  }
  if (typeof showToast === 'function') {
    _deps.showToast = showToast;
  }
  if (typeof sortTodos === 'function') {
    _deps.sortTodos = sortTodos;
  }
  if (typeof syncBucketOrderFromDom === 'function') {
    _deps.syncBucketOrderFromDom = syncBucketOrderFromDom;
  }
}

export const bucketUi = {
  create: createBucketUi,
};

function addProjectLane(rawName, bucket = 'bucket2') {
  if (!buckets.includes(bucket)) {
    return false;
  }
  const name = normalizeProjectLaneName(rawName);
  if (!name) {
    return false;
  }

  const duplicated = state.projectLanes.some(
    (lane) => lane.bucket === bucket && lane.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicated) {
    return false;
  }

  state.projectLanes.push({
    id: crypto.randomUUID(),
    name,
    bucket,
    width: 0,
    height: 0,
  });
  ensureProjectLaneIntegrity();
  return true;
}

function getProjectLaneName(projectLaneId) {
  const lane = state.projectLanes.find((item) => item.id === projectLaneId);
  return lane ? lane.name : '';
}

function getTodoGroupLabel(todo) {
  if (!todo) {
    return '';
  }
  const bucket = getBucketLabel(normalizeBucketIdOrDefault(todo.bucket, 'bucket4'));
  const lane = getProjectLaneName(todo.projectLaneId || '');
  return lane ? `${bucket}/${lane}` : `${bucket}/unassigned`;
}

function getActiveBucketCount() {
  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  return buckets.filter((bucket) => visibility[bucket] !== false).length;
}

function setBucketCount(targetCount) {
  const count = Math.max(1, Math.min(buckets.length, Number(targetCount) || 1));
  const order = normalizeBucketOrder(state.bucketOrder);
  const nextVisibility = normalizeBucketVisibility(state.bucketVisibility);
  const activeBuckets = order.slice(0, count);
  const activeSet = new Set(activeBuckets);
  const fallback = activeBuckets[0] || order[0] || buckets[0];

  buckets.forEach((bucket) => {
    nextVisibility[bucket] = activeSet.has(bucket);
  });
  state.bucketVisibility = nextVisibility;

  state.todos = state.todos.map((todo) => {
    if (activeSet.has(todo.bucket)) {
      return todo;
    }
    return {
      ...todo,
      bucket: fallback,
      projectLaneId: '',
    };
  });

  ensureProjectLaneIntegrity();
}

function removeBucket(bucket) {
  if (!buckets.includes(bucket)) {
    return false;
  }

  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  const active = buckets.filter((key) => visibility[key] !== false);
  if (!active.includes(bucket)) {
    return false;
  }
  if (active.length <= 1) {
    return false;
  }

  visibility[bucket] = false;
  state.bucketVisibility = visibility;
  return true;
}

function addNextHiddenBucket() {
  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  const order = normalizeBucketOrder(state.bucketOrder);
  const hidden = order.find((bucket) => visibility[bucket] === false);
  if (!hidden) {
    return '';
  }

  visibility[hidden] = true;
  state.bucketVisibility = visibility;
  return hidden;
}

function createBucketColumn(bucket) {
  const article = document.createElement('article');
  article.className = 'card column';
  article.dataset.bucket = bucket;

  const head = document.createElement('div');
  head.className = 'column-head';

  const dragHandle = document.createElement('button');
  dragHandle.type = 'button';
  dragHandle.className = 'column-drag-handle';
  dragHandle.setAttribute('aria-label', 'Move Bucket');
  dragHandle.textContent = '::';
  head.appendChild(dragHandle);

  const title = document.createElement('h2');
  title.id = `bucket-title-${bucket}`;
  title.className = 'bucket-title';
  title.setAttribute('contenteditable', 'true');
  title.setAttribute('role', 'textbox');
  title.dataset.bucket = bucket;
  title.textContent = getBucketLabel(bucket);
  head.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'column-head-actions';

  const count = document.createElement('span');
  count.className = 'count';
  count.id = `count-${bucket}`;
  count.textContent = '0';
  actions.appendChild(count);

  head.appendChild(actions);
  article.appendChild(head);

  const list = document.createElement('ul');
  list.id = `list-${bucket}`;
  list.className = 'todo-list';
  article.appendChild(list);

  return article;
}

function ensureBucketColumns() {
  if (!boardEl) {
    return;
  }
  buckets.forEach((bucket) => {
    const exists = boardEl.querySelector(`.column[data-bucket="${bucket}"]`);
    if (exists) {
      return;
    }
    boardEl.appendChild(createBucketColumn(bucket));
  });
}

function ensureBucketSelectOptions() {
  if (!bucketSelect) {
    return;
  }

  buckets.forEach((bucket) => {
    const exists = bucketSelect.querySelector(`option[value="${bucket}"]`);
    if (exists) {
      return;
    }
    const option = document.createElement('option');
    option.value = bucket;
    option.textContent = getBucketLabel(bucket);
    bucketSelect.appendChild(option);
  });
}

function getBucketLabel(bucket) {
  return state.bucketLabels?.[bucket] || defaultBucketLabels[bucket] || bucket;
}

function applyBucketLabels() {
  buckets.forEach((bucket) => {
    const label = getBucketLabel(bucket);
    const titleEl = document.getElementById(`bucket-title-${bucket}`);
    const optionEl = bucketSelect ? bucketSelect.querySelector(`option[value="${bucket}"]`) : null;

    if (titleEl) {
      titleEl.textContent = label;
    }
    if (optionEl) {
      optionEl.textContent = label;
    }
  });
}

function applyBucketOrder() {
  if (!boardEl) {
    return;
  }

  const order = normalizeBucketOrder(state.bucketOrder);
  state.bucketOrder = order;

  order.forEach((bucket, index) => {
    const column = boardEl.querySelector(`.column[data-bucket="${bucket}"]`);
    if (!column) {
      return;
    }

    boardEl.appendChild(column);
  });
}

function applyBucketVisibility() {
  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  if (!buckets.some((bucket) => visibility[bucket] !== false)) {
    visibility[normalizeBucketOrder(state.bucketOrder)[0] || buckets[0]] = true;
  }
  state.bucketVisibility = visibility;

  if (boardEl) {
    boardEl.style.removeProperty('--board-rows');
  }

  buckets.forEach((bucket) => {
    const visible = visibility[bucket] !== false;
    const column = boardEl ? boardEl.querySelector(`.column[data-bucket="${bucket}"]`) : null;
    const option = bucketSelect ? bucketSelect.querySelector(`option[value="${bucket}"]`) : null;

    if (column) {
      column.hidden = !visible;
    }

    if (option) {
      option.disabled = !visible;
      option.hidden = !visible;
    }
  });

  if (bucketSelect && bucketSelect.selectedOptions[0]?.disabled) {
    const firstVisible = buckets.find((bucket) => visibility[bucket] !== false) || 'bucket4';
    bucketSelect.value = firstVisible;
  }
}

function applyBucketSizes() {
  buckets.forEach((bucket) => {
    const column = boardEl ? boardEl.querySelector(`.column[data-bucket="${bucket}"]`) : null;
    if (!column) {
      return;
    }

    column.style.width = '';
    column.style.height = '';
  });
}

function applyProjectLaneSizes() {
  // Keep bucket UI order, visibility, and drag/drop size state synchronized.
}

function syncBucketOrderFromDom() {
  if (!boardEl) {
    return;
  }

  const columns = Array.from(boardEl.querySelectorAll('.column[data-bucket]'));
  const nextOrder = columns.map((column) => column.dataset.bucket).filter((bucket) => buckets.includes(bucket));

  state.bucketOrder = normalizeBucketOrder(nextOrder);
}

function registerBucketResizeObserver() {
  if (runtime.columnResizeObserver) {
    runtime.columnResizeObserver.disconnect();
    runtime.columnResizeObserver = null;
  }
}

function renderProjectLaneColumns() {
  if (!boardEl) {
    return;
  }

  boardEl.querySelectorAll('.column[data-project-lane-id]').forEach((column) => {
    if (runtime.columnResizeObserver) {
      runtime.columnResizeObserver.unobserve(column);
    }
    column.remove();
  });
}

function registerBucketDragControls() {
  if (!boardEl) {
    return;
  }

  let activeColumn = null;
  let activeHandle = null;
  let placeholderEl = null;
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let rafPending = false;
  let onWindowMove = null;
  let onWindowEnd = null;

  const updateDrag = () => {
    rafPending = false;

    if (!activeColumn) {
      return;
    }

    activeColumn.style.left = `${Math.round(lastPointerX - pointerOffsetX)}px`;
    activeColumn.style.top = `${Math.round(lastPointerY - pointerOffsetY)}px`;

    const others = Array.from(
      boardEl.querySelectorAll('.column[data-bucket], .column[data-project-lane-id], .column-placeholder'),
    ).filter(
      (col) => col !== placeholderEl && !col.hidden,
    );
    const target = others.find(
      (col) => lastPointerX < col.getBoundingClientRect().left + col.getBoundingClientRect().width / 2,
    );

    if (target) {
      boardEl.insertBefore(placeholderEl, target);
    } else {
      boardEl.appendChild(placeholderEl);
    }
  };

  const onPointerMove = (event) => {
    if (!activeColumn) {
      return;
    }

    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    if (!rafPending) {
      rafPending = true;
      window.requestAnimationFrame(updateDrag);
    }
  };

  const finishDrag = () => {
    if (!activeColumn) {
      return;
    }

    if (rafPending) {
      rafPending = false;
      updateDrag();
    }

    activeColumn.style.position = '';
    activeColumn.style.width = '';
    activeColumn.style.height = '';
    activeColumn.style.left = '';
    activeColumn.style.top = '';
    activeColumn.style.zIndex = '';
    activeColumn.style.pointerEvents = '';
    activeColumn.style.margin = '';
    activeColumn.classList.remove('is-dragging');

    if (placeholderEl && placeholderEl.parentNode) {
      placeholderEl.parentNode.insertBefore(activeColumn, placeholderEl);
      placeholderEl.remove();
    } else {
      boardEl.appendChild(activeColumn);
    }

    if (activeHandle) {
      activeHandle.classList.remove('is-grabbing');
    }

    if (onWindowMove) {
      window.removeEventListener('pointermove', onWindowMove);
    }
    if (onWindowEnd) {
      window.removeEventListener('pointerup', onWindowEnd);
      window.removeEventListener('pointercancel', onWindowEnd);
    }

    syncBucketOrderFromDom();
    applyBucketOrder();
    renderProjectLaneColumns();
    applyBucketSizes();
    applyProjectLaneSizes();
    applyBucketVisibility();
    _deps.queueSync();

    activeColumn = null;
    activeHandle = null;
    placeholderEl = null;
    pointerOffsetX = 0;
    pointerOffsetY = 0;
    lastPointerX = 0;
    lastPointerY = 0;
    rafPending = false;
    onWindowMove = null;
    onWindowEnd = null;
  };

  boardEl.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.column-drag-handle');
    if (!handle) {
      return;
    }

    const column = handle.closest('.column[data-bucket], .column[data-project-lane-id]');
    if (!column || column.hidden) {
      return;
    }

    event.preventDefault();

    const rect = column.getBoundingClientRect();
    activeColumn = column;
    activeHandle = handle;
    pointerOffsetX = event.clientX - rect.left;
    pointerOffsetY = event.clientY - rect.top;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    placeholderEl = document.createElement('div');
    placeholderEl.className = 'column-placeholder';
    placeholderEl.style.width = `${Math.round(rect.width)}px`;
    placeholderEl.style.height = `${Math.round(rect.height)}px`;
    boardEl.insertBefore(placeholderEl, column.nextSibling);

    activeColumn.classList.add('is-dragging');
    activeHandle.classList.add('is-grabbing');
    activeColumn.style.position = 'fixed';
    activeColumn.style.width = `${Math.round(rect.width)}px`;
    activeColumn.style.height = `${Math.round(rect.height)}px`;
    activeColumn.style.left = `${Math.round(rect.left)}px`;
    activeColumn.style.top = `${Math.round(rect.top)}px`;
    activeColumn.style.zIndex = '30';
    activeColumn.style.pointerEvents = 'none';
    activeColumn.style.margin = '0';
    document.body.appendChild(activeColumn);

    onWindowMove = onPointerMove;
    onWindowEnd = finishDrag;
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowEnd);
    window.addEventListener('pointercancel', onWindowEnd);
  });
}

function registerProjectColumnControls() {
  if (addProjectColumnBtn) {
    addProjectColumnBtn.setAttribute('aria-label', 'Add Bucket');
    addProjectColumnBtn.setAttribute('aria-pressed', 'false');
    addProjectColumnBtn.addEventListener('click', () => {
      const bucket = addNextHiddenBucket();
      if (!bucket) {
        _deps.showToast('No hidden bucket is available to add.', 'error');
        return;
      }

      addProjectColumnBtn.classList.add('is-active');
      addProjectColumnBtn.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        addProjectColumnBtn.classList.remove('is-active');
        addProjectColumnBtn.setAttribute('aria-pressed', 'false');
      }, 120);

      _deps.showToast(`${getBucketLabel(bucket)} bucket added`, 'success');
      _deps.render();
      _deps.queueSync();
    });
  }

  if (removeProjectColumnBtn) {
    removeProjectColumnBtn.setAttribute('aria-label', 'Remove Bucket');
    removeProjectColumnBtn.setAttribute('aria-pressed', 'false');
    removeProjectColumnBtn.addEventListener('click', () => {
      const visibility = normalizeBucketVisibility(state.bucketVisibility);
      const order = normalizeBucketOrder(state.bucketOrder);
      const active = order.filter((bucket) => visibility[bucket] !== false);
      const target = active[active.length - 1];
      if (!target || !removeBucket(target)) {
        _deps.showToast('At least one bucket must remain.', 'error');
        return;
      }

      removeProjectColumnBtn.classList.add('is-active');
      removeProjectColumnBtn.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        removeProjectColumnBtn.classList.remove('is-active');
        removeProjectColumnBtn.setAttribute('aria-pressed', 'false');
      }, 120);

      _deps.showToast(`${getBucketLabel(target)} bucket removed`, 'success');
      _deps.render();
      _deps.queueSync();
    });
  }
}

function registerBucketLaneControls() {
  document.querySelectorAll('.column[data-bucket]').forEach((column) => {
    const bucket = column.dataset.bucket;
    const actions = column.querySelector('.column-head-actions');
    if (!bucket || !actions || actions.querySelector('.bucket-lane-add-btn')) {
      return;
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'column-remove-btn bucket-lane-add-btn bucket-header-action';
    addBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} Add Subproject`);
    addBtn.setAttribute('aria-expanded', 'false');
    addBtn.setAttribute('aria-pressed', 'false');
    addBtn.textContent = '+';
    const laneCreate = document.createElement('div');
    laneCreate.className = 'inline-lane-create hidden bucket-lane-create';
    const laneNameInput = document.createElement('input');
    laneNameInput.type = 'text';
    laneNameInput.maxLength = '30';
    laneNameInput.placeholder = 'Subproject name';
    laneNameInput.setAttribute('aria-label', `${getBucketLabel(bucket)} Subproject Name`);
    const laneCreateBtn = document.createElement('button');
    laneCreateBtn.type = 'button';
    laneCreateBtn.className = 'column-remove-btn lane-create-submit-btn';
    laneCreateBtn.textContent = 'Add';
    const laneCancelBtn = document.createElement('button');
    laneCancelBtn.type = 'button';
    laneCancelBtn.className = 'column-remove-btn lane-create-cancel-btn';
    laneCancelBtn.textContent = 'Cancel';
    laneCancelBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} Cancel subproject creation`);
    laneCreate.append(laneNameInput, laneCreateBtn, laneCancelBtn);

    const showLaneCreate = () => {
      laneCreate.classList.remove('hidden');
      addBtn.classList.add('is-active');
      addBtn.textContent = 'Cancel';
      addBtn.setAttribute('aria-expanded', 'true');
      addBtn.setAttribute('aria-pressed', 'true');
      addBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} Close Subproject form`);
      laneNameInput.value = '';
      laneNameInput.focus();
    };
    const hideLaneCreate = () => {
      laneCreate.classList.add('hidden');
      addBtn.classList.remove('is-active');
      addBtn.textContent = '+';
      addBtn.setAttribute('aria-expanded', 'false');
      addBtn.setAttribute('aria-pressed', 'false');
      addBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} Add Subproject`);
      laneNameInput.value = '';
    };
    const submitLaneCreate = () => {
      if (!addProjectLane(laneNameInput.value, bucket)) {
        _deps.showToast('Failed to add project lane: empty or too long name', 'error');
        laneNameInput.focus();
        return;
      }
      _deps.showToast(`${getBucketLabel(bucket)} subproject added`, 'success');
      hideLaneCreate();
      _deps.render();
      _deps.queueSync();
    };

    addBtn.addEventListener('click', () => {
      if (laneCreate.classList.contains('hidden')) {
        showLaneCreate();
      } else {
        hideLaneCreate();
      }
    });
    laneCreateBtn.addEventListener('click', submitLaneCreate);
    laneCancelBtn.addEventListener('click', hideLaneCreate);
    laneNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitLaneCreate();
      }
      if (event.key === 'Escape') {
        hideLaneCreate();
      }
    });
    actions.insertBefore(laneCreate, actions.firstChild);
    actions.insertBefore(addBtn, actions.firstChild);
  });
}

function closeBucketActionMenus({ restoreFocus = false } = {}) {
  document.querySelectorAll('.bucket-action-menu-list').forEach((menuList) => {
    menuList.hidden = true;
  });
  document.querySelectorAll('.bucket-action-menu-toggle').forEach((toggleBtn) => {
    toggleBtn.setAttribute('aria-expanded', 'false');
  });

  if (restoreFocus && runtime.activeBucketMenuButton?.focus) {
    runtime.activeBucketMenuButton.focus();
  }
  runtime.activeBucketMenuButton = null;
}

function registerBucketMenuHandlers() {
  if (runtime.bucketMenuHandlersRegistered || typeof document === 'undefined') {
    return;
  }

  runtime.bucketMenuHandlersRegistered = true;
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.closest('.bucket-action-menu')) {
      return;
    }
    closeBucketActionMenus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeBucketActionMenus({ restoreFocus: true });
    }
  });
}

function canRemoveBucketFromMenu(bucket) {
  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  const active = buckets.filter((key) => visibility[key] !== false);
  return active.includes(bucket) && active.length > 1;
}

function ensureBucketActionMenu(column) {
  if (!column) {
    return;
  }

  const bucket = column.dataset.bucket || '';
  const actions = column.querySelector('.column-head-actions');
  if (!bucket || !actions) {
    return;
  }

  let menu = actions.querySelector('.bucket-action-menu');
  let toggleBtn = menu?.querySelector('.bucket-action-menu-toggle') || null;
  let menuList = menu?.querySelector('.bucket-action-menu-list') || null;

  if (!menu || !toggleBtn || !menuList) {
    menu = document.createElement('div');
    menu.className = 'bucket-action-menu';

    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'ghost-btn bucket-action-menu-toggle';
    toggleBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} Bucket actions menu`);
    toggleBtn.setAttribute('aria-haspopup', 'menu');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.textContent = '...';

    menuList = document.createElement('div');
    menuList.className = 'bucket-action-menu-list';
    menuList.setAttribute('role', 'menu');
    menuList.hidden = true;

    toggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = toggleBtn.getAttribute('aria-expanded') !== 'true';
      closeBucketActionMenus();
      if (!willOpen) {
        return;
      }
      toggleBtn.setAttribute('aria-expanded', 'true');
      menuList.hidden = false;
      runtime.activeBucketMenuButton = toggleBtn;
      const firstItem = menuList.querySelector('button:not([disabled])');
      firstItem?.focus?.();
    });

    menu.append(toggleBtn, menuList);
    actions.appendChild(menu);
  }

  const appendMenuItem = (label, onClick, disabled = false) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'bucket-action-menu-item';
    item.setAttribute('role', 'menuitem');
    item.textContent = label;
    item.disabled = Boolean(disabled);
    item.addEventListener('click', () => {
      closeBucketActionMenus({ restoreFocus: true });
      onClick();
    });
    menuList.appendChild(item);
  };

  menuList.innerHTML = '';
  const laneAddBtn = actions.querySelector('.bucket-lane-add-btn');
  if (laneAddBtn) {
    appendMenuItem('Add Project Lane', () => laneAddBtn.click(), laneAddBtn.disabled);
  }

  const shareToggleBtn = actions.querySelector('.bucket-share-toggle');
  if (shareToggleBtn) {
    const shareLabel = String(shareToggleBtn.textContent || '').trim() || 'Share Setting';
    appendMenuItem(shareLabel, () => shareToggleBtn.click(), shareToggleBtn.disabled);
  }

  if (canRemoveBucketFromMenu(bucket)) {
    appendMenuItem('Remove Bucket', () => {
      if (!removeBucket(bucket)) {
        _deps.showToast('At least one bucket must remain.', 'error');
        return;
      }
      _deps.showToast(`${getBucketLabel(bucket)} bucket removed`, 'success');
      _deps.render();
      _deps.queueSync();
    });
  }

  menu.hidden = menuList.children.length === 0;
  if (menu.hidden) {
    closeBucketActionMenus();
  }
}

function syncBucketActionMenus() {
  registerBucketMenuHandlers();
  document.querySelectorAll('.column[data-bucket]').forEach((column) => {
    ensureBucketActionMenu(column);
  });
}

function beginEditLaneName(lane, currentNameEl) {
  if (!currentNameEl || !lane) {
    return;
  }

  const originalText = String(lane.name || '');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = '30';
  input.className = 'project-lane-name-editor';
  input.value = originalText;
  input.setAttribute('aria-label', 'Edit project lane name');
  let committed = false;

  const restoreName = () => {
    const restored = document.createElement('strong');
    restored.textContent = lane.name;
    restored.className = 'project-lane-name';
    input.replaceWith(restored);
    return restored;
  };

  const commit = () => {
    const nextName = normalizeProjectLaneName(input.value);
    if (!nextName) {
      _deps.showToast('Project lane rename failed.', 'error');
      restoreName();
      return;
    }

    const duplicated = state.projectLanes.some(
      (item) =>
        item.id !== lane.id &&
        item.bucket === lane.bucket &&
        item.name.toLowerCase() === nextName.toLowerCase(),
    );

    if (duplicated) {
      _deps.showToast('Duplicated lane name.', 'error');
      input.focus();
      input.select();
      return;
    }

    if (nextName === lane.name) {
      committed = true;
      restoreName();
      return;
    }

    lane.name = nextName;
    ensureProjectLaneIntegrity();
    committed = true;
    _deps.render();
    _deps.queueSync();
    _deps.showToast('Project lane updated.', 'success');
  };

  input.addEventListener('blur', () => {
    if (!committed) {
      commit();
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Escape') {
      committed = true;
      input.blur();
      restoreName();
    }
  });

  currentNameEl.replaceWith(input);
  input.focus();
  input.select();
}

function renderProjectLaneOptions(selectEl, todo) {
  if (!selectEl) {
    return;
  }

  const bucket = todo?.bucket || 'bucket4';
  const lanes = state.projectLanes.filter((lane) => lane.bucket === bucket);
  selectEl.innerHTML = '';

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Unassigned';
  if (!todo.projectLaneId) {
    emptyOption.selected = true;
  }
  selectEl.appendChild(emptyOption);

  lanes.forEach((lane) => {
    const option = document.createElement('option');
    option.value = lane.id;
    option.textContent = lane.name;
    if (lane.id === (todo.projectLaneId || '')) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  });

  selectEl.disabled = false;
}

function removeProjectLane(laneId) {
  const target = state.projectLanes.find((lane) => lane.id === laneId);
  if (!target) {
    return false;
  }
  state.projectLanes = state.projectLanes.filter((lane) => lane.id !== laneId);
  state.todos = state.todos.map((todo) => (todo.projectLaneId === laneId ? { ...todo, projectLaneId: '' } : todo));
  state.doneLog = state.doneLog.map((todo) => (todo.projectLaneId === laneId ? { ...todo, projectLaneId: '' } : todo));
  return true;
}

function renderProjectLaneGroups(listEl, todos, bucket) {
  const lanes = state.projectLanes.filter((lane) => lane.bucket === bucket);
  const grouped = new Map(lanes.map((lane) => [lane.id, []]));
  const unassigned = [];

  todos.forEach((todo) => {
    if (todo.projectLaneId && grouped.has(todo.projectLaneId)) {
      grouped.get(todo.projectLaneId).push(todo);
      return;
    }
    unassigned.push(todo);
  });

  lanes.forEach((lane) => {
    const section = document.createElement('li');
    section.className = 'project-lane-group';

    const head = document.createElement('div');
    head.className = 'project-lane-head';

    const name = document.createElement('strong');
    name.textContent = lane.name;
    head.appendChild(name);

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(grouped.get(lane.id).length);
    head.appendChild(count);

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'column-remove-btn';
    renameBtn.textContent = 'Edit';
    renameBtn.addEventListener('click', () => {
      beginEditLaneName(lane, name);
    });
    head.appendChild(renameBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'column-remove-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      removeProjectLane(lane.id);
      ensureProjectLaneIntegrity();
      _deps.showToast('Project lane removed.', 'success');
      _deps.render();
      _deps.queueSync();
    });
    head.appendChild(deleteBtn);

    section.appendChild(head);

    const nested = document.createElement('ul');
    nested.className = 'todo-list';
    renderTodoItems(nested, sortTodos(grouped.get(lane.id)));
    section.appendChild(nested);
    listEl.appendChild(section);
  });

  if (unassigned.length > 0 || lanes.length === 0) {
    const section = document.createElement('li');
    section.className = 'project-lane-group';

    const head = document.createElement('div');
    head.className = 'project-lane-head';

    const name = document.createElement('strong');
    name.textContent = lanes.length === 0 ? getBucketLabel(bucket) : 'Unassigned';
    head.appendChild(name);

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(unassigned.length);
    head.appendChild(count);

    section.appendChild(head);

    const nested = document.createElement('ul');
    nested.className = 'todo-list';
    renderTodoItems(nested, sortTodos(unassigned));
    section.appendChild(nested);
    listEl.appendChild(section);
  }
}

function registerBucketTitleEditors() {
  const titleEls = document.querySelectorAll('.bucket-title');
  titleEls.forEach((titleEl) => {
    const bucket = titleEl.dataset.bucket;
    if (!bucket || !buckets.includes(bucket)) {
      return;
    }

    titleEl.addEventListener('blur', () => {
      const label = getBucketLabelText(titleEl.textContent);
      const current = getBucketLabel(bucket);
      const nextLabel = label || defaultBucketLabels[bucket] || bucket;

      if (nextLabel === current) {
        return;
      }

      state.bucketLabels[bucket] = nextLabel;
      applyBucketLabels();
      _deps.queueSync();
    });

    titleEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        titleEl.blur();
      }
    });
  });
}

function getBucketLabelText(raw) {
  return normalizeBucketLabel(raw);
}

export {
  addProjectLane,
  addNextHiddenBucket,
  beginEditLaneName,
  canRemoveBucketFromMenu,
  closeBucketActionMenus,
  createBucketColumn,
  ensureBucketActionMenu,
  ensureBucketColumns,
  ensureBucketSelectOptions,
  applyBucketLabels,
  applyBucketOrder,
  applyBucketVisibility,
  applyBucketSizes,
  applyProjectLaneSizes,
  getActiveBucketCount,
  getBucketLabel,
  getBucketLabelText,
  getProjectLaneName,
  getTodoGroupLabel,
  removeBucket,
  renderProjectLaneColumns,
  removeProjectLane,
  renderProjectLaneOptions,
  renderProjectLaneGroups,
  registerBucketDragControls,
  registerBucketLaneControls,
  registerBucketMenuHandlers,
  registerBucketResizeObserver,
  registerBucketTitleEditors,
  registerProjectColumnControls,
  setBucketCount,
  syncBucketActionMenus,
  syncBucketOrderFromDom,
  beginEditLaneName as renameProjectLane,
  bucketModel,
  bucketApi,
};
