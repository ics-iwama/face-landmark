import * as THREE from 'three';

// landmark-detectionに必要なnpmは下記参照
// https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection/src/mediapipe
// import '@mediapipe/face_mesh';
// import '@tensorflow/tfjs-core';
// // Register WebGL backend.
// import '@tensorflow/tfjs-backend-webgl';
// import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

// グローバルな変数定義
let decoImageList = ['hige', 'ribbon', 'rabbit', 'cat02', 'cat03', 'bear01']; // loadする画像のリスト
let decoLoadedImage = {}; // loadした画像を格納する
let decoImageRatios = {}; // 画像の縦横比を格納するオブジェクト
let buttonElements = document.querySelectorAll('.button');
let positionButtonElements = document.querySelectorAll('.position-controllerButton');
let currentDeco = 'rabbit'; // デフォルトのデコレーション

const videoWidth = 960;
const videoHeight = 540;
const canvasEl = document.querySelector('#canvas');
const videoEl = document.querySelector('#video');
let decoMesh;
let detector;
let results; // 検出した顔のリスト
let faceNormalVector;

let positionX = 0;
let positionY = 0;

let scene, camera, renderer;

// デコレーションごとの設定
const decoSettings = {
  hige: { scale: 30, basePoint: 164, xFix: 5, yFix: -20 },
  rabbit: { scale: 280, basePoint: 1, xFix: 10, yFix: -30 },
  ribbon: { scale: 70, basePoint: 0, xFix: 5, yFix: -5 },
  cat02: { scale: 180, basePoint: 1, xFix: 5, yFix: -20 },
  cat03: { scale: 190, basePoint: 1, xFix: 0, yFix: 0 },
  bear01: { scale: 180, basePoint: 1, xFix: 0, yFix: 0 },
};

// THREE.jsの初期設定を行う関数
function setupTHREE() {
  renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    alpha: true, //canvasの背景を透明にするために設定
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(videoWidth, videoHeight);
  renderer.setClearColor(0x000000, 0);

  // シーンを作成
  scene = new THREE.Scene();

  // カメラを作成
  const fov = 45;
  camera = new THREE.PerspectiveCamera(fov, videoWidth / videoHeight, 1, 1000);
  camera.position.set(0, 0, 680); //ここのzの値は手動調整。なんか計算式あるのかなあ..

  createDecoPlane();
}

// イベントリスナーを追加する関数
function addEventListeners() {
  buttonElements.forEach((el) => {
    el.addEventListener('click', (e) => {
      positionX = 0;
      positionY = 0;
      const selectedDeco = e.target.dataset.deco || e.target.parentElement.dataset.deco;
      currentDeco = selectedDeco;
      updateDecoPlane();
    });
  });

  positionButtonElements.forEach((el) => {
    el.addEventListener('click', (e) => {
      const position = e.target.dataset.position || e.target.parentElement.dataset.position;
      if (position === 'top') {
        positionY += 5;
      } else if (position === 'bottom') {
        positionY -= 5;
      } else if (position === 'right') {
        positionX -= 5;
      } else if (position === 'left') {
        positionX += 5;
      }
    });
  });
}

function loadDecoImages() {
  let imagesLoaded = 0;
  decoImageList.forEach((name) => {
    const img = new Image();
    img.onload = () => {
      decoLoadedImage[name] = img;
      decoImageRatios[name] = img.width / img.height;
      imagesLoaded++;
      if (imagesLoaded === decoImageList.length) {
        setupTHREE(); // 全ての画像がロードされたらTHREE.jsのセットアップを行う
        render(); // 毎フレームレンダリングを呼び出す
      }
    };
    img.src = `face-landmark/images/${name}.png`;
  });
}

// デコレーションのために使うplaneを作成
function createDecoPlane() {
  const settings = decoSettings[currentDeco];
  const ratio = decoImageRatios[currentDeco];
  const geometry = new THREE.PlaneGeometry(ratio, 1); // 縦横比を設定してジオメトリを作成
  const loader = new THREE.TextureLoader();
  const texture = loader.load(`face-landmark/images/${currentDeco}.png`, function(map) {
    map.colorSpace = THREE.SRGBColorSpace;
  });

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
  });

  decoMesh = new THREE.Mesh(geometry, material);
  decoMesh.scale.set(settings.scale, settings.scale, 0); // ここでサイズを調整する

  scene.add(decoMesh);
}

// デコレーションプレーンを更新する関数
function updateDecoPlane() {
  // 既存のデコレーションメッシュを削除
  if (decoMesh) {
    scene.remove(decoMesh);
    decoMesh.geometry.dispose();
    decoMesh.material.dispose();
    decoMesh = null;
  }
  // 新しいデコレーションメッシュを作成
  createDecoPlane();
}

// デコレーションのためのplaneの位置と回転、スケールを更新
function updateDecoMesh() {
  if (results && results.length > 0) {
    const quaternion = calcNormalVector(); // 顔の向きのベクトル（法線ベクトル）から回転を計算
    decoMesh.quaternion.copy(quaternion); // 向きを合わせる

    const settings = decoSettings[currentDeco];
    const fixData = fixLandmarkValue(results[0].keypoints); // three.jsで使える座標にする
    const basePoint = fixData[settings.basePoint];
    const faceCenter = new THREE.Vector3(
      basePoint.x + positionX + settings.xFix,
      basePoint.y + positionY + settings.yFix,
      basePoint.z - 150
    );

    const noseTip = fixData[1];  // インデックス1が鼻の中央に対応
    const rightEar = fixData[127]; // インデックス127が右耳に対応
    const leftEar = fixData[356];  // インデックス356が左耳に対応

    // 顔の傾きを計算する
    const dx = rightEar.x - leftEar.x;
    const dy = rightEar.y - leftEar.y;
    const angle = Math.atan2(dy, dx);

    // 鼻の中央から左右の耳までの距離を計算する
    const distanceToRightEar = Math.sqrt(Math.pow(noseTip.x - rightEar.x, 2) + Math.pow(noseTip.y - rightEar.y, 2));
    const distanceToLeftEar = Math.sqrt(Math.pow(noseTip.x - leftEar.x, 2) + Math.pow(noseTip.y - leftEar.y, 2));
    const earDistanceSum = distanceToRightEar + distanceToLeftEar;
    const baseEarDistanceSum = 200; // 基準となる鼻の中央から左右の耳までの距離の絶対値の合計

    // 鼻の中央から左右の耳までの距離の絶対値の合計に基づいてスケールを計算する（横向いたときに画像が小さくならないように）
    const scale = earDistanceSum / baseEarDistanceSum;

    decoMesh.scale.set(settings.scale * scale, -settings.scale * scale, 0); // スケールを適用

    // 画像の高さの半分を計算して、Y軸の位置を調整
    const imageHeight = settings.scale * scale; // PlaneGeometryの高さ * スケール
    faceCenter.y += imageHeight / 2; // 高さの半分をY軸に加算

    // 画像の回転中心を画像の中心に設定するため、X軸およびY軸方向のずれを調整
    const offsetX = imageHeight / 2 * Math.sin(angle); // 回転に伴うX方向のずれを計算
    faceCenter.x += offsetX; // X方向のずれを調整
    faceCenter.y -= offsetX * Math.sin(angle); // Y方向のずれを調整

    decoMesh.position.copy(faceCenter);

    decoMesh.rotation.z = angle; // 画像を回転
  }
}

// シーンをレンダリングする関数
function render() {
  renderer.render(scene, camera);

  detectFace(); // 顔を検知
  updateDecoMesh(); // デコレーション用のメッシュを更新

  requestAnimationFrame(render); // 毎フレームレンダリングを呼び出す
}

function calcNormalVector() {
  if (results && results.length > 0) {
    const fixData = fixLandmarkValue(results[0].keypoints);
    const noseTip = fixData[1];
    const leftNose = fixData[279];
    const rightNose = fixData[49];

    const midpoint = {
      x: (leftNose.x + rightNose.x) / 2,
      y: (leftNose.y + rightNose.y) / 2,
      z: (leftNose.z + rightNose.z) / 2
    };
    const perpendicularUp = {
      x: midpoint.x,
      y: midpoint.y - 10,
      z: midpoint.z,
    };

    faceNormalVector = new THREE.Vector3(noseTip.x, noseTip.y, noseTip.z)
      .sub(new THREE.Vector3(perpendicularUp.x, perpendicularUp.y, perpendicularUp.z))
      .normalize();

    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1.0), faceNormalVector);

    return quaternion;
  }
}

// Webカメラを有効にする関数
async function enableWebcam() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: videoWidth,
      height: videoHeight
    }
  });

  videoEl.srcObject = stream;

  return new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      resolve(videoEl);
    };
  });
}

// モデルをセットアップする関数
async function setupModel() {
  const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
  const detectorConfig = {
    runtime: 'mediapipe',
    solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh'
  };
  detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
}

// 顔を検知する関数。render内で実行する
async function detectFace() {
  const estimationConfig = { flipHorizontal: false };
  results = await detector.estimateFaces(videoEl, estimationConfig);
}

// face-landmark-detectionから取得したデータをthree.jsで扱いやすくするための関数
function fixLandmarkValue(data) {
  const depthStrength = 100;

  return data.map((el) => {
    return {
      x: el.x - videoWidth / 2,
      y: -el.y + videoHeight / 2,
      z: ((el.z / 100) * -1 + 1) * depthStrength
    };
  });
}

// 初期化関数
async function init() {
  addEventListeners(); // イベントリスナーを追加
  loadDecoImages(); // デコレーション画像の読み込みと縦横比の取得
  await enableWebcam(); // Webカメラの準備が整うのを待つ
  await setupModel(); // モデルのセットアップ
}

// 初期化関数を呼び出す
init();
