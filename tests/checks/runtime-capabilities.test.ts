import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  AskrRuntime,
  getDefaultRuntime,
} from '../../src/compatibility/runtime';
import {
  adaptRendererHost,
  rendererHostView,
} from '../../src/compatibility/renderer';
import { createRuntimeState } from '../../src/runtime/runtime-state';
import {
  getRuntimeRenderer,
  getRuntimeScheduler,
} from '../../src/runtime/access';
import { createChildScope } from '../../src/runtime/ownership/child-scope';
import type { RuntimeRendererHost } from '../../src/compatibility/contracts/core';

const originalHost = getDefaultRuntime().renderer;
afterEach(() => getDefaultRuntime().configureRenderer(originalHost));

describe('runtime capability wiring', () => {
  it('should execute without browser globals and restores the configured default host', () => {
    expect(Reflect.has(globalThis, 'window')).toBe(false);
    expect(Reflect.has(globalThis, 'document')).toBe(false);
    const runtime = getDefaultRuntime();
    const host = { ...createRuntimeState().renderer, evaluate: vi.fn() };
    runtime.configureRenderer(host);
    expect(runtime.renderer).toBe(host);
    expect(getRuntimeScheduler()).toBe(runtime.scheduler);
    getRuntimeRenderer().evaluate('first', null);
    expect(host.evaluate).toHaveBeenCalledWith('first', null);
    const replacement = { ...host, evaluate: vi.fn() };
    runtime.configureRenderer(replacement);
    getRuntimeRenderer().evaluate('second', null);
    expect(host.evaluate).toHaveBeenCalledTimes(1);
    expect(replacement.evaluate).toHaveBeenCalledWith('second', null);
  });

  it('should call extension methods with their host as receiver and observes replacement methods', () => {
    const host = { ...createRuntimeState().renderer, evaluate: vi.fn() };
    const capabilities = adaptRendererHost(host);
    capabilities.evaluate(null, null);
    expect(host.evaluate.mock.contexts).toEqual([host]);
    const replacement = vi.fn();
    host.evaluate = replacement;
    capabilities.evaluate('replacement', null);
    expect(replacement.mock.contexts).toEqual([host]);
    expect(replacement).toHaveBeenCalledWith('replacement', null);
  });

  it('should retain direct native capabilities and their writable public view', () => {
    const capabilities = createRuntimeState().renderer;
    const host = rendererHostView(capabilities);
    expect(adaptRendererHost(host)).toBe(capabilities);
    const evaluate = vi.fn();
    host.evaluate = evaluate;
    getDefaultRuntime().configureRenderer(host);
    expect(getRuntimeRenderer()).toBe(capabilities);
    getRuntimeRenderer().evaluate(null, null);
    expect(evaluate).toHaveBeenCalledOnce();
    Object.defineProperty(host, 'evaluate', { value: vi.fn() });
    expect(capabilities.evaluate).toBe(host.evaluate);
  });

  it('should observe optional host capability addition and removal', () => {
    const host: RuntimeRendererHost = { ...originalHost };
    delete host.resolveChildScopeRange;
    const capabilities = adaptRendererHost(host);
    expect(capabilities.resolveChildScopeRange).toBeUndefined();
    const resolve = vi.fn(() => null);
    host.resolveChildScopeRange = resolve;
    const scope = createChildScope(null, 'probe');
    try {
      expect(capabilities.resolveChildScopeRange?.(scope)).toBeNull();
      expect(resolve).toHaveBeenCalledWith(scope);
      expect(resolve.mock.contexts).toEqual([host]);
      delete host.resolveChildScopeRange;
      expect(capabilities.resolveChildScopeRange).toBeUndefined();
    } finally {
      scope.dispose();
    }
  });

  it('should keep separate runtimes isolated and avoids virtual dispatch during construction', () => {
    const configured = vi.fn();
    class CustomRuntime extends AskrRuntime {
      override configureRenderer(renderer: AskrRuntime['renderer']): void {
        configured();
        super.configureRenderer(renderer);
      }
    }
    const host = rendererHostView(createRuntimeState().renderer);
    const runtime = new CustomRuntime({ renderer: host });
    expect(runtime.renderer).toBe(host);
    expect(configured).not.toHaveBeenCalled();
    runtime.configureRenderer(rendererHostView(createRuntimeState().renderer));
    expect(configured).toHaveBeenCalledOnce();
    expect(getDefaultRuntime().renderer).toBe(originalHost);
  });
});
