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

let audioCtx;

// --- Audio System ---
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playMaru() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    // Play a bright "ding-dong" sound
    const playNote = (freq, startTime, duration) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
    };

    const now = audioCtx.currentTime;
    playNote(783.99, now, 0.4); // G5
    playNote(1046.50, now + 0.15, 0.6); // C6
}

function playBatsu() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    // Play a buzzer sound
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}

// --- Display Mode ---
function startDisplayMode() {
    initAudio();
    document.getElementById('mode-selection').style.display = 'none';
    document.getElementById('display-mode').style.display = 'flex';
    document.body.classList.add('bg-animated');

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
            
            // Generate QR Code
            const controllerUrl = window.location.origin + window.location.pathname + '?role=controller&id=' + id;
            document.getElementById('qrcode').innerHTML = ''; // Clear loading text
            new QRCode(document.getElementById("qrcode"), {
                text: controllerUrl,
                width: 100,
                height: 100,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.L
            });
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
            document.getElementById('setup-header').style.display = 'none';
            
            c.on('open', () => c.send({ type: 'sync', state: gameState }));
            
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

function renderBoard() {
    const board = document.getElementById('board');
    // Instead of completely re-rendering, update existing cards if possible to preserve animations
    gameState.filter(p => p.active).forEach(p => {
        let card = document.getElementById(`player-card-${p.id}`);
        if (!card) {
            card = document.createElement('div');
            card.id = `player-card-${p.id}`;
            card.className = `player-card glass ${p.status}`;
            card.innerHTML = `
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
            card.className = `player-card glass ${p.status}`;
            card.querySelector('.player-name').innerText = p.name;
            const scoreEl = document.getElementById(`score-val-${p.id}`);
            const penaltyEl = document.getElementById(`penalty-val-${p.id}`);
            
            if (scoreEl.innerText != p.score) scoreEl.innerText = p.score;
            if (penaltyEl.innerText != p.penalty) penaltyEl.innerText = p.penalty;
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
    container.innerHTML = '';
    
    gameState.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = `control-card glass ${p.active ? 'active-player' : ''}`;
        div.innerHTML = `
            <div class="c-row">
                <div class="p-title">
                    <input type="checkbox" onchange="updatePlayer(${i}, 'active', this.checked)" ${p.active ? 'checked' : ''}>
                    <input type="text" value="${p.name}" onchange="updatePlayer(${i}, 'name', this.value)" placeholder="名前">
                </div>
            </div>
            <div class="c-row">
                <button class="btn-big c-btn-m" onclick="sendAction('playSound','maru'); updatePlayer(${i},'score',${p.score+1})">〇 正解</button> 
                <button class="btn-big c-btn-b" onclick="sendAction('playSound','batsu'); updatePlayer(${i},'penalty',${p.penalty+1})">✕ 誤答</button>
            </div>
            <div class="c-row" style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 10px;">
                <div class="score-adjuster">
                    <span style="margin-right: 10px; font-weight: bold; color: var(--success);">〇:</span>
                    <button class="step-btn" onclick="updatePlayer(${i},'score',${p.score-1})">-</button> 
                    <span class="score-disp">${p.score}</span> 
                    <button class="step-btn" onclick="updatePlayer(${i},'score',${p.score+1})">+</button>
                </div>
                <div class="score-adjuster">
                    <span style="margin-right: 10px; font-weight: bold; color: var(--danger);">✕:</span>
                    <button class="step-btn" onclick="updatePlayer(${i},'penalty',${p.penalty-1})">-</button> 
                    <span class="score-disp">${p.penalty}</span> 
                    <button class="step-btn" onclick="updatePlayer(${i},'penalty',${p.penalty+1})">+</button>
                </div>
            </div>
            <div class="c-row">
                <span style="font-weight: 600;">状態:</span> 
                <select class="s-select" onchange="updatePlayer(${i}, 'status', this.value)">
                    <option value="active" ${p.status === 'active' ? 'selected' : ''}>通常</option>
                    <option value="win" ${p.status === 'win' ? 'selected' : ''}>勝ち抜け</option>
                    <option value="eliminated" ${p.status === 'eliminated' ? 'selected' : ''}>脱落</option>
                </select>
            </div>
        `;
        container.appendChild(div);
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
    if (document.body.classList.contains('light-mode')) {
        btn.innerText = '🌙';
    } else {
        btn.innerText = '🌞';
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
