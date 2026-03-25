// 1. Load environment variables first
require('dotenv').config();
const mongoose = require('mongoose');
const io = require("socket.io")(3000, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const activeRooms = {};

// 2. Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected Successfully!");
    })
    .catch((err) => {
        console.error("❌ MongoDB Connection Error:", err.message);
    });

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

    // ... the rest of your disconnect, offer, answer, and ice-candidate events ...
});

console.log("Signaling server running on port 3000");