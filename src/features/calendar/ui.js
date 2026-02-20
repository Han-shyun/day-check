export function createCalendarUi() {
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

      const selectedDate = String(state?.selectedDate || '');
      const currentMonth = state?.currentMonth instanceof Date
        ? `${state.currentMonth.getFullYear()}-${String(state.currentMonth.getMonth() + 1).padStart(2, '0')}`
        : '';

      root.dataset.selectedDate = selectedDate;
      root.dataset.currentMonth = currentMonth;
    },
    getRoot() {
      return root;
    },
  };
}

export const calendarUi = {
  create: createCalendarUi,
};
