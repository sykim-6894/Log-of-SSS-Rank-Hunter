/** How the hunter is moved on a touch screen. Kept on this device only. */
export type MoveControl = 'joystick' | 'dpad';

const KEY = 'sss-hunter-move';

let mode: MoveControl = 'joystick';
try {
  if (window.localStorage.getItem(KEY) === 'dpad') mode = 'dpad';
} catch {
  // No storage: the default stays.
}

export function moveControl(): MoveControl {
  return mode;
}

export function setMoveControl(m: MoveControl) {
  mode = m;
  try {
    window.localStorage.setItem(KEY, m);
  } catch {
    // Private mode: the setting just lasts for this visit.
  }
}
