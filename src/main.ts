import * as Phaser from 'phaser';
import './style.css';
import { HQScene } from './scenes/HQScene';
import { TitleScene } from './scenes/TitleScene';
import { skipTitleOnce } from './game/store';
import { TowerScene } from './scenes/TowerScene';
import { GH, GW, layoutStale } from './game/layout';
import { unlockAudio } from './game/sfx';

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
    width: GW,
    height: GH,
    backgroundColor: '#14110f',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [TitleScene, HQScene, TowerScene],
  });

  // Browsers only start audio after a touch or key press.
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // After a rotation, switch layouts the next time the player is back at the office
  // (a reload is safe there because everything is saved; a tower run is not).
  window.addEventListener('resize', () => {
    if (layoutStale() && game.scene.isActive('HQ')) {
      skipTitleOnce();
      location.reload();
    }
  });

  // Handy for debugging in the browser console.
  (window as unknown as { sss: unknown }).sss = { game };
}

start();
