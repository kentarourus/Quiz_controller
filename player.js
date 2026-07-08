let peer;
let conn;
let myPlayerId = 0;
let myBuzzerActive = false; // クライアント側のロック状態

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if (id) {
        document.getElementById('target-id').value = id;
    } else {
        document.getElementById('target-id').disabled = false;
        document.getElementById('target-id').placeholder = "IDを手動入力";
    }
});

let targetId;

function joinGame() {
    targetId = document.getElementById('target-id').value.trim();
    myPlayerId = parseInt(document.getElementById('player-select').value, 10);
    
    if (!targetId) {
        document.getElementById('msg').innerText = "IDを入力してください";
        return;
    }
    
    document.getElementById('msg').innerText = "接続中...";
    
    if (!peer) {
        peer = new Peer();
        peer.on('open', () => {
            connectToHost();
        });
        peer.on('error', (err) => {
            document.getElementById('msg').innerText = "Peer接続エラー: " + err.type;
        });
    } else {
        connectToHost();
    }
}

function connectToHost() {
    conn = peer.connect(targetId);
    
    conn.on('open', () => {
        document.getElementById('setup-screen').style.display = 'none';
        document.getElementById('buzzer-screen').style.display = 'flex';
        updateBuzzerUI({ active: false, queue: [] });
    });
    
    conn.on('data', (data) => {
        if (data.type === 'buzzerState') {
            updateBuzzerUI(data.state);
        }
    });
    
    conn.on('close', () => {
        document.getElementById('status-text').innerText = "ホストから切断されました。再接続中...";
        const btn = document.getElementById('buzzer-btn');
        btn.classList.add('locked');
        myBuzzerActive = false;
        setTimeout(() => connectToHost(), 3000);
    });
    
    conn.on('error', () => {
        document.getElementById('status-text').innerText = "接続エラー。再接続を試みます...";
        setTimeout(() => connectToHost(), 3000);
    });
}

function updateBuzzerUI(buzzerState) {
    const btn = document.getElementById('buzzer-btn');
    const statusText = document.getElementById('status-text');
    const overlay = document.getElementById('win-overlay');
    
    // Check if I am in the queue
    const queueEntry = buzzerState && buzzerState.queue ? buzzerState.queue.find(q => q.id === myPlayerId) : null;
    const isQueued = !!queueEntry;
    const queueIndex = isQueued ? buzzerState.queue.indexOf(queueEntry) : -1;
    
    const activeWinnerEntry = buzzerState && buzzerState.active && buzzerState.queue ? buzzerState.queue[buzzerState.currentIndex] : null;
    const isWinner = activeWinnerEntry && activeWinnerEntry.id === myPlayerId;
    
    if (isQueued) {
        myBuzzerActive = false;
        btn.classList.add('locked');
        btn.classList.remove('winner');
        
        if (isWinner) {
            btn.classList.remove('locked');
            btn.classList.add('winner');
            btn.innerHTML = "<div style='font-size: 0.5em; line-height: 1.2;'>🎉<br>あなたが<br>回答者です！</div>";
            statusText.innerText = "あなたが押しました！";
            overlay.style.display = 'block';
            
            // Haptic and visual flash
            if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
            const originalBg = document.body.style.backgroundColor;
            document.body.style.backgroundColor = 'var(--md-sys-color-primary)';
            setTimeout(() => {
                document.body.style.backgroundColor = originalBg;
            }, 150);
        } else {
            btn.innerHTML = `<div style='font-size: 0.8em;'>順番待ち<br>${queueIndex + 1}番目</div>`;
            if (activeWinnerEntry) {
                statusText.innerText = `Player ${activeWinnerEntry.id + 1} が解答権を獲得 (あなたは ${queueIndex + 1}番目)`;
            } else {
                statusText.innerText = `順番待ち (${queueIndex + 1}番目)`;
            }
            overlay.style.display = 'none';
        }
    } else {
        myBuzzerActive = true;
        btn.classList.remove('locked');
        btn.classList.remove('winner');
        btn.innerText = "PUSH";
        
        if (activeWinnerEntry) {
            statusText.innerText = `Player ${activeWinnerEntry.id + 1} が解答中`;
        } else {
            statusText.innerText = "早押しボタンを押してください";
        }
        overlay.style.display = 'none';
    }
}

// スマホのタップ遅延を防ぐために touchstart と mousedown 両方を監視
const buzzerBtn = document.getElementById('buzzer-btn');

buzzerBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); // ダブルタップズームなどを防止
    triggerBuzz();
});

buzzerBtn.addEventListener('mousedown', (e) => {
    triggerBuzz();
});

function triggerBuzz() {
    if (myBuzzerActive && conn && conn.open) {
        // 先行してクライアント側でロック（連打防止）
        myBuzzerActive = false; 
        const btn = document.getElementById('buzzer-btn');
        btn.classList.add('locked');
        btn.innerText = "送信中...";
        
        // ホストへ早押し信号を送信
        conn.send({ type: 'buzz', playerId: myPlayerId });
    }
}
