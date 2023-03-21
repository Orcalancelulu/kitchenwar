const THREE = require("three");
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 7031 });

let clientList = [];
const scene = new THREE.Scene();

//let id;
const clients = new Map();

const raycaster = new THREE.Raycaster();

//zum debuggen mal hardcoded. später soll es noch aus einem file kommen
let menueSpawnPos = [-40, 5, -40];


let playerSize = [0.25, 1, 0.25];

let mapObject = {
  possibleSpawnPos: [[13.14, 0.33, 15.55], [35.17, 0.33, 11.7], [15.13, 0.33, 51.08], [14.68, 0.33, 63.64], [40.61, 0.33, 57.52], [12.45, 4.78, 44.91], [41.42, 4.85, 36.52], [17.76, 4.79, 10.88]],
  cameraFly: {
    bezier: [[17.94, 9.22, 16.18], [17.58, 9.29, 35.8], [30.17, 9.39, 71.5], [35.13, 5.09, 27.31], [18.95, 5.69, 28.14], [18.64, 9.32, 15.79]], 
    lookVector: [26.94, 3.02, 28.07]
  },  

  objects: {
  
    //applyForce List -> jump pads
    apFo2913: {position: [36, 0.5, 27.65], size: [0.5, 0.5, 0.5], actionOnCollision: "applyForce", forceVector: [0.1, 0.28, 0], isVisible: true, shape: "forcePad"},
    apFo8276: {position: [17.93, 0.5, 27.65], size: [0.5, 0.5, 0.5], actionOnCollision: "applyForce", forceVector: [-0.1, 0.28, 0], isVisible: true, shape: "forcePad"},

    //collider list, objects with collision
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
    coll823: {position: [13.558793645352125,2.5563001965879284,32.01962957660751], size: [4.193919338285923, 4.448986047010745, 28.82719327395897]}, //long box on west
    coll2889: {position: [26.994206063542094,8.380673888717753,8.852614256189973], size: [22.70342458766038, 16.097733431270395, 1.1458375620450205]}, //wall z on north
    coll9383: {position: [43.19464564323425,8.380673888717753,26.665369529704144], size: [1.1458378285169601, 16.097733431270395, 22.68193773265658]}, //wall x on east
    coll3537: {position: [22.052575407408618,8.380673888717753,47.62024521827698], size: [15.393472573393575, 16.097733431270395, 1.2209582328796316]}, //part of inwall west
    coll8858: {position: [37.082866815920354,8.380673888717753,47.62024521827698], size: [2.3746295195364553, 16.097733431270395, 1.2209582328796387]}, //part of inwall east
    coll3133: {position: [19.134719393357486,4.812144428491592,22.501889766090073], size: [8.450764917492176, 0.19999999552965164, 1.500000532832697]}, //brücke 1
    coll3959: {position: [28.713345229625702,4.8258392057925334,28.343778740468732], size: [1.5000003576278687, 0.17261044092776956, 10.011234067088587]} // brücke 2
  } 
}

/*  cube778828: { //random id nummer
      id: 778828,
      shape: "cube",
      position: [0, 1, 0],
      size: [1.1, 1.1, 1.1], //width, height, depth
      color: 0x0000FF, //blau
      isVisible: true
    },
    cube917322: { //random id nummer
      id: 917322,
      shape: "cube",
      position: [1.5, 1, 1],
      size: [0.5, 0.5, 0.5], //width, height, depth
      color: 0xFF0000, //rot 
      isVisible: true
   },
   
*/



//fertig hardcoded

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

function rayChecker(startVec, dirVec, near, far) {

  raycaster.set(startVec, dirVec, near, far);
  const intersects = raycaster.intersectObjects(scene.children);

  if (intersects.length > 0) {
    if (intersects[0].object.name.indexOf("player") >= 0) {
      let playerId = intersects[0].object.name.substring(10);
      if (!clientList[clients.get(playerId)].isInGame) return; //falls spieler per zufall per luftlinie auf spielerhaufen in standby schiesst, dann bitte kein schaden

      let damage = 10; //debugging, später noch anders
      clientList[clients.get(playerId)].hp -= damage;
      if (clientList[clients.get(playerId)].hp <= 0) {
        console.log("player: " + playerId + " died");
        sendAll({header: "putToStandby", data: {cause: "death", playerId: playerId}});
        clientList[clients.get(playerId)].isInGame = false;
        clientList[clients.get(playerId)].hp = 100; //debugging, später noch anders

        //aus dem Weg mit dem Spieler, damit er nicht Schüsse blockiert und so
        clientList[clients.get(playerId)].position = menueSpawnPos;
        moveObject(clientList[clients.get(playerId)].model, menueSpawnPos);
        
      } else {
        sendAll({header: "playerHit", data: {playerId: playerId, damage: damage}});
      }

    }
  }
}

//client Objekt Constructor (keine Ahnung ob das schöner geht)
function client(id, ws, position, model, rotation, hp) {
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

function getSpawnPos() { //calculates spawn pos farthest away from any player
  let minDistance = {distance: 1000}
  let distanceToSpawn = {distance: 0, pos: [0, 0, 0]}

  mapObject.possibleSpawnPos.forEach((pos) => {
    console.log(pos);
    minDistance.distance = 1000;
    clientList.forEach((player) => {
      if (player.isInGame) {
        let currentDistance = getDistanceBetweenArrayVector(player.position, pos)
        console.log(currentDistance);
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
  //chancen, dass es zwei gleiche uuidv4 gibt, sind ziemlich gering
  const id = uuidv4();
 
  //sendet dem Client die Map Daten
  sendTo({header: "mapData", mapObject}, ws);
  sendTo({header: "yourPos", data: {position: menueSpawnPos, rotation: [0, 0, 0, 1], playerId: id, hp: 100}}, ws)

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
  clientList.push(new client(id, ws, menueSpawnPos, createBasicObject({size: playerSize, position: menueSpawnPos, id: "player" + id}, true)));


  

  ws.on('message', (messageAsString) => {
    if (!isJSON(messageAsString)) return; //ziemlich hässlich aber funktioniert : )

    let myclient =  clientList[clients.get(id)];
    if (myclient == undefined) return; //es kann passieren, dass ein client disconnected und die events immer noch ankommen. Somit ist der client schon gelöscht aber es kommen noch sachen an. deswegen einfach ignorieren.

    const message = JSON.parse(messageAsString);

    //überprüfung, was für eine Art von Nachricht es ist
    if (message.header == "walkevent") {
      //ein spieler hat sich bewegt, neue position wird gespeichert und an den anderen spieler mitgeteilt
      //später muss hier noch anti cheat überprüfung rein.
      myclient.position = message.data.position;
      sendAll({header: "walkevent", data: {id: id, position: message.data.position, isGrounded: message.data.isGrounded}});
      moveObject(clientList[clients.get(id)].model, message.data.position);

    } else if (message.header == "rotateevent") {
      //ein spieler hat sich gedreht, den anderen wird das nun mitgeteilt
      myclient.rotation = message.data.rotation;
      sendAll({header: "rotateevent", data: {playerId: id, rotation: message.data.rotation}});

    } else if (message.header == "attacking") {
      //spieler schiesst irgendwo hin
      let startVec = new THREE.Vector3(message.data.position[0], message.data.position[1], message.data.position[2]);
      let dirVec = new THREE.Vector3(message.data.rotation[0], message.data.rotation[1], message.data.rotation[2]);
      rayChecker(startVec, dirVec, 0.01, 30);

    } else if (message.header == "joiningGame") {
      //spieler war vorher noch im menü, jetzt aber im game mit charakter

      let pos = getSpawnPos();

      clientList[clients.get(id)].isInGame = true;

      console.log(pos);
      sendAll({header: "playerJoined", data: {position: pos, playerId: id, characterId: myclient.characterId}});
    } else if (message.header == "changedCharacter" ) {
      clientList[clients.get(id)].characterId = message.data.characterId;
    }
  });

  //falls ein client disconnected
  ws.on("close", () => {
    sendAll({header: "playerDisconnected", data: {playerId: id}}); //teilt den Clients mit, dass ein spieler gegangen ist
    scene.remove(clientList[clients.get(id)].model); //löscht das Model des Spielers, welches gebraucht wird, um Raycasts durchzuführen
    clientList.splice(clients.get(id), 1); //löscht den Listeneintrag ohne eine freie Stelle zurückzulassen
    recalculateClients(); //id zu index liste neu berechnen, da sich die Liste durch das Löschen eines Elementes verschoben hat.
    

    console.log(id + " diconnected. " + clientList.length + " Players remaining");

  });
});

//erstellt eine zufällige Id für einen neuen Client (es wäre theoretisch möglich 2 gleiche uuidv4s zu erstellen...)
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

