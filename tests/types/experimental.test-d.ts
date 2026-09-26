import { expectType } from 'tsd';
import {
  AskrRuntime,
  createDOMRendererHost,
  createRuntime,
  getDefaultRuntime,
  type DOMRendererHost,
} from '@askrjs/askr/experimental';

expectType<AskrRuntime>(createRuntime());
expectType<AskrRuntime>(getDefaultRuntime());
expectType<ReturnType<typeof createDOMRendererHost>>(
  createDOMRendererHost((native: DOMRendererHost) => native)
);
