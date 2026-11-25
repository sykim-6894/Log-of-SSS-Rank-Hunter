/**
 * Game language. Chosen once at start-up (switching reloads the page), so tables built at
 * import time already hold the right words.
 */
export type Lang = 'ko' | 'en';

export const LANG_KEY = 'sss-hunter-lang';

function initial(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(LANG_KEY);
    if (saved === 'ko' || saved === 'en') return saved;
    // Someone already playing before English existed keeps Korean.
    if (globalThis.localStorage?.getItem('sss-hunter-save-v1')) return 'ko';
    const nav = globalThis.navigator?.language;
    // A first visit follows the browser: Korean browsers get Korean, everyone else English.
    if (nav && typeof window !== 'undefined') return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  } catch {
    // No storage (tests, private mode): stay Korean.
  }
  return 'ko';
}

let current: Lang = initial();

export function lang(): Lang {
  return current;
}

/** For tests. The game itself switches by saving and reloading. */
export function setLang(l: Lang) {
  current = l;
}

/** Korean words that have an English form, so saved Korean text can still be shown in English. */
export const KNOWN = new Map<string, string>();

/** Pick the Korean or English wording. */
export function L(ko: string, en: string): string {
  if (ko !== en && ko.length >= 2) KNOWN.set(ko, en);
  return current === 'en' ? en : ko;
}

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const VOWELS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FINALS = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
const SURNAMES_2 = ['남궁', '제갈', '선우', '황보', '독고', '사공'];
const SURNAME_SPELL: Record<string, string> = { 이: 'Lee', 박: 'Park', 김: 'Kim', 최: 'Choi', 정: 'Jung', 강: 'Kang', 오: 'Oh', 신: 'Shin', 류: 'Ryu', 임: 'Lim', 노: 'Noh', 문: 'Moon', 백: 'Baek', 서: 'Seo', 윤: 'Yoon' };

function syllables(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) {
      out += ch;
      continue;
    }
    out += INITIALS[Math.floor(c / 588)] + VOWELS[Math.floor((c % 588) / 28)] + FINALS[c % 28];
  }
  return out;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "한서준" → "Han Seojun": a Korean name in Latin letters. */
export function romanizeName(name: string): string {
  if (!/^[가-힣]{2,4}$/.test(name)) return cap(syllables(name));
  const sl = SURNAMES_2.some((s) => name.startsWith(s)) && name.length >= 3 ? 2 : 1;
  const sur = name.slice(0, sl);
  return `${SURNAME_SPELL[sur] ?? cap(syllables(sur))} ${cap(syllables(name.slice(sl)))}`;
}

const HANGUL_RUN = /[가-힣]+/g;

/**
 * Text shown while playing in English that still holds Korean, such as names in a save
 * made in Korean: known words are translated, the rest (people's names) spelled out.
 */
export function englishOf(text: string): string {
  if (!/[가-힣]/.test(text) || text === '한국어') return text;
  const whole = KNOWN.get(text);
  if (whole) return whole;
  let out = text;
  const keys = [...KNOWN.keys()].filter((k) => out.includes(k)).sort((a, b) => b.length - a.length);
  for (const k of keys) out = out.split(k).join(KNOWN.get(k)!);
  return out.replace(HANGUL_RUN, (run) => romanizeName(run));
}
