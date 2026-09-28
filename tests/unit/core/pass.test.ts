import { describe, expect, it } from 'vite-plus/test';
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
});
