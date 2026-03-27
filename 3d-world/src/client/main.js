import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// Import our modules (note filenames in this project)
import { ROOMS, PLAYER_SPEED, RADAR_DISTANCE } from './constant.js';
import { updateCamera } from './camera.js';
import { handlePlayerMovement, keys, sitOnChair, standUp, exitRoom } from './movement.js';
import { setupEnvironment } from './environment.js';
import { createLoaderAndClock, loadBuilding, loadAvatar, allGameChairs } from './loader.js';
import { joinRoom, leaveRoom, toggleMute as voiceToggleMute, registerUser, loginUser, sendMovement, getSocket } from './voice.js';

// console.log('[MAIN] Script loaded and imports successful');

// --- INITIALIZE SCENE & RENDERER ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaaaaa);
scene.fog = new THREE.Fog(0xaaaaaa, 20, 150);
// Add ambient light to ensure scene is visible
// const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
// scene.add(ambientLight);
// console.log('[Scene] Ambient light added for visibility');

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.domElement.style.zIndex = '1'; // Ensure canvas is above overlays
renderer.domElement.style.display = 'block'; // Explicit visibility
document.body.appendChild(renderer.domElement);
// console.log('[Canvas] WebGL renderer created and appended to body', 'Size:', window.innerWidth, 'x', window.innerHeight);

// --- CHARACTER & CONTROLS ---
const playerGroup = new THREE.Group();
scene.add(playerGroup);

const dummyCamera = new THREE.PerspectiveCamera();
const controls = new PointerLockControls(dummyCamera, document.body);
const cameraHolder = controls.getObject();
cameraHolder.position.set(0, 6, 15);
scene.add(cameraHolder);

// UI: blocker / instructions to engage pointer lock
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
// global auth flag (defaults to false)
window.isUserAuthenticated = window.isUserAuthenticated || false;
if (instructions) instructions.addEventListener('click', () => {
    if (window.isUserAuthenticated) controls.lock();
});
controls.addEventListener('lock', () => { 
    // console.log('[PointerLock] LOCKED - movement should now work');
    if (blocker) blocker.style.display = 'none'; 
});
controls.addEventListener('unlock', () => { 
    // console.log('[PointerLock] UNLOCKED - showing blocker for re-lock');
    if (blocker) {
        blocker.style.display = 'flex';
        blocker.style.pointerEvents = 'auto';  // RE-ENABLE clicks on instructions
    }
});

// Called when authentication is complete (login or auto-login)
function authSuccess() {
    window.isUserAuthenticated = true;
    // console.log('[authSuccess] Setting isUserAuthenticated = true');
    
    // Ensure blocker/instructions are visible and functional
    try {
        // console.log('[authSuccess] called, hiding overlays');
        if (blocker) {
            blocker.style.display = 'none';
            blocker.style.pointerEvents = 'none';
        }
        if (instructions) {
            instructions.style.display = 'block';
            // console.log('[authSuccess] Instructions visible, attempting auto-lock...');
            // Auto-lock the pointer for immediate movement
            setTimeout(() => {
                // console.log('[authSuccess] Calling controls.lock()');
                try {
                    controls.lock();
                    // console.log('[authSuccess] controls.lock() succeeded');
                } catch (err) {
                    console.error('[authSuccess] controls.lock() failed:', err);
                }
            }, 100);
        }
        // Also hide/remove the login overlay if present
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
            overlay.style.transition = 'opacity 220ms ease';
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
            setTimeout(() => { try { overlay.remove(); console.log('[authSuccess] login-overlay removed'); } catch (e) { console.warn(e); } }, 260);
        }
    } catch (e) {
        console.error('[authSuccess] Error:', e);
    }
}

// --- ASSET LOADER & ANIMATION ---
const { loader, clock } = createLoaderAndClock();
let myAvatar = null;
let mixer = null;
let actionIdle = null;
let actionRun = null;
let actionSit = null;
let isMoving = false;
let isSitting = false;
let inCafe = false;
// let targetTablePos = new THREE.Vector3(); // Memory for the exact X, Y, Z
// let isTargetReady = false; // A switch so we don't teleport before it loads
let _savedCameraPos = null;
let _savedCameraQuat = null;
let currentChair = null; // currently occupied chair object from allGameChairs
let highlightedRoom = null; // room currently shown in the promptUI
let insideRoom = null; // the room the player has entered (must press 'O' to exit)
// Compute map-wide bounding box from ROOMS so player can't leave the map
// Network sync timer
let lastSendTime = 0;
const otherPlayers = {};
let socket = null; // global socket reference assigned at login
const SEND_TICK_RATE = 50; // 50 milliseconds = 20 network updates per second
let mapBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
if (Array.isArray(ROOMS) && ROOMS.length > 0) {
    for (const r of ROOMS) {
        if (typeof r.minX === 'number') mapBounds.minX = Math.min(mapBounds.minX, r.minX);
        if (typeof r.maxX === 'number') mapBounds.maxX = Math.max(mapBounds.maxX, r.maxX);
        if (typeof r.minZ === 'number') mapBounds.minZ = Math.min(mapBounds.minZ, r.minZ);
        if (typeof r.maxZ === 'number') mapBounds.maxZ = Math.max(mapBounds.maxZ, r.maxZ);
    }
    // add a small margin so the edges aren't flush
    const MARGIN = 5;
    mapBounds.minX -= MARGIN; mapBounds.maxX += MARGIN;
    mapBounds.minZ -= MARGIN; mapBounds.maxZ += MARGIN;
} else {
    // sensible defaults if ROOMS are not available
    mapBounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
}

// Build building boundaries from ROOMS (they include min/max fields)
// const buildingBoundaries = ROOMS.map(r => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ }));

// Setup lighting, floor, grid via environment module
// UI Tab Toggling Logic
let isRegistering = false;
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const formTitle = document.getElementById('form-title');
const formSubtitle = document.getElementById('form-subtitle');
const submitBtn = document.getElementById('submit-btn');

tabLogin.addEventListener('click', () => {
    isRegistering = false;
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formTitle.innerText = "Welcome Back";
    formSubtitle.innerText = "Log in to join the voice chat.";
    submitBtn.innerText = "Enter World";
});

tabRegister.addEventListener('click', () => {
    isRegistering = true;
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formTitle.innerText = "Create Account";
    formSubtitle.innerText = "Sign up to customize your avatar.";
    submitBtn.innerText = "Register";
});
// --- HTML FORM SUBMISSION (TESTING REGISTER) ---
const authForm = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMsg = document.getElementById('error-message');

// Presence panel (shows online users and chair occupancy)
let presencePanel = document.getElementById('presence-panel');
if (!presencePanel) {
    presencePanel = document.createElement('div');
    presencePanel.id = 'presence-panel';
    presencePanel.style.cssText = 'position:fixed;right:10px;top:10px;z-index:9999;background:rgba(0,0,0,0.6);color:#fff;padding:8px;border-radius:6px;font-size:13px;max-width:220px;max-height:320px;overflow:auto;';
    presencePanel.innerHTML = '<strong>Online</strong><div id="presence-users" style="margin-top:6px"></div><hr style="border:none;border-top:1px solid rgba(255,255,255,0.12);margin:6px 0"><strong>Chairs</strong><div id="presence-chairs" style="margin-top:6px"></div>';
    document.body.appendChild(presencePanel);
}

function renderPresence(data) {
    try {
        const usersEl = document.getElementById('presence-users');
        const chairsEl = document.getElementById('presence-chairs');
        usersEl.innerHTML = '';
        chairsEl.innerHTML = '';
        if (data && Array.isArray(data.users)) {
            data.users.forEach(u => {
                const el = document.createElement('div');
                el.style.marginBottom = '4px';
                el.innerText = (u.username || 'unknown') + (u.socketId ? ` (${u.socketId.substring(0,6)})` : '');
                usersEl.appendChild(el);
            });
        }
        if (data && data.chairs) {
            for (const cid in data.chairs) {
                const c = data.chairs[cid];
                const el = document.createElement('div');
                el.style.marginBottom = '4px';
                el.innerText = cid + ': ' + (c && c.occupied ? `occupied by ${c.by && c.by.username ? c.by.username : (c.by && c.by.socketId ? c.by.socketId.substring(0,6) : 'someone')}` : 'free');
                chairsEl.appendChild(el);
            }
        }
    } catch (e) { console.warn('renderPresence error', e); }
}

authForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Stops the browser from reloading the page

    const user = usernameInput.value.trim();
    const pass = passwordInput.value;

    if (!user || !pass) {
        errorMsg.innerText = "Please fill in all fields.";
        return;
    }

    // We only want to test Registration right now
    if (isRegistering) {
        submitBtn.innerText = "Registering...";
        errorMsg.innerText = ""; 

        registerUser(user, pass, (response) => {
            if (response.success) {
                // Make the text green/blue to show success
                errorMsg.style.color = "#4facfe"; 
                errorMsg.innerText = "✅ Success! Account created.";
                submitBtn.innerText = "Register";
                console.log("Registered:", response.user.username);
                
                // Automatically switch back to the Login tab
                setTimeout(() => {
                    tabLogin.click();
                    errorMsg.innerText = "";
                    errorMsg.style.color = "#ff6b6b"; // reset color
                }, 1500);

            } else {
                // Show the error from the server (e.g., "Username taken")
                errorMsg.style.color = "#ff6b6b";
                errorMsg.innerText = "❌ " + response.message;
                submitBtn.innerText = "Register";
            }
        });
    } else {
        // Attempt login using the socket login flow
        submitBtn.innerText = "Entering...";
        errorMsg.innerText = "";

        loginUser(user, pass, (res) => {
            submitBtn.innerText = "Enter World";
            if (res.success) {
                errorMsg.style.color = "#4facfe";
                errorMsg.innerText = `✅ Welcome ${res.user.username}!`;
                
                authSuccess();
                
                // --- 🚀 NEW: MULTIPLAYER SETUP ---
                socket = getSocket();

                // Immediately request presence map so we see other authenticated users
                try { socket.emit('request-presence'); } catch (e) { console.warn('request-presence failed', e); }

                // Helper Function: Add a Ghost Player to the scene
                const addOtherPlayer = (playerData) => {
                    if (otherPlayers[playerData.id] || playerData.id === socket.id) return; 

                    // 1. Create a group to hold their 3D body
                    const ghostGroup = new THREE.Group();
                    ghostGroup.position.set(playerData.x, playerData.y, playerData.z);
                    ghostGroup.rotation.y = playerData.rotY;
                    scene.add(ghostGroup);

                    // 2. Save their data to our dictionary
                    otherPlayers[playerData.id] = {
                        group: ghostGroup,
                        targetPos: new THREE.Vector3(playerData.x, playerData.y, playerData.z),
                        targetRotY: playerData.rotY,
                        action: playerData.action,
                        mixer: null,
                        animations: {}
                    };

                    // 3. Load their actual 3D model
                    // (Adjust the path if your models are stored elsewhere!)
                    const modelName = playerData.avatarModel || 'Male_Casual.glb';
                    loader.load(`./assets/model/${modelName}`, (gltf) => {
                        const model = gltf.scene;
                        // IMPORTANT: Scale the model to match the local player
                        model.scale.set(0.01, 0.01, 0.01);
                        model.rotation.y = Math.PI;
                        model.position.set(0, -6, 0);
                        ghostGroup.add(model);

                        // Setup their animations (Running / Idle)
                        if (gltf.animations && gltf.animations.length > 0) {
                            const ghostMixer = new THREE.AnimationMixer(model);
                            otherPlayers[playerData.id].mixer = ghostMixer;
                            
                            const clipIdle = gltf.animations.find(a => a.name.toLowerCase().includes('idle')) || gltf.animations[0];
                            const clipRun = gltf.animations.find(a => a.name.toLowerCase().includes('run')) || gltf.animations[1];
                            const clipSit = gltf.animations.find(a => a.name.toLowerCase().includes('sit')) || gltf.animations[2];
                            
                            if (clipIdle) otherPlayers[playerData.id].animations['idle'] = ghostMixer.clipAction(clipIdle);
                            if (clipRun) otherPlayers[playerData.id].animations['run'] = ghostMixer.clipAction(clipRun);
                            if (clipSit) otherPlayers[playerData.id].animations['sit'] = ghostMixer.clipAction(clipSit);

                            // Start them in their current action
                            if (otherPlayers[playerData.id].animations[playerData.action]) {
                                otherPlayers[playerData.id].animations[playerData.action].play();
                            }
                        }
                    });
                };

                // A. Load everyone already standing in the world
                const worldPlayers = res.user.worldState.players;
                for (let id in worldPlayers) {
                    addOtherPlayer(worldPlayers[id]);
                }

                // B. Listen for NEW people joining
                socket.on('player-joined', (playerData) => {
                    addOtherPlayer(playerData);
                    // console.log(`👋 ${playerData.username} spawned in!`);
                });

                // C. Listen for people moving
                socket.on('player-moved', (moveData) => {
                    const ghost = otherPlayers[moveData.id];
                    if (ghost) {
                        // Don't teleport! Just update their "Target" destination
                        ghost.targetPos.set(moveData.x, moveData.y, moveData.z);
                        ghost.targetRotY = moveData.rotY;
                        
                        // Handle Animation Changes (Start running vs Stop running)
                        if (ghost.action !== moveData.action) {
                            if (ghost.animations[ghost.action]) ghost.animations[ghost.action].stop();
                            ghost.action = moveData.action;
                            if (ghost.animations[ghost.action]) ghost.animations[ghost.action].play();
                        }
                    }
                });

                // D. Listen for people logging off
                socket.on('player-left', (id) => {
                    if (otherPlayers[id]) {
                        scene.remove(otherPlayers[id].group); // Remove from 3D world
                        delete otherPlayers[id]; // Delete from memory
                    }
                });

                // E. Presence updates (authenticated users + chairs)
                socket.on('presence-update', (data) => {
                    try {
                        // Update chairs occupancy locally if provided
                        if (data.chairs) {
                            for (const cid in data.chairs) {
                                const chairState = data.chairs[cid];
                                const idx = allGameChairs.findIndex(c => c.name === cid);
                                if (idx !== -1) {
                                    allGameChairs[idx].isOccupied = !!(chairState && chairState.occupied);
                                }
                            }
                        }

                        // Update presence UI
                        renderPresence(data);
                    } catch (e) { console.warn('presence-update error', e); }
                });

            } else {
                errorMsg.style.color = "#ff6b6b";
                errorMsg.innerText = "❌ " + (res.message || 'Login failed');
            }
        });
    }
});
setupEnvironment(scene);

// loadBuilding is provided by ./loader.js

// Load environment and avatar
// loader.load('../../public/assets/models/scene.glb', (gltf) => scene.add(gltf.scene));

loadBuilding(loader, scene, 'scene_compressed.glb', -40, 0, 3);

// scanScene(loader, 'scene (2).glb', (loadedWorld) => {
//     console.log("The world is ready!");
// //     loadedWorld.scale.set(100, 100, 100); 
//     loadedWorld.updateMatrixWorld(true);
//     // 2. Scan EVERY object in the entire city
//     loadedWorld.traverse((node) => {
        
//         // Inside your traverse loop
//         // Inside your scanScene traverse loop...
//         // if (node.name.includes("Chair")) {
//         //         node.updateMatrixWorld(true); 

//         //         const boundingBox = new THREE.Box3().setFromObject(node);
//         //         const trueCenter = new THREE.Vector3();
//         //         boundingBox.getCenter(trueCenter);

//         //         // --- THE MAGIC FIX ---
//         //         // We save the position but DIVIDE by 100.
//         //         // This scales the 'Target' back down to match your Avatar's 1x GPS.
//         //         allGameChairs.push({
//         //                 name: node.name,
//         //                 x: trueCenter.x, 
//         //                 z: trueCenter.z,
//         //                 isOccupied: false
//         //         });
//         // }
//     });

//     console.log(`✅ Auto-Scan Complete! Found ${allGameChairs.length} chairs.`);
//     scene.add(loadedWorld);
// });
loadAvatar(loader, playerGroup, ({ avatarModel, mixer: m, actionIdle: aIdle, actionRun: aRun, actionSit: aSit }) => {
    myAvatar = avatarModel;
    mixer = m;
    actionIdle = aIdle;
    actionRun = aRun;
    actionSit = aSit;
    if (actionIdle) actionIdle.play();
});

const promptUI = document.getElementById('interactionPrompt');
const enterCafeBtn = document.getElementById('enterCafeBtn');

// moved sit/stand/exit helpers into ./movement.js; import and use those functions

// if (enterCafeBtn) {
//     enterCafeBtn.addEventListener('click', () => {
//         inCafe = true;
//         sitOnChair(-35.23, 15.76, Math.PI / 2); // Example coordinates for a chair in the cafe
//         enterCafeBtn.style.display = 'none';
//         controls.lock();
//     });
// }

// Optional debug boxes
// Change this function in your main file
function drawDebugBoxes() {
    // We now use ROOMS which contains the scanned data from Cafe1, Cafe2, etc.
    ROOMS.forEach(room => {
        const width = room.maxX - room.minX;
        const depth = room.maxZ - room.minZ;
        const height = 10; // Height of the red "ghost" wall
        
        // Calculate the center point based on the min/max scanned values
        const centerX = room.minX + (width / 2);
        const centerZ = room.minZ + (depth / 2);
        
        const geo = new THREE.BoxGeometry(width, height, depth);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const debugMesh = new THREE.Mesh(geo, mat);
        
        // Position the box so the bottom sits on the floor (height/2)
        debugMesh.position.set(centerX, height / 2, centerZ);
        
        scene.add(debugMesh);
    });

    // Draw full-map bounds (from mapBounds)
    try {
        const mb = mapBounds;
        const corners = [
            new THREE.Vector3(mb.minX, 0.1, mb.minZ),
            new THREE.Vector3(mb.maxX, 0.1, mb.minZ),
            new THREE.Vector3(mb.maxX, 0.1, mb.maxZ),
            new THREE.Vector3(mb.minX, 0.1, mb.maxZ),
        ];
        const geom = new THREE.BufferGeometry().setFromPoints(corners.concat([corners[0]]));
        const mat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
        const line = new THREE.Line(geom, mat);
        console.log(`🗺️ Map Bounds: minX:${mb.minX}, maxX:${mb.maxX}, minZ:${mb.minZ}, maxZ:${mb.maxZ}`);
        scene.add(line);
    } catch (e) {
        // ignore if mapBounds not ready
    }
}

// Uncomment to visualize collision boxes
drawDebugBoxes();

// --- GAME LOOP ---
let animationFrameCount = 0;
function animate() {
    try {
        animationFrameCount++;
        // if (animationFrameCount === 1) {
        //     console.log('[Animation] FIRST FRAME - Loop is running!');
        //     console.log('[Animation] Renderer:', renderer ? 'exists' : 'MISSING');
        //     console.log('[Animation] Scene objects:', scene.children.length);
        // }
        // if (animationFrameCount <= 3) {
        //     console.log('[Animation] Frame', animationFrameCount);
        // }
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    // --- MULTIPLAYER: Update Ghost Positions smoothly ---
    for (let id in otherPlayers) {
        const ghost = otherPlayers[id];
        
        // 1. Smoothly slide the 3D model toward the target position (LERP)
        ghost.group.position.lerp(ghost.targetPos, 0.2); // 0.2 is the glide speed
        
        // 2. Smoothly rotate the body to face the right direction
        const diff = ghost.targetRotY - ghost.group.rotation.y;
        const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
        ghost.group.rotation.y += normalizedDiff * 0.2;

        // 3. Play their run/idle animation
        if (ghost.mixer) ghost.mixer.update(delta);
    }

    if (controls.isLocked) {
        const { prevX, prevZ } = handlePlayerMovement(controls, playerGroup, cameraHolder, PLAYER_SPEED, isSitting);
        // if (animationFrameCount <= 5) console.log('[Animate] Frame', animationFrameCount, 'isLocked=true, movement processed');
        let hitWall = false; // moved to top-level of locked-controls scope to avoid scope errors

        if (!isSitting) {
            // Support arrow keys for movement alongside WASD
            if (keys['arrowup']) controls.moveForward(PLAYER_SPEED);
            if (keys['arrowdown']) controls.moveForward(-PLAYER_SPEED);
            if (keys['arrowleft']) controls.moveRight(-PLAYER_SPEED);
            if (keys['arrowright']) controls.moveRight(PLAYER_SPEED);

            // Animation transitions
            const isPressingMove = keys['w'] || keys['a'] || keys['s'] || keys['d'] ||
                                   keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'];

            if (isPressingMove && !isMoving) {
                isMoving = true;
                if (actionIdle) actionIdle.stop();
                if (actionRun) actionRun.play();
            } else if (!isPressingMove && isMoving) {
                isMoving = false;
                if (actionRun) actionRun.stop();
                if (actionIdle) actionIdle.play();
            }

            // Global map bounds check: disallow leaving the entire map
            if (cameraHolder.position.x < mapBounds.minX || cameraHolder.position.x > mapBounds.maxX ||
                cameraHolder.position.z < mapBounds.minZ || cameraHolder.position.z > mapBounds.maxZ) {
                hitWall = true;
            }
        } else {
            // If sitting, ensure running is stopped and sit animation plays
            if (isMoving) {
                isMoving = false;
                if (actionRun) actionRun.stop();
            }
            if (actionIdle) actionIdle.stop();
        }

        // --- PHYSICAL COLLISIONS (Solid Walls) ---
        // Only check collisions if we aren't sitting
        if (!isSitting) {

            if (!insideRoom) {
                // Prevent entering rooms by walking — if the camera is inside any room box, treat as a wall hit
                for (let room of ROOMS) {
                    if (cameraHolder.position.x > room.minX - 0.5 && cameraHolder.position.x < room.maxX + 0.5 &&
                        cameraHolder.position.z > room.minZ - 0.5 && cameraHolder.position.z < room.maxZ + 0.5) {
                        hitWall = true;
                        break;
                    }
                }
            } else {
                // Player is inside a room: prevent leaving its bounds
                const room = insideRoom;
                if (!(cameraHolder.position.x > room.minX - 0.5 && cameraHolder.position.x < room.maxX + 0.5 &&
                      cameraHolder.position.z > room.minZ - 0.5 && cameraHolder.position.z < room.maxZ + 0.5)) {
                    hitWall = true;
                }
            }

            // If we hit a wall, instantly teleport the player back to where they were 1 frame ago
            if (hitWall) {
                cameraHolder.position.x = prevX;
                cameraHolder.position.z = prevZ;
            }
        }

        // Proximity radar to show prompt
        if (myAvatar) {
            // If the player is inside a room or sitting, show exit prompt
            if (insideRoom || inCafe || isSitting) {
                if (promptUI) {
                    const main = promptUI.querySelector('.prompt-main');
                    const muteHint = document.getElementById('muteHint');
                    if (main) main.innerText = `Press O to get out of`;
                    if (muteHint) muteHint.style.display = 'block';
                    promptUI.style.display = 'block';
                }
                highlightedRoom = null;
            } else {
                const avatarWorldPos = new THREE.Vector3();
                myAvatar.getWorldPosition(avatarWorldPos);
                let foundRoom = null;

                for (let room of ROOMS) {
                    // Instead of looking for a single door, we expand the building's walls
                    // by your RADAR_DISTANCE. If the avatar steps into this "halo", it triggers!
                    if (avatarWorldPos.x > room.minX - RADAR_DISTANCE && 
                        avatarWorldPos.x < room.maxX + RADAR_DISTANCE &&
                        avatarWorldPos.z > room.minZ - RADAR_DISTANCE && 
                        avatarWorldPos.z < room.maxZ + RADAR_DISTANCE) {
                        foundRoom = room; 
                    break; 
                    }
                }

                if (foundRoom) {
                    // remember the room we highlighted so the key handler can act on it
                    highlightedRoom = foundRoom;
                    if (promptUI) {
                        const main = promptUI.querySelector('.prompt-main');
                        const muteHint = document.getElementById('muteHint');
                        if (main) main.innerText = `Press E to enter ${foundRoom.name} (${foundRoom.currentOccupied}/${foundRoom.maxChairs})`;
                        if (muteHint) muteHint.style.display = 'none';
                        promptUI.style.display = 'block';
                    }
                } else {
                    promptUI.style.display = 'none';
                    const muteHint = document.getElementById('muteHint');
                    if (muteHint) muteHint.style.display = 'none';
                    highlightedRoom = null;
                }
            }
        }
    }
    // --- MULTIPLAYER: BROADCAST MOVEMENT ---
    // Only broadcast if the user is actually logged in
    if (window.isUserAuthenticated && controls.isLocked) {
        const now = Date.now();
        
        // Only send data every 50ms (the Tick Rate)
        if (now - lastSendTime > SEND_TICK_RATE) {
            
            // Figure out what animation the player is currently doing
            let currentAction = 'idle';
            if (isMoving) currentAction = 'run';
            if (isSitting) currentAction = 'sit';

            // Send the exact GPS coordinates and rotation to the server
            sendMovement({
                x: cameraHolder.position.x,
                y: cameraHolder.position.y,
                z: cameraHolder.position.z,
                rotY: cameraHolder.rotation.y, // So other players see which way you are looking
                action: currentAction
            });
            
            lastSendTime = now; // Reset the timer
        }
    }
    // Camera follow logic
    updateCamera(camera, cameraHolder);
    renderer.render(scene, camera);
    
    // Diagnostic logs for first few frames
    // if (animationFrameCount === 1) {
    //     console.log('[Animation] First frame rendered, scene should be visible');
    //     console.log('[Diagnostic] isUserAuthenticated:', window.isUserAuthenticated);
    //     console.log('[Diagnostic] controls.isLocked:', controls.isLocked);
    //     console.log('[Diagnostic] blocker style.display:', blocker ? blocker.style.display : 'N/A');
    // }
    // if (animationFrameCount === 60) {
    //     console.log('[Diagnostic Frame 60] isUserAuthenticated:', window.isUserAuthenticated, 'isLocked:', controls.isLocked, 'cameraPos:', cameraHolder.position);
    // }
    } catch (e) {
        console.error('Error in animation loop:', e);
    }
    
}
window.addEventListener('keydown', (event) => {
    // normalize key safely
    const key = event && event.key ? event.key.toLowerCase() : null;
    // 1. Did the browser even hear the key?
    if (key === 'e') {
        
        if (controls.isLocked) {
            if (!isSitting && !inCafe && myAvatar) {
                
                const avatarPos = new THREE.Vector3();
                myAvatar.getWorldPosition(avatarPos);

                // If we highlighted a room in the HUD, use that to enter
                if (highlightedRoom) {
                    const roomToEnter = highlightedRoom;

                    // If the room has chairs, try to sit in the nearest free chair inside its bounds
                    if (roomToEnter.maxChairs && roomToEnter.maxChairs > 0) {
                        let closestChair = null;
                        let closestDistance = Infinity;
                        for (let chair of allGameChairs) {
                            if (!chair.isOccupied && chair.x > roomToEnter.minX && chair.x < roomToEnter.maxX && chair.z > roomToEnter.minZ && chair.z < roomToEnter.maxZ) {
                                const distance = Math.hypot(avatarPos.x - chair.x, avatarPos.z - chair.z);
                                if (distance < closestDistance) { closestDistance = distance; closestChair = chair; }
                            }
                        }

                        if (closestChair && closestDistance < 10) {
                            console.log(`✅ SUCCESS! Sitting in ${closestChair.name}!`);
                            inCafe = true;
                            closestChair.isOccupied = true;
                            currentChair = closestChair;
                            insideRoom = roomToEnter;
                            // join voice room when entering
                            try { joinRoom(roomToEnter.name); } catch (e) { console.warn(e); }
                            const _saved = sitOnChair(cameraHolder, playerGroup, { actionIdle, actionRun, actionSit }, closestChair.name, closestChair.x, closestChair.z, (closestChair.rotation && closestChair.rotation.y) || 0, (closestChair.rotation && closestChair.rotation.x) || 0, (closestChair.rotation && closestChair.rotation.z) || 0);
                            if (_saved) {
                                _savedCameraPos = _saved._savedCameraPos;
                                _savedCameraQuat = _saved._savedCameraQuat;
                                isSitting = _saved.isSitting;
                            }
                            // Notify server that we occupied this chair
                            try { socket.emit('occupy-chair', { chairId: closestChair.name, occupy: true }); } catch (e) { console.warn('emit occupy-chair failed', e); }
                            if (promptUI) promptUI.style.display = 'none';
                            return;
                        }
                    }
                    else {
                        let centerX = (roomToEnter.minX + roomToEnter.maxX) / 2;
                        let centerZ = (roomToEnter.minZ + roomToEnter.maxZ) / 2;
                        // clamp center to map bounds
                        centerX = Math.max(mapBounds.minX + 1, Math.min(mapBounds.maxX - 1, centerX));
                        centerZ = Math.max(mapBounds.minZ + 1, Math.min(mapBounds.maxZ - 1, centerZ));
                        console.log(`🚪 Entering ${roomToEnter.name} at center.`);
                        _savedCameraPos = cameraHolder.position.clone();
                        _savedCameraQuat = cameraHolder.quaternion.clone();
                        cameraHolder.position.set(centerX, 6, centerZ);
                        insideRoom = roomToEnter;
                        // join voice room when entering
                        try { joinRoom(roomToEnter.name); } catch (e) { console.warn(e); }
                        if (promptUI) promptUI.style.display = 'none';
                    }

                    // No available chair (or room has no chairs): teleport to room center and mark inside
                   
                    return;
                }

                console.log("❌ FAILED: No highlighted room to enter.");

            } else {
                console.warn("⛔ BLOCKED: You are either already sitting, in the cafe, or the Avatar hasn't loaded yet!");
            }
        } else {
            console.warn("⛔ BLOCKED: You must click the screen to lock your mouse before pressing E!");
        }
    }
});
window.addEventListener('keydown', (event) => {
    // Press 'P' to print your exact current location
    const key = event && event.key ? event.key.toLowerCase() : null;
    if (key === 'p') {
        console.log(`📍 MY GPS LOCATION: X: ${cameraHolder.position.x.toFixed(2)}, Z: ${cameraHolder.position.z.toFixed(2)}`);
    }
});

// Press 'M' to toggle microphone via voice client
window.addEventListener('keydown', (event) => {
    const key = event && event.key ? event.key.toLowerCase() : null;
    if (key === 'm') {
        try { voiceToggleMute(); } catch (e) { console.warn(e); }
    }
});

// Press 'O' to stand up / resume running when sitting
window.addEventListener('keydown', (event) => {
    const key = event && event.key ? event.key.toLowerCase() : null;
    if (key === 'o') {
        // If sitting, stand up (this will also free the chair)
        if (isSitting) {
            console.log('🔓 Standing up and resuming movement');
            const prevChair = currentChair;
            const _res = standUp(cameraHolder, playerGroup, { actionIdle, actionRun, actionSit }, currentChair, allGameChairs, _savedCameraPos, _savedCameraQuat);
            isSitting = _res.isSitting;
            inCafe = _res.inCafe;
            currentChair = _res.currentChair;
            _savedCameraPos = _res._savedCameraPos;
            _savedCameraQuat = _res._savedCameraQuat;

            // Notify server that we freed this chair
            try {
                if (prevChair && prevChair.name) {
                    // update local chairs array if present
                    const idx = allGameChairs.findIndex(c => c.name === prevChair.name);
                    if (idx !== -1) allGameChairs[idx].isOccupied = false;
                    if (socket && socket.emit) socket.emit('occupy-chair', { chairId: prevChair.name, occupy: false });
                }
            } catch (e) { console.warn('emit occupy-chair (free) failed', e); }

            // after standing, also exit the room if desired
            if (insideRoom) {
                const prevName = insideRoom.name;
                const _r = exitRoom(insideRoom);
                insideRoom = _r.insideRoom;
                highlightedRoom = _r.highlightedRoom;
                inCafe = _r.inCafe;
                try { if (prevName) leaveRoom(prevName); } catch (e) { console.warn(e); }
            }
            return;
        }

        // Not sitting: if we're inside a room (plaza/park), pressing O exits it
        if (insideRoom) {
            if (_savedCameraPos && _savedCameraQuat) {
                cameraHolder.position.copy(_savedCameraPos);
                cameraHolder.quaternion.copy(_savedCameraQuat);
                playerGroup.position.copy(cameraHolder.position);
                playerGroup.rotation.y = cameraHolder.rotation.y;
            }
            _savedCameraPos = null;
            _savedCameraQuat = null;
            const prevName = insideRoom.name;
            const _r2 = exitRoom(insideRoom);
            insideRoom = _r2.insideRoom;
            highlightedRoom = _r2.highlightedRoom;
            inCafe = _r2.inCafe;
            try { if (prevName) leaveRoom(prevName); } catch (e) { console.warn(e); }
            return;
        }

        console.warn('⛔ You are not sitting and not inside a room.');
    }
});
// console.log('[MAIN] Script reached end, about to call animate()');
// console.log('[MAIN] Current values - renderer:', typeof renderer, 'camera:', typeof camera, 'scene:', typeof scene);
try {
    animate();
    // console.log('[MAIN] animate() call succeeded');
} catch (e) {
    console.error('[MAIN] Error calling animate():', e);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});