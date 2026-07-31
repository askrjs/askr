import { describe, expect, it, vi } from 'vite-plus/test';
import {
  applyInteractionPolicy,
  mergeInteractionProps,
} from '@askrjs/askr/foundations/interactions';
import { focusable } from '../../../src/foundations/interactions/focusable';
import { hoverable } from '../../../src/foundations/interactions/hoverable';

describe('interaction policy contract helpers (FOUNDATIONS)', () => {
  it('should preserve focusable and hoverable disabled semantics given keyboard and pointer input when interaction policy changes', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const enabledFocus = focusable({ disabled: false, tabIndex: 2 });
    const enabledHover = hoverable({ disabled: false, onEnter, onLeave });

    enabledHover.onPointerEnter?.({});
    enabledHover.onPointerLeave?.({});
    expect(enabledFocus).toEqual({ tabIndex: 2 });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);

    const disabledFocus = focusable({ disabled: true, tabIndex: 2 });
    const disabledHover = hoverable({ disabled: true, onEnter, onLeave });
    expect(disabledFocus).toEqual({
      tabIndex: -1,
      'aria-disabled': 'true',
    });
    expect(disabledHover.onPointerEnter).toBeUndefined();
    expect(disabledHover.onPointerLeave).toBeUndefined();
  });

  it('should preserve non-native disabled button semantics from pressable', () => {
    const onPress = vi.fn();
    const props = applyInteractionPolicy({
      isNative: false,
      disabled: true,
      onPress,
    });

    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(-1);
    expect(props['aria-disabled']).toBe('true');

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    props.onClick({ preventDefault, stopPropagation });

    expect(onPress).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('should use native disabled semantics without keyboard polyfills', () => {
    const onPress = vi.fn();
    const props = applyInteractionPolicy({
      isNative: true,
      disabled: true,
      onPress,
    });

    expect(props.disabled).toBe(true);
    expect('onKeyDown' in props).toBe(false);

    const preventDefault = vi.fn();

    props.onClick({ preventDefault });

    expect(onPress).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
  });

  it('should merge interaction handlers in policy-user-child order and compose refs', () => {
    const calls: string[] = [];
    const childRef = vi.fn();
    const userRef = vi.fn();
    const policyRef = vi.fn();
    const merged = mergeInteractionProps(
      {
        id: 'child',
        title: 'child-title',
        onClick: () => calls.push('child'),
        ref: childRef,
      },
      {
        id: 'policy',
        onClick: () => calls.push('policy'),
        ref: policyRef,
      },
      {
        title: 'user-title',
        onClick: () => calls.push('user'),
        ref: userRef,
      }
    );

    expect(merged.id).toBe('policy');
    expect(merged.title).toBe('user-title');

    merged.onClick({ defaultPrevented: false });
    merged.ref?.('node');

    expect(calls).toEqual(['policy', 'user', 'child']);
    expect(childRef).toHaveBeenCalledWith('node');
    expect(userRef).toHaveBeenCalledWith('node');
    expect(policyRef).toHaveBeenCalledWith('node');
  });
});
