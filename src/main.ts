import * as Phaser from 'phaser';
import './style.css';
import { HQScene } from './scenes/HQScene';
import { TowerScene } from './scenes/TowerScene';

async function start() {
  // Pixel fonts must be ready before Phaser draws any text.
  await Promise.all([
    document.fonts.load('12px Galmuri11'),
    document.fonts.load('bold 12px Galmuri11'),
    document.fonts.load('15px Galmuri14'),
  ]).catch(() => undefined);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 960,
    height: 720,
    backgroundColor: '#14110f',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [HQScene, TowerScene],
  });

  // Handy for debugging in the browser console.
  (window as unknown as { sss: unknown }).sss = { game };
}

start();
