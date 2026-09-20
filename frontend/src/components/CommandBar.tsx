'use client';

/**
 * AI terminal embedded in the workspace.
 *
 * Typing `/` opens a portal-rendered command palette; everything else is sent
 * to the backend chat endpoint as natural language.
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiUrl } from '@/lib/api';
import { Send, Bot, User, RefreshCw, Terminal, Trash2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const COMMAND_LIST = [
  { cmd: '/help', desc: 'Show available system commands' },
  { cmd: '/list', desc: 'List opportunities from the database' },
  { cmd: '/scan ', desc: 'Scan an ASIN (e.g. /scan B09...)' },
  { cmd: '/delete ', desc: 'Delete a product (e.g. /delete B09...)' },
];

export default function CommandBar({ onTitleClick }: { onTitleClick?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, bottom: 0 });
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
  
    if (val === '/') {
      const rect = e.currentTarget.getBoundingClientRect();
      setMenuPosition({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
      setShowCommands(true);
    } else if (!val.startsWith('/')) setShowCommands(false);
  };

  const selectCommand = (cmd: string) => {
    setInput(cmd);
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const clearHistory = () => setMessages([]);

  const sendMessage = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const userMsg = customMsg || input.trim();
    if (!userMsg || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setShowCommands(false);
    setIsLoading(true);

    try {
      const res = await fetch(apiUrl('/chat/'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMsg })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Connection error.' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Unable to reach the server.' }]);
    }
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white relative">
      
      {/* Terminal header */}
      <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center type-label text-gray-500 shrink-0">
        <button type="button" onClick={onTitleClick} title="Click to minimize panel" className="flex items-center gap-2 cursor-pointer hover:text-gray-700 transition-colors">
          <Terminal className="h-4 w-4 text-indigo-600" /> Vindera AI Terminal
        </button>
        <button onClick={clearHistory} className="hover:text-red-600 transition-colors" title="Clear Terminal">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-gray-400 text-[13px] italic">
            Command history is empty. Type '/' to see available commands.
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'bg-indigo-50/50' : 'bg-white shadow-sm'} p-3 rounded-lg border ${msg.role === 'user' ? 'border-indigo-100' : 'border-gray-200'}`}>
            <div className="mt-0.5 shrink-0">
              {msg.role === 'user' ? <User className="h-5 w-5 text-gray-400" /> : <Bot className="h-5 w-5 text-indigo-600" />}
            </div>
            <div className="type-body text-gray-800 whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 p-3">
            <RefreshCw className="h-5 w-5 text-indigo-600 animate-spin" />
            <div className="text-[13px] text-gray-400 italic">Processing command...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Command input */}
      <div className="border-t border-gray-200 bg-white p-3 shrink-0 relative">
        
        {/* Autocomplete menu, portalled to <body> so it is never clipped by overflow */}
        {mounted && showCommands && createPortal(
          <div
            className="fixed w-64 bg-white dark:bg-[#21262d] border border-gray-200 dark:border-[#30363d] rounded-lg shadow-2xl overflow-hidden z-[99999] animate-in fade-in"
            style={{ left: menuPosition.left, bottom: menuPosition.bottom }}
          >
            <div className="bg-gray-50 dark:bg-[#161b22] px-3 py-2 border-b border-gray-100 dark:border-[#30363d] type-label text-gray-500 dark:text-[#6e7681] flex items-center justify-between"><span>Slash Commands</span><button type="button" onClick={() => setShowCommands(false)} className="text-gray-400 dark:text-[#484f58] hover:text-gray-700 dark:hover:text-[#c9d1d9] transition-colors px-1 text-lg font-semibold" title="Close">−</button></div>

            {COMMAND_LIST.map((c) => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => selectCommand(c.cmd)}
                className="w-full text-left px-4 py-2 hover:bg-indigo-50 dark:hover:bg-[#1e1b4b] flex flex-col transition-colors border-b border-gray-50 dark:border-[#21262d] last:border-0"
              >
                <span className="font-mono font-semibold text-indigo-600 dark:text-[#818cf8] text-[13px]">{c.cmd}</span>
                <span className="text-[11px] text-gray-500 dark:text-[#6e7681] mt-0.5">{c.desc}</span>
              </button>
            ))}
          </div>,
          document.body
        )}

        <form onSubmit={(e) => sendMessage(e)} className="flex items-center gap-2">
          <div className="flex-1 relative bg-gray-50 border border-gray-300 rounded-lg focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            <textarea
              ref={inputRef} value={input} onChange={handleInputChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type '/' for commands or ask AI..." rows={1}
              className="w-full pl-4 pr-4 py-2.5 bg-transparent text-[14px] text-gray-900 placeholder-gray-400 focus:outline-none resize-none min-h-[40px] max-h-[120px]"
            />
          </div>
          <button type="submit" disabled={!input.trim() || isLoading} className="shrink-0 bg-indigo-600 text-white p-2.5 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 transition-colors">
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}