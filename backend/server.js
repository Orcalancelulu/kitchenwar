const THREE = require("three");
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 7031 });


let clientList = [];
const scene = new THREE.Scene();

let isPhysicsLoopActive = false;
let PhysicsLoop;
let projectileList = [];

let physicsLoopWaitTime = 16; //16 => 1000/16 = 60 times per second

const clients = new Map();

let scoreBoard = {};

let raycaster;

//zum testen mal hardcoded. später soll es noch aus einem file kommen
let menueSpawnPos = [-40, 5, -40];

let characterMainWeaponType = [0, 1, 1, 1, 2]; //this means, at index 0 (kettle) has type 0, index 1 (toaster) has type 1, index 2 (mixer) has type 1, index 3 (knifeblock) has type 1, index 4 (coffee can) has type 2
let mainAttackMaxAmmoCapacity = [20, 2, 2, 6, 20] //how much ammunition / slots / power each character has
let mainAttackDamage = [20, 100, 50, 20, 10];
let timeBetweenShots = [[0.25, 4], [1, 8], [2, 10], [0.2, 10], [0.2, 2]] //1. number = time between shots, 2. number = reload / refillpersecond time


let playerSize = [0.25, 1, 0.25];

let mapObject = {
  possibleSpawnPos: [[13.14, 0.33, 15.55], [35.17, 0.33, 11.7], [15.13, 0.33, 51.08], [14.68, 0.33, 63.64], [40.61, 0.33, 57.52], [12.45, 4.78, 44.91], [41.42, 4.85, 36.52], [17.76, 4.79, 10.88]],
  cameraFly: {
    bezier: [[17.94, 9.22, 16.18], [17.58, 9.29, 35.8], [30.17, 9.39, 71.5], [35.13, 5.09, 27.31], [18.95, 5.69, 28.14], [18.64, 9.32, 15.79]], 
    lookVector: [26.94, 3.02, 28.07]
  },  

  objects: {
  
    //applyForce List -> jump pads
    apFo2913: {position: [36, 0.33, 27.65], size: [0.5, 0.5, 0.5], actionOnCollision: "applyForce", forceVector: [0.1, 0.28, 0], isVisible: true, shape: "forcePad"},
    apFo8276: {position: [17.93, 0.33, 27.65], size: [0.5, 0.5, 0.5], actionOnCollision: "applyForce", forceVector: [-0.1, 0.28, 0], isVisible: true, shape: "forcePad"},

    //collider list, objects with collision (alles noch hardcoded, wird später noch anders)
    coll5885: {position: [27.51449182990683,2.5356705792056027,22.56412559449208], size: [9.743382639954348, 4.407726812246092, 4.209177619228122]},
    coll4671: {position: [27.51449182990683,2.5356705792056027,33.34101015030873], size: [9.743382639954348, 4.407726812246092, 4.209177619228122]},
    coll4430: {position: [23.974475190590503,2.5593533739447154,11.069169044494629], size: [16.743707471248815, 4.455092401724317, 4.547296464443207]},
    coll7687: {position: [40.51223902051106,2.593333843587518,26.631405751806128], size: [4.484114889644957, 4.5230533410099225, 22.779541460953798]},
    coll7569: {position: [13.47049593925476,7.282411891614062,47.684041881097016], size: [4.370514750480652, 13.901209437063013, 2.5016312420476865]},
    coll5759: {position: [13.47049593925476,7.282411891614063,60.44236186903383], size: [4.370514750480652, 13.901209437063015, 2.4355512152574477]},
    coll3298: {position: [13.47049593925476,7.282411891614062,73.29620256537495], size: [4.370514750480652, 13.901209437063013, 2.6549106923951626]},
    coll4985: {position: [29.205024889914313,8.491291162249071,75.90267576772135], size: [27.098543150838452, 16.31896797833303, 2.558035712297624]},
    coll4398: {position: [28.81543695347311,8.38797535475206,73.110232975244], size: [8.773122425985349, 16.112336363339008, 3.026849872657067]},
    coll8684: {position: [44.23890190171406,8.491208465249743,65.05834049294613], size: [2.969210872761039, 16.318802584334374, 24.24670626184806]},
    coll4923: {position: [40.51223902051106,8.203783705421527,46.80463090053163], size: [4.484114889644957, 15.743953064677942, 17.59658500899839]},
    coll5388: {position: [13.477928104950164,5.5208906199587755,11.075817560387677], size: [4.329131333950418, 10.95198119361135, 4.560593496229304]},
    coll7665: {position: [40.59756398200989,5.664344194923503,12.576205730438232], size: [4.5032912492752075, 10.665074043681894, 5.496389865875244]},
    coll3242: {position: [11.320777274668217,7.282411891614062,60.45180236064912], size: [2.0095622539520264, 13.901209437063013, 23.03388971705651]},
    coll2410: {position: [10.9392183083961,8.380673888717753,29.88802177257317], size: [1.2464443214077914, 16.097733431270395, 33.09040899171387]}, //wall x on west
    coll8223: {position: [13.558793645352125,2.5563001965879284,32.01962957660751], size: [4.193919338285923, 4.448986047010745, 28.82719327395897]}, //long box on west
    coll2889: {position: [26.994206063542094,8.380673888717753,8.852614256189973], size: [22.70342458766038, 16.097733431270395, 1.1458375620450205]}, //wall z on north
    coll9383: {position: [43.19464564323425,8.380673888717753,26.665369529704144], size: [1.1458378285169601, 16.097733431270395, 22.68193773265658]}, //wall x on east
    coll3537: {position: [22.052575407408618,8.380673888717753,47.62024521827698], size: [15.393472573393575, 16.097733431270395, 1.2209582328796316]}, //part of inwall west
    coll8858: {position: [37.082866815920354,8.380673888717753,47.62024521827698], size: [2.3746295195364553, 16.097733431270395, 1.2209582328796387]}, //part of inwall east
    coll3133: {position: [19.134719393357486,4.812144428491592,22.501889766090073], size: [8.450764917492176, 0.19999999552965164, 1.500000532832697]}, //brücke 1
    coll3959: {position: [28.713345229625702,4.8258392057925334,28.343778740468732], size: [1.5000003576278687, 0.17261044092776956, 10.011234067088587]}, // brücke 2
    coll2960: {position: [27.04178049175198,0,42.02459613073046], size: [31.159893102077376, 0.1, 65.19812251859832]}, //boden (nur serverside gebraucht für raycasts)
    coll2961: {position: [27.04178049175198,16.429,42.02459613073046], size: [31.159893102077376, 0.1, 65.19812251859832]} //decke (nur serverside gebraucht für raycasts)

  } 
}

//fertig hardcoded
function addNewProjectile(projectile) { //OnOrOff: false = turn off, true = turn on

  projectileList.push(projectile);

  if (!isPhysicsLoopActive){ //if loop is not started
    //starts the loop
    isPhysicsLoopActive = true;
    
    PhysicsLoop = setInterval(calcPhysics, physicsLoopWaitTime) 
  }
}

function calcPhysics() {
  if (projectileList.length < 1) {
    clearInterval(PhysicsLoop); //if there are no more projetiles, the loop will end
    isPhysicsLoopActive = false;
    return;
  }
  
  for (var i = projectileList.length-1; i > -1; i -= 1) { //loop through all projectiles on the map
    //console.log(i);
    const projectile = projectileList[i];
    let position = projectile.position;
    let velocity = projectile.velocity;

    //calculate new Position and velocity of  projectile
    position = [position[0] + velocity[0] * physicsLoopWaitTime, position[1] + velocity[1] * physicsLoopWaitTime, position[2] + velocity[2] * physicsLoopWaitTime];
    projectileList[i].velocity = [velocity[0], velocity[1] - projectileList[i].constants.gravityFactor * physicsLoopWaitTime, velocity[2]];
    projectileList[i].position = position;


    //check for collisions
    let shouldContinue = false;
    Object.keys(mapObject.objects).forEach((key) => {
      let object = mapObject.objects[key];

      if(isPointInCube(position, object) || position[1] < 0.33 || position[1] > 100) { //if projectile hits a part of the map, it gets destroyed or blows up

        projectileList.splice(i, 1);
        //console.log("deleted projectile");
        position[1] = 0; //not actually moving it, just so the forEach loop of the mapObjects does not get true every time
        shouldContinue = true;
      }
    });
    if (shouldContinue) continue; //so the player wont get checked, if the projectile is already destroyed


    //check if player is hit
    clientList.forEach((player) => {
      if (projectileList.length != 0){ //if a player gets hit with the only projectile on the scene, projectileList will be empty but the forEach would still go on.
        let distance = getDistanceBetweenArrayVector(player.position, position);
        //console.log(projectileList.length);
        //console.log(distance)
        if (projectileList[i].constants == undefined) return;
        if (distance < projectileList[i].constants.minDistanceToHit && projectileList[i].constants.playerId != player.id) { //if the distance to the player is to small (so projectile touches player), !!here!!, muss besser gemacht werden,  jetzt wird Entfernung nur von Mittelpunkt gemessen, nicht von den Ecken des Spielers
          //player is hit

          clientList[clients.get(player.id)].hp -= projectileList[i].constants.damage;
          sendAll({header: "playerHit", data: {playerId: player.id, damage: projectileList[i].constants.damage}}); //!!here!!, change this for splash area damage
          
          if (clientList[clients.get(player.id)].hp <= 0) { //if the player is now dead, the player should die
            killPlayer(player.id);
            scoreBoard[projectileList[i].constants.playerId].score += 1;
            sendAll({header: "scoreBoardChange", data: {scoreBoard: scoreBoard}});

          }
          projectileList.splice(i, 1); //delete projectile after hit
        }
      }       
    })
  }

  //send data to clients
  sendAll({header: "updateOfProjectiles", data: {projectileList: projectileList}})
}

function killPlayer(playerId) {
  sendAll({header: "putToStandby", data: {cause: "death", playerId: playerId}});

  clientList[clients.get(playerId)].isInGame = false;
  clientList[clients.get(playerId)].hp = 100; //debugging, später noch anders
  delete clientList[clients.get(playerId)].mainAttackInfo;


  scoreBoard[playerId].score = Math.floor(scoreBoard[playerId].score * 0.5); //loose half your points on death
  sendAll({header: "scoreBoardChange", data: {scoreBoard: scoreBoard}});


  //aus dem Weg mit dem Spieler, damit er nicht Schüsse blockiert und so
  clientList[clients.get(playerId)].position = menueSpawnPos;
  moveObject(clientList[clients.get(playerId)].model, menueSpawnPos);
  
}

function isPointInCube(point, cube) {
  let bounds = getBoxBounds(cube.position, cube.size);

  let isInCube = point[0] > bounds[0] && point[0] < bounds[1] && point[1] > bounds[2] && point[1] < bounds[3] && point[2] > bounds[4] && point[2] < bounds[5];

  return isInCube; //true = point is in cube, false = point is not in cube
}


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

function shootSlotAmmunition(characterId, playerId, velocityVector) {

  let mainAttackInfo = clientList[clients.get(playerId)].mainAttackInfo;

  if (mainAttackInfo == undefined) {
    //this player shoots the first time, no data avaiable
    //first time shooting, therefore, all slots are ready
    let slotList = [];
    for(var i = 0; i < mainAttackMaxAmmoCapacity[characterId]; i++) { //creates a list with all slots, 0 = slot not ready, 1 = slot ready, different character have different slots, therefore a for loop is used
      slotList.push(Date.now() - 100000); //(dummy data) 100 seconds since last shot, so it had definitely enough time to reload 
    }
    mainAttackInfo = {slotsInfo: slotList, timeStampOfLastShot: Date.now() - 10000}; //timeStampOfLastShot again some dummy data
    clientList[clients.get(playerId)].mainAttackInfo = mainAttackInfo;
  }

  //mainAttackInfo is ready

  for (var i = 0; i < mainAttackInfo.slotsInfo.length; i++) { //checks every slot
    let slot = mainAttackInfo.slotsInfo[i];
    if (Date.now() - slot > timeBetweenShots[characterId][1] * 1000) { //if time since last shot in this slot is longer than minimal time, then shoot. *1000, because data is in seconds and not in milliseconds
      //slot is ready
      if (Date.now() - mainAttackInfo.timeStampOfLastShot > timeBetweenShots[characterId][0] * 1000) { //checks if last shot of player was longer ago than minimal time
        //slot is ready and last shot was long ago -> ready to shoot!

        clientList[clients.get(playerId)].mainAttackInfo.slotsInfo[i] = Date.now();
        clientList[clients.get(playerId)].mainAttackInfo.timeStampOfLastShot = Date.now();
        //console.log(playerId + " is shooting with slot ammunition as character " + characterId);
        //shoot Physical Projectile
        //console.log(velocityVector);

        //toaster
        if (characterId == 1) addNewProjectile({position: clientList[clients.get(playerId)].position, velocity: velocityVector, id: Date.now() + Math.random(), constants: {playerId: playerId, airDragFactor: 0, gravityFactor: 0.00001, damage: mainAttackDamage[characterId], damageArea: 3, projectileType: 1, minDistanceToHit: 1}});
        
        //mixer
        if (characterId == 2) addNewProjectile({position: clientList[clients.get(playerId)].position, velocity: velocityVector, id: Date.now() + Math.random(), constants: {playerId: playerId, airDragFactor: 0, gravityFactor: 0, damage: mainAttackDamage[characterId], damageArea: 3, projectileType: 2, minDistanceToHit: 1}});

        //knifeblock
        if (characterId == 3) {
          //uses raycasts to attack, not a physical bullet
          //console.log("attacking with knife")

          raycaster = new THREE.Raycaster;
          raycaster.set(new THREE.Vector3(...clientList[clients.get(playerId)].position), new THREE.Vector3(...velocityVector), 0.1, 200);
          const intersects = raycaster.intersectObjects(scene.children);

          if (intersects.length > 0) {
            //console.log(intersects);
            sendAll({header: "drawEffect", data: {effectType: 0, duration: 1000,  color: 0xffffff, startPosition: clientList[clients.get(playerId)].position, endPosition: [intersects[0].point.x, intersects[0].point.y, intersects[0].point.z]}})

            if (intersects[0].object.name.indexOf("player") > -1) {
              //player got hit
              //console.log(intersects[0].object.name.slice(10));
              const id = intersects[0].object.name.slice(10);
              
              //damage player
              clientList[clients.get(id)].hp -= mainAttackDamage[characterId]; 
              sendAll({header: "playerHit", data: {playerId: id, damage: mainAttackDamage[characterId]}});

              if (clientList[clients.get(id)].hp <= 0) {
                //player died
                killPlayer(id);
                scoreBoard[playerId].score += 1;
                sendAll({header: "scoreBoardChange", data: {scoreBoard: scoreBoard}});


              }
            }
          }
        }
      }

      break; //only one shot per click, so the other slots dont have to be checked
    }
  }  
  sendSlotsAmmoInfo(mainAttackInfo, characterId, playerId, true);
}

function sendSlotsAmmoInfo(mainAttackInfo, characterId, playerId, shouldCheckLater) {
    if (mainAttackInfo.slotsInfo == undefined || clientList[clients.get(playerId)] == undefined) return;
    //send client how much ammo he has left
    let currentAmmo = 0;
    //check each slot if it has ammo ready
    mainAttackInfo.slotsInfo.forEach((timeStamp) => {
      if (Date.now() - timeStamp > timeBetweenShots[characterId][1] * 1000) {
        currentAmmo ++;
      } else {
        if (shouldCheckLater) {
          //not ready yet, but it is in the future -> then it has the be sent to the client
          setTimeout(() => {
            //check again
            sendSlotsAmmoInfo(mainAttackInfo, characterId, playerId, false);
          }, timeBetweenShots[characterId][1] * 1000 - (Date.now() - timeStamp) + 100) //+100 so 
        }
      }
    })
    sendTo({header: "ammoDetails", data: {maxAmmo: mainAttackMaxAmmoCapacity[characterId], currentAmmo: currentAmmo, state: 0}}, clientList[clients.get(playerId)].ws);
  
}

function recalculateClients() {
  clients.clear();
  let counter = 0;
  clientList.forEach((player) => {
    clients.set(player.id, counter);
    counter++;
  });
}

function moveObject(object, position) {
  object.position.x = position[0];
  object.position.y = position[1];
  object.position.z = position[2];

  object.updateMatrixWorld(); //hat ein bisschen lange gedauert bis ich rausgefunden hab, dass es das braucht damit der Raycaster funktioniert...
}

function createBasicObject(obj, shouldReturn) {
  let geo = new THREE.BoxGeometry(obj.size[0], obj.size[1], obj.size[2]);
  let mat = new THREE.MeshBasicMaterial();
  let model = new THREE.Mesh(geo, mat);
  scene.add(model);

  if (obj.id == undefined) obj.id = Math.floor(Math.random()*100000);

  model.name = "id: " + obj.id;
  moveObject(model, obj.position);

  if (shouldReturn) return model;
}

function createScene() {
  Object.keys(mapObject.objects).forEach((key) => {
    let objectToCreate = mapObject.objects[key];
    createBasicObject(objectToCreate);
  })
}

function getLookVector(startVec, dirVec, bodyVec, near, far) {

  raycaster = new THREE.Raycaster();
  raycaster.set(startVec, dirVec, near, far);
  const intersects = raycaster.intersectObjects(scene.children);

  if (intersects.length > 0) {
    return intersects[0].point.sub(bodyVec)
  } else {
    return dirVec;
  }
}

//client Objekt Constructor (keine Ahnung ob das schöner geht)
function client(id, ws, position, model, rotation, hp, name) {
  if (position == undefined) position = [0, 0, 0];
  if (rotation == undefined) rotation = 0;
  if (hp == undefined) hp = 100;

  this.id = id;
  this.ws = ws;
  this.position = position;
  this.rotation = rotation;
  this.hp = hp;
  this.model = model
  this.isInGame = false;
  this.characterId = 0;
  this.mainAttackInfo = undefined;
  this.velocity = [0, 0, 0];
  this.lookVector = [0, 0, 0];
  this.cameraPos = [0, 0, 0];
  this.name = name;
}

//check if message from client is JSON data
function isJSON(jsonData) {
  //if (typeof(jsonData) != "string") return false;
  try {
    JSON.parse(jsonData);
  } 
  catch{
    return false;
  }
  return true;
}

//sends a message to all clients that are connected
function sendAll(messageToSend) {
  clientList.forEach((clientToSend) => {
    //muss nicht an sicht selbst gesendet werden
    //if (clientToSend.id == id) return;

    clientToSend.ws.send(JSON.stringify(messageToSend));
  })
}

function sendTo(messageToSend, clientToReceive) {
  clientToReceive.send(JSON.stringify(messageToSend));
}

function getDistanceBetweenArrayVector(arr1, arr2) {
  let diffArr = [];
  diffArr[0] = arr1[0]-arr2[0];
  diffArr[1] = arr1[1]-arr2[1];
  diffArr[2] = arr1[2]-arr2[2];

  let distance = Math.sqrt(diffArr[0]*diffArr[0] + diffArr[1]*diffArr[1] + diffArr[2]*diffArr[2]);
  return distance;
}

function isPointInCone(point, coneObject) {
 // console.log(point);
  //console.log(coneObject.startPosition);
  let pointPosition = new THREE.Vector3(...point);
  let startPosition = new THREE.Vector3(...coneObject.startPosition);

  //console.log(startPosition);
  //console.log(pointPosition);

  let startToPointVector = pointPosition.sub(startPosition);
  let coneVector = coneObject.coneLookvector;

  //console.log(startToPointVector);
  //console.log(startToPointVector.length());

  let angleToPoint = startToPointVector.angleTo(coneVector);

  //console.log(angleToPoint < coneObject.maxAngle);

  if (angleToPoint < coneObject.maxAngle) {
    if (startToPointVector.length() < coneObject.coneLength) {
      //point is in cone
      return true
    }
  }
  return false;
}

function attackForward(playerId, characterId) {
  let clientListIndex = clients.get(playerId);

  if (clientList[clientListIndex] == undefined) return;

  let lookVector = clientList[clientListIndex].lookVector; //camera looks like this, but not playermodel, therefore raycast from camera and make vector between point hit and model Position
  lookVector = new THREE.Vector3(...lookVector); //convert lookVector from array to threeJs vector
  lookVector = getLookVector(new THREE.Vector3(...clientList[clientListIndex].cameraPos), lookVector, new THREE.Vector3(...clientList[clientListIndex].position), 0.1, 200);
  //console.log(lookVector.length());
  clientList[clientListIndex].mainAttackInfo.timeStampOfLastShot = Date.now();

  if (clientList[clientListIndex].mainAttackInfo.ammunition > 0 && clientList[clientListIndex].mainAttackInfo.isReloading == false) { //has it enough ammunition?
    //enough ammunition left
    clientList[clientListIndex].mainAttackInfo.ammunition -= 1;
    if (characterId == 0) { //kettle
      //console.log("attacking with kettle");
      //check if a player is inside the cone
      for(var i = 0; i<clientList.length; i++) {
        if (i == clientListIndex || clientList[i].isInGame == false) continue; //player who shoots should not be hit and only player who are in game should get hit (its his own ability)

        //console.log(lookVector);
        if(isPointInCone(clientList[i].position, {startPosition: clientList[clientListIndex].position, maxAngle: 0.7, coneLength: 2, coneLookvector: lookVector})) {
          //player is in cone -> damage player
          //console.log("player is inside cone")
          clientList[i].hp -= mainAttackDamage[characterId];          
          sendAll({header: "playerHit", data: {playerId: clientList[i].id, damage: mainAttackDamage[characterId]}});

          if (clientList[i].hp <= 0) {
            //player died
            killPlayer(clientList[i].id);
            scoreBoard[playerId].score += 1;
            sendAll({header: "scoreBoardChange", data: {scoreBoard: scoreBoard}});


          }
        }
      }
    } else if (characterId == 4) { //coffee can
      //check if someone is hit by the raycast
      //console.log("attacking with coffee can!")
      raycaster = new THREE.Raycaster();
      raycaster.set(new THREE.Vector3(...clientList[clientListIndex].position), lookVector.normalize(), 0.1, 200);
      const intersects = raycaster.intersectObjects(scene.children);
      
      if (intersects.length > 0) {
        sendAll({header: "drawEffect", data: {effectType: 0,  color: 0xfcba03, startPosition: clientList[clientListIndex].position, endPosition: [intersects[0].point.x, intersects[0].point.y, intersects[0].point.z]}})
        if (intersects[0].object.name.indexOf("player") > -1) {
          //player got hit
          console.log(intersects[0].object.name.slice(10));
          const id = intersects[0].object.name.slice(10);
          
          //damage player
          clientList[clients.get(id)].hp -= mainAttackDamage[characterId]; 
          sendAll({header: "playerHit", data: {playerId: id, damage: mainAttackDamage[characterId]}});

          if (clientList[clients.get(id)].hp <= 0) {
            //player died
            killPlayer(id);
            scoreBoard[playerId].score += 1;
            sendAll({header: "scoreBoardChange", data: {scoreBoard: scoreBoard}});

          }
        }
      }
    }

    //send client how much ammu is left
    sendTo({header: "ammoDetails", data: {maxAmmo: mainAttackMaxAmmoCapacity[characterId], currentAmmo: clientList[clientListIndex].mainAttackInfo.ammunition, state: 0}}, clientList[clients.get(playerId)].ws);

  } else {
    //no ammo left
    sendAll({header: "drawEffect", data: {effectType: 1, playerId: playerId, action: 1}});
  }
}

function sanitizeInput(input) {
   return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}



function getSpawnPos() { //calculates spawn pos farthest away from any player
  let minDistance = {distance: 1000}
  let distanceToSpawn = {distance: 0, pos: [0, 0, 0]}

  mapObject.possibleSpawnPos.forEach((pos) => {
    //console.log(pos);
    minDistance.distance = 1000;
    clientList.forEach((player) => {
      if (player.isInGame) {
        let currentDistance = getDistanceBetweenArrayVector(player.position, pos)
        //console.log(currentDistance);
        if (currentDistance < minDistance.distance) {
          minDistance.distance = currentDistance;
        }
      }
    });
    if (minDistance.distance >= distanceToSpawn.distance) { //"=" damit default wert überschrieben wird, falls alle auf spawn sitzen bleiben
      distanceToSpawn.distance = minDistance.distance;
      distanceToSpawn.pos = pos;
    }
  });
  return distanceToSpawn.pos;
}

createScene();

wss.on('connection', (ws) => {
  const id = uuidv4();
 
  //sendet dem Client die Map Daten
  sendTo({header: "mapData", mapObject}, ws);
  sendTo({header: "yourPos", data: {position: menueSpawnPos, rotation: [0, 0, 0, 1], playerId: id, hp: 100}}, ws);

  scoreBoard[id] = {name: undefined, score: 0};

  //sendet dem neu gespawnten Spieler alle positionen und rotationen der Spieler
  clientList.forEach((player) => {
    sendTo({header: "newPlayer", data: {position: player.position, rotation: player.rotation, playerId: player.id, hp: player.hp}}, ws);
    if (player.isInGame) sendTo({header: "playerJoined", data: {position: player.position, playerId: player.id, characterId: player.characterId}}, ws);

  })

  //Den anderen Spielern wird mitgeteilt, dass ein neuer Spieler dabei ist
  console.log("id " + id  + " connected");
  sendAll({header: "newPlayer", data: {position: menueSpawnPos, rotation: 0, playerId: id, hp: 100}});

  //erstellt nachschlagetabelle, um herauszufinden, bei welchem index in clientList die Daten für eine id sind. 
  clients.set(id, clientList.length);

  //speichert infos, wie position, hp, usw. pro spieler
  clientList.push(new client(id, ws, menueSpawnPos, createBasicObject({size: playerSize, position: menueSpawnPos, id: "player" + id}, true), id));


  

  ws.on('message', (messageAsString) => {
    if (!isJSON(messageAsString)) return;

    let myclient = clientList[clients.get(id)];
    if (myclient == undefined) return; //es kann passieren, dass ein client disconnected und die events immer noch ankommen. Somit ist der client schon gelöscht aber es kommen noch sachen an. deswegen einfach ignorieren.

    const message = JSON.parse(messageAsString);

    //überprüfung, was für eine Art von Nachricht es ist
    if (message.header == "walkevent") {
      //ein spieler hat sich bewegt, neue position wird gespeichert und an den anderen spieler mitgeteilt
      //später muss hier noch anti cheat überprüfung rein.

      //yes this works and changes the values in clientList
      myclient.position = message.data.position;
      myclient.velocity = message.data.velocity;



      sendAll({header: "walkevent", data: {id: id, position: message.data.position, isGrounded: message.data.isGrounded}});
      moveObject(clientList[clients.get(id)].model, message.data.position);

    } else if(message.header == "sendingName") {
      //so no one can inject code via nicknames
      message.data.name = sanitizeInput(message.data.name);

      myclient.name = message.data.name;
      scoreBoard[id].name = message.data.name;
      //console.log(scoreBoard);
      sendAll({header: "scoreBoardChange", data: {scoreBoard: scoreBoard}});

    } else if (message.header == "rotateevent") {
      //ein spieler hat sich gedreht, den anderen wird das nun mitgeteilt
      //console.log(message.data.lookVector);

      myclient.rotation = message.data.rotation;
      myclient.cameraPos = message.data.cameraPos;
      myclient.lookVector = [message.data.lookVector.x, message.data.lookVector.y, message.data.lookVector.z];

      //console.log(clientList[clients.get(id)].lookVector);

      sendAll({header: "rotateevent", data: {playerId: id, rotation: message.data.rotation}});

    } else if (message.header == "mainAttack") {
      let attackType = characterMainWeaponType[message.data.characterId];
      let clientListIndex = clients.get(id);


      if (attackType == 0 || attackType == 2) { //0 = area attack, 2 = machine gun attack with hitscan; ammunition bar (like machine gun), shoots every x seconds an attack of type y (0: kettle (cone hitscan, limited range), 2: coffee can (straight hitscan, but only limited range))
        
        if (message.data.action == 1) { //player wants to start shooting
          
          if(myclient.mainAttackInfo == undefined) { //first time shooting, create mainAttackInfo
            clientList[clientListIndex].mainAttackInfo = {timeStampOfLastShot: 0, wantsToShoot: true, isCurrentlyShooting: false, interval: undefined, ammunition: mainAttackMaxAmmoCapacity[message.data.characterId], isReloading: false};
            myclient = clientList[clientListIndex];
          } 

          clientList[clientListIndex].mainAttackInfo.wantsToShoot = true;
          
          if (Date.now() - myclient.mainAttackInfo.timeStampOfLastShot > timeBetweenShots[message.data.characterId][0] * 1000) { 
            //enough time passed since last shot, start interval with shoot frequency
            clientList[clientListIndex].mainAttackInfo.isCurrentlyShooting = true;
            //console.log("started interval");

            //attack
            //console.log(clientList[clientListIndex].mainAttackInfo.ammunition);
            //console.log(message.data.characterId == 0);
            if (attackType == 0 && clientList[clientListIndex].mainAttackInfo.isReloading == false && clientList[clientListIndex].mainAttackInfo.ammunition > 0 && message.data.characterId == 0) sendAll({header: "drawEffect", data: {effectType: 1, playerId: id, action: 0}});

            attackForward(id, message.data.characterId, message.data.rotationCamera); //call attackForward manually the first time, because setInterval calls it not until after the specified wait time
            clearInterval(clientList[clientListIndex].mainAttackInfo.interval); //if there was a bug and the old interval was not deleted (maybe network fails...)
            clientList[clientListIndex].mainAttackInfo.interval = setInterval(attackForward, timeBetweenShots[message.data.characterId][0] * 1000, id, message.data.characterId, message.data.rotationCamera);

          } else {
            //not enough time has passed, wait until the next shot is ready
            console.log("waiting for next shot")
            setTimeout(() => {
              if (clientList[clientListIndex].mainAttackInfo.wantsToShoot) { //check if player still wants to shoot
                //enough time passed since last shot, start interval with shoot frequency
                clientList[clientListIndex].mainAttackInfo.isCurrentlyShooting = true;
                //console.log("started interval");

                //attack
                //console.log(clientList[clientListIndex].mainAttackInfo.ammunition > 0 && message.data.characterId == 0);
                if (attackType == 0 && clientList[clientListIndex].mainAttackInfo.isReloading == false && clientList[clientListIndex].mainAttackInfo.ammunition > 0 && message.data.characterId == 0) sendAll({header: "drawEffect", data: {effectType: 1, playerId: id, action: 0}});

                attackForward(id, message.data.characterId, message.data.rotationCamera); //call attackForward manually the first time, because setInterval calls it not until after the specified wait time
                clearInterval(clientList[clientListIndex].mainAttackInfo.interval); //if there was a bug and the old interval was not deleted (maybe network fails...)
                clientList[clientListIndex].mainAttackInfo.interval = setInterval(attackForward, timeBetweenShots[message.data.characterId][0] * 1000, id, message.data.characterId, message.data.rotationCamera);    
              }
            }, timeBetweenShots[message.data.characterId][0] * 1000 - (Date.now() - myclient.mainAttackInfo.timeStampOfLastShot))
          }

        } else { //player wants to stop shooting
          //clear interval
          if (attackType == 0) sendAll({header: "drawEffect", data: {effectType: 1, playerId: id, action: 1}}); //action 1 = stop shooting

          if (clientList[clientListIndex].mainAttackInfo == undefined) return; //should never happen, but still just in case check if its even defined
          //console.log("cleared interval");
          clearInterval(clientList[clientListIndex].mainAttackInfo.interval);
          clientList[clientListIndex].mainAttackInfo.wantsToShoot = false;
          clientList[clientListIndex].mainAttackInfo.isCurrentlyShooting = false;
          
        } 
        
      } else if (attackType == 1) { //projectiles slot ammunition (toaster, mixer, knifeblock) (one time shoot)

        //try to shoot with slot ammunition
        if (message.data.velocityFactor > 1) message.data.velocityFactor = 1; //anti cheat

        let maxVelocityVector = [0, 0.01, 0];

        if (message.data.characterId == 1) {
          const constFactor = 0.01;
          let factor = constFactor * message.data.velocityFactor;
          let ownSpeedFactor = 0.1;

          maxVelocityVector = [-message.data.rotationBody[0] * factor, 1 * constFactor * (message.data.velocityFactor * 0.3 + 0.7), -message.data.rotationBody[2] * factor]; //factor does not affect y axis, therefore, the projectile will follow a steep path with low factor -> no melee attack possible 
          maxVelocityVector = [maxVelocityVector[0] + myclient.velocity[0] * ownSpeedFactor, maxVelocityVector[1] +  myclient.velocity[1] * ownSpeedFactor, maxVelocityVector[2] +  myclient.velocity[2] * ownSpeedFactor];
        } else if (message.data.characterId == 2) {
          //mixer
          const constFactor = 0.01
          const factor = constFactor * (message.data.velocityFactor * 2 + 0.5);

          let lookVector = getLookVector(new THREE.Vector3(...clientList[clientListIndex].cameraPos), new THREE.Vector3(...clientList[clientListIndex].lookVector), new THREE.Vector3(...clientList[clientListIndex].position), 0.1, 200);
          lookVector = lookVector.normalize();
          //console.log(lookVector);
          maxVelocityVector = [lookVector.x * factor, lookVector.y * factor, lookVector.z * factor];

        } else if (message.data.characterId == 3) {
          //knife block
          const constFactor = 1;
          let lookVector = getLookVector(new THREE.Vector3(...clientList[clientListIndex].cameraPos), new THREE.Vector3(...clientList[clientListIndex].lookVector), new THREE.Vector3(...clientList[clientListIndex].position), 0.1, 200);
          lookVector = lookVector.normalize();
          //console.log(lookVector);
          maxVelocityVector = [lookVector.x * constFactor, lookVector.y * constFactor, lookVector.z * constFactor];


        }
        shootSlotAmmunition(message.data.characterId, id, maxVelocityVector);

      } else {
        console.log("attack type not found");
      }

    } else if (message.header == "joiningGame") {
      //spieler war vorher noch im menü, jetzt aber im game mit charakter

      let pos = getSpawnPos();

      clientList[clients.get(id)].isInGame = true;

      //console.log(pos);
      sendTo({header: "ammoDetails", data: {maxAmmo: mainAttackMaxAmmoCapacity[myclient.characterId], currentAmmo: mainAttackMaxAmmoCapacity[myclient.characterId], state: 0}}, myclient.ws);
      sendAll({header: "playerJoined", data: {position: pos, playerId: id, characterId: myclient.characterId}});

    } else if (message.header == "changedCharacter" ) {
      delete clientList[clients.get(id)].mainAttackInfo; //now a new character is used, clean up old data
      clientList[clients.get(id)].characterId = message.data.characterId;

    } else if (message.header == "reloading") {
      console.log("wants to reload")
      if (myclient.mainAttackInfo != undefined && (characterMainWeaponType[myclient.characterId] == 0 || characterMainWeaponType[myclient.characterId] == 2)) {
        if (myclient.mainAttackInfo.ammunition != mainAttackMaxAmmoCapacity[myclient.characterId] &&  myclient.mainAttackInfo.isReloading == false) {
          //begins reloading
          sendTo({header: "ammoDetails", data: {state: 1}}, myclient.ws);
          
          myclient.mainAttackInfo.isReloading = true;
          console.log("starts reloading")

          //reload
          setTimeout(() => {
            sendTo({header: "ammoDetails", data: {maxAmmo: mainAttackMaxAmmoCapacity[myclient.characterId], currentAmmo: mainAttackMaxAmmoCapacity[myclient.characterId], state: 0}}, myclient.ws);

            console.log("reloaded");
            myclient.mainAttackInfo.ammunition = mainAttackMaxAmmoCapacity[myclient.characterId];
            myclient.mainAttackInfo.isReloading = false;
          }, timeBetweenShots[myclient.characterId][1] * 1000) //*1000 because its in seconds and setTimeout wants milliseconds

        }
      }
    }
  });

  //falls ein client disconnected
  ws.on("close", () => {
    
    delete scoreBoard[id];
    sendAll({header: "scoreBoardChange", data: {scoreBoard: scoreBoard}});

    sendAll({header: "playerDisconnected", data: {playerId: id}}); //teilt den Clients mit, dass ein spieler gegangen ist
    scene.remove(clientList[clients.get(id)].model); //löscht das Model des Spielers, welches gebraucht wird, um Raycasts durchzuführen
    clientList.splice(clients.get(id), 1); //löscht den Listeneintrag ohne eine freie Stelle zurückzulassen
    recalculateClients(); //id zu index liste neu berechnen, da sich die Liste durch das Löschen eines Elementes verschoben hat.
    

    console.log(id + " diconnected. " + clientList.length + " Players remaining");

  });
});

//erstellt eine zufällige Id für einen neuen Client (es wäre theoretisch möglich 2 gleiche uuidv4s zu erstellen...), Funktion nicht von mir, quelle: https://ably.com/blog/web-app-websockets-nodejs
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

