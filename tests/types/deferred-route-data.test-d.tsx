import { expectAssignable, expectType } from 'tsd';
import {
  defer,
  isDeferred,
  resolveDeferredValues,
  routeData,
  Resolve,
  type Deferred,
  type DeferredState,
  type ResolveProps,
} from '@askrjs/askr/router';

const message = defer(Promise.resolve('ready'));
expectType<Deferred<string>>(message);
expectType<DeferredState>(message.state);
expectType<boolean>(isDeferred(message));
expectType<Promise<{ message: Deferred<string> }>>(
  resolveDeferredValues({ message })
);
expectType<{ message: Deferred<string> }>(
  routeData<{ message: Deferred<string> }>()
);

const props: ResolveProps<string> = {
  value: message,
  pending: <p>pending</p>,
  rejected: (error) => <p>{String(error)}</p>,
  children: (value) => <p>{value}</p>,
};
expectAssignable<ResolveProps<string>>(props);
expectAssignable<JSX.Element>(<Resolve {...props} />);
