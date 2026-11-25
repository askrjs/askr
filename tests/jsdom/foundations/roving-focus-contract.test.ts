import { describe, expect, it, vi } from 'vite-plus/test';
import { rovingFocus } from '@askrjs/askr/foundations/interactions';

describe('rovingFocus contract helpers (FOUNDATIONS)', () => {
  it.each([
    ['horizontal', 'ArrowRight'],
    ['horizontal', 'ArrowLeft'],
    ['vertical', 'ArrowDown'],
    ['vertical', 'ArrowUp'],
  ] as const)(
    'should preserve a captured %s %s cancellation without navigating or stopping propagation',
    (orientation, key) => {
      const onNavigate = vi.fn();
      const onBubble = vi.fn();
      const parent = document.createElement('div');
      const host = document.createElement('div');
      const navigation = rovingFocus({
        currentIndex: 1,
        itemCount: 3,
        orientation,
        onNavigate,
      });
      parent.addEventListener(
        'keydown',
        (event) => event.preventDefault(),
        true
      );
      parent.addEventListener('keydown', onBubble);
      host.addEventListener('keydown', navigation.container.onKeyDown);
      parent.append(host);
      document.body.append(parent);
      try {
        const event = new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        });
        const preventDefault = vi.spyOn(event, 'preventDefault');
        expect(host.dispatchEvent(event)).toBe(false);
        expect(onNavigate).not.toHaveBeenCalled();
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(onBubble).toHaveBeenCalledTimes(1);
      } finally {
        parent.remove();
      }
    }
  );

  it('should move to the next enabled item and keep a single tab stop', () => {
    const onNavigate = vi.fn();
    const navigation = rovingFocus({
      currentIndex: 0,
      itemCount: 4,
      loop: true,
      onNavigate,
      isDisabled: (index) => index === 1,
    });

    navigation.container.onKeyDown({
      key: 'ArrowRight',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(2);
    expect(navigation.item(0).tabIndex).toBe(0);
    expect(navigation.item(1).tabIndex).toBe(-1);
    expect(navigation.item(2).tabIndex).toBe(-1);
  });

  it('should not recurse forever or navigate when every item is disabled', () => {
    const onNavigate = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const navigation = rovingFocus({
      currentIndex: 0,
      itemCount: 3,
      loop: true,
      onNavigate,
      isDisabled: () => true,
    });

    expect(() => {
      navigation.container.onKeyDown({
        key: 'ArrowRight',
        preventDefault,
        stopPropagation,
      });
    }).not.toThrow();

    expect(onNavigate).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('should preserve roving focus given active-item removal when the collection updates', () => {
    const host = document.createElement('div');
    let items = ['A', 'B', 'C'].map((label) => {
      const button = document.createElement('button');
      button.textContent = label;
      host.append(button);
      return button;
    });
    document.body.append(host);
    try {
      const initial = rovingFocus({
        currentIndex: 2,
        itemCount: 3,
        onNavigate: vi.fn(),
      });
      items.forEach((button, index) => {
        button.tabIndex = initial.item(index).tabIndex;
      });
      items[2]!.focus();
      expect(document.activeElement).toBe(items[2]);

      items[2]!.remove();
      items = items.slice(0, 2);
      const afterRemoval = rovingFocus({
        currentIndex: 2,
        itemCount: items.length,
        onNavigate: vi.fn(),
      });
      items.forEach((button, index) => {
        button.tabIndex = afterRemoval.item(index).tabIndex;
      });
      items.find((button) => button.tabIndex === 0)?.focus();

      expect(document.activeElement).toBe(items[0]);
      expect(items.map((button) => button.tabIndex)).toEqual([0, -1]);
    } finally {
      host.remove();
    }
  });

  it('should follow computed RTL direction for horizontal arrow navigation', () => {
    const container = document.createElement('div');
    container.dir = 'rtl';
    document.body.append(container);
    const onNavigate = vi.fn();
    const navigation = rovingFocus({
      currentIndex: 0,
      itemCount: 3,
      onNavigate,
    });

    navigation.container.onKeyDown({
      key: 'ArrowLeft',
      currentTarget: container,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onNavigate).toHaveBeenCalledWith(1);
    container.remove();
  });
});
