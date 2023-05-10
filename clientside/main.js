import * as THREE from 'three';
import {PointerLockControls} from "PointerLockControls"
import { GLTFLoader } from 'GLTFLoader';


import Stats from '/three/examples/jsm/libs/stats.module.js' //stats for fps and memory... #debugging



const stats = Stats() // stats
document.body.appendChild(stats.dom) //stats


const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);
camera.layers.enable(1); //layer 1 is map object (map is layer 1, so the camera movement won't be affecter by non map objects)

let renderer;

let mapSize = 120; //mit einer mapSize von 120 * 120 und einer Chunkgrösse von 12*12 gibt es 10*10 Chunks --> 100 Chunks insgesamt (chunks sind jetzt ein wenig übertrieben, aber falls es später mal eine grosse map geben würde sind sie nützlich)
let chunkSize = 12;
let chunkXYToIndex;
let chunkList;

let particleSystemObjects = {};
let mapObject;

let mapData;

let playerIdToIndex = new Map();
let playerList = [];

//generate random nickname. If nickname cookie is already there, this random name will be overwritten by it
let ownNickname = "player" + Math.floor(Math.random()*1000);
if (getCookie("nickname") != undefined && getCookie("nickname") != "") ownNickname = getCookie("nickname");
document.getElementById("nickname").value = ownNickname;


let isKeyPressed = {keyCodes: {}}


let getColliderCoordsDebuggingX = [];
let getColliderCoordsDebuggingZ = [];
let getColliderCoordsDebuggingY = [];

//used to control player movement. Vector points in characterSpace where character wants to go -> moveplayer() uses those values
let moveVector = [0, 0];

//lookup table which hold the actions for keys
let keyMapList = {
  "KeyW": {exfunc: () => {if(playerList[0].isGrounded) moveVector[0] += -1}}, 
  "KeyS": {exfunc: () => {if(playerList[0].isGrounded) moveVector[0] += 1}}, 
  "KeyA": {exfunc: () => {if(playerList[0].isGrounded) moveVector[1] += -1}}, 
  "KeyD": {exfunc: () => {if(playerList[0].isGrounded) moveVector[1] += 1}}, 
  "Space": {exfunc: () => wantToJump()},
};

//movementType: welche art von bewegen. Entweder laufen oder fahren (wie bagger), jedes Objekt für ein Charaker
let movementDataPresets = [{movementType: 0, moveSpeed: 0.03, dampFactor: 0.2, inAirDampFactor: 0.02}, {movementType: 1, moveSpeed: 0.003, dampFactor: 1.05, inAirDampFactor: 1.02, turnSpeed: 0.04, currentSpeed: 0}, {movementType: 0, moveSpeed: 0.03, dampFactor: 0.2, inAirDampFactor: 0.02}, {movementType: 0, moveSpeed: 0.015, dampFactor: 0.2, inAirDampFactor: 0.02}, {movementType: 0, moveSpeed: 0.015, dampFactor: 0.2, inAirDampFactor: 0.02}]

//default is kettle
let movementData = movementDataPresets[0];

let modelPaths = ["models/wasserkocher/wasserkocher.glb", "models/toaster/toaster2.glb", "models/mixer/mixer.glb", "models/knife_block/knife_block.glb", "models/coffee_can/coffee_can.glb"];
let projectileModelPaths = ["", "models/toaster/toast.glb", "models/mixer/mixer_projectile.glb", "", ""] //when path is emtpy, those character doesn't have any projectiles

let playerSizes = [[0.4, 1, 0.4],  [0.5, 0.27, 0.5], [0.4, 0.9, 0.4], [0.4, 1, 0.4], [0.4, 1.1, 0.4]];
let playerSize = playerSizes[0]; //default is kettle

let controls; //used for pointerLockControls
let isInGame = false;
let isInMenu = true;

//where client moves dead player models to use them again when they are alive, out of the way (unloading and reloading would take too long)
let standByPos = [1, 20, 1];

//wantedDistanceToPlayer can be changed with mousewheel; wanted distance from camera to player Model
let wantedDistanceToPlayer = 4;
let maxDistanceToPlayer = 8;

//list with all active projectiles
let projectileList = [];

//object to store info to charge attacks (toaster, mixer and knifeblock uses this)
let chargeAttackObj = {timeStampForMainAttackCharge: 0, factor: 0.001, isCharging: false};

//vertexshader for particles
const particleVertexShader = `    
  varying vec3 vColor;
  attribute float lifeCycleFactor;
  varying float lifeCycleFactorForFragment;
  void main() {
    
    lifeCycleFactorForFragment = lifeCycleFactor;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = ( 300.0 / -mvPosition.z ) * (0.8 * lifeCycleFactor + 0.2);
    gl_Position = projectionMatrix * mvPosition;
  }`

//fragmentshader for particles
const particleFragmentShader = `	
  uniform sampler2D pointTexture;
  varying vec3 vColor;
  varying float lifeCycleFactorForFragment;
  void main() {
    gl_FragColor = vec4( vec3(1.0, 1.0, 1.0), 1.0 - lifeCycleFactorForFragment);
    gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord );
  }`



//erste 3 Zahlen für bounds, nächste 3 für playerPosition, nächste für extra abstand, damit man im nächsten frame nicht schon wieder drinn steckt und die letzte ziffer, damit man zurück zum rand des objekts kommt
//sechs verschiedene fälle, da das objekt an 6 verschiedenen seiten ankommen kann (würfel hat 6 seiten), collision system berücksichtigt keine Drehungen, deswegen ist die map auch überall rechtwinklig : )
const whereToMoveAtCollision = {
  0: [1, 0, 0, 0, 1, 1, -0.01, -1],
  1: [1, 0, 0, 0, 1, 1, 0.01, 1],
  2: [0, 1, 0, 1, 0, 1, -0.01, -1],
  3: [0, 1, 0, 1, 0, 1, 0, 1],
  4: [0, 0, 1, 1, 1, 0, -0.01, -1],
  5: [0, 0, 1, 1, 1, 0, 0.01, 1]
}



//anfang debugging

//used to get the coordinate of the point the player is looking at with the camera
function getCoordsOfRaycast(axis) {
  let lookVector = getLookDirectionOfObject(camera);
  
  if (axis == "x") return rayChecker(camera.position, lookVector, 0.01, 50).x;
  if (axis == "y") return rayChecker(camera.position, lookVector, 0.01, 50).y;
  return rayChecker(camera.position, lookVector, 0.01, 50).z;

}

//I used this function to get the bounds of each object to create the colliderList for the Serverscript
function takeCoordsAndPrintOut() {
  //let lookVector = getLookDirectionOfObject(camera);
  let point = playerList[0].model.position;


  point.x = Math.round(point.x * 100) / 100;
  point.y = Math.round(point.y * 100) / 100;
  point.z = Math.round(point.z * 100) / 100;



  console.log("[" + point.x +", " + point.y + ", " + point.z +"]");
  if (getColliderCoordsDebuggingX.length + getColliderCoordsDebuggingY.length + getColliderCoordsDebuggingZ.length < 1) return;
  let width = Math.abs(getColliderCoordsDebuggingX[1] - getColliderCoordsDebuggingX[0]);
  let depth = Math.abs(getColliderCoordsDebuggingZ[1] - getColliderCoordsDebuggingZ[0]);
  let height = Math.abs(getColliderCoordsDebuggingY[1] - getColliderCoordsDebuggingY[0]);

  let centerCoord = [(getColliderCoordsDebuggingX[1] + getColliderCoordsDebuggingX[0])/2, (getColliderCoordsDebuggingY[1] + getColliderCoordsDebuggingY[0])/2, (getColliderCoordsDebuggingZ[1] + getColliderCoordsDebuggingZ[0])/2];

  //console.log("width: " + width + ", depth: " + depth + ", height: " + height);
  //console.log("center Coord: " + centerCoord)
  let randomId = Math.floor(Math.random() * 10000);
  console.log("coll" + randomId + ": {position: ["+ centerCoord +"], size: [" + width +", " + height + ", " + depth + "]}");

  getColliderCoordsDebuggingX = [];
  getColliderCoordsDebuggingZ = [];
  getColliderCoordsDebuggingY = [];
}


let amlight = new THREE.AmbientLight(0xFFFFFF, 0.8);
let spotLight = new THREE.SpotLight(0xFFFFFF, 0);
let dilight = new THREE.DirectionalLight(0xFFFFFF, 1.4);
dilight.shadow.camera.top = 20;
dilight.shadow.camera.bottom = -45;
dilight.shadow.camera.left = -45;
dilight.shadow.camera.right = 50;

let dilightTarget = new THREE.Object3D();



scene.add(amlight, dilight, dilightTarget, spotLight);
//ende debugging

//attacking, mousedown = charging (only with some characters)
document.body.addEventListener("mousedown", (event) => { 
  if (isInMenu) return; //man soll nicht aus dem Menue-Kameraflugmodus angreifen können

  if (playerList[0].characterId == 0 || playerList[0].characterId == 4) {
    //kettle and coffee can


    let lookVector = getLookDirectionOfObject(camera).normalize();

    //send on
    ws.send(JSON.stringify({header: "mainAttack", data: {action: 1, rotationCamera: [lookVector.x, lookVector.y, lookVector.z], position: [camera.position.x, camera.position.y, camera.position.z], characterId: playerList[0].characterId}}));


  } else if (playerList[0].characterId == 1 || playerList[0].characterId == 2 ||playerList[0].characterId == 3) {
    //toaster mixer and knife_block

    //charge factor -> set timestamp
    chargeAttackObj.timeStampForMainAttackCharge = Date.now();
    chargeAttackObj.isCharging = true;
  } 
});

//attacking, mouseup = charge done, sending it to the server
document.body.addEventListener("mouseup", (event) => { 
  if (isInMenu) return; //man soll nicht aus dem Menue-Kameraflugmodus angreifen können

  
  let lookVector = getLookDirectionOfObject(camera).normalize(); 
  let bodyVector = getLookDirectionOfObject(playerList[0].model).normalize();


  if (playerList[0].characterId == 0 || playerList[0].characterId == 4) {
    //kettle and coffee can


    //send off
    ws.send(JSON.stringify({header: "mainAttack", data: {action: 0, characterId: playerList[0].characterId}})); //action: 1 = start shooting, action: 0 = stop shooting


  } else if (playerList[0].characterId == 1 || playerList[0].characterId == 2 || playerList[0].characterId == 3) {
    //toaster and mixer

    //charge factor -> calculate difference, send attack
    chargeAttackObj.isCharging = false;
    let velocityFactor = (Date.now() - chargeAttackObj.timeStampForMainAttackCharge)*chargeAttackObj.factor;
    if (velocityFactor > 1) velocityFactor = 1;
    ws.send(JSON.stringify({header: "mainAttack", data: {rotationBody: [bodyVector.x, bodyVector.y, bodyVector.z], rotationCamera: [lookVector.x, lookVector.y, lookVector.z], position: [camera.position.x, camera.position.y, camera.position.z], characterId: playerList[0].characterId, velocityFactor: velocityFactor}}));

  } 
});


//object builder for the player object, it holds all important information about a player
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
  this.velocity = new THREE.Vector3(0, 0, 0);
  this.isWalking = false;
  this.hp = hp; 
  this.isOnStandby = true;
  this.characterId = 0;
}

//function to change the selected character. Only possible when dead or new to the game. Export, so the function can be used outside of the script (script is a module) and accessed via html buttons
export function changeSelectedCharacter(characterId) {

  //you can only change characters if your not in the game
  if (isInGame) return;

  changeToCharacterMenu(); //menu goes back to home menu

  playerList[0].characterId = characterId;

  //change movement presets (speed, sort of movement)
  movementData = movementDataPresets[characterId];

  //change playerSize
  playerSize = playerSizes[characterId];

  //change look and models
  loadBetterModel(modelPaths[characterId], playerList[0].id, playerList[0].position, false);


  //send message to server
  ws.send(JSON.stringify({header: "changedCharacter", data: {characterId: characterId}}));
}

//creates a blue sky with a cubemap
async function createSkybox() {
  const loader = new THREE.CubeTextureLoader();
  loader.setPath('texture/');
  const cubeTex = loader.load( [
    "3right_2.png", "3right_2.png", "4up.png", "5down.png", "0front_2.png", "3right_2.png"
  ])
  scene.background = cubeTex;

  //add sun texture
  /*
  const sunMap = new THREE.TextureLoader().load( 'texture/sunTex.png' );
  const sunMaterial = new THREE.SpriteMaterial( { map: sunMap } );

  const sunSprite = new THREE.Sprite( sunMaterial );
  scene.add( sunSprite );
  moveObject(sunSprite, [-80, 80, 84.19]);
  sunSprite.scale.set(20, 20, 1);
  */
}

//used to create the transparent effect on the glass. Blender does not support this, so the matieral has to be edited manually for the windows. 
function applyChangesToAllChildren(objects, layer, alpha, shouldCastShadows) {
  objects.forEach((object) => {
    //changes here
    
    object.layers.set(layer);

    if (object.name.indexOf("transparent") > -1) {
      object.material.transparent = true;   
      object.material.opacity = alpha;  
    } else {
      if (shouldCastShadows == undefined) shouldCastShadows = false;
      object.castShadow = shouldCastShadows;
      object.receiveShadow = true;
      
    }

    if (object.children.length != 0) {

      applyChangesToAllChildren(object.children, layer, alpha, shouldCastShadows)
    }
  })
}

document.getElementById("ultraGraphics").addEventListener("click", () => {
  addGltfToScene("models/kitchen_optimized_2.glb");
  dilight.intensity = 0;
})

//loads kitchen / map
function addGltfToScene(file) {
  if (mapObject != undefined) scene.remove(mapObject);
  document.getElementById("loadingScreen").style.display = "block";

  const loader = new GLTFLoader();
  loader.load(file, function ( gltf ) { //models/kitchen.glb
    gltf.scene.scale.set(5, 5, 5);
    moveObject(gltf.scene, [30, 4, 40]);
    scene.add(gltf.scene);
    mapObject = gltf.scene
    gltf.scene.castShadow = true;
    gltf.scene.receiveShadow = true;
    gltf.scene.layers.set(1);
    applyChangesToAllChildren(gltf.scene.children, 1, 0.2, true); //layer 1 means map

    renderer.shadowMap.needsUpdate = true;

    document.getElementById("loadingScreen").style.display = "none";
    
  })
}

//moves the player
function movePlayer(vector, playerObj) {


  //used for future animations
  playerList[0].isWalking = true;


  if (movementData.movementType == 0) {
    
    let lookVector = getLookDirectionOfObject(playerObj);

    playerList[0].velocity.add(new THREE.Vector3(lookVector.x * movementData.moveSpeed * vector[0] +lookVector.z * movementData.moveSpeed * vector[1], 0, lookVector.z * movementData.moveSpeed* vector[0] + -lookVector.x * movementData.moveSpeed* vector[1]));
  
  } else if(movementData.movementType == 1) {

    //turn player if needed
    let currentAngleOfBody = new THREE.Euler(0, 0, 0, "YXZ");

    //temp. removed camera rotation
    //let currentAngleOfCamera = new THREE.Euler(0, 0, 0, "YXZ");

    currentAngleOfBody.setFromQuaternion(playerObj.quaternion);
    //currentAngleOfCamera.setFromQuaternion(camera.quaternion);

    //when you drive back, the steering should flip, as if you are in a car
    if (vector[0] <= 0) vector[1] = vector[1] * -1;

    currentAngleOfBody.y += vector[1] * movementData.turnSpeed;
    //currentAngleOfCamera.y += vector[1] * movementData.turnSpeed;

    if (vector[1] != 0) {
      let quat = playerObj.quaternion;
      ws.send(JSON.stringify({header: "rotateevent", data: {rotation: [quat.x, quat.y, quat.z, quat.w], lookVector: getLookDirectionOfObject(camera), cameraPos: [camera.position.x, camera.position.y, camera.position.z]}}))
    }



    playerObj.quaternion.setFromEuler(currentAngleOfBody);
    //camera.quaternion.setFromEuler(currentAngleOfCamera);


    //add velocity if needed
    movementData.currentSpeed += movementData.moveSpeed * vector[0];
    
  }
 
}

//checks if player is colliding with some object on the map
function checkPlayerCollision(afterMove) {
  let playerBounds = getBoxBounds(afterMove, playerSize);

  let chunksToCheck = findChunkWithCoord([afterMove[0], afterMove[2]], true);
  
  playerList[0].isGrounded = false;
  //spieler landet auf dem Boden
  let groundHeight = 0.331;
  if (afterMove[1]-playerSize[1]*0.5 <= groundHeight) {

    playerList[0].isGrounded = true;

    playerList[0].model.position.y = playerSize[1]*0.5 + groundHeight; //debugging ground height
    playerList[0].position[1] = playerSize[1]*0.5 + groundHeight;

  }
  
  chunksToCheck.forEach((chunk) => {
    chunk = chunkList[chunk];

    Object.keys(chunk.objects).forEach((key) => {
      let objectToCheck = chunk.objects[key];
      let bounds = getBoxBounds(objectToCheck.position, objectToCheck.size);


      let colliding = doBoxesCollide(playerBounds, bounds);
      if (colliding) { //part of player is inside object
        if (objectToCheck.actionOnCollision == "collide" || objectToCheck.actionOnCollision == undefined) {
          let disBounds = [];
          for (var i = 0; i<3; i++) {
            disBounds[2*i] = Math.abs(bounds[2*i]-playerBounds[2*i+1]);
            disBounds[2*i+1] = Math.abs(bounds[2*i+1]-playerBounds[2*i]);
          }
          let smallestDis = Math.min(...disBounds);
          let index = disBounds.indexOf(smallestDis);
          if (index == 3) { //landed / standing on something
            playerList[0].isGrounded = true;
          } else if (index == 0 || index == 1) {
            //touching in x axis, velocity of x axis is set to 0
            playerList[0].velocity.x = 0;
          } else if (index == 4 || index == 5) {
            //touching in z axis,velocity of z axis is set to 0
            playerList[0].velocity.z = 0;
          }
          let moveMap = whereToMoveAtCollision[index]
          bounds[index] +=  moveMap[6];

          let newPos = [afterMove[0] * moveMap[3] + bounds[index] * moveMap[0] + playerSize[0] * 0.5 * moveMap[0] * moveMap[7], afterMove[1] * moveMap[4] + bounds[index] * moveMap[1] + playerSize[1] * 0.5 * moveMap[1] * moveMap[7], afterMove[2] * moveMap[5] + bounds[index] * moveMap[2] + playerSize[2] * 0.5 * moveMap[2] * moveMap[7]];
          
          playerList[0].position = newPos;
          afterMove = newPos; //falls man an mehreren objekten gleichzeitig ankommt, soll man auch von beiden beeinflusst werden. Somit muss die neue aftermove festgelegt werden
          
          moveObject(playerList[0].model, newPos);
        } else if (objectToCheck.actionOnCollision == "applyForce") { //for example jump pads
          //console.log("on jump pad");
          if (playerList[0].isGrounded) {
            
            playerList[0].velocity = new THREE.Vector3(...objectToCheck.forceVector);

            playerList[0].isGrounded = false;
          }

        } else if (objectToCheck.actionOnCollision == "stairs") { //stairs need special collider

        }
      }
    });
  });
}

//creates the playerModel
function createPlayerModel(pos) {
  
  const geometry = new THREE.BoxGeometry(...playerSize);
  const material = new THREE.MeshStandardMaterial( {color: 0xFFFFFF} );
  const cube = new THREE.Mesh( geometry, material );
  scene.add( cube );
  cube.castShadow = true;
  cube.receiveShadow = true;
  moveObject(cube, pos);
  return cube;
}

//first, the dummy model gets loaded, only after that, the real model is loading, wich takes some time (around 100ms). In this tame, the code already needs an model to perform rotations, therefore -> dummymodel before
function loadBetterModel(modelPath, playerId, pos, shouldCreateCameraControl, rotation) {
  //console.log(modelPath);
  const loader = new GLTFLoader();
  loader.load(modelPath, function ( gltf ) {
    gltf.scene.scale.set(0.2, 0.2, 0.2);
    scene.add(gltf.scene);

    applyChangesToAllChildren(gltf.scene.children, 0, 1, false);

    
    moveObject(gltf.scene, pos);
    
    
    scene.remove(playerList[playerIdToIndex.get(playerId)].model);
    playerList[playerIdToIndex.get(playerId)].model = gltf.scene;
    
    if (shouldCreateCameraControl) {
      createCameraControl(rotation); //createCameraControl ist hier und nicht in der Nachrichtsankunft, da der loader ziemlich viel Zeit braucht. createCameraControl braucht aber das zeugs vom loader 
    }
    playerList[playerIdToIndex.get(playerId)].hpModel = createFloatingHp(playerId);
  })


}

//this function is from: https://www.w3schools.com/js/js_cookies.asp. It sets a cookie
function setCookie(cname, cvalue, exdays) {
  const d = new Date();
  d.setTime(d.getTime() + (exdays*24*60*60*1000));
  let expires = "expires="+ d.toUTCString();
  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

//this function is from: https://www.w3schools.com/js/js_cookies.asp. It gets a specified cookie
function getCookie(cname) {
  let name = cname + "=";
  let decodedCookie = decodeURIComponent(document.cookie);
  let ca = decodedCookie.split(';');
  for(let i = 0; i <ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

//create the playerObject and adds it to the playerList
function createPlayer(pos, id, hp, myPlayer, rotation) {
  let index = playerList.length;
  if (playerIdToIndex.get(id) != undefined) return;
  if (myPlayer) index = 0;


  playerIdToIndex.set(id, index);
  playerList[index] = new player(id, pos, createPlayerModel(pos), hp);
  loadBetterModel("models/wasserkocher/wasserkocher.glb", id, pos, myPlayer, rotation); //loads the real model, takes longer so a dummy model gets loaded first for movement (only few millisec)
  //console.log("loading model");

}

//not used yet, later it should update animations
function updateAnimations() {
  playerList.forEach(playerInList => {
    if (!playerInList.isGrounded) { //jump pose

    } else if (playerInList.isWalking) { //walking animation
      //mixer.update(0.02);
      playerInList.isWalking = false;
    } else {

    }

  });
}

//used by the collision detection. Checks if to boxes collide / overlap
function doBoxesCollide(box1, box2) {
  let horizontalPlaneTouch = (box1[1] >= box2[0] && box1[5] >= box2[4] && box1[0] <= box2[1] && box1[4] <= box2[5]); //nur 2d, deshalb das gleiche nochmal im vertikalen
  let verticalPlaneTouch = (box1[1] >= box2[0] && box1[3] >= box2[2] && box1[0] <= box2[1] && box1[2] <= box2[3]);
  return (horizontalPlaneTouch && verticalPlaneTouch);
}

//return the bound of a cube with given position and size
function getBoxBounds(position, dimensions) {
  let box = [];
  box[0] = position[0] - dimensions[0] * 0.5;
  box[1] = position[0] + dimensions[0] * 0.5;
  box[2] = position[1] - dimensions[1] * 0.5;
  box[3] = position[1] + dimensions[1] * 0.5;
  box[4] = position[2] - dimensions[2] * 0.5;
  box[5] = position[2] + dimensions[2] * 0.5;

  return box;
}

//removes a player, deletes the model and all other data of the player
function removePlayer(id) {
  //console.log("removed player");
  
  let index = playerIdToIndex.get(id);

  scene.remove(playerList[index].model);

  removeParticleSystem(playerList[index].particleSystemId);


  playerIdToIndex.delete(id);
  playerList.splice(index, 1);
  
  //Liste hat sich verschoben, deshalb muss die Id zu Index Map neu erstellt werden
  recalcPlayerMap();
}

//tells the server, that the player wants to jump
function wantToJump() {
  //console.log(playerList[0].isGrounded);
  if (!playerList[0].isGrounded) return;
  playerList[0].isGrounded = false;
  playerList[0].velocity.add(new THREE.Vector3(0, 0.1, 0)); //speedmode
  playerList[0].model.position.y += 0.01;
}

//used to change the distance from the camera and player
function mouseWheelEvent(event) {
  wantedDistanceToPlayer += event.deltaY * 0.005;
  if (wantedDistanceToPlayer < 0) wantedDistanceToPlayer = 0;
  if (wantedDistanceToPlayer > maxDistanceToPlayer) wantedDistanceToPlayer = maxDistanceToPlayer;
}

//return the direction in THREE.Vector3 where the object is looking at
function getLookDirectionOfObject(object) {
  let lookVector = new THREE.Vector3;
  object.getWorldDirection(lookVector);
  return lookVector;
}

//sets up camera controls with pointerlock controls
function createCameraControl(rot) {
  let quaternion = new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]);

  camera.setRotationFromQuaternion(quaternion);
  playerList[0].model.setRotationFromQuaternion(quaternion);

  controls = new PointerLockControls( camera, document.body, () => {if(movementData.movementType == 0) return playerList[0].model}, function(quat) {
    //rotation an server schicken

    ws.send(JSON.stringify({header: "rotateevent", data: {rotation: [quat.x, quat.y, quat.z, quat.w], lookVector: getLookDirectionOfObject(camera), cameraPos: [camera.position.x, camera.position.y, camera.position.z]}}))
  });
  //moveObject(camera, [playerList[0].model.position.x, 3, playerList[0].model.position.z])

  document.getElementById("playButton").addEventListener( 'click', function () {
    
    controls.lock();
  
  });

  window.addEventListener("wheel", event => mouseWheelEvent(event));

  controls.addEventListener('lock', function () {
    document.getElementById("menue").style.display = 'none';
    isInGame = true;
    isInMenu = false;
    camera.position.set(playerList[0].model.position.x, playerList[0].model.position.y, playerList[0].model.position.z);
    //console.log(camera.position);
    camera.quaternion.copy(playerList[0].model.quaternion);
    
    if (playerList[0].isOnStandby) {
      ws.send(JSON.stringify({header: "joiningGame"}));

      let nickname = document.getElementById("nickname").value;
      
      if (nickname.length > 16) nickname = nickname.substr(0, 15) + "...";

      document.getElementById("nickname").disabled = true;
      //console.log(nickname);
      if (nickname == "" || nickname == undefined) nickname = ownNickname;
      ownNickname = nickname;
      setCookie("nickname", ownNickname, 7);

      console.log("sended nickname: " + ownNickname);
      ws.send(JSON.stringify({header: "sendingName", data: {name: ownNickname}}));


    } 

    playerList[0].model.visible = true;
  } );

  controls.addEventListener('unlock', function () {
    document.getElementById("menue").style.display = 'block';
    isInMenu = true;
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

//if someone dies or joins the game, he gets put to standby and is ready to join the game (again)
function putToStandby (playerId, isMyPlayer) {
  let index = playerIdToIndex.get(playerId);
  playerList[index].model.visible = false
  moveObject(playerList[index].model, standByPos);
  playerList[index].isOnStandby = true;
  playerList[index].hp = 100; //debugging, später  noch anpassbare maxHp


  if (isMyPlayer) {
    document.getElementById("reloadContainer").style.display = "none";
    controls.unlock();
    isInGame = false;
  }
}

//if player presses on PLAY, it puts the player in the game by telling it the server
function putInGame(playerId, isMyPlayer, spawnPos, characterId) {
  let index = playerIdToIndex.get(playerId);
  //console.log(index);
  //console.log(playerList[index]);
  let playerObj = playerList[index];

  moveObject(playerObj.model, spawnPos);

  //console.log("moving...")
  playerList[index].isOnStandby = false;
  playerList[index].hp = 100; //debugging, später  noch anpassbare maxHp

  if (isMyPlayer) {
    moveObject(camera, [playerObj.position[0], playerObj.position[1] + playerSize[1]*0.25, playerObj.position[2]]);
    updateOwnHp();
    playerList[index].model.visible = true;

  } else {
    playerList[index].model.visible = true;
    //console.log("loading stuff");
    loadBetterModel(modelPaths[characterId], playerId, spawnPos, false);
  }

  updateFloatingHp(playerList[index].hp, playerId);
  
}

//manages all physics of player. Later, this has to be done in the server with the collision detection
function applyPhysics() {
  //console.log(playerList[0].isGrounded);
  let dampening;

  if (playerList[0] == undefined) return;
  if (playerList[0].isGrounded) { 
    //player is on the ground
    playerList[0].velocity.y = 0;
    dampening = movementData.dampFactor;
  } else {
    //player is in the air
    dampening = movementData.inAirDampFactor;
  }

  if (playerList[0].velocity.length > 0.001) return;

  playerList[0].velocity.y -= 0.005; //gravity, später noch anders (debugging)

  if (movementData.movementType == 0) {
    playerList[0].velocity.x += playerList[0].velocity.x * -dampening; //keine ahnung wie viel #debugging
    playerList[0].velocity.z += playerList[0].velocity.z * -dampening; //keine ahnung wie viel #debugging  
  } else if (movementData.movementType == 1 && playerList[0].isGrounded) {
    
    let lookVector = getLookDirectionOfObject(playerList[0].model);
    playerList[0].velocity = new THREE.Vector3(lookVector.x * movementData.currentSpeed, playerList[0].velocity.y, lookVector.z * movementData.currentSpeed);

    movementData.currentSpeed = movementData.currentSpeed / dampening;
    
  }

  playerList[0].model.position.add(playerList[0].velocity); 
  playerList[0].position = [playerList[0].model.position.x, playerList[0].model.position.y, playerList[0].model.position.z];

  checkPlayerCollision(playerList[0].position);

  //hier 3rd person einbauen
  //moveObject(camera, [playerList[0].position[0], playerList[0].position[1]+playerSize[1]*0.25, playerList[0].position[2]]);

  ws.send(JSON.stringify({header: "walkevent", data: {position: playerList[0].position, velocity: [playerList[0].velocity.x, playerList[0].velocity.y, playerList[0].velocity.z], rotation: [playerList[0].model.quaternion.x, playerList[0].model.quaternion.y, playerList[0].model.quaternion.z, playerList[0].model.quaternion.w], isGrounded: false}}))
}

//calculated the beziercurve for the camera movement in the menu
function bezierPos(vectorList, factor) {
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

//debugging, now used for the camera flight in the menu
let flyTime = 0; //muss später noch durch deltaTime ersetzt werden
//ende debugging

//updated the position for the camera flight in the menu
function updateCameraFly() {
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

//calculates with raycasts, where the camera should be in the game
function getFarthestPossibleDistanceForCamera(startPos, direction, maxDistance) {

  let raycaster = new THREE.Raycaster();

  direction = new THREE.Vector3(direction[0], direction[1], direction[2]).normalize();
  startPos = new THREE.Vector3(startPos[0], startPos[1], startPos[2]);

  raycaster.set(startPos, direction, 0.1, maxDistance);
  raycaster.layers.set(1); //should only hit map objects, not projectiles or other players
  
  const intersects = raycaster.intersectObjects(scene.children);
  if (intersects.length > 0) {
    //-0.2, camera clips through objects a bit
    
    if (intersects[0].distance)
    if (intersects[0].distance < maxDistance )return intersects[0].distance;
  }

  return maxDistance;
}

//used to move the camera during the gamne
function moveSmoothCamera() {
  //only 3rd person camera, if player is in game. If not, the camera is flying in circles around the map in the menu
  if (!isInGame) return;

  //console.log(playerList[0].position);
  

  let angleCamera = new THREE.Euler(0, 0, 0, "YXZ");
  angleCamera.setFromQuaternion(camera.quaternion)
  let eulerList = [angleCamera.x, angleCamera.y, angleCamera.z];
  
  //those value are getting used multiple times, to make it more efficient, it only calculates it once
  let sin0 = Math.sin(eulerList[0]);
  let sin1 = Math.sin(eulerList[1]);
  let cos0 = Math.cos(eulerList[0]);
  let cos1 =  Math.cos(eulerList[1]);

  let coordsToCircleAround = [playerList[0].position[0], playerList[0].position[1] + 1, playerList[0].position[2]];

  let newCameraPos = new THREE.Vector3();

  newCameraPos.x = coordsToCircleAround[0] + sin1 * cos0;
  newCameraPos.z = coordsToCircleAround[2] + cos1 * cos0;
  newCameraPos.y = coordsToCircleAround[1] - sin0;

  let vectorToCamera = [newCameraPos.x - coordsToCircleAround[0], newCameraPos.y - coordsToCircleAround[1], newCameraPos.z - coordsToCircleAround[2]];
  let distanceToPlayer = getFarthestPossibleDistanceForCamera(coordsToCircleAround, vectorToCamera, wantedDistanceToPlayer);
  let extraSpacing = 0.5;
  let dampeningFactor;

  if (distanceToPlayer < extraSpacing + 1) {
    //camera is too close to player -> switch to 1. person view
    newCameraPos.x = playerList[0].model.position.x;
    newCameraPos.y = playerList[0].model.position.y + 0.35;
    newCameraPos.z = playerList[0].model.position.z;
    playerList[0].model.visible = false;
    
    dampeningFactor = 1;
  } else {
    //extraSpacing, so camera doesn't clip through objects
    distanceToPlayer -= extraSpacing; 

    //gets assigned at the end, so the distance is always 1 frame behind. Not really problematic because of the dampening of the camera position
    newCameraPos.x = coordsToCircleAround[0] + sin1 * cos0 * distanceToPlayer;
    newCameraPos.z = coordsToCircleAround[2] + cos1 * cos0 * distanceToPlayer;
    newCameraPos.y = coordsToCircleAround[1] - sin0 * distanceToPlayer;
    playerList[0].model.visible = true;


    dampeningFactor = 0.4;
  }

  //lerps between position where it should be and position where it is, so it is a bit smoother  
  camera.position.lerpVectors(camera.position, newCameraPos, dampeningFactor);

}

//removes specified particle system
function removeParticleSystem(id) {
  if (id == undefined) return;
  scene.remove(particleSystemObjects[id].particleObj);
  delete particleSystemObjects[id];

}

//updates all particles in each particle system
function updateParticles() {
  Object.keys(particleSystemObjects).forEach((key) => {
    let particleSystemType = particleSystemObjects[key].particleSystemType;
    let particleSystem = particleSystemObjects[key].particleObj;

    if (particleSystemType == 0) { //trails
      let positions = particleSystem.geometry.attributes.position.array;
      let lifeCycleFactor = particleSystem.geometry.attributes.lifeCycleFactor.array;

      let pointList = particleSystemObjects[key].pointList;

      const particleSize = particleSystemObjects[key].particleSize;

      
      for (var i = 0; i < positions.length / 3; i++) {
        if (pointList[i] == undefined) continue;

        positions[3*i + 0] = pointList[i][0];
        positions[3*i + 1] = pointList[i][1];
        positions[3*i + 2] = pointList[i][2];

        lifeCycleFactor[i] = (i / pointList.length) * particleSize;
      }

      particleSystem.geometry.attributes.lifeCycleFactor.needsUpdate = true;
      particleSystem.geometry.attributes.position.needsUpdate = true;    

    } else if (particleSystemType == 1) { //explosions, one time only

      let positions = particleSystem.geometry.attributes.position.array;
      let lifeCycleFactor = particleSystem.geometry.attributes.lifeCycleFactor.array;
      let velocities = particleSystem.geometry.attributes.velocities.array;
      let startTimeStamp = particleSystem.geometry.attributes.startTimeStamp.array; //individual timestamp, so some particles can be differemt sizes

      const dragFactor = particleSystemObjects[key].dragFactor;
      const gravityFactor = particleSystemObjects[key].gravityFactor;
      const uniformStartTimeStamp = particleSystemObjects[key].uniformStartTimeStamp; //time when particleSystem was created
      const particleSpeed = particleSystemObjects[key].particleSpeed; //time when particleSystem was created
      const particleSize = particleSystemObjects[key].particleSize;

      const currentTime = (Date.now() << 1) >>> 1; //damit currentTime weniger bits braucht und in einem 32 bit Float platz hat
      const timeFactor = particleSystemObjects[key].timeFactor;


      if ((currentTime - uniformStartTimeStamp) * timeFactor > 1) {
        //delete particle System, particle animation is at its end
        //console.log("removing explosion");
        removeParticleSystem(key);

      } else {
          
        for (var i = 0; i < positions.length / 3; i++) {
          positions[3*i + 0] += velocities[3*i + 0] * particleSpeed;
          positions[3*i + 1] += velocities[3*i + 1] * particleSpeed;
          positions[3*i + 2] += velocities[3*i + 2] * particleSpeed;

          velocities[3*i + 0] = velocities[3*i + 0] * (1-dragFactor);
          velocities[3*i + 1] = velocities[3*i + 1] * (1-dragFactor) - gravityFactor;
          velocities[3*i + 2] = velocities[3*i + 2] * (1-dragFactor);

          lifeCycleFactor[i] = (1-(currentTime-startTimeStamp[i])*timeFactor) * particleSize;
          if (lifeCycleFactor[0] < 0) lifeCycleFactor[i] = 0;        
        }

        particleSystem.geometry.attributes.lifeCycleFactor.needsUpdate = true;
        particleSystem.geometry.attributes.position.needsUpdate = true;    
        particleSystem.geometry.attributes.velocities.needsUpdate = true;

      }
    } else if (particleSystemType == 2) { //looping animations like flamethrower from kettle
      let positions = particleSystem.geometry.attributes.position.array;
      let lifeCycleFactor = particleSystem.geometry.attributes.lifeCycleFactor.array;
      let velocities = particleSystem.geometry.attributes.velocities.array;
      let startTimeStamp = particleSystem.geometry.attributes.startTimeStamp.array; //individual timestamp, so some particles can be differemt sizes
      let isVisible = particleSystem.geometry.attributes.isVisible.array;

      const particleSpeed = particleSystemObjects[key].particleSpeed;
      const coneLength = particleSystemObjects[key].coneLength;
      const playerId = particleSystemObjects[key].playerId;

      const currentTime = (Date.now() << 1) >>> 1;

      let particlesToCreate = 0;
      let localLookVector;

      const playerListIndex = playerIdToIndex.get(playerId);

          
      if (particleSystemObjects[key].active) { //button is being held down, player is attacking -> particles are needed
        particlesToCreate = 1;

        let lookVector = getLookDirectionOfObject(playerList[playerListIndex].model);
        
        localLookVector = new THREE.Vector3().copy(lookVector);
        let randomDirection = new THREE.Vector3().randomDirection().multiplyScalar(0.4);
        localLookVector.add(randomDirection).normalize();  

      }
          
      //for each particle in this particle system
      for (var i = 0; i< positions.length/3; i++) {
        let timeFactor = (particleSpeed * (currentTime - startTimeStamp[i])); //gives a number between 0 and 1, triangle graph

        if (isVisible[i] == 1) {
          //check if it should be deleted
          //console.log(timeFactor)
          if (timeFactor > 1) {
            isVisible[i] = 0; 
            lifeCycleFactor[i] = 0;

            positions[3*i + 0] = 0;
            positions[3*i + 1] = 0;
            positions[3*i + 2] = 0;

            continue;
          } 

          lifeCycleFactor[i] = timeFactor;

          positions[3*i + 0] = velocities[3*i + 0] * timeFactor * coneLength + playerList[playerListIndex].position[0];
          positions[3*i + 1] = velocities[3*i + 1] * timeFactor * coneLength + playerList[playerListIndex].position[1];
          positions[3*i + 2] = velocities[3*i + 2] * timeFactor * coneLength + playerList[playerListIndex].position[2];

        } else if(particlesToCreate > 0) {
          isVisible[i] = 1;
          lifeCycleFactor[i] = 2;

          positions[3*i + 0] = 0;
          positions[3*i + 1] = 0; //hier falls nötig offset anpassen
          positions[3*i + 2] = 0;

          velocities[3*i + 0] = -localLookVector.x;
          velocities[3*i + 1] = -localLookVector.y;
          velocities[3*i + 2] = -localLookVector.z;

          startTimeStamp[i] = currentTime;

          particlesToCreate -= 1;
        }
      }
      
      particleSystem.geometry.attributes.lifeCycleFactor.needsUpdate = true;
      particleSystem.geometry.attributes.position.needsUpdate = true;    
      particleSystem.geometry.attributes.velocities.needsUpdate = true;
    }
  });
}

//updates UI animations, (charging animation to attack)
function updateUIAnimations() {
  //console.log(chargeAttackObj.isCharging)
  if (chargeAttackObj.isCharging) {
    document.getElementById("chargeBar").style.width = (Date.now() - chargeAttackObj.timeStampForMainAttackCharge)*chargeAttackObj.factor * 180 + "px"; //*180, because its the maximum size the charge bar should take
  } else {
    document.getElementById("chargeBar").style.width = "0px";
  }
  //chargeAttackObj.timeStampForMainAttackCharge
}

//animate loop (like draw() in jsp5), 
function animate() {
  requestAnimationFrame(animate);
  checkInput();
  applyPhysics();

  updateAnimations();
  updateUIAnimations();

  updateCameraFly();
  moveSmoothCamera();
  
  stats.update() //stats for fps

  updateParticles();

  renderer.render(scene, camera);
};


//used to resize the aspect ratio of the camera when the window gets resized
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  //composer.setSize(window.innerWidth, window.innerHeight);

  camera.aspect = window.innerWidth / window.innerHeight;
  
  camera.updateProjectionMatrix();
  
};

//creates the scene when the game is loaded
function createScene(el) {
  renderer = new THREE.WebGLRenderer({canvas: el, antialias: true});
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;

  //composer = new EffectComposer( renderer );

  //const ssaoPass = new SSAOPass(scene, camera, false, true);
	//ssaoPass.kernelRadius = 0;
  //composer.addPass( ssaoPass );

  addGltfToScene("models/kitchen_optimized.glb");




  generateMap(mapData);
  resize();
  window.addEventListener('resize', resize);
  
  createListener();
  createSkybox();
  animate();
};

//used find out, in wich chunk the coords are, this function only converts the data to a string
function coordsToString(coords) {
  return coords[0] + " " + coords[1];
}

//used to find out, in which chunk the coordinates are
function findChunkWithCoord(coords2D, chunksAround) {
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

//generate the chunks at the beginning
function generateChunkMap() {
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

//moves a three js object to a specified position ([x, y, z])
function moveObject(object, position) {
  object.position.x = position[0];
  object.position.y = position[1];
  object.position.z = position[2];

};

//updates the health ui
function updateHealth(playerId, damage) {
  
  playerList[playerIdToIndex.get(playerId)].hp -= damage;
  
  if (playerIdToIndex.get(playerId) == 0) {
    //own player got hit
    updateOwnHp(); //ui healthbar
  } 

  updateFloatingHp(playerList[playerIdToIndex.get(playerId)].hp, playerId); //ingame healthbar

  //console.log(playerList[playerIdToIndex.get(playerId)].hp);

}

//creates the floating hp over the characters
function createFloatingHp(playerId) {

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

//updates the health ui in the game floating above the characters
function updateFloatingHp(hp, playerId) {  

  const hpRatio = hp / 100; //100 = maxHp, wird später noch geändert, soll nicht hardgecoded sein
  if (playerList[playerIdToIndex.get(playerId)].hpModel == undefined) return;
  playerList[playerIdToIndex.get(playerId)].hpModel.scale.set(hpRatio * 1.5, 0.3, 1);

}

//updates the static health bar ui in the html 
function updateOwnHp() {
  const maxHp = 100;
  document.getElementById("healthBar").style.width = (100*(playerList[0].hp / maxHp)).toString() + "%";
  document.getElementById("healthDisplay").innerHTML = playerList[0].hp;
}

//creates an object, used to create the dummyModel for the player
function createObject(object) {
  if (object.shape == "cube") { //only for debugging used
    const geometry = new THREE.BoxGeometry(object.size[0], object.size[1], object.size[2]);
    const material = new THREE.MeshStandardMaterial( {color: object.color} );
    const cube = new THREE.Mesh( geometry, material );
    scene.add( cube );
    cube.castShadow = true;
    cube.receiveShadow = true;
    moveObject(cube, object.position);

  } else if(object.shape == "plane") { //only for debugging used
    const geometry = new THREE.PlaneGeometry(object.size[0], object.size[1]);
    const material = new THREE.MeshStandardMaterial( {color: 0x707070} );
    
    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);
    plane.receiveShadow = true;
    plane.castShadow = false;
    moveObject(plane, object.position);
    plane.lookAt(new THREE.Vector3(object.orientation[0], object.orientation[1], object.orientation[2]));

  } else if(object.shape == "forcePad") { 
    const loader = new GLTFLoader();
    loader.load("models/jump_pad.glb", function ( gltf ) {
      gltf.scene.scale.set(0.4, 0.4, 0.4);
      scene.add(gltf.scene);

      applyChangesToAllChildren(gltf.scene.children, 0, 1, false); //for shadows
      moveObject(gltf.scene, object.position);
    })

  } else {
    //console.log("can't create object");
  }
};

//generates the map with the map data from the server
function generateMap(mapObject) {
  generateChunkMap();

  //generate Ground Plane
  //createObject({shape: "plane", size: [mapSize, mapSize], position: [mapSize/2, 0, mapSize/2], orientation: [mapSize/2, 1, mapSize/2]});

  //go through every object in the mapObject.objects
  Object.keys(mapObject.objects).forEach((key) => {
    let object = mapObject.objects[key];

    //findet den Index des Chunks heruas, wo sich das Objekt befindet
    let chunkIndex = findChunkWithCoord([object.position[0], object.position[2]]);
    //console.log(chunkIndex);

    //das Objekt wird nun dem richtigen Chunk hinzugefügt
    if (object.id == undefined) object.id = Math.floor(Math.random() * 10000);
    chunkList[chunkIndex].objects["object" + object.id] = object;

    //das Objekt wird nun erstellt
    if (object.isVisible) createObject(object);
  });

};

//creates the listeners for the key inputs
function createListener() {
  //console.log("listener activated");
  document.body.addEventListener("keydown", (event) => {
    isKeyPressed.keyCodes[event.code] = true;
    

  })
  document.body.addEventListener("keyup", (event) => {
    isKeyPressed.keyCodes[event.code] = false;

    if (event.code == "KeyR") ws.send(JSON.stringify({header: "reloading"}));

    //y and z are swapped because QWERTZ
    if (event.code == "KeyX") getColliderCoordsDebuggingX[getColliderCoordsDebuggingX.length] = getCoordsOfRaycast("x");
    if (event.code == "KeyY") getColliderCoordsDebuggingZ[getColliderCoordsDebuggingZ.length] = getCoordsOfRaycast("z");
    if (event.code == "KeyZ") getColliderCoordsDebuggingY[getColliderCoordsDebuggingY.length] = getCoordsOfRaycast("y");
    if (event.code == "KeyT") takeCoordsAndPrintOut();
  })
}

//checks each frame, if a key is held down and executes the function if specified
function checkInput() {
  if (!isInGame || isInMenu) return;


  Object.keys(isKeyPressed.keyCodes).forEach((keyId) => {
    let key = isKeyPressed.keyCodes[keyId];
    if(key) {
      if (keyMapList[keyId] != undefined)
      keyMapList[keyId].exfunc();
    }
  })

  //nur bewegen falls man sich auch bewegen will
  if (moveVector[0] == 0 && moveVector[1] == 0) return;

  let normalizedMoveVector = new THREE.Vector2(moveVector[0], moveVector[1]).normalize();
  movePlayer([normalizedMoveVector.x, normalizedMoveVector.y], playerList[0].model);


  moveVector = [0, 0];
}

//recalculated the playerMap if one joined or left
function recalcPlayerMap() {
  playerIdToIndex.clear();
  let counter = 0;
  playerList.forEach((item) => {
    playerIdToIndex.set(item.id, counter);
    counter++;
  });
}

//returns a list of all data with the same key (does not matter where in the object it is)
function getIdsFromObjectList(objectList, keyToFind) {
  let keyList = [];
  //console.log(objectList);
  objectList.forEach((objectInList) => {
    if (objectInList[keyToFind] == undefined) return;
    keyList.push(objectInList[keyToFind])
  })
  return keyList
}


//anfang debugging

moveObject(dilight, [-20, 40, 44.19]);

dilight.castShadow = true;
dilight.shadow.mapSize.width = 2048;
dilight.shadow.mapSize.height = 2048;
moveObject(dilightTarget, [[-20, 0, 30]])
dilight.target.position.set(35, 0, 30);
dilight.target.updateMatrixWorld();
dilight.shadow.normalBias = 0.02; //shadow doesn't have stripes with that, but horizontal and vertical get shifted a bit

moveObject(spotLight, [25.04, 13.82, 22.98]);
spotLight.target.position.set(25.04, 0, 22.98);
spotLight.target.updateMatrixWorld();

spotLight.angle = 0.4;
spotLight.penumbra = 0.7;

//ende debugging


//creates a new particle system object
function createParticleObject(particleSystemOptions) {
  
  let particleGeometry = new THREE.BufferGeometry();
  let uniforms = {
    pointTexture: {value: new THREE.TextureLoader().load(particleSystemOptions.texture)}
  };

  const shaderMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms, //attribute float size; varying vec3 vColor;
    vertexShader: particleSystemOptions.vertexShader, 
    fragmentShader: particleSystemOptions.fragmentShader,
    transparent: true,
    depthWrite: false
  });

  const particleCount = particleSystemOptions.maxParticles;

  const positions = [];
  const velocities = [];
  const startTimeStamp = [];
  const isVisible = [];
  const lifeCycleFactor = [];


  for (var i = 0; i<particleCount; i++) {

    positions.push(0); 
		positions.push(0);
		positions.push(0);

    lifeCycleFactor.push(0);

    if (particleSystemOptions.particleSystemType == 1) {

      //generate random angle from 0 tp 360 degrees (here in radians). This will give an explosion circle
      let randomAngle = Math.random()*6.28318531 //2*PI etwa 6.28318531

      velocities.push(Math.cos(randomAngle)); 
      velocities.push(0);
      velocities.push(Math.sin(randomAngle));  

      startTimeStamp.push(((Date.now() << 1) >>> 1)-200); //this converts 64bit number to 32bits. Bits at beginning get cut off but does not matter, because it will not run for years, so 32bit doesn't overflow (normally it would use 41 bits)

    } 
    if (particleSystemOptions.particleSystemType == 2) {
      velocities.push(0); //placeholder
      velocities.push(0);
      velocities.push(0);  

      startTimeStamp.push(0); //placeholder
      isVisible.push(0); //0 = not visible
    }
  } 


  particleGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute(positions, 3)); //3 means 3 per particle (32 bits is the maximum :| )
  particleGeometry.setAttribute( 'lifeCycleFactor', new THREE.Float32BufferAttribute(lifeCycleFactor, 1));

  if (particleSystemOptions.particleSystemType != 0) {
    particleGeometry.setAttribute( 'velocities', new THREE.Float32BufferAttribute(velocities, 3));
    particleGeometry.setAttribute( 'startTimeStamp', new THREE.Float32BufferAttribute(startTimeStamp, 1));  
  }

  if (particleSystemOptions.particleSystemType == 2) {
    particleGeometry.setAttribute( 'isVisible', new THREE.Float32BufferAttribute(isVisible, 1));
  }

  let particleSystem = new THREE.Points( particleGeometry, shaderMaterial);
  particleSystem.frustumCulled = false; //so its visible, even if the main coordinate is not

  scene.add(particleSystem);
  moveObject(particleSystem, particleSystemOptions.position);
  
  return particleSystem;
}

//creates a new projectile object
function createNewProjectile(position, projectileType, id, index, velocity) {
  //console.log(id);
  const trailId = uuidv4();
  const maxParticles = 10;
  particleSystemObjects[trailId] = {id: trailId, particleSize: 0.2, particleSystemType: 0, pointList: [], maxPointListLength: maxParticles, particleObj: createParticleObject({texture: "texture/wasserdampf.png", vertexShader: particleVertexShader, fragmentShader: particleFragmentShader, maxParticles: maxParticles, particleSystemType: 0, position: [0, 0, 0]})}
  //console.log(particleSystemObjects);
  return {position: position, type: projectileType, id: id, trailId: trailId, model: createProjectileModel(projectileType, index, velocity)};
}

//creates a new projectile model
function createProjectileModel(projectileType, index, velocity) {

  let modelPath = projectileModelPaths[projectileType];
  if (modelPath == "" || modelPath == undefined) modelPath = "model/dummy_projectile.glb";

  const loader = new GLTFLoader();
  loader.load(modelPath, function ( gltf ) {
    //gltf.scene.scale.set(1, 1, 1);
    scene.add(gltf.scene);

    let rotationMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(...velocity).normalize(), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    let newQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
    gltf.scene.quaternion.copy(newQuaternion);

    scene.remove(projectileList[index].model)
    projectileList[index].model = gltf.scene;
  });
  
  //this will be executed first, because the loader is asynchronous, this is only a placeholder
  const geometry = new THREE.SphereGeometry( 0.2, 8, 4);
  const material = new THREE.MeshBasicMaterial( { color: 0xffff00 } );
  const sphere = new THREE.Mesh( geometry, material );
  scene.add( sphere );
  return sphere;
}

//updates all projectiles in the scene and also adds and deletes
function updateProjectiles(serverProjectileList) {
  //forEach item in projectileList, check if it is in the copy of list, if yes delete it from the copied list, if no, create it in the actual list. If there are items left in copied list, delete them in the actual list

  //generateIdList
  let serverIdsList = getIdsFromObjectList(serverProjectileList, "id");
  let projectileIdsList = getIdsFromObjectList(projectileList, "id");


  //list for all projectiles that should be deleted at the end
  let projectileIdsListCopy = projectileIdsList;


  for(var i = serverIdsList.length-1; i>-1; i -= 1) { //starts from end of the list, so items in projectileIdsListCopy can be deleted easily
    let id = serverIdsList[i];

    let indexOfFoundId = projectileIdsList.indexOf(id)
    if (indexOfFoundId > -1) {
      //projectile is already in list

      //change values in actual list
      projectileList[indexOfFoundId].position = serverProjectileList[i].position;
      //console.log(projectileList[indexOfFoundId].model);
      moveObject(projectileList[indexOfFoundId].model, projectileList[indexOfFoundId].position);

      let rotationMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(...serverProjectileList[i].velocity).normalize(), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
      let newQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
      projectileList[indexOfFoundId].model.quaternion.copy(newQuaternion);

      //update points in trail particle object
      particleSystemObjects[projectileList[indexOfFoundId].trailId].pointList.push(projectileList[indexOfFoundId].position);

      //check if there are to many points in list
      if (particleSystemObjects[projectileList[indexOfFoundId].trailId].pointList.length > particleSystemObjects[projectileList[indexOfFoundId].trailId].maxPointListLength) {
        //too many items in list, delete first one
        particleSystemObjects[projectileList[indexOfFoundId].trailId].pointList.shift();
      }

      
      //delete item from copylist
      projectileIdsListCopy.splice(indexOfFoundId, 1);

    } else {
      //projectile is not yet in list
      
      //create and add item in list
      projectileList.push(createNewProjectile(serverProjectileList[i].position, serverProjectileList[i].constants.projectileType, id, projectileList.length, serverProjectileList[i].velocity))
      //console.log("created: " + id);
    }
  }
  //all projectiles left in projectileIdsListCopy should be deleted (maybe they hit a player or object)
  for (var i = projectileList.length-1; i > -1; i -= 1) {
    let projectileToCheck = projectileList[i];

    if (projectileIdsListCopy.indexOf(projectileToCheck.id) > -1) {
      //this projectile should be deleted

      //delete trail
      removeParticleSystem(projectileList[i].trailId);

      //add explosion particles
      const particleId = uuidv4();
      particleSystemObjects[particleId] = {particleSize: 1, particleSpeed: 0.01, timeFactor: 0.001,dragFactor: 0.01, gravityFactor: 0.0, uniformStartTimeStamp: (Date.now() << 1) >>> 1, id: particleId, particleSystemType: 1, particleObj: createParticleObject({texture: "texture/wasserdampf.png", vertexShader: particleVertexShader, fragmentShader: particleFragmentShader, maxParticles: 32, particleSystemType: 1, position: projectileList[i].position})}
      //console.log(particleSystemObjects);
      //delete projectile
      scene.remove(projectileList[i].model);
      projectileList.splice(i, 1);


    }
  }
}


//raycasts for easy creation of colliders, #debugging
function rayChecker(startVec, dirVec, near, far) {

  let raycaster = new THREE.Raycaster();
  raycaster.set(startVec, dirVec, near, far);
  raycaster.layers.set(1);
  const intersects = raycaster.intersectObjects(scene.children);

  if (intersects.length > 0) {
    const geometry = new THREE.SphereGeometry(0.3, 5, 5);
    const material = new THREE.MeshBasicMaterial( { color: 0xffff00 } );
    const sphere = new THREE.Mesh( geometry, material );
    scene.add( sphere );
    let index = 1;
    while (intersects[0].distance < 1 && index < intersects.length) {
      intersects[0] = intersects[index];
      index += 1;
    }
    if (intersects[0].distance < 1) intersects[0] = intersects[1];
    sphere.position.set(intersects[0].point.x, intersects[0].point.y, intersects[0].point.z);
    //console.log(sphere.position);
    return intersects[0].point;
  }
}

//erstellt eine zufällige Id für einen neuen Client (es wäre theoretisch möglich 2 gleiche uuidv4s zu erstellen...), Funktion nicht von mir, quelle: https://ably.com/blog/web-app-websockets-nodejs
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}




//particleTesting();

/*end of THREE code

********************************************************************************************************************

start of websocket code*/

//if true, it connects to a localhost, if false, it connects to the public server
const shouldConnectToLocalHost = false;

let ws;


if (shouldConnectToLocalHost) {
  ws = new WebSocket("ws://localhost:7031");
} else {
  ws = new WebSocket("wss://kitchenwar-backend.onrender.com");
}

ws.onopen = function(event) {
  console.log("connection to server established");
};

//message arrived from the server
ws.onmessage = (event) => {
  let message = JSON.parse(event.data);
  if(message.header == "walkevent"){
    //a player moved, position gets updated
    let index = playerIdToIndex.get(message.data.id);
    if (index == 0) return;
    
    let movedPlayer = playerList[index];
    movedPlayer.isWalking = true;
    movedPlayer.isGrounded = message.data.isGrounded;

    moveObject(playerList[index].model, message.data.position)
    playerList[index].position = message.data.position;

  } else if(message.header == "rotateevent") {
    //a player rotated, rotation gets applied
    if (playerIdToIndex.get(message.data.playerId) == 0) return; //der eigene charakter muss nicht vom server gedreht werden, sind eh eigene daten

    playerList[playerIdToIndex.get(message.data.playerId)].rotation = message.data.rotation;
    playerList[playerIdToIndex.get(message.data.playerId)].model.setRotationFromQuaternion(new THREE.Quaternion(message.data.rotation[0], message.data.rotation[1], message.data.rotation[2], message.data.rotation[3]));

  }else if(message.header == "mapData") { 
    //als erstes schickt der server die map daten, damit die Map generiert werden kann. 
    mapData = message.mapObject;
    createScene(document.getElementById("bg"));

  } else if(message.header == "yourPos") { 
    //server schickt die eigene position zum spawnen
    playerList = [];
    createPlayer(message.data.position, message.data.playerId, message.data.hp, true, message.data.rotation);


  } else if(message.header == "newPlayer") {
    //falls ein neuer spieler connected, muss dieser erstellt werden
    createPlayer(message.data.position, message.data.playerId, message.data.hp, false);

  } else if (message.header == "playerDisconnected") {
    //falls jemand disconnected, muss dieser spieler auch verschwinden
    removePlayer(message.data.playerId);

  } else if (message.header == "playerHit") {
    //a player took damage -> update hp of the player
    updateHealth(message.data.playerId, message.data.damage);

  } else if (message.header == "playerJoined") {
    //a player joined the game (could also be own player)
    putInGame(message.data.playerId, playerIdToIndex.get(message.data.playerId) == 0, message.data.position, message.data.characterId);
    
  } else if (message.header == "putToStandby") {
    //a player died
    putToStandby(message.data.playerId, playerIdToIndex.get(message.data.playerId) == 0);

  } else if (message.header == "updateOfProjectiles") {
    //a projectile moved, positon gets updated
    updateProjectiles(message.data.projectileList);
  } else if (message.header == "drawEffect") {
    //some effect gets drawn, can be steam from the kettle or also explosions or lines

    if (message.data.effectType == 0) {
      //line
      const material = new THREE.LineBasicMaterial({
        color: message.data.color,
        transparent: true
      });
            
      const points = [];
      points.push(new THREE.Vector3(...message.data.startPosition));
      points.push(new THREE.Vector3(...message.data.endPosition));

      const geometry = new THREE.BufferGeometry().setFromPoints( points );

      const line = new THREE.Line( geometry, material );
      scene.add(line);
      line.material.opacity = 0.6;
      let lineInterval = setInterval(() => {
        line.material.opacity -= 0.199
        if (line.material.opacity < 0.05) {
          clearInterval(lineInterval);
          scene.remove(line);
          //console.log("deleted");
        }
      }, 40)
            
    } else if (message.data.effectType == 1) {
      if (message.data.action == 0) {
        //start particleanimation
        if (playerList[playerIdToIndex.get(message.data.playerId)].particleSystemId == undefined) {
          //never shot before, creating particle system
          const particleSystemId = uuidv4();
          playerList[playerIdToIndex.get(message.data.playerId)].particleSystemId = particleSystemId;
          particleSystemObjects[particleSystemId] = {particleSystemType: 2, id: particleSystemId, active: false, playerId: message.data.playerId, particleSize: 1.2, particleSpeed: 0.002, coneLength: 2, particleObj: createParticleObject({texture: "texture/wasserdampf.png", fragmentShader: particleFragmentShader, vertexShader: particleVertexShader, maxParticles: 30, particleSystemType: 2, position: [0, 0, 0]})}
          
        }
        particleSystemObjects[playerList[playerIdToIndex.get(message.data.playerId)].particleSystemId].active = true;

      } else {
        //stop particle animation
        particleSystemObjects[playerList[playerIdToIndex.get(message.data.playerId)].particleSystemId].active = false;
      }
    }
  } else if (message.header == "scoreBoardChange") {
    //the scoreboard changed

    //delete all scoreobjects to draw it again later
    document.getElementById("scoreboard").innerHTML = '';

    let sortedScoreArray = [];
    let scoreObjectsArray = [];


    //fill sortedScoreArray with all scores (not sorted yet)
    Object.keys(message.data.scoreBoard).forEach((key) => {
      sortedScoreArray.push(message.data.scoreBoard[key].score);
    });

    //sort sortedScoreArray, highest score first
    sortedScoreArray.sort((a, b) => b-a);

    //calculate the position in the list with sortedScoreArray and fill this slot in scoreObjectsArray
    Object.keys(message.data.scoreBoard).forEach((key) => {
      let place = sortedScoreArray.indexOf(message.data.scoreBoard[key].score) //0 on top
      sortedScoreArray[place] = -1; //sortedScoreArray gets changed so if there are two scores which are the same, it wont take the same score two times in a row 
      scoreObjectsArray[place] = message.data.scoreBoard[key];
    });


    //create for each score in scoreObjectsArray an element to display
    let count = 0;
    scoreObjectsArray.forEach((scoreObject) => {
      if (count >= 5) return; //only show the top 5 players, topScore
      //console.log(count);
      let scoreElement = document.createElement("p");

      scoreElement.innerHTML = scoreObject.name + ": " + "<span style='color: red'>" + scoreObject.score + "</span>"; 
      scoreElement.setAttribute("class", "scoreClass");
      document.getElementById("scoreboard").appendChild(scoreElement);

      count++;
    });
  } else if (message.header == "ammoDetails") {
    //a change in the own ammonition happened -> change ui

    document.getElementById("reloadContainer").style.display = "block";
    
    //not reloading
    if (message.data.state == 0) {
      document.getElementById("reloadInfo").innerHTML = message.data.currentAmmo + "/" + message.data.maxAmmo;
    } else {
      document.getElementById("reloadInfo").innerHTML = "reloading...";
    }
  }
}