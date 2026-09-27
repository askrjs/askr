import { describe, expect, it } from 'vite-plus/test';
import {
  RenderDepthError,
  clarifyRenderOverflow,
} from '../../../src/common/render-depth';

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
