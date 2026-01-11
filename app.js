import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  getDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { firebaseConfig } from "./config.js";
import { topics, topicMap } from "./topics.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const screens = {
  welcome: document.getElementById("screen-welcome"),
  lobby: document.getElementById("screen-lobby"),
  game: document.getElementById("screen-game"),
  results: document.getElementById("screen-results")
};

const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");
const topicSelect = document.getElementById("topicSelect");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const welcomeError = document.getElementById("welcomeError");
const lobbyCode = document.getElementById("lobbyCode");
const playerList = document.getElementById("playerList");
const lobbyNotice = document.getElementById("lobbyNotice");
const startGameBtn = document.getElementById("startGame");
const topicTitle = document.getElementById("topicTitle");
const roundTimer = document.getElementById("roundTimer");
const currentItemEl = document.getElementById("currentItem");
const rankSlots = document.getElementById("rankSlots");
const submitChoiceBtn = document.getElementById("submitChoice");
const submitStatus = document.getElementById("submitStatus");
const playerRanking = document.getElementById("playerRanking");
const resultsGrid = document.getElementById("resultsGrid");
const revealOrder = document.getElementById("revealOrder");
const scoreboard = document.getElementById("scoreboard");
const answersTable = document.getElementById("answersTable");
const resetButton = document.getElementById("resetButton");

const ROUND_MS = 20000;

let currentRoom = null;
let roomCode = null;
let playerId = null;
let isHost = false;
let selectedSlot = null;
let players = [];
let roomUnsub = null;
let playersUnsub = null;
let timerInterval = null;
let lastRoundKey = null;
let advanceInFlight = false;

const storedPlayer = localStorage.getItem("br_player_id");
playerId = storedPlayer || crypto.randomUUID();
localStorage.setItem("br_player_id", playerId);

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function setWelcomeError(message) {
  if (!message) {
    welcomeError.classList.add("hidden");
    welcomeError.textContent = "";
    return;
  }
  welcomeError.textContent = message;
  welcomeError.classList.remove("hidden");
}

function sanitizeCode(code) {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function renderTopicOptions() {
  topicSelect.innerHTML = "";
  topics.forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = topic.name;
    topicSelect.appendChild(option);
  });
}

function roomRef(code) {
  return doc(db, "rooms", code);
}

function playerRef(code, id) {
  return doc(db, "rooms", code, "players", id);
}

async function createRoom() {
  const name = playerNameInput.value.trim();
  if (!name) {
    setWelcomeError("Please enter your name.");
    return;
  }
  const topicId = topicSelect.value;
  const topic = topicMap[topicId];
  if (!topic) {
    setWelcomeError("Pick a topic to host.");
    return;
  }

  const code = generateRoomCode();
  const roomDoc = roomRef(code);
  const order = shuffle(topic.items);

  await setDoc(roomDoc, {
    code,
    topicId,
    status: "lobby",
    order,
    currentIndex: -1,
    roundEndsAt: null,
    hostId: playerId,
    createdAt: serverTimestamp()
  });

  await setDoc(playerRef(code, playerId), {
    name,
    ranking: Array(topic.items.length).fill(null),
    joinedAt: serverTimestamp()
  });

  localStorage.setItem("br_player_name", name);
  localStorage.setItem("br_room_code", code);
  roomCode = code;
  subscribeRoom(code);
}

async function joinRoom() {
  const name = playerNameInput.value.trim();
  const code = sanitizeCode(roomCodeInput.value.trim());
  if (!name) {
    setWelcomeError("Please enter your name.");
    return;
  }
  if (!code) {
    setWelcomeError("Enter a room code to join.");
    return;
  }

  const snapshot = await getDoc(roomRef(code));
  if (!snapshot.exists()) {
    setWelcomeError("Room not found. Check the code.");
    return;
  }

  const data = snapshot.data();
  if (data.status !== "lobby") {
    setWelcomeError("That room already started. Create a new one.");
    return;
  }

  const topic = topicMap[data.topicId];
  await setDoc(playerRef(code, playerId), {
    name,
    ranking: Array(topic.items.length).fill(null),
    joinedAt: serverTimestamp()
  });

  localStorage.setItem("br_player_name", name);
  localStorage.setItem("br_room_code", code);
  roomCode = code;
  subscribeRoom(code);
}

function subscribeRoom(code) {
  if (roomUnsub) roomUnsub();
  if (playersUnsub) playersUnsub();

  roomUnsub = onSnapshot(roomRef(code), (snapshot) => {
    if (!snapshot.exists()) {
      setWelcomeError("Room was removed.");
      showScreen("welcome");
      return;
    }
    currentRoom = snapshot.data();
    isHost = currentRoom.hostId === playerId;
    renderRoom();
  });

  playersUnsub = onSnapshot(collection(db, "rooms", code, "players"), (snapshot) => {
    players = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderRoom();
  });
}

function renderRoom() {
  if (!currentRoom) return;

  if (currentRoom.status === "lobby") {
    showScreen("lobby");
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    lastRoundKey = null;
    lobbyCode.textContent = currentRoom.code;
    playerList.innerHTML = "";
    players.forEach((player) => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = player.name;
      playerList.appendChild(pill);
    });
    lobbyNotice.textContent = isHost
      ? "You are the host. Start the round when ready."
      : "Waiting for host to start.";
    startGameBtn.disabled = !isHost;
  }

  if (currentRoom.status === "in_round") {
    showScreen("game");
    renderGame();
  }

  if (currentRoom.status === "complete") {
    showScreen("results");
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    lastRoundKey = null;
    renderResults();
  }
}

function renderGame() {
  const topic = topicMap[currentRoom.topicId];
  if (!topic) return;

  topicTitle.textContent = topic.name;
  const currentIndex = currentRoom.currentIndex;
  const currentItem = currentRoom.order[currentIndex];
  currentItemEl.textContent = currentItem || "Waiting for reveal...";

  const me = players.find((player) => player.id === playerId);
  const myRanking = me ? me.ranking || [] : [];

  if (currentItem) {
    renderRankSlots(myRanking, currentItem);
  } else {
    rankSlots.innerHTML = "";
  }
  renderPlayerRanking(myRanking);

  const alreadyPlaced = currentItem ? myRanking.includes(currentItem) : false;
  submitChoiceBtn.disabled = alreadyPlaced;
  if (alreadyPlaced) {
    submitStatus.textContent = "Locked in. Waiting for others...";
    submitStatus.classList.remove("hidden");
  } else {
    submitStatus.classList.add("hidden");
  }

  updateTimer();
  void checkAdvance(currentItem);
}

function renderRankSlots(myRanking, currentItem) {
  rankSlots.innerHTML = "";
  selectedSlot = null;

  myRanking.forEach((item, index) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "rank-slot";
    slot.textContent = item ? `#${index + 1} ${item}` : `#${index + 1}`;

    if (item) {
      slot.classList.add("filled");
      slot.disabled = true;
    } else {
      slot.classList.add("available");
      slot.addEventListener("click", () => {
        if (!currentItem) return;
        if (myRanking.includes(currentItem)) return;
        selectedSlot = index;
        document.querySelectorAll(".rank-slot").forEach((node) => {
          node.classList.remove("selected");
        });
        slot.classList.add("selected");
      });
    }

    rankSlots.appendChild(slot);
  });
}

function renderPlayerRanking(myRanking) {
  playerRanking.innerHTML = "";
  myRanking.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "player-rank";
    const number = document.createElement("span");
    number.textContent = index + 1;
    const text = document.createElement("div");
    text.textContent = item ? item : "(empty)";
    row.appendChild(number);
    row.appendChild(text);
    playerRanking.appendChild(row);
  });
}

function renderResults() {
  resultsGrid.innerHTML = "";
  const topic = topicMap[currentRoom.topicId];
  const order = currentRoom.order || [];
  revealOrder.textContent = `Reveal order: ${order.join(" \u2192 ")}`;

  if (topic) {
    renderScoreboard(topic);
    renderAnswersTable(topic);
  }

  players.forEach((player) => {
    const card = document.createElement("div");
    card.className = "player-card";
    const title = document.createElement("h3");
    title.textContent = player.name;
    card.appendChild(title);

    const ranks = document.createElement("div");
    ranks.className = "player-ranks";
    (player.ranking || []).forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "player-rank";
      const num = document.createElement("span");
      num.textContent = index + 1;
      const text = document.createElement("div");
      text.textContent = item ? item : "(empty)";
      row.appendChild(num);
      row.appendChild(text);
      ranks.appendChild(row);
    });
    card.appendChild(ranks);
    resultsGrid.appendChild(card);
  });
}

function renderScoreboard(topic) {
  scoreboard.innerHTML = "";
  const scores = players.map((player) => ({
    id: player.id,
    name: player.name,
    points: calculatePlayerScore(player, topic)
  }));

  scores.sort((a, b) => a.points - b.points);

  const title = document.createElement("h3");
  title.textContent = "Scoreboard (lowest points wins)";
  scoreboard.appendChild(title);

  scores.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "score-row";
    const name = document.createElement("div");
    name.innerHTML = `<span class=\"score-rank\">#${index + 1}</span>${entry.name}`;
    const points = document.createElement("div");
    points.textContent = `${entry.points} pts`;
    row.appendChild(name);
    row.appendChild(points);
    scoreboard.appendChild(row);
  });
}

function renderAnswersTable(topic) {
  answersTable.innerHTML = "";
  const title = document.createElement("h3");
  title.textContent = "Actual Answers vs Player Guesses";
  answersTable.appendChild(title);

  const table = document.createElement("table");
  table.className = "answers-table";
  const header = document.createElement("tr");
  ["Rank", "Answer", ...players.map((player) => player.name)].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    header.appendChild(th);
  });
  const thead = document.createElement("thead");
  thead.appendChild(header);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  topic.items.forEach((item, index) => {
    const row = document.createElement("tr");
    const rankCell = document.createElement("td");
    rankCell.textContent = String(index + 1);
    const itemCell = document.createElement("td");
    itemCell.textContent = item;
    row.appendChild(rankCell);
    row.appendChild(itemCell);

    players.forEach((player) => {
      const guessCell = document.createElement("td");
      const guessIndex = (player.ranking || []).indexOf(item);
      guessCell.textContent = guessIndex >= 0 ? String(guessIndex + 1) : "-";
      row.appendChild(guessCell);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  answersTable.appendChild(table);
}

function calculatePlayerScore(player, topic) {
  const actualMap = new Map();
  topic.items.forEach((item, index) => actualMap.set(item, index));
  let points = 0;
  topic.items.forEach((item) => {
    const actualIndex = actualMap.get(item);
    let guessedIndex = (player.ranking || []).indexOf(item);
    if (guessedIndex < 0) {
      guessedIndex = topic.items.length - 1;
    }
    points += Math.abs(guessedIndex - actualIndex);
  });
  return points;
}

function updateTimer() {
  if (!currentRoom.roundEndsAt) {
    roundTimer.textContent = "20";
    return;
  }
  const roundKey = `${currentRoom.code}-${currentRoom.currentIndex}-${currentRoom.roundEndsAt}`;
  if (roundKey === lastRoundKey && timerInterval) return;
  if (timerInterval) clearInterval(timerInterval);
  lastRoundKey = roundKey;

  timerInterval = setInterval(() => {
    const remaining = Math.max(0, currentRoom.roundEndsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    roundTimer.textContent = String(seconds).padStart(2, "0");
    if (remaining <= 0) {
      void checkAdvance(currentRoom.order[currentRoom.currentIndex]);
    }
  }, 200);
}

async function submitChoice() {
  if (!currentRoom) return;
  const currentItem = currentRoom.order[currentRoom.currentIndex];
  const me = players.find((player) => player.id === playerId);
  if (!me || !currentItem) return;
  if (me.ranking.includes(currentItem)) return;
  if (selectedSlot === null) {
    submitStatus.textContent = "Choose a slot before locking in.";
    submitStatus.classList.remove("hidden");
    return;
  }

  const updatedRanking = [...me.ranking];
  updatedRanking[selectedSlot] = currentItem;
  await updateDoc(playerRef(currentRoom.code, playerId), {
    ranking: updatedRanking
  });

  submitStatus.textContent = "Locked in. Waiting for others...";
  submitStatus.classList.remove("hidden");
}

async function startGame() {
  if (!currentRoom || !isHost) return;
  await updateDoc(roomRef(currentRoom.code), {
    status: "in_round",
    currentIndex: 0,
    roundEndsAt: Date.now() + ROUND_MS
  });
}

function allPlayersSubmitted(currentItem) {
  if (!currentItem) return false;
  return players.length > 0 && players.every((player) => (player.ranking || []).includes(currentItem));
}

async function autoAssignMissing(currentItem) {
  if (!currentRoom || !currentItem) return;
  const updates = players
    .filter((player) => !(player.ranking || []).includes(currentItem))
    .map((player) =>
      runTransaction(db, async (transaction) => {
        const ref = playerRef(currentRoom.code, player.id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const ranking = Array.isArray(data.ranking) ? [...data.ranking] : [];
        if (ranking.includes(currentItem)) return;
        const emptyIndex = ranking.indexOf(null);
        if (emptyIndex === -1) return;
        ranking[emptyIndex] = currentItem;
        transaction.update(ref, { ranking });
      })
    );

  await Promise.all(updates);
}

async function advanceRound() {
  if (advanceInFlight || !currentRoom) return;
  advanceInFlight = true;

  try {
    await runTransaction(db, async (transaction) => {
      const roomDoc = roomRef(currentRoom.code);
      const snapshot = await transaction.get(roomDoc);
      if (!snapshot.exists()) return;

      const data = snapshot.data();
      if (data.status !== "in_round") return;

      const nextIndex = data.currentIndex + 1;
      if (nextIndex >= data.order.length) {
        transaction.update(roomDoc, {
          status: "complete",
          roundEndsAt: null
        });
        return;
      }

      transaction.update(roomDoc, {
        currentIndex: nextIndex,
        roundEndsAt: Date.now() + ROUND_MS
      });
    });
  } finally {
    advanceInFlight = false;
  }
}

async function checkAdvance(currentItem) {
  if (!currentRoom || currentRoom.status !== "in_round") return;
  if (!isHost) return;
  if (advanceInFlight) return;
  const remaining = currentRoom.roundEndsAt ? currentRoom.roundEndsAt - Date.now() : 0;
  if (remaining <= 0) {
    await autoAssignMissing(currentItem);
    await advanceRound();
    return;
  }
  if (allPlayersSubmitted(currentItem)) {
    await advanceRound();
  }
}

function resetSession() {
  localStorage.removeItem("br_player_name");
  localStorage.removeItem("br_room_code");
  if (roomUnsub) roomUnsub();
  if (playersUnsub) playersUnsub();
  if (timerInterval) clearInterval(timerInterval);
  currentRoom = null;
  players = [];
  roomCode = null;
  showScreen("welcome");
}

createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
startGameBtn.addEventListener("click", startGame);
submitChoiceBtn.addEventListener("click", submitChoice);
resetButton.addEventListener("click", resetSession);
roomCodeInput.addEventListener("input", (event) => {
  event.target.value = sanitizeCode(event.target.value);
});

renderTopicOptions();
showScreen("welcome");

const savedName = localStorage.getItem("br_player_name");
const savedRoom = localStorage.getItem("br_room_code");
if (savedName) playerNameInput.value = savedName;
if (savedRoom) roomCodeInput.value = savedRoom;
