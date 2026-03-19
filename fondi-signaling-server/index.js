// Pure WebSocket Server - No Express, no HTML serving!
const io = require("socket.io")(3000, {
    cors: {
        origin: "*", // CORS: Allow any frontend port to connect
        methods: ["GET", "POST"]
    }
});

const activeRooms = {};

io.on("connection", (socket) => {
    console.log("User connected: " + socket.id);

    socket.on("join-room", (roomId) => {
        // THE FIX: Check room capacity BEFORE doing anything else
        if (activeRooms[roomId] && activeRooms[roomId].length >= 4) {
            console.log(`User ${socket.id} rejected from ${roomId} (Room Full)`);
            
            // Tell this specific user they cannot enter
            socket.emit("room-full", roomId); 
            return; // Stop the code here so they don't join!
        }

        // If the room has 3 or fewer people, proceed normally:
        socket.join(roomId);
        
        if (!activeRooms[roomId]) {
            activeRooms[roomId] = [];
        }

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
                // Remove the user from the room's list
                activeRooms[roomId] = room.filter(id => id !== socket.id);
                
                // Tell everyone else in the room that this person left
                socket.to(roomId).emit("user-left", socket.id);
                
                // Cleanup the room entirely if it's empty to save server memory
                if (activeRooms[roomId].length === 0) {
                    delete activeRooms[roomId];
                }
                break; 
            }
        }
    });
    
    socket.on("offer", (payload) => io.to(payload.targetId).emit("offer", { senderId: socket.id, offer: payload.offer }));
    socket.on("answer", (payload) => io.to(payload.targetId).emit("answer", { senderId: socket.id, answer: payload.answer }));
    socket.on("ice-candidate", (payload) => io.to(payload.targetId).emit("ice-candidate", { senderId: socket.id, candidate: payload.candidate }));

    // --- NEW: Handle a user leaving a room manually ---
    socket.on("leave-room", (roomId) => {
        // Unsubscribe the user from the Socket.io room
        socket.leave(roomId);
        
        if (activeRooms[roomId]) {
            // Remove them from our custom activeRooms array
            activeRooms[roomId] = activeRooms[roomId].filter(id => id !== socket.id);
            
            // Tell everyone else in the room to trigger their cleanup logic!
            socket.to(roomId).emit("user-left", socket.id);
            
            console.log(`User ${socket.id} manually left room: ${roomId}`);
            
            // Delete the room entirely if it's empty to save RAM
            if (activeRooms[roomId].length === 0) {
                delete activeRooms[roomId];
            }
        }
    });

});

console.log("Pure Signaling Server running on port 3000");