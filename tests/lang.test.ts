import { afterEach, describe, expect, it } from 'vitest';
import { englishOf, L, lang, romanizeName, setLang } from '../src/core/lang';

describe('language', () => {
  afterEach(() => setLang('ko'));

  it('defaults to Korean outside a browser', () => {
    expect(lang()).toBe('ko');
    expect(L('귀환하기', 'Return')).toBe('귀환하기');
    setLang('en');
    expect(L('귀환하기', 'Return')).toBe('Return');
  });

  it('spells Korean names in Latin letters', () => {
    expect(romanizeName('한서준')).toBe('Han Seojun');
    expect(romanizeName('남궁별')).toBe('Namgung Byeol');
    expect(romanizeName('이안')).toBe('Lee An');
  });

  it('turns leftover Korean from a save into English', () => {
    L('적월 길드', 'Red Moon Guild');
    expect(englishOf('적월 길드')).toBe('Red Moon Guild');
    expect(englishOf('천도결 · 적월 길드')).toBe('Cheon Dogyeol · Red Moon Guild');
    expect(englishOf('Plain text')).toBe('Plain text');
  });
});
