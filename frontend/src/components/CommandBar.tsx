'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, RefreshCw, ChevronUp, ChevronDown, Terminal, Trash2, Minus } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const COMMAND_LIST = [
  { cmd: '/help', desc: 'Sistem komutlarını ve yardımı gösterir' },
  { cmd: '/list', desc: 'Veritabanındaki tüm fırsatları listeler' },
  { cmd: '/scan ', desc: 'Amazon ASIN taratır (Örn: /scan B09...)' },
  { cmd: '/delete ', desc: 'Bir ürünü veritabanından siler' },
];

export default function CommandBar() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setIsHistoryOpen(true);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val === '/') setShowCommands(true);
    else if (!val.startsWith('/')) setShowCommands(false);
  };

  const selectCommand = (cmd: string) => {
    setInput(cmd);
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const clearHistory = () => {
    setMessages([]);
    setIsHistoryOpen(false);
  };

  const sendMessage = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const userMsg = customMsg || input.trim();
    if (!userMsg || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setShowCommands(false);
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:8000/api/v1/chat/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMsg })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Bağlantı hatası.' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Sunucuya ulaşılamıyor.' }]);
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center p-4 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pointer-events-none">
      
      {/* 1. CHAT HISTORY */}
      {isHistoryOpen && messages.length > 0 && (
        <div className="pointer-events-auto w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-2xl mb-4 flex flex-col overflow-hidden transition-all animate-in slide-in-from-bottom-4">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between items-center text-xs text-gray-500 font-bold tracking-wider uppercase">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-indigo-500" /> Vindera Terminal
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearHistory} className="p-1.5 hover:bg-gray-200 rounded-md hover:text-red-500 transition-colors" title="Geçmişi Sil">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setIsHistoryOpen(false)} className="p-1.5 hover:bg-gray-200 rounded-md hover:text-gray-800 transition-colors" title="Gizle">
                <Minus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="p-4 overflow-y-auto max-h-[400px] bg-white flex flex-col gap-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'bg-indigo-50/50' : ''} p-3 rounded-xl border ${msg.role === 'user' ? 'border-indigo-100' : 'border-transparent'}`}>
                <div className="mt-0.5">
                  {msg.role === 'user' ? <User className="h-5 w-5 text-gray-400" /> : <Bot className="h-5 w-5 text-indigo-600" />}
                </div>
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 p-3">
                <RefreshCw className="h-5 w-5 text-indigo-600 animate-spin" />
                <div className="text-sm text-gray-400 italic">İşleniyor...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* 2. COMMAND BAR (Simplified) */}
      <div className="pointer-events-auto w-full max-w-3xl relative group">
        {showCommands && (
          <div className="absolute bottom-[105%] left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-100 text-xs font-bold text-gray-500 flex items-center gap-1 uppercase">
              <Terminal className="h-3 w-3" /> Slash Commands
            </div>
            {COMMAND_LIST.map((c) => (
              <button key={c.cmd} type="button" onClick={() => selectCommand(c.cmd)} className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex flex-col transition-colors border-b border-gray-50 last:border-0">
                <span className="font-bold text-indigo-600 text-sm">{c.cmd}</span>
                <span className="text-xs text-gray-500 mt-0.5">{c.desc}</span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={(e) => sendMessage(e)} className="relative bg-white border border-gray-200 rounded-2xl shadow-xl shadow-indigo-100/20 transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 overflow-hidden">
          <textarea
            ref={inputRef} value={input} onChange={handleInputChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type '/' for commands or ask AI..." rows={1}
            className="w-full pl-4 pr-12 pt-4 pb-12 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none resize-none min-h-[60px]"
          />
          <div className="absolute bottom-3 right-3 flex justify-end items-center pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              {messages.length > 0 && (
                <button type="button" onClick={() => setIsHistoryOpen(!isHistoryOpen)} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-100">
                  {isHistoryOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                </button>
              )}
              <button type="submit" disabled={!input.trim() || isLoading} className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-md active:scale-95">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}