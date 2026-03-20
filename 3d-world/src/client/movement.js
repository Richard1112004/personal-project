import * as THREE from 'three';

export const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

export function handlePlayerMovement(controls, playerGroup, cameraHolder, speed) {
    const prevX = cameraHolder.position.x;
    const prevZ = cameraHolder.position.z;

    // Movement
    if (keys['w']) controls.moveForward(speed);
    if (keys['s']) controls.moveForward(-speed);
    if (keys['a']) controls.moveRight(-speed);
    if (keys['d']) controls.moveRight(speed);

    // Sync physical body to the "Brain"
    playerGroup.position.copy(cameraHolder.position);
    
    // Sync Rotation
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(cameraHolder.quaternion);
    playerGroup.rotation.y = euler.y;

    return { prevX, prevZ };
}