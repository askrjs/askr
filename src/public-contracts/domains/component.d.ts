import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { State, state } from './state.js';
import { ComponentFunction } from './context.js';
import { DataRuntime } from './data.js';
import { RouteAuthOptions, RouteRegistry } from './routing.js';

declare function getSignal(): AbortSignal;

export { getSignal };
