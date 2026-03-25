import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Keep your unpkg import that matches your local version!
import { DRACOLoader } from 'https://unpkg.com/three@0.140.0/examples/jsm/loaders/DRACOLoader.js';

export function createLoaderAndClock() {
    const loader = new GLTFLoader();
    
    // 1. Set up the Draco Decoder
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    // 2. THE NATIVE FIX: Tell the loader itself to bypass Ngrok
    loader.setRequestHeader({
        'ngrok-skip-browser-warning': 'true'
    });

    const clock = new THREE.Clock();
    return { loader, clock };
}

// Keep your global list at the top
export const allGameChairs = []; 

export function loadBuilding(loader, scene, filename, x, z, scaleFactor) {
    const url = `./assets/model/${filename}`;
    
    // 3. Now we use native loader.load() instead of the complex fetch!
    loader.load(url, (gltf) => {
        const building = gltf.scene;
        
        building.position.set(x, 0, z);
        building.scale.set(scaleFactor, scaleFactor, scaleFactor);
        building.updateMatrixWorld(true);

        const tableBlacklist = ["183", "199", "188", "190", "192", "195", "178", "177", "175"];
        const realChairIDs = ["018_48", "017_47", "016_46", "019_49", "023_55", "022_54", "015_52", "021_53"];
        
        building.traverse((node) => {
            if (node.isMesh) {
                node.receiveShadow = true;
                node.castShadow = true;
            }
            const isRealChair = realChairIDs.some(id => node.name.includes(id));
            
            if (node.name.includes("Chair") || isRealChair) {
                    node.updateMatrixWorld(true); 
                    const isTable = tableBlacklist.some(blacklisted => node.name.includes(blacklisted));
                    
                    if (!isTable) {
                            const boundingBox = new THREE.Box3().setFromObject(node);
                            const physicalCenter = new THREE.Vector3();
                            boundingBox.getCenter(physicalCenter);

                            const worldQuaternion = new THREE.Quaternion();
                            node.getWorldQuaternion(worldQuaternion);
                            const rotationEuler = new THREE.Euler().setFromQuaternion(worldQuaternion);

                            const finalX = physicalCenter.x;
                            const finalZ = physicalCenter.z;

                            allGameChairs.push({
                                    name: node.name,
                                    x: finalX, 
                                    z: finalZ,
                                    rotation: rotationEuler, 
                                    isOccupied: false
                            });
                            
                            console.log(`🪑 Logged ${node.name} at X:${finalX.toFixed(2)}, Z:${finalZ.toFixed(2)}`);
                    }
            }
            
            const targetNames = ["Cafe1", "Cafe2", "Restaurant1", "Restaurant2", "the_park", "plaza"];
            if (targetNames.some(target => node.name.includes(target))) {
                node.updateMatrixWorld(true);
                const boundingBox = new THREE.Box3().setFromObject(node);
                console.log(`{ name: "${node.name}", doorX: 0, doorZ: 0, minX: ${boundingBox.min.x.toFixed(2)}, maxX: ${boundingBox.max.x.toFixed(2)}, minZ: ${boundingBox.min.z.toFixed(2)}, maxZ: ${boundingBox.max.z.toFixed(2)} },`);
            }
        });
        
        scene.add(building);
        console.log(`✅ Loaded ${filename} at X:${x}. Auto-scanned ${allGameChairs.length} chairs!`);
        
    }, undefined, (err) => {
        // This will print the exact Draco error if it still fails!
        console.error('Error loading building:', err);
    });
}

export function loadAvatar(loader, playerGroup, onLoaded) {
    const filename = 'Male_Casual.glb';
    const url = `./assets/model/${filename}`;
    
    // We can also use the native loader.load() here for the avatar!
    loader.load(url, (gltf) => {
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
    }, undefined, (err) => {
        console.error('Error loading avatar:', err);
    });
}