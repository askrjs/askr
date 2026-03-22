export default function EmptyState(props: {
  title: string;
  description: string;
  action?: unknown;
}) {
  return (
    <section class="empty-state panel" role="status">
      <h2>{props.title}</h2>
      <p>{props.description}</p>
      {props.action && <div>{props.action}</div>}
    </section>
  );
}
