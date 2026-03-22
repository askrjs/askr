import './styles.css';
import { Link } from '@askrjs/askr/router';

export default function App({ children }: { children?: unknown }) {
  return (
    <div>
      <header>
        <nav>
          <Link href="/">
            <strong>{'{{appName}}'}</strong>
          </Link>
          <div class="nav-links">
            <Link href="/example">Example</Link>
            <Link href="/about">About</Link>
          </div>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
