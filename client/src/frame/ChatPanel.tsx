import { FormEvent, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ChatMessageView } from '../api-types';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * People's ambient proof of life (vision.md: chat is the town square).
 * Always mounted inside the frame, never a tab you have to remember to
 * open. Authenticates off the same session cookie as the REST API - no
 * separate handshake step needed (src/social/session-io.adapter.ts).
 */
export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const socket = io('/chat', { withCredentials: true });
    socketRef.current = socket;

    socket.on('chat:history', (history: ChatMessageView[]) => {
      setMessages(history);
    });
    socket.on('chat:message', (message: ChatMessageView) => {
      setMessages((prev) => [...prev, message]);
    });
    socket.on('chat:error', (message: string) => {
      setError(message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  function handleSend(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      return;
    }
    socketRef.current?.emit('chat:send', { body });
    setDraft('');
    setError(null);
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel__log" ref={logRef}>
        {messages.length === 0 && (
          <div className="chat-panel__empty">
            It's quiet here. Say something.
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className="chat-panel__message">
            <span className="chat-panel__time">
              {formatTime(message.createdAt)}
            </span>{' '}
            <strong>{message.username}</strong> {message.body}
          </div>
        ))}
      </div>
      {error && <div className="chat-panel__error">{error}</div>}
      <form className="chat-panel__form" onSubmit={handleSend}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Say something..."
          maxLength={280}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
