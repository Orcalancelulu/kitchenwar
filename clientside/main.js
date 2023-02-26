import * as THREE from 'three';
import {PointerLockControls} from "PointerLockControls"
import { GLTFLoader } from 'GLTFLoader';



const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 20);
let renderer;

let mapSize = 120; //mit einer mapSize von 120 * 120 und einer Chunkgrösse von 4*4 gibt es 30*30 Chunks --> 900 Chunks insgesamt
let chunkSize = 4;
let chunkXYToIndex;
let chunkList;

let mapData;

let playerIdToIndex = new Map();
let playerList = [];

let isKeyPressed = {keyCodes: {}}
let keyMapList = {"KeyW": {exfunc: () => movePlayer([-1, 0], playerList[0].model, true)}, "KeyS": {exfunc: () => movePlayer([1, 0], playerList[0].model, true)}, "KeyA": {exfunc: () => movePlayer([0, -1], playerList[0].model, true)}, "KeyD": {exfunc: () => movePlayer([0, 1], playerList[0].model, true)}, "Space": {exfunc: () => wantToJump()}};
let moveSpeed = 0.1;

let playerSize = [0.25, 1, 0.25];

let mixer;

let controls;
let isInGame = false;
let isInMenu = true;

let standByPos = [1, 20, 1];

let isMoving = false;


//erste 3 Zahlen für bounds, nächste 3 für playerPosition, nächste für extra abstand, damit man im nächsten frame nicht schon wieder drinn steckt und die letzte ziffer, damit man zurück zum rand des objekts kommt
//sechs verschiedene fälle, da das objekt an 6 verschiedenen seiten ankommen kann (würfel hat 6 seiten)
let whereToMoveAtCollision = {
  0: [1, 0, 0, 0, 1, 1, -0.01, -1],
  1: [1, 0, 0, 0, 1, 1, 0.01, 1],
  2: [0, 1, 0, 1, 0, 1, -0.01, -1],
  3: [0, 1, 0, 1, 0, 1, 0, 1],
  4: [0, 0, 1, 1, 1, 0, -0.01, -1],
  5: [0, 0, 1, 1, 1, 0, 0.01, 1]
}

//anfang debugging

document.body.addEventListener("click", (event)=> {
  if (isInMenu) return; //man soll nicht aus dem Menue-Kameraflugmodus angreifen können
  let lookVector = new THREE.Vector3;
  camera.getWorldDirection(lookVector);
  ws.send(JSON.stringify({header: "attacking", data: {rotation: [lookVector.x, lookVector.y, lookVector.z], position: [camera.position.x, camera.position.y, camera.position.z]}}))
})

let amlight = new THREE.AmbientLight(0xFFFFFF, 0.1);
let polight = new THREE.PointLight(0xFFFFFF, 1);
let dilight = new THREE.DirectionalLight(0xFFFFFF, 1);

scene.add(amlight, dilight);
//ende debugging

function player (id, position, model, hp, rotation, walkVector) {
  //nickname, model und position müssen gegeben werden, damit ein Player erstellt werden kann
  if (rotation == undefined) rotation = 0 //noch ändern #hilfe
  if (walkVector == undefined) walkVector = [0, 0] //erste Ziffer = vorne / hinten, zweite Ziffer = links / rechts

  this.id = id;
  this.position = position;
  this.rotation = rotation;
  this.walkVector = walkVector;
  this.model = model;
  this.isGrounded = false;
  this.downVel = 0;
  this.isWalking = false;
  this.hp = hp; 
  this.isOnStandby = true;
}

const createSkybox = async () => {
  const loader = new THREE.CubeTextureLoader();
  loader.setPath('texture/');
  const cubeTex = loader.load( [
    "2left.png", "3right.png", "4up.png", "5down.png", "0front.png", "1back.png"
  ])
  scene.background = cubeTex;
}

const addGltfToScene = () => {
  const loader = new GLTFLoader();
  loader.load("models/wasserkocher/wasserkocher.glb", function ( gltf ) {
    gltf.scene.scale.set(0.2, 0.2, 0.2);
    moveObject(gltf.scene, [2, 0.5, 2]);
    scene.add(gltf.scene);

    mixer = new THREE.AnimationMixer(gltf.scene);
    let action = mixer.clipAction(gltf.animations[0]);

    action.play();


  },	function ( xhr ) {

		console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );

	}, 	function ( error ) {

		console.log( 'An error happened' );

	})
}


const movePlayer = (vector, playerObj, ownPlayer, playerId) => {
  //if (!playerList[0].isGrounded) return;

  let index = playerIdToIndex.get(playerId);
  if (index == undefined) index = 0;

  playerList[index].isWalking = true;

  let lookVector = new THREE.Vector3();
  playerObj.getWorldDirection(lookVector);

  playerObj.position.add(new THREE.Vector3(lookVector.x * moveSpeed * vector[0] +lookVector.z * moveSpeed * vector[1], 0, lookVector.z * moveSpeed* vector[0] + -lookVector.x * moveSpeed* vector[1]));
  
  playerList[index].position = [playerObj.position.x, playerObj.position.y, playerObj.position.z];
  
  if (!ownPlayer) return;

  //own player is moving
  let afterWalk = [playerObj.position.x, playerObj.position.y, playerObj.position.z];
  checkPlayerCollision(afterWalk);

  isMoving = true;
  moveObject(camera, [playerObj.position.x, playerObj.position.y + playerSize[1]*0.25, playerObj.position.z]);


  ws.send(JSON.stringify({header: "walkevent", data: {walkvector: vector, position: [playerObj.position.x, playerObj.position.y, playerObj.position.z], isGrounded: playerList[index].isGrounded}}))
}

const checkPlayerCollision = (afterMove) => {
  let playerBounds = getBoxBounds(afterMove, playerSize);

  let chunksToCheck = findChunkWithCoord([afterMove[0], afterMove[2]], true);
  
  playerList[0].isGrounded = false;
  //spieler landet auf dem Boden
  if (afterMove[1]-playerSize[1]*0.5 <= 0) {

    playerList[0].isGrounded = true;

    playerList[0].model.position.y = playerSize[1]*0.5;
    playerList[0].position[1] = playerSize[1]*0.5;

  }

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
        if (index == 3) { //landed / standing on something
          playerList[0].isGrounded = true;
        }
        let moveMap = whereToMoveAtCollision[index]
        bounds[index] +=  moveMap[6];
        //let playerSize = [0.5, 2, 0.5];
        let newPos = [afterMove[0] * moveMap[3] + bounds[index] * moveMap[0] + playerSize[0] * 0.5 * moveMap[0] * moveMap[7], afterMove[1] * moveMap[4] + bounds[index] * moveMap[1] + playerSize[1] * 0.5 * moveMap[1] * moveMap[7], afterMove[2] * moveMap[5] + bounds[index] * moveMap[2] + playerSize[2] * 0.5 * moveMap[2] * moveMap[7]];
        
        playerList[0].position = newPos;
        moveObject(playerList[0].model, newPos);

      }
    });
  });
}

const createPlayerModel = (pos) => {
  
  const geometry = new THREE.BoxGeometry(...playerSize);
  const material = new THREE.MeshStandardMaterial( {color: 0xFFFFFF} );
  const cube = new THREE.Mesh( geometry, material );
  scene.add( cube );
  cube.castShadow = true;
  cube.receiveShadow = true;
  moveObject(cube, pos);
  return cube;
}

const loadBetterModel = (playerId, pos, myPlayer, rotation) => {
  
  const loader = new GLTFLoader();
  loader.load("models/wasserkocher/wasserkocher.glb", function ( gltf ) {
    gltf.scene.scale.set(0.2, 0.2, 0.2);
    scene.add(gltf.scene);

    
    moveObject(gltf.scene, pos);
    
    
    scene.remove(playerList[playerIdToIndex.get(playerId)].model);
    playerList[playerIdToIndex.get(playerId)].model = gltf.scene;
    
    if (myPlayer) {
      createCameraControl(rotation); //createCameraControl ist hier und nicht in der Nachrichtsankunft, da der loader ziemlich viel Zeit braucht. createCameraControl braucht aber das zeugs vom loader 
    }
    playerList[playerIdToIndex.get(playerId)].hpModel = createFloatingHp(playerId);
  })


}

const createPlayer = (pos, id, hp, myPlayer, rotation) => {
  let index = playerList.length;
  if (playerIdToIndex.get(id) != undefined) return;
  if (myPlayer) index = 0;


  playerIdToIndex.set(id, index);
  playerList[index] = new player(id, pos, createPlayerModel(pos), hp);
  loadBetterModel(id, pos, myPlayer, rotation); //loads the real model, takes longer so a dummy model gets loaded first for movement (only few millisec)
  console.log("loading model");

}

const updateAnimations = () => {
  playerList.forEach(playerInList => {
    if (!playerInList.isGrounded) { //jump pose

    } else if (playerInList.isWalking) { //walking animation
      mixer.update(0.02);
      playerInList.isWalking = false;
    } else {

    }

  });
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

const wantToJump = () => {
  //console.log(playerList[0].isGrounded);
  if (!playerList[0].isGrounded) return;
  playerList[0].isGrounded = false;
  playerList[0].downVel = 0.1;
  playerList[0].model.position.y += 0.01;
}

const createCameraControl = (rot) => {
  let quaternion = new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]);

  camera.setRotationFromQuaternion(quaternion);
  playerList[0].model.setRotationFromQuaternion(quaternion);

  controls = new PointerLockControls( camera, document.body, playerList[0].model, function(quat) {
    //rotation an server schicken

    ws.send(JSON.stringify({header: "rotateevent", data: {rotation: [quat.x, quat.y, quat.z, quat.w]}}))
  });
  moveObject(camera, [playerList[0].model.position.x, 3, playerList[0].model.position.z])

  document.getElementById("playButton").addEventListener( 'click', function () {
    
    controls.lock();
  });

  controls.addEventListener('lock', function () {
    document.getElementById("menue").style.display = 'none';
    isInGame = true;
    isInMenu = false;
    camera.position.set(playerList[0].model.position.x, playerList[0].model.position.y, playerList[0].model.position.z);
    camera.quaternion.copy(playerList[0].model.quaternion);
    
    if (playerList[0].isOnStandby) ws.send(JSON.stringify({header: "joiningGame"}));

    playerList[0].model.visible = false;
  } );

  controls.addEventListener('unlock', function () {
    document.getElementById("menue").style.display = 'block';
    isInMenu = true;
    //playerList[0].model.visible = true;
  } );

  
  const _VS = `
  uniform vec3 scale;
  uniform float aspect;
  void main() {
    gl_Position = vec4(position.x / aspect * scale.x, position.y * scale.y, position.z * scale.z, 1.0);
  }`;

  const _FS = `
  void main() {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  }
  `

  const crossHairSize = 0.02;
  
  const material = new THREE.ShaderMaterial({uniforms: {scale: {value: new THREE.Vector3(crossHairSize, crossHairSize, 1)}, aspect: {value: camera.aspect}}, vertexShader: _VS, fragmentShader: _FS});

  const crosshair = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), material);

  crosshair.position.set(0, 0, -1);
  crosshair.frustumCulled = false;

  scene.add( crosshair );
  //sprite.position.z = -3;
  //sprite.position.set()
}


const createGrid = () => {
  const gridHelper = new THREE.GridHelper(120, 29);
  moveObject(gridHelper, [60, 0, 60]);
  scene.add( gridHelper );
};

//falls jemand stirbt oder frisch joint
const putToStandby = (playerId, isMyPlayer) => {
  let index = playerIdToIndex.get(playerId);
  playerList[index].model.visible = false
  moveObject(playerList[index].model, standByPos);
  playerList[index].isOnStandby = true;
  playerList[index].hp = 100; //debugging, später  noch anpassbare maxHp


  if (isMyPlayer) {
    controls.unlock();
    isInGame = false;
  }
}

const putInGame = (playerId, isMyPlayer, spawnPos) => {
  let index = playerIdToIndex.get(playerId);
  //console.log(index);
  //console.log(playerList[index]);
  let playerObj = playerList[index];

  moveObject(playerObj.model, spawnPos);
  moveObject(camera, [playerObj.position.x, playerObj.position.y + playerSize[1]*0.25, playerObj.position.z]);

  //console.log("moving...")
  playerList[index].isOnStandby = false;
  playerList[index].hp = 100; //debugging, später  noch anpassbare maxHp
  //console.log(isMyPlayer);
  if (isMyPlayer) {
    updateOwnHp();
    playerList[index].model.visible = false;
  } else {
    playerList[index].model.visible = true;
  }

  updateFloatingHp(playerList[index].hp, playerId);
  
}

const applyPhysics = () => {
  //console.log(playerList[0].isGrounded);
  if (playerList[0] == undefined) return;
  if (playerList[0].isGrounded) { 
    playerList[0].downVel = 0; 
    return; 
  }

  playerList[0].downVel -= 0.005;
  playerList[0].model.position.add(new THREE.Vector3(0, playerList[0].downVel, 0));
  playerList[0].position = [playerList[0].model.position.x, playerList[0].model.position.y, playerList[0].model.position.z];

  checkPlayerCollision(playerList[0].position);

  moveObject(camera, [playerList[0].position[0], playerList[0].position[1]+playerSize[1]*0.25, playerList[0].position[2]]);

  ws.send(JSON.stringify({header: "walkevent", data: {position: playerList[0].position, rotation: [playerList[0].model.quaternion.x, playerList[0].model.quaternion.y, playerList[0].model.quaternion.z, playerList[0].model.quaternion.w], isGrounded: false}}))
}

//rekursive Funktion um Bezierkurve (3d) zu bekommen anhand von den Leitpunkten und faktor (wo genau auf der Kurve man den Punkt will)
const bezierPos = (vectorList, factor) => {
  let afterVectorList = [];
  for (var i = 0; i<vectorList.length-1; i++) {
    afterVectorList[i] = vectorList[i].lerp(vectorList[i+1], factor);
  }
  if (afterVectorList.length < 2) {
    return afterVectorList[0];
  } else {
    return bezierPos(afterVectorList, factor);
  }
}

//debugging
let flyTime = 0; //muss später noch durch deltaTime ersetzt werden
//ende debugging


const updateCameraFly = () => {
  if (isInGame) return; //only if not in game

  let rawPosList = mapData.cameraFly.bezier;
  let posList = [];
  let index = 0;

  rawPosList.forEach((pos) => {
    posList[index] = new THREE.Vector3(pos[0], pos[1], pos[2]);
    index += 1;
  });

  let positionToMove = bezierPos(posList, flyTime);
  camera.position.set(positionToMove.x, positionToMove.y, positionToMove.z);
  camera.lookAt(new THREE.Vector3(mapData.cameraFly.lookVector[0], mapData.cameraFly.lookVector[1], mapData.cameraFly.lookVector[2]));
  flyTime +=  0.001;
  if (flyTime > 1) {
    flyTime = 0;
  }

}


const animate = () => {
  requestAnimationFrame(animate);
  checkInput();
  applyPhysics();
  updateAnimations();

  updateCameraFly();
 
  renderer.render(scene, camera);
};

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  
  camera.updateProjectionMatrix();
  
};

const createScene = (el) => {
  renderer = new THREE.WebGLRenderer({canvas: el, antialias: true});
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;


  generateMap(mapData);
  resize();
  window.addEventListener('resize', resize);
  
  createListener();
  createSkybox();
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

const updateHealth = (playerId, damage) => {
  
  playerList[playerIdToIndex.get(playerId)].hp -= damage;
  
  if (playerIdToIndex.get(playerId) == 0) {
    //own player got hit
    updateOwnHp(); //ui healthbar
  } 

  updateFloatingHp(playerList[playerIdToIndex.get(playerId)].hp, playerId); //ingame healthbar

  console.log(playerList[playerIdToIndex.get(playerId)].hp);

}

const createFloatingHp = (playerId) => {

  let playerObject = playerList[playerIdToIndex.get(playerId)];

  const map = new THREE.TextureLoader().load( '/texture/hpBar.png' );
  const material = new THREE.SpriteMaterial( { map: map } );

  const sprite = new THREE.Sprite( material );

  let hp = playerList[playerIdToIndex.get(playerId)].hp;

  let hpRatio = hp/100;

  sprite.scale.set(hpRatio * 1.5, 0.3, 1);
  sprite.position.set(0, 4, 0);

  playerObject.model.add(sprite);
  return sprite;

}

const updateFloatingHp = (hp, playerId) => {  

  const hpRatio = hp / 100; //100 = maxHp, wird später noch geändert, soll nicht hardgecoded sein

  playerList[playerIdToIndex.get(playerId)].hpModel.scale.set(hpRatio * 1.5, 0.3, 1);

}

const updateOwnHp = () => {
  const maxHp = 100;
  document.getElementById("healthBar").style.width = (100*(playerList[0].hp / maxHp)).toString() + "%";
  document.getElementById("healthDisplay").innerHTML = playerList[0].hp;
}

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
  if (!isInGame || isInMenu) return;


  Object.keys(isKeyPressed.keyCodes).forEach((keyId) => {
    let key = isKeyPressed.keyCodes[keyId];
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
//ende debugging

addGltfToScene();

/*end of THREE code

********************************************************************************************************************

start of websocket code*/

const ws = new WebSocket("ws://localhost:7031"); //wss://kitchenwar-backend.onrender.com

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
    movedPlayer.isWalking = true;
    movedPlayer.isGrounded = message.data.isGrounded;

    moveObject(playerList[index].model, message.data.position)
    playerList[index].position = message.data.position;

  } else if(message.header == "rotateevent") {
    if (playerIdToIndex.get(message.data.playerId) == 0) return; //der eigene charakter muss nicht vom server gedreht werden, sind eh eigene daten

    playerList[playerIdToIndex.get(message.data.playerId)].rotation = message.data.rotation;
    playerList[playerIdToIndex.get(message.data.playerId)].model.setRotationFromQuaternion(new THREE.Quaternion(message.data.rotation[0], message.data.rotation[1], message.data.rotation[2], message.data.rotation[3]));

  }else if(message.header == "mapData") { //**************** */
    //als erstes schickt der server die map daten, damit die Map generiert werden kann. 
    mapData = message.mapObject;
    createScene(document.getElementById("bg"));

  } else if(message.header == "yourPos") { //******************* */
    //server schickt die eigene position zum spawnen
    playerList = [];
    createPlayer(message.data.position, message.data.playerId, message.data.hp, true, message.data.rotation);

  } else if(message.header == "newPlayer") {
    //falls ein neuer spieler connected, muss dieser erstellt werden
    console.log("new player connected");
    createPlayer(message.data.position, message.data.playerId, message.data.hp, false);

  } else if (message.header == "playerDisconnected") {
    //falls jemand disconnected, muss dieser spieler auch verschwinden
    console.log("player disconnected: " + message.data.playerId);
    removePlayer(message.data.playerId);

  } else if (message.header == "playerHit") {
    //console.log("player: " + message.data.playerId + " recieved " + message.data.damage + " damage");
    updateHealth(message.data.playerId, message.data.damage);


  } else if (message.header == "playerJoined") {
    console.log("Player joined the game");
    putInGame(message.data.playerId, playerIdToIndex.get(message.data.playerId) == 0, message.data.position);
    
  } else if (message.header == "putToStandby") {
    console.log("Putting to standby because: " + message.data.cause);
    putToStandby(message.data.playerId, playerIdToIndex.get(message.data.playerId) == 0);
  }
}