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
import { localTarget, navigate } from '../../../src/router';
import { createRouteRegistry, route } from '../../../src/router/route';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

describe('same-origin navigation', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => cleanup());

  it('should throw for any cross-origin target when sameOrigin is set', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/next', () => <p>next</p>);
    });
    await createSPA({ root: container, registry });

    expect(() =>
      navigate('https://evil.example/path', { sameOrigin: true })
    ).toThrow(TypeError);
    expect(() => navigate('http://other.test/', { sameOrigin: true })).toThrow(
      TypeError
    );
    expect(() => navigate('//evil.example', { sameOrigin: true })).toThrow(
      TypeError
    );

    navigate(`${window.location.origin}/next`, { sameOrigin: true });
    await vi.waitFor(() => expect(container.textContent).toBe('next'));
  });

  it('should keep following explicit cross-origin targets without sameOrigin', async () => {
    const { loadDocument } =
      await import('../../../src/router/document-navigation');
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
    });
    await createSPA({ root: container, registry });
    navigate('https://example.com/away');
    expect(loadDocument).toHaveBeenCalledWith(
      'https://example.com/away',
      'push'
    );
  });

  it('should accept the current origin in absolute form', () => {
    expect(localTarget(`${window.location.origin}/dashboard?x=1#h`)).toBe(
      '/dashboard?x=1#h'
    );
    expect(localTarget('https://evil.example/dashboard')).toBe('/');
  });
});
