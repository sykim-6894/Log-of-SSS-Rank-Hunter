import * as Phaser from 'phaser';
import { shakeOn } from './sfx';

/** Where new objects go: the tower draws its map and its HUD with different cameras. */
type Place = <T extends Phaser.GameObjects.GameObject>(o: T) => T;
const asIs: Place = (o) => o;

/** Camera shake, unless the player turned it off in settings. */
export function shake(cam: Phaser.Cameras.Scene2D.Camera, ms: number, intensity: number) {
  if (shakeOn()) cam.shake(ms, intensity);
}

const CONFETTI = [0xe5ae46, 0xd0643a, 0x8fdc7a, 0x6fc6e0, 0xc98bff, 0xfff4e2];

/** Paper bits that burst from the top and flutter down over the screen. */
export function confetti(scene: Phaser.Scene, w: number, h: number, place: Place = asIs, count = 46) {
  for (let i = 0; i < count; i++) {
    const x = Phaser.Math.Between(0, w);
    const r = place(
      scene.add
        .rectangle(x, Phaser.Math.Between(-40, -4), Phaser.Math.Between(4, 7), Phaser.Math.Between(6, 10), Phaser.Utils.Array.GetRandom(CONFETTI))
        .setDepth(80)
        .setRotation(Math.random() * Math.PI),
    );
    scene.tweens.add({
      targets: r,
      y: h * Phaser.Math.FloatBetween(0.55, 1.05),
      x: x + Phaser.Math.Between(-60, 60),
      rotation: r.rotation + Phaser.Math.FloatBetween(-8, 8),
      delay: Phaser.Math.Between(0, 350),
      duration: Phaser.Math.Between(1300, 2200),
      ease: 'Sine.In',
      onComplete: () => r.destroy(),
    });
    scene.tweens.add({ targets: r, alpha: 0, delay: 1400, duration: 800 });
  }
}

/** Little squares thrown out from a point, for a monster breaking apart. */
export function debris(scene: Phaser.Scene, x: number, y: number, color: number, place: Place = asIs, count = 7, spread = 22) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const d = spread * Phaser.Math.FloatBetween(0.6, 1.2);
    const s = Phaser.Math.Between(2, 4);
    const r = place(scene.add.rectangle(x, y, s, s, color).setDepth(27));
    scene.tweens.add({
      targets: r,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d + 6,
      alpha: 0,
      duration: Phaser.Math.Between(260, 420),
      ease: 'Quad.Out',
      onComplete: () => r.destroy(),
    });
  }
}

/** Sparks rising around a point and a ring opening out, for a level up. */
export function sparkle(scene: Phaser.Scene, x: number, y: number, color: number, place: Place = asIs) {
  const ring = place(scene.add.circle(x, y, 8).setStrokeStyle(2, color, 1).setDepth(28));
  scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 520, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  for (let i = 0; i < 12; i++) {
    const sx = x + Phaser.Math.Between(-14, 14);
    const r = place(scene.add.rectangle(sx, y + Phaser.Math.Between(-4, 8), 2, 2, color).setDepth(28));
    scene.tweens.add({
      targets: r,
      y: r.y - Phaser.Math.Between(18, 40),
      alpha: 0,
      delay: Phaser.Math.Between(0, 250),
      duration: Phaser.Math.Between(450, 750),
      onComplete: () => r.destroy(),
    });
  }
}
