import * as THREE from 'three';
import {PointerLockControls} from "PointerLockControls"


const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
let renderer;

let mapSize = 120; //mit einer mapSize von 120 * 120 und einer Chunkgrösse von 4*4 gibt es 30*30 Chunks --> 900 Chunks insgesamt
let chunkSize = 4;
let chunkXYToIndex;
let chunkList;

let dateLastFrame = 0;

let mapData;

let playerIdToIndex = new Map();
let playerList = [];

let isKeyPressed = {keyCodes: {}}
let keyMapList = {"KeyW": {exfunc: () => movePlayer([-1, 0], playerList[0].model, true)}, "KeyS": {exfunc: () => movePlayer([1, 0], playerList[0].model, true)}, "KeyA": {exfunc: () => movePlayer([0, -1], playerList[0].model, true)}, "KeyD": {exfunc: () => movePlayer([0, 1], playerList[0].model, true)}};
let moveSpeed = 0.1;

let isMoving = false;

let whereToMoveAtCollision = {
  0: [1, 0, 0, 0, 1, 1, -0.01, -1],
  1: [1, 0, 0, 0, 1, 1, 0.01, 1],
  2: [0, 1, 0, 1, 0, 1, -0.01, -1],
  3: [0, 1, 0, 1, 0, 1, 0.01, 1],
  4: [0, 0, 1, 1, 1, 0, -0.01, -1],
  5: [0, 0, 1, 1, 1, 0, 0.01, 1]
}


//anfang debugging
let amlight = new THREE.AmbientLight(0xFFFFFF, 0.1);
let polight = new THREE.PointLight(0xFFFFFF, 1);
let dilight = new THREE.DirectionalLight(0xFFFFFF, 1);

scene.add(amlight, dilight);
//ende debugging

function player (id, position, model, rotation, walkVector) {
  //nickname, model und position müssen gegeben werden, damit ein Player erstellt werden kann
  if (rotation == undefined) rotation = 0 //noch ändern #hilfe
  if (walkVector == undefined) walkVector = [0, 0] //erste Ziffer = vorne / hinten, zweite Ziffer = links / rechts

  this.id = id;
  this.position = position;
  this.rotation = rotation;
  this.walkVector = walkVector;
  this.model = model;
}

const movePlayer = (vector, playerObj, ownPlayer, playerId) => {
  let index = playerIdToIndex.get(playerId);
  if (index == undefined) index = 0;

  let lookVector = new THREE.Vector3();
  playerObj.getWorldDirection(lookVector);

  playerObj.position.add(new THREE.Vector3(lookVector.x * moveSpeed * vector[0] +lookVector.z * moveSpeed * vector[1], 0, lookVector.z * moveSpeed* vector[0] + -lookVector.x * moveSpeed* vector[1]));
  
  playerList[index].position = [playerObj.position.x, playerObj.position.y, playerObj.position.z];

  if (!ownPlayer) return;

  //own player is moving
  let afterWalk = [playerObj.position.x, playerObj.position.y, playerObj.position.z];
  checkPlayerCollision(afterWalk);

  isMoving = true;
  moveObject(camera, [playerObj.position.x, 2, playerObj.position.z]);
  ws.send(JSON.stringify({header: "walkevent", data: {rotation: [playerObj.quaternion.x, playerObj.quaternion.y, playerObj.quaternion.z, playerObj.quaternion.w], walkvector: vector, position: [playerObj.position.x, playerObj.position.y, playerObj.position.z]}}))
}

const checkPlayerCollision = (afterMove) => {
  let playerBounds = getBoxBounds(afterMove, [0.25, 1, 0.25]);

  let chunksToCheck = findChunkWithCoord([afterMove[0], afterMove[2]], true);
  //console.log(chunksToCheck);
  chunksToCheck.forEach((chunk) => {
    chunk = chunkList[chunk];
    Object.keys(chunk.objects).forEach((key) => {
      let objectToCheck = chunk.objects[key];
      let bounds = getBoxBounds(objectToCheck.position, objectToCheck.size);


      let colliding = doBoxesCollide(playerBounds, bounds);
      if (colliding) {
        let disBounds = [];
        for (var i = 0; i<3; i++) {
          disBounds[2*i] = Math.abs(bounds[2*i]-playerBounds[2*i+1]);
          disBounds[2*i+1] = Math.abs(bounds[2*i+1]-playerBounds[2*i]);
        }
        let smallestDis = Math.min(...disBounds);
        let index = disBounds.indexOf(smallestDis);
        let moveMap = whereToMoveAtCollision[index]
        bounds[index] +=  moveMap[6];
        let playerSize = [0.25, 1, 0.25];
        let newPos = [afterMove[0] * moveMap[3] + bounds[index] * moveMap[0] + playerSize[0] * 0.5 * moveMap[0] * moveMap[7], afterMove[1] * moveMap[4] + bounds[index] * moveMap[1] + playerSize[1] * 0.5 * moveMap[1] * moveMap[7], afterMove[2] * moveMap[5] + bounds[index] * moveMap[2] + playerSize[2] * 0.5 * moveMap[2] * moveMap[7]];
        
        playerList[0].position = newPos;
        moveObject(playerList[0].model, newPos);

      }
    });
  });
}

const createPlayerModel = (pos) => {
  const geometry = new THREE.BoxGeometry(0.25, 1, 0.25);
  const material = new THREE.MeshStandardMaterial( {color: 0xFFFFFF} );
  const cube = new THREE.Mesh( geometry, material );
  scene.add( cube );
  cube.castShadow = true;
  cube.receiveShadow = true;
  moveObject(cube, pos);
  return cube;
}

const createPlayer = (pos, id, myPlayer) => {
  let index = playerList.length;
  if (playerIdToIndex.get(id) != undefined) return;
  if (myPlayer) index = 0;

  playerIdToIndex.set(id, index);
  playerList[index] = new player(id, pos, createPlayerModel(pos));
}

const doBoxesCollide = (box1, box2) => {
  let horizontalPlaneTouch = (box1[1] >= box2[0] && box1[5] >= box2[4] && box1[0] <= box2[1] && box1[4] <= box2[5]); //nur 2d, deshalb das gleiche nochmal im vertikalen
  let verticalPlaneTouch = (box1[1] >= box2[0] && box1[3] >= box2[2] && box1[0] <= box2[1] && box1[2] <= box2[3]);
  return (horizontalPlaneTouch && verticalPlaneTouch);
}

const getBoxBounds = (position, dimensions) => {
  let box = [];
  box[0] = position[0] - dimensions[0] * 0.5;
  box[1] = position[0] + dimensions[0] * 0.5;
  box[2] = position[1] - dimensions[1] * 0.5;
  box[3] = position[1] + dimensions[1] * 0.5;
  box[4] = position[2] - dimensions[2] * 0.5;
  box[5] = position[2] + dimensions[2] * 0.5;

  return box;
}

const removePlayer = (id) => {
  console.log("removed player");

  let index = playerIdToIndex.get(id);
  scene.remove(playerList[index].model);
  playerIdToIndex.delete(id);
  playerList.splice(index, 1);
  
  //Liste hat sich verschoben, deshalb muss die Id zu Index Map neu erstellt werden
  recalcPlayerMap();
}

const createCameraControl = (rot) => {
  let quaternion = new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]);

  camera.setRotationFromQuaternion(quaternion);
  playerList[0].model.setRotationFromQuaternion(quaternion);

  const controls = new PointerLockControls( camera, document.body, playerList[0].model, function(quat) {

    //falls man läuft wird die rotation eh schon geschickt, braucht es nicht zwei mal
    if (isMoving) return;
    ws.send(JSON.stringify({header: "rotateevent", data: {rotation: [quat.x, quat.y, quat.z, quat.w]}}))
  });
  moveObject(camera, [playerList[0].model.position.x, 3, playerList[0].model.position.z])

  document.body.addEventListener( 'click', function () {
    controls.lock();
  }
  , false );
}

const createGrid = () => {
  const gridHelper = new THREE.GridHelper(120, 29);
  moveObject(gridHelper, [60, 0, 60]);
  scene.add( gridHelper );
};

const animate = () => {
  //console.log(Date.now() - dateLastFrame)
  //dateLastFrame = Date.now();
  requestAnimationFrame(animate);
  checkInput();
  renderer.render(scene, camera);
};

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight;
  
  camera.updateProjectionMatrix();
  
};

const createScene = (el) => {
  renderer = new THREE.WebGLRenderer({canvas: el });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  generateMap(mapData);
  resize();
  window.addEventListener('resize', resize);
  
  createListener();
  animate();
};

const coordsToString = (coords) => {
  return coords[0] + " " + coords[1];
}

const findChunkWithCoord = (coords2D, chunksAround) => {
  if (chunksAround) {
    let chunkIndexX = Math.floor(coords2D[0]/chunkSize) - 1; //index startet bei 0
    let chunkIndexY = Math.floor(coords2D[1]/chunkSize) - 1; //index startet bei 0

    let chunkIndexList = []
    for (var x = 0; x<3; x++) {
      for (var y = 0; y<3; y++) {
        let index = chunkXYToIndex.get(coordsToString([chunkIndexX + x, chunkIndexY + y]));
        if (index != undefined) chunkIndexList.push(index);
      }
    }
    return chunkIndexList;
  }
  let chunkIndexX = Math.floor(coords2D[0]/chunkSize); //index startet bei 0
  let chunkIndexY = Math.floor(coords2D[1]/chunkSize); //index startet bei 0

  let chunkIndex = chunkXYToIndex.get(coordsToString([chunkIndexX, chunkIndexY])); //gibt den Index des Chunks zurück
  return chunkIndex;
};

const generateChunkMap = () => {
  chunkXYToIndex = new Map()
  chunkList = [];

  //jedem Chunk wird nun einen Index zugewiesen und die ChunkListe wird erstellt
  let index = 0;
  for(var y = 0; y<(mapSize/chunkSize);y++) {
    for (var x = 0; x<(mapSize/chunkSize); x++) {
      chunkXYToIndex.set(coordsToString([x, y]), index);
      chunkList[index] = {
        chunkXY: [x, y],
        objects: {}
      }
      index++;
    }
  }
};

const moveObject = (object, position) => {
  object.position.x = position[0];
  object.position.y = position[1];
  object.position.z = position[2];

};

const createObject = (object) => {
  if (object.shape == "cube") {
    const geometry = new THREE.BoxGeometry(object.size[0], object.size[1], object.size[2]);
    const material = new THREE.MeshStandardMaterial( {color: object.color} );
    const cube = new THREE.Mesh( geometry, material );
    scene.add( cube );
    cube.castShadow = true;
    cube.receiveShadow = true;
    moveObject(cube, object.position);

  } else if(object.shape == "plane") {    
    const geometry = new THREE.PlaneGeometry(object.size[0], object.size[1]);
    const material = new THREE.MeshStandardMaterial( {color: object.color} );
    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);
    plane.receiveShadow = true;
    plane.castShadow = false;
    moveObject(plane, object.position);
    plane.lookAt(new THREE.Vector3(object.orientation[0], object.orientation[1], object.orientation[2]));

  } else {
    console.log("can't create object");
  }
};

const generateMap = (mapObject) => {
  generateChunkMap();

  //generate Ground Plane
  createObject({shape: "plane", size: [mapSize, mapSize], position: [mapSize/2, 0, mapSize/2], orientation: [mapSize/2, 1, mapSize/2]});

  //go through every object in the mapObject.objects
  Object.keys(mapObject.objects).forEach((key) => {
    let object = mapObject.objects[key];

    //findet den Index des Chunks heruas, wo sich das Objekt befindet
    let chunkIndex = findChunkWithCoord([object.position[0], object.position[2]]);

    //das Objekt wird nun dem richtigen Chunk hinzugefügt
    chunkList[chunkIndex].objects["object" + object.id] = object;

    //das Objekt wird nun erstellt
    createObject(object);
  });

};

const createListener = () => {
  console.log("listener activated");
  document.body.addEventListener("keydown", (event) => {
    isKeyPressed.keyCodes[event.code] = true;
  })
  document.body.addEventListener("keyup", (event) => {
    isKeyPressed.keyCodes[event.code] = false;
    isMoving = false;
  })
}

const checkInput = () => {
  Object.keys(isKeyPressed.keyCodes).forEach((keyId) => {
    let key = isKeyPressed.keyCodes[keyId]
    if(key) {
      if (keyMapList[keyId] != undefined)
      keyMapList[keyId].exfunc();
    }
  })
}

const recalcPlayerMap = () => {
  playerIdToIndex.clear();
  let counter = 0;
  playerList.forEach((item) => {
    playerIdToIndex.set(item.id, counter);
    counter++;
  });
}


//anfang debugging
createGrid();

moveObject(polight, [-2, 0, 2]);
//moveObject(camera, [3, 1, -3]);
moveObject(dilight, [-20, 10, -20]);
/*const helper = new THREE.CameraHelper( dilight.shadow.camera );
scene.add( helper );*/
//dilight.lookAt(new THREE.Vector3(0, 0, 0));
dilight.castShadow = true;


let myBox1 = {
  position: [0, 0, 0],
  dimensions: [2, 5, 1]
}

let myBox2 = {
  position: [1, 2, 1],
  dimensions: [2, 5, 1]
}

console.log(doBoxesCollide(getBoxBounds(myBox1.position, myBox1.dimensions), getBoxBounds(myBox2.position, myBox2.dimensions)));

//ende debugging


/*end of THREE code

********************************************************************************************************************

start of websocket code*/

const ws = new WebSocket("ws://localhost:7071");

ws.onopen = function(event) {
  console.log("ws is open!");
};

ws.onmessage = (event) => {
  let message = JSON.parse(event.data);
  if (message.header == "event") {

  } else if(message.header == "walkevent"){
    let index = playerIdToIndex.get(message.data.id);
    if (index == 0) return;
    let movedPlayer = playerList[index];
    let quaternion = new THREE.Quaternion(message.data.rotation[0], message.data.rotation[1], message.data.rotation[2], message.data.rotation[3]);
    movedPlayer.model.setRotationFromQuaternion(quaternion);
    movePlayer(message.data.walkvector, movedPlayer.model, false, message.id);

  } else if(message.header == "rotateevent") {
    playerList[playerIdToIndex.get(message.data.id)].rotation = message.data.rotation;
    playerList[playerIdToIndex.get(message.data.id)].model.setRotationFromQuaternion(new THREE.Quaternion(message.data.rotation[0], message.data.rotation[1], message.data.rotation[2], message.data.rotation[3]));

  }else if(message.header == "mapData") {
    //als erstes schickt der server die map daten, damit die Map generiert werden kann. 
    mapData = message.mapObject;
    createScene(document.getElementById("bg"));

  } else if(message.header == "yourPos") {
    //server schickt die eigene position zum spawnen
    playerList = [];
    createPlayer(message.data.position, message.data.playerId, true);
    createCameraControl(message.data.rotation);

  } else if(message.header == "newPlayer") {
    //falls ein neuer spieler connected, muss dieser erstellt werden
    console.log("new player connected");
    createPlayer(message.data.position, message.data.playerId, false);

  } else if (message.header == "playerDisconnected") {
    //falls jemand disconnected, muss dieser spieler auch verschwinden
    console.log("player disconnected: " + message.data.playerId);
    removePlayer(message.data.playerId);
  }
}