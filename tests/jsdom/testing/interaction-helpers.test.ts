import { describe, expect, it, vi } from 'vite-plus/test';
import { click, submit, type } from '../../../src/testing';

describe('@askrjs/askr/testing interaction helpers', () => {
  it('should dispatch a bubbling click event', () => {
    const parent = document.createElement('div');
    const button = document.createElement('button');
    parent.append(button);
    const handler = vi.fn((event: Event) => event.target);
    parent.addEventListener('click', handler);
    expect(click(button)).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.results[0]?.value).toBe(button);
  });

  it('should append text and emit input for each character', () => {
    const input = document.createElement('input');
    const handler = vi.fn();
    input.addEventListener('input', handler);
    type(input, 'go');
    expect(input.value).toBe('go');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should dispatch a cancelable submit event', () => {
    const form = document.createElement('form');
    const handler = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener('submit', handler);
    expect(submit(form)).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
  });
});
