'use strict';

const crypto = require('crypto');
const policy = require('./policy');

const PUBLIC_ID_PATTERN = /^[a-z0-9_]{4,20}$/;
const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BUCKET_KEYS = new Set([
  'bucket1',
  'bucket2',
  'bucket3',
  'bucket4',
  'bucket5',
  'bucket6',
  'bucket7',
  'bucket8',
]);

class CollabError extends Error {
  constructor(status, error, details = {}) {
    super(error);
    this.status = status;
    this.error = error;
    this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, maxLength) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function normalizePublicId(value) {
  return normalizeText(value, 20).toLowerCase();
}

function normalizeBucketKey(value) {
  return normalizeText(value, 24);
}

function normalizeTitle(value) {
  return normalizeText(value, 120);
}

function normalizeDetails(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .slice(0, 1200);
}

function normalizeDueDate(value) {
  const dateText = normalizeText(value, 20);
  if (!dateText) {
    return '';
  }
  return DUE_DATE_PATTERN.test(dateText) ? dateText : '';
}

function normalizePriority(value) {
  const priority = Number(value || 2);
  if (!Number.isInteger(priority) || priority < 1 || priority > 3) {
    return 2;
  }
  return priority;
}

function normalizeSubtasks(input) {
  const source = Array.isArray(input) ? input : [];
  return source
    .map((entry) => {
      if (typeof entry === 'string') {
        const text = normalizeText(entry, 120);
        if (!text) {
          return null;
        }
        return {
          id: crypto.randomUUID(),
          text,
          done: false,
          createdAt: nowIso(),
        };
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const text = normalizeText(entry.text || entry.title || '', 120);
      if (!text) {
        return null;
      }

      return {
        id: normalizeText(entry.id, 80) || crypto.randomUUID(),
        text,
        done: Boolean(entry.done || entry.completed),
        createdAt: normalizeText(entry.createdAt, 40) || nowIso(),
      };
    })
    .filter(Boolean);
}

function assertBucketKey(bucketKey) {
  const normalized = normalizeBucketKey(bucketKey);
  if (!BUCKET_KEYS.has(normalized)) {
    throw new CollabError(400, 'invalid_payload', { field: 'bucketKey' });
  }
  return normalized;
}

function assertOwnerUserId(ownerUserId) {
  const id = Number(ownerUserId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new CollabError(400, 'invalid_payload', { field: 'ownerUserId' });
  }
  return id;
}

function assertInviteId(inviteId) {
  const id = normalizeText(inviteId, 120);
  if (!id) {
    throw new CollabError(400, 'invalid_payload', { field: 'inviteId' });
  }
  return id;
}

function assertTodoId(todoId) {
  const id = normalizeText(todoId, 120);
  if (!id) {
    throw new CollabError(400, 'invalid_payload', { field: 'todoId' });
  }
  return id;
}

function assertCommentId(commentId) {
  const id = normalizeText(commentId, 120);
  if (!id) {
    throw new CollabError(400, 'invalid_payload', { field: 'commentId' });
  }
  return id;
}

function assertBooleanField(payload, field) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CollabError(400, 'invalid_payload', { field });
  }
  if (typeof payload[field] !== 'boolean') {
    throw new CollabError(400, 'invalid_payload', { field });
  }
  return payload[field];
}

async function isBucketShareEnabled(repository, ownerUserId, bucketKey) {
  const setting = await repository.getShareSetting({ ownerUserId, bucketKey });
  if (setting) {
    return setting.isEnabled;
  }
  return repository.hasShareActivity({ ownerUserId, bucketKey });
}

async function ensureBucketAccess(repository, actorUserId, ownerUserId, bucketKey) {
  const normalizedOwnerUserId = assertOwnerUserId(ownerUserId);
  const normalizedBucketKey = assertBucketKey(bucketKey);
  const shareEnabled = await isBucketShareEnabled(repository, normalizedOwnerUserId, normalizedBucketKey);
  if (!shareEnabled) {
    throw new CollabError(403, 'forbidden', { reason: 'share_disabled' });
  }

  if (Number(actorUserId) === normalizedOwnerUserId) {
    return { ownerUserId: normalizedOwnerUserId, bucketKey: normalizedBucketKey, role: 'owner', membership: null };
  }

  const membership = await repository.findActiveMembership({
    ownerUserId: normalizedOwnerUserId,
    bucketKey: normalizedBucketKey,
    memberUserId: Number(actorUserId),
  });

  if (
    !policy.hasBucketAccess({
      actorUserId,
      ownerUserId: normalizedOwnerUserId,
      membership,
    })
  ) {
    throw new CollabError(403, 'forbidden');
  }

  return { ownerUserId: normalizedOwnerUserId, bucketKey: normalizedBucketKey, role: 'member', membership };
}

function buildProfile(user) {
  return {
    userId: Number(user.id),
    publicId: user.public_id || null,
    nickname: user.nickname || null,
    publicIdUpdatedAt: user.public_id_updated_at || null,
  };
}

function createCollabService(options = {}) {
  const { repository } = options;

  if (!repository) {
    throw new Error('collab_repository_required');
  }

  return {
    isCollabError: (error) => error instanceof CollabError,
    async getSummary(actorUserId) {
      const user = await repository.getUserById(actorUserId);
      if (!user) {
        throw new CollabError(401, 'unauthorized');
      }

      const normalizedActorUserId = Number(actorUserId);
      const [receivedInvites, sentInvites, ownedMemberships, joinedMemberships, shareSettings] = await Promise.all([
        repository.listReceivedInvites(normalizedActorUserId),
        repository.listSentInvites(normalizedActorUserId),
        repository.listOwnedMemberships(normalizedActorUserId),
        repository.listJoinedMemberships(normalizedActorUserId),
        repository.listShareSettings(normalizedActorUserId),
      ]);

      const shareSettingMap = new Map();
      shareSettings.forEach((setting) => {
        if (!setting || !setting.bucketKey) {
          return;
        }
        shareSettingMap.set(setting.bucketKey, setting.isEnabled);
      });
      const shareEnabledCache = new Map();
      const resolveOwnBucketShareEnabled = async (bucketKey) => {
        const key = String(bucketKey || '');
        if (!key) {
          return false;
        }
        if (shareEnabledCache.has(key)) {
          return shareEnabledCache.get(key);
        }
        if (shareSettingMap.has(key)) {
          const enabled = Boolean(shareSettingMap.get(key));
          shareEnabledCache.set(key, enabled);
          return enabled;
        }
        const enabled = await repository.hasShareActivity({
          ownerUserId: normalizedActorUserId,
          bucketKey: key,
        });
        shareEnabledCache.set(key, enabled);
        return enabled;
      };

      const ownedBucketMap = new Map();
      const ensureOwnedBucket = (bucketKey) => {
        const key = String(bucketKey);
        if (!ownedBucketMap.has(key)) {
          ownedBucketMap.set(key, {
            ownerUserId: normalizedActorUserId,
            bucketKey: key,
            shareEnabled: false,
            members: [],
            pendingInvites: [],
          });
        }
        return ownedBucketMap.get(key);
      };

      shareSettings
        .filter((setting) => setting && setting.isEnabled)
        .forEach((setting) => {
          ensureOwnedBucket(setting.bucketKey);
        });

      ownedMemberships.forEach((membership) => {
        const bucket = ensureOwnedBucket(membership.bucketKey);
        bucket.members.push({
          membershipId: membership.id,
          role: membership.role,
          status: membership.status,
          userId: membership.member?.userId || membership.memberUserId,
          publicId: membership.member?.publicId || null,
          nickname: membership.member?.nickname || null,
        });
      });

      sentInvites
        .filter((invite) => invite.ownerUserId === normalizedActorUserId && invite.status === 'pending')
        .forEach((invite) => {
          const bucket = ensureOwnedBucket(invite.bucketKey);
          bucket.pendingInvites.push(invite);
        });

      const ownedBuckets = Array.from(ownedBucketMap.values());
      await Promise.all(
        ownedBuckets.map(async (entry) => {
          entry.shareEnabled = await resolveOwnBucketShareEnabled(entry.bucketKey);
        }),
      );
      ownedBuckets.sort((a, b) => a.bucketKey.localeCompare(b.bucketKey));

      const joinedBuckets = joinedMemberships.map((membership) => ({
        membershipId: membership.id,
        ownerUserId: membership.ownerUserId,
        bucketKey: membership.bucketKey,
        role: membership.role,
        status: membership.status,
        owner: membership.owner,
      }));

      const shareSettingsResponse = await Promise.all(
        Array.from(BUCKET_KEYS)
          .sort((a, b) => a.localeCompare(b))
          .map(async (bucketKey) => ({
            bucketKey,
            enabled: await resolveOwnBucketShareEnabled(bucketKey),
          })),
      );

      return {
        profile: buildProfile(user),
        ownedBuckets,
        joinedBuckets,
        receivedInvites,
        sentInvites,
        shareSettings: shareSettingsResponse,
      };
    },
    async setPublicId(actorUserId, payload = {}) {
      const publicId = normalizePublicId(payload.publicId);
      if (!PUBLIC_ID_PATTERN.test(publicId)) {
        throw new CollabError(400, 'invalid_payload', { field: 'publicId' });
      }

      const taken = await repository.findUserByPublicIdNormalized(publicId);
      if (taken && Number(taken.id) !== Number(actorUserId)) {
        throw new CollabError(409, 'public_id_taken');
      }

      await repository.updateUserPublicId({
        userId: Number(actorUserId),
        publicId,
        publicIdNormalized: publicId,
        updatedAt: nowIso(),
      });

      const user = await repository.getUserById(actorUserId);
      if (!user) {
        throw new CollabError(404, 'not_found');
      }

      return {
        success: true,
        profile: buildProfile(user),
      };
    },
    async setShareSetting(actorUserId, bucketKey, payload = {}) {
      const ownerUserId = Number(actorUserId);
      const normalizedBucketKey = assertBucketKey(bucketKey);
      const enabled = assertBooleanField(payload, 'enabled');
      const now = nowIso();

      await repository.withTransaction(async () => {
        await repository.upsertShareSetting({
          ownerUserId,
          bucketKey: normalizedBucketKey,
          isEnabled: enabled,
          now,
        });
        if (!enabled) {
          await repository.cancelPendingInvitesByOwnerBucket({
            ownerUserId,
            bucketKey: normalizedBucketKey,
            now,
          });
          await repository.deactivateMembershipsByOwnerBucket({
            ownerUserId,
            bucketKey: normalizedBucketKey,
            now,
          });
        }
      });

      const setting = await repository.getShareSetting({
        ownerUserId,
        bucketKey: normalizedBucketKey,
      });
      return {
        setting: {
          bucketKey: normalizedBucketKey,
          enabled: Boolean(setting && setting.isEnabled),
        },
      };
    },
    async createInvite(actorUserId, payload = {}) {
      const ownerUserId = Number(actorUserId);
      const bucketKey = assertBucketKey(payload.bucketKey);
      const targetPublicId = normalizePublicId(payload.targetPublicId);

      if (!PUBLIC_ID_PATTERN.test(targetPublicId)) {
        throw new CollabError(400, 'invalid_payload', { field: 'targetPublicId' });
      }

      if (!policy.canCreateInvite({ actorUserId, ownerUserId })) {
        throw new CollabError(403, 'forbidden');
      }

      const shareEnabled = await isBucketShareEnabled(repository, ownerUserId, bucketKey);
      if (!shareEnabled) {
        throw new CollabError(409, 'conflict', { reason: 'share_disabled' });
      }

      const targetUser = await repository.findUserByPublicIdNormalized(targetPublicId);
      if (!targetUser) {
        throw new CollabError(404, 'not_found');
      }

      if (Number(targetUser.id) === ownerUserId) {
        throw new CollabError(400, 'invalid_payload', { field: 'targetPublicId' });
      }

      const existingMembership = await repository.findActiveMembership({
        ownerUserId,
        bucketKey,
        memberUserId: Number(targetUser.id),
      });
      if (existingMembership) {
        throw new CollabError(409, 'conflict', { reason: 'already_member' });
      }

      const existingInvite = await repository.findPendingInvite({
        ownerUserId,
        bucketKey,
        inviteeUserId: Number(targetUser.id),
      });
      if (existingInvite) {
        throw new CollabError(409, 'conflict', { reason: 'invite_exists' });
      }

      const now = nowIso();
      const invite = {
        id: crypto.randomUUID(),
        ownerUserId,
        bucketKey,
        inviteeUserId: Number(targetUser.id),
        inviterUserId: ownerUserId,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        respondedAt: null,
      };

      await repository.createInvite(invite);
      return repository.getInviteById(invite.id);
    },
    async acceptInvite(actorUserId, inviteId) {
      const normalizedInviteId = assertInviteId(inviteId);
      const invite = await repository.getInviteById(normalizedInviteId);
      if (!invite) {
        throw new CollabError(404, 'not_found');
      }

      if (invite.inviteeUserId !== Number(actorUserId)) {
        throw new CollabError(403, 'forbidden');
      }
      if (invite.status !== 'pending') {
        throw new CollabError(409, 'conflict', { reason: 'invite_not_pending' });
      }
      const shareEnabled = await isBucketShareEnabled(repository, invite.ownerUserId, invite.bucketKey);
      if (!shareEnabled) {
        throw new CollabError(409, 'conflict', { reason: 'share_disabled' });
      }

      const now = nowIso();
      await repository.withTransaction(async () => {
        await repository.updateInviteStatus({
          inviteId: normalizedInviteId,
          status: 'accepted',
          updatedAt: now,
          respondedAt: now,
        });
        await repository.upsertMembershipActive({
          ownerUserId: invite.ownerUserId,
          bucketKey: invite.bucketKey,
          memberUserId: Number(actorUserId),
          role: 'member',
          now,
        });
      });

      const acceptedInvite = await repository.getInviteById(normalizedInviteId);
      const membership = await repository.findActiveMembership({
        ownerUserId: invite.ownerUserId,
        bucketKey: invite.bucketKey,
        memberUserId: Number(actorUserId),
      });
      return {
        invite: acceptedInvite,
        membership,
      };
    },
    async declineInvite(actorUserId, inviteId) {
      const normalizedInviteId = assertInviteId(inviteId);
      const invite = await repository.getInviteById(normalizedInviteId);
      if (!invite) {
        throw new CollabError(404, 'not_found');
      }

      if (invite.inviteeUserId !== Number(actorUserId)) {
        throw new CollabError(403, 'forbidden');
      }
      if (invite.status !== 'pending') {
        throw new CollabError(409, 'conflict', { reason: 'invite_not_pending' });
      }

      const now = nowIso();
      await repository.updateInviteStatus({
        inviteId: normalizedInviteId,
        status: 'declined',
        updatedAt: now,
        respondedAt: now,
      });
      return repository.getInviteById(normalizedInviteId);
    },
    async cancelInvite(actorUserId, inviteId) {
      const normalizedInviteId = assertInviteId(inviteId);
      const invite = await repository.getInviteById(normalizedInviteId);
      if (!invite) {
        throw new CollabError(404, 'not_found');
      }

      if (invite.status !== 'pending') {
        throw new CollabError(409, 'conflict', { reason: 'invite_not_pending' });
      }

      if (
        !policy.canCancelInvite({
          actorUserId,
          ownerUserId: invite.ownerUserId,
          inviterUserId: invite.inviterUserId,
        })
      ) {
        throw new CollabError(403, 'forbidden');
      }

      await repository.updateInviteStatus({
        inviteId: normalizedInviteId,
        status: 'cancelled',
        updatedAt: nowIso(),
        respondedAt: nowIso(),
      });

      return { success: true };
    },
    async removeMembership(actorUserId, membershipId) {
      const normalizedMembershipId = Number(membershipId);
      if (!Number.isInteger(normalizedMembershipId) || normalizedMembershipId <= 0) {
        throw new CollabError(400, 'invalid_payload', { field: 'membershipId' });
      }

      const membership = await repository.getMembershipById(normalizedMembershipId);
      if (!membership || membership.status !== 'active') {
        throw new CollabError(404, 'not_found');
      }

      if (
        !policy.canManageMembership({
          actorUserId,
          ownerUserId: membership.ownerUserId,
          memberUserId: membership.memberUserId,
        })
      ) {
        throw new CollabError(403, 'forbidden');
      }

      await repository.deactivateMembership({
        membershipId: normalizedMembershipId,
        now: nowIso(),
      });

      return { success: true };
    },
    async listSharedTodos(actorUserId, ownerUserId, bucketKey) {
      const context = await ensureBucketAccess(repository, actorUserId, ownerUserId, bucketKey);
      return repository.listSharedTodos({
        ownerUserId: context.ownerUserId,
        bucketKey: context.bucketKey,
      });
    },
    async createSharedTodo(actorUserId, ownerUserId, bucketKey, payload = {}) {
      const context = await ensureBucketAccess(repository, actorUserId, ownerUserId, bucketKey);
      const title = normalizeTitle(payload.title);
      if (!title) {
        throw new CollabError(400, 'invalid_payload', { field: 'title' });
      }

      const details = normalizeDetails(payload.details);
      const subtasks = normalizeSubtasks(payload.subtasks || []);
      const priority = normalizePriority(payload.priority);
      const dueDate = normalizeDueDate(payload.dueDate);
      const isDone = Boolean(payload.isDone);
      const now = nowIso();

      const todo = {
        id: crypto.randomUUID(),
        ownerUserId: context.ownerUserId,
        bucketKey: context.bucketKey,
        title,
        details,
        subtasksJson: JSON.stringify(subtasks),
        priority,
        dueDate,
        isDone,
        revision: 1,
        createdByUserId: Number(actorUserId),
        updatedByUserId: Number(actorUserId),
        createdAt: now,
        updatedAt: now,
        completedAt: isDone ? now : null,
      };

      await repository.createSharedTodo(todo);
      return repository.getSharedTodoById(todo.id);
    },
    async updateSharedTodo(actorUserId, todoId, payload = {}) {
      const normalizedTodoId = assertTodoId(todoId);
      const current = await repository.getSharedTodoById(normalizedTodoId);
      if (!current) {
        throw new CollabError(404, 'not_found');
      }

      await ensureBucketAccess(repository, actorUserId, current.ownerUserId, current.bucketKey);

      const revision = Number(payload.revision);
      if (!Number.isInteger(revision) || revision <= 0) {
        throw new CollabError(400, 'invalid_payload', { field: 'revision' });
      }
      if (revision !== current.revision) {
        throw new CollabError(409, 'todo_revision_conflict', { currentRevision: current.revision });
      }

      const nextTitle = Object.prototype.hasOwnProperty.call(payload, 'title')
        ? normalizeTitle(payload.title)
        : current.title;
      if (!nextTitle) {
        throw new CollabError(400, 'invalid_payload', { field: 'title' });
      }

      const nextDetails = Object.prototype.hasOwnProperty.call(payload, 'details')
        ? normalizeDetails(payload.details)
        : current.details;
      const nextSubtasks = Object.prototype.hasOwnProperty.call(payload, 'subtasks')
        ? normalizeSubtasks(payload.subtasks || [])
        : current.subtasks;
      const nextPriority = Object.prototype.hasOwnProperty.call(payload, 'priority')
        ? normalizePriority(payload.priority)
        : current.priority;
      const nextDueDate = Object.prototype.hasOwnProperty.call(payload, 'dueDate')
        ? normalizeDueDate(payload.dueDate)
        : current.dueDate;
      const nextIsDone = Object.prototype.hasOwnProperty.call(payload, 'isDone')
        ? Boolean(payload.isDone)
        : current.isDone;

      const now = nowIso();
      let completedAt = current.completedAt;
      if (nextIsDone && !current.isDone) {
        completedAt = now;
      } else if (!nextIsDone) {
        completedAt = null;
      }

      await repository.updateSharedTodo({
        todoId: normalizedTodoId,
        title: nextTitle,
        details: nextDetails,
        subtasksJson: JSON.stringify(nextSubtasks),
        priority: nextPriority,
        dueDate: nextDueDate,
        isDone: nextIsDone,
        revision: current.revision + 1,
        updatedByUserId: Number(actorUserId),
        updatedAt: now,
        completedAt,
      });

      return repository.getSharedTodoById(normalizedTodoId);
    },
    async deleteSharedTodo(actorUserId, todoId) {
      const normalizedTodoId = assertTodoId(todoId);
      const current = await repository.getSharedTodoById(normalizedTodoId);
      if (!current) {
        throw new CollabError(404, 'not_found');
      }

      if (
        !policy.canDeleteSharedTodo({
          actorUserId,
          ownerUserId: current.ownerUserId,
        })
      ) {
        throw new CollabError(403, 'forbidden');
      }

      await repository.withTransaction(async () => {
        await repository.deleteCommentsByTodo(normalizedTodoId);
        await repository.deleteSharedTodo(normalizedTodoId);
      });

      return { success: true };
    },
    async listComments(actorUserId, todoId) {
      const normalizedTodoId = assertTodoId(todoId);
      const todo = await repository.getSharedTodoById(normalizedTodoId);
      if (!todo) {
        throw new CollabError(404, 'not_found');
      }
      await ensureBucketAccess(repository, actorUserId, todo.ownerUserId, todo.bucketKey);
      return repository.listCommentsByTodo(normalizedTodoId);
    },
    async createComment(actorUserId, todoId, payload = {}) {
      const normalizedTodoId = assertTodoId(todoId);
      const todo = await repository.getSharedTodoById(normalizedTodoId);
      if (!todo) {
        throw new CollabError(404, 'not_found');
      }
      await ensureBucketAccess(repository, actorUserId, todo.ownerUserId, todo.bucketKey);

      const body = normalizeText(payload.body, 1200);
      if (!body) {
        throw new CollabError(400, 'invalid_payload', { field: 'body' });
      }

      const now = nowIso();
      const comment = {
        id: crypto.randomUUID(),
        todoId: normalizedTodoId,
        ownerUserId: todo.ownerUserId,
        authorUserId: Number(actorUserId),
        body,
        createdAt: now,
        updatedAt: now,
      };
      await repository.createComment(comment);
      return repository.getCommentById(comment.id);
    },
    async deleteComment(actorUserId, commentId) {
      const normalizedCommentId = assertCommentId(commentId);
      const comment = await repository.getCommentById(normalizedCommentId);
      if (!comment || comment.deletedAt) {
        throw new CollabError(404, 'not_found');
      }

      const todo = await repository.getSharedTodoById(comment.todoId);
      if (!todo) {
        throw new CollabError(404, 'not_found');
      }

      await ensureBucketAccess(repository, actorUserId, todo.ownerUserId, todo.bucketKey);

      if (
        !policy.canDeleteComment({
          actorUserId,
          ownerUserId: todo.ownerUserId,
          commentAuthorUserId: comment.authorUserId,
        })
      ) {
        throw new CollabError(403, 'forbidden');
      }

      const now = nowIso();
      await repository.markCommentDeleted({
        commentId: normalizedCommentId,
        deletedAt: now,
        updatedAt: now,
      });
      return { success: true };
    },
  };
}

module.exports = {
  createCollabService,
  CollabError,
};
