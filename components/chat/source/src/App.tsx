/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Send, 
  History, 
  ShieldCheck, 
  Info, 
  Cpu, 
  Calendar, 
  ChevronRight,
  User,
  Bot,
  Loader2,
  X,
  Image as ImageIcon,
  Star,
  Trash2,
  Plus,
  MessageSquare as MessageIcon
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';
import { chatWithGemini, type Message } from './services/geminiService';
import { motion, AnimatePresence } from 'motion/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const QUICK_ACTIONS = [
  { id: 'hvac', label: 'HVAC Age', icon: Calendar, prompt: 'How do I determine the age of a Carrier HVAC unit from the serial number?' },
  { id: 'appliance', label: 'Appliance Specs', icon: Cpu, prompt: 'What are the typical technical specs for a 10-year-old Whirlpool refrigerator?' },
  { id: 'life', label: 'Life Expectancy', icon: History, prompt: 'What is the standard life expectancy for a residential asphalt shingle roof?' },
  { id: 'serial', label: 'Serial Lookup', icon: Search, prompt: 'I have a serial number: 123456789. Can you help me identify the brand and age?' },
];

interface Conversation {
  id: string;
  name: string;
  messages: Message[];
  isStarred: boolean;
  timestamp: number;
}

const INITIAL_GREETING: Message = { 
  role: 'model', 
  text: 'Hello! I am Bolt AI Assist. I can help you research item ages, decode serial numbers, and find technical specifications for insurance purposes. What can I help you with today?' 
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [pastedImage, setPastedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [newContext, setNewContext] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('bolt_ai_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('bolt_ai_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            const [mimePart, dataPart] = base64.split(';base64,');
            const mimeType = mimePart.split(':')[1];
            setPastedImage({ data: dataPart, mimeType });
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const saveCurrentToHistory = () => {
    if (messages.length <= 1) return; // Don't save empty/just-greeting chats

    const firstUserMsg = messages.find(m => m.role === 'user')?.text || 'New Conversation';
    const name = `Convo: ${firstUserMsg.substring(0, 25)}${firstUserMsg.length > 25 ? '...' : ''}`;
    
    const newConvo: Conversation = {
      id: activeConversationId || Date.now().toString(),
      name,
      messages: [...messages],
      isStarred: false,
      timestamp: Date.now()
    };

    setHistory(prev => {
      const filtered = prev.filter(c => c.id !== newConvo.id);
      const starred = filtered.filter(c => c.isStarred);
      const unstarred = filtered.filter(c => !c.isStarred);
      
      // Keep only 5 most recent unstarred
      const newUnstarred = [newConvo, ...unstarred].slice(0, 5);
      return [...starred, ...newUnstarred];
    });
  };

  const handleSend = async (text: string = input) => {
    if ((!text.trim() && !pastedImage) || isLoading) return;

    let currentMessages = [...messages];

    if (newContext) {
      saveCurrentToHistory();
      currentMessages = [INITIAL_GREETING];
      setActiveConversationId(null);
      setNewContext(false);
    }

    const userMessage: Message = { 
      role: 'user', 
      text: text || (pastedImage ? "Review this image" : ""),
      image: pastedImage || undefined
    };
    
    const newMessages = [...currentMessages, userMessage];
    setMessages(newMessages);
    setInput('');
    setPastedImage(null);
    setIsLoading(true);

    const responseText = await chatWithGemini(newMessages);
    const finalMessages: Message[] = [...newMessages, { role: 'model', text: responseText }];
    setMessages(finalMessages);
    setIsLoading(false);

    // Auto-update history if we're in an active convo
    if (activeConversationId) {
      setHistory(prev => prev.map(c => 
        c.id === activeConversationId ? { ...c, messages: finalMessages, timestamp: Date.now() } : c
      ));
    }
  };

  const loadConversation = (convo: Conversation) => {
    if (messages.length > 1 && !activeConversationId) {
      saveCurrentToHistory();
    }
    setMessages(convo.messages);
    setActiveConversationId(convo.id);
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => {
      const convo = prev.find(c => c.id === id);
      if (!convo) return prev;
      
      const starredCount = prev.filter(c => c.isStarred).length;
      if (!convo.isStarred && starredCount >= 2) {
        alert("You can only have 2 permanent (starred) conversations.");
        return prev;
      }

      return prev.map(c => c.id === id ? { ...c, isStarred: !c.isStarred } : c);
    });
  };

  const deleteConvo = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) {
      setMessages([INITIAL_GREETING]);
      setActiveConversationId(null);
    }
  };

  const startNewChat = () => {
    if (messages.length > 1) {
      saveCurrentToHistory();
    }
    setMessages([INITIAL_GREETING]);
    setActiveConversationId(null);
    setNewContext(false);
  };

  const starredConvos = history.filter(c => c.isStarred).sort((a, b) => b.timestamp - a.timestamp);
  const recentConvos = history.filter(c => !c.isStarred).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);

  return (
    <div className="flex flex-col h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Bolt AI Assist</h1>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Technical Research Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={startNewChat}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-medium hover:bg-zinc-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar - Desktop Only */}
        <aside className="hidden lg:flex w-80 border-r border-zinc-200 bg-white flex-col overflow-y-auto">
          {starredConvos.length > 0 && (
            <div className="p-6 border-b border-zinc-100">
              <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                Permanent (Starred)
              </h2>
              <div className="space-y-1">
                {starredConvos.map((convo) => (
                  <div
                    key={convo.id}
                    onClick={() => loadConversation(convo)}
                    className={cn(
                      "group w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left cursor-pointer",
                      activeConversationId === convo.id 
                        ? "bg-zinc-900 border-zinc-900 text-white shadow-md" 
                        : "border-transparent hover:bg-zinc-50 text-zinc-700"
                    )}
                  >
                    <MessageIcon className={cn("w-4 h-4 shrink-0", activeConversationId === convo.id ? "text-zinc-400" : "text-zinc-400")} />
                    <span className="text-xs font-medium truncate flex-1">{convo.name}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => toggleStar(convo.id, e)}
                        className="p-1 hover:bg-zinc-200 rounded-md transition-colors"
                      >
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      </button>
                      <button 
                        onClick={(e) => deleteConvo(convo.id, e)}
                        className="p-1 hover:bg-red-100 text-red-500 rounded-md transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-6 flex-1">
            <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Recent Conversations</h2>
            {recentConvos.length === 0 ? (
              <p className="text-[10px] text-zinc-400 italic">No recent chats yet.</p>
            ) : (
              <div className="space-y-1">
                {recentConvos.map((convo) => (
                  <div
                    key={convo.id}
                    onClick={() => loadConversation(convo)}
                    className={cn(
                      "group w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left cursor-pointer",
                      activeConversationId === convo.id 
                        ? "bg-zinc-900 border-zinc-900 text-white shadow-md" 
                        : "border-transparent hover:bg-zinc-50 text-zinc-700"
                    )}
                  >
                    <MessageIcon className={cn("w-4 h-4 shrink-0", activeConversationId === convo.id ? "text-zinc-400" : "text-zinc-400")} />
                    <span className="text-xs font-medium truncate flex-1">{convo.name}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => toggleStar(convo.id, e)}
                        className="p-1 hover:bg-zinc-200 rounded-md transition-colors"
                      >
                        <Star className="w-3 h-3 text-zinc-400" />
                      </button>
                      <button 
                        onClick={(e) => deleteConvo(convo.id, e)}
                        className="p-1 hover:bg-red-100 text-red-500 rounded-md transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8">
              <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Quick Research</h2>
              <div className="space-y-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleSend(action.prompt)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50 transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center group-hover:bg-white transition-colors">
                      <action.icon className="w-4 h-4 text-zinc-600" />
                    </div>
                    <span className="text-sm font-medium text-zinc-700">{action.label}</span>
                    <ChevronRight className="w-4 h-4 ml-auto text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="p-6 border-t border-zinc-100">
            <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
              <h3 className="text-xs font-bold text-zinc-900 mb-1">Pro Tip</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Provide the full serial number and brand name for the most accurate age decoding results.
              </p>
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-zinc-50 relative">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
          >
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-4 max-w-3xl",
                    msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1",
                    msg.role === 'user' ? "bg-zinc-200" : "bg-zinc-900"
                  )}>
                    {msg.role === 'user' ? (
                      <User className="w-4 h-4 text-zinc-600" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className={cn(
                    "p-4 rounded-2xl text-sm shadow-sm border",
                    msg.role === 'user' 
                      ? "bg-white border-zinc-200 text-zinc-800" 
                      : "bg-white border-zinc-200 text-zinc-800"
                  )}>
                    {msg.image && (
                      <div className="mb-3 rounded-lg overflow-hidden border border-zinc-100">
                        <img 
                          src={`data:${msg.image.mimeType};base64,${msg.image.data}`} 
                          alt="Pasted content" 
                          className="max-w-full h-auto block"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="markdown-body">
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isLoading && (
              <div className="flex gap-4 max-w-3xl mr-auto">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0 mt-1">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
                <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-6 bg-white border-t border-zinc-200">
            <div className="max-w-3xl mx-auto space-y-3">
              <div className="flex items-center gap-2 px-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={newContext}
                      onChange={(e) => setNewContext(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-4 h-4 border border-zinc-300 rounded bg-white peer-checked:bg-zinc-900 peer-checked:border-zinc-900 transition-all flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full scale-0 peer-checked:scale-100 transition-transform" />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-700 transition-colors">
                    New conversation context
                  </span>
                </label>
                {newContext && (
                  <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-amber-100 animate-pulse">
                    Fresh Start Mode
                  </span>
                )}
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="relative"
              >
                {pastedImage && (
                  <div className="absolute bottom-full mb-3 left-0">
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className="relative group inline-block"
                    >
                      <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-zinc-900 shadow-lg bg-white">
                        <img 
                          src={`data:${pastedImage.mimeType};base64,${pastedImage.data}`} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setPastedImage(null)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-900 text-white rounded-full flex items-center justify-center shadow-md hover:bg-zinc-800 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl pointer-events-none">
                        <ImageIcon className="text-white w-5 h-5" />
                      </div>
                    </motion.div>
                  </div>
                )}
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="Ask or paste an image (serial number, nameplate)..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
                />
                <button
                  type="submit"
                  disabled={(!input.trim() && !pastedImage) || isLoading}
                  className="absolute right-2 top-2 bottom-2 w-10 bg-zinc-900 text-white rounded-xl flex items-center justify-center hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
              <p className="text-[10px] text-zinc-400 mt-3 text-center uppercase tracking-widest font-medium">
                AI-generated research. Verify with manufacturer for final claims.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
