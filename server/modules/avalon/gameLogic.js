'use strict';

// ──────────────────────────────────────────────
//  역할 정의
// ──────────────────────────────────────────────
const ROLES = {
  MERLIN:    { id: 'MERLIN',    team: 'good', label: '메를린',              icon: '🔮' },
  PERCIVAL:  { id: 'PERCIVAL',  team: 'good', label: '퍼시발',              icon: '⚔️' },
  LOYAL:     { id: 'LOYAL',     team: 'good', label: '아서의 충성스러운 신하', icon: '🛡️' },
  ASSASSIN:  { id: 'ASSASSIN',  team: 'evil', label: '암살자',              icon: '🗡️' },
  MORGANA:   { id: 'MORGANA',   team: 'evil', label: '모가나',              icon: '🔥' },
  MORDRED:   { id: 'MORDRED',   team: 'evil', label: '모드레드',            icon: '💀' },
  OBERON:    { id: 'OBERON',    team: 'evil', label: '오베론',              icon: '🌑' },
  MINION:    { id: 'MINION',    team: 'evil', label: '악의 하수인',          icon: '🐍' },
};

// 인원수별 역할 구성
const ROLE_CONFIGS = {
  5:  ['MERLIN', 'LOYAL', 'LOYAL',    'ASSASSIN', 'MINION'],
  6:  ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'ASSASSIN', 'MORGANA'],
  7:  ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'ASSASSIN', 'MORGANA', 'MINION'],
  8:  ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'LOYAL', 'ASSASSIN', 'MORGANA', 'MORDRED'],
  9:  ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'LOYAL', 'LOYAL', 'ASSASSIN', 'MORGANA', 'MORDRED'],
  10: ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'LOYAL', 'LOYAL', 'ASSASSIN', 'MORGANA', 'MORDRED', 'OBERON'],
};

// 인원수별 퀘스트 팀 인원
const QUEST_SIZES = {
  5:  [2, 3, 2, 3, 3],
  6:  [2, 3, 4, 3, 4],
  7:  [2, 3, 3, 4, 4],
  8:  [3, 4, 4, 5, 5],
  9:  [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

// 7인 이상의 4번째 퀘스트는 실패 카드 2장 필요
function failsRequired(playerCount, questIndex) {
  if (playerCount >= 7 && questIndex === 3) return 2;
  return 1;
}

// ──────────────────────────────────────────────
//  방 관리
// ──────────────────────────────────────────────
const rooms = new Map(); // roomCode → gameState

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createRoom(hostName) {
  const code = generateRoomCode();
  const state = {
    code,
    phase: 'lobby',          // lobby | role_reveal | propose | vote | vote_result | quest | quest_result | assassinate | game_over
    players: [],              // { id, name, role, socketId, connected }
    hostId: null,
    leaderIndex: 0,
    questResults: [],         // 'success' | 'fail' per quest
    currentQuest: 0,
    proposedTeam: [],         // player ids
    votes: {},                // { playerId: 'approve' | 'reject' }
    questVotes: {},           // { playerId: 'success' | 'fail' }
    rejectionCount: 0,
    assassinGuess: null,
    winner: null,
    roleRevealIndex: 0,       // 역할 확인 순번
    createdAt: Date.now(),
  };
  rooms.set(code, state);
  return state;
}

function getRoom(code) {
  return rooms.get(code) || null;
}

function cleanupOldRooms() {
  const now = Date.now();
  const TTL = 4 * 60 * 60 * 1000; // 4시간
  for (const [code, state] of rooms) {
    if (now - state.createdAt > TTL) {
      rooms.delete(code);
    }
  }
}
setInterval(cleanupOldRooms, 30 * 60 * 1000);

// ──────────────────────────────────────────────
//  게임 진행 로직
// ──────────────────────────────────────────────

function addPlayer(room, socketId, name) {
  if (room.phase !== 'lobby') return { error: '게임이 이미 시작됐어요.' };
  if (room.players.length >= 10) return { error: '방이 꽉 찼어요 (최대 10명).' };
  const trimmed = name.trim().slice(0, 16);
  if (!trimmed) return { error: '이름을 입력해주세요.' };
  if (room.players.some(p => p.name === trimmed)) return { error: '이미 사용 중인 이름이에요.' };

  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const player = { id, name: trimmed, role: null, socketId, connected: true };
  room.players.push(player);
  if (!room.hostId) room.hostId = id;
  return { player };
}

function startGame(room) {
  const n = room.players.length;
  if (n < 5 || n > 10) return { error: `5~10명이 필요해요. 현재 ${n}명.` };

  const roleIds = shuffle(ROLE_CONFIGS[n]);
  room.players.forEach((p, i) => { p.role = roleIds[i]; });

  room.phase = 'role_reveal';
  room.roleRevealIndex = 0;
  room.leaderIndex = Math.floor(Math.random() * n);
  return {};
}

function advanceRoleReveal(room) {
  room.roleRevealIndex += 1;
  if (room.roleRevealIndex >= room.players.length) {
    room.phase = 'propose';
    return { done: true };
  }
  return { done: false };
}

function proposeTeam(room, leaderId, teamIds) {
  if (room.phase !== 'propose') return { error: '지금은 팀 제안 단계가 아니에요.' };
  const leader = room.players[room.leaderIndex];
  if (leader.id !== leaderId) return { error: '리더만 팀을 제안할 수 있어요.' };

  const requiredSize = QUEST_SIZES[room.players.length][room.currentQuest];
  if (teamIds.length !== requiredSize) return { error: `퀘스트 ${room.currentQuest + 1}은 ${requiredSize}명이 필요해요.` };

  const validIds = new Set(room.players.map(p => p.id));
  if (!teamIds.every(id => validIds.has(id))) return { error: '잘못된 플레이어 ID가 있어요.' };

  room.proposedTeam = [...teamIds];
  room.votes = {};
  room.phase = 'vote';
  return {};
}

function castVote(room, playerId, vote) {
  if (room.phase !== 'vote') return { error: '지금은 투표 단계가 아니에요.' };
  if (!['approve', 'reject'].includes(vote)) return { error: '잘못된 투표예요.' };
  room.votes[playerId] = vote;

  if (Object.keys(room.votes).length < room.players.length) return { waiting: true };

  // 모든 투표 완료
  const approves = Object.values(room.votes).filter(v => v === 'approve').length;
  const rejects = room.players.length - approves;
  const approved = approves > rejects;

  room.phase = 'vote_result';

  if (!approved) {
    room.rejectionCount += 1;
    if (room.rejectionCount >= 5) {
      room.winner = 'evil';
      room.phase = 'game_over';
      return { approved: false, rejected: true, evilWins: true };
    }
    return { approved: false };
  }

  room.rejectionCount = 0;
  room.questVotes = {};
  return { approved: true };
}

function proceedToQuest(room) {
  room.phase = 'quest';
  room.questVotes = {};
}

function castQuestVote(room, playerId, vote) {
  if (room.phase !== 'quest') return { error: '지금은 퀘스트 단계가 아니에요.' };
  if (!room.proposedTeam.includes(playerId)) return { error: '퀘스트 팀원만 투표할 수 있어요.' };
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { error: '플레이어를 찾을 수 없어요.' };

  // 선 진영은 실패 카드 사용 불가
  if (ROLES[player.role].team === 'good' && vote === 'fail') {
    return { error: '선 진영은 실패 카드를 사용할 수 없어요.' };
  }
  if (!['success', 'fail'].includes(vote)) return { error: '잘못된 투표예요.' };

  room.questVotes[playerId] = vote;

  if (Object.keys(room.questVotes).length < room.proposedTeam.length) return { waiting: true };

  // 모든 퀘스트 투표 완료
  const fails = Object.values(room.questVotes).filter(v => v === 'fail').length;
  const required = failsRequired(room.players.length, room.currentQuest);
  const questFailed = fails >= required;

  room.questResults.push(questFailed ? 'fail' : 'success');

  const successes = room.questResults.filter(r => r === 'success').length;
  const failures = room.questResults.filter(r => r === 'fail').length;

  room.phase = 'quest_result';

  if (failures >= 3) {
    room.winner = 'evil';
    room.phase = 'game_over';
    return { questFailed, failCount: fails, evilWins: true };
  }

  if (successes >= 3) {
    // 암살 단계로
    room.phase = 'assassinate';
    return { questFailed: false, failCount: fails, goodLeads: true };
  }

  return { questFailed, failCount: fails };
}

function advanceAfterQuestResult(room) {
  room.currentQuest += 1;
  room.leaderIndex = (room.leaderIndex + 1) % room.players.length;
  room.proposedTeam = [];
  room.phase = 'propose';
}

function assassinate(room, assassinId, targetId) {
  if (room.phase !== 'assassinate') return { error: '지금은 암살 단계가 아니에요.' };
  const assassin = room.players.find(p => p.id === assassinId);
  if (!assassin || assassin.role !== 'ASSASSIN') return { error: '암살자만 암살을 수행할 수 있어요.' };
  const target = room.players.find(p => p.id === targetId);
  if (!target) return { error: '대상을 찾을 수 없어요.' };

  room.assassinGuess = targetId;

  if (target.role === 'MERLIN') {
    room.winner = 'evil';
  } else {
    room.winner = 'good';
  }
  room.phase = 'game_over';
  return { merlinFound: target.role === 'MERLIN' };
}

// ──────────────────────────────────────────────
//  플레이어 시야 계산 (역할별 공개 정보)
// ──────────────────────────────────────────────
function getVisionFor(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return [];

  const role = player.role;
  const vision = [];

  switch (role) {
    case 'MERLIN':
      // 악 진영(모드레드 제외)을 악으로 봄
      for (const p of room.players) {
        if (p.id === playerId) continue;
        const r = ROLES[p.role];
        if (r.team === 'evil' && p.role !== 'MORDRED') {
          vision.push({ id: p.id, name: p.name, seen: 'evil' });
        }
      }
      break;

    case 'PERCIVAL':
      // 메를린 & 모가나를 "메를린 후보"로 봄 (누가 진짜인지 모름)
      for (const p of room.players) {
        if (p.id === playerId) continue;
        if (p.role === 'MERLIN' || p.role === 'MORGANA') {
          vision.push({ id: p.id, name: p.name, seen: 'merlin_candidate' });
        }
      }
      break;

    case 'ASSASSIN':
    case 'MORGANA':
    case 'MORDRED':
    case 'MINION':
      // 악 진영 서로 알아봄 (오베론 제외)
      for (const p of room.players) {
        if (p.id === playerId) continue;
        const r = ROLES[p.role];
        if (r.team === 'evil' && p.role !== 'OBERON') {
          vision.push({ id: p.id, name: p.name, seen: 'evil_ally', role: p.role });
        }
      }
      break;

    // LOYAL, OBERON: 아무것도 모름
    default:
      break;
  }

  return vision;
}

// ──────────────────────────────────────────────
//  공개용 방 상태 (role 미포함)
// ──────────────────────────────────────────────
function getPublicState(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      // game_over 때는 역할 공개
      role: room.phase === 'game_over' ? p.role : undefined,
    })),
    hostId: room.hostId,
    leaderIndex: room.leaderIndex,
    currentQuest: room.currentQuest,
    questResults: room.questResults,
    proposedTeam: room.proposedTeam,
    rejectionCount: room.rejectionCount,
    questSizes: QUEST_SIZES[room.players.length] || null,
    winner: room.winner,
    assassinGuess: room.phase === 'game_over' ? room.assassinGuess : undefined,
  };
}

// 특정 플레이어에게만 보내는 개인 상태
function getPrivateState(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  return {
    playerId,
    role: player.role,
    roleInfo: ROLES[player.role],
    vision: getVisionFor(room, playerId),
  };
}

// 투표 현황 (누가 투표했는지만, 내용은 비공개)
function getVoteStatus(room) {
  return {
    voted: Object.keys(room.votes),
    total: room.players.length,
  };
}

// 퀘스트 투표 현황
function getQuestVoteStatus(room) {
  return {
    voted: Object.keys(room.questVotes),
    total: room.proposedTeam.length,
  };
}

// 투표 결과 공개
function getVoteResult(room) {
  const approves = Object.values(room.votes).filter(v => v === 'approve').length;
  const rejects = Object.values(room.votes).filter(v => v === 'reject').length;
  return {
    votes: room.players.map(p => ({ id: p.id, name: p.name, vote: room.votes[p.id] || null })),
    approves,
    rejects,
    approved: approves > rejects,
  };
}

module.exports = {
  ROLES,
  ROLE_CONFIGS,
  QUEST_SIZES,
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
};
