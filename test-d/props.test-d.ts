import { expectType } from 'tsd';
import type { AppConfig } from '../src/app/createApp';
import type { Props } from '../src/shared/types';

// Component that matches the public ComponentFunction signature
const MyComponent = (props: Props) => {
  return { type: 'div', props };
};

const cfg: AppConfig = {
  root: document.createElement('div'),
  component: MyComponent,
};

expectType<AppConfig>(cfg);

// JSX intrinsic elements should accept Props as attributes
declare namespace JSX {
  const _: any; // used by tsd - no-op
}

// Ensure Props accepts common attributes
const p: Props = { id: 'test', class: 'c', children: 'x' };
expectType<Props>(p);
