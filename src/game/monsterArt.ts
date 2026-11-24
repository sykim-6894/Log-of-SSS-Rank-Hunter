import * as Phaser from 'phaser';

/**
 * Pixel sprites for monsters: 12×12 for ordinary ones, 16×16 for bosses.
 * Each letter is a color from the sprite's palette; '.' is see-through; k is the shared dark outline.
 * Mid-bosses reuse the ordinary sprite, drawn bigger and tinted gold.
 */
interface Sprite {
  rows: string[];
  colors: Record<string, number>;
}

const K = 0x1a1410;

const SPRITES: Record<string, Sprite> = {
  goblin: {
    colors: { g: 0x6fae4a, y: 0xe8e0c0, b: 0x7a5a3a, w: 0xcfcfcf },
    rows: [
      '............',
      '....gggg....',
      '...gggggg...',
      '.gg.kggk.gg.',
      '..gggggggg..',
      '...gyyyyg...',
      '....gggg..w.',
      '...bbbbbb.w.',
      '..g.bbbb.gw.',
      '....bbbb....',
      '....g..g....',
      '...kk..kk...',
    ],
  },
  archer: {
    colors: { g: 0x6fae4a, h: 0x4f6a3a, b: 0x7a5a3a, w: 0xa87a4a, s: 0xe8e0c0 },
    rows: [
      '...........w',
      '....hhhh..w.',
      '...hhhhhh.ws',
      '.gg.kggk.gws',
      '..gggggggw.s',
      '...gggggw..s',
      '....ggggw..s',
      '...bbbbbbw.s',
      '..g.bbbb.gws',
      '....bbbb...w',
      '....g..g....',
      '...kk..kk...',
    ],
  },
  wolf: {
    colors: { g: 0x8a8f96, d: 0x5f646b, w: 0xe0e0e0 },
    rows: [
      '............',
      '.........d.d',
      '........gggg',
      '........ggkg',
      'd.......gggw',
      'dggggggggg..',
      '.gggggggggd.',
      '..dggggggg..',
      '..g.g..g.g..',
      '..g.g..g.g..',
      '..k.k..k.k..',
      '............',
    ],
  },
  orc: {
    colors: { o: 0x7a8a4a, y: 0xf0e8d0, m: 0x6a4a3a, a: 0xb0b0b0, h: 0x7a5a3a },
    rows: [
      '..oooooo..a.',
      '.oooooooo.aa',
      '.okooooko.aa',
      '.oooooooo.h.',
      '..oyooyo..h.',
      '.mmmmmmmmmh.',
      'ommmmmmmmmo.',
      'o.mmmmmm.o..',
      '..mmmmmm....',
      '..oo..oo....',
      '..oo..oo....',
      '.kkk..kkk...',
    ],
  },
  lizard: {
    colors: { l: 0x4a9a7a, d: 0x2f6a52, w: 0xc0c0c0, y: 0xe0c060 },
    rows: [
      '.......lll.w',
      '......lklllw',
      '......lllyyw',
      '.....llll..w',
      '...dllllll.w',
      '..llllll.l.w',
      '.l.dllll.lw.',
      '...llll....w',
      '...l..l.....',
      'l..l..l.....',
      'll.kk.kk....',
      '.l..........',
    ],
  },
  knight: {
    colors: { n: 0x4a4560, r: 0xd04040, p: 0x6a2a4a, w: 0xc8c8d8 },
    rows: [
      '....nnnn....',
      '...nnnnnn...',
      '...nrrrrn...',
      '...nnnnnn..w',
      '.ppnnnnnnppw',
      '.pnnnnnnnnpw',
      '.pnnnnnnnn.w',
      '.p.nnnnnn.nn',
      '...nn..nn...',
      '...nn..nn...',
      '...nn..nn...',
      '..kkk..kkk..',
    ],
  },
  shaman: {
    colors: { o: 0x7fd6c9, w: 0x8a5a2b, p: 0x9a6ab0, r: 0x5a2a6a, g: 0xe5ae46 },
    rows: [
      '.o..........',
      'ooo..ppp....',
      '.w..ppppp...',
      '.w..pkpkp...',
      '.w..ppppp...',
      '.wrrrrrrrr..',
      '.w.rrggrr...',
      '.w.rrrrrr...',
      '.w.rrrrrr...',
      '.w.rrrrrr...',
      '.w..rrrr....',
      '.w..k..k....',
    ],
  },
  beast: {
    colors: { b: 0x8a3a2a, h: 0xe0d0b0, w: 0xf0f0e0, y: 0xf0c040 },
    rows: [
      '.h........h.',
      '.hh......hh.',
      '..bbbbbbbb..',
      '.bybbbbbbyb.',
      '.bbbbbbbbbb.',
      '.bbwbwwbwbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bb.bb..bb.bb',
      'bb.bb..bb.bb',
      'kk.kk..kk.kk',
      '............',
    ],
  },
  warden: {
    colors: { s: 0x8a8270, d: 0x5f5848, y: 0x7fd6c9 },
    rows: [
      '................',
      '.....ssssss.....',
      '....ssssssss....',
      '....syyssyys....',
      '....ssssssss....',
      '..dsssssssssd...',
      '.ssssssssssssss.',
      'ss.ssyyyyyyss.ss',
      'ss.ssyyyyyyss.ss',
      'ss.ssssssssss.ss',
      'dd.ssssssssss.dd',
      '...sssss.sssss..',
      '...ssss...ssss..',
      '...ssss...ssss..',
      '..ddddd...ddddd.',
      '................',
    ],
  },
  overlord: {
    colors: { g: 0xe5ae46, r: 0xb04030, c: 0x3a1a4a, m: 0x2a2a3a, e: 0xf0e060 },
    rows: [
      '....g..g..g.....',
      '....gggggggg....',
      '....rrrrrrrr....',
      '....rerrrrer....',
      '....rrrrrrrr....',
      '.....rrrrrr.....',
      '..ccmmmmmmmmcc..',
      '.ccmmmmmmmmmmcc.',
      '.cmmmmggmmmmmmc.',
      '.cmmmmmmmmmmmmc.',
      '.crmmmmmmmmmmrc.',
      '.c.mmmmmmmmmm.c.',
      '...mmmm..mmmm...',
      '...mmmm..mmmm...',
      '..kkkkk..kkkkk..',
      '................',
    ],
  },
  dragon: {
    colors: { d: 0xa03a2a, w: 0x6a2a2a, b: 0xe0b060, y: 0xf0a030, e: 0xf0e060 },
    rows: [
      '................',
      '...........ddd..',
      '..........ddedd.',
      '.w.......ddddddy',
      '.ww.....dddddd.y',
      '.www...dddd.....',
      '.wwwwddddddd....',
      '..wwddddddddd...',
      '...dddddddddd...',
      '..ddbbbbbbddd...',
      '.dddbbbbbbdd....',
      'dd.ddddddddd....',
      'd..dd...dd......',
      '...dd...dd......',
      '..kkk..kkk......',
      '................',
    ],
  },
  stalker: {
    colors: { c: 0x2a1838, d: 0x4a2a66, p: 0x8a5cc0, r: 0xff4040 },
    rows: [
      '......dddd......',
      '.....dccccd.....',
      '....dccccccd....',
      '....dcrccrcd....',
      '....dccccccd....',
      '...ddcccccccd...',
      '..dcccpcccpccd..',
      '.dcccccpcpcccd..',
      '.dccccccpccccd..',
      'dccdcccccccdccd.',
      'dc.dcccccccd.cd.',
      'p..dcccccccd..p.',
      '...dccccccccd...',
      '..dcccccccccd...',
      '.dcc.dcc.dcccd..',
      'd...d...d....d..',
    ],
  },
  master: {
    colors: { o: 0xf0e060, h: 0x2a2a2a, e: 0xf0e060, a: 0xe0e0e8, g: 0xe5ae46 },
    rows: [
      '.......o........',
      '......ooo.......',
      '.....hhhhh......',
      '....hhhhhhh.....',
      '....hehhheh.....',
      '....hhhhhhh.....',
      '..aaaaaaaaaaa...',
      '.aaagaaaaagaaa..',
      'aa.aaaaaaaaa.aa.',
      'a..aaaaaaaaa..a.',
      '...aaaaggaaa....',
      '...aaaaaaaaa....',
      '..aaaaaaaaaaa...',
      '..aaaaaaaaaaa...',
      '.aaaaaaaaaaaaa..',
      '................',
    ],
  },
};

/** The sprite a monster kind uses: mid-bosses ("elite-orc") share the ordinary one. */
function baseId(kindId: string): string {
  return kindId.startsWith('elite-') ? kindId.slice(6) : kindId;
}

export function hasMonsterArt(kindId: string): boolean {
  return baseId(kindId) in SPRITES;
}

/** Makes the texture the first time it is needed (2 screen pixels per sprite pixel). */
export function monsterTexture(scene: Phaser.Scene, kindId: string): string {
  const id = baseId(kindId);
  const key = `monster-${id}`;
  if (!scene.textures.exists(key)) {
    const s = SPRITES[id];
    const g = scene.add.graphics();
    const colors: Record<string, number> = { k: K, ...s.colors };
    s.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = colors[row[x]];
        if (c !== undefined) g.fillStyle(c, 1).fillRect(x * 2, y * 2, 2, 2);
      }
    });
    g.generateTexture(key, s.rows[0].length * 2, s.rows.length * 2);
    g.destroy();
  }
  return key;
}
