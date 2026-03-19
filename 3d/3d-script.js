// 3D scene script extracted from 3d-html.html  
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // NEW!

// 1. SETUP THE WORLD (DAYTIME!)
const scene = new THREE.Scene();

// Set the sky to a bright, clear blue
scene.background = new THREE.Color(0xaaaaaa); 

// Push the fog way back so it doesn't hide your buildings
scene.fog = new THREE.Fog(0xaaaaaa, 20, 150);

// --- NEW ANIMATION VARIABLES ---
const clock = new THREE.Clock(); 
let mixer; 
let actionIdle; // Memory for the Idle animation
let actionRun;  // Memory for the Run animation
let actionSit;  // Memory for the Sit animation (if you add it later)
let isMoving = false; // A simple ON/OFF switch for his legs
let isSitting = false; // A simple ON/OFF switch for sitting
let myAvatar = null; // --- NEW: We need a global variable to track the body ---
// --- BOUNDARY BOXES (AABB COLLISION) ---
// We define a square for each building. 
// For example, if Cafe1 is at (0,0) and is 20 units wide, it goes from -10 to 10.
const buildingBoundaries = [
    // 1. Main Cafe (Center)
    { minX: -12, maxX: 12, minZ: -12, maxZ: 12 },
    
    // 2. Cafe 2 (Left)
    { minX: -52, maxX: -28, minZ: -12, maxZ: 12 },
    
    // 3. Restaurant 1 (Right)
    { minX: 20, maxX: 47, minZ: -12, maxZ: 38 },
    
    // 4. Restaurant 2 (Forward)
    { minX: -12, maxX: 15, minZ: -65, maxZ: -28 }
];

// --- SMART ROOM DATA ---
// We define where the center of the room is (doorX, doorZ) to trigger the radar.
const rooms = [
    { name: "Main Cafe",    doorX: 0,   doorZ: 0,   maxChairs: 3, currentOccupied: 0 },
    { name: "Cafe 2",       doorX: -40, doorZ: 0,   maxChairs: 2, currentOccupied: 0 },
    { name: "Restaurant 1", doorX: 40,  doorZ: 0,   maxChairs: 2, currentOccupied: 0 },
    { name: "Restaurant 2", doorX: 0,   doorZ: -40, maxChairs: 2, currentOccupied: 0 }
];

let nearbyRoom = null; // Memory to remember which room we are standing next to
const promptUI = document.getElementById('interactionPrompt'); // Connect to HTML

// 2. SETUP THE CAMERA (The Real Visual Lens)
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);

// 3. SETUP THE RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// 4. THE NEW CONTROLS (The Invisible Brain!)
// We give the controls a fake camera. This acts as the anchor point.
const dummyCamera = new THREE.PerspectiveCamera();
const controls = new PointerLockControls(dummyCamera, document.body);

const cameraHolder = controls.getObject();
cameraHolder.position.set(0, 6, 15);
scene.add(cameraHolder);
window.cameraHolder = cameraHolder;

// Menu Logic
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
instructions.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => blocker.style.display = 'none');
controls.addEventListener('unlock', () => blocker.style.display = 'flex');
// --- NEW: LOBBY & TELEPORT LOGIC ---
let inCafe = false; 

function sitOnChair(targetX, targetZ) {
    isSitting = true;

    // 1. TELEPORT: Move the camera rig to the chair
    // We use your tested X and Z, and keep Y at 5
    cameraHolder.position.set(targetX, 2, targetZ);

    if (actionIdle) actionIdle.stop();
    if (actionRun) actionRun.stop();
    if (actionSit) {
        actionSit.reset();
        actionSit.setLoop(THREE.LoopOnce); // Optional: if you want it to play once
        actionSit.clampWhenFinished = true;
        actionSit.play();
    }
}
// 2. The Button Click Event
const enterCafeBtn = document.getElementById('enterCafeBtn');

enterCafeBtn.addEventListener('click', () => {
    inCafe = true; // Tell the game you are inside now

    // Teleport to the center of the Cafe!
    // cameraHolder.position.set(-35.23, 2, 15.76);
    sitOnChair(-35.23, 15.76); // Face the opposite direction (180 degrees)
    // Hide the button so it doesn't block the screen
    enterCafeBtn.style.display = 'none'; 
    
    // Automatically lock the mouse so you can start walking immediately
    controls.lock(); 
});


/// 5. LIGHTING & ENVIRONMENT (THE SUN)

// 1. Hemisphere Light: Simulates the outdoor sky bouncing light everywhere
// Parameters: (Sky Color, Ground Color, Intensity)
const hemiLight = new THREE.HemisphereLight(0x71A6D2, 0x77B5FE, 0.6);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

// 2. The Sun (Directional Light): Casts hard shadows
const sunLight = new THREE.DirectionalLight(0x3172AE, 1.2);

// Position the sun high up in the sky and slightly tilted
sunLight.position.set(50, 100, 30); 

// Turn on shadows for the sun
sunLight.castShadow = true;

// Make the sun's shadow map huge so it covers all your new buildings!
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
sunLight.shadow.mapSize.width = 2048; 
sunLight.shadow.mapSize.height = 2048;

scene.add(sunLight);
// --- THE CITY PLAZA FLOOR ---
// A large circle (radius 100) makes the city feel like a specific zone
const floorGeo = new THREE.CircleGeometry(100, 64); 
const floorMat = new THREE.MeshStandardMaterial({ 
    color: 0x222222, // Dark charcoal gray
    roughness: 0.8, 
    metalness: 0.2 
});
const floor = new THREE.Mesh(floorGeo, floorMat);

floor.position.y = -0.05; // Keep it at ground level
floor.rotation.x = -Math.PI / 2; // Lay it flat
floor.receiveShadow = true; // Essential for the "Sun" we made!
scene.add(floor);

// Optional: Add a subtle grid just so you can feel the speed when you run
const grid = new THREE.GridHelper(200, 40, 0x444444, 0x333333);
grid.position.y = 0.05;
scene.add(grid);


// ==========================================
// 6. LOAD THE 3D MODELS (ENVIRONMENT & AVATAR)
// ==========================================

const loader = new GLTFLoader();

// --- THE CITY BUILDER FUNCTION ---
// This cookie-cutter lets you spawn any building by just giving it a name and coordinates
function loadBuilding(filename, x, z, scaleFactor) {
    loader.load(filename, function (gltf) {
        const building = gltf.scene;
        
        // Place the building at the specific X (left/right) and Z (forward/backward)
        building.position.set(x, 0, z); 
        building.scale.set(scaleFactor, scaleFactor, scaleFactor); 

        building.traverse((node) => {
            if (node.isMesh) {
                node.receiveShadow = true;
                node.castShadow = true;
                // collidableObjects.push(node);
            }
        });

        scene.add(building);
    }, undefined, function (error) {
        console.error('Error loading ' + filename + ':', error);
    });
}

// --- PLACE YOUR BUILDINGS LIKE LEGO BLOCKS! ---
// loadBuilding( 'filename.glb', X-Position, Z-Position, Scale )

loadBuilding('Cafe1.glb', 0, 0, 3);           // Main Cafe (Center)
loadBuilding('Cafe2.glb', -40, 0, 2);        // Cafe 2 (Pushed 40 units Left)
loadBuilding('Restaurant1.glb', 40, 0, 2);   // Restaurant 1 (Pushed 40 units Right)
loadBuilding('Restaurant2.glb', 0, -40, 2);  // Restaurant 2 (Pushed 40 units Forward)

// --- LOAD THE AVATAR ---
const playerGroup = new THREE.Group();

// 1. IMPORTANT: Add to the SCENE, not the cameraHolder!
scene.add(playerGroup);

loader.load('Male_Casual.glb', function (gltf) {
    const avatarModel = gltf.scene;
    myAvatar = avatarModel; // --- NEW: Store the avatar in a global variable ---
    avatarModel.scale.set(0.01, 0.01, 0.01); 
    avatarModel.rotation.y = Math.PI; 

    // 2. Put the PUBG offset on the MODEL, not the group!
    avatarModel.position.set(0, -6, 0); 

    avatarModel.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    playerGroup.add(avatarModel);

    // --- THE ANIMATION SETUP ---
    mixer = new THREE.AnimationMixer(avatarModel);
    const animations = gltf.animations;

    if (animations && animations.length > 0) {
        const idleClip = THREE.AnimationClip.findByName(animations, 'HumanArmature|Man_Idle');
        const runClip = THREE.AnimationClip.findByName(animations, 'HumanArmature|Man_Run');
        const sitClip = THREE.AnimationClip.findByName(animations, 'HumanArmature|Man_Sitting');

        actionIdle = mixer.clipAction(idleClip);
        actionRun = mixer.clipAction(runClip);
        if (sitClip) actionSit = mixer.clipAction(sitClip);

        actionIdle.play(); 
    }
}, undefined, function (error) {
    console.error('An error happened loading the model:', error);
});

// 8. FPS MOVEMENT LOGIC
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup',   (e) => keys[e.key.toLowerCase()] = false);

const speed = 0.15;
// --- DEBUG: VISUALIZE BOUNDARIES ---
// This draws red wireframe boxes so you can see your collision zones!
function drawDebugBoxes() {
    buildingBoundaries.forEach(box => {
        // 1. Calculate the exact width and depth of the box
        const width = box.maxX - box.minX;
        const depth = box.maxZ - box.minZ;
        const height = 15; // Make it tall enough to see easily

        // 2. Find the exact center point
        const centerX = box.minX + (width / 2);
        const centerZ = box.minZ + (depth / 2);

        // 3. Create a see-through red box
        const geo = new THREE.BoxGeometry(width, height, depth);
        const mat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, // Bright Red
            wireframe: true  // This makes it transparent lines instead of a solid block!
        });
        
        const debugMesh = new THREE.Mesh(geo, mat);
        
        // 4. Place it in the world
        debugMesh.position.set(centerX, height / 2, centerZ);
        scene.add(debugMesh);
    });
}

// Turn it on!
// drawDebugBoxes();
// 9. THE GAME LOOP
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta(); // Check how much time passed since last frame
    if (mixer) {
        mixer.update(delta); // Tell the model to move its bones!
    }
    if (controls.isLocked === true) {
        const prevX = cameraHolder.position.x;
        const prevZ = cameraHolder.position.z;
        
        // --- NEW: THE ANIMATION BRAIN ---
        // Check if ANY movement key is currently being held down
        const isPressingMove = keys['w'] || keys['a'] || keys['s'] || keys['d'] || 
                               keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'];

        if (isPressingMove && !isMoving) {
            // The exact moment you start walking:
            isMoving = true;
            actionIdle.stop(); // Stop breathing
            actionRun.play();  // Start running!
        } else if (!isPressingMove && isMoving) {
            // The exact moment you let go of the keys:
            isMoving = false;
            actionRun.stop();  // Stop running
            actionIdle.play(); // Go back to breathing
        }

        // --- OLD MOVEMENT MATH (Keep this exactly the same!) ---
        if (keys['w'] || keys['arrowup'])    controls.moveForward(speed);
        if (keys['s'] || keys['arrowdown'])  controls.moveForward(-speed);
        if (keys['a'] || keys['arrowleft'])  controls.moveRight(-speed);
        if (keys['d'] || keys['arrowright']) controls.moveRight(speed);
        cameraHolder.position.y = 6;
        // playerGroup.position.copy(cameraHolder.position);
        
        // Copy ONLY the Left/Right turn (Yaw). Completely ignore Up/Down (Pitch)!
        // 2. THE NEW TRACKING MATH
        // Copy the camera's XYZ position so the anchor stays with you
        playerGroup.position.copy(cameraHolder.position);
        
        // NO 'if' statement here! The character ALWAYS copies the mouse!
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(cameraHolder.quaternion);
        playerGroup.rotation.y = euler.y;
        // --- THE WORLD BOUNDARY CHECK ---
        const distanceFromCenter = Math.sqrt(
            Math.pow(cameraHolder.position.x, 2) + 
            Math.pow(cameraHolder.position.z, 2)
        );
        

        if (distanceFromCenter > 95) {
            // Calculate the direction back to center
            const angle = Math.atan2(cameraHolder.position.z, cameraHolder.position.x);
            // Push the player back inside the limit
            cameraHolder.position.x = Math.cos(angle) * 95;
            cameraHolder.position.z = Math.sin(angle) * 95;
        }
        const moveDir = new THREE.Vector3(
            cameraHolder.position.x - prevX,
            0,
            cameraHolder.position.z - prevZ
        );
        const moveDistance = moveDir.length(); 
        // ==========================================
        // --- BOUNDARY BOX COLLISION ---
        // ==========================================
        
        let hitWall = false;

        // Only block them if they are wandering outside. 
        // (If they use the 'Enter Cafe' button, they bypass this!)
        if (!inCafe && !isSitting) { 
            // Loop through every building box
            const avatarWorldPos = new THREE.Vector3();
            myAvatar.getWorldPosition(avatarWorldPos);
            for (let box of buildingBoundaries) {
                // If the player's X and Z are INSIDE the box's limits...
                if (avatarWorldPos.x > box.minX && avatarWorldPos.x < box.maxX &&
                    avatarWorldPos.z > box.minZ && avatarWorldPos.z < box.maxZ) {
                    
                    hitWall = true; // We hit a building!
                    break;          // Stop checking other boxes
                }
            }
        }

        // If they hit a wall, instantly snap them back to where they were a millisecond ago
        if (hitWall) {
            cameraHolder.position.x = prevX;
            cameraHolder.position.z = prevZ;
        }
        // if (moveDistance > 0 && !isSitting) { 
        //     moveDir.normalize(); // Turn the movement into a pure directional arrow

        //     // 2. Shoot an invisible laser from our OLD position towards our NEW position
        //     // We shoot from height 2 (waist level) so we don't accidentally hit the floor
        //     const rayOrigin = new THREE.Vector3(prevX, 2, prevZ);
        //     raycaster.set(rayOrigin, moveDir);

        //     // 3. Check if the laser hits any of our solid objects
        //     // const hits = raycaster.intersectObjects(collidableObjects, false);

        //     // 4. If we hit something, AND it is closer than our movement step + a small buffer (0.8)
        //     // The 0.8 buffer stops the camera from clipping inside the wall before stopping.
        //     if (hits.length > 0 && hits[0].distance < moveDistance + 0.8) {
                
        //         // BONK! We hit a wall. Undo the movement!
        //         cameraHolder.position.x = prevX;
        //         cameraHolder.position.z = prevZ;
        //     }
        // }
        // ==========================================
        // --- PROXIMITY RADAR (Show the E Prompt) ---
        // ==========================================
        
        // Only run the radar if the character is loaded and NOT already sitting inside
        if (!inCafe && !isSitting && myAvatar) {
            
            // 1. Get the exact global position of the character's body
            const avatarWorldPos = new THREE.Vector3();
            myAvatar.getWorldPosition(avatarWorldPos);

            let foundRoom = null;

            // 2. Loop through all 4 rooms and check the distance
            // 2. Loop through all 4 rooms and check the distance
            for (let room of rooms) {
                // Pythagorean theorem to measure distance from the character to the room's center
                const dist = Math.sqrt(
                    Math.pow(avatarWorldPos.x - room.doorX, 2) + 
                    Math.pow(avatarWorldPos.z - room.doorZ, 2)
                );

                // --- THE FIX: Change 15 to 25! ---
                // We need the radar to reach outside your invisible boundary walls!
                if (dist < 25) {
                    foundRoom = room;
                    break; // Stop checking the other rooms!
                }
            }

            // 4. Update our global memory
            nearbyRoom = foundRoom;

            // 5. Update the HTML Sign on the screen
            if (nearbyRoom) {
                // Change the text to match the room we are standing next to
                promptUI.innerText = `Press E to enter ${nearbyRoom.name} (${nearbyRoom.currentOccupied}/${nearbyRoom.maxChairs})`;
                promptUI.style.display = 'block'; // Make the sign visible
            } else {
                promptUI.style.display = 'none'; // Hide the sign if we walk away
            }
            
        } else {
            promptUI.style.display = 'none'; // Hide the sign if we are already sitting
        }
    }
    
// 1. Define the hover distance: 2 meters up, 8 meters back
    const cameraOffset = new THREE.Vector3(0, 2, 8);
    
    // 2. Swing the offset to match wherever your mouse is turning
    cameraOffset.applyQuaternion(cameraHolder.quaternion);
    
    // 3. Move the REAL camera to that hovering spot behind the character
    camera.position.copy(cameraHolder.position).add(cameraOffset);
    
    // 4. Force the real camera to stare directly at the back of the character's head!
    camera.lookAt(cameraHolder.position);

    // 5. Finally, film the scene
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
