import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  appearanceMode,
  initializeAppSession,
  nextAppearance,
  resetAppearancePreference,
  setAppearance,
} from '../src/lib/mock-data';

describe('appearance preferences', () => {
  beforeEach(() => {
    resetAppearancePreference();
  });

  it('should persist and apply selected appearance', () => {
    setAppearance('harbor');
    initializeAppSession();

    expect(appearanceMode()).toBe('harbor');
    expect(document.documentElement.dataset.skAppearance).toBe('harbor');
    expect(window.localStorage.getItem('startkit:appearance')).toBe('harbor');
  });

  it('should cycle appearance modes in stable order', () => {
    expect(nextAppearance('default')).toBe('harbor');
    expect(nextAppearance('harbor')).toBe('ink');
    expect(nextAppearance('ink')).toBe('default');
  });
});
