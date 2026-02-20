export function createReportUi() {
  let root = null;

  return {
    mount(nextRoot) {
      root = nextRoot || null;
    },
    unmount() {
      root = null;
    },
    render(state) {
      if (!root) {
        return;
      }

      const doneCount = Array.isArray(state?.doneLog) ? state.doneLog.length : 0;
      const pendingCount = Array.isArray(state?.todos) ? state.todos.length : 0;
      root.dataset.doneCount = String(doneCount);
      root.dataset.pendingCount = String(pendingCount);
    },
    getRoot() {
      return root;
    },
  };
}

