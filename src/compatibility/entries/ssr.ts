/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../ssr/index';
import type * as Contract from '../contracts/ssr/index';
export type * from '../contracts/ssr/index';

const public_SSRDataMissingError: typeof Contract.SSRDataMissingError =
  implementation.SSRDataMissingError;
type public_SSRDataMissingError = Contract.SSRDataMissingError;
const public_createRenderContext: typeof Contract.createRenderContext =
  implementation.createRenderContext as unknown as typeof Contract.createRenderContext;
const public_getRenderContext: typeof Contract.getRenderContext =
  implementation.getRenderContext as unknown as typeof Contract.getRenderContext;
const public_renderResolvedToStringSync: typeof Contract.renderResolvedToStringSync =
  implementation.renderResolvedToStringSync as unknown as typeof Contract.renderResolvedToStringSync;
const public_renderRouteRequest: typeof Contract.renderRouteRequest =
  implementation.renderRouteRequest as unknown as typeof Contract.renderRouteRequest;
const public_renderRouteRequestToString: typeof Contract.renderRouteRequestToString =
  implementation.renderRouteRequestToString as unknown as typeof Contract.renderRouteRequestToString;
const public_renderToStream: typeof Contract.renderToStream =
  implementation.renderToStream as unknown as typeof Contract.renderToStream;
const public_renderToString: typeof Contract.renderToString =
  implementation.renderToString as unknown as typeof Contract.renderToString;
const public_renderToStringSync: typeof Contract.renderToStringSync =
  implementation.renderToStringSync as unknown as typeof Contract.renderToStringSync;
const public_resolveRequest: typeof Contract.resolveRequest =
  implementation.resolveRequest as unknown as typeof Contract.resolveRequest;
const public_withRenderContext: typeof Contract.withRenderContext =
  implementation.withRenderContext as unknown as typeof Contract.withRenderContext;
const public_withRenderContextAsync: typeof Contract.withRenderContextAsync =
  implementation.withRenderContextAsync as unknown as typeof Contract.withRenderContextAsync;

export {
  public_SSRDataMissingError as SSRDataMissingError,
  public_createRenderContext as createRenderContext,
  public_getRenderContext as getRenderContext,
  public_renderResolvedToStringSync as renderResolvedToStringSync,
  public_renderRouteRequest as renderRouteRequest,
  public_renderRouteRequestToString as renderRouteRequestToString,
  public_renderToStream as renderToStream,
  public_renderToString as renderToString,
  public_renderToStringSync as renderToStringSync,
  public_resolveRequest as resolveRequest,
  public_withRenderContext as withRenderContext,
  public_withRenderContextAsync as withRenderContextAsync,
};
