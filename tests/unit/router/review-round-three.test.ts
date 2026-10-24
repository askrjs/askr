import { describe, expect, it, vi } from 'vite-plus/test';
import { resolveRouteMeta } from '../../../src/router/metadata';
import { createRouteRegistry, group, route } from '@askrjs/askr/router';
import { normalizeClassValue } from '../../../src/common/prop-classification';
import { warnUnknownEventProp } from '../../../src/common/dev-warnings';

describe('route metadata link merging', () => {
  it('should keep alternate links that differ only by hreflang', async () => {
    const registry = createRouteRegistry(() => {
      group(
        {
          meta: {
            links: [
              { rel: 'alternate', hreflang: 'x-default', href: '/en' },
              { rel: 'alternate', hreflang: 'en', href: '/en' },
            ],
          },
        },
        () => {
          route('/en', () => null, {
            meta: {
              links: [{ rel: 'alternate', hreflang: 'en', href: '/en' }],
            },
          });
        }
      );
    });
    const record = registry.manifest.records.find((r) => r.path === '/en')!;
    const meta = await resolveRouteMeta(record, {
      mode: 'spa',
      params: {},
      pathname: '/en',
      search: '',
      hash: '',
      href: '/en',
      auth: {
        authenticated: false,
        principal: null,
        session: null,
        tenant: null,
      },
      signal: new AbortController().signal,
    });
    expect(meta.links?.map((link) => link.hreflang).sort()).toEqual([
      'en',
      'x-default',
    ]);
  });
});

describe('class value collections', () => {
  it('should skip falsy numbers inside arrays and objects like clsx', () => {
    expect(normalizeClassValue([0 && 'has-items', 'a', NaN, 2])).toBe('a 2');
    expect(normalizeClassValue({ a: 0, b: 1 })).toBe('b');
  });
});

describe('unknown event prop warning', () => {
  it('should stay quiet for custom and unlisted events and warn only on near misses', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      warnUnknownEventProp('onMyEvent', 'myevent', 'div');
      warnUnknownEventProp(
        'onEnterPictureInPicture',
        'enterpictureinpicture',
        'video'
      );
      expect(warn).not.toHaveBeenCalled();
      warnUnknownEventProp('onClik', 'clik', 'button');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('onClick');
      expect(String(warn.mock.calls[0][0])).not.toContain('never runs');
    } finally {
      warn.mockRestore();
    }
  });
});
