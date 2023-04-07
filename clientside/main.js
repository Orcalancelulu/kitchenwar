import * as THREE from 'three';
import {PointerLockControls} from "PointerLockControls"
import { GLTFLoader } from 'GLTFLoader';

import Stats from '/three/examples/jsm/libs/stats.module.js' //stats for fps and memory... #debugging



const stats = Stats() // stats
document.body.appendChild(stats.dom) //stats


const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);
camera.layers.enable(1); //layer 1 is map object

let renderer;

let time = new THREE.Clock(); //used for deltaTime
let deltaTime = 0;

let mapSize = 120; //mit einer mapSize von 120 * 120 und einer Chunkgrösse von 12*12 gibt es 10*10 Chunks --> 100 Chunks insgesamt
let chunkSize = 12;
let chunkXYToIndex;
let chunkList;

let mapData;

let playerIdToIndex = new Map();
let playerList = [];

let isKeyPressed = {keyCodes: {}}

let getColliderCoordsDebuggingX = [];
let getColliderCoordsDebuggingZ = [];
let getColliderCoordsDebuggingY = [];

let moveVector = [0, 0];
let keyMapList = {"KeyW": {exfunc: () => {if(playerList[0].isGrounded) moveVector[0] += -1}}, "KeyS": {exfunc: () => {if(playerList[0].isGrounded) moveVector[0] += 1}}, "KeyA": {exfunc: () => {if(playerList[0].isGrounded) moveVector[1] += -1}}, "KeyD": {exfunc: () => {if(playerList[0].isGrounded) moveVector[1] += 1}}, "Space": {exfunc: () => wantToJump()}};

//movementType: welche art von bewegen. Entweder laufen oder fahren (wie bagger) speedmode
let movementDataPresets = [{movementType: 0, moveSpeed: 0.03, dampFactor: 0.2, inAirDampFactor: 0.02}, {movementType: 1, moveSpeed: 0.003, dampFactor: 1.05, inAirDampFactor: 1.02, turnSpeed: 0.04, currentSpeed: 0}, {movementType: 0, moveSpeed: 0.015, dampFactor: 0.2, inAirDampFactor: 0.02}, {movementType: 0, moveSpeed: 0.015, dampFactor: 0.2, inAirDampFactor: 0.02}]

let movementData = movementDataPresets[0];

let modelPaths = ["models/wasserkocher/wasserkocher.glb", "models/toaster/toaster2.glb", "models/wasserkocher/wasserkocher.glb", "models/wasserkocher/wasserkocher.glb"];
let projectileModelPaths = ["", "models/toaster/toast.glb", ""]

let playerSizes = [[0.4, 1, 0.4],  [0.5, 0.27, 0.5]]
let playerSize = [0.4, 1, 0.4];

let mixer;

let controls;
let isInGame = false;
let isInMenu = true;

let standByPos = [1, 20, 1];

let wantedDistanceToPlayer = 4;
let maxDistanceToPlayer = 8;

let projectileList = [];


let particleGeo = new THREE.BufferGeometry(); //debugging

let timeStampForMainAttackCharge;



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




// modulo zigzag funktion machen, von 0-1 immer wieder
// https://github.com/mrdoob/three.js/blob/master/examples/webgl_buffergeometry_custom_attributes_particles.html
// anstatt size einfach position ändern
// anhand von vorbestimmter form presets auswählen (cone speedy, sphere floating fixed or random pos)


//anfang debugging


function particleTesting() {

  let uniforms = {

    pointTexture: { value: new THREE.TextureLoader().load( 'texture/wasserdampf.png' ) }

  };

  const shaderMaterial = new THREE.ShaderMaterial( {

    uniforms: uniforms, //attribute float size; varying vec3 vColor;
    vertexShader: `
    
    attribute float size; 
    varying vec3 vColor;

    void main() {

      

      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

      gl_PointSize = 0.7 * ( 300.0 / -mvPosition.z );

      gl_Position = projectionMatrix * mvPosition;

    }`, //varying vec3 vColor;
    fragmentShader: `	
    uniform sampler2D pointTexture;

    varying vec3 vColor;

    void main() {

      gl_FragColor = vec4( vec3(1.0, 1.0, 1.0), 1.0 );

      gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord );

    }`,

    
    
    transparent: true,
    depthWrite: false
    //vertexColors: true

  } );


  const particleCount = 100;

  

  const positions = [];
	const colors = [];
	const sizes = [];

  const angles = [];
  const timeDisplacement = []; //so each particle starts at another point in the animation

  let radius = 0.1;

  for (var i = 0; i<particleCount; i++) {
    let angle = Math.random()*2*3.1415
    let cos = Math.cos(angle);
    let sin = Math.sin(angle);

    angles.push(0);
    angles.push(cos * radius * Math.random());
    angles.push(sin * radius * Math.random());

    timeDisplacement.push(Math.random()*5000); //0 - 5 seconds displacement, most animations only last a second or two

    positions.push(0); //points are getting calculated in the particle animation, not here, therefore just placeholder 0
		positions.push(0);
		positions.push(0);
  } 

  particleGeo.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
  particleGeo.setAttribute( 'angles', new THREE.Float32BufferAttribute( angles, 3 ) );
  particleGeo.setAttribute( 'timeDisplacement', new THREE.Float32BufferAttribute( timeDisplacement, 1 ) );


  let particleSystem = new THREE.Points( particleGeo, shaderMaterial);
  //particleSystem.receiveShadow = true;

  scene.add( particleSystem );
  moveObject(particleSystem, [19.3, 2, 20.05]);
}

function getCoordsOfRaycast(axis) {
  let lookVector = new THREE.Vector3;
  camera.getWorldDirection(lookVector);
  
  if (axis == "x") return rayChecker(camera.position, lookVector, 0.01, 50).x;
  if (axis == "y") return rayChecker(camera.position, lookVector, 0.01, 50).y;
  return rayChecker(camera.position, lookVector, 0.01, 50).z;

}

function takeCoordsAndPrintOut() {
  let lookVector = new THREE.Vector3;
  camera.getWorldDirection(lookVector);

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

document.body.addEventListener("mousedown", (event) => { 
  if (isInMenu) return; //man soll nicht aus dem Menue-Kameraflugmodus angreifen können

  if (playerList[0].characterId == 0 || playerList[0].characterId == 3) {
    //kettle and coffee can

    //send on

  } else if (playerList[0].characterId == 1 || playerList[0].characterId == 2) {
    //toaster and mixer

    //charge factor -> set timestamp
    timeStampForMainAttackCharge = Date.now();
  } 
});

document.body.addEventListener("mouseup", (event) => { 
  if (isInMenu) return; //man soll nicht aus dem Menue-Kameraflugmodus angreifen können

  
  let lookVector = new THREE.Vector3;
  camera.getWorldDirection(lookVector);
  lookVector = lookVector.normalize(); 

  let bodyVector = new THREE.Vector3;
  playerList[0].model.getWorldDirection(bodyVector);
  bodyVector = bodyVector.normalize();


  if (playerList[0].characterId == 0 || playerList[0].characterId == 3) {
    //kettle and coffee can

    //send off

  } else if (playerList[0].characterId == 1 || playerList[0].characterId == 2) {
    //toaster and mixer

    //charge factor -> calculate difference, send attack
    let velocityFactor = (Date.now() - timeStampForMainAttackCharge)*0.001;
    if (velocityFactor > 1) velocityFactor = 1;
    ws.send(JSON.stringify({header: "mainAttack", data: {rotationBody: [bodyVector.x, bodyVector.y, bodyVector.z], rotationCamera: [lookVector.x, lookVector.y, lookVector.z], position: [camera.position.x, camera.position.y, camera.position.z], characterId: playerList[0].characterId, velocityFactor: velocityFactor}}));

  } 
});





document.body.addEventListener("click", (event) => {
  if (isInMenu) return; //man soll nicht aus dem Menue-Kameraflugmodus angreifen können

  //Player wants to use main attack
  
  //attack modes: 
    // - ammunition bar wich refills at a certain speed (area damage, like flamethrower) //server side difficult
    // - slot ammunition (projectile) (toaster, blender) //server side difficult
    // - normal machine gun (hit scan) with reload once its emtpy //server side easy to do

/*
  
  let lookVector = new THREE.Vector3;
  camera.getWorldDirection(lookVector);
  lookVector = lookVector.normalize(); 

  let bodyVector = new THREE.Vector3;
  playerList[0].model.getWorldDirection(bodyVector);
  bodyVector = bodyVector.normalize();
 
  console.log(bodyVector);
  ws.send(JSON.stringify({header: "mainAttack", data: {rotationBody: [bodyVector.x, bodyVector.y, bodyVector.z], rotationCamera: [lookVector.x, lookVector.y, lookVector.z], position: [camera.position.x, camera.position.y, camera.position.z], characterId: playerList[0].characterId, velocityFactor: 1}}));
  */
})

let amlight = new THREE.AmbientLight(0xFFFFFF, 0.8);
let spotLight = new THREE.SpotLight(0xFFFFFF, 0);
let dilight = new THREE.DirectionalLight(0xFFFFFF, 1.4);
dilight.shadow.camera.top = 20;
dilight.shadow.camera.bottom = -20;
dilight.shadow.camera.left = -30;
dilight.shadow.camera.right = 50;

let dilightTarget = new THREE.Object3D();



scene.add(amlight, dilight, dilightTarget, spotLight);
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
  this.velocity = new THREE.Vector3(0, 0, 0);
  this.isWalking = false;
  this.hp = hp; 
  this.isOnStandby = true;
  this.characterId = 0;
}


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

  //change attacking presets


  //send message to server
  ws.send(JSON.stringify({header: "changedCharacter", data: {characterId: characterId}}));
}


const createSkybox = async () => {
  const loader = new THREE.CubeTextureLoader();
  loader.setPath('texture/');
  const cubeTex = loader.load( [
    "2left.png", "3right.png", "4up.png", "5down.png", "0front.png", "1back.png"
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

const addGltfToScene = () => {
  const loader = new GLTFLoader();
  loader.load("models/kitchen.glb", function ( gltf ) {
    gltf.scene.scale.set(5, 5, 5);
    moveObject(gltf.scene, [30, 4, 40]);
    scene.add(gltf.scene);
    gltf.scene.castShadow = true;
    gltf.scene.receiveShadow = true;
    gltf.scene.layers.set(1);
    applyChangesToAllChildren(gltf.scene.children, 1, 0.2, true); //layer 1 means map
    //mixer = new THREE.AnimationMixer(gltf.scene);
    //let action = mixer.clipAction(gltf.animations[0]);

    //action.play();


  },	function ( xhr ) {

		console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );

	}, 	function ( error ) {

		console.log( 'An error happened' );

	})
}




const movePlayer = (vector, playerObj) => {


  //used for future animations
  playerList[0].isWalking = true;


  if (movementData.movementType == 0) {
    
    let lookVector = new THREE.Vector3();
    playerObj.getWorldDirection(lookVector);

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
      ws.send(JSON.stringify({header: "rotateevent", data: {rotation: [quat.x, quat.y, quat.z, quat.w]}}))
    }



    playerObj.quaternion.setFromEuler(currentAngleOfBody);
    //camera.quaternion.setFromEuler(currentAngleOfCamera);


    //add velocity if needed
    movementData.currentSpeed += movementData.moveSpeed * vector[0];
    
  }
 
}


//verstehe meinen code leider nicht mehr... viel glück!
const checkPlayerCollision = (afterMove) => {
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

const loadBetterModel = (modelPath, playerId, pos, shouldCreateCameraControl, rotation) => {
  console.log(modelPath);
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

const createPlayer = (pos, id, hp, myPlayer, rotation) => {
  let index = playerList.length;
  if (playerIdToIndex.get(id) != undefined) return;
  if (myPlayer) index = 0;


  playerIdToIndex.set(id, index);
  playerList[index] = new player(id, pos, createPlayerModel(pos), hp);
  loadBetterModel("models/wasserkocher/wasserkocher.glb", id, pos, myPlayer, rotation); //loads the real model, takes longer so a dummy model gets loaded first for movement (only few millisec)
  console.log("loading model");

}

const updateAnimations = () => {
  playerList.forEach(playerInList => {
    if (!playerInList.isGrounded) { //jump pose

    } else if (playerInList.isWalking) { //walking animation
      //mixer.update(0.02);
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
  playerList[0].velocity.add(new THREE.Vector3(0, 0.1, 0)); //speedmode
  playerList[0].model.position.y += 0.01;
}

function mouseWheelEvent(event) {
  wantedDistanceToPlayer += event.deltaY * 0.005;
  if (wantedDistanceToPlayer < 0) wantedDistanceToPlayer = 0;
  if (wantedDistanceToPlayer > maxDistanceToPlayer) wantedDistanceToPlayer = maxDistanceToPlayer;
}

const createCameraControl = (rot) => {
  let quaternion = new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]);

  camera.setRotationFromQuaternion(quaternion);
  playerList[0].model.setRotationFromQuaternion(quaternion);

  controls = new PointerLockControls( camera, document.body, () => {if(movementData.movementType == 0) return playerList[0].model}, function(quat) {
    //rotation an server schicken

    ws.send(JSON.stringify({header: "rotateevent", data: {rotation: [quat.x, quat.y, quat.z, quat.w]}}))
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
    
    if (playerList[0].isOnStandby) ws.send(JSON.stringify({header: "joiningGame"}));

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

const putInGame = (playerId, isMyPlayer, spawnPos, characterId) => {
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
    console.log("loading stuff");
    loadBetterModel(modelPaths[characterId], playerId, spawnPos, false);
  }

  updateFloatingHp(playerList[index].hp, playerId);
  
}

const applyPhysics = () => {
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
    
    let lookVector = new THREE.Vector3();
    playerList[0].model.getWorldDirection(lookVector);

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

function updateTestParticles() {
  let positions = particleGeo.attributes.position.array;
  let angles = particleGeo.attributes.angles.array;
  let timeDisplacement = particleGeo.attributes.timeDisplacement.array;

  const coneLength = 2;
  const particleSpeed = 0.002;
  const secondCircleSize = 10; //1 means twice as big, 0.5 = same size
  let currentTime = Date.now();
  
  //console.log(timeFactor);
  for (var i = 0; i< positions.length/3; i++) {
    let timeFactor = (particleSpeed * (currentTime + timeDisplacement[Math.floor(i/3)]))%1; //gives a number between 0 and 1, triangle graph
    
    positions[3*i + 0] = timeFactor * coneLength;
    
    positions[3*i + 1] = angles[3*i + 1] *  timeFactor * secondCircleSize + angles[3*i + 1];
    positions[3*i + 2] = angles[3*i + 2] *  timeFactor * secondCircleSize + angles[3*i + 2];
    //positions[3*i + 2] += sideSpeed * ;
  }

  particleGeo.attributes.position.needsUpdate = true;

}



function animate() {
  deltaTime = time.deltaTime;
  requestAnimationFrame(animate);
  checkInput();
  applyPhysics();
  updateAnimations();

  updateCameraFly();
  moveSmoothCamera();
  
  stats.update() //stats


  updateTestParticles();
 
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
    console.log("can't create object");
  }
};

const generateMap = (mapObject) => {
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

const createListener = () => {
  console.log("listener activated");
  document.body.addEventListener("keydown", (event) => {
    isKeyPressed.keyCodes[event.code] = true;
    

  })
  document.body.addEventListener("keyup", (event) => {
    isKeyPressed.keyCodes[event.code] = false;

    //y and z are swapped because keyboard
    if (event.code == "KeyX") getColliderCoordsDebuggingX[getColliderCoordsDebuggingX.length] = getCoordsOfRaycast("x");
    if (event.code == "KeyY") getColliderCoordsDebuggingZ[getColliderCoordsDebuggingZ.length] = getCoordsOfRaycast("z");
    if (event.code == "KeyZ") getColliderCoordsDebuggingY[getColliderCoordsDebuggingY.length] = getCoordsOfRaycast("y");
    if (event.code == "KeyT") takeCoordsAndPrintOut();
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

  //nur bewegen falls man sich auch bewegen will
  if (moveVector[0] == 0 && moveVector[1] == 0) return;

  let normalizedMoveVector = new THREE.Vector2(moveVector[0], moveVector[1]).normalize();
  movePlayer([normalizedMoveVector.x, normalizedMoveVector.y], playerList[0].model);


  moveVector = [0, 0];
}

const recalcPlayerMap = () => {
  playerIdToIndex.clear();
  let counter = 0;
  playerList.forEach((item) => {
    playerIdToIndex.set(item.id, counter);
    counter++;
  });
}

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
//createGrid();

//moveObject(camera, [3, 1, -3]);
moveObject(dilight, [-20, 40, 44.19]);
/*const helper = new THREE.CameraHelper( dilight.shadow.camera );
scene.add( helper );*/
//dilight.lookAt(new THREE.Vector3(0, 0, 0));
dilight.castShadow = true;
dilight.shadow.mapSize.width = 2048;
dilight.shadow.mapSize.height = 2048;
moveObject(dilightTarget, [[35, 0, 30]])
dilight.target.position.set(35, 0, 30);
dilight.target.updateMatrixWorld();
dilight.shadow.normalBias = 0.2; //shadow doesn't have stripes with that

moveObject(spotLight, [25.04, 13.82, 22.98]);
spotLight.target.position.set(25.04, 0, 22.98);
spotLight.target.updateMatrixWorld();

spotLight.angle = 0.4;
spotLight.penumbra = 0.7;

//const spotLightHelper = new THREE.SpotLightHelper( spotLight );
//scene.add( spotLightHelper );


//ende debugging


function createNewProjectile(position, projectileType, id, index) {
  //console.log(id);
  return {position: position, type: projectileType, id: id, model: createProjectileModel(projectileType, index)};
}

function createProjectileModel(projectileType, index) {

  let modelPath = projectileModelPaths[projectileType];
  if (modelPath == "") modelPath = "model/dummy_projectile.glb";

  console.log(modelPath);
  const loader = new GLTFLoader();
  loader.load(modelPath, function ( gltf ) {
    console.log(gltf.scene);
    //gltf.scene.scale.set(1, 1, 1);
    scene.add(gltf.scene);
    //console.log(gltf.scene);
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
      
      //delete item from copylist
      projectileIdsListCopy.splice(indexOfFoundId, 1);

    } else {
      //projectile is not yet in list

      //create and add item in list
      projectileList.push(createNewProjectile(serverProjectileList[i].position, serverProjectileList[i].constants.projectileType, id, projectileList.length))
      console.log("created: " + id);
    }
  }
  //all projectiles left in projectileIdsListCopy should be deleted (maybe they hit a player or object)
  for (var i = projectileList.length-1; i > -1; i -= 1) {
    let projectileToCheck = projectileList[i];

    if (projectileIdsListCopy.indexOf(projectileToCheck.id) > -1) {
      //this projectile should be deleted
      scene.remove(projectileList[i].model);
      console.log("Deleted: "+projectileList[i].id + "because of: " + projectileIdsListCopy);
      projectileList.splice(i, 1);
    }
  }
}


//raycasts for easy creation of colliders, is not used in the game #debugging
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
    console.log(sphere.position);
    return intersects[0].point;
  }
}

addGltfToScene();

particleTesting();

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
    console.log("Player joined the game: " + message.data.characterId);
    putInGame(message.data.playerId, playerIdToIndex.get(message.data.playerId) == 0, message.data.position, message.data.characterId);
    
  } else if (message.header == "putToStandby") {
    console.log("Putting to standby because: " + message.data.cause);
    putToStandby(message.data.playerId, playerIdToIndex.get(message.data.playerId) == 0);

  } else if (message.header == "updateOfProjectiles") {
    //message.data.projectileList has all projectiles in the scene
    updateProjectiles(message.data.projectileList);
  } 
}