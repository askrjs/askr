import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { task } from './lifecycle.js';

declare function scheduleEventHandler(handler: EventListener): EventListener;
export { scheduleEventHandler };
