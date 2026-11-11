import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendIgnishMessage, type IgnishMessage } from '../services/chat';

interface IgnishChatProps {
  theme: 'light' | 'dark';
}

const GREETING: IgnishMessage = {
  role: 'assistant',
  content: "Hi, I’m Ignish. I’m checking the latest processed fire data for the most useful updates. Need anything specific?",
};

const SUGGESTIONS = [
  'Summarize fire activity in a country',
  'Which date had the most detections?',
  'What are the latest burn index anomalies?',
];

const INITIAL_BRIEFING_PROMPT = [
  'Give me a brief proactive briefing using only the processed TerraIgnis fire data currently available.',
  'Highlight the most useful verifiable findings, such as overall activity, the busiest observed date, burn index or anomalies, and dataset coverage dates when available.',
  'Do not invent values or imply missing data is zero. If no processed data is available, say that clearly.',
  'End by asking what I would like to explore next.',
].join(' ');

export default function IgnishChat({ theme }: IgnishChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<IgnishMessage[]>([GREETING]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasStartedWelcomeRef = useRef(false);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, error, isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.style.height = '0px';
    const nextHeight = Math.min(input.scrollHeight, 96);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > 96 ? 'auto' : 'hidden';
  }, [draft, isOpen]);

  useEffect(() => {
    if (hasStartedWelcomeRef.current) return;
    hasStartedWelcomeRef.current = true;

    try {
      if (window.sessionStorage.getItem('terraignis-ignish-welcome-shown') === 'true') return;
      window.sessionStorage.setItem('terraignis-ignish-welcome-shown', 'true');
    } catch {
      // Continue with the welcome briefing if session storage is unavailable.
    }

    setIsOpen(true);
    setSending(true);
    void sendIgnishMessage([{ role: 'user', content: INITIAL_BRIEFING_PROMPT }])
      .then((reply) => setMessages((current) => [...current, { role: 'assistant', content: reply }]))
      .catch((briefingError: unknown) => {
        setError(briefingError instanceof Error ? briefingError.message : 'Could not load the latest fire briefing.');
      })
      .finally(() => setSending(false));
  }, []);

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
              <p>TerraIgnis AI agent</p>
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
            {!messages.some((message) => message.role === 'user') && !sending && (
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

      <div className="ignish-launcher-wrap">
        <button
          type="button"
          className="ignish-launcher"
          onClick={() => setIsOpen((open) => !open)}
          aria-label={isOpen ? 'Close Ignish chat' : 'Open Ignish AI agent'}
          aria-describedby={!isOpen ? 'ignish-launcher-tooltip' : undefined}
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={22} /> : <img src="/terraignis-icon.svg" alt="" aria-hidden="true" />}
        </button>
        {!isOpen && (
          <span id="ignish-launcher-tooltip" className="ignish-launcher-tooltip" role="tooltip">
            Ignish · TerraIgnis AI agent
          </span>
        )}
      </div>
    </div>
  );
}
