const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 7071 });

let clientList = [];
//let id;
const clients = new Map();

//zum debuggen mal hardcoded. später soll es noch aus einem file kommen
let spawnPos = [1, 1, 1];

let mapObject = {
  skybox: 0x00FFFF,
  groundColor: 0xFFFFFF,
  objects: {
    cube778828: { //random id nummer
      id: 778828,
      shape: "cube",
      position: [0, 1, 0],
      size: [1, 1, 1], //width, height, depth
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

function recalculateClients() {
  clients.clear();
  let counter = 0;
  clientList.forEach((player) => {
    clients.set(player.id, counter);
    counter++;
  });
}

//client Objekt Constructor (keine Ahnung ob das schöner geht)
function client(id, ws, position, rotation, hp) {
  if (position == undefined) position = [0, 0, 0];
  if (rotation == undefined) rotation = 0;
  if (hp == undefined) hp = 100;

  this.id = id;
  this.ws = ws;
  this.position = position;
  this.rotation = rotation;
  this.hp = hp;
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

wss.on('connection', (ws) => {
  //chancen, dass es zwei gleiche uuidv4 gibt, sind ziemlich gering
  const id = uuidv4();

  //erstellt nachschlagetabelle, um herauszufinden, bei welchem index in clientList die Daten für eine id sind. 
  clients.set(id, clientList.length);

  //speichert infos, wie position, hp, usw. pro spieler
  clientList.push(new client(id, ws, spawnPos));

  //sendet dem Client die Map Daten
  sendTo({header: "mapData", mapObject}, ws);
  sendTo({header: "yourPos", data: {position: spawnPos, rotation: [0, 0, 0, 1], playerId: id}}, ws)

  //sendet dem neu gespawnten Spieler alle positionen und rotationen der Spieler
  clientList.forEach((player) => {
    sendTo({header: "newPlayer", data: {position: player.position, rotation: player.rotation, playerId: player.id}}, ws)
  })

  //Den anderen Spielern wird mitgeteilt, dass ein neuer Spieler dabei ist
  console.log("id " + clients.get(id) + " connected");
  sendAll({header: "newPlayer", data: {position: spawnPos, rotation: 0, playerId: id}});

    
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
      myclient.rotation = message.data.rotation;
      sendAll({header: "walkevent", data: {id: id, rotation: message.data.rotation, walkvector: message.data.walkvector}});

    } else if (message.header == "rotateevent") {
      //ein spieler hat sich gedreht, den anderen wird das nun mitgeteilt
      myclient.rotation = message.data.rotation;
      sendAll({header: "rotateevent", data: {id: id, rotation: message.data.rotation}});
    }
  });

  //falls ein client disconnected
  ws.on("close", () => {
    sendAll({header: "playerDisconnected", data: {playerId: id}}); //teilt den Clients mit, dass ein spieler gegangen ist
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

