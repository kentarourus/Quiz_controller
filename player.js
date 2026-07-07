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

function joinGame() {
    const targetId = document.getElementById('target-id').value.trim();
    myPlayerId = parseInt(document.getElementById('player-select').value, 10);
    
    if (!targetId) {
        document.getElementById('msg').innerText = "IDを入力してください";
        return;
    }
    
    document.getElementById('msg').innerText = "接続中...";
    
    peer = new Peer();
    
    peer.on('open', () => {
        conn = peer.connect(targetId);
        
        conn.on('open', () => {
            document.getElementById('setup-screen').style.display = 'none';
            document.getElementById('buzzer-screen').style.display = 'flex';
            updateBuzzerUI(false, null); // 初期状態はアンロック
        });
        
        conn.on('data', (data) => {
            if (data.type === 'buzzerState') {
                updateBuzzerUI(data.state.active, data.state.winnerId);
            }
        });
        
        conn.on('close', () => {
            document.getElementById('status-text').innerText = "ホストから切断されました";
            const btn = document.getElementById('buzzer-btn');
            btn.classList.add('locked');
            myBuzzerActive = false;
        });
        
        conn.on('error', () => {
            document.getElementById('msg').innerText = "接続エラー";
        });
    });
    
    peer.on('error', (err) => {
        document.getElementById('msg').innerText = "Peer接続エラー: " + err.type;
    });
}

function updateBuzzerUI(isLocked, winnerId) {
    const btn = document.getElementById('buzzer-btn');
    const statusText = document.getElementById('status-text');
    const overlay = document.getElementById('win-overlay');
    
    if (isLocked) {
        myBuzzerActive = false;
        btn.classList.add('locked');
        btn.classList.remove('winner');
        
        if (winnerId === myPlayerId) {
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
            btn.innerText = "❌ ロック中";
            statusText.innerText = `Player ${winnerId + 1} が解答権を獲得`;
            overlay.style.display = 'none';
        }
    } else {
        myBuzzerActive = true;
        btn.classList.remove('locked');
        btn.classList.remove('winner');
        btn.innerText = "PUSH";
        statusText.innerText = "早押し準備OK！";
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
