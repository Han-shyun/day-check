export function createTodoUi() {
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

      const todoCount = Array.isArray(state?.todos) ? state.todos.length : 0;
      const noteCount = Array.isArray(state?.calendarItems)
        ? state.calendarItems.filter((item) => item?.type === 'note').length
        : 0;

      root.dataset.todoCount = String(todoCount);
      root.dataset.noteCount = String(noteCount);
    },
    getRoot() {
      return root;
    },
  };
}

export const todoUi = {
  create: createTodoUi,
};
