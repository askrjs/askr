type IconComponent = (props: {
  size?: number;
  'aria-hidden'?: boolean | 'true' | 'false';
}) => JSX.Element;

export default function StatCard(props: {
  label: string;
  value: string;
  trend: string;
  icon: IconComponent;
}) {
  const Icon = props.icon;

  return (
    <article class="panel stat-card">
      <div class="stat-card-head">
        <p>{props.label}</p>
        <Icon size={16} aria-hidden="true" />
      </div>
      <strong>{props.value}</strong>
      <p class="trend">{props.trend}</p>
    </article>
  );
}
