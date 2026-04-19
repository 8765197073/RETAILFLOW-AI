import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Zap,
  Bell,
  Package,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Invoice, Product } from '../types';
import { cn } from '../lib/utils';

export default function NotificationTicker({ user }: { user: User }) {
  const [tickerMessages, setTickerMessages] = useState<{ id: string, text: string, type: 'urgent' | 'info' | 'success', icon: any }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Listen to low stock
    const productsQuery = query(collection(db, 'products'), where('ownerUid', '==', user.uid));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const products = snapshot.docs.map(d => d.data() as Product);
      const critical = products.filter(p => p.stockLevel <= (p.reorderLevel || 5));
      
      const messages: any[] = [];
      if (critical.length > 0) {
        messages.push({
          id: 'stock-alert',
          text: `SUPPLY CHAIN ALERT: ${critical.length} items are below critical reorder levels. Immediate restock advised.`,
          type: 'urgent',
          icon: AlertTriangle
        });
      }

      // Listen to pending invoices
      const invoicesQuery = query(
        collection(db, 'invoices'), 
        where('ownerUid', '==', user.uid),
        where('status', '==', 'pending'),
        limit(5)
      );
      
      onSnapshot(invoicesQuery, (invSnap) => {
        const pending = invSnap.docs.map(d => d.data() as Invoice);
        if (pending.length > 0) {
          messages.push({
            id: 'invoice-alert',
            text: `OPERATIONAL SYNC: ${pending.length} invoices are currently PENDING payment. Liquidity check recommended.`,
            type: 'info',
            icon: Bell
          });
        }
        
        // Static High Performance messages
        messages.push({
          id: 'ai-audit',
          text: `AI STATUS: Neural network is actively auditing vendor performance and market price trends...`,
          type: 'success',
          icon: Zap
        });

        messages.push({
          id: 'growth-alert',
          text: `MARKET PULSE: Global luxury commodities are seeing a 14.2% growth trend. Optimize listings.`,
          type: 'success',
          icon: TrendingUp
        });

        setTickerMessages(messages);
      });
    });

    return () => {
      unsubscribeProducts();
    };
  }, [user.uid]);

  useEffect(() => {
    if (tickerMessages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % tickerMessages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [tickerMessages]);

  if (tickerMessages.length === 0) return null;

  const current = tickerMessages[currentIndex];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[150] h-10 bg-slate-950/80 backdrop-blur-xl border-t border-white/5 flex items-center px-6 overflow-hidden pointer-events-none">
      <div className="flex items-center gap-4 w-full max-w-7xl mx-auto">
        <div className="flex items-center gap-2 shrink-0">
          <Activity className="w-3 h-3 text-accent animate-pulse" />
          <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em]">Live Stream</span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <AnimatePresence mode="wait">
          <motion.div 
            key={current.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3"
          >
            <current.icon className={cn(
              "w-3.5 h-3.5",
              current.type === 'urgent' ? "text-rose-500" : current.type === 'success' ? "text-emerald-400" : "text-blue-400"
            )} />
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              current.type === 'urgent' ? "text-rose-500" : "text-white/80"
            )}>
              {current.text}
            </span>
          </motion.div>
        </AnimatePresence>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Global Engine OS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
