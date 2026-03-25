import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// Import our modules (note filenames in this project)
import { ROOMS, PLAYER_SPEED, RADAR_DISTANCE } from './constant.js';
import { updateCamera } from './camera.js';
import { handlePlayerMovement, keys, sitOnChair, standUp, exitRoom } from './movement.js';
import { setupEnvironment } from './environment.js';
import { createLoaderAndClock, loadBuilding, loadAvatar, allGameChairs } from './loader.js';
import { joinRoom, leaveRoom, toggleMute as voiceToggleMute, registerUser } from './voice.js';

// --- INITIALIZE SCENE & RENDERER ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaaaaa);
scene.fog = new THREE.Fog(0xaaaaaa, 20, 150);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

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
if (instructions) instructions.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => { if (blocker) blocker.style.display = 'none'; });
controls.addEventListener('unlock', () => { if (blocker) blocker.style.display = 'flex'; });

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
        errorMsg.innerText = "⚠️ Please click the 'Register' tab to test creating an account first!";
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
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    if (controls.isLocked) {
        const { prevX, prevZ } = handlePlayerMovement(controls, playerGroup, cameraHolder, PLAYER_SPEED, isSitting);
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
            // if (actionSit) {
            //     if (!actionSit.isRunning()) {
            //         actionSit.reset();
            //         actionSit.setLoop(THREE.LoopOnce);
            //         actionSit.clampWhenFinished = true;
            //         actionSit.play();
            //     }
            // }
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

    // Camera follow logic
    updateCamera(camera, cameraHolder);
    renderer.render(scene, camera);
}
window.addEventListener('keydown', (event) => {
    // 1. Did the browser even hear the key?
    if (event.key.toLowerCase() === 'e') {
        
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
    if (event.key.toLowerCase() === 'p') {
        console.log(`📍 MY GPS LOCATION: X: ${cameraHolder.position.x.toFixed(2)}, Z: ${cameraHolder.position.z.toFixed(2)}`);
    }
});

// Press 'M' to toggle microphone via voice client
window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'm') {
        try { voiceToggleMute(); } catch (e) { console.warn(e); }
    }
});

// Press 'O' to stand up / resume running when sitting
window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'o') {
        // If sitting, stand up (this will also free the chair)
        if (isSitting) {
            console.log('🔓 Standing up and resuming movement');
            const _res = standUp(cameraHolder, playerGroup, { actionIdle, actionRun, actionSit }, currentChair, allGameChairs, _savedCameraPos, _savedCameraQuat);
            isSitting = _res.isSitting;
            inCafe = _res.inCafe;
            currentChair = _res.currentChair;
            _savedCameraPos = _res._savedCameraPos;
            _savedCameraQuat = _res._savedCameraQuat;
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
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});