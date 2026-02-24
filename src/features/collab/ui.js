export function createCollabUi() {
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

      const memberCount = Array.isArray(state?.collabMembers) ? state.collabMembers.length : 0;
      root.dataset.memberCount = String(memberCount);
    },
    getRoot() {
      return root;
    },
  };
}

export const collabUi = {
  create: createCollabUi,
};
