const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 7071 });

let clientList = [];
const clients = new Map();

//zum debuggen mal hardcoded. später soll es noch aus einem file kommen
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
  if (typeof(jsonData) != "string") return false;
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
  clientList.push(new client(id, ws));

  //sendet dem Client die Map Daten
  sendTo({header: "mapData", mapObject}, ws);
  sendTo({header: "yourPos", data: {position: [10, 0, 10], rotation: 0, playerId: id}}, ws)

  console.log("id " + clients.get(id) + " connected");

    
  ws.on('message', (messageAsString) => {
    if (!isJSON(messageAsString)) return;
    const message = JSON.parse(messageAsString);
  });


  ws.on("close", () => {
    console.log(clientList);
    clientList.splice(clients.get(id), 1);
    clients.delete(id);
    console.log(clientList);
  });
});


function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

