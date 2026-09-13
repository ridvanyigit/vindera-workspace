'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, RefreshCw, Zap, ChevronUp, ChevronDown, Trash2, List } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function CommandBar() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setIsHistoryOpen(true);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const userMsg = customMsg || input.trim();
    if (!userMsg || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:8000/api/v1/chat/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Connection error.' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Server unreachable.' }]);
    }
    setIsLoading(false);
  };

  const insertCommand = (cmd: string) => {
    setInput(cmd);
    // Focus automatically isn't strictly necessary but UX friendly. We just set the input.
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center p-4 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pointer-events-none">
      
      {/* 1. CHAT HISTORY (Floating above the bar) */}
      {isHistoryOpen && messages.length > 0 && (
        <div className="pointer-events-auto w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-2xl mb-4 flex flex-col overflow-hidden transition-all animate-in slide-in-from-bottom-4">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between items-center text-xs text-gray-500 font-bold tracking-wider uppercase">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-indigo-500" /> Vindera Command Terminal
            </div>
            <button onClick={() => setIsHistoryOpen(false)} className="hover:text-gray-800 transition-colors">HIDE</button>
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
                <div className="text-sm text-gray-400 italic">Processing command...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* 2. THE COMMAND BAR */}
      <div className="pointer-events-auto w-full max-w-3xl relative group">
        <form onSubmit={(e) => sendMessage(e)} className="relative bg-white border border-gray-200 rounded-2xl shadow-xl shadow-indigo-100/20 transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 overflow-hidden">
          
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a command (e.g. /list, /scan ASIN) or ask AI..."
            rows={1}
            className="w-full pl-4 pr-12 pt-4 pb-12 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none resize-none min-h-[60px]"
          />

          {/* Bottom Toolbar inside the Input Box */}
          <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center pointer-events-none">
            
            {/* Left Action Shortcuts */}
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button type="button" onClick={() => sendMessage(undefined, '/help')} className="px-2 py-1 text-xs font-bold text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all uppercase tracking-wider">
                Help
              </button>
              <div className="h-4 w-px bg-gray-200 mx-0.5"></div>
              <button type="button" onClick={() => sendMessage(undefined, '/list')} className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all uppercase tracking-wider">
                <List className="h-3 w-3" /> List DB
              </button>
              <button type="button" onClick={() => insertCommand('/scan ')} className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all uppercase tracking-wider">
                <Zap className="h-3 w-3" /> Scan
              </button>
              <button type="button" onClick={() => insertCommand('/delete ')} className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-all uppercase tracking-wider">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>

            {/* Right Icons (Submit) */}
            <div className="flex items-center gap-2 pointer-events-auto">
              {messages.length > 0 && (
                <button 
                  type="button" 
                  onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {isHistoryOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                </button>
              )}
              <button 
                type="submit" 
                disabled={!input.trim() || isLoading}
                className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-md active:scale-95"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}