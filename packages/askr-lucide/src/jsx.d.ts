import type { Props } from '@askrjs/askr';

declare global {
  namespace JSX {
    interface Element {
      readonly __askrJsxElementBrand?: never;
    }

    interface IntrinsicElements {
      [elem: string]: Props;
    }

    interface ElementAttributesProperty {
      props: Props;
    }
  }
}

export {};
