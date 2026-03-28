/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   아발론 클라이언트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  // ── 역할 설명 ──────────────────────────────────────────────────
  const ROLE_INFO = {
    MERLIN:   { label: '메를린',              icon: '🔮', team: 'good', desc: '악의 하수인을 알 수 있지만, 정체를 들키지 마세요. 모드레드는 보이지 않습니다.' },
    PERCIVAL: { label: '퍼시발',              icon: '⚔️', team: 'good', desc: '메를린과 모가나를 볼 수 있지만 누가 진짜 메를린인지 모릅니다.' },
    LOYAL:    { label: '아서의 충성스러운 신하', icon: '🛡️', team: 'good', desc: '특별한 정보는 없지만, 선 진영을 위해 퀘스트를 성공시키세요.' },
    ASSASSIN: { label: '암살자',              icon: '🗡️', team: 'evil', desc: '선 진영이 3번 이기면 메를린을 암살하세요. 동료 악 진영을 알 수 있습니다.' },
    MORGANA:  { label: '모가나',              icon: '🔥', team: 'evil', desc: '퍼시발에게 메를린처럼 보입니다. 동료 악 진영을 알 수 있습니다.' },
    MORDRED:  { label: '모드레드',            icon: '💀', team: 'evil', desc: '메를린에게도 정체가 숨겨집니다. 동료 악 진영을 알 수 있습니다.' },
    OBERON:   { label: '오베론',              icon: '🌑', team: 'evil', desc: '악 진영에게도 알려지지 않고, 동료도 알 수 없습니다. 혼자서 방해하세요.' },
    MINION:   { label: '악의 하수인',          icon: '🐍', team: 'evil', desc: '동료 악 진영을 알 수 있습니다.' },
  };

  const VISION_LABELS = {
    evil:            { dot: 'evil',            text: (name) => `${name} — 악의 하수인` },
    merlin_candidate:{ dot: 'merlin-candidate', text: (name) => `${name} — 메를린 (혹은 모가나)` },
    evil_ally:       { dot: 'evil-ally',        text: (name, role) => `${name} — ${ROLE_INFO[role]?.label || '동료'}` },
  };

  const PHASE_LABELS = {
    lobby:        '로비',
    role_reveal:  '역할 확인',
    propose:      '팀 제안',
    vote:         '투표',
    vote_result:  '투표 결과',
    quest:        '퀘스트',
    quest_result: '퀘스트 결과',
    assassinate:  '암살',
    game_over:    '게임 종료',
  };

  // ── 상태 ──────────────────────────────────────────────────────
  let socket = null;
  let myPlayerId = null;
  let myRoomCode = null;
  let gameState = null;    // 서버에서 받은 공개 상태
  let privateState = null; // 내 개인 상태 (역할, 시야)
  let voteSubmitted = false;
  let questVoteSubmitted = false;
  let selectedTeam = new Set();
  let assassinTarget = null;
  let roleRevealed = false;

  // ── 화면 전환 ────────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function showPanel(id) {
    const panels = [
      'panel-role-reveal','panel-quests','panel-propose',
      'panel-vote','panel-vote-result','panel-quest',
      'panel-quest-result','panel-assassinate','panel-game-over',
    ];
    panels.forEach(p => {
      const el = document.getElementById(p);
      if (el) el.classList.add('hidden');
    });
    if (id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    }
  }

  // ── 오류 표시 ────────────────────────────────────────────────
  function showLobbyError(msg) {
    const el = document.getElementById('lobby-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function clearLobbyError() {
    document.getElementById('lobby-error').classList.add('hidden');
  }
  function showRoomError(msg) {
    const el = document.getElementById('room-error');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }

  // ── 아바타 색상 ──────────────────────────────────────────────
  function avatarInitial(name) {
    return (name || '?')[0].toUpperCase();
  }

  // ── 플레이어 목록 렌더 ────────────────────────────────────────
  function renderPlayerList(state) {
    const ul = document.getElementById('player-list');
    ul.innerHTML = '';
    document.getElementById('player-count').textContent = state.players.length;

    state.players.forEach((p, idx) => {
      const isMe = p.id === myPlayerId;
      const isHost = p.id === state.hostId;
      const isLeader = idx === state.leaderIndex && state.phase !== 'lobby' && state.phase !== 'role_reveal' && state.phase !== 'game_over';

      const li = document.createElement('li');
      li.className = 'player-item';

      let tags = '';
      if (isHost) tags += `<span class="player-tag host">방장</span>`;
      if (isLeader) tags += `<span class="player-tag leader">리더</span>`;
      if (isMe) tags += `<span class="player-tag you">나</span>`;
      if (!p.connected) tags += `<span class="player-tag disconnected">오프라인</span>`;
      if (state.phase === 'game_over' && p.role) {
        const ri = ROLE_INFO[p.role];
        const teamClass = ri ? ri.team : 'good';
        const roleLabel = ri ? ri.label : p.role;
        tags += `<span class="role-badge ${teamClass}">${ri?.icon || ''} ${roleLabel}</span>`;
      }

      li.innerHTML = `
        <div class="player-avatar">${avatarInitial(p.name)}</div>
        <span class="player-name">${escHtml(p.name)}</span>
        ${tags}
      `;
      ul.appendChild(li);
    });
  }

  // ── 퀘스트 트래커 렌더 ───────────────────────────────────────
  function renderQuestTrack(state) {
    const track = document.getElementById('quest-track');
    if (!state.questSizes) return;
    track.innerHTML = '';

    state.questSizes.forEach((size, i) => {
      const result = state.questResults[i];
      const isCurrent = i === state.currentQuest && !result;

      let cls = '';
      if (result === 'success') cls = 'success';
      else if (result === 'fail') cls = 'fail';
      else if (isCurrent) cls = 'current';

      let icon = '';
      if (result === 'success') icon = '✅';
      else if (result === 'fail') icon = '💀';
      else icon = String(i + 1);

      const node = document.createElement('div');
      node.className = `quest-node ${cls}`;
      node.innerHTML = `
        <div class="quest-node-circle">${icon}</div>
        <div class="quest-node-label">Q${i + 1}</div>
        <div class="quest-node-size">${size}명</div>
      `;
      track.appendChild(node);
    });

    // 거부 도트
    const dots = document.getElementById('rejection-dots');
    dots.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const dot = document.createElement('div');
      dot.className = `rejection-dot ${i < state.rejectionCount ? 'filled' : ''}`;
      dots.appendChild(dot);
    }
  }

  // ── 상태 업데이트 메인 핸들러 ────────────────────────────────
  function handleStateUpdate(state) {
    gameState = state;

    document.getElementById('display-room-code').textContent = state.code;
    document.getElementById('phase-badge').textContent = PHASE_LABELS[state.phase] || state.phase;

    showScreen('screen-room');
    renderPlayerList(state);

    // 방장 "게임 시작" 버튼
    const btnStart = document.getElementById('btn-start-game');
    const startHint = document.getElementById('start-hint');
    if (state.phase === 'lobby' && state.hostId === myPlayerId) {
      btnStart.classList.remove('hidden');
      btnStart.disabled = state.players.length < 5 || state.players.length > 10;
    } else {
      btnStart.classList.add('hidden');
    }
    if (state.phase === 'lobby') {
      startHint.classList.remove('hidden');
      showPanel(null);
    } else {
      startHint.classList.add('hidden');
    }

    switch (state.phase) {
      case 'lobby':
        break;
      case 'role_reveal':
        showPanel('panel-role-reveal');
        break;
      case 'propose':
        showPanel('panel-quests');
        renderQuestTrack(state);
        renderProposePanel(state);
        break;
      case 'vote':
        showPanel('panel-vote');
        renderVotePanel(state);
        break;
      case 'vote_result':
        showPanel('panel-vote-result');
        renderQuestTrack(state);
        break;
      case 'quest':
        showPanel('panel-quest');
        renderQuestTrack(state);
        renderQuestPanel(state);
        break;
      case 'quest_result':
        showPanel('panel-quest-result');
        renderQuestTrack(state);
        break;
      case 'assassinate':
        showPanel('panel-assassinate');
        renderAssassinatePanel(state);
        break;
      case 'game_over':
        showPanel('panel-game-over');
        renderGameOver(state);
        break;
    }
  }

  // ── 역할 확인 패널 ────────────────────────────────────────────
  function renderRoleRevealPanel(data) {
    // data: { currentIndex, playerName }
    const myIndex = gameState?.players.findIndex(p => p.id === myPlayerId);
    const instruction = document.getElementById('role-reveal-instruction');
    const myTurn = document.getElementById('role-reveal-my-turn');
    const waiting = document.getElementById('role-reveal-waiting');

    roleRevealed = false;

    if (myIndex === data.currentIndex) {
      instruction.textContent = `${data.playerName}님, 기기를 받으세요.`;
      myTurn.classList.remove('hidden');
      waiting.classList.add('hidden');

      // 카드 앞면 다시 보이기
      document.getElementById('role-card-front')?.classList.remove('hidden');
      document.getElementById('role-card-back')?.classList.add('hidden');
      document.getElementById('btn-role-done').classList.add('hidden');
    } else {
      instruction.textContent = `${data.playerName}님이 역할을 확인 중입니다...`;
      myTurn.classList.add('hidden');
      waiting.classList.remove('hidden');
    }
  }

  function renderMyRole() {
    if (!privateState) return;
    const { role, roleInfo, vision } = privateState;
    const ri = ROLE_INFO[role] || {};

    document.getElementById('role-icon').textContent = ri.icon || '';
    document.getElementById('role-name').textContent = ri.label || role;

    const teamEl = document.getElementById('role-team');
    teamEl.textContent = ri.team === 'good' ? '선 진영' : '악 진영';
    teamEl.className = `role-team ${ri.team}`;

    document.getElementById('role-desc').textContent = ri.desc || '';

    const visionPanel = document.getElementById('vision-panel');
    if (vision && vision.length > 0) {
      visionPanel.classList.remove('hidden');
      visionPanel.innerHTML = '<h4>당신이 아는 정보</h4>';
      vision.forEach(v => {
        const info = VISION_LABELS[v.seen];
        if (!info) return;
        const item = document.createElement('div');
        item.className = 'vision-item';
        item.innerHTML = `
          <div class="vision-dot ${info.dot}"></div>
          <span>${escHtml(info.text(v.name, v.role))}</span>
        `;
        visionPanel.appendChild(item);
      });
    } else {
      visionPanel.classList.add('hidden');
    }
  }

  // ── 팀 제안 패널 ──────────────────────────────────────────────
  function renderProposePanel(state) {
    const isLeader = state.players[state.leaderIndex]?.id === myPlayerId;
    const requiredSize = state.questSizes?.[state.currentQuest] || 0;
    const leaderName = state.players[state.leaderIndex]?.name || '';

    const infoEl = document.getElementById('propose-info');
    const leaderArea = document.getElementById('propose-leader-area');
    const waitingArea = document.getElementById('propose-waiting-area');

    if (isLeader) {
      infoEl.textContent = `퀘스트 ${state.currentQuest + 1}: ${requiredSize}명을 선택하세요.`;
      leaderArea.classList.remove('hidden');
      waitingArea.classList.add('hidden');
      document.getElementById('propose-required').textContent = requiredSize;
      document.getElementById('propose-selected-count').textContent = selectedTeam.size;
      renderProposePlayerList(state, requiredSize);
    } else {
      infoEl.textContent = `${leaderName}님이 퀘스트 ${state.currentQuest + 1} 팀을 구성 중입니다...`;
      leaderArea.classList.add('hidden');
      waitingArea.classList.remove('hidden');
    }
  }

  function renderProposePlayerList(state, requiredSize) {
    const ul = document.getElementById('propose-player-list');
    ul.innerHTML = '';
    state.players.forEach(p => {
      const li = document.createElement('li');
      li.className = `propose-item ${selectedTeam.has(p.id) ? 'selected' : ''}`;
      li.dataset.playerId = p.id;
      li.innerHTML = `
        <div class="player-avatar">${avatarInitial(p.name)}</div>
        <span>${escHtml(p.name)}</span>
        <span class="check-icon">✓</span>
      `;
      li.addEventListener('click', () => {
        if (selectedTeam.has(p.id)) {
          selectedTeam.delete(p.id);
          li.classList.remove('selected');
        } else if (selectedTeam.size < requiredSize) {
          selectedTeam.add(p.id);
          li.classList.add('selected');
        }
        document.getElementById('propose-selected-count').textContent = selectedTeam.size;
        document.getElementById('btn-propose').disabled = selectedTeam.size !== requiredSize;
      });
      ul.appendChild(li);
    });
    document.getElementById('btn-propose').disabled = selectedTeam.size !== requiredSize;
  }

  // ── 투표 패널 ─────────────────────────────────────────────────
  function renderVotePanel(state) {
    const teamNames = state.proposedTeam
      .map(id => state.players.find(p => p.id === id)?.name || id)
      .join(', ');
    document.getElementById('vote-proposed-team').textContent = `제안된 팀: ${teamNames}`;
    voteSubmitted = false;
    document.getElementById('vote-buttons').classList.remove('hidden');
    document.getElementById('vote-done-msg').classList.add('hidden');
  }

  // ── 퀘스트 패널 ───────────────────────────────────────────────
  function renderQuestPanel(state) {
    const onTeam = state.proposedTeam.includes(myPlayerId);
    const questEl = document.getElementById('quest-info');
    const btns = document.getElementById('quest-buttons');
    const notOnTeam = document.getElementById('quest-not-on-team');
    const doneMsg = document.getElementById('quest-done-msg');

    questEl.textContent = `퀘스트 ${state.currentQuest + 1}`;
    questVoteSubmitted = false;
    doneMsg.classList.add('hidden');

    if (onTeam) {
      btns.classList.remove('hidden');
      notOnTeam.classList.add('hidden');

      // 선 진영은 실패 버튼 비활성화
      const isGood = privateState && ROLE_INFO[privateState.role]?.team === 'good';
      document.getElementById('btn-quest-fail').disabled = isGood;
      document.getElementById('btn-quest-fail').title = isGood ? '선 진영은 실패 카드를 사용할 수 없어요.' : '';
    } else {
      btns.classList.add('hidden');
      notOnTeam.classList.remove('hidden');
    }
  }

  // ── 암살 패널 ─────────────────────────────────────────────────
  function renderAssassinatePanel(state) {
    const isAssassin = privateState?.role === 'ASSASSIN';
    const assassinArea = document.getElementById('assassin-area');
    const assassinWaiting = document.getElementById('assassin-waiting');

    if (isAssassin) {
      assassinArea.classList.remove('hidden');
      assassinWaiting.classList.add('hidden');
      assassinTarget = null;

      const ul = document.getElementById('assassinate-player-list');
      ul.innerHTML = '';
      // 선 진영 플레이어만 표시 (자신 제외, 악 진영 제외)
      // 암살자는 자신의 팀원 역할을 알지만, 메를린을 맞춰야 하므로 전 플레이어 중 비악 진영 표시
      // 서버가 game_over 전까지 역할 미공개이므로 전 플레이어에서 자신 제외하여 표시
      state.players.forEach(p => {
        if (p.id === myPlayerId) return;
        // 알려진 악 진영 동료 제외 (암살 대상이 될 수 없음)
        const knownEvil = privateState?.vision?.some(v => v.id === p.id && v.seen === 'evil_ally');
        if (knownEvil) return;

        const li = document.createElement('li');
        li.className = `propose-item ${assassinTarget === p.id ? 'selected' : ''}`;
        li.dataset.playerId = p.id;
        li.innerHTML = `
          <div class="player-avatar">${avatarInitial(p.name)}</div>
          <span>${escHtml(p.name)}</span>
          <span class="check-icon">🎯</span>
        `;
        li.addEventListener('click', () => {
          document.querySelectorAll('#assassinate-player-list .propose-item').forEach(el => el.classList.remove('selected'));
          li.classList.add('selected');
          assassinTarget = p.id;
          document.getElementById('btn-assassinate').disabled = false;
        });
        ul.appendChild(li);
      });
      document.getElementById('btn-assassinate').disabled = true;
    } else {
      assassinArea.classList.add('hidden');
      assassinWaiting.classList.remove('hidden');
    }
  }

  // ── 게임 종료 ─────────────────────────────────────────────────
  function renderGameOver(state) {
    const result = document.getElementById('game-over-result');
    const rolesEl = document.getElementById('game-over-roles');
    const btnRestart = document.getElementById('btn-restart');

    if (state.winner === 'good') {
      result.className = 'game-over-result good-wins';
      result.innerHTML = '🏆 선 진영 승리!<br/><small>아발론을 지켜냈습니다.</small>';
    } else {
      result.className = 'game-over-result evil-wins';
      result.innerHTML = '💀 악 진영 승리!<br/><small>아발론이 무너졌습니다.</small>';
    }

    // 역할 공개
    rolesEl.innerHTML = '';
    state.players.forEach(p => {
      const ri = ROLE_INFO[p.role] || {};
      const teamClass = ri.team || 'good';
      const item = document.createElement('div');
      item.className = 'player-item';
      item.innerHTML = `
        <div class="player-avatar">${avatarInitial(p.name)}</div>
        <span class="player-name">${escHtml(p.name)}</span>
        <span class="role-badge ${teamClass}">${ri.icon || ''} ${ri.label || p.role}</span>
      `;
      rolesEl.appendChild(item);
    });

    if (state.hostId === myPlayerId) {
      btnRestart.classList.remove('hidden');
    } else {
      btnRestart.classList.add('hidden');
    }
  }

  // ── 유틸 ─────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── 로컬 스토리지에 세션 저장/복원 ───────────────────────────
  function saveSession(roomCode, playerId) {
    try { localStorage.setItem('avalon_session', JSON.stringify({ roomCode, playerId })); } catch {}
  }
  function loadSession() {
    try { return JSON.parse(localStorage.getItem('avalon_session') || 'null'); } catch { return null; }
  }
  function clearSession() {
    try { localStorage.removeItem('avalon_session'); } catch {}
  }

  // ── 소켓 초기화 ───────────────────────────────────────────────
  function initSocket() {
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      // 기존 세션 복원 시도
      const session = loadSession();
      if (session && session.roomCode && session.playerId) {
        socket.emit('rejoin_room', { roomCode: session.roomCode, playerId: session.playerId });
      } else {
        showScreen('screen-lobby');
      }
    });

    socket.on('disconnect', () => {
      // 재연결 시도 (자동)
    });

    socket.on('room_created', ({ roomCode, playerId, playerName }) => {
      myRoomCode = roomCode;
      myPlayerId = playerId;
      saveSession(roomCode, playerId);
      clearLobbyError();
    });

    socket.on('room_joined', ({ roomCode, playerId, playerName }) => {
      myRoomCode = roomCode;
      myPlayerId = playerId;
      saveSession(roomCode, playerId);
      clearLobbyError();
      showScreen('screen-room');
      document.getElementById('display-room-code').textContent = roomCode;
    });

    socket.on('state_update', (state) => {
      handleStateUpdate(state);
    });

    socket.on('private_state', (ps) => {
      privateState = ps;
      if (gameState?.phase === 'role_reveal') {
        renderMyRole();
      }
    });

    socket.on('role_reveal_turn', (data) => {
      showPanel('panel-role-reveal');
      renderRoleRevealPanel(data);
    });

    socket.on('vote_started', ({ proposedTeam }) => {
      // state_update가 먼저 처리됨
    });

    socket.on('vote_status', (status) => {
      const bar = document.getElementById('vote-status-bar');
      bar.innerHTML = '';
      if (!gameState) return;
      gameState.players.forEach(p => {
        const chip = document.createElement('span');
        chip.className = `vote-chip ${status.voted.includes(p.id) ? 'voted' : ''}`;
        chip.textContent = p.name;
        bar.appendChild(chip);
      });
    });

    socket.on('vote_result', (result) => {
      const summaryEl = document.getElementById('vote-result-summary');
      const listEl = document.getElementById('vote-result-list');

      summaryEl.className = `vote-result-summary ${result.approved ? 'approved' : 'rejected'}`;
      summaryEl.textContent = result.approved
        ? `✅ 승인 (${result.approves} vs ${result.rejects})`
        : `❌ 거부 (${result.approves} vs ${result.rejects})${result.rejectionCount >= 5 ? ' — 악 진영 승리!' : ''}`;

      listEl.innerHTML = '';
      result.votes.forEach(v => {
        const li = document.createElement('li');
        li.className = 'vote-result-item';
        const voteClass = v.vote === 'approve' ? 'approve' : 'reject';
        const voteLabel = v.vote === 'approve' ? '✅ 승인' : '❌ 거부';
        li.innerHTML = `
          <span>${escHtml(v.name)}</span>
          <span class="vote-val ${voteClass}">${voteLabel}</span>
        `;
        listEl.appendChild(li);
      });
    });

    socket.on('quest_vote_status', (status) => {
      const bar = document.getElementById('quest-vote-status-bar');
      bar.innerHTML = '';
      if (!gameState) return;
      gameState.proposedTeam.forEach(id => {
        const p = gameState.players.find(p => p.id === id);
        if (!p) return;
        const chip = document.createElement('span');
        chip.className = `vote-chip ${status.voted.includes(id) ? 'voted' : ''}`;
        chip.textContent = p.name;
        bar.appendChild(chip);
      });
    });

    socket.on('quest_result', (result) => {
      const el = document.getElementById('quest-result-display');
      el.className = `quest-result-display ${result.questFailed ? 'fail' : 'success'}`;

      let msg = result.questFailed
        ? `💀 퀘스트 실패! (실패 카드: ${result.failCount}장)`
        : `✅ 퀘스트 성공!`;

      if (result.evilWins) msg += '\n\n악 진영이 3번의 퀘스트를 실패시켰습니다!';
      if (result.goodLeads) msg += '\n\n선 진영이 3번의 퀘스트를 성공! 암살 단계로 넘어갑니다.';

      el.textContent = msg;

      const btnNext = document.getElementById('btn-next-round');
      if (result.evilWins || result.goodLeads) {
        btnNext.classList.add('hidden');
      } else {
        btnNext.classList.remove('hidden');
      }
    });

    socket.on('assassination_result', (result) => {
      // game_over state_update가 따라옴
    });

    socket.on('error_msg', ({ message }) => {
      if (document.getElementById('screen-room').classList.contains('active')) {
        showRoomError(message);
      } else {
        showLobbyError(message);
      }
    });
  }

  // ── UI 이벤트 바인딩 ──────────────────────────────────────────
  function bindEvents() {
    // 탭 전환
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        clearLobbyError();
      });
    });

    // 방 만들기
    document.getElementById('btn-create-room').addEventListener('click', () => {
      const name = document.getElementById('create-name').value.trim();
      if (!name) return showLobbyError('이름을 입력해주세요.');
      socket.emit('create_room', { name });
    });
    document.getElementById('create-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-create-room').click();
    });

    // 방 참가
    document.getElementById('btn-join-room').addEventListener('click', () => {
      const name = document.getElementById('join-name').value.trim();
      const code = document.getElementById('join-code').value.trim().toUpperCase();
      if (!name) return showLobbyError('이름을 입력해주세요.');
      if (code.length !== 4) return showLobbyError('방 코드 4자리를 입력해주세요.');
      socket.emit('join_room', { roomCode: code, name });
    });
    document.getElementById('join-code').addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase();
    });
    document.getElementById('join-code').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-join-room').click();
    });

    // 방 코드 복사
    document.getElementById('btn-copy-code').addEventListener('click', () => {
      if (myRoomCode) {
        navigator.clipboard?.writeText(myRoomCode).catch(() => {});
        const btn = document.getElementById('btn-copy-code');
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '📋'; }, 1500);
      }
    });

    // 게임 시작
    document.getElementById('btn-start-game').addEventListener('click', () => {
      socket.emit('start_game');
    });

    // 역할 카드 탭 → 확인
    document.getElementById('my-role-card').addEventListener('click', () => {
      if (roleRevealed) return;
      roleRevealed = true;
      document.querySelector('.role-card-front').classList.add('hidden');
      document.querySelector('.role-card-back').classList.remove('hidden');
      document.getElementById('btn-role-done').classList.remove('hidden');
    });

    // 역할 확인 완료
    document.getElementById('btn-role-done').addEventListener('click', () => {
      socket.emit('role_reveal_done');
    });

    // 팀 제안
    selectedTeam = new Set();
    document.getElementById('btn-propose').addEventListener('click', () => {
      if (!gameState) return;
      const teamIds = [...selectedTeam];
      socket.emit('propose_team', { teamIds });
      selectedTeam.clear();
    });

    // 투표
    document.getElementById('btn-approve').addEventListener('click', () => {
      if (voteSubmitted) return;
      voteSubmitted = true;
      socket.emit('cast_vote', { vote: 'approve' });
      document.getElementById('vote-buttons').classList.add('hidden');
      document.getElementById('vote-done-msg').classList.remove('hidden');
    });
    document.getElementById('btn-reject').addEventListener('click', () => {
      if (voteSubmitted) return;
      voteSubmitted = true;
      socket.emit('cast_vote', { vote: 'reject' });
      document.getElementById('vote-buttons').classList.add('hidden');
      document.getElementById('vote-done-msg').classList.remove('hidden');
    });

    // 투표 결과 후 계속
    document.getElementById('btn-proceed').addEventListener('click', () => {
      socket.emit('proceed_to_quest');
    });

    // 퀘스트 투표
    document.getElementById('btn-quest-success').addEventListener('click', () => {
      if (questVoteSubmitted) return;
      questVoteSubmitted = true;
      socket.emit('cast_quest_vote', { vote: 'success' });
      document.getElementById('quest-buttons').classList.add('hidden');
      document.getElementById('quest-done-msg').classList.remove('hidden');
    });
    document.getElementById('btn-quest-fail').addEventListener('click', () => {
      if (questVoteSubmitted) return;
      questVoteSubmitted = true;
      socket.emit('cast_quest_vote', { vote: 'fail' });
      document.getElementById('quest-buttons').classList.add('hidden');
      document.getElementById('quest-done-msg').classList.remove('hidden');
    });

    // 다음 라운드
    document.getElementById('btn-next-round').addEventListener('click', () => {
      socket.emit('next_round');
    });

    // 암살
    document.getElementById('btn-assassinate').addEventListener('click', () => {
      if (!assassinTarget) return;
      socket.emit('assassinate', { targetId: assassinTarget });
    });

    // 재시작
    document.getElementById('btn-restart').addEventListener('click', () => {
      selectedTeam.clear();
      privateState = null;
      socket.emit('restart_game');
    });
  }

  // ── 초기화 ────────────────────────────────────────────────────
  function init() {
    showScreen('screen-loading');
    bindEvents();
    initSocket();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
