'use strict';

function hasBucketAccess({ actorUserId, ownerUserId, membership = null }) {
  if (Number(actorUserId) === Number(ownerUserId)) {
    return true;
  }

  return Boolean(
    membership &&
      Number(membership.memberUserId) === Number(actorUserId) &&
      membership.status === 'active',
  );
}

function canCreateInvite({ actorUserId, ownerUserId }) {
  return Number(actorUserId) === Number(ownerUserId);
}

function canCancelInvite({ actorUserId, ownerUserId, inviterUserId }) {
  return Number(actorUserId) === Number(ownerUserId) || Number(actorUserId) === Number(inviterUserId);
}

function canManageMembership({ actorUserId, ownerUserId, memberUserId }) {
  if (Number(actorUserId) === Number(ownerUserId)) {
    return true;
  }
  return Number(actorUserId) === Number(memberUserId);
}

function canDeleteSharedTodo({ actorUserId, ownerUserId }) {
  return Number(actorUserId) === Number(ownerUserId);
}

function canDeleteComment({ actorUserId, ownerUserId, commentAuthorUserId }) {
  return Number(actorUserId) === Number(ownerUserId) || Number(actorUserId) === Number(commentAuthorUserId);
}

module.exports = {
  hasBucketAccess,
  canCreateInvite,
  canCancelInvite,
  canManageMembership,
  canDeleteSharedTodo,
  canDeleteComment,
};
