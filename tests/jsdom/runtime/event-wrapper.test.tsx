import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createIsland } from '../../../src/boot';
import { parseEventProp } from '../../../src/core/dom/events';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('delegated event objects', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });
  afterEach(() => cleanup());

  it('should give every delegated handler the same event with its own currentTarget', () => {
    const seen: Array<{ event: Event; current: EventTarget | null }> = [];
    createIsland({
      root: container,
      component: () => (
        <div
          id="outer"
          onClick={(e) => seen.push({ event: e, current: e.currentTarget })}
        >
          <button
            id="inner"
            onClick={(e) => seen.push({ event: e, current: e.currentTarget })}
          >
            go
          </button>
        </div>
      ),
    });
    flushScheduler();
    container.querySelector<HTMLElement>('#inner')!.click();
    expect(seen).toHaveLength(2);
    expect(seen[0].event).toBe(seen[1].event);
    expect(seen[0].current).toBe(container.querySelector('#inner'));
    expect(seen[1].current).toBe(container.querySelector('#outer'));
    const event = seen[0].event as Event & { nativeEvent?: Event };
    expect(event.nativeEvent).toBeInstanceOf(Event);
    expect(event.currentTarget).toBeNull();
  });

  it('should let a handler re-dispatch the event it received', () => {
    const redispatched: Array<EventTarget | null> = [];
    let stored: Event | null = null;
    createIsland({
      root: container,
      component: () => (
        <button
          id="first"
          onClick={(e) => {
            stored = e;
          }}
        >
          go
        </button>
      ),
    });
    flushScheduler();
    container.querySelector<HTMLElement>('#first')!.click();
    expect(stored).not.toBeNull();
    const other = document.createElement('div');
    other.addEventListener('click', (e) => redispatched.push(e.currentTarget));
    expect(() => other.dispatchEvent(stored!)).not.toThrow();
    expect(redispatched).toHaveLength(1);
    expect(redispatched[0]).toBe(other);
  });

  it('should run the root listener once for an event inside a root under body', () => {
    createIsland({
      root: container,
      component: () => <button id="b" onClick={() => {}} />,
    });
    flushScheduler();
    const composedPath = vi.spyOn(Event.prototype, 'composedPath');
    try {
      container.querySelector<HTMLElement>('#b')!.click();
      expect(composedPath).toHaveBeenCalledTimes(1);
    } finally {
      composedPath.mockRestore();
    }
  });
});

describe('expanded delegation', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });
  afterEach(() => cleanup());

  it.each([
    ['pointerdown', 'onPointerDown'],
    ['pointerup', 'onPointerUp'],
    ['pointermove', 'onPointerMove'],
  ])('should delegate %s at the root', (type, prop) => {
    const calls: string[] = [];
    const add = vi.spyOn(HTMLButtonElement.prototype, 'addEventListener');
    createIsland({
      root: container,
      component: () => {
        const props = { [prop]: () => calls.push(type) };
        return <button id="t" {...props} />;
      },
    });
    flushScheduler();
    const direct = add.mock.calls.filter((call: unknown[]) => call[0] === type);
    add.mockRestore();
    expect(direct).toHaveLength(0);
    container
      .querySelector('#t')!
      .dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    expect(calls).toEqual([type]);
  });

  it('should run an ancestor onFocus and onBlur for descendant focus changes', () => {
    const events: string[] = [];
    createIsland({
      root: container,
      component: () => (
        <section
          onFocus={() => events.push('focus')}
          onBlur={() => events.push('blur')}
        >
          <input id="i" />
        </section>
      ),
    });
    flushScheduler();
    const input = container.querySelector<HTMLInputElement>('#i')!;
    input.focus();
    input.blur();
    expect(events).toEqual(['focus', 'blur']);
  });

  it('should run onFocus and onFocusIn on the same element', () => {
    const events: string[] = [];
    createIsland({
      root: container,
      component: () => (
        <section
          onFocus={() => events.push('focus')}
          onFocusIn={() => events.push('focusin')}
        >
          <input id="i" />
        </section>
      ),
    });
    flushScheduler();
    container.querySelector<HTMLInputElement>('#i')!.focus();
    expect(events.sort()).toEqual(['focus', 'focusin']);
  });
});

describe('handler options', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });
  afterEach(() => cleanup());

  it('should parse Passive and Once suffixes', () => {
    expect(parseEventProp('onWheelPassive')).toEqual({
      eventName: 'wheel',
      capture: false,
      passive: true,
    });
    expect(parseEventProp('onClickOnce')).toEqual({
      eventName: 'click',
      capture: false,
      once: true,
    });
    expect(parseEventProp('onScrollCapturePassiveOnce')).toEqual({
      eventName: 'scroll',
      capture: true,
      passive: true,
      once: true,
    });
  });

  it('should register a Passive handler as a passive listener', () => {
    const add = vi.spyOn(HTMLDivElement.prototype, 'addEventListener');
    createIsland({
      root: container,
      component: () => <div id="t" onWheelPassive={() => {}} />,
    });
    flushScheduler();
    const call = add.mock.calls.find((c: unknown[]) => c[0] === 'wheel');
    add.mockRestore();
    expect((call?.[2] as AddEventListenerOptions | undefined)?.passive).toBe(
      true
    );
  });

  it('should run a Once handler a single time', () => {
    let count = 0;
    createIsland({
      root: container,
      component: () => <button id="t" onClickOnce={() => count++} />,
    });
    flushScheduler();
    const button = container.querySelector<HTMLElement>('#t')!;
    button.click();
    button.click();
    expect(count).toBe(1);
  });
});
