/**
 * Minimal public API for `@askrjs/askr-ui` used for local dev and testing.
 */

import './categories';

export type AskRComponent = {
  name: string;
};

export function createAskRComponent(name: string): AskRComponent {
  return { name };
}
export * from './components';
