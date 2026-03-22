export default function AuthLayout(props: { children?: unknown }) {
  return (
    <div class="auth-layout-shell">
      <div class="auth-layout-card">{props.children}</div>
    </div>
  );
}
