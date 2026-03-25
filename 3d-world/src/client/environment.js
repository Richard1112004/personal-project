import * as THREE from 'three';

export function setupEnvironment(scene) {
    const hemiLight = new THREE.HemisphereLight(0xFFFFFF, 0xFFFFFF, 0.6);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0x3172AE, 1.2);
    sunLight.position.set(50, 100, 30);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

//     const floorGeo = new THREE.CircleGeometry(100, 64);
//     const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2 });
//     const floor = new THREE.Mesh(floorGeo, floorMat);
//     floor.position.y = -0.05;
//     floor.rotation.x = -Math.PI / 2;
//     floor.receiveShadow = true;
//     scene.add(floor);

//     const grid = new THREE.GridHelper(200, 40, 0x444444, 0x333333);
//     grid.position.y = 0.05;
//     scene.add(grid);

}
