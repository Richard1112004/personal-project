import * as THREE from 'three';

export function updateCamera(camera, cameraHolder) {
    const cameraOffset = new THREE.Vector3(0, 2, 8);
    cameraOffset.applyQuaternion(cameraHolder.quaternion);
    camera.position.copy(cameraHolder.position).add(cameraOffset);
    camera.lookAt(cameraHolder.position);
}