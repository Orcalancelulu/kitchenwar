import * as THREE from 'three';
import {PointerLockControls} from "PointerLockControls"


const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
let renderer;

let mapSize = 120; //mit einer mapSize von 120 * 120 und einer Chunkgrösse von 4*4 gibt es 30*30 Chunks --> 900 Chunks insgesamt
let chunkSize = 4;
let chunkXYToIndex;
let chunkList;

let mapData;

let playerList = [];

//anfang debugging
let amlight = new THREE.AmbientLight(0xFFFFFF, 0.1);
let polight = new THREE.PointLight(0xFFFFFF, 1);
let dilight = new THREE.DirectionalLight(0xFFFFFF, 1);

scene.add(amlight, dilight);
//ende debugging

const player = (nickname, position, rotation, walkVector) => {
  //nickname und position müssen gegeben werden, damit ein Player erstellt werden kann
  if (rotation == undefined) rotation = 0 //noch ändern #hilfe
  if (walkVector == undefined) walkVector = [0, 0] //erste Ziffer = vorne / hinten, zweite Ziffer = links / rechts

  this.nickname = nickname;
  this.position = position;
  this.rotation = rotation;
  this.walkVector = walkVector;
}

const createPlayer = (pos, id, myPlayer) => {
  let index;

  if (myPlayer) index = 0;
  playerList[0] = new player(id, pos);
}

const createCameraControl = () => {
    
  const controls = new PointerLockControls( camera, document.body );

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
  requestAnimationFrame(animate);
  //console.log(camera.position);
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
  createCameraControl();
  animate();
};

const coordsToString = (coords) => {
  return coords[0] + " " + coords[1];
}

const findChunkWithCoord = (coords2D) => {
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

  //console.log(object.position);
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


//anfang debugging
createGrid();

moveObject(polight, [-2, 0, 2]);
moveObject(camera, [3, 1, -3]);
moveObject(dilight, [-20, 10, -20]);
/*const helper = new THREE.CameraHelper( dilight.shadow.camera );
scene.add( helper );*/
//dilight.lookAt(new THREE.Vector3(0, 0, 0));
dilight.castShadow = true;
camera.lookAt(new THREE.Vector3(0, 0, 0));


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

  } else if(message.header == "mapData") {
    //als erstes schickt der server die map daten, damit die Map generiert werden kann. 
    mapData = message.mapObject;
    createScene(document.getElementById("bg"));
  } else if(message.header == "yourPos") {
    console.log("got my position");
    createPlayer(message.position, message.playerId);
  } else if(message.header == "newPlayer") {
    console.log("new player connected");
    createPlayer
  } else if (message.header == "playerDisconnected") {
    console.log("player disconnected");
  }
}





/*window.onbeforeunload = function(e) {
  return 'Dont go';
};*/
