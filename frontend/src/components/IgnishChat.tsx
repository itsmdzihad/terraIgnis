import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { LoaderCircle, MessageCircle, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendIgnishMessage, type IgnishMessage } from '../services/chat';

interface IgnishChatProps {
  theme: 'light' | 'dark';
}

const GREETING: IgnishMessage = {
  role: 'assistant',
  content: "Hi, I’m Ignish. Ask me about the fire data in your TerraIgnis dashboard.",
};

const SUGGESTIONS = [
  'Summarize the fire data in Bangladesh',
  'Which days had the most detections?',
  'Explain the Burn Index',
];

export default function IgnishChat({ theme }: IgnishChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<IgnishMessage[]>([GREETING]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, error, isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const send = async (value: string) => {
    const content = value.trim();
    if (!content || sending) return;
    const conversation = [...messages, { role: 'user' as const, content }];
    setMessages(conversation);
    setDraft('');
    setError(null);
    setSending(true);
    try {
      const reply = await sendIgnishMessage(conversation);
      setMessages([...conversation, { role: 'assistant', content: reply }]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not reach Ignish. Try again.');
    } finally {
      setSending(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(draft);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  };

  return (
    <div className="ignish-chat" data-theme={theme}>
      {isOpen && (
        <section className="ignish-window" aria-label="Chat with Ignish">
          <header className="ignish-header">
            <div className="ignish-avatar"><img src="/terraignis-icon.svg" alt="" /></div>
            <div className="ignish-header-copy">
              <h2>Ignish</h2>
              <p>TerraIgnis data assistant</p>
            </div>
            <button type="button" className="ignish-close" onClick={() => setIsOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </header>

          <div className="ignish-transcript" ref={transcriptRef} aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`ignish-message-row ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                {message.role === 'assistant' && <div className="ignish-message-avatar"><img src="/terraignis-icon.svg" alt="" /></div>}
                {message.role === 'assistant' ? (
                  <div className="ignish-message ignish-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="ignish-message">{message.content}</p>
                )}
              </div>
            ))}
            {sending && (
              <div className="ignish-message-row is-assistant">
                <div className="ignish-message-avatar"><img src="/terraignis-icon.svg" alt="" /></div>
                <p className="ignish-message ignish-thinking"><LoaderCircle size={14} className="animate-spin" /> Checking the dashboard data…</p>
              </div>
            )}
            {error && <p className="ignish-error" role="alert">{error}</p>}
            {messages.length === 1 && !sending && (
              <div className="ignish-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>
                ))}
              </div>
            )}
          </div>

          <form className="ignish-composer" onSubmit={submit}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ask about fire activity…"
              rows={1}
              maxLength={2000}
              disabled={sending}
              aria-label="Message Ignish"
            />
            <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message">
              {sending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
            </button>
          </form>
          <p className="ignish-footnote">Answers use the processed fire datasets currently available to the dashboard.</p>
        </section>
      )}

      <button
        type="button"
        className="ignish-launcher"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? 'Close Ignish chat' : 'Chat with Ignish'}
        aria-expanded={isOpen}
      >
        {isOpen ? <X size={22} /> : <MessageCircle size={23} />}
      </button>
    </div>
  );
}
