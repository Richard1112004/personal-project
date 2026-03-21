import * as THREE from 'three';

export const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

export function handlePlayerMovement(controls, playerGroup, cameraHolder, speed, isSitting = false) {
    const prevX = cameraHolder.position.x;
    const prevZ = cameraHolder.position.z;

    // // If the avatar is sitting, block movement and rotation syncing
    // if (isSitting) {
    //     // Still return previous position so callers can undo movement if needed
    //     return { prevX, prevZ };
    // }

    if (!isSitting) {
        if (keys['w']) controls.moveForward(speed);
        if (keys['s']) controls.moveForward(-speed);
        if (keys['a']) controls.moveRight(-speed);
        if (keys['d']) controls.moveRight(speed);

        // 2. Sync Rotation (copy yaw only) - MOVED INSIDE THE IF STATEMENT
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(cameraHolder.quaternion);
        playerGroup.rotation.y = euler.y;
    }

    // Sync physical body to the "Brain"
    playerGroup.position.copy(cameraHolder.position);
    

    return { prevX, prevZ };
}