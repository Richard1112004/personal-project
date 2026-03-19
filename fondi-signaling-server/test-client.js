const { io } = require("socket.io-client");
const readline = require("readline");

// Setup terminal input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const socket = io("http://localhost:3000");

socket.on("connect", () => {
    console.log("Connected! My ID:", socket.id);
    
    // Step 2: Now you type the room name
    rl.question("Enter Room ID to join: ", (roomId) => {
        socket.emit("join-room", roomId);
        console.log(`Attempting to join room: ${roomId}`);
    });
});

// Listen for the "user-joined" signal from the server
socket.on("user-joined", (newUserId) => {
    console.log(`--- SIGNAL RECEIVED ---`);
    console.log(`User ${newUserId} just entered the room!`);
    console.log(`Now we would start the WebRTC handshake...`);
});