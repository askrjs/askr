import { resetRouteState } from '../../router-test-utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, route } from '../../../src/router/route';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

/**
 * Head metadata belongs to the current route. A destination that declares
 * none removes what the previous route wrote and restores the document's
 * own title, language and direction; a static shell title is updated in
 * place rather than shadowed by a second `<title>`.
 */
describe('route metadata reconciliation', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
  });

  afterEach(() => {
    cleanup();
    for (const node of Array.from(
      document.head.querySelectorAll('title, [data-askr-head]')
    )) {
      node.remove();
    }
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
  });

  it('should clear the previous route metadata when the destination declares none', async () => {
    window.history.replaceState({}, '', '/with-meta');
    const registry = createRouteRegistry(() => {
      route('/with-meta', () => <p>meta</p>, {
        meta: {
          title: 'With meta',
          description: 'described',
          robots: 'noindex',
          html: { lang: 'fr', dir: 'rtl' },
        },
      });
      route('/plain', () => <p>plain</p>);
    });

    await createSPA({ root: container, registry });
    expect(document.title).toBe('With meta');
    expect(document.documentElement.getAttribute('lang')).toBe('fr');

    navigate('/plain');
    await vi.waitFor(() =>
      expect(container.querySelector('p')?.textContent).toBe('plain')
    );

    expect(document.title).toBe('');
    expect(document.head.querySelector('[name="description"]')).toBeNull();
    expect(document.head.querySelector('[name="robots"]')).toBeNull();
    expect(document.documentElement.hasAttribute('lang')).toBe(false);
    expect(document.documentElement.hasAttribute('dir')).toBe(false);
  });

  it('should leave a language or title the application set itself alone', async () => {
    const shellTitle = document.createElement('title');
    shellTitle.textContent = 'Shell';
    document.head.append(shellTitle);
    document.documentElement.setAttribute('lang', 'en');
    window.history.replaceState({}, '', '/titled');
    const registry = createRouteRegistry(() => {
      route('/plain', () => <p>plain</p>);
      route('/titled', () => <p>titled</p>, {
        meta: { title: 'Titled', html: { lang: 'de' } },
      });
    });

    await createSPA({ root: container, registry });
    expect(document.title).toBe('Titled');
    expect(document.documentElement.getAttribute('lang')).toBe('de');

    // An i18n layer or unread badge changes what the router wrote.
    document.documentElement.setAttribute('lang', 'es');
    shellTitle.textContent = '(3) Titled';

    navigate('/plain');
    await vi.waitFor(() =>
      expect(container.querySelector('p')?.textContent).toBe('plain')
    );
    expect(document.documentElement.getAttribute('lang')).toBe('es');
    expect(document.title).toBe('(3) Titled');
  });

  it('should update a static shell title in place and restore it afterwards', async () => {
    const shellTitle = document.createElement('title');
    shellTitle.textContent = 'Shell';
    document.head.append(shellTitle);
    document.documentElement.setAttribute('lang', 'en');
    window.history.replaceState({}, '', '/plain');
    const registry = createRouteRegistry(() => {
      route('/plain', () => <p>plain</p>);
      route('/titled', () => <p>titled</p>, {
        meta: { title: 'Titled', html: { lang: 'de' } },
      });
    });

    await createSPA({ root: container, registry });
    expect(document.title).toBe('Shell');

    navigate('/titled');
    await vi.waitFor(() => expect(document.title).toBe('Titled'));
    expect(document.head.querySelectorAll('title')).toHaveLength(1);
    expect(document.head.querySelector('title')).toBe(shellTitle);
    expect(document.documentElement.getAttribute('lang')).toBe('de');

    navigate('/plain');
    await vi.waitFor(() => expect(document.title).toBe('Shell'));
    expect(document.head.querySelectorAll('title')).toHaveLength(1);
    expect(document.documentElement.getAttribute('lang')).toBe('en');
  });
});
