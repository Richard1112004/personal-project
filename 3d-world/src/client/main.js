import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// Import our modules (note filenames in this project)
import { ROOMS, PLAYER_SPEED, RADAR_DISTANCE } from './constant.js';
import { updateCamera } from './camera.js';
import { handlePlayerMovement, keys } from './movement.js';
import { setupEnvironment } from './environment.js';
import { createLoaderAndClock, loadBuilding, loadAvatar } from './loader.js';

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

// Build building boundaries from ROOMS (they include min/max fields)
// const buildingBoundaries = ROOMS.map(r => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ }));

// Setup lighting, floor, grid via environment module
setupEnvironment(scene);

// loadBuilding is provided by ./loader.js

// Load environment and avatar
// loader.load('../../public/assets/models/scene.glb', (gltf) => scene.add(gltf.scene));

loadBuilding(loader, scene, 'scene.glb', -40, 0, 3);

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

function sitOnChair(targetX, targetZ) {
    isSitting = true;
    cameraHolder.position.set(targetX, 2, targetZ);
    if (actionIdle) actionIdle.stop();
    if (actionRun) actionRun.stop();
    if (actionSit) {
        actionSit.reset();
        actionSit.setLoop(THREE.LoopOnce);
        actionSit.clampWhenFinished = true;
        actionSit.play();
    }
}

if (enterCafeBtn) {
    enterCafeBtn.addEventListener('click', () => {
        inCafe = true;
        sitOnChair(-35.23, 15.76);
        enterCafeBtn.style.display = 'none';
        controls.lock();
    });
}

// Optional debug boxes
function drawDebugBoxes() {
    buildingBoundaries.forEach(box => {
        const width = box.maxX - box.minX;
        const depth = box.maxZ - box.minZ;
        const height = 15;
        const centerX = box.minX + (width / 2);
        const centerZ = box.minZ + (depth / 2);
        const geo = new THREE.BoxGeometry(width, height, depth);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const debugMesh = new THREE.Mesh(geo, mat);
        debugMesh.position.set(centerX, height / 2, centerZ);
        scene.add(debugMesh);
    });
}

// Uncomment to visualize collision boxes
// drawDebugBoxes();

// --- GAME LOOP ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    if (controls.isLocked) {
        const { prevX, prevZ } = handlePlayerMovement(controls, playerGroup, cameraHolder, PLAYER_SPEED);

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

        // Collision: check avatar world position against building boxes
        // if (!inCafe && !isSitting && myAvatar) {
        //     const avatarWorldPos = new THREE.Vector3();
        //     myAvatar.getWorldPosition(avatarWorldPos);
        //     let hitWall = false;
        //     for (let box of buildingBoundaries) {
        //         if (avatarWorldPos.x > box.minX && avatarWorldPos.x < box.maxX &&
        //             avatarWorldPos.z > box.minZ && avatarWorldPos.z < box.maxZ) {
        //             hitWall = true; break;
        //         }
        //     }
        //     if (hitWall) {
        //         cameraHolder.position.x = prevX;
        //         cameraHolder.position.z = prevZ;
        //     }
        // }

        // Proximity radar to show prompt
        if (!inCafe && !isSitting && myAvatar) {
            const avatarWorldPos = new THREE.Vector3();
            myAvatar.getWorldPosition(avatarWorldPos);
            let foundRoom = null;
            for (let room of ROOMS) {
                const dist = Math.sqrt(Math.pow(avatarWorldPos.x - room.doorX, 2) + Math.pow(avatarWorldPos.z - room.doorZ, 2));
                if (dist < RADAR_DISTANCE) { foundRoom = room; break; }
            }
            if (foundRoom) {
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
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});