const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));

const server = app.listen(process.env.PORT || 3000);
const wss = new WebSocket.Server({ server });

const rooms = {};

function code() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

wss.on("connection", ws => {
  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if (data.type === "CREATE") {
      const c = code();
      rooms[c] = { players: [], votes: {}, started: false };
      ws.send(JSON.stringify({ type: "CREATED", code: c }));
    }

    if (data.type === "JOIN") {
      const room = rooms[data.code];
      if (!room) return;

      ws.id = Date.now();
      ws.name = data.name;
      ws.room = data.code;

      room.players.push({
        id: ws.id,
        name: ws.name,
        ws,
        alive: true
      });

      broadcast(room, {
        type: "PLAYERS",
        players: room.players
      });
    }

    if (data.type === "START") {
      const room = rooms[ws.room];
      if (room.started || room.players.length < 3) return;

      room.started = true;
      const imp = room.players[Math.floor(Math.random() * room.players.length)];
      room.impostor = imp.id;

      room.players.forEach(p =>
        p.ws.send(JSON.stringify({
          type: "ROLE",
          role: p.id === room.impostor ? "IMPOSTOR" : "CREW"
        }))
      );
    }

    if (data.type === "VOTE") {
      const room = rooms[ws.room];
      room.votes[ws.id] = data.target;

      if (Object.keys(room.votes).length === alive(room).length) {
        const count = {};
        Object.values(room.votes).forEach(id => {
          count[id] = (count[id] || 0) + 1;
        });

        const eliminated = Object.keys(count).reduce((a, b) =>
          count[a] > count[b] ? a : b
        );

        const p = room.players.find(x => x.id == eliminated);
        p.alive = false;
        room.votes = {};

        broadcast(room, {
          type: "ELIMINATED",
          name: p.name
        });

        checkWin(room);
      }
    }
  });
});

function broadcast(room, data) {
  room.players.forEach(p => p.ws.send(JSON.stringify(data)));
}

function alive(room) {
  return room.players.filter(p => p.alive);
}

function checkWin(room) {
  const alivePlayers = alive(room);
  const impostorAlive = alivePlayers.some(p => p.id === room.impostor);

  if (!impostorAlive)
    broadcast(room, { type: "WIN", winner: "CREW" });
  else if (alivePlayers.length <= 2)
    broadcast(room,
