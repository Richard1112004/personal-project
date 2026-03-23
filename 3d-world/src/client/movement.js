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

// Sit on a chair: positions cameraHolder, plays sit animation, and returns saved pose + state
export function sitOnChair(cameraHolder, playerGroup, actions, name, targetX, targetZ, targetRotationY, targetRotationX, targetRotationZ) {
    const { actionIdle, actionRun, actionSit } = actions || {};

    // Save current camera pose so the caller can restore when standing up
    const _savedCameraPos = cameraHolder.position.clone();
    const _savedCameraQuat = cameraHolder.quaternion.clone();

    const rotYStr = Number(targetRotationY || 0).toFixed(2);
    const rotXStr = Number(targetRotationX || 0).toFixed(2);
    const rotZStr = Number(targetRotationZ || 0).toFixed(2);

    if (rotYStr === "-1.57") {
        cameraHolder.position.set(targetX, 6.5, targetZ + 1);
        cameraHolder.rotation.y = targetRotationY - Math.PI / 2;
    } else if (rotYStr === "1.57") {
        cameraHolder.position.set(targetX, 6.5, targetZ - 1);
        cameraHolder.rotation.y = targetRotationY - Math.PI / 2;
    } else if (rotYStr === "0.00" && rotYStr !== "-0.00") {
        if (rotXStr === "0.00" && rotZStr === "0.00") {
            cameraHolder.position.set(targetX + 1, 6.5, targetZ);
            cameraHolder.rotation.y = targetRotationY - Math.PI / 2;
        } else if (rotXStr === "3.14" || rotZStr === "-3.14") {
            cameraHolder.position.set(targetX - 1, 6.5, targetZ);
            cameraHolder.rotation.y = targetRotationY + Math.PI / 2;
        }
    } else {
        if (rotXStr === "0.00" && rotXStr === "0.00") {
            cameraHolder.position.set(targetX - 1, 6.5, targetZ);
            cameraHolder.rotation.y = targetRotationY + Math.PI / 2;
        } else if (rotXStr === "-3.14" || rotZStr === "-3.14") {
            cameraHolder.position.set(targetX + 1, 6.5, targetZ);
            cameraHolder.rotation.y = targetRotationY - Math.PI / 2;
        } else {
            console.warn(`⚠️ Unhandled chair rotation for ${name} at X:${targetX.toFixed(2)}, Z:${targetZ.toFixed(2)}. Defaulting to facing North logic.`);
        }
    }

    playerGroup.rotation.y = cameraHolder.rotation.y;

    if (actionIdle) actionIdle.stop();
    if (actionRun) actionRun.stop();
    if (actionSit) {
        actionSit.reset();
        actionSit.setLoop(THREE.LoopOnce, 1);
        actionSit.clampWhenFinished = true;
        actionSit.play();
    }

    return { _savedCameraPos, _savedCameraQuat, isSitting: true };
}

// Stand up: free chair occupancy, restore camera pose, stop sit animation, and return new state
export function standUp(cameraHolder, playerGroup, actions, currentChair, allGameChairs, _savedCameraPos, _savedCameraQuat) {
    const { actionIdle, actionRun, actionSit } = actions || {};
    let newCurrentChair = currentChair;

    if (currentChair) {
        const idx = allGameChairs.findIndex(c => c.name === currentChair.name);
        if (idx !== -1) allGameChairs[idx].isOccupied = false;
        try { currentChair.isOccupied = false; } catch (e) {}
        newCurrentChair = null;
    }

    if (_savedCameraPos && _savedCameraQuat) {
        cameraHolder.position.copy(_savedCameraPos);
        cameraHolder.quaternion.copy(_savedCameraQuat);
        playerGroup.position.copy(cameraHolder.position);
        playerGroup.rotation.y = cameraHolder.rotation.y;
    }

    if (actionSit) actionSit.stop();

    return {
        isSitting: false,
        inCafe: false,
        currentChair: newCurrentChair,
        _savedCameraPos: null,
        _savedCameraQuat: null
    };
}

// Exit the current room: returns updated state
export function exitRoom(insideRoom) {
    if (!insideRoom) return { insideRoom: null, highlightedRoom: null, inCafe: false };
    console.log(`🚪 Exiting ${insideRoom.name}`);
    return { insideRoom: null, highlightedRoom: null, inCafe: false };
}