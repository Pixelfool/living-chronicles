import { Outlet } from 'react-router-dom';
import { ChatPanel } from './ChatPanel';
import { StatusBar } from './StatusBar';
import { ThreadsBadge } from './ThreadsBadge';

/** The permanent application frame, rendered around every authenticated route. */
export function Frame() {
  return (
    <div className="frame">
      <header className="frame__header">
        <StatusBar />
        <ThreadsBadge />
      </header>
      <div className="frame__body">
        <main className="frame__content">
          <Outlet />
        </main>
        <aside className="frame__chat">
          <ChatPanel />
        </aside>
      </div>
    </div>
  );
}
