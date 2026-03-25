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
    socket.on('login-user', async (data) => {
        try {
            if (!isMongoReady) {
                return socket.emit('error-msg', 'Auth is unavailable: MONGO_URI is not configured on server.');
            }
            const { username, password } = data;
            const user = await User.findOne({ username });
            if (!user) return socket.emit('login-failed', 'User not found');

            let ok = false;
            if (bcrypt && typeof user.password === 'string' && user.password.startsWith('$2')) {
                ok = await bcrypt.compare(password, user.password);
            } else {
                ok = (password === user.password);
            }

            if (!ok) return socket.emit('login-failed', 'Invalid credentials');

            // Successful login
            socket.userId = user._id;
            socket.emit('login-success', { username: user.username, id: user._id });
            console.log(`User logged in: ${user.username} (${socket.id})`);
        } catch (err) {
            console.error('Login error:', err);
            socket.emit('error-msg', 'Server error during login');
        }
    });

    // Disconnect handler: clean up user from all rooms
    socket.on("disconnect", () => {
        console.log("User disconnected: " + socket.id);
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
});

console.log("Signaling server running on port 3000");