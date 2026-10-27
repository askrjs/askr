import { describe, it, expect, afterEach } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * Style objects reject values that load resources or run code, and nothing
 * else. Layout, transform, filter and shape functions are ordinary CSS and
 * must survive on the client and in SSR.
 */
describe('style object value sanitizer', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  const ordinary = {
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    transform: 'translate3d(1px, 2px, 3px) rotate3d(1, 0, 0, 45deg)',
    filter: 'blur(4px) drop-shadow(0 0 2px red)',
    backdropFilter: 'blur(2px)',
    clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
    paddingTop: 'env(safe-area-inset-top)',
    content: '"\\201C"',
  };

  const unsafe = {
    width: 'expression(alert(1))',
    backgroundImage: 'url(https://attacker.test/tracker.png)',
    maskImage: 'image-set("https://attacker.test/a.png" 1x)',
    // CSS escapes must not smuggle a blocked function past the check.
    borderImage: '\\75 rl(https://attacker.test/b.png)',
    listStyleImage: 'u\\000072l(/c.png)',
    // Characters removed from the written value must not rebuild a name.
    outline: 'ur{}l(//attacker.test/d.png)',
    cursor: 'u<>rl(//attacker.test/e.png)',
    borderImageSource: 'image-s{}et("//attacker.test/f.png" 1x)',
    // CSS folds CRLF into one newline, which the hex escape consumes.
    maskBorderSource: '\\75\r\nrl(//attacker.test/g.png)',
  };

  it('should keep ordinary CSS functions in client style objects', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    createIsland({
      root: mounted.container,
      component: () => <div style={{ ...ordinary, ...unsafe }}>x</div>,
    });
    flushScheduler();
    const style = mounted.container.querySelector('div')!.style;
    expect(style.getPropertyValue('grid-template-columns')).toBe(
      'repeat(3, minmax(0, 1fr))'
    );
    expect(style.getPropertyValue('transform')).toBe(
      'translate3d(1px, 2px, 3px) rotate3d(1, 0, 0, 45deg)'
    );
    expect(style.getPropertyValue('filter')).toBe(
      'blur(4px) drop-shadow(0 0 2px red)'
    );
    expect(style.getPropertyValue('backdrop-filter')).toBe('blur(2px)');
    expect(style.getPropertyValue('clip-path')).toBe(
      'polygon(0 0, 100% 0, 100% 100%)'
    );
    expect(style.getPropertyValue('content')).toBe('"\u201C"');
    expect(style.getPropertyValue('width')).toBe('');
    expect(style.getPropertyValue('background-image')).toBe('');
    expect(style.getPropertyValue('mask-image')).toBe('');
    expect(style.getPropertyValue('border-image')).toBe('');
    expect(style.getPropertyValue('list-style-image')).toBe('');
    const attribute =
      mounted.container.querySelector('div')!.getAttribute('style') ?? '';
    expect(attribute).not.toContain('attacker.test');
    expect(attribute).not.toContain('expression');
    expect(attribute).not.toContain('c.png');
    for (const name of ['d.png', 'e.png', 'f.png', 'g.png']) {
      expect(attribute).not.toContain(name);
    }
  });

  it('should keep ordinary CSS functions in SSR style objects', () => {
    const html = renderToStringSync(() => (
      <div style={{ ...ordinary, ...unsafe }}>x</div>
    ));
    expect(html).toContain('grid-template-columns:repeat(3, minmax(0, 1fr))');
    expect(html).toContain(
      'transform:translate3d(1px, 2px, 3px) rotate3d(1, 0, 0, 45deg)'
    );
    expect(html).toContain('filter:blur(4px) drop-shadow(0 0 2px red)');
    expect(html).toContain('backdrop-filter:blur(2px)');
    expect(html).toContain('clip-path:polygon(0 0, 100% 0, 100% 100%)');
    expect(html).toContain('padding-top:env(safe-area-inset-top)');
    expect(html).toContain('content:&quot;\\201C&quot;');
    expect(html).not.toContain('expression');
    expect(html).not.toContain('attacker.test');
    expect(html).not.toContain('c.png');
    for (const name of ['d.png', 'e.png', 'f.png', 'g.png']) {
      expect(html).not.toContain(name);
    }
    expect(html).not.toContain('width:');
  });

  it('should ignore inherited style declarations in SSR like the DOM renderer', () => {
    const style = Object.assign(Object.create({ color: 'red' }), {
      opacity: 0.5,
    });
    const html = renderToStringSync(() => <div style={style}>x</div>);
    expect(html).toContain('style="opacity:0.5;"');
    expect(html).not.toContain('color:red');
  });
});
