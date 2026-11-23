import * as Phaser from 'phaser';
import { HQScene } from './scenes/HQScene';
import { TowerScene } from './scenes/TowerScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 720,
  backgroundColor: '#0d0f14',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [HQScene, TowerScene],
});

// Handy for debugging in the browser console.
(window as unknown as { sss: unknown }).sss = { game };
