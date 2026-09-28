import { describe, expect, it } from 'vite-plus/test';
import { ComponentInstance } from '../../../src/core/component/instance';
import { CommitMutationError, Pass } from '../../../src/core/dom/pass';

describe('render pass reversible callbacks', () => {
  it('should discard rewound reversible state before aborting a commit', () => {
    const pass = new Pass();
    const undone: string[] = [];
    const settled: string[] = [];
    const failure = new Error('commit failed');

    pass.onReversibleCommit(() => undone.push('kept'));
    pass.beforeJournalSettle(() => settled.push('kept'));
    const mark = pass.mark();
    pass.onReversibleCommit(() => undone.push('rewound'));
    pass.beforeJournalSettle(() => settled.push('rewound'));
    pass.rewind(mark);
    pass.beforeJournalSettle(() => {
      throw new CommitMutationError(failure);
    });

    expect(() => pass.commit()).toThrow(failure);
    expect(settled).toEqual(['kept']);
    expect(undone).toEqual(['kept']);
  });

  it('should keep prepared root journals independent when another root commits first', () => {
    const component = () => null;
    const firstInstance = new ComponentInstance(null, component, {
      value: 'first before',
    });
    const secondInstance = new ComponentInstance(null, component, {
      value: 'second before',
    });
    const first = new Pass();
    first.run(() => firstInstance.setProps({ value: 'first prepared' }));
    const second = new Pass();
    second.run(() => secondInstance.setProps({ value: 'second prepared' }));

    first.commit();
    second.discard();

    expect(firstInstance.props).toEqual({ value: 'first prepared' });
    expect(secondInstance.props).toEqual({ value: 'second before' });
    firstInstance.dispose();
    secondInstance.dispose();
  });
});
