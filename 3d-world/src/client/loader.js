import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function createLoaderAndClock() {
    const loader = new GLTFLoader();
    const clock = new THREE.Clock();
    return { loader, clock };
}

export function loadBuilding(loader, scene, filename, x, z, scaleFactor) {
    const url = `./assets/model/${filename}`;
    fetch(url).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} while fetching ${url}`);
        const arrayBuffer = await res.arrayBuffer();
        loader.parse(arrayBuffer, '', (gltf) => {
            const building = gltf.scene;
            building.position.set(x, 0, z);
            building.scale.set(scaleFactor, scaleFactor, scaleFactor);
            building.traverse((node) => {
                if (node.isMesh) {
                    node.receiveShadow = true;
                    node.castShadow = true;
                }
            });
            scene.add(building);
        }, (err) => {
            console.error('GLTF parse error for ' + filename + ':', err);
        });
    }).catch(err => {
        console.error('Error loading ' + filename + ':', err);
    });
}

export function loadAvatar(loader, playerGroup, onLoaded) {
    const filename = 'Male_Casual.glb';
    const url = `./assets/model/${filename}`;
    fetch(url).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} while fetching ${url}`);
        const arrayBuffer = await res.arrayBuffer();
        loader.parse(arrayBuffer, '', (gltf) => {
            const avatarModel = gltf.scene;
            avatarModel.scale.set(0.01, 0.01, 0.01);
            avatarModel.rotation.y = Math.PI;
            avatarModel.position.set(0, -6, 0);
            avatarModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            playerGroup.add(avatarModel);

            const mixer = new THREE.AnimationMixer(avatarModel);
            const animations = gltf.animations;
            let actionIdle = null, actionRun = null, actionSit = null;
            if (animations && animations.length > 0) {
                const idleClip = THREE.AnimationClip.findByName(animations, 'HumanArmature|Man_Idle');
                const runClip = THREE.AnimationClip.findByName(animations, 'HumanArmature|Man_Run');
                const sitClip = THREE.AnimationClip.findByName(animations, 'HumanArmature|Man_Sitting');

                if (idleClip) actionIdle = mixer.clipAction(idleClip);
                if (runClip) actionRun = mixer.clipAction(runClip);
                if (sitClip) actionSit = mixer.clipAction(sitClip);
            }

            if (onLoaded) onLoaded({ avatarModel, mixer, actionIdle, actionRun, actionSit });
        }, (err) => {
            console.error('GLTF parse error for ' + filename + ':', err);
        });
    }).catch(err => {
        console.error('An error happened loading the model:', err);
    });
}

export function scanScene(loader, filename) {
    const url = `./assets/model/${filename}`;
    fetch(url).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} while fetching ${url}`);
        const arrayBuffer = await res.arrayBuffer();
        loader.parse(arrayBuffer, '', (gltf) => {
            console.log("--- 📂 Scene Hierarchy Start ---");
            gltf.scene.traverse((node) => {
                // This prints every object's name to your F12 Console
                console.log(`Node Name: "${node.name}" | Type: ${node.type}`);

                // While we are scanning, let's enable shadows for everything automatically
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            console.log("--- 📂 Scene Hierarchy End ---");
        }, (err) => {
            console.error('GLTF parse error for ' + filename + ':', err);
        });
    }).catch(err => {
        console.error('Error loading ' + filename + ':', err);
    });
}