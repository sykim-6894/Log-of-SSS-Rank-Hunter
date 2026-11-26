import type * as Phaser from 'phaser';
/**
 * Screen layout, chosen once at start-up: a tall phone held upright gets the portrait
 * layout (450 wide, height follows the screen), everything else the 960×720 landscape one.
 */
const isPortrait = () => window.innerHeight > window.innerWidth;

export const PORTRAIT = isPortrait();
export const GW = PORTRAIT ? 450 : 960;
export const GH = PORTRAIT ? Math.max(760, Math.min(1000, Math.round((450 * window.innerHeight) / window.innerWidth))) : 720;

/** True when the device was rotated since start-up, so the layout no longer matches. */
export function layoutStale() {
  return isPortrait() !== PORTRAIT;
}

/**
 * Drawing scale. The game is laid out in GW×GH points but drawn RES times larger, so text
 * and edges stay sharp on phones (where the canvas is stretched to a high-density screen)
 * instead of being blown up from a small picture. Cameras zoom by RES to keep the layout.
 */
export const RES = (() => {
  const fit = Math.min(window.innerWidth / GW, window.innerHeight / GH);
  return Math.max(1, Math.min(3, Math.ceil((window.devicePixelRatio || 1) * fit - 0.05)));
})();

/** Points a camera at the GW×GH layout, drawn at RES. Viewport is given in layout points. */
export function fitCamera(cam: Phaser.Cameras.Scene2D.Camera, x = 0, y = 0, w = GW, h = GH, zoom = 1) {
  cam.setViewport(x * RES, y * RES, w * RES, h * RES).setZoom(zoom * RES);
  if (zoom === 1) cam.centerOn(x + w / 2, y + h / 2);
  return cam;
}

/** A pointer position in layout points. */
export function pointerAt(p: { x: number; y: number }) {
  return { x: p.x / RES, y: p.y / RES };
}
