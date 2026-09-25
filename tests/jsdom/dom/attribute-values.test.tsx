import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  captureSSRSnapshot,
} from '../../../test-utils/render/test-renderer';

const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

describe('attribute name and value serialization', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  function renderDOM(Component: () => unknown): void {
    createIsland({ root: container, component: Component });
    flushScheduler();
  }

  describe('camelCase SVG attributes', () => {
    const SvgShapes = () => (
      <svg viewBox="0 0 10 10" xmlnsXlink="http://www.w3.org/1999/xlink">
        <defs>
          <linearGradient id="g" gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor="red" stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <path
          d="M0 0h10"
          strokeDasharray="4 2"
          strokeDashoffset={1}
          strokeMiterlimit={4}
          strokeOpacity={0.5}
          fillOpacity={0.25}
          clipPath="url(#c)"
          markerEnd="url(#m)"
          vectorEffect="non-scaling-stroke"
        />
        <text textAnchor="middle" dominantBaseline="central" fontSize={3}>
          x
        </text>
        <use xlinkHref="#g" xmlSpace="preserve" />
      </svg>
    );

    it('should render SVG presentation attributes by their hyphenated names in the DOM', () => {
      renderDOM(SvgShapes);

      const path = container.querySelector('path')!;
      expect(path.getAttribute('stroke-dasharray')).toBe('4 2');
      expect(path.getAttribute('stroke-dashoffset')).toBe('1');
      expect(path.getAttribute('stroke-miterlimit')).toBe('4');
      expect(path.getAttribute('stroke-opacity')).toBe('0.5');
      expect(path.getAttribute('fill-opacity')).toBe('0.25');
      expect(path.getAttribute('clip-path')).toBe('url(#c)');
      expect(path.getAttribute('marker-end')).toBe('url(#m)');
      expect(path.getAttribute('vector-effect')).toBe('non-scaling-stroke');
      expect(path.getAttribute('strokeDasharray')).toBeNull();

      const stop = container.querySelector('stop')!;
      expect(stop.getAttribute('stop-color')).toBe('red');
      expect(stop.getAttribute('stop-opacity')).toBe('0.5');

      const text = container.querySelector('text')!;
      expect(text.getAttribute('text-anchor')).toBe('middle');
      expect(text.getAttribute('dominant-baseline')).toBe('central');
      expect(text.getAttribute('font-size')).toBe('3');

      // Attributes that really are camelCase in SVG stay camelCase.
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe(
        '0 0 10 10'
      );
      expect(
        container.querySelector('linearGradient')!.getAttribute('gradientUnits')
      ).toBe('userSpaceOnUse');
    });

    it('should write xlink: and xml: attributes in their XML namespaces in the DOM', () => {
      renderDOM(SvgShapes);

      const use = container.querySelector('use')!;
      expect(use.getAttributeNS(XLINK_NAMESPACE, 'href')).toBe('#g');
      expect(use.getAttribute('xlink:href')).toBe('#g');
      expect(use.getAttributeNS(XML_NAMESPACE, 'space')).toBe('preserve');
      expect(use.getAttribute('xlinkHref')).toBeNull();
      expect(container.querySelector('svg')!.getAttribute('xmlns:xlink')).toBe(
        XLINK_NAMESPACE
      );
    });

    it('should serialize SVG presentation and namespaced attributes by their real names in SSR', async () => {
      const html = await captureSSRSnapshot(SvgShapes);

      expect(html).toContain(
        '<svg viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink">'
      );
      expect(html).toContain(
        '<stop offset="0" stop-color="red" stop-opacity="0.5">'
      );
      expect(html).toContain(
        '<path d="M0 0h10" stroke-dasharray="4 2" stroke-dashoffset="1" stroke-miterlimit="4" stroke-opacity="0.5" fill-opacity="0.25" clip-path="url(#c)" marker-end="url(#m)" vector-effect="non-scaling-stroke">'
      );
      expect(html).toContain(
        '<text text-anchor="middle" dominant-baseline="central" font-size="3">'
      );
      expect(html).toContain('<use xlink:href="#g" xml:space="preserve">');
      expect(html).toContain('gradientUnits="userSpaceOnUse"');
    });

    it('should update and remove mapped SVG attributes reactively', () => {
      let dash!: ReturnType<typeof state<string | null>>;
      let href!: ReturnType<typeof state<string | null>>;
      renderDOM(() => {
        dash = state<string | null>('4 2');
        href = state<string | null>('#a');
        return (
          <svg>
            <path strokeDasharray={() => dash()} />
            <use xlinkHref={() => href()} />
          </svg>
        );
      });

      const path = container.querySelector('path')!;
      const use = container.querySelector('use')!;
      expect(path.getAttribute('stroke-dasharray')).toBe('4 2');
      expect(use.getAttributeNS(XLINK_NAMESPACE, 'href')).toBe('#a');

      dash.set('1 1');
      href.set('#b');
      flushScheduler();
      expect(path.getAttribute('stroke-dasharray')).toBe('1 1');
      expect(use.getAttributeNS(XLINK_NAMESPACE, 'href')).toBe('#b');

      dash.set(null);
      href.set(null);
      flushScheduler();
      expect(path.hasAttribute('stroke-dasharray')).toBe(false);
      expect(use.hasAttributeNS(XLINK_NAMESPACE, 'href')).toBe(false);
    });

    it('should drop script-scheme xlink:href URLs on both sides', async () => {
      const Unsafe = () => (
        <svg>
          <a xlinkHref="javascript:alert(1)">
            <text>x</text>
          </a>
        </svg>
      );

      renderDOM(Unsafe);
      const anchor = container.querySelector('a')!;
      expect(anchor.getAttribute('xlink:href')).toBeNull();
      expect(anchor.getAttribute('xlinkHref')).toBeNull();

      const html = await captureSSRSnapshot(Unsafe);
      expect(html).not.toContain('javascript:');
    });
  });

  describe('numeric style values', () => {
    const Sized = () => (
      <div
        style={{
          width: 10,
          marginTop: -4,
          height: 0,
          opacity: 0.5,
          zIndex: 3,
          lineHeight: 1.5,
          flexGrow: 2,
          '--gap': 8,
        }}
      />
    );

    it('should append px to numeric values of dimensional properties in the DOM', () => {
      renderDOM(Sized);

      const style = (container.firstElementChild as HTMLElement).style;
      expect(style.width).toBe('10px');
      expect(style.marginTop).toBe('-4px');
      expect(style.height).toBe('0px');
      expect(style.opacity).toBe('0.5');
      expect(style.zIndex).toBe('3');
      expect(style.lineHeight).toBe('1.5');
      expect(style.flexGrow).toBe('2');
      expect(style.getPropertyValue('--gap')).toBe('8');
    });

    it('should append px to numeric values of dimensional properties in SSR', async () => {
      const html = await captureSSRSnapshot(Sized);

      expect(html).toContain(
        'style="width:10px;margin-top:-4px;height:0;opacity:0.5;z-index:3;line-height:1.5;flex-grow:2;--gap:8;"'
      );
    });

    it('should append px when a reactive numeric style value changes', () => {
      let width!: ReturnType<typeof state<number>>;
      renderDOM(() => {
        width = state(10);
        return <div style={() => ({ width: width() })} />;
      });

      const el = container.firstElementChild as HTMLElement;
      expect(el.style.width).toBe('10px');
      width.set(24);
      flushScheduler();
      expect(el.style.width).toBe('24px');
    });
  });

  describe('enumerated attributes set to false', () => {
    const NotDraggable = () => (
      <div draggable={false} spellCheck={false} contentEditable={false} />
    );

    it('should render false as the string "false" for enumerated attributes in the DOM', () => {
      renderDOM(NotDraggable);

      const el = container.firstElementChild as HTMLElement;
      expect(el.getAttribute('draggable')).toBe('false');
      expect(el.getAttribute('spellcheck')).toBe('false');
      expect(el.getAttribute('contenteditable')).toBe('false');
    });

    it('should serialize false as the string "false" for enumerated attributes in SSR', async () => {
      const html = await captureSSRSnapshot(NotDraggable);

      expect(html).toContain(
        '<div draggable="false" spellcheck="false" contenteditable="false">'
      );
    });

    it('should switch an enumerated attribute between true and false reactively', () => {
      let draggable!: ReturnType<typeof state<boolean>>;
      renderDOM(() => {
        draggable = state(true);
        return <img draggable={() => draggable()} />;
      });

      const img = container.querySelector('img')!;
      expect(img.getAttribute('draggable')).toBe('true');
      draggable.set(false);
      flushScheduler();
      expect(img.getAttribute('draggable')).toBe('false');
      expect(img.draggable).toBe(false);
    });

    it('should keep removing ordinary attributes set to false', async () => {
      const Plain = () => <div hidden={false} data-flag={false} title="t" />;

      renderDOM(Plain);
      const el = container.firstElementChild as HTMLElement;
      expect(el.hasAttribute('hidden')).toBe(false);
      expect(el.hasAttribute('data-flag')).toBe(false);

      expect(await captureSSRSnapshot(Plain)).toContain('<div title="t">');
    });
  });
});
