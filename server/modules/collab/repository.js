'use strict';

function parseSubtasks(raw) {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toAuthor(userId, publicId, nickname) {
  return {
    userId: Number(userId),
    publicId: publicId || null,
    nickname: nickname || null,
  };
}

function mapInviteRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ownerUserId: Number(row.owner_user_id),
    bucketKey: row.bucket_key,
    inviteeUserId: Number(row.invitee_user_id),
    inviterUserId: Number(row.inviter_user_id),
    status: row.status,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    respondedAt: row.responded_at || null,
    owner: toAuthor(row.owner_user_id, row.owner_public_id, row.owner_nickname),
    inviter: toAuthor(row.inviter_user_id, row.inviter_public_id, row.inviter_nickname),
    invitee: toAuthor(row.invitee_user_id, row.invitee_public_id, row.invitee_nickname),
  };
}

function mapMembershipRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    ownerUserId: Number(row.owner_user_id),
    bucketKey: row.bucket_key,
    memberUserId: Number(row.member_user_id),
    role: row.role,
    status: row.status,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    member: row.member_user_id
      ? toAuthor(row.member_user_id, row.member_public_id, row.member_nickname)
      : null,
    owner: row.owner_user_id
      ? toAuthor(row.owner_user_id, row.owner_public_id, row.owner_nickname)
      : null,
  };
}

function mapShareSettingRow(row) {
  if (!row) {
    return null;
  }

  return {
    ownerUserId: Number(row.owner_user_id),
    bucketKey: row.bucket_key,
    isEnabled: Number(row.is_enabled || 0) === 1,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapSharedTodoRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ownerUserId: Number(row.owner_user_id),
    bucketKey: row.bucket_key,
    title: row.title || '',
    details: row.details || '',
    subtasks: parseSubtasks(row.subtasks_json),
    priority: Number(row.priority || 2),
    dueDate: row.due_date || '',
    isDone: Number(row.is_done || 0) === 1,
    revision: Number(row.revision || 1),
    createdByUserId: Number(row.created_by_user_id),
    updatedByUserId: Number(row.updated_by_user_id),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    completedAt: row.completed_at || null,
    author: toAuthor(row.created_by_user_id, row.author_public_id, row.author_nickname),
    updatedBy: toAuthor(row.updated_by_user_id, row.updated_public_id, row.updated_nickname),
  };
}

function mapCommentRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    todoId: row.todo_id,
    ownerUserId: Number(row.owner_user_id),
    authorUserId: Number(row.author_user_id),
    body: row.body || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    deletedAt: row.deleted_at || null,
    author: toAuthor(row.author_user_id, row.author_public_id, row.author_nickname),
  };
}

function createCollabRepository(dependencies = {}) {
  const {
    run,
    get,
    all,
  } = dependencies;

  async function withTransaction(work) {
    await run('BEGIN IMMEDIATE');
    try {
      const result = await work();
      await run('COMMIT');
      return result;
    } catch (error) {
      try {
        await run('ROLLBACK');
      } catch {
        // Ignore rollback failures.
      }
      throw error;
    }
  }

  return {
    withTransaction,
    getUserById: (userId) =>
      get(
        `SELECT id, kakao_id, nickname, email, profile_image, public_id, public_id_normalized, public_id_updated_at
         FROM users
         WHERE id = ?`,
        [userId],
      ),
    findUserByPublicIdNormalized: (normalized) =>
      get(
        `SELECT id, kakao_id, nickname, email, profile_image, public_id, public_id_normalized, public_id_updated_at
         FROM users
         WHERE public_id_normalized = ?`,
        [normalized],
      ),
    updateUserPublicId: ({ userId, publicId, publicIdNormalized, updatedAt }) =>
      run(
        `
        UPDATE users
        SET
          public_id = ?,
          public_id_normalized = ?,
          public_id_updated_at = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `,
        [publicId, publicIdNormalized, updatedAt, userId],
      ),
    getShareSetting: async ({ ownerUserId, bucketKey }) => {
      const row = await get(
        `
        SELECT owner_user_id, bucket_key, is_enabled, created_at, updated_at
        FROM bucket_share_settings
        WHERE owner_user_id = ?
          AND bucket_key = ?
        LIMIT 1
      `,
        [ownerUserId, bucketKey],
      );
      return mapShareSettingRow(row);
    },
    listShareSettings: async (ownerUserId) => {
      const rows = await all(
        `
        SELECT owner_user_id, bucket_key, is_enabled, created_at, updated_at
        FROM bucket_share_settings
        WHERE owner_user_id = ?
        ORDER BY bucket_key ASC
      `,
        [ownerUserId],
      );
      return rows.map(mapShareSettingRow);
    },
    upsertShareSetting: ({ ownerUserId, bucketKey, isEnabled, now }) =>
      run(
        `
        INSERT INTO bucket_share_settings (
          owner_user_id,
          bucket_key,
          is_enabled,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, bucket_key)
        DO UPDATE SET
          is_enabled = excluded.is_enabled,
          updated_at = excluded.updated_at
      `,
        [ownerUserId, bucketKey, isEnabled ? 1 : 0, now, now],
      ),
    hasShareActivity: async ({ ownerUserId, bucketKey }) => {
      const membership = await get(
        `
        SELECT 1 AS yes
        FROM bucket_share_memberships
        WHERE owner_user_id = ?
          AND bucket_key = ?
          AND status = 'active'
        LIMIT 1
      `,
        [ownerUserId, bucketKey],
      );
      if (membership) {
        return true;
      }

      const invite = await get(
        `
        SELECT 1 AS yes
        FROM bucket_share_invites
        WHERE owner_user_id = ?
          AND bucket_key = ?
          AND status = 'pending'
        LIMIT 1
      `,
        [ownerUserId, bucketKey],
      );
      if (invite) {
        return true;
      }

      const todo = await get(
        `
        SELECT 1 AS yes
        FROM shared_bucket_todos
        WHERE owner_user_id = ?
          AND bucket_key = ?
        LIMIT 1
      `,
        [ownerUserId, bucketKey],
      );
      return Boolean(todo);
    },
    cancelPendingInvitesByOwnerBucket: ({ ownerUserId, bucketKey, now }) =>
      run(
        `
        UPDATE bucket_share_invites
        SET
          status = 'cancelled',
          updated_at = ?,
          responded_at = ?
        WHERE owner_user_id = ?
          AND bucket_key = ?
          AND status = 'pending'
      `,
        [now, now, ownerUserId, bucketKey],
      ),
    deactivateMembershipsByOwnerBucket: ({ ownerUserId, bucketKey, now }) =>
      run(
        `
        UPDATE bucket_share_memberships
        SET
          status = 'removed',
          updated_at = ?
        WHERE owner_user_id = ?
          AND bucket_key = ?
          AND status = 'active'
      `,
        [now, ownerUserId, bucketKey],
      ),
    createInvite: (invite) =>
      run(
        `
        INSERT INTO bucket_share_invites (
          id,
          owner_user_id,
          bucket_key,
          invitee_user_id,
          inviter_user_id,
          status,
          created_at,
          updated_at,
          responded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          invite.id,
          invite.ownerUserId,
          invite.bucketKey,
          invite.inviteeUserId,
          invite.inviterUserId,
          invite.status,
          invite.createdAt,
          invite.updatedAt,
          invite.respondedAt,
        ],
      ),
    getInviteById: async (inviteId) => {
      const row = await get(
        `
        SELECT
          i.*,
          owner.public_id AS owner_public_id,
          owner.nickname AS owner_nickname,
          inviter.public_id AS inviter_public_id,
          inviter.nickname AS inviter_nickname,
          invitee.public_id AS invitee_public_id,
          invitee.nickname AS invitee_nickname
        FROM bucket_share_invites i
        JOIN users owner ON owner.id = i.owner_user_id
        JOIN users inviter ON inviter.id = i.inviter_user_id
        JOIN users invitee ON invitee.id = i.invitee_user_id
        WHERE i.id = ?
      `,
        [inviteId],
      );
      return mapInviteRow(row);
    },
    listReceivedInvites: async (userId) => {
      const rows = await all(
        `
        SELECT
          i.*,
          owner.public_id AS owner_public_id,
          owner.nickname AS owner_nickname,
          inviter.public_id AS inviter_public_id,
          inviter.nickname AS inviter_nickname,
          invitee.public_id AS invitee_public_id,
          invitee.nickname AS invitee_nickname
        FROM bucket_share_invites i
        JOIN users owner ON owner.id = i.owner_user_id
        JOIN users inviter ON inviter.id = i.inviter_user_id
        JOIN users invitee ON invitee.id = i.invitee_user_id
        WHERE i.invitee_user_id = ?
        ORDER BY datetime(i.created_at) DESC, i.id DESC
      `,
        [userId],
      );
      return rows.map(mapInviteRow);
    },
    listSentInvites: async (userId) => {
      const rows = await all(
        `
        SELECT
          i.*,
          owner.public_id AS owner_public_id,
          owner.nickname AS owner_nickname,
          inviter.public_id AS inviter_public_id,
          inviter.nickname AS inviter_nickname,
          invitee.public_id AS invitee_public_id,
          invitee.nickname AS invitee_nickname
        FROM bucket_share_invites i
        JOIN users owner ON owner.id = i.owner_user_id
        JOIN users inviter ON inviter.id = i.inviter_user_id
        JOIN users invitee ON invitee.id = i.invitee_user_id
        WHERE i.inviter_user_id = ?
        ORDER BY datetime(i.created_at) DESC, i.id DESC
      `,
        [userId],
      );
      return rows.map(mapInviteRow);
    },
    findPendingInvite: async ({ ownerUserId, bucketKey, inviteeUserId }) => {
      const row = await get(
        `
        SELECT
          i.*,
          owner.public_id AS owner_public_id,
          owner.nickname AS owner_nickname,
          inviter.public_id AS inviter_public_id,
          inviter.nickname AS inviter_nickname,
          invitee.public_id AS invitee_public_id,
          invitee.nickname AS invitee_nickname
        FROM bucket_share_invites i
        JOIN users owner ON owner.id = i.owner_user_id
        JOIN users inviter ON inviter.id = i.inviter_user_id
        JOIN users invitee ON invitee.id = i.invitee_user_id
        WHERE i.owner_user_id = ?
          AND i.bucket_key = ?
          AND i.invitee_user_id = ?
          AND i.status = 'pending'
        ORDER BY datetime(i.created_at) DESC
        LIMIT 1
      `,
        [ownerUserId, bucketKey, inviteeUserId],
      );
      return mapInviteRow(row);
    },
    updateInviteStatus: ({ inviteId, status, updatedAt, respondedAt = null }) =>
      run(
        `
        UPDATE bucket_share_invites
        SET
          status = ?,
          updated_at = ?,
          responded_at = ?
        WHERE id = ?
      `,
        [status, updatedAt, respondedAt, inviteId],
      ),
    findActiveMembership: async ({ ownerUserId, bucketKey, memberUserId }) => {
      const row = await get(
        `
        SELECT
          m.*,
          member.public_id AS member_public_id,
          member.nickname AS member_nickname,
          owner.public_id AS owner_public_id,
          owner.nickname AS owner_nickname
        FROM bucket_share_memberships m
        JOIN users member ON member.id = m.member_user_id
        JOIN users owner ON owner.id = m.owner_user_id
        WHERE m.owner_user_id = ?
          AND m.bucket_key = ?
          AND m.member_user_id = ?
          AND m.status = 'active'
        LIMIT 1
      `,
        [ownerUserId, bucketKey, memberUserId],
      );
      return mapMembershipRow(row);
    },
    upsertMembershipActive: ({ ownerUserId, bucketKey, memberUserId, role, now }) =>
      run(
        `
        INSERT INTO bucket_share_memberships (
          owner_user_id,
          bucket_key,
          member_user_id,
          role,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT(owner_user_id, bucket_key, member_user_id)
        DO UPDATE SET
          role = excluded.role,
          status = 'active',
          updated_at = excluded.updated_at
      `,
        [ownerUserId, bucketKey, memberUserId, role, now, now],
      ),
    getMembershipById: async (membershipId) => {
      const row = await get(
        `
        SELECT
          m.*,
          member.public_id AS member_public_id,
          member.nickname AS member_nickname,
          owner.public_id AS owner_public_id,
          owner.nickname AS owner_nickname
        FROM bucket_share_memberships m
        JOIN users member ON member.id = m.member_user_id
        JOIN users owner ON owner.id = m.owner_user_id
        WHERE m.id = ?
      `,
        [membershipId],
      );
      return mapMembershipRow(row);
    },
    deactivateMembership: ({ membershipId, now }) =>
      run(
        `
        UPDATE bucket_share_memberships
        SET status = 'removed', updated_at = ?
        WHERE id = ?
      `,
        [now, membershipId],
      ),
    listOwnedMemberships: async (ownerUserId) => {
      const rows = await all(
        `
        SELECT
          m.*,
          member.public_id AS member_public_id,
          member.nickname AS member_nickname
        FROM bucket_share_memberships m
        JOIN users member ON member.id = m.member_user_id
        WHERE m.owner_user_id = ?
          AND m.status = 'active'
        ORDER BY m.bucket_key ASC, datetime(m.created_at) ASC, m.id ASC
      `,
        [ownerUserId],
      );
      return rows.map(mapMembershipRow);
    },
    listJoinedMemberships: async (memberUserId) => {
      const rows = await all(
        `
        SELECT
          m.*,
          owner.public_id AS owner_public_id,
          owner.nickname AS owner_nickname
        FROM bucket_share_memberships m
        JOIN users owner ON owner.id = m.owner_user_id
        WHERE m.member_user_id = ?
          AND m.status = 'active'
        ORDER BY datetime(m.created_at) DESC, m.id DESC
      `,
        [memberUserId],
      );
      return rows.map(mapMembershipRow);
    },
    createSharedTodo: (todo) =>
      run(
        `
        INSERT INTO shared_bucket_todos (
          id,
          owner_user_id,
          bucket_key,
          title,
          details,
          subtasks_json,
          priority,
          due_date,
          is_done,
          revision,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at,
          completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          todo.id,
          todo.ownerUserId,
          todo.bucketKey,
          todo.title,
          todo.details,
          todo.subtasksJson,
          todo.priority,
          todo.dueDate,
          todo.isDone ? 1 : 0,
          todo.revision,
          todo.createdByUserId,
          todo.updatedByUserId,
          todo.createdAt,
          todo.updatedAt,
          todo.completedAt,
        ],
      ),
    listSharedTodos: async ({ ownerUserId, bucketKey }) => {
      const rows = await all(
        `
        SELECT
          t.*,
          cu.public_id AS author_public_id,
          cu.nickname AS author_nickname,
          uu.public_id AS updated_public_id,
          uu.nickname AS updated_nickname
        FROM shared_bucket_todos t
        JOIN users cu ON cu.id = t.created_by_user_id
        JOIN users uu ON uu.id = t.updated_by_user_id
        WHERE t.owner_user_id = ?
          AND t.bucket_key = ?
        ORDER BY t.is_done ASC, t.priority ASC, datetime(t.updated_at) DESC, t.id DESC
      `,
        [ownerUserId, bucketKey],
      );
      return rows.map(mapSharedTodoRow);
    },
    getSharedTodoById: async (todoId) => {
      const row = await get(
        `
        SELECT
          t.*,
          cu.public_id AS author_public_id,
          cu.nickname AS author_nickname,
          uu.public_id AS updated_public_id,
          uu.nickname AS updated_nickname
        FROM shared_bucket_todos t
        JOIN users cu ON cu.id = t.created_by_user_id
        JOIN users uu ON uu.id = t.updated_by_user_id
        WHERE t.id = ?
      `,
        [todoId],
      );
      return mapSharedTodoRow(row);
    },
    updateSharedTodo: ({ todoId, title, details, subtasksJson, priority, dueDate, isDone, revision, updatedByUserId, updatedAt, completedAt }) =>
      run(
        `
        UPDATE shared_bucket_todos
        SET
          title = ?,
          details = ?,
          subtasks_json = ?,
          priority = ?,
          due_date = ?,
          is_done = ?,
          revision = ?,
          updated_by_user_id = ?,
          updated_at = ?,
          completed_at = ?
        WHERE id = ?
      `,
        [
          title,
          details,
          subtasksJson,
          priority,
          dueDate,
          isDone ? 1 : 0,
          revision,
          updatedByUserId,
          updatedAt,
          completedAt,
          todoId,
        ],
      ),
    deleteSharedTodo: (todoId) =>
      run('DELETE FROM shared_bucket_todos WHERE id = ?', [todoId]),
    createComment: (comment) =>
      run(
        `
        INSERT INTO shared_todo_comments (
          id,
          todo_id,
          owner_user_id,
          author_user_id,
          body,
          created_at,
          updated_at,
          deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      `,
        [
          comment.id,
          comment.todoId,
          comment.ownerUserId,
          comment.authorUserId,
          comment.body,
          comment.createdAt,
          comment.updatedAt,
        ],
      ),
    listCommentsByTodo: async (todoId) => {
      const rows = await all(
        `
        SELECT
          c.*,
          u.public_id AS author_public_id,
          u.nickname AS author_nickname
        FROM shared_todo_comments c
        JOIN users u ON u.id = c.author_user_id
        WHERE c.todo_id = ?
          AND c.deleted_at IS NULL
        ORDER BY datetime(c.created_at) ASC, c.id ASC
      `,
        [todoId],
      );
      return rows.map(mapCommentRow);
    },
    getCommentById: async (commentId) => {
      const row = await get(
        `
        SELECT
          c.*,
          u.public_id AS author_public_id,
          u.nickname AS author_nickname
        FROM shared_todo_comments c
        JOIN users u ON u.id = c.author_user_id
        WHERE c.id = ?
      `,
        [commentId],
      );
      return mapCommentRow(row);
    },
    markCommentDeleted: ({ commentId, deletedAt, updatedAt }) =>
      run(
        `
        UPDATE shared_todo_comments
        SET
          deleted_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
        [deletedAt, updatedAt, commentId],
      ),
    deleteCommentsByTodo: (todoId) =>
      run('DELETE FROM shared_todo_comments WHERE todo_id = ?', [todoId]),
  };
}

module.exports = {
  createCollabRepository,
};
