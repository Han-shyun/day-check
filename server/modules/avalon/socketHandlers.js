'use strict';

const {
  createRoom,
  getRoom,
  addPlayer,
  startGame,
  advanceRoleReveal,
  proposeTeam,
  castVote,
  proceedToQuest,
  castQuestVote,
  advanceAfterQuestResult,
  assassinate,
  getPublicState,
  getPrivateState,
  getVoteStatus,
  getQuestVoteStatus,
  getVoteResult,
} = require('./gameLogic');

function emit(socket, event, data) {
  socket.emit(event, data);
}

function broadcast(io, roomCode, event, data) {
  io.to(roomCode).emit(event, data);
}

function emitError(socket, message) {
  socket.emit('error_msg', { message });
}

function syncRoom(io, room) {
  broadcast(io, room.code, 'state_update', getPublicState(room));
}

function attachHandlers(io) {
  io.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentPlayerId = null;

    // ── 방 만들기 ──────────────────────────────
    socket.on('create_room', ({ name } = {}) => {
      const room = createRoom(name);
      const result = addPlayer(room, socket.id, name || '방장');
      if (result.error) return emitError(socket, result.error);

      currentRoomCode = room.code;
      currentPlayerId = result.player.id;
      socket.join(room.code);

      emit(socket, 'room_created', {
        roomCode: room.code,
        playerId: result.player.id,
        playerName: result.player.name,
      });
      syncRoom(io, room);
    });

    // ── 방 참가 ──────────────────────────────
    socket.on('join_room', ({ roomCode, name } = {}) => {
      const room = getRoom(roomCode);
      if (!room) return emitError(socket, '방을 찾을 수 없어요. 코드를 확인해주세요.');

      const result = addPlayer(room, socket.id, name || '');
      if (result.error) return emitError(socket, result.error);

      currentRoomCode = room.code;
      currentPlayerId = result.player.id;
      socket.join(room.code);

      emit(socket, 'room_joined', {
        roomCode: room.code,
        playerId: result.player.id,
        playerName: result.player.name,
      });
      syncRoom(io, room);
    });

    // ── 재접속 ──────────────────────────────
    socket.on('rejoin_room', ({ roomCode, playerId } = {}) => {
      const room = getRoom(roomCode);
      if (!room) return emitError(socket, '방을 찾을 수 없어요.');

      const player = room.players.find(p => p.id === playerId);
      if (!player) return emitError(socket, '플레이어를 찾을 수 없어요.');

      player.socketId = socket.id;
      player.connected = true;
      currentRoomCode = room.code;
      currentPlayerId = playerId;
      socket.join(room.code);

      emit(socket, 'room_joined', { roomCode, playerId, playerName: player.name });
      emit(socket, 'state_update', getPublicState(room));

      // 개인 상태도 전송
      if (room.phase !== 'lobby') {
        emit(socket, 'private_state', getPrivateState(room, playerId));
      }
    });

    // ── 게임 시작 ──────────────────────────────
    socket.on('start_game', () => {
      const room = getRoom(currentRoomCode);
      if (!room) return emitError(socket, '방을 찾을 수 없어요.');
      if (room.hostId !== currentPlayerId) return emitError(socket, '방장만 게임을 시작할 수 있어요.');

      const result = startGame(room);
      if (result.error) return emitError(socket, result.error);

      syncRoom(io, room);

      // 각 플레이어에게 개인 역할 전송
      for (const player of room.players) {
        const targetSocket = io.sockets.sockets.get(player.socketId);
        if (targetSocket) {
          targetSocket.emit('private_state', getPrivateState(room, player.id));
        }
      }

      // 현재 역할 확인 차례인 플레이어 알림
      broadcast(io, room.code, 'role_reveal_turn', {
        currentIndex: room.roleRevealIndex,
        playerName: room.players[room.roleRevealIndex].name,
      });
    });

    // ── 역할 확인 완료 (다음 사람으로) ──────────
    socket.on('role_reveal_done', () => {
      const room = getRoom(currentRoomCode);
      if (!room) return;
      if (room.phase !== 'role_reveal') return;
      if (room.players[room.roleRevealIndex]?.id !== currentPlayerId) {
        return emitError(socket, '아직 당신의 차례가 아니에요.');
      }

      const result = advanceRoleReveal(room);
      syncRoom(io, room);

      if (!result.done) {
        broadcast(io, room.code, 'role_reveal_turn', {
          currentIndex: room.roleRevealIndex,
          playerName: room.players[room.roleRevealIndex].name,
        });
      }
    });

    // ── 팀 제안 ──────────────────────────────
    socket.on('propose_team', ({ teamIds } = {}) => {
      const room = getRoom(currentRoomCode);
      if (!room) return;

      const result = proposeTeam(room, currentPlayerId, teamIds || []);
      if (result.error) return emitError(socket, result.error);

      syncRoom(io, room);
      broadcast(io, room.code, 'vote_started', { proposedTeam: room.proposedTeam });
    });

    // ── 팀 투표 ──────────────────────────────
    socket.on('cast_vote', ({ vote } = {}) => {
      const room = getRoom(currentRoomCode);
      if (!room) return;
      if (!currentPlayerId) return;

      const result = castVote(room, currentPlayerId, vote);
      if (result.error) return emitError(socket, result.error);

      // 투표 현황 업데이트
      broadcast(io, room.code, 'vote_status', getVoteStatus(room));

      if (result.waiting) return;

      // 투표 완료
      const voteResult = getVoteResult(room);
      broadcast(io, room.code, 'vote_result', {
        ...voteResult,
        rejectionCount: room.rejectionCount,
        evilWins: result.evilWins || false,
      });

      syncRoom(io, room);
    });

    // ── 투표 결과 확인 후 퀘스트로 이동 ──────────
    socket.on('proceed_to_quest', () => {
      const room = getRoom(currentRoomCode);
      if (!room) return;
      if (room.phase !== 'vote_result') return;

      const approves = Object.values(room.votes).filter(v => v === 'approve').length;
      const approved = approves > room.players.length - approves;

      if (approved) {
        proceedToQuest(room);
        syncRoom(io, room);
        broadcast(io, room.code, 'quest_started', { team: room.proposedTeam });
      } else {
        // 거부: 다음 리더로
        if (room.phase !== 'game_over') {
          room.leaderIndex = (room.leaderIndex + 1) % room.players.length;
          room.proposedTeam = [];
          room.phase = 'propose';
        }
        syncRoom(io, room);
      }
    });

    // ── 퀘스트 투표 ──────────────────────────────
    socket.on('cast_quest_vote', ({ vote } = {}) => {
      const room = getRoom(currentRoomCode);
      if (!room) return;

      const result = castQuestVote(room, currentPlayerId, vote);
      if (result.error) return emitError(socket, result.error);

      broadcast(io, room.code, 'quest_vote_status', getQuestVoteStatus(room));

      if (result.waiting) return;

      broadcast(io, room.code, 'quest_result', {
        questIndex: room.currentQuest - 1 + (result.questFailed !== undefined ? 1 : 0),
        questFailed: result.questFailed,
        failCount: result.failCount,
        questResults: room.questResults,
        evilWins: result.evilWins || false,
        goodLeads: result.goodLeads || false,
      });

      syncRoom(io, room);
    });

    // ── 퀘스트 결과 확인 후 다음 라운드 ──────────
    socket.on('next_round', () => {
      const room = getRoom(currentRoomCode);
      if (!room) return;
      if (room.phase !== 'quest_result') return;

      advanceAfterQuestResult(room);
      syncRoom(io, room);
    });

    // ── 암살 ──────────────────────────────
    socket.on('assassinate', ({ targetId } = {}) => {
      const room = getRoom(currentRoomCode);
      if (!room) return;

      const result = assassinate(room, currentPlayerId, targetId);
      if (result.error) return emitError(socket, result.error);

      broadcast(io, room.code, 'assassination_result', {
        merlinFound: result.merlinFound,
        winner: room.winner,
      });
      syncRoom(io, room);
    });

    // ── 게임 재시작 (로비로) ──────────────────────
    socket.on('restart_game', () => {
      const room = getRoom(currentRoomCode);
      if (!room) return;
      if (room.hostId !== currentPlayerId) return emitError(socket, '방장만 재시작할 수 있어요.');

      // 상태 초기화 (플레이어는 유지)
      room.phase = 'lobby';
      room.leaderIndex = 0;
      room.questResults = [];
      room.currentQuest = 0;
      room.proposedTeam = [];
      room.votes = {};
      room.questVotes = {};
      room.rejectionCount = 0;
      room.assassinGuess = null;
      room.winner = null;
      room.roleRevealIndex = 0;
      room.players.forEach(p => { p.role = null; });

      syncRoom(io, room);
    });

    // ── 연결 끊김 ──────────────────────────────
    socket.on('disconnect', () => {
      const room = getRoom(currentRoomCode);
      if (!room) return;

      const player = room.players.find(p => p.id === currentPlayerId);
      if (player) {
        player.connected = false;
        syncRoom(io, room);
      }
    });
  });
}

module.exports = { attachHandlers };
