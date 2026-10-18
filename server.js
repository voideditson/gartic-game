const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('createRoom', ({ username, drawTime, promptTime }) => {
    const roomId = generateRoomCode();
    currentRoom = roomId;
    socket.join(roomId);

    rooms[roomId] = {
      host: socket.id,
      drawTime: parseInt(drawTime) || 60,
      promptTime: parseInt(promptTime) || 30,
      players: [{ id: socket.id, username }],
      state: 'LOBBY',
      chains: [],
      turnData: [],
      round: 0
    };

    socket.emit('roomCreated', { roomId, isHost: true });
    io.to(roomId).emit('updateLobby', rooms[roomId]);
  });

  socket.on('joinRoom', ({ roomId, username }) => {
    const code = roomId?.toUpperCase();
    const room = rooms[code];
    if (!room) return socket.emit('errorMsg', 'Room not found.');
    if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'Game already in progress.');

    currentRoom = code;
    socket.join(currentRoom);
    room.players.push({ id: socket.id, username });

    socket.emit('roomJoined', { roomId: currentRoom, isHost: false });
    io.to(currentRoom).emit('updateLobby', room);
  });

  socket.on('startGame', () => {
    const room = rooms[currentRoom];
    if (!room || room.host !== socket.id) return;

    room.state = 'PLAYING';
    room.round = 0;
    room.chains = room.players.map((p) => ({
      owner: p.username,
      steps: []
    }));

    startTurnPhase(currentRoom);
  });

  socket.on('submitTurn', ({ data }) => {
    const room = rooms[currentRoom];
    if (!room) return;

    const playerIndex = room.players.findIndex((p) => p.id === socket.id);
    room.turnData[playerIndex] = { playerId: socket.id, username: room.players[playerIndex].username, data };

    if (room.turnData.filter(Boolean).length === room.players.length) {
      processRoundEnd(currentRoom);
    }
  });

  socket.on('disconnect', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      delete rooms[currentRoom];
    } else {
      if (room.host === socket.id) room.host = room.players[0].id;
      io.to(currentRoom).emit('updateLobby', room);
    }
  });
});

function startTurnPhase(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.turnData = new Array(room.players.length).fill(null);
  const totalRounds = room.players.length;

  if (room.round >= totalRounds) {
    room.state = 'ALBUM';
    io.to(roomId).emit('showAlbum', { chains: room.chains });
    return;
  }

  const isPromptRound = room.round === 0;
  const timeLimit = isPromptRound ? room.promptTime : room.drawTime;

  for (let i = 0; i < room.players.length; i++) {
    const chainIndex = (i + room.round) % room.players.length;
    const targetChain = room.chains[chainIndex];
    const previousStep = targetChain.steps.length > 0 ? targetChain.steps[targetChain.steps.length - 1] : null;

    io.to(room.players[i].id).emit('startPhase', {
      type: isPromptRound ? 'PROMPT' : 'DRAW',
      timeLimit,
      previousStep,
      promptText: targetChain.steps[0]?.content || '',
      round: room.round + 1,
      totalRounds
    });
  }
}

function processRoundEnd(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  for (let i = 0; i < room.players.length; i++) {
    const chainIndex = (i + room.round) % room.players.length;
    const submission = room.turnData[i];
    room.chains[chainIndex].steps.push({
      author: submission.username,
      type: room.round === 0 ? 'text' : 'image',
      content: submission.data
    });
  }

  room.round++;
  startTurnPhase(roomId);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
