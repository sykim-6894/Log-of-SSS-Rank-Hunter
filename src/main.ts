import * as Phaser from 'phaser';
import './style.css';
import { HQScene } from './scenes/HQScene';
import { TitleScene } from './scenes/TitleScene';
import { skipTitleOnce } from './game/store';
import { TowerScene } from './scenes/TowerScene';
import { GH, GW, layoutStale, RES } from './game/layout';
import { playMusic, sfx, unlockAudio } from './game/sfx';
import { englishOf, lang } from './core/lang';

// Playing in English: Korean left in saved data (names, old news) is translated or spelled out.
if (lang() === 'en') {
  const proto = Phaser.GameObjects.Text.prototype as unknown as { setText(v: string | string[]): unknown };
  const setText = proto.setText;
  proto.setText = function (this: unknown, v: string | string[]) {
    const fix = (x: unknown) => (typeof x === 'string' ? englishOf(x) : x);
    return setText.call(this, (Array.isArray(v) ? v.map(fix) : fix(v)) as string);
  };
  document.title = 'Wanted: The Protagonist';
  document.documentElement.lang = 'en';
}

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
    width: GW * RES,
    height: GH * RES,
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
  (window as unknown as { sss: unknown }).sss = { game, music: playMusic, sfx };
}

start();
