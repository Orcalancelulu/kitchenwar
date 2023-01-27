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
  possibleSpawnPos: [[2, 0, 2], [5, 0, 5], [0, 3, 0]],
  cameraFly: {
    bezier: [[0, 5, 0], [10, 5, 0], [0, 5, 10], [10, 5, 10], [3, 10, 0]], 
    lookVector: [2, -10, 2]
  },  
  groundColor: 0xFFFFFF,
  objects: {
    cube778828: { //random id nummer
      id: 778828,
      shape: "cube",
      position: [0, 1, 0],
      size: [1.1, 1.1, 1.1], //width, height, depth
      color: 0x0000FF //blau
    },
    cube917322: { //random id nummer
      id: 917322,
      shape: "cube",
      position: [1, 1, 1],
      size: [0.5, 0.5, 0.5], //width, height, depth
      color: 0xFF0000 //rot
   }
  }
}
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
      }

      sendAll({header: "playerHit", data: {playerId: playerId, damage: damage}});
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
    sendTo({header: "playerJoined", data: {position: player.position, playerId: player.id}}, ws);

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
      sendAll({header: "playerJoined", data: {position: pos, playerId: id}})
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

