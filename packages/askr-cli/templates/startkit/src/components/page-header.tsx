import { Inline } from '@askrjs/askr-ui/inline';
import { Spacer } from '@askrjs/askr-ui/spacer';

export default function PageHeader(props: {
  title: string;
  description: string;
  actions?: unknown;
}) {
  return (
    <Inline
      class="page-header"
      align="center"
      gap="var(--ak-space-lg)"
      wrap="wrap"
    >
      <div class="page-header-copy">
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
      <Spacer />
      {props.actions && <div>{props.actions}</div>}
    </Inline>
  );
}
