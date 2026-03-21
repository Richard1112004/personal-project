import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function createLoaderAndClock() {
    const loader = new GLTFLoader();
    const clock = new THREE.Clock();
    return { loader, clock };
}

// Keep your global list at the top
export const allGameChairs = []; 

export function loadBuilding(loader, scene, filename, x, z, scaleFactor) {
    const url = `./assets/model/${filename}`;
    fetch(url).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const arrayBuffer = await res.arrayBuffer();
        
        loader.parse(arrayBuffer, '', (gltf) => {
            const building = gltf.scene;
            
            // 1. Apply your custom position and scale
            building.position.set(x, 0, z);
            building.scale.set(scaleFactor, scaleFactor, scaleFactor);
            
            // 2. FORCE UPDATE the math immediately after moving/scaling
            building.updateMatrixWorld(true);

            // 3. Traverse ONCE to add shadows AND scan for chairs!
            const tableBlacklist = ["183", "199", "188", "190", "192", "195", "178", "177", "175"];
            const realChairIDs = ["018_48", "017_47", "016_46", "019_49", "023_55", "022_54", "015_52", "021_53"];
            building.traverse((node) => {
                if (node.isMesh) {
                    node.receiveShadow = true;
                    node.castShadow = true;
                }
                const isRealChair = realChairIDs.some(id => node.name.includes(id));
                // --- THE BEACON SCANNER ---
                // We check for "Chair" or the Maya "tableChair" names
                if (node.name.includes("Chair") || isRealChair) {
                        node.updateMatrixWorld(true); 
                        const isTable = tableBlacklist.some(blacklisted => node.name.includes(blacklisted));
                        
                        if (!isTable) {
                                // 1. IGNORE the broken pivot points.
                                // Instead, wrap a mathematical box around the physical geometry itself.
                                const boundingBox = new THREE.Box3().setFromObject(node);
                                const physicalCenter = new THREE.Vector3();
                                boundingBox.getCenter(physicalCenter);

                                // 2. Use the physical center of the geometry
                                const finalX = physicalCenter.x;
                                const finalZ = physicalCenter.z;

                                // (Note: Add your window.allGameChairs or allGameChairs array here)
                                allGameChairs.push({
                                        name: node.name,
                                        x: finalX, 
                                        z: finalZ,
                                        isOccupied: false
                                });
                                
                                console.log(`🪑 Logged ${node.name} at X:${finalX.toFixed(2)}, Z:${finalZ.toFixed(2)}`);
                        }

                        
                }
            });
            
            scene.add(building);
            console.log(`✅ Loaded ${filename} at X:${x}. Auto-scanned ${allGameChairs.length} chairs!`);
            
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

// export function scanScene(loader, filename, onFinished) {
// const url = `./assets/model/${filename}`;
//     fetch(url).then(async (res) => {
//         if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} while fetching ${url}`);
//         const arrayBuffer = await res.arrayBuffer();
//         loader.parse(arrayBuffer, '', (gltf) => {
//             const building = gltf.scene;
//             console.log("--- 📂 Scene Hierarchy Start ---");
//                 gltf.scene.traverse((node) => {
//                         // This prints every object's name to your F12 Console
//                         console.log(`Node Name: "${node.name}" | Type: ${node.type}`);
                        
//                         // While we are scanning, let's enable shadows for everything automatically
//                         if (node.isMesh) {
//                         node.castShadow = true;
//                         node.receiveShadow = true;
//                         }
//                 });
//                 console.log("--- 📂 Scene Hierarchy End ---");
//                 if (onFinished) onFinished(gltf.scene);
           
//         }, (err) => {
//             console.error('GLTF parse error for ' + filename + ':', err);
//         });
//     }).catch(err => {
//         console.error('Error loading ' + filename + ':', err);
//     });
// }