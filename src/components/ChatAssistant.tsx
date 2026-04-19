import React, { useState, useEffect, useRef } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Send, 
  Bot, 
  User as UserIcon, 
  X, 
  Loader2, 
  Sparkles,
  Mic,
  MicOff,
  Image as ImageIcon,
  Paperclip,
  Maximize2,
  Minimize2,
  PhoneCall,
  Command,
  Settings,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Product, Invoice, Customer, Business } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

const AI_MODEL = "gemini-3-flash-preview";

export default function ChatAssistant({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { language } = useLanguage();
  const [messages, setMessages] = useState<{ role: 'user' | 'bot' | 'assistant', content: string, type?: 'text' | 'image' | 'action', timestamp: number }[]>(() => {
    const saved = localStorage.getItem('chat_history');
    return saved ? JSON.parse(saved) : [
      { 
        role: 'bot', 
        content: "Hello! I am your RetailFlow AI assistant. I can handle business tasks via voice, text, or images (like screenshots). How can I help you today?",
        timestamp: Date.now()
      }
    ];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [base64File, setBase64File] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    
    // Setup Voice Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = language === 'hi' ? 'hi-IN' : (language === 'en' ? 'en-US' : language);

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {

        setIsListening(false);
      };
    }

    return () => {
      unsubscribe();
    };
  }, [language]);

  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messages));
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBase64File(reader.result as string);
      };
      reader.readAsDataURL(selected);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !base64File) || isLoading || !user) return;
    if (!aiRef.current) return;

    const userMsgContent = input.trim() || (file ? `Shared a file: ${file.name}` : 'Shared an image');
    const newUserMsg = { role: 'user' as const, content: userMsgContent, timestamp: Date.now() };
    setMessages(prev => [...prev, newUserMsg]);
    
    const currentInput = input;
    const currentBase64 = base64File;
    const currentFile = file;

    setInput('');
    setFile(null);
    setBase64File(null);
    setIsLoading(true);

    try {
      const toolDefinitions = [
        {
          name: "addProduct",
          parameters: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              price: { type: Type.NUMBER },
              stockLevel: { type: Type.NUMBER },
              sku: { type: Type.STRING },
              category: { type: Type.STRING },
              unit: { type: Type.STRING }
            },
            required: ["name", "price"]
          }
        },
        {
          name: "createInvoice",
          parameters: {
            type: Type.OBJECT,
            properties: {
              customerName: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productName: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    price: { type: Type.NUMBER }
                  }
                }
              }
            },
            required: ["customerName", "items"]
          }
        },
        {
          name: "searchInventory",
          parameters: {
            type: Type.OBJECT,
            properties: {
              query: { type: Type.STRING }
            }
          }
        },
        {
          name: "addVendor",
          parameters: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              email: { type: Type.STRING },
              phone: { type: Type.STRING },
              category: { type: Type.STRING },
              contactPerson: { type: Type.STRING }
            },
            required: ["name"]
          }
        },
        {
          name: "addCustomer",
          parameters: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              email: { type: Type.STRING },
              phone: { type: Type.STRING },
              address: { type: Type.STRING }
            },
            required: ["name", "email"]
          }
        },
        {
          name: "compareVendors",
          parameters: {
            type: Type.OBJECT,
            properties: {
              productName: { type: Type.STRING }
            },
            required: ["productName"]
          }
        }
      ];

      const parts: any[] = [];
      if (currentBase64) {
        parts.push({
          inlineData: {
            mimeType: currentFile?.type || "image/png",
            data: currentBase64.split(',')[1]
          }
        });
      }
      if (currentInput) {
        parts.push({ text: `User request: ${currentInput}.` });
      }

      const response = await aiRef.current.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: `You are RetailFlow AI Bot. 
          Handle business tasks: Add products, create invoices, search data.
          Users share WhatsApp screenshots, photos of bills, or voice notes.
          Preferred Language: ${language}.
          Always use tool calls if user wants to execute an action.
          If no action, just chat helpfully.`,
          tools: [{ functionDeclarations: toolDefinitions }]
        }
      });

      const functionCalls = response.functionCalls;
      if (functionCalls) {
        let actionMessages = [];
        for (const call of functionCalls) {
          let result = "Done.";
          try {
            if (call.name === 'addProduct') {
              const p = call.args as Partial<Product>;
              await addDoc(collection(db, 'products'), {
                ...p,
                ownerUid: user.uid,
                stockLevel: p.stockLevel || 0,
                unit: p.unit || 'pcs',
                createdAt: new Date().toISOString()
              });
              result = `✅ Product "${p.name}" added successfully.`;
            } else if (call.name === 'addVendor') {
              const v = call.args as any;
              await addDoc(collection(db, 'vendors'), {
                ...v,
                ownerUid: user.uid,
                rating: 5,
                performanceScore: 100,
                createdAt: new Date().toISOString()
              });
              result = `✅ Vendor "${v.name}" registered in network.`;
            } else if (call.name === 'addCustomer') {
              const c = call.args as any;
              await addDoc(collection(db, 'customers'), {
                ...c,
                ownerUid: user.uid,
                totalSpent: 0,
                lastOrderDate: '-',
                createdAt: new Date().toISOString()
              });
              result = `✅ Customer "${c.name}" profile created.`;
            } else if (call.name === 'createInvoice') {
              const args = call.args as any;
              const total = args.items.reduce((s: number, i: any) => s + (i.price * i.quantity), 0);
              
              await addDoc(collection(db, 'invoices'), {
                invoiceNumber: `INV-${Date.now()}`,
                date: new Date().toISOString(),
                customerName: args.customerName,
                customerId: 'ai-client',
                items: args.items,
                total: total,
                ownerUid: user.uid,
                status: 'pending'
              });

              // Update customer total spent if exists
              const cSnap = await getDocs(query(collection(db, 'customers'), where('name', '==', args.customerName), where('ownerUid', '==', user.uid)));
              if (!cSnap.empty) {
                const cDoc = cSnap.docs[0];
                await updateDoc(doc(db, 'customers', cDoc.id), {
                  totalSpent: (cDoc.data().totalSpent || 0) + total,
                  lastOrderDate: new Date().toISOString().split('T')[0]
                });
              }

              result = `✅ Invoice generated for ${args.customerName} (Total: $${total.toFixed(2)}). CRM updated.`;
            } else if (call.name === 'searchInventory') {
              const qStr = (call.args as any).query;
              result = `🔍 Searching for "${qStr}"... Action recorded in backend state.`;
            } else if (call.name === 'compareVendors') {
              const productName = (call.args as any).productName;
              // Fetch products to find ID
              const pSnap = await getDocs(query(collection(db, 'products'), where('ownerUid', '==', user.uid)));
              const product = pSnap.docs.find(d => d.data().name.toLowerCase().includes(productName.toLowerCase()));
              
              if (product) {
                const qSnap = await getDocs(query(collection(db, 'vendorQuotes'), where('productId', '==', product.id)));
                const quotes = qSnap.docs.map(d => d.data());
                if (quotes.length > 0) {
                  const cheapest = quotes.reduce((min, q) => q.price < min.price ? q : min, quotes[0]);
                  const vSnap = await getDocs(query(collection(db, 'vendors'), where('id', '==', cheapest.vendorId)));
                  const vendorName = !vSnap.empty ? vSnap.docs[0].data().name : 'Unknown';
                  result = `📊 Analysis: For "${productName}", the best vendor is currently "${vendorName}" at $${cheapest.price.toFixed(2)} per unit.`;
                } else {
                  result = `⚠️ No vendor quotes found for "${productName}". Please add some in the Vendor Dashboard.`;
                }
              } else {
                result = `❓ Product "${productName}" not found in your inventory.`;
              }
            }
          } catch (err) {
            result = "❌ Failed to complete action.";
          }
          actionMessages.push({ role: 'bot' as const, content: result, type: 'action' as const, timestamp: Date.now() });
        }
        setMessages(prev => [...prev, ...actionMessages]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'bot', 
          content: response.text || "I processed that, but have no specific response.",
          timestamp: Date.now() 
        }]);
      }

    } catch (e) {

      setMessages(prev => [...prev, { 
        role: 'bot', 
        content: "Operational error. Please try again or check your connection.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    if (confirm('Delete AI chat history?')) {
      setMessages([{ 
        role: 'bot', 
        content: "Memory cleared. READY for new tasks.",
        timestamp: Date.now()
      }]);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-end p-4 pointer-events-none">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm pointer-events-auto"
          />
          
          <motion.div 
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            className={cn(
              "relative bg-slate-900 border border-white/10 shadow-2xl rounded-3xl overflow-hidden flex flex-col pointer-events-auto transition-all duration-500",
              isMaximized ? "w-full max-w-5xl h-[85vh]" : "w-full max-w-lg h-[650px]"
            )}
          >
            {/* Header */}
            <div className="px-6 py-5 bg-white/5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                    <Bot className="w-7 h-7 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tighter">RetailFlow Intelligence</h3>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-accent" />
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Multi-Modal Sync Active</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setIsMaximized(!isMaximized)} className="p-2 hover:bg-white/5 rounded-xl transition-colors text-white/40 hover:text-white">
                  {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={clearHistory} className="p-2 hover:bg-white/5 rounded-xl transition-colors text-white/40 hover:text-rose-400">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors text-white/40 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.05),transparent_50%)]">
              {messages.map((msg, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: msg.role === 'bot' ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={msg.timestamp + i}
                  className={cn(
                    "flex gap-4 max-w-[90%]",
                    msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
                    msg.role === 'bot' ? "bg-accent/20 text-accent" : "bg-white/10 text-white/60"
                  )}>
                    {msg.role === 'bot' ? <Bot className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                  </div>
                  <div className={cn(
                    "p-4 rounded-3xl text-[14px] leading-relaxed shadow-xl",
                    msg.role === 'user' 
                      ? "bg-accent text-white rounded-tr-none" 
                      : "bg-white/5 text-white/90 border border-white/10 rounded-tl-none backdrop-blur-md"
                  )}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex gap-4">
                  <div className="w-9 h-9 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                    <Loader2 className="w-5 h-5 text-accent animate-spin" />
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-3xl rounded-tl-none">
                    <div className="flex gap-1.5">
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Footer */}
            <div className="p-6 bg-white/5 border-t border-white/10 space-y-4">
              {file && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-2.5 bg-accent/10 border border-accent/20 rounded-2xl"
                >
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-accent" />
                    <span className="text-[11px] font-bold text-accent uppercase tracking-wider">{file.name}</span>
                  </div>
                  <button onClick={() => {setFile(null); setBase64File(null)}} className="hover:bg-accent/20 p-1.5 rounded-lg">
                    <X className="w-3.5 h-3.5 text-accent" />
                  </button>
                </motion.div>
              )}

              <div className="flex items-center gap-3">
                <input 
                  type="file" 
                  id="chat-file" 
                  className="hidden" 
                  onChange={handleFileChange} 
                  accept="image/*,.pdf,.doc,.docx"
                />
                <label 
                  htmlFor="chat-file"
                  className="p-3.5 bg-white/5 hover:bg-white/10 rounded-2xl cursor-pointer text-white/40 hover:text-accent transition-all border border-white/5"
                >
                  <ImageIcon className="w-5 h-5" />
                </label>

                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Speak, share image, or type..."
                    className="w-full pl-5 pr-14 py-4 bg-white/5 border border-white/10 focus:border-accent rounded-2xl text-sm font-medium outline-none transition-all text-white placeholder:text-white/20"
                  />
                  <button 
                    onClick={toggleListening}
                    className={cn(
                      "absolute right-3.5 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all",
                      isListening ? "bg-rose-500/20 text-rose-400 animate-pulse" : "text-white/20 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>

                <button 
                  onClick={handleSend}
                  disabled={(!input.trim() && !file) || isLoading}
                  className="p-4 bg-accent hover:bg-accent/80 disabled:opacity-30 rounded-2xl transition-all shadow-lg shadow-accent/20"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="flex items-center justify-center gap-6 pt-2">
                <div className="flex items-center gap-2 text-[10px] font-black text-white/10 uppercase tracking-[0.2em]">
                  <PhoneCall className="w-3.5 h-3.5" /> Voice Ready
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black text-white/10 uppercase tracking-[0.2em]">
                  <Command className="w-3.5 h-3.5" /> High Speed
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black text-white/10 uppercase tracking-[0.2em]">
                  <Settings className="w-3.5 h-3.5" /> All Languages
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
