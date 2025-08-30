const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// ====== LOGICA GIOCO ======
const rooms = new Map();

function createRoom(code, thinkerName) {
  rooms.set(code, {
    thinker: null,
    secret: null,
    qCount: 0,
    players: new Map(),
    questions: []
  });
}

io.on('connection', socket => {
  console.log('New client connected');

  socket.on('room:create', ({ code, name, secret }) => {
    if (rooms.has(code)) {
      socket.emit('error:msg', 'Codice già in uso.');
      return;
    }
    createRoom(code);
    const room = rooms.get(code);
    room.thinker = socket.id;
    room.secret = secret;
    room.players.set(socket.id, { id: socket.id, name, thinker: true });
    socket.join(code);
    socket.emit('room:joined', { code, thinker: true });
    io.to(code).emit('players:update', Array.from(room.players.values()));
  });

  socket.on('room:join', ({ code, name }) => {
    const room = rooms.get(code);
    if (!room) {
      socket.emit('error:msg', 'Stanza non trovata.');
      return;
    }
    room.players.set(socket.id, { id: socket.id, name, thinker: false });
    socket.join(code);
    socket.emit('room:joined', { code, thinker: false });
    io.to(code).emit('players:update', Array.from(room.players.values()));
  });

  // Domanda
  socket.on('question:ask', ({ code, text }) => {
    const room = rooms.get(code);
    if (!room) return;
    room.qCount++;
    const q = { id: room.qCount, byName: room.players.get(socket.id).name, text, answer: null };
    room.questions.push(q);
    io.to(code).emit('question:new', q);
  });

  // Risposta (solo Pensatore)
  socket.on('question:answer', ({ code, id, answer }) => {
    const room = rooms.get(code);
    if (!room) return;
    const q = room.questions.find(x => x.id === id);
    if (q) {
      q.answer = answer;
      io.to(code).emit('question:update', q);
    }
  });

  // Tentativo di risposta (consuma una domanda)
  socket.on('guess:try', ({ code, guess }) => {
    const room = rooms.get(code);
    if (!room) return;
    room.qCount++;
    io.to(code).emit('guess:new', {
      byName: room.players.get(socket.id).name,
      guess,
      qCount: room.qCount
    });
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        io.to(code).emit('players:update', Array.from(room.players.values()));
        if (room.players.size === 0) {
          rooms.delete(code);
        }
      }
    }
  });
});
