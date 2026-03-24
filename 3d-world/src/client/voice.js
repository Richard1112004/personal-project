// Modular voice signaling client (browser)
// Usage: import { joinRoom, leaveRoom, toggleMute } from './voice.js'

const peers = {};
let localStream = null;
let isMuted = false;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let socket = null;

function addLog(msg) {
    let logDiv = document.getElementById('voiceLog');
    if (!logDiv) {
        logDiv = document.createElement('div');
        logDiv.id = 'voiceLog';
        logDiv.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;max-height:200px;overflow:auto;background:rgba(0,0,0,0.6);color:#fff;padding:8px;border-radius:6px;font-size:12px;';
        document.body.appendChild(logDiv);
    }
    const entry = document.createElement('div');
    entry.innerText = `> ${new Date().toLocaleTimeString()}: ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

async function startCapture() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        addLog('MIC: ready');
        return true;
    } catch (err) {
        addLog('MIC ERROR: ' + err.message);
        return false;
    }
}

function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(config);
    peers[targetId] = pc;
    pc.iceQueue = [];
    if (localStream) {
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }
    pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit('ice-candidate', { targetId, candidate: event.candidate });
    };
    pc.ontrack = (event) => {
        addLog(`Audio from ${targetId}`);
        let audioEl = document.getElementById(`audio-${targetId}`);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `audio-${targetId}`;
            audioEl.autoplay = true;
            audioEl.playsInline = true;
            document.body.appendChild(audioEl);
        }
        audioEl.srcObject = event.streams[0];
        audioEl.onloadedmetadata = () => audioEl.play().catch(() => addLog('Tap to enable audio'));
    };
    return pc;
}

async function processIceQueue(pc) {
    if (pc.iceQueue && pc.iceQueue.length) {
        for (let c of pc.iceQueue) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.error(e));
        }
        pc.iceQueue = [];
    }
}

function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    addLog(isMuted ? 'Muted' : 'Unmuted');
}

async function joinRoom(roomId) {
    if (!socket) {
        const host = location.hostname || 'localhost';
        const url = `https://aa9a-14-169-49-161.ngrok-free.app`;
        socket = io(url, { transports: ['websocket'] });

        socket.on('user-joined', async (newUserId) => {
            const delay = Math.floor(Math.random() * 2400) + 100;
            addLog(`Signal: ${newUserId} joined, waiting ${delay}ms`);
            setTimeout(async () => {
                const pc = createPeerConnection(newUserId);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { targetId: newUserId, offer });
            }, delay);
        });

        socket.on('offer', async (data) => {
            addLog(`Offer from ${data.senderId}`);
            let pc = peers[data.senderId] || createPeerConnection(data.senderId);
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                processIceQueue(pc);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('answer', { targetId: data.senderId, answer });
            } catch (e) { console.error(e); }
        });

        socket.on('answer', async (data) => {
            const pc = peers[data.senderId];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                processIceQueue(pc);
                addLog(`Handshake complete with ${data.senderId}`);
            }
        });

        socket.on('ice-candidate', async (data) => {
            const pc = peers[data.senderId];
            if (pc) {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.error(e));
                } else {
                    pc.iceQueue.push(data.candidate);
                }
            }
        });

        socket.on('user-left', (userId) => {
            addLog(`${userId} left`);
            if (peers[userId]) { peers[userId].close(); delete peers[userId]; }
            const audioEl = document.getElementById(`audio-${userId}`);
            if (audioEl) audioEl.remove();
        });

        socket.on('room-full', (room) => {
            addLog(`Room ${room} is full`);
        });
    }

    const ok = await startCapture();
    if (!ok) return false;
    socket.emit('join-room', roomId);
    addLog(`Joined room ${roomId}`);
    return true;
}

function leaveRoom(roomId) {
    if (!socket) return;
    socket.emit('leave-room', roomId);
    addLog(`Left ${roomId}`);
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    for (let id in peers) {
        peers[id].close(); delete peers[id];
        const audioEl = document.getElementById(`audio-${id}`); if (audioEl) audioEl.remove();
    }
}

export { joinRoom, leaveRoom, toggleMute };
