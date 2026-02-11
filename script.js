import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- DIN UNIKA CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyCDnuWsArX-rVQUUj4BbrSNDgDeEICs0NY",
  authDomain: "rsp-5d025.firebaseapp.com",
  databaseURL: "https://rsp-5d025-default-rtdb.firebaseio.com",
  projectId: "rsp-5d025",
  storageBucket: "rsp-5d025.firebasestorage.app",
  messagingSenderId: "1096402761607",
  appId: "1:1096402761607:web:fdbe591cc37ac22c730522"
};

// Initiera Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- VARIABLER ---
let myRoom = "";
let myPlayerKey = ""; 
let myName = "";
let isAnimating = false;
let careerWins = 0, careerLosses = 0, careerScore = 0;
let timerInterval, timeLeft = 10, hasChosen = false; 
const maxRounds = 5;
const hands = { sten: '✊🏽', sax: '✌🏽', pase: '✋🏽', rocknroll: '🤘🏽' };

// --- LOBBY SETUP ---
const avatarList = ['Hero.png', 'EnemySkeletton.png', 'DemonTroll.png', 'Elfsorceress.png', 'Lizard.png', 'Wolf.png'];
let mySelectedAvatar = "Hero.png";
const grid = document.getElementById('lobby-avatar-grid');

if (grid) {
    avatarList.forEach(file => {
        const img = document.createElement('img');
        img.src = `images/${file}`;
        img.onclick = () => {
            mySelectedAvatar = file;
            document.getElementById('selected-avatar-name').innerText = file.split('.')[0];
            document.querySelectorAll('.mini-avatar-select img').forEach(i => i.classList.remove('selected'));
            img.classList.add('selected');
        };
        grid.appendChild(img);
    });
}

// --- MATCHMAKING ---
window.createRoom = async function() {
    const room = document.getElementById('room-input').value.trim();
    const name = document.getElementById('username-input').value.trim();
    if(!room || !name) return alert("Fyll i allt!");

    myRoom = room; myPlayerKey = "p1"; myName = name;
    
    await set(ref(db, `rooms/${room}`), {
        arena: document.getElementById('arena-select').value,
        players: { p1: { name: name, avatar: mySelectedAvatar, score: 0 } },
        round: 1,
        status: "waiting",
        rematchVotes: 0
    });
    
    listenForUpdates();
};

window.joinRoom = async function() {
    const room = document.getElementById('room-input').value.trim();
    const name = document.getElementById('username-input').value.trim();
    if(!room || !name) return alert("Fyll i allt!");

    const snapshot = await get(ref(db, `rooms/${room}`));
    if (!snapshot.exists()) return alert("Rummet finns inte!");

    myRoom = room; myPlayerKey = "p2"; myName = name;
    await update(ref(db, `rooms/${room}/players/p2`), { name: name, avatar: mySelectedAvatar, score: 0 });
    await update(ref(db, `rooms/${room}`), { status: "playing" });
    listenForUpdates();
};

// --- SPEL-LOGIK ---
function listenForUpdates() {
    onValue(ref(db, `rooms/${myRoom}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        if (data.status === "playing" && document.querySelector('.game-board').classList.contains('hidden')) {
            startGameUI(data);
        }

        if (data.moves && data.moves.p1 && data.moves.p2 && !isAnimating) {
            handleRoundResult(data);
        }

        if (data.rematchVotes >= 2) {
            resetMatchUI();
        }
    });
}

function startGameUI(data) {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.querySelector('.game-board').classList.remove('hidden');
    document.getElementById('controls').classList.remove('hidden');
    document.getElementById('game-over-panel').classList.add('hidden'); 
    document.body.className = data.arena;

    const me = data.players[myPlayerKey];
    const opponentKey = myPlayerKey === "p1" ? "p2" : "p1";
    const opponent = data.players[opponentKey];

    document.getElementById('player-img').src = `images/${me.avatar}`;
    document.querySelector('.player-name').innerText = me.name;
    document.getElementById('player-score').innerText = me.score; 

    document.getElementById('enemy-img').src = `images/${opponent.avatar}`;
    document.querySelector('.enemy-name').innerText = opponent.name;
    document.getElementById('enemy-score').innerText = opponent.score; 

    updateRoundInfo(`Runda ${data.round} / ${maxRounds}`, "Välj ditt drag!");
    startTimer();
}

window.playGame = async function(choice) {
    if (isAnimating || hasChosen) return;
    hasChosen = true; 
    stopTimer();
    await set(ref(db, `rooms/${myRoom}/moves/${myPlayerKey}`), choice);
    document.getElementById('player-hand').classList.add('shake');
    document.querySelectorAll('.game-btn').forEach(b => b.disabled = true);
};

function handleRoundResult(data) {
    isAnimating = true;
    const p1Move = data.moves.p1;
    const p2Move = data.moves.p2;

    setTimeout(async () => {
        const myMove = data.moves[myPlayerKey];
        const enemyMove = data.moves[myPlayerKey === "p1" ? "p2" : "p1"];
        
        const pHand = document.getElementById('player-hand');
        const eHand = document.getElementById('enemy-hand');
        pHand.classList.remove('shake');
        pHand.innerText = hands[myMove];
        eHand.innerText = hands[enemyMove];

        if (myPlayerKey === "p1") {
            const winner = determineWinner(p1Move, p2Move);
            if (winner === 'p1') data.players.p1.score += 10;
            if (winner === 'p2') data.players.p2.score += 10;
            
            await update(ref(db, `rooms/${myRoom}`), {
                players: data.players,
                moves: null,
                round: data.round + 1
            });
        }

        // --- UPPDATERA POÄNGEN PÅ SKÄRMEN DIREKT ---
        const currentData = (await get(ref(db, `rooms/${myRoom}`))).val();
        const me = currentData.players[myPlayerKey];
        const opponentKey = myPlayerKey === "p1" ? "p2" : "p1";
        const opponent = currentData.players[opponentKey];

        document.getElementById('player-score').innerText = me.score;
        document.getElementById('enemy-score').innerText = opponent.score;

        setTimeout(() => {
            if (data.round >= maxRounds) {
                isAnimating = false;
                endMatch(currentData);
            } else {
                isAnimating = false;
                resetRoundUI(data.round + 1);
            }
        }, 2000);
    }, 1500);
}

// --- HJÄLPFUNKTIONER ---
function startTimer() {
    timeLeft = 10; 
    hasChosen = false;
    document.getElementById('timer-container').classList.remove('hidden');
    document.getElementById('timer-text').innerText = timeLeft;
    
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer-text').innerText = timeLeft;
        if (timeLeft <= 0) {
            stopTimer();
            if (!hasChosen) playGame(['sten', 'sax', 'pase'][Math.floor(Math.random()*3)]);
        }
    }, 1000);
}

function stopTimer() { 
    clearInterval(timerInterval); 
    document.getElementById('timer-container').classList.add('hidden'); 
}

function determineWinner(p1, p2) {
    if (p1 === p2) return 'draw';
    return ((p1==='sten'&&p2==='sax')||(p1==='sax'&&p2==='pase')||(p1==='pase'&&p2==='sten')) ? 'p1' : 'p2';
}

function updateRoundInfo(main, sub) {
    document.getElementById('round-display').innerText = main;
    document.getElementById('game-message').innerText = sub;
}

function resetRoundUI(nextRound) {
    document.getElementById('player-hand').innerText = hands.rocknroll;
    document.getElementById('enemy-hand').innerText = hands.rocknroll;
    document.querySelectorAll('.game-btn').forEach(b => b.disabled = false);
    updateRoundInfo(`Runda ${nextRound} / ${maxRounds}`, "Gör ditt drag!");
    startTimer();
}

function endMatch(data) {
    const myScore = data.players[myPlayerKey].score;
    const opponentKey = myPlayerKey === "p1" ? "p2" : "p1";
    const enemyScore = data.players[opponentKey].score;
    
    let msg = myScore > enemyScore ? "DU VANN MATCHEN! 🏆" : (myScore < enemyScore ? "DU FÖRLORADE... 💀" : "OAVGJORT!");
    
    if(myScore > enemyScore) careerWins++; else if(myScore < enemyScore) careerLosses++;
    careerScore += myScore;
    
    updateRoundInfo("GAME OVER", msg);
    document.getElementById('stat-wins').innerText = careerWins;
    document.getElementById('stat-losses').innerText = careerLosses;
    document.getElementById('stat-total-score').innerText = careerScore;
    
    document.getElementById('game-over-panel').classList.remove('hidden');
    document.getElementById('controls').classList.add('hidden');
    stopTimer();
}

window.voteRematch = async function() {
    const snap = await get(ref(db, `rooms/${myRoom}/rematchVotes`));
    await set(ref(db, `rooms/${myRoom}/rematchVotes`), (snap.val() || 0) + 1);
    document.getElementById('restart-btn').innerText = "VÄNTAR...";
    document.getElementById('restart-btn').disabled = true;
};

async function resetMatchUI() {
    await update(ref(db, `rooms/${myRoom}`), { 
        round: 1, 
        status: "playing", 
        rematchVotes: 0, 
        "players/p1/score": 0, 
        "players/p2/score": 0 
    });
    
    document.getElementById('restart-btn').disabled = false;
    document.getElementById('restart-btn').innerText = "SPELA IGEN";
    document.getElementById('game-over-panel').classList.add('hidden');
    isAnimating = false;
    
    const snapshot = await get(ref(db, `rooms/${myRoom}`));
    startGameUI(snapshot.val());
}