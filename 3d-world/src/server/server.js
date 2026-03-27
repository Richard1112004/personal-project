// 1. Load environment variables first
require('dotenv').config();
const User = require('./user'); // <-- ADD THIS
const mongoose = require('mongoose');
// Try to load bcrypt (prefer native), fall back to bcryptjs if available
let bcrypt = null;
try { bcrypt = require('bcrypt'); } catch (e) {
    try { bcrypt = require('bcryptjs'); } catch (e2) { bcrypt = null; }
}
const io = require("socket.io")(3000, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "ngrok-skip-browser-warning"],
        credentials: false
    }
});

const activeRooms = {};
const gameWorld = {
    players: {}, // Stores everyone's X, Y, Z, and Avatar Model
    chairs: {}   // We will use this in Stage 2!
};
// Map of currently authenticated users by socket id
const authenticatedUsers = {};
const mongoUri = process.env.MONGO_URI;
let isMongoReady = false;

// 2. Connect to MongoDB
if (typeof mongoUri === 'string' && mongoUri.trim().length > 0) {
    mongoose.connect(mongoUri)
        .then(() => {
            isMongoReady = true;
            console.log("✅ MongoDB Connected Successfully!");
        })
        .catch((err) => {
            console.error("❌ MongoDB Connection Error:", err.message);
        });
} else {
    console.warn("⚠️ MONGO_URI is missing. Voice/signaling works, but register/login is disabled.");
}

// 3. Your existing Socket.IO logic remains exactly the same below
io.on("connection", (socket) => {
    console.log("User connected: " + socket.id);

    socket.on("join-room", (roomId) => {
        // ... your existing room logic ...
        if (activeRooms[roomId] && activeRooms[roomId].length >= 4) {
            console.log(`User ${socket.id} rejected from ${roomId} (Room Full)`);
            socket.emit("room-full", roomId);
            return;
        }

        socket.join(roomId);
        if (!activeRooms[roomId]) activeRooms[roomId] = [];
        if (!activeRooms[roomId].includes(socket.id)) {
            activeRooms[roomId].push(socket.id);
            console.log(`User ${socket.id} joined room: ${roomId}`);
            socket.to(roomId).emit("user-joined", socket.id);
        }
    });
    socket.on("register-user", async (data) => {
    try {
        if (!isMongoReady) {
            return socket.emit("error-msg", "Auth is unavailable: MONGO_URI is not configured on server.");
        }
        const { username, password } = data;

        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return socket.emit("error-msg", "Username already taken!");
        }

        // Create and save the new user
        const newUser = new User({ username, password });
        await newUser.save();

        console.log(`✨ New User Registered: ${username}`);
        socket.emit("register-success", { username: newUser.username });

    } catch (err) {
        console.error("Registration Error:", err);
        socket.emit("error-msg", "Server error during registration.");
    }
});

    // Login handler
    // Login handler
    socket.on('login-user', async (data) => {
        try {
            if (!isMongoReady) {
                return socket.emit('error-msg', 'Auth is unavailable: MONGO_URI is not configured on server.');
            }
            
            // 1. Find the user
            const { username, password } = data;
            const user = await User.findOne({ username });
            if (!user) return socket.emit('login-failed', 'User not found');

            // 2. Check the password
            let ok = false;
            if (bcrypt && typeof user.password === 'string' && user.password.startsWith('$2')) {
                ok = await bcrypt.compare(password, user.password);
            } else {
                ok = (password === user.password);
            }

            if (!ok) return socket.emit('login-failed', 'Invalid credentials');

            // 3. SUCCESSFUL LOGIN! Let's spawn them into the server's tracking map
            socket.userId = user._id;
            socket.username = user.username;
            
            gameWorld.players[socket.id] = {
                id: socket.id,
                username: user.username,
                avatarModel: user.avatarModel || 'casual_boy.glb', // Fallback to boy
                x: 0, y: 6, z: 15, // Your default cameraHolder starting position
                rotY: 0,
                action: 'idle'
            };

            // 4. Tell the logging-in player about everyone ALREADY in the world
            socket.emit('login-success', { 
                username: user.username, 
                id: user._id,
                worldState: gameWorld // Send them the map!
            });

            // 4.5 Add to authenticated users map and broadcast presence to all clients
            authenticatedUsers[socket.id] = {
                socketId: socket.id,
                userId: user._id,
                username: user.username
            };
            io.emit('presence-update', { users: Object.values(authenticatedUsers), chairs: gameWorld.chairs });

            // 5. Tell everyone ELSE that a new player just spawned in
            socket.broadcast.emit('player-joined', gameWorld.players[socket.id]);
            
            console.log(`🌍 Player spawned into world: ${user.username}`);
        } catch (err) {
            console.error('Login error:', err);
            socket.emit('error-msg', 'Server error during login');
        }
    });
    socket.on('player-moving', (moveData) => {
        if (gameWorld.players[socket.id]) {
            // Update the server's map
            gameWorld.players[socket.id].x = moveData.x;
            gameWorld.players[socket.id].y = moveData.y;
            gameWorld.players[socket.id].z = moveData.z;
            gameWorld.players[socket.id].rotY = moveData.rotY;
            gameWorld.players[socket.id].action = moveData.action;

            // Immediately broadcast this new position to everyone else
            socket.broadcast.emit('player-moved', gameWorld.players[socket.id]);
        }
    });

    // Client requests to occupy or free a chair
    socket.on('occupy-chair', (payload) => {
        try {
            const { chairId, occupy } = payload; // occupy: true/false
            if (!chairId) return;

            if (occupy) {
                gameWorld.chairs[chairId] = {
                    occupied: true,
                    by: authenticatedUsers[socket.id] || { socketId: socket.id, username: socket.username || 'unknown' }
                };
            } else {
                // free the chair if occupied by this socket
                if (gameWorld.chairs[chairId] && gameWorld.chairs[chairId].by && gameWorld.chairs[chairId].by.socketId === socket.id) {
                    gameWorld.chairs[chairId] = { occupied: false };
                }
            }
            console.log(`Chair ${chairId} is now ${occupy ? 'occupied' : 'free'} by ${socket.username || socket.id}`);

            // Notify everyone of the updated chairs and authenticated users
            io.emit('presence-update', { users: Object.values(authenticatedUsers), chairs: gameWorld.chairs });
        } catch (err) {
            console.error('Error handling occupy-chair:', err);
        }
    });

    // Disconnect handler: clean up user from all rooms
    socket.on("disconnect", () => {
        console.log("User disconnected: " + socket.id);
        if (gameWorld.players[socket.id]) {
            delete gameWorld.players[socket.id];
            io.emit('player-left', socket.id); 
        }
        // Remove from authenticated users and broadcast presence
        if (authenticatedUsers[socket.id]) {
            delete authenticatedUsers[socket.id];
            io.emit('presence-update', { users: Object.values(authenticatedUsers), chairs: gameWorld.chairs });
        }
        for (const roomId in activeRooms) {
            let room = activeRooms[roomId];
            if (room.includes(socket.id)) {
                activeRooms[roomId] = room.filter(id => id !== socket.id);
                socket.to(roomId).emit("user-left", socket.id);
                if (activeRooms[roomId].length === 0) delete activeRooms[roomId];
                break;
            }
        }
    });

    // WebRTC signaling: forward SDP offers, answers, and ICE candidates to target peer
    socket.on("offer", (payload) => io.to(payload.targetId).emit("offer", { senderId: socket.id, offer: payload.offer }));
    socket.on("answer", (payload) => io.to(payload.targetId).emit("answer", { senderId: socket.id, answer: payload.answer }));
    socket.on("ice-candidate", (payload) => io.to(payload.targetId).emit("ice-candidate", { senderId: socket.id, candidate: payload.candidate }));

    // Leave room handler
    socket.on("leave-room", (roomId) => {
        socket.leave(roomId);
        if (activeRooms[roomId]) {
            activeRooms[roomId] = activeRooms[roomId].filter(id => id !== socket.id);
            socket.to(roomId).emit("user-left", socket.id);
            console.log(`User ${socket.id} manually left room: ${roomId}`);
            if (activeRooms[roomId].length === 0) delete activeRooms[roomId];
        }
    });

    // Allow clients to request current presence map
    socket.on('request-presence', () => {
        try {
            socket.emit('presence-update', { users: Object.values(authenticatedUsers), chairs: gameWorld.chairs });
        } catch (err) { console.error('request-presence error', err); }
    });
});

console.log("Signaling server running on port 3000");