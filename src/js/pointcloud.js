import * as THREE from 'three';

// 顔の各部位の座標を受け取り、それをTHREE.jsのPointCloudとして描画するクラス
export class PointCloud {
  constructor() {
    this.bufferGeometry = new THREE.BufferGeometry();
    this.material = new THREE.PointsMaterial({
      color: 0x888888,
      size: 25
      // sizeAttenuation: true
    });
    this.cloud = new THREE.Points(this.bufferGeometry, this.material);
  }

  updateProperty(attribute, name) {
    this.bufferGeometry.setAttribute(name, attribute);
    this.bufferGeometry.attributes[name].needsUpdate = true;
  }
}
