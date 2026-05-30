import { expectAssignable, expectError, expectType } from 'tsd';
import { capture, on, stream, task, timer } from '@askrjs/askr/resources';
import type { JSXElement } from '@askrjs/askr/foundations';

// @ts-expect-error root package does not expose JSXElement
import type { JSXElement as RootJSXElement } from '@askrjs/askr';

declare const eventSource: EventTarget;
declare const transformer: () => void;

expectType<void>(on(eventSource, 'focus', () => {}));
expectType<void>(timer(1000, () => {}));
expectType<void>(task(() => {}));
expectType<void>(task(async () => {}));

const snapshot = capture(() => 123);
expectType<() => number>(snapshot);

const pendingStream = stream<string>('source');
expectType<string | null>(pendingStream.value);
expectType<boolean>(pendingStream.pending);
expectType<Error | null>(pendingStream.error);

expectError(on(eventSource, transformer));
expectError(timer(1000));

type ExampleCardProps = {
  actions?: JSXElement;
};

expectAssignable<ExampleCardProps>({});
