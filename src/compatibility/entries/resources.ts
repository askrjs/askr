/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../resources/index';
import type * as Contract from '../contracts/resources/index';
export type * from '../contracts/resources/index';

const public_capture: typeof Contract.capture = implementation.capture;
const public_documentVisible: typeof Contract.documentVisible =
  implementation.documentVisible;
const public_getSignal: typeof Contract.getSignal = implementation.getSignal;
const public_on: typeof Contract.on = implementation.on;
const public_onRouteChange: typeof Contract.onRouteChange =
  implementation.onRouteChange;
const public_resource: typeof Contract.resource = implementation.resource;
const public_routeActive: typeof Contract.routeActive =
  implementation.routeActive;
const public_stream: typeof Contract.stream = implementation.stream;
const public_task: typeof Contract.task = implementation.task;
const public_timer: typeof Contract.timer = implementation.timer;
const public_watch: typeof Contract.watch = implementation.watch;
const public_windowFocused: typeof Contract.windowFocused =
  implementation.windowFocused;

export {
  public_capture as capture,
  public_documentVisible as documentVisible,
  public_getSignal as getSignal,
  public_on as on,
  public_onRouteChange as onRouteChange,
  public_resource as resource,
  public_routeActive as routeActive,
  public_stream as stream,
  public_task as task,
  public_timer as timer,
  public_watch as watch,
  public_windowFocused as windowFocused,
};
