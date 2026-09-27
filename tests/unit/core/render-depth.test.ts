import { describe, expect, it } from 'vite-plus/test';
import {
  RenderDepthError,
  clarifyRenderOverflow,
} from '../../../src/common/render-depth';
import {
  clarifyRenderError,
  noteErrorOrigin,
  routeError,
} from '../../../src/core/component/errors';
import { ComponentInstance } from '../../../src/core/component/instance';
import { Owner } from '../../../src/core/reactive/owner';

describe('clarifyRenderOverflow', () => {
  it('should wrap a V8 or JavaScriptCore stack overflow', () => {
    const overflow = new RangeError('Maximum call stack size exceeded');
    const error = clarifyRenderOverflow(overflow);
    expect(error).toBeInstanceOf(RenderDepthError);
    expect((error as RenderDepthError).cause).toBe(overflow);
    expect(Object.keys(error as object)).not.toContain('cause');
  });

  it('should wrap a Firefox InternalError', () => {
    const overflow = new Error('too much recursion');
    overflow.name = 'InternalError';
    expect(clarifyRenderOverflow(overflow)).toBeInstanceOf(RenderDepthError);
  });

  it('should leave other errors unchanged', () => {
    const range = new RangeError('Invalid array length');
    const plain = new Error('Maximum call stack size exceeded');
    expect(clarifyRenderOverflow(range)).toBe(range);
    expect(clarifyRenderOverflow(plain)).toBe(plain);
    expect(clarifyRenderOverflow('text')).toBe('text');
  });
});

describe('routeError with a converted overflow', () => {
  it('should route a converted overflow to the boundary at its original origin', () => {
    const root = new Owner(null);
    const received: unknown[] = [];
    const boundary = new ComponentInstance(root, () => null, {});
    boundary.boundary = (error) => {
      received.push(error);
      return true;
    };
    const origin = new Owner(boundary);
    // The render stack's owner is unrelated to the logical origin.
    const renderOwner = new Owner(root);

    const overflow = new RangeError('Maximum call stack size exceeded');
    noteErrorOrigin(origin, overflow);
    // Converted after the origin was recorded on the engine error.
    const converted = clarifyRenderError(overflow);
    expect(converted).toBeInstanceOf(RenderDepthError);
    // A shallower component that converted the error records its own
    // position, as renderInstance does; the deeper origin must still win.
    noteErrorOrigin(renderOwner, converted);

    routeError(renderOwner, converted);
    expect(received).toEqual([converted]);
    root.dispose();
  });

  it('should route a RenderDepthError created in user code by its own origin', () => {
    const root = new Owner(null);
    const received: string[] = [];
    const boundaryAt = (name: string) => {
      const instance = new ComponentInstance(root, () => null, {});
      instance.boundary = () => {
        received.push(name);
        return true;
      };
      return instance;
    };
    const earlier = boundaryAt('earlier');
    const thrower = boundaryAt('thrower');

    // An error that escaped elsewhere earlier, later wrapped by user code.
    const inner = new RangeError('Maximum call stack size exceeded');
    noteErrorOrigin(new Owner(earlier), inner);
    const wrapped = new RenderDepthError(inner);
    noteErrorOrigin(new Owner(thrower), wrapped);

    routeError(null, wrapped);
    expect(received).toEqual(['thrower']);
    root.dispose();
  });
});
