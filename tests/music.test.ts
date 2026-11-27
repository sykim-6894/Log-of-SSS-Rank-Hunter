import { describe, expect, it } from 'vitest';
import { chordNotes, midi, parseBar, TRACKS } from '../src/game/sfx';

describe('background music', () => {
  it('reads note and chord names', () => {
    expect(midi('A4')).toBe(69);
    expect(midi('C#5')).toBe(73);
    expect(midi('Bb4')).toBe(70);
    expect(chordNotes('Am')).toEqual([57, 60, 64]);
    expect(chordNotes('Bb')).toEqual([58, 62, 65]);
  });

  it('holds notes with dashes and skips rests', () => {
    expect(parseBar('E5 - - . G5 . C6 -')).toEqual([[0, 76, 3], [4, 79, 1], [6, 84, 2]]);
  });

  it('every track has whole bars of eight steps and valid chords', () => {
    for (const [id, t] of Object.entries(TRACKS)) {
      expect(t.melody.length, id).toBe(t.chords.length);
      for (const bar of t.melody) {
        expect(bar.trim().split(/\s+/).length, `${id}: ${bar}`).toBe(8);
        expect(() => parseBar(bar)).not.toThrow();
      }
      for (const c of t.chords) expect(() => chordNotes(c)).not.toThrow();
      for (const p of [t.bass, t.arp, t.kick, t.snare, t.hat]) if (p) expect(p.length, id).toBe(8);
    }
  });
});
