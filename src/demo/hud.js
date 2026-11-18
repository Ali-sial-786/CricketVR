// Scoreboard panel drawn on a canvas texture (readable from the crease).
import * as THREE from 'three';

export class Hud {
  constructor(scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true }),
    );
    scene.add(this.mesh);
    this.state = { runs: 0, balls: 0, headline: 'Take guard', detail: 'Hold the bat still in your stance', status: '', running: 0, flash: 0 };
    this.dirty = true;
  }

  place(battingHand) {
    const side = battingHand === 'left' ? -1 : 1;
    this.mesh.position.set(-1.8 * side, 2.7, -7);
    this.mesh.lookAt(0, 1.6, 0);
  }

  set(patch) {
    Object.assign(this.state, patch);
    this.dirty = true;
  }

  draw() {
    if (!this.dirty) return;
    this.dirty = false;
    const g = this.ctx;
    const { width: W, height: H } = this.canvas;
    const s = this.state;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(12, 22, 16, 0.82)';
    roundRect(g, 0, 0, W, H, 40);
    g.fill();
    g.fillStyle = '#e0b04a';
    g.font = 'bold 64px system-ui, sans-serif';
    g.fillText(`${s.runs} runs`, 48, 96);
    g.fillStyle = '#9fb3a6';
    g.font = '40px system-ui, sans-serif';
    g.fillText(`${s.balls} balls`, W - 250, 92);
    g.fillStyle = s.flash > 0 ? '#ffffff' : '#eef3ee';
    g.font = 'bold 96px system-ui, sans-serif';
    g.fillText(s.headline, 48, 232);
    g.font = '46px system-ui, sans-serif';
    g.fillStyle = '#cfe0d4';
    g.fillText(s.detail, 48, 310);
    if (s.running > 0) {
      g.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(g, 48, 352, W - 96, 34, 17);
      g.fill();
      g.fillStyle = '#e0b04a';
      roundRect(g, 48, 352, (W - 96) * Math.min(1, s.running), 34, 17);
      g.fill();
    }
    g.font = '34px system-ui, sans-serif';
    g.fillStyle = '#9fb3a6';
    g.fillText(s.status, 48, 456);
    this.texture.needsUpdate = true;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
