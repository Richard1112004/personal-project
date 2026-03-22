import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// Import our modules (note filenames in this project)
import { ROOMS, PLAYER_SPEED, RADAR_DISTANCE } from './constant.js';
import { updateCamera } from './camera.js';
import { handlePlayerMovement, keys } from './movement.js';
import { setupEnvironment } from './environment.js';
import { createLoaderAndClock, loadBuilding, loadAvatar, allGameChairs } from './loader.js';

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
let targetTablePos = new THREE.Vector3(); // Memory for the exact X, Y, Z
let isTargetReady = false; // A switch so we don't teleport before it loads
let _savedCameraPos = null;
let _savedCameraQuat = null;
let currentChair = null; // currently occupied chair object from allGameChairs

// Build building boundaries from ROOMS (they include min/max fields)
// const buildingBoundaries = ROOMS.map(r => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ }));

// Setup lighting, floor, grid via environment module
setupEnvironment(scene);

// loadBuilding is provided by ./loader.js

// Load environment and avatar
// loader.load('../../public/assets/models/scene.glb', (gltf) => scene.add(gltf.scene));

loadBuilding(loader, scene, 'scene (1).glb', -40, 0, 3);

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

function sitOnChair(name, targetX, targetZ, targetRotationY, targetRotationX, targetRotationZ) {
    // Save current camera pose so we can restore when standing up
    _savedCameraPos = cameraHolder.position.clone();
    _savedCameraQuat = cameraHolder.quaternion.clone();

    isSitting = true;
    console.log(`🪑 Sitting on ${name} at X:${targetX.toFixed(2)}, Z:${targetZ.toFixed(2)},RotX:${targetRotationX.toFixed(2)}, RotY:${targetRotationY.toFixed(2)}, RotZ:${targetRotationZ.toFixed(2)}`);
    
    // Convert to a string once to make the if-statements cleaner
    const rotYStr = targetRotationY.toFixed(2);
    const rotXStr = targetRotationX.toFixed(2);
    const rotZStr = targetRotationZ.toFixed(2);
    

    if (rotYStr === "-1.57") {
        // Facing East
        cameraHolder.position.set(targetX, 6.5, targetZ + 1);
        cameraHolder.rotation.y = targetRotationY - Math.PI/2;
    } 
    else if (rotYStr === "1.57") {
        // Facing West
        cameraHolder.position.set(targetX, 6.5, targetZ - 1);
        cameraHolder.rotation.y = targetRotationY - Math.PI/2;
    } 
    else if (rotYStr === "0.00" && rotYStr !== "-0.00") {
        if (rotXStr === "0.00" && rotZStr === "0.00") {
            // Facing North, perfectly aligned
            cameraHolder.position.set(targetX + 1, 6.5, targetZ); 
            cameraHolder.rotation.y = targetRotationY - Math.PI/2; 
        } else if (rotXStr === "3.14" || rotZStr === "-3.14") {
            // Facing North but with some weird tilt (like the cafe chairs)
            cameraHolder.position.set(targetX - 1, 6.5, targetZ); 
            cameraHolder.rotation.y = targetRotationY + Math.PI/2; 
        }
    }
    else {
        // console.log(`⚠️ Unhandled chair rotation for ${name} at X:${targetX.toFixed(2)}, Z:${targetZ.toFixed(2)}, RotY:${rotStr}. Defaulting to facing North logic.`);
        if (rotXStr === "0.00" && rotXStr === "0.00") {
                cameraHolder.position.set(targetX - 1, 6.5, targetZ);
                cameraHolder.rotation.y = targetRotationY + Math.PI/2;
            } else if (rotXStr === "-3.14" || rotZStr === "-3.14") {
                cameraHolder.position.set(targetX + 1, 6.5, targetZ);
                cameraHolder.rotation.y = targetRotationY - Math.PI/2;
            } else {
                console.warn(`⚠️ Unhandled chair rotation for ${name} at X:${targetX.toFixed(2)}, Z:${targetZ.toFixed(2)}. Defaulting to facing North logic.`);
        }
    }
    playerGroup.rotation.y = cameraHolder.rotation.y;
    // Your excellent animation logic
    if (actionIdle) actionIdle.stop();
    if (actionRun) actionRun.stop();
    if (actionSit) {
        actionSit.reset();
        actionSit.setLoop(THREE.LoopOnce, 1);
        actionSit.clampWhenFinished = true;
        actionSit.play();
    }
}

// Stand up / resume running: restore camera and animations
function standUp() {
    if (!isSitting) return;
    isSitting = false;
    inCafe = false;

    // Free the chair we occupied (if any)
    if (currentChair) {
        currentChair.isOccupied = false;
        currentChair = null;
    }

    // Restore saved camera pose if available
    if (_savedCameraPos && _savedCameraQuat) {
        cameraHolder.position.copy(_savedCameraPos);
        cameraHolder.quaternion.copy(_savedCameraQuat);
        playerGroup.position.copy(cameraHolder.position);
        playerGroup.rotation.y = cameraHolder.rotation.y;
    }

    // Stop sitting animation
    if (actionSit) actionSit.stop();

    // Choose idle or run based on movement keys
    const moving = keys['w'] || keys['a'] || keys['s'] || keys['d'] || keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'];
    if (moving) {
        if (actionRun) actionRun.play();
    } else {
        if (actionIdle) actionIdle.play();
    }

    // Clear saved pose
    _savedCameraPos = null;
    _savedCameraQuat = null;
}

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
            let hitWall = false;
            
            // Loop through every room to see if we stepped inside its box
            for (let room of ROOMS) {
                // We add a tiny 0.5 buffer so the camera doesn't clip inside the wall
                if (cameraHolder.position.x > room.minX - 0.5 && cameraHolder.position.x < room.maxX + 0.5 &&
                    cameraHolder.position.z > room.minZ - 0.5 && cameraHolder.position.z < room.maxZ + 0.5) {
                    
                    hitWall = true; 
                    break; // Stop checking, we already hit something
                }
            }

            // If we hit a wall, instantly teleport the player back to where they were 1 frame ago
            if (hitWall) {
                cameraHolder.position.x = prevX;
                cameraHolder.position.z = prevZ;
            }
        }

        // Proximity radar to show prompt
        if (!inCafe && !isSitting && myAvatar) {
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
                // If it's a park or plaza, you might not want to show chair counts, 
                // but this keeps your original formatting!
                promptUI.innerText = `Press E to enter ${foundRoom.name} (${foundRoom.currentOccupied}/${foundRoom.maxChairs})`;
                promptUI.style.display = 'block';
            } else {
                promptUI.style.display = 'none';
            }
        } else {
            if (promptUI) promptUI.style.display = 'none';
        }
    }

    // Camera follow logic
    updateCamera(camera, cameraHolder);
    renderer.render(scene, camera);
}
window.addEventListener('keydown', (event) => {
    // 1. Did the browser even hear the key?
    if (event.key.toLowerCase() === 'e') {
        // console.log("👉 'E' key detected! Checking the gatekeepers...");
        
        // // 2. Print the exact status of all 4 locks
        // console.log(`🔒 Pointer Locked (Can move)? : ${controls.isLocked}`);
        // console.log(`🪑 Already Sitting?          : ${isSitting}`);
        // console.log(`☕ In Cafe Mode?            : ${inCafe}`);
        // console.log(`🧍 Avatar Loaded?           : ${!!myAvatar}`);

        // 3. The original logic
        if (controls.isLocked) {
            if (!isSitting && !inCafe && myAvatar) {
                
                const avatarPos = new THREE.Vector3();
                myAvatar.getWorldPosition(avatarPos);
                
                let closestChair = null;
                let closestDistance = Infinity;
                // console.log(`📡 Scanning for chairs within ${RADAR_DISTANCE} units...`);
                for (let chair of allGameChairs) {
                // console.log(`Checking ${chair.name} at X:${chair.x.toFixed(2)}, Z:${chair.z.toFixed(2)} (Occupied: ${chair.isOccupied})`);      
                    if (!chair.isOccupied) {
                        // console.log(`Checking ${chair.name} at X:${chair.x.toFixed(2)}, Z:${chair.z.toFixed(2)}`);
                        const distance = Math.sqrt(
                            Math.pow(avatarPos.x - chair.x, 2) + 
                            Math.pow(avatarPos.z - chair.z, 2)
                        );

                        if (distance < closestDistance) {
                            closestDistance = distance;
                            closestChair = chair;
                        }
                    }
                }

                // console.log(`🤖 DEBUG RADAR:`);
                // console.log(`My GPS: X=${avatarPos.x.toFixed(2)}, Z=${avatarPos.z.toFixed(2)}`);
                // if (closestChair) {
                //     console.log(`Target: ${closestChair.name} at X=${closestChair.x.toFixed(2)}, Z=${closestChair.z.toFixed(2)}`);
                //     console.log(`Math Distance: ${closestDistance.toFixed(2)} units away.`);
                // }

                if (closestChair && closestDistance < 10) {
                    console.log(`✅ SUCCESS! Sitting in ${closestChair.name}!`);
                    inCafe = true;
                    closestChair.isOccupied = true;
                    // remember which chair we occupied so we can free it when standing
                    currentChair = closestChair;
                    // console.log("clossestChair.rotation x:", closestChair.rotation.x.toFixed(2), "y:", closestChair.rotation.y.toFixed(2), "z:", closestChair.rotation.z.toFixed(2));
                    sitOnChair(closestChair.name, closestChair.x, closestChair.z, closestChair.rotation.y, closestChair.rotation.x, closestChair.rotation.z); 
                    if (promptUI) promptUI.style.display = 'none';
                } else {
                    console.log("❌ FAILED: Still too far away.");
                }
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

// Press 'O' to stand up / resume running when sitting
window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'o') {
        if (!isSitting) {
            console.warn('⛔ You are not sitting.');
            return;
        }
        console.log('🔓 Standing up and resuming movement');
        standUp();
    }
});
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});