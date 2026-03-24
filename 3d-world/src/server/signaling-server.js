const io = require("socket.io")(3000, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const activeRooms = {};

io.on("connection", (socket) => {
    console.log("User connected: " + socket.id);

    socket.on("join-room", (roomId) => {
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

    socket.on("offer", (payload) => io.to(payload.targetId).emit("offer", { senderId: socket.id, offer: payload.offer }));
    socket.on("answer", (payload) => io.to(payload.targetId).emit("answer", { senderId: socket.id, answer: payload.answer }));
    socket.on("ice-candidate", (payload) => io.to(payload.targetId).emit("ice-candidate", { senderId: socket.id, candidate: payload.candidate }));

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
