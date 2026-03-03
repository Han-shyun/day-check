import { createApiRequestError as createCoreApiRequestError } from './core/api-request.js';
import {
  API_BASE,
  API_ERROR_TOAST_COOLDOWN_MS,
  COLLAB_POLL_ACTIVE_INTERVAL_MS_DEFAULT,
  COLLAB_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
  HOLIDAY_CACHE_TTL_MS_DEFAULT,
  STATE_POLL_ACTIVE_INTERVAL_MS_DEFAULT,
  STATE_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
  SYNC_DEBOUNCE_MS,
  defaultBucketLabels,
  defaultBucketVisibility,
  buckets,
} from './core/constants.js';
import { state, runtime, config } from './core/app-context.js';
import {
  initUiDeps,
  showBrokenTextFilteredToast,
  showToast,
  showApiErrorToast,
  registerGlobalErrorBoundary,
  handleFatalError,
} from './core/ui-utils.js';
import {
  ensureHolidayDataForYear,
  initHolidayDeps,
} from './core/holidays.js';
import {
  addSelectedDateNoteBtn,
  authBtn,
  boardEl,
  bucketSelect,
  calendarDateInput,
  calendarForm,
  calendarModeButtons,
  calendarSubmitBtn,
  calendarTextInput,
  calendarTodoDetailInput,
  calendarTodoFields,
  calendarTodoTitleInput,
  cancelProfileBtn,
  collabInviteFormEl,
  collabPanelEl,
  dateEl,
  dueDateInput,
  nextMonthBtn,
  prevMonthBtn,
  prioritySelect,
  profileEditorEl,
  profileHonorificInput,
  profileNicknameInput,
  profilePublicIdInput,
  quickAddBody,
  quickAddOptionsToggleBtn,
  quickAddOptionsEl,
  quickForm,
  quickInput,
  routeViewEls,
  saveProfileBtn,
  selectedDateNoteEndDate,
  selectedDateNoteInput,
  selectedDateNoteStartDate,
  toggleProfileEditorBtn,
} from './core/dom-refs.js';
import { apiRequest, getCookie, initSyncDeps, loadRuntimeMeta } from './core/sync.js';
import {
  initRouterDeps,
  renderRoute as renderRouteModule,
  initializeRouteModules as initializeRouteModulesModule,
  setupRouter as setupRouterModule,
} from './core/router-utils.js';
import { registerViewportClassSync as registerViewportClassSyncModule } from './core/viewport.js';
import { parseIsoDate, toLocalIsoDate } from './core/date-utils.js';

import * as collab from './features/collab/index.js';
import * as bucketModule from './features/bucket/index.js';
import * as todoModule from './features/todo/index.js';
import * as calendarModule from './features/calendar/index.js';

import {
  initBucketDeps,
  getTodoGroupLabel,
} from './features/bucket/index.js';
import {
  initTodoDeps,
  createTodo,
  renderTodoList as renderTodoListModule,
  renderTodosByBucket as renderTodosByBucketModule,
} from './features/todo/index.js';
import { initReportDeps, renderWeeklyReport as renderWeeklyReportModule } from './features/report/index.js';
import {
  initStateDeps,
  loadStateFromLocal,
  saveLocalState,
  ensureDataIntegrity,
  normalizeUserProfile,
  applyServerStateSnapshot,
  hasStoredData,
  hasPendingLocalChanges,
  markStateDirty,
} from './state/index.js';

/* ── Local helpers ── */

function formatToday() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  dateEl.textContent = fmt.format(now);
}

function safeReadJson(response) {
  return response.json().catch(() => ({}));
}

function syncState() {
  return collab.syncState();
}

function render() {
  renderRouteModule(runtime.currentRoute || 'home');
}

function queueSync(immediate = false) {
  return collab.queueSync(immediate);
}

/* ── Event registration ── */

function registerEvents() {
  if (runtime.eventsRegistered) {
    return;
  }
  runtime.eventsRegistered = true;

  bucketModule.registerBucketResizeObserver();
  bucketModule.registerBucketTitleEditors();
  bucketModule.registerBucketLaneControls();
  bucketModule.registerBucketDragControls();
  bucketModule.registerProjectColumnControls();

  if (quickForm) {
    if (quickAddBody) {
      quickAddBody.classList.remove('hidden');
    }
    if (quickAddOptionsEl) {
      quickAddOptionsEl.classList.add('hidden');
    }
    if (quickAddOptionsToggleBtn) {
      quickAddOptionsToggleBtn.addEventListener('click', () => {
        const shouldHide = quickAddOptionsEl && !quickAddOptionsEl.classList.contains('hidden');
        if (shouldHide) {
          quickAddOptionsEl.classList.add('hidden');
          quickAddOptionsToggleBtn.setAttribute('aria-expanded', 'false');
          quickAddOptionsToggleBtn.textContent = 'Options';
          return;
        }

        if (quickAddOptionsEl) {
          quickAddOptionsEl.classList.remove('hidden');
        }
        quickAddOptionsToggleBtn.setAttribute('aria-expanded', 'true');
        quickAddOptionsToggleBtn.textContent = 'Collapse';
      });
    }

    quickForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const title = quickInput.value.trim();
      if (!title) {
        return;
      }

      state.todos.unshift(
        createTodo({
          title,
          bucket: bucketSelect?.value || 'bucket4',
          projectLaneId: '',
          priority: Number(prioritySelect?.value || 2),
          dueDate: dueDateInput?.value || '',
        }),
      );
      saveLocalState();
      queueSync();
      render();
      quickInput.value = '';
      if (dueDateInput) {
        dueDateInput.value = '';
      }
      if (prioritySelect) {
        prioritySelect.value = '2';
      }
      if (bucketSelect) {
        bucketSelect.value = 'bucket4';
      }
      if (quickAddOptionsEl) {
        quickAddOptionsEl.classList.add('hidden');
      }
      if (quickAddOptionsToggleBtn) {
        quickAddOptionsToggleBtn.setAttribute('aria-expanded', 'false');
        quickAddOptionsToggleBtn.textContent = 'Options';
      }
      quickInput?.focus();
    });
  }

  if (calendarForm) {
    const hideCalendarForm = () => {
      calendarForm.hidden = true;
      calendarModule.setCalendarMode('note');
      if (calendarTextInput) {
        calendarTextInput.value = '';
      }
      if (calendarTodoTitleInput) {
        calendarTodoTitleInput.value = '';
      }
      if (calendarTodoDetailInput) {
        calendarTodoDetailInput.value = '';
      }
    };

    calendarForm.hidden = true;
    calendarModule.setCalendarMode('note');
    calendarModeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.calendarMode) {
          calendarModule.setCalendarMode(button.dataset.calendarMode);
          if (button.dataset.calendarMode === 'todo') {
            if (calendarTodoTitleInput) {
              calendarTodoTitleInput.focus();
            }
          } else if (calendarTextInput) {
            calendarTextInput.focus();
          }
        }
      });
    });
    calendarForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const date = String(calendarDateInput?.value || '').trim();
      if (!date) {
        showToast('Please select a date.', 'error');
        if (calendarDateInput) {
          calendarDateInput.focus();
        }
        return;
      }

      const itemType = calendarModule.isCalendarTodoMode() ? 'todo' : 'note';
      const noteText = String(calendarTextInput?.value || '').trim();
      const todoTitle = String(calendarTodoTitleInput?.value || '').trim();
      const todoDetail = String(calendarTodoDetailInput?.value || '').trim();

      if (itemType === 'todo') {
        if (!todoTitle) {
          showToast('Please enter a task title.', 'error');
          if (calendarTodoTitleInput) {
            calendarTodoTitleInput.focus();
          }
          return;
        }
        state.todos.unshift(
          createTodo({
            title: todoTitle,
            details: todoDetail,
            bucket: 'bucket4',
            projectLaneId: '',
            priority: 2,
            dueDate: date,
          }),
        );
      } else {
        if (!noteText) {
          showToast('Please enter a note.', 'error');
          if (calendarTextInput) {
            calendarTextInput.focus();
          }
          return;
        }
        state.calendarItems.unshift(todoModule.createCalendarItem(date, itemType, noteText));
      }

      queueSync();
      render();
      if (calendarTextInput) {
        calendarTextInput.value = '';
      }
      if (calendarTodoTitleInput) {
        calendarTodoTitleInput.value = '';
      }
      if (calendarTodoDetailInput) {
        calendarTodoDetailInput.value = '';
      }
      calendarModule.applyCalendarFormMode();
      if (calendarDateInput) {
        calendarDateInput.focus();
      }
    });

    [
      calendarDateInput,
      calendarTextInput,
      calendarTodoTitleInput,
      calendarTodoDetailInput,
    ].forEach((element) => {
      if (!element) {
        return;
      }
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          hideCalendarForm();
        }
      });
    });
  }

  if (prevMonthBtn) {
    prevMonthBtn.setAttribute('aria-pressed', 'false');
    prevMonthBtn.addEventListener('click', () => {
      prevMonthBtn.classList.add('is-active');
      prevMonthBtn.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        prevMonthBtn.classList.remove('is-active');
        prevMonthBtn.setAttribute('aria-pressed', 'false');
      }, 120);
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
      render();
    });
  }

  if (selectedDateNoteInput && addSelectedDateNoteBtn) {
    addSelectedDateNoteBtn.addEventListener('click', calendarModule.addSelectedDateNote);
    selectedDateNoteInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        calendarModule.addSelectedDateNote();
      }
    });
    selectedDateNoteStartDate?.addEventListener('change', () => {
      const startDate = parseIsoDate(selectedDateNoteStartDate.value || state.selectedDate || toLocalIsoDate(new Date()));
      if (!startDate) {
        return;
      }
      selectedDateNoteStartDate.value = startDate;
      if (selectedDateNoteEndDate) {
        selectedDateNoteEndDate.min = startDate;
        if (!selectedDateNoteEndDate.value || selectedDateNoteEndDate.value < startDate) {
          selectedDateNoteEndDate.value = startDate;
        }
      }
    });
    selectedDateNoteEndDate?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        calendarModule.addSelectedDateNote();
      }
    });
  }

  if (
    toggleProfileEditorBtn &&
    profileEditorEl &&
    profileNicknameInput &&
    profileHonorificInput &&
    profilePublicIdInput &&
    saveProfileBtn &&
    cancelProfileBtn
  ) {
    const hideProfileEditor = () => {
      profileEditorEl.classList.add('hidden');
      toggleProfileEditorBtn.classList.remove('is-active');
      toggleProfileEditorBtn.setAttribute('aria-expanded', 'false');
    };

    const showProfileEditor = () => {
      const profile = normalizeUserProfile(state.userProfile);
      profileNicknameInput.value = profile.nickname;
      profileHonorificInput.value = profile.honorific;
      profilePublicIdInput.value = collab.normalizePublicId(runtime.collabProfile.publicId || runtime.authUser?.publicId || '');
      profilePublicIdInput.disabled = !runtime.isServerSync;
      profileEditorEl.classList.remove('hidden');
      toggleProfileEditorBtn.classList.add('is-active');
      toggleProfileEditorBtn.setAttribute('aria-expanded', 'true');
      profileNicknameInput.focus();
      profileNicknameInput.select();
    };

    toggleProfileEditorBtn.addEventListener('click', () => {
      if (profileEditorEl.classList.contains('hidden')) {
        showProfileEditor();
      } else {
        hideProfileEditor();
      }
    });

    saveProfileBtn.addEventListener('click', async () => {
      state.userProfile = normalizeUserProfile({
        nickname: profileNicknameInput.value,
        honorific: profileHonorificInput.value,
      });
      saveLocalState();
      queueSync(true);

      if (runtime.isServerSync && runtime.authUser) {
        const nextPublicId = collab.normalizePublicId(profilePublicIdInput.value);
        const currentPublicId = collab.normalizePublicId(runtime.collabProfile.publicId || runtime.authUser.publicId || '');
        if (nextPublicId !== currentPublicId) {
          const ok = await collab.savePublicIdToServer(nextPublicId);
          if (!ok) {
            profilePublicIdInput.focus();
            profilePublicIdInput.select();
            return;
          }
        }
      }

      await collab.refreshCollabSummary({ includeTodos: true });
      collab.updateAuthUI();
      hideProfileEditor();
      showToast('Profile saved.', 'success');
    });

    cancelProfileBtn.addEventListener('click', () => {
      hideProfileEditor();
    });

    [profileNicknameInput, profileHonorificInput, profilePublicIdInput].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveProfileBtn.click();
        }
        if (event.key === 'Escape') {
          hideProfileEditor();
        }
      });
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.setAttribute('aria-pressed', 'false');
    nextMonthBtn.addEventListener('click', () => {
      nextMonthBtn.classList.add('is-active');
      nextMonthBtn.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        nextMonthBtn.classList.remove('is-active');
        nextMonthBtn.setAttribute('aria-pressed', 'false');
      }, 120);
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
      render();
    });
  }

  if (authBtn) {
    authBtn.addEventListener('click', async () => {
      if (!runtime.isServerSync) {
        window.location.href = '/api/auth/kakao';
        return;
      }

      try {
        await apiRequest('/auth/logout', {
          method: 'POST',
          allowHttpStatus: [401],
          suppressErrorToast: true,
          headers: {
            'x-csrf-token': getCookie('daycheck_csrf') || '',
          },
        });
      } catch {
        // ignore
      }

      collab.applyAuthState(null);
      collab.updateAuthUI();
      render();
    });
  }

  if (collabInviteFormEl) {
    collabInviteFormEl.addEventListener('submit', (event) => {
      event.preventDefault();
      collab.submitCollabInvite().catch(() => {
        showToast('Failed to process invite request.', 'error');
      });
    });
  }

  if (collabPanelEl) {
    collabPanelEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-collab-action]');
      if (!button) {
        return;
      }
      collab.handleCollabPanelAction(button).catch(() => {
        showToast('Failed to process sharing request.', 'error');
      });
    });
  }

  if (boardEl) {
    boardEl.addEventListener('change', (event) => {
      const contextSelect = event.target.closest('.shared-context-select');
      if (!contextSelect) {
        return;
      }
      const section = contextSelect.closest('.shared-todo-section');
      const bucket = section?.dataset.bucket;
      if (!bucket) {
        return;
      }
      const context = collab.getParsedCollabContext(contextSelect.value);
      if (!context) {
        return;
      }
      runtime.activeSharedContextByBucket[bucket] = context.key;
      if (!Array.isArray(runtime.sharedTodosByContext[context.key])) {
        collab.refreshCollabSnapshot()
          .then(() => {
            render();
          })
          .catch(() => {});
        return;
      }
      render();
    });

    boardEl.addEventListener('submit', (event) => {
      const form = event.target.closest('.shared-compose-form');
      if (!form) {
        return;
      }
      event.preventDefault();
      collab.submitSharedComposeForm(form).catch(() => {
        showToast('Failed to add shared task.', 'error');
      });
    });

    boardEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-shared-action]');
      if (!button) {
        return;
      }
      const action = button.dataset.sharedAction;
      if (!action) {
        return;
      }
      if (action === 'toggle-share-setting') {
        const bucket = button.dataset.bucket;
        collab.toggleBucketShareSetting(bucket).catch(() => {
          showToast('Failed to change bucket sharing settings.', 'error');
        });
        return;
      }
      const itemEl = button.closest('.shared-todo-item');
      if (!itemEl) {
        return;
      }

      if (action === 'save' || action === 'toggle-done') {
        collab.updateSharedTodoFromItem(itemEl, action).catch(() => {
          showToast('Failed to update shared task.', 'error');
        });
        return;
      }
      if (action === 'delete') {
        collab.deleteSharedTodo(itemEl.dataset.todoId).catch(() => {
          showToast('Failed to delete shared task.', 'error');
        });
        return;
      }
      if (action === 'toggle-comments') {
        collab.toggleSharedCommentPanel(itemEl).catch(() => {
          showToast('Could not open comment panel.', 'error');
        });
        return;
      }
      if (action === 'add-comment') {
        collab.addSharedComment(itemEl).catch(() => {
          showToast('Failed to add comment.', 'error');
        });
        return;
      }
      if (action === 'delete-comment') {
        const commentId = button.dataset.commentId;
        const todoId = itemEl.dataset.todoId;
        if (!commentId || !todoId) {
          return;
        }
        collab.deleteSharedComment(commentId, todoId).catch(() => {
          showToast('Failed to delete comment.', 'error');
        });
      }
    });
  }
}

/* ── Service worker ── */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocalhost && window.location.protocol !== 'https:') {
    return;
  }

  window.addEventListener('load', () => {
    let refreshing = false;
    const triggerReload = () => {
      if (refreshing) {
        return;
      }
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', triggerReload);

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.update().catch(() => {});
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) {
            return;
          }

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              triggerReload();
            }
          });
        });
      })
      .catch(() => {});
  });
}

/* ── Bootstrap ── */

async function bootstrap() {
  registerGlobalErrorBoundary();
  formatToday();
  registerViewportClassSyncModule();
  initUiDeps({ showToast });
  initStateDeps({
    render,
    syncState: collab.syncState,
    showToast,
    showBrokenTextFilteredToast,
    queueSync: collab.queueSync,
  });
  initReportDeps({
    addEmptyMessage: calendarModule.addEmptyMessage,
    sortTodos: todoModule.sortTodos,
    getTodoGroupLabel: bucketModule.getTodoGroupLabel,
    queueSync: collab.queueSync,
  });
  initRouterDeps({
    render,
    closeBucketActionMenus: bucketModule.closeBucketActionMenus,
    syncCollabPolling: collab.syncCollabPolling,
    renderers: {
      home: renderTodoListModule,
      buckets: renderTodosByBucketModule,
      calendar: () => {
        calendarModule.renderCalendar();
        calendarModule.renderSelectedDatePanel();
      },
      report: renderWeeklyReportModule,
    },
  });
  initSyncDeps({
    apiBase: API_BASE,
    showApiErrorToast,
    createApiRequestError: createCoreApiRequestError,
    startStatePolling: collab.startStatePolling,
    syncCollabPolling: collab.syncCollabPolling,
    config,
    runtime,
    buckets,
    defaultBucketLabels,
    defaultBucketVisibility,
    safeReadJson,
    pollDefaults: {
      stateActive: STATE_POLL_ACTIVE_INTERVAL_MS_DEFAULT,
      stateHidden: STATE_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
      collabActive: COLLAB_POLL_ACTIVE_INTERVAL_MS_DEFAULT,
      collabHidden: COLLAB_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
      holidayTtl: HOLIDAY_CACHE_TTL_MS_DEFAULT,
    },
  });
  initHolidayDeps({
    apiRequest,
    config,
  });
  collab.initCollabDeps({
    render,
    showToast,
    apiRequest,
    addEmptyMessage: calendarModule.addEmptyMessage,
    saveLocalState,
    markStateDirty,
    safeReadJson,
    applyServerStateSnapshot,
    loadStateFromLocal,
    hasPendingLocalChanges,
    createSharedCommentItem: collab.createSharedCommentItem,
    createSharedTodoItem: collab.createSharedTodoItem,
    getTodoGroupLabel: bucketModule.getTodoGroupLabel,
    getProjectLaneName: bucketModule.getProjectLaneName,
    getBucketLabel: bucketModule.getBucketLabel,
  });
  calendarModule.initCalendarDeps({
    render,
    showToast,
    queueSync: collab.queueSync,
    sortTodos: todoModule.sortTodos,
    getTodoGroupLabel: bucketModule.getTodoGroupLabel,
    createCalendarItem: todoModule.createCalendarItem,
  });
  initBucketDeps({
    addProjectLane: bucketModule.addProjectLane,
    addNextHiddenBucket: bucketModule.addNextHiddenBucket,
    beginEditLaneName: bucketModule.beginEditLaneName,
    canRemoveBucketFromMenu: bucketModule.canRemoveBucketFromMenu,
    closeBucketActionMenus: bucketModule.closeBucketActionMenus,
    createBucketColumn: bucketModule.createBucketColumn,
    ensureBucketActionMenu: bucketModule.ensureBucketActionMenu,
    ensureBucketColumns: bucketModule.ensureBucketColumns,
    ensureBucketSelectOptions: bucketModule.ensureBucketSelectOptions,
    applyBucketLabels: bucketModule.applyBucketLabels,
    applyBucketOrder: bucketModule.applyBucketOrder,
    applyBucketVisibility: bucketModule.applyBucketVisibility,
    applyBucketSizes: bucketModule.applyBucketSizes,
    applyProjectLaneSizes: bucketModule.applyProjectLaneSizes,
    getActiveBucketCount: bucketModule.getActiveBucketCount,
    getBucketLabel: bucketModule.getBucketLabel,
    getProjectLaneName: bucketModule.getProjectLaneName,
    getTodoGroupLabel: bucketModule.getTodoGroupLabel,
    removeBucket: bucketModule.removeBucket,
    renderProjectLaneColumns: bucketModule.renderProjectLaneColumns,
    registerBucketDragControls: bucketModule.registerBucketDragControls,
    registerBucketLaneControls: bucketModule.registerBucketLaneControls,
    registerBucketMenuHandlers: bucketModule.registerBucketMenuHandlers,
    registerBucketResizeObserver: bucketModule.registerBucketResizeObserver,
    registerProjectColumnControls: bucketModule.registerProjectColumnControls,
    renderProjectLaneGroups: bucketModule.renderProjectLaneGroups,
    renderProjectLaneOptions: bucketModule.renderProjectLaneOptions,
    removeProjectLane: bucketModule.removeProjectLane,
    syncBucketActionMenus: bucketModule.syncBucketActionMenus,
    syncBucketOrderFromDom: bucketModule.syncBucketOrderFromDom,
    setBucketCount: bucketModule.setBucketCount,
    registerBucketTitleEditors: bucketModule.registerBucketTitleEditors,
    render,
    queueSync: collab.queueSync,
    sortTodos: todoModule.sortTodos,
    renderTodoItems: todoModule.renderTodoItems,
    showToast,
  });
  initTodoDeps({
    bindTodoDetailsInput: todoModule.bindTodoDetailsInput,
    bindTodoMemoComposer: todoModule.bindTodoMemoComposer,
    bindTodoSubtaskComposer: todoModule.bindTodoSubtaskComposer,
    buildTodoMetaText: todoModule.buildTodoMetaText,
    createCalendarItem: todoModule.createCalendarItem,
    getTodayActiveNoteEntries: todoModule.getTodayActiveNoteEntries,
    renderTodoItems: todoModule.renderTodoItems,
    renderTodoList: renderTodoListModule,
    renderTodosByBucket: renderTodosByBucketModule,
    renderTodoMemoList: todoModule.renderTodoMemoList,
    renderTodayNoteHighlights: todoModule.renderTodayNoteHighlights,
    renderProjectLaneOptions: bucketModule.renderProjectLaneOptions,
    renderProjectLaneGroups: bucketModule.renderProjectLaneGroups,
    renderSharedTodosForBucket: collab.renderSharedTodosForBucket,
    ensureBucketShareToggle: collab.ensureBucketShareToggle,
    sortTodos: todoModule.sortTodos,
    render,
    getProjectLaneName: bucketModule.getProjectLaneName,
    syncBucketActionMenus: bucketModule.syncBucketActionMenus,
    queueSync: collab.queueSync,
    showToast,
  });

  collab.registerStatePollingEvents();
  await loadRuntimeMeta();
  state.selectedDate = state.selectedDate || toLocalIsoDate(new Date());
  loadStateFromLocal();

  await collab.checkAuth();

  if (runtime.isServerSync) {
    const serverState = await collab.loadServerState();
    if (serverState) {
      const localBackup = {
        todos: [...state.todos],
        doneLog: [...state.doneLog],
        calendarItems: [...state.calendarItems],
        bucketLabels: { ...state.bucketLabels },
        bucketOrder: [...state.bucketOrder],
        bucketVisibility: { ...state.bucketVisibility },
        projectLanes: [...state.projectLanes],
        userProfile: { ...state.userProfile },
      };

      if (serverState.exists && serverState.hasData) {
        applyServerStateSnapshot(serverState.state, Number(serverState.version || 0), {
          shouldRender: false,
          shouldPersist: false,
        });
      } else if (hasStoredData(localBackup)) {
        collab.queueSync();
      }
    }

    await collab.refreshCollabSummary({ includeTodos: true });
  }

  ensureDataIntegrity();
  saveLocalState();
  bucketModule.ensureBucketColumns();
  bucketModule.ensureBucketSelectOptions();
  initializeRouteModulesModule();
  setupRouterModule();
  registerEvents();
  collab.updateAuthUI();
  await ensureHolidayDataForYear(state.currentMonth.getFullYear()).catch(() => {});
  render();

  const searchParams = new URLSearchParams(window.location.search);
  const auth = searchParams.get('auth');
  if (auth === 'error') {
    alert('An error occurred during Kakao login.');
  }
}

bootstrap().catch((error) => {
  registerGlobalErrorBoundary();
  console.error('[bootstrap]', error);

  try {
    registerViewportClassSyncModule();
    collab.registerStatePollingEvents();
    state.selectedDate = state.selectedDate || toLocalIsoDate(new Date());
    loadStateFromLocal();
    ensureDataIntegrity();
    saveLocalState();
    bucketModule.ensureBucketColumns();
    bucketModule.ensureBucketSelectOptions();
    initializeRouteModulesModule();
    setupRouterModule();
    registerEvents();
    collab.updateAuthUI();
    render();

    showToast('Some errors occurred during initialization, but the app has recovered.', 'error');
  } catch (fallbackError) {
    handleFatalError(fallbackError);
  }
});

registerServiceWorker();
