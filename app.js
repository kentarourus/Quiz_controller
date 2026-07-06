let peer;
let conn;
let connections = [];
let quizTitle = "クイズ大会";
let gameState = Array.from({ length: 8 }, (_, i) => ({
    id: i, 
    name: `Player ${i + 1}`, 
    score: 0, 
    penalty: 0, 
    status: 'active', 
    active: i < 4
}));
let buzzerState = { active: false, winnerId: null };

let audioCtx;

// --- Audio System ---
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playMaru() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const now = audioCtx.currentTime;
    
    // Play a classic "Pin-Pon!" chime (E6 -> C6)
    const playChime = (freq, startTime) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        // Smooth attack and long, bell-like decay
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.6, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5);
        
        osc.start(startTime);
        osc.stop(startTime + 1.5);
    };

    playChime(1318.51, now);        // E6 (Pin)
    playChime(1046.50, now + 0.3);  // C6 (Pon)
}

function playBatsu() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const now = audioCtx.currentTime;
    
    // Play a classic "Bu-Buu!" double buzzer
    const playBuzzer = (startTime, duration) => {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        
        // Mix sawtooth and square for a rich, harsh buzzer texture
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        
        // Slightly detuned low notes for a dissonant feel
        osc1.frequency.setValueAtTime(140, startTime);
        osc2.frequency.setValueAtTime(145, startTime);
        
        // Sharp attack, abrupt release
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
        gain.gain.setValueAtTime(0.3, startTime + duration - 0.02);
        gain.gain.linearRampToValueAtTime(0, startTime + duration);
        
        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + duration);
        osc2.stop(startTime + duration);
    };

    playBuzzer(now, 0.15);         // Bu
    playBuzzer(now + 0.25, 0.4);   // Buu!
}

// --- Display Mode ---
function startDisplayMode() {
    initAudio();
    document.getElementById('mode-selection').style.display = 'none';
    document.getElementById('display-mode').style.display = 'flex';
    document.body.classList.add('bg-animated');
    document.body.style.overflow = 'hidden';

    // Add background blobs dynamically
    const blob1 = document.createElement('div'); blob1.className = 'blob blob-1';
    const blob2 = document.createElement('div'); blob2.className = 'blob blob-2';
    document.body.appendChild(blob1);
    document.body.appendChild(blob2);

    function generatePin() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    function initPeer(pin) {
        peer = new Peer(pin);
        
        peer.on('open', (id) => {
            document.getElementById('peer-id').innerText = id;
            
            // Generate QR Code for player.html
            const baseUrl = window.location.href.split('?')[0].split('#')[0];
            const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
            const playerUrl = baseDir + 'player.html?id=' + id;
            
            const qrcodeEl = document.getElementById("qrcode");
            if (qrcodeEl) {
                qrcodeEl.innerHTML = '';
                new QRCode(qrcodeEl, {
                    text: playerUrl,
                    width: 150,
                    height: 150,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.L
                });
            }
            const link = document.getElementById('join-url-link');
            if (link) {
                link.href = playerUrl;
                link.innerText = playerUrl;
            }
        });

        peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                initPeer(generatePin()); // Retry with a new PIN if taken
            } else {
                console.error(err);
            }
        });

        peer.on('connection', (c) => {
            connections.push(c);
            const setupHeader = document.getElementById('setup-header');
            if (setupHeader) setupHeader.style.display = 'none';
            
            c.on('open', () => {
                c.send({ type: 'sync', state: gameState, title: quizTitle });
                c.send({ type: 'buzzerState', state: buzzerState });
            });
            
            c.on('data', (data) => {
                if (data.type === 'updatePlayer') {
                    const idx = gameState.findIndex(p => p.id === data.player.id);
                    if (idx !== -1) {
                        // Detect if score changed to add animation class
                        if (gameState[idx].score !== data.player.score) {
                            triggerScoreAnimation(data.player.id, 'score');
                        }
                        if (gameState[idx].penalty !== data.player.penalty) {
                            triggerScoreAnimation(data.player.id, 'penalty');
                        }
                        gameState[idx] = data.player;
                    }
                    broadcastState();
                } else if (data.type === 'updateBulkActive') {
                    gameState.forEach((p, i) => p.active = i < data.count);
                    broadcastState();
                } else if (data.type === 'playSound') {
                    if (data.sound === 'maru') playMaru();
                    if (data.sound === 'batsu') playBatsu();
                } else if (data.type === 'resetAll') {
                    gameState = gameState.map(p => ({ ...p, score: 0, penalty: 0, status: 'active' }));
                    broadcastState();
                } else if (data.type === 'updateTitle') {
                    quizTitle = data.title;
                    document.getElementById('display-quiz-title').innerText = quizTitle;
                    broadcastState();
                } else if (data.type === 'buzz') {
                    const pState = gameState.find(p => p.id === data.playerId);
                    if (!buzzerState.active && pState && pState.status === 'active') {
                        buzzerState.active = true;
                        buzzerState.winnerId = data.playerId;
                        playMaru(); // 早押し音（ピンポン）
                        
                        // プロジェクター画面で勝者をハイライト（WINアニメーションを一時的に付与）
                        const card = document.getElementById(`player-card-${data.playerId}`);
                        if (card) {
                            card.classList.add('win');
                        }
                        
                        broadcastBuzzerState();
                    }
                } else if (data.type === 'resetBuzzer') {
                    buzzerState.active = false;
                    buzzerState.winnerId = null;
                    
                    // ハイライト解除
                    const cards = document.querySelectorAll('.player-card');
                    cards.forEach(c => c.classList.remove('win'));
                    
                    broadcastBuzzerState();
                }
            });
        });
    }

    initPeer(generatePin());
    renderBoard();
}

function broadcastState() {
    renderBoard();
    connections.forEach(c => { if (c.open) c.send({ type: 'sync', state: gameState, title: quizTitle }); });
}

function broadcastBuzzerState() {
    connections.forEach(c => { if (c.open) c.send({ type: 'buzzerState', state: buzzerState }); });
}

function renderBoard() {
    const board = document.getElementById('board');
    const activePlayers = gameState.filter(p => p.active);
    
    board.className = `board count-${activePlayers.length}`;

    // Instead of completely re-rendering, update existing cards if possible to preserve animations
    activePlayers.forEach(p => {
        let card = document.getElementById(`player-card-${p.id}`);
        if (!card) {
            card = document.createElement('div');
            card.id = `player-card-${p.id}`;
            card.className = `player-card ${p.status} player-color-${p.id}`;
            card.innerHTML = `
                ${p.status === 'eliminated' ? '<div class="eliminated-badge">脱落</div>' : ''}
                <div class="player-name">${p.name}</div>
                <div class="score-area">
                    <div class="score-box">
                        <div class="score-label">〇 正解</div>
                        <div class="score-val maru" id="score-val-${p.id}">${p.score}</div>
                    </div>
                    <div class="score-box">
                        <div class="score-label">✕ 誤答</div>
                        <div class="score-val batsu" id="penalty-val-${p.id}">${p.penalty}</div>
                    </div>
                </div>`;
            board.appendChild(card);
        } else {
            card.className = `player-card ${p.status} player-color-${p.id}`;
            card.querySelector('.player-name').innerText = p.name;
            const scoreEl = document.getElementById(`score-val-${p.id}`);
            const penaltyEl = document.getElementById(`penalty-val-${p.id}`);
            
            if (scoreEl.innerText != p.score) scoreEl.innerText = p.score;
            if (penaltyEl.innerText != p.penalty) penaltyEl.innerText = p.penalty;

            let elimBadge = card.querySelector('.eliminated-badge');
            if (p.status === 'eliminated') {
                if (!elimBadge) card.insertAdjacentHTML('afterbegin', '<div class="eliminated-badge">脱落</div>');
            } else {
                if (elimBadge) elimBadge.remove();
            }
        }
    });

    // Remove inactive cards
    const activeIds = gameState.filter(p => p.active).map(p => p.id);
    Array.from(board.children).forEach(child => {
        const id = parseInt(child.id.split('-')[2]);
        if (!activeIds.includes(id)) {
            child.remove();
        }
    });
}

function triggerScoreAnimation(playerId, type) {
    const elId = type === 'score' ? `score-val-${playerId}` : `penalty-val-${playerId}`;
    const el = document.getElementById(elId);
    if (el) {
        el.classList.remove('score-pop');
        void el.offsetWidth; // trigger reflow
        el.classList.add('score-pop');
    }
}

// --- Controller Mode ---
function startControllerMode(autoConnectId = null) {
    document.getElementById('mode-selection').style.display = 'none';
    document.getElementById('controller-mode').style.display = 'block';
    peer = new Peer();
    
    if (autoConnectId) {
        document.getElementById('target-id').value = autoConnectId;
        peer.on('open', () => {
            connectToDisplay();
        });
    }
}

function connectToDisplay() {
    const targetId = document.getElementById('target-id').value.trim();
    if (!targetId) return;
    document.getElementById('status-msg').innerText = "接続中...";
    conn = peer.connect(targetId);

    conn.on('open', () => {
        document.getElementById('setup').style.display = 'none';
        document.getElementById('global-controls').style.display = 'block';
        document.getElementById('controls').style.display = 'grid';
    });
    
    conn.on('data', (data) => {
        if (data.type === 'sync') {
            gameState = data.state;
            if (data.title !== undefined) {
                const titleInput = document.getElementById('quiz-title-input');
                if (titleInput && titleInput.value !== data.title) titleInput.value = data.title;
            }
            renderControls();
            const activeCount = gameState.filter(p => p.active).length;
            const bulkSelect = document.getElementById('bulk-count');
            if (bulkSelect && bulkSelect.value != activeCount) bulkSelect.value = activeCount;
        } else if (data.type === 'buzzerState') {
            buzzerState = data.state;
            renderControls();
        }
    });
    
    conn.on('error', () => { 
        document.getElementById('status-msg').innerText = "接続失敗。IDを確認してください。"; 
    });
}

function changePlayerCount(count) { 
    if (conn && conn.open) conn.send({ type: 'updateBulkActive', count: parseInt(count, 10) }); 
}

function renderControls() {
    const container = document.getElementById('controls');
    
    gameState.forEach((p, i) => {
        let card = document.getElementById(`control-card-${p.id}`);
        const isBuzzerWinner = buzzerState.winnerId === p.id;
        const baseClass = `control-card ${p.active ? 'active-player' : ''} ${isBuzzerWinner ? 'buzzer-winner-controller' : ''} player-color-${p.id}`;
        
        if (!card) {
            card = document.createElement('div');
            card.id = `control-card-${p.id}`;
            card.className = baseClass;
            card.innerHTML = `
                ${isBuzzerWinner ? '<div class="controller-winner-badge">回答権！</div>' : ''}
                <div class="c-row">
                    <div class="p-title">
                        <input type="checkbox" id="chk-active-${p.id}" onchange="updatePlayer(${i}, 'active', this.checked)" ${p.active ? 'checked' : ''}>
                        <input type="text" id="input-name-${p.id}" value="${p.name}" onchange="updatePlayer(${i}, 'name', this.value)" placeholder="名前">
                    </div>
                </div>
                <div class="c-row" style="gap: 15px;">
                    <button class="btn-big c-btn-m" onclick="sendAction('playSound','maru'); updatePlayer(${i},'score',gameState[${i}].score+1)">〇 正解</button> 
                    <button class="btn-big c-btn-b" onclick="sendAction('playSound','batsu'); updatePlayer(${i},'penalty',gameState[${i}].penalty+1)">✕ 誤答</button>
                </div>
                <div class="score-adjuster-container">
                    <div class="score-adjuster">
                        <span class="score-adjuster-label" style="color: var(--success);">〇</span>
                        <button class="step-btn" onclick="updatePlayer(${i},'score',gameState[${i}].score-1)">-</button> 
                        <span class="score-disp" id="disp-score-${p.id}">${p.score}</span> 
                        <button class="step-btn" onclick="updatePlayer(${i},'score',gameState[${i}].score+1)">+</button>
                    </div>
                    <div class="score-adjuster">
                        <span class="score-adjuster-label" style="color: var(--danger);">✕</span>
                        <button class="step-btn" onclick="updatePlayer(${i},'penalty',gameState[${i}].penalty-1)">-</button> 
                        <span class="score-disp" id="disp-penalty-${p.id}">${p.penalty}</span> 
                        <button class="step-btn" onclick="updatePlayer(${i},'penalty',gameState[${i}].penalty+1)">+</button>
                    </div>
                </div>
                <div class="c-row">
                    <span style="font-weight: 600;">状態:</span> 
                    <select class="s-select" id="select-status-${p.id}" onchange="updatePlayer(${i}, 'status', this.value)">
                        <option value="active" ${p.status === 'active' ? 'selected' : ''}>通常</option>
                        <option value="win" ${p.status === 'win' ? 'selected' : ''}>勝ち抜け</option>
                        <option value="eliminated" ${p.status === 'eliminated' ? 'selected' : ''}>脱落</option>
                    </select>
                </div>
            `;
            container.appendChild(card);
        } else {
            card.className = baseClass;
            const chkActive = document.getElementById(`chk-active-${p.id}`);
            if (chkActive && chkActive.checked !== p.active) chkActive.checked = p.active;
            
            const inputName = document.getElementById(`input-name-${p.id}`);
            if (inputName && inputName !== document.activeElement && inputName.value !== p.name) {
                inputName.value = p.name;
            }
            
            const dispScore = document.getElementById(`disp-score-${p.id}`);
            if (dispScore && dispScore.innerText != p.score) dispScore.innerText = p.score;
            
            const dispPenalty = document.getElementById(`disp-penalty-${p.id}`);
            if (dispPenalty && dispPenalty.innerText != p.penalty) dispPenalty.innerText = p.penalty;
            
            const selectStatus = document.getElementById(`select-status-${p.id}`);
            if (selectStatus && selectStatus.value !== p.status) selectStatus.value = p.status;

            let badge = card.querySelector('.controller-winner-badge');
            if (isBuzzerWinner) {
                if (!badge) card.insertAdjacentHTML('afterbegin', '<div class="controller-winner-badge">回答権！</div>');
            } else {
                if (badge) badge.remove();
            }
        }
    });
}

function updatePlayer(idx, key, val) {
    gameState[idx][key] = val;
    if (conn && conn.open) conn.send({ type: 'updatePlayer', player: gameState[idx] });
}

function updateQuizTitle(title) {
    if (conn && conn.open) {
        conn.send({ type: 'updateTitle', title: title });
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) {
        if (document.body.classList.contains('light-mode')) {
            btn.innerText = '🌙 / 🌞 切替';
        } else {
            btn.innerText = '🌞 / 🌙 切替';
        }
    }
}

// --- Modal & UI Logic ---
function showJoinModal() {
    const el = document.getElementById('modal-join');
    if (el) el.style.display = 'flex';
}
function hideJoinModal() {
    const el = document.getElementById('modal-join');
    if (el) el.style.display = 'none';
}
function showSettingsModal() {
    const el = document.getElementById('modal-settings');
    if (el) el.style.display = 'flex';
}
function hideSettingsModal() {
    const el = document.getElementById('modal-settings');
    if (el) el.style.display = 'none';
}
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

function sendAction(type, sound = null) {
    if (type === 'resetAll' && !confirm('全員のスコアと状態をリセットしますか？')) return;
    if (conn && conn.open) conn.send({ type, sound });
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const role = urlParams.get('role');
    const id = urlParams.get('id');
    
    if (role === 'controller') {
        startControllerMode(id);
    }
});
