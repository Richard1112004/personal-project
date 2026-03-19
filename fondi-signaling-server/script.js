// Point the frontend directly to your Ngrok Backend link!
const socket = io("https://f647-2402-800-621f-145a-6041-7a15-dabc-c4d3.ngrok-free.app", {
    transports: ['websocket'],
    extraHeaders: { "ngrok-skip-browser-warning": "true" }
});
const logDiv = document.getElementById('log');

// THE FIX: The Multi-Peer Dictionary (Removed the old peerConnection variable)
const peers = {}; 
let localStream;
let isMuted = false;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// --- 1. VISUALIZER LOGIC ---
function setupVolumeMeter(stream, elementId) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256; 
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const volumeBar = document.getElementById(elementId);

    function update() {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) { sum += dataArray[i]; }
        let average = sum / bufferLength;
        if (volumeBar) volumeBar.style.width = Math.min(average * 2, 100) + "%";
        requestAnimationFrame(update);
    }
    update();
}

// --- 2. CAPTURE LOGIC ---
async function startCapture() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        addLog("MIC: Hardware active and volume meter setup.");
        setupVolumeMeter(localStream, "localVolumeBar");
        return true; 
    } catch (err) {
        alert("Mic Error: " + err.message);
        addLog("ERROR: Mic access denied. " + err.message);
        return false; 
    }
}

// --- 3. MULTI-PEER CONNECTION LOGIC ---
function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(config);
    
    // Save this connection to our Dictionary
    peers[targetId] = pc; 
    
    // Create a waiting line (Queue) for IP addresses
    pc.iceQueue = []; 

    // Attach your local microphone
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Handle ICE Candidates (Finding the IPs)
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", { targetId: targetId, candidate: event.candidate });
        }
    };

    // Handling incoming audio
    pc.ontrack = (event) => {
        addLog(`SUCCESS: Audio packets arriving from ${targetId}`);
        
        let audioEl = document.getElementById(`audio-${targetId}`);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `audio-${targetId}`;
            audioEl.autoplay = true;
            audioEl.playsInline = true; // Critical for iPhones!
            document.body.appendChild(audioEl); 
        }
        
        audioEl.srcObject = event.streams[0];

        // Force the phone's hardware to play the audio
        audioEl.onloadedmetadata = () => {
            audioEl.play().then(() => {
                addLog(`PLAYING: Audio is now live for ${targetId}`);
            }).catch(err => {
                addLog(`WARNING: Browser blocked audio for ${targetId}. Tap screen!`);
            });
        };
    };
    
    return pc;
}

// --- HELPER FUNCTION FOR THE QUEUE ---
async function processIceQueue(pc) {
    if (pc.iceQueue && pc.iceQueue.length > 0) {
        for (let candidate of pc.iceQueue) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
        }
        pc.iceQueue = []; // Empty the queue after processing
    }
}

// --- 4. MUTE LOGIC ---
function toggleMute() {
    if (!localStream) return; 
    
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);

    const btn = document.getElementById('muteBtn');
    if (isMuted) {
        btn.innerText = "Unmute Mic";
        btn.style.background = "#28a745";
        addLog("LOCAL: Microphone Muted.");
    } else {
        btn.innerText = "Mute Mic";
        btn.style.background = "#dc3545";
        addLog("LOCAL: Microphone Unmuted.");
    }
}

// --- 5. SIGNALING LOGIC ---
socket.on("user-joined", async (newUserId) => {
    // The "Traffic Light" Delay
    const delay = Math.floor(Math.random() * 2400) + 100; 
    addLog(`SIGNAL: User ${newUserId} joined. Waiting ${delay}ms...`);
    
    setTimeout(async () => {
        const pc = createPeerConnection(newUserId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { targetId: newUserId, offer: offer });
    }, delay);
});

socket.on("offer", async (data) => {
    addLog(`OFFER RECEIVED from ${data.senderId}.`);
    
    // Only create a new connection if we don't have one!
    let pc = peers[data.senderId];
    if (!pc) {
        pc = createPeerConnection(data.senderId);
    }

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        processIceQueue(pc); // Process waiting IPs

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { targetId: data.senderId, answer: answer });
    } catch (err) { console.error(err); }
});

socket.on("answer", async (data) => {
    // THE FIX: Find the correct connection in the Dictionary!
    const pc = peers[data.senderId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        addLog(`HANDSHAKE COMPLETE with ${data.senderId}!`);
        processIceQueue(pc); // Process waiting IPs
    }
});

socket.on("ice-candidate", async (data) => {
    // THE FIX: Find the correct connection in the Dictionary!
    const pc = peers[data.senderId];
    if (pc) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.error(e));
        } else {
            pc.iceQueue.push(data.candidate); // Put IP in the waiting line
        }
    }
});
// --- DISCONNECT LOGIC ---
socket.on("user-left", (userId) => {
    addLog(`User ${userId} left the room. Cleaning up...`);
    
    // 1. Close the WebRTC connection
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId]; // Remove them from the dictionary
    }

    // 2. Remove their audio tag from the HTML
    const audioEl = document.getElementById(`audio-${userId}`);
    if (audioEl) {
        audioEl.remove();
    }
    
    // 3. (Optional) Remove their volume bar if you built one for them!
});

// --- ROOM CAPACITY LOGIC ---
socket.on("room-full", (roomId) => {
    // 1. Alert the user
    alert(`Sorry, the room "${roomId}" is currently full (Max 4 users).`);
    addLog(`ERROR: Connection blocked. Room ${roomId} is full.`);

    // 2. Turn off the microphone hardware since we didn't join
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null; 
    }

    // 3. Reset the UI back to the starting state
    document.getElementById('localVolumeBar').style.width = "0%";
    document.getElementById('joinBtn').style.display = "inline-block";
    document.getElementById('leaveBtn').style.display = "none";
    document.getElementById('muteBtn').style.display = "none";
});
// --- 6. UI ACTIONS ---
async function joinRoom() {
    const roomId = document.getElementById('roomIdInput').value;
    if (roomId) {
        const micReady = await startCapture(); 
        if (micReady) {
            socket.emit("join-room", roomId);
            addLog(`Joined: ${roomId}.`);
            // Smart UI: Hide Join, Show Leave and Mute
            document.getElementById('joinBtn').style.display = "none";
            document.getElementById('leaveBtn').style.display = "inline-block";
            document.getElementById('muteBtn').style.display = "inline-block";
        }
    }
}

// --- NEW: THE LEAVE ROOM "KILL SWITCH" ---
function leaveRoom() {
    const roomId = document.getElementById('roomIdInput').value;
    
    // 1. Tell the server we are leaving
    socket.emit("leave-room", roomId);
    addLog(`Left room: ${roomId}.`);

    // 2. Kill the Hardware Microphone (Turns off the recording light!)
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null; 
    }

    // 3. Sever all Peer Connections & remove audio tags
    for (let userId in peers) {
        peers[userId].close(); // Hang up the phone
        delete peers[userId];  // Erase from dictionary
        
        const audioEl = document.getElementById(`audio-${userId}`);
        if (audioEl) audioEl.remove();
    }

    // 4. Reset the UI
    document.getElementById('localVolumeBar').style.width = "0%";
    document.getElementById('joinBtn').style.display = "inline-block";
    document.getElementById('leaveBtn').style.display = "none";
    document.getElementById('muteBtn').style.display = "none";
}

function addLog(msg) {
    const entry = document.createElement('div');
    entry.innerText = `> ${new Date().toLocaleTimeString()}: ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}