import { describe, expect, it } from 'vitest';
import { translate } from './i18n';
import { migrateUserData } from './storage/schema';

describe('translate', () => {
  it('returns English text unchanged and fills placeholders', () => {
    expect(translate('Calculator', 'en')).toBe('Calculator');
    expect(translate('Server: {server}', 'en', { server: 'Zikel SA' })).toBe('Server: Zikel SA');
  });

  it('translates exact keys to Portuguese', () => {
    expect(translate('Calculator', 'pt')).toBe('Calculadora');
  });

  it('translates dynamic messages through templates', () => {
    expect(translate('Line 3: Row has neither an item id nor an item name.', 'pt')).toContain('Linha 3');
  });

  it('falls back to the original text when unknown', () => {
    expect(translate('Totally unknown text', 'pt')).toBe('Totally unknown text');
  });
});

describe('language settings', () => {
  it('fills missing language settings and rejects invalid values', () => {
    const r = migrateUserData({ schemaVersion: 2, settings: { uiLanguage: 'xx' } });
    expect(['en', 'pt']).toContain(r.data.settings.uiLanguage);
    expect(['en', 'pt']).toContain(r.data.settings.itemNameLanguage);
  });
});

