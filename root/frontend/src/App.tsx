import { useEffect, useState } from 'react';
import BookPage from './BookPage';
import HostPage from './HostPage';

const currentRoute = () => (window.location.hash.startsWith('#/host') ? 'host' : 'book');

export default function App() {
  const [route, setRoute] = useState(currentRoute());

  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <div className="shell">
      <header>
        <a className="brand" href="#/">Slots</a>
        <nav aria-label="Primary">
          <a href="#/" aria-current={route === 'book' ? 'page' : undefined}>Book</a>
          <a href="#/host" aria-current={route === 'host' ? 'page' : undefined}>Host</a>
        </nav>
      </header>
      <main>{route === 'host' ? <HostPage /> : <BookPage />}</main>
    </div>
  );
}
