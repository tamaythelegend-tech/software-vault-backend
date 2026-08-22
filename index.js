import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Database Stores
const usersDB = {}; // { username: { password, credits, vault: [] } }

const arenaRooms = {
  1: { activeItem: null, ownerUsername: null, participants: [], currentBid: 0, highestBidder: 'None', timer: 0, status: 'EMPTY' },
  2: { activeItem: null, ownerUsername: null, participants: [], currentBid: 0, highestBidder: 'None', timer: 0, status: 'EMPTY' },
  3: { activeItem: null, ownerUsername: null, participants: [], currentBid: 0, highestBidder: 'None', timer: 0, status: 'EMPTY' },
  4: { activeItem: null, ownerUsername: null, participants: [], currentBid: 0, highestBidder: 'None', timer: 0, status: 'EMPTY' },
  5: { activeItem: null, ownerUsername: null, participants: [], currentBid: 0, highestBidder: 'None', timer: 0, status: 'EMPTY' },
  6: { activeItem: null, ownerUsername: null, participants: [], currentBid: 0, highestBidder: 'None', timer: 0, status: 'EMPTY' },
  7: { activeItem: null, ownerUsername: null, participants: [], currentBid: 0, highestBidder: 'None', timer: 0, status: 'EMPTY' },
  8: { activeItem: null, ownerUsername: null, participants: [], currentBid: 0, highestBidder: 'None', timer: 0, status: 'EMPTY' },
};

setInterval(() => {
  Object.keys(arenaRooms).forEach(arenaId => {
    const room = arenaRooms[arenaId];
    if (room.status === 'LIVE' && room.timer > 0) {
      room.timer -= 1;
      if (room.timer === 0) {
        room.status = 'ENDED';

        // Deliver item to highest bidder vault & transfer funds
        if (room.highestBidder !== 'Reserve Price' && usersDB[room.highestBidder]) {
          // Add item to winner's vault
          usersDB[room.highestBidder].vault.push(room.activeItem);
          
          // Deduct bid from winner balance
          usersDB[room.highestBidder].credits -= room.currentBid;

          // 💰 PAY THE OWNER: Transfer final bid credits to the seller
          if (room.ownerUsername && usersDB[room.ownerUsername]) {
            usersDB[room.ownerUsername].credits += room.currentBid;
          }
        }

        io.to(`arena_${arenaId}`).emit('auction_ended', {
          winner: room.highestBidder,
          finalBid: room.currentBid,
          item: room.activeItem
        });

        // Reset Room
        arenaRooms[arenaId] = { activeItem: null, ownerUsername: null, participants: [], currentBid: 0, highestBidder: 'None', timer: 0, status: 'EMPTY' };
      }
      io.to(`arena_${arenaId}`).emit('room_update', room);
    }
  });
}, 1000);

io.on('connection', (socket) => {

  // Auth Operations
  socket.on('auth_user', ({ username, password, isRegister }) => {
    if (isRegister) {
      if (usersDB[username]) {
        socket.emit('auth_response', { success: false, message: 'Username already taken!' });
        return;
      }
      usersDB[username] = { password, credits: 2500, vault: [] };
      socket.emit('auth_response', { success: true, user: { username, ...usersDB[username] } });
    } else {
      const user = usersDB[username];
      if (!user || user.password !== password) {
        socket.emit('auth_response', { success: false, message: 'Invalid username or password!' });
        return;
      }
      socket.emit('auth_response', { success: true, user: { username, ...user } });
    }
  });

  socket.on('get_user_profile', (username) => {
    if (usersDB[username]) {
      socket.emit('profile_data', { username, ...usersDB[username] });
    }
  });

  // Arena Operations
  socket.on('join_arena', ({ arenaId, username }) => {
    socket.join(`arena_${arenaId}`);
    const room = arenaRooms[arenaId];

    if (room.activeItem && username !== room.ownerUsername) {
      if (!room.participants.includes(username)) {
        room.participants.push(username);
      }
      if (room.participants.length >= 2 && room.status === 'WAITING_FOR_PLAYERS') {
        room.status = 'LIVE';
        room.timer = 60;
      }
    }
    io.to(`arena_${arenaId}`).emit('room_update', room);
  });

  socket.on('start_auction', ({ arenaId, item, username }) => {
    arenaRooms[arenaId] = {
      activeItem: item,
      ownerUsername: username,
      participants: [],
      currentBid: Number(item.reserve) || 100,
      highestBidder: 'Reserve Price',
      timer: 60,
      status: 'WAITING_FOR_PLAYERS'
    };
    io.to(`arena_${arenaId}`).emit('room_update', arenaRooms[arenaId]);
  });

  socket.on('place_bid', ({ arenaId, bidAmount, username }) => {
    const room = arenaRooms[arenaId];
    if (room.status === 'LIVE' && room.timer > 0) {
      const user = usersDB[username];
      if (user && user.credits >= (room.currentBid + bidAmount)) {
        room.currentBid += bidAmount;
        room.highestBidder = username;
        io.to(`arena_${arenaId}`).emit('room_update', room);
      }
    }
  });
});

server.listen(5000, '0.0.0.0', () => {
  console.log('[VAULT ENGINE] Real-Time Global Server Active on Port 5000');
});
