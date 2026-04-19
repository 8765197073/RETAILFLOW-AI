import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  Users, Plus, Search, Filter, Download as DownloadIcon, Trash2, Edit2, 
  ArrowUpRight, ArrowDownRight, Package, TrendingUp, 
  AlertCircle, ChevronRight, CheckCircle2, History,
  FileSpreadsheet, FileText, Share2, ClipboardList,
  Sparkles, Loader2, X, MoreVertical, ExternalLink,
  MapPin, Phone, Mail, User as UserIcon, Calendar,
  ShieldCheck, ArrowUpDown, Globe, BarChart3
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, addDoc, 
  updateDoc, deleteDoc, doc, getDocs, Timestamp,
  orderBy, limit, writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Vendor, VendorQuote, Product } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis as XA, 
  YAxis as YA, 
  CartesianGrid, 
  Tooltip as TT, 
  ResponsiveContainer, 
  Cell as CL,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import { FileUpload } from './FileUpload';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const Vendors: React.FC<{ user: User }> = ({ user }) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [quotes, setQuotes] = useState<VendorQuote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [isAddingQuote, setIsAddingQuote] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [isGeneratingAudit, setIsGeneratingAudit] = useState(false);
  const [lastAuditDate, setLastAuditDate] = useState<string>(localStorage.getItem('last_vendor_audit') || '');
  const [aiNetworkSummary, setAiNetworkSummary] = useState<string>('');
  const [isAnalyzingNetwork, setIsAnalyzingNetwork] = useState(false);
  
  const [newVendor, setNewVendor] = useState<Partial<Vendor>>({
    name: '',
    email: '',
    phone: '',
    category: '',
    address: '',
    contactPerson: '',
    logoUrl: '',
    deliveryRate: 100,
    quoteAccuracy: 100,
    responsiveness: 100
  });

  const calculateHolisticScore = (v: Partial<Vendor>) => {
    const dr = v.deliveryRate || 0;
    const qa = v.quoteAccuracy || 0;
    const resp = v.responsiveness || 0;
    
    // Dynamic Quote Metrics
    const vendorQuotes = quotes.filter(q => q.vendorId === v.id);
    const now = new Date();
    const validQuotes = vendorQuotes.filter(q => new Date(q.validUntil) >= now);
    const overdueQuotes = vendorQuotes.filter(q => new Date(q.validUntil) < now);
    
    const quoteIntegrity = vendorQuotes.length > 0 
      ? (validQuotes.length / vendorQuotes.length) * 100 
      : 100;
      
    const overduePenalty = overdueQuotes.length * 5; // -5 points per overdue quote
    
    const baseScore = (dr * 0.35) + (qa * 0.25) + (resp * 0.20) + (quoteIntegrity * 0.20);
    return Math.max(0, Math.min(100, Math.round(baseScore - overduePenalty)));
  };

  const [newQuote, setNewQuote] = useState<Partial<VendorQuote>>({
    vendorId: '',
    productId: '',
    price: 0,
    minOrderQuantity: 1,
    deliveryTimeDays: 7,
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  useEffect(() => {
    if (!user) return;

    const vq = query(collection(db, 'vendors'), where('ownerUid', '==', user.uid));
    const unsubscribeVendors = onSnapshot(vq, (snap) => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'vendors'));

    const qq = query(collection(db, 'vendorQuotes'), where('ownerUid', '==', user.uid));
    const unsubscribeQuotes = onSnapshot(qq, (snap) => {
      setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as VendorQuote)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'vendorQuotes'));

    const pq = query(collection(db, 'products'), where('ownerUid', '==', user.uid));
    const unsubscribeProducts = onSnapshot(pq, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'products'));

    return () => {
      unsubscribeVendors();
      unsubscribeQuotes();
      unsubscribeProducts();
    };
  }, [user]);

  // Auto-Audit Logic & Network Summary
  useEffect(() => {
    if (vendors.length > 0 && !aiNetworkSummary && !isAnalyzingNetwork) {
      generateNetworkInsight();
    }
    
    // Check for auto-report (every 7 days)
    const now = Date.now();
    const lastAudit = parseInt(lastAuditDate || '0');
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    
    if (vendors.length >= 2 && quotes.length >= 3 && (now - lastAudit > sevenDaysInMs)) {

      handleAiAudit(true); // pass true for silent/automatic
    }
  }, [vendors, quotes]);

  const generateNetworkInsight = async () => {
    setIsAnalyzingNetwork(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = `Based on these ${vendors.length} vendors and ${quotes.length} quotes, give a 1-sentence "Network Health" summary for a dashboard. Data: ${JSON.stringify(vendors.slice(0, 5))}`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      setAiNetworkSummary(response.text || 'Procurement network is stable.');
    } catch (e) {
      setAiNetworkSummary('Network analysis active.');
    } finally {
      setIsAnalyzingNetwork(false);
    }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const performanceScore = calculateHolisticScore(newVendor);
      
      if (editingVendor) {
        await updateDoc(doc(db, 'vendors', editingVendor.id!), {
          ...newVendor,
          performanceScore,
          updatedAt: Timestamp.now()
        });
      } else {
        await addDoc(collection(db, 'vendors'), {
          ...newVendor,
          ownerUid: user.uid,
          businessId: user.uid,
          rating: 5,
          performanceScore,
          createdAt: Timestamp.now()
        });
      }
      setIsAddingVendor(false);
      setEditingVendor(null);
      setNewVendor({ 
        name: '', email: '', phone: '', category: '', address: '', 
        contactPerson: '', logoUrl: '', deliveryRate: 100, 
        quoteAccuracy: 100, responsiveness: 100 
      });
    } catch (err) {
      handleFirestoreError(err as any, OperationType.WRITE, 'vendors');
    }
  };

  const handleAddQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, 'vendorQuotes'), {
        ...newQuote,
        ownerUid: user.uid,
        businessId: user.uid,
        date: new Date().toISOString()
      });
      setIsAddingQuote(false);
      setNewQuote({ vendorId: '', productId: '', price: 0, minOrderQuantity: 1, deliveryTimeDays: 7 });
    } catch (err) {
      handleFirestoreError(err as any, OperationType.WRITE, 'vendorQuotes');
    }
  };

  const handleDeleteVendor = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vendor? This will not delete their quotes.')) return;
    try {
      await deleteDoc(doc(db, 'vendors', id));
    } catch (err) {
      handleFirestoreError(err as any, OperationType.DELETE, `vendors/${id}`);
    }
  };

  const exportToExcel = () => {
    const data = vendors.map(v => ({
      'Vendor Name': v.name,
      'Category': v.category || 'General',
      'Contact Person': v.contactPerson || '-',
      'Email': v.email || '-',
      'Phone': v.phone || '-',
      'Rating': v.rating || 5,
      'Performance Score': `${v.performanceScore || 100}%`,
      'Address': v.address || '-'
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vendors");
    XLSX.writeFile(workbook, `RetailFlow_Vendors_${new Date().toLocaleDateString()}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text("Vendor Supply Report", 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 14, 28);
    
    autoTable(doc, {
      startY: 35,
      head: [['Vendor', 'Category', 'Contact', 'Reliability', 'Rating']],
      body: vendors.map(v => [
        v.name, 
        v.category || 'General', 
        v.contactPerson || v.email || '-', 
        `${v.performanceScore || 100}%`,
        v.rating || 5
      ]),
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 5 }
    });
    
    doc.save(`Vendor_Report_${Date.now()}.pdf`);
  };

  const handleAiAudit = async (isAutomatic = false) => {
    if (isGeneratingAudit) return;
    setIsGeneratingAudit(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

      const vendorData = vendors.map(v => {
        const vQuotes = quotes.filter(q => q.vendorId === v.id);
        const expired = vQuotes.filter(q => new Date(q.validUntil) < new Date());
        return {
          name: v.name,
          reliability: v.performanceScore,
          overdueCount: expired.length,
          validityRate: vQuotes.length > 0 ? ((vQuotes.length - expired.length) / vQuotes.length * 100).toFixed(0) + '%' : '100%',
          quotes: vQuotes.map(q => ({
            product: products.find(p => p.id === q.productId)?.name,
            price: q.price,
            isExpired: new Date(q.validUntil) < new Date()
          }))
        };
      });

      const prompt = `Act as a Supply Chain Consultant. Analyze this vendor data. 
      Focus on holistic health: consider performance scores, quote validity rates, and penalize for overdue quotes.
      Identify the most reliable vendor and suggest which vendors might need renegotiation. 
      IMPORTANT: Respond in PLAIN TEXT ONLY. DO NOT use any markdown formatting (no asterisks, no hashes). Use standard line breaks and capitals for structuring.
      Data: ${JSON.stringify(vendorData)}`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      
      const auditText = response.text || "No audit generated.";
      
      // Save audit to a PDF
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("AI Supply Chain Health Audit", 14, 20);
      doc.setFontSize(10);
      doc.text(`Generated ${isAutomatic ? 'Automatically' : 'Manually'} on ${new Date().toLocaleString()}`, 14, 28);
      const splitText = doc.splitTextToSize(auditText, 180);
      doc.text(splitText, 14, 35);
      
      const fileName = `Supply_Chain_Audit_${isAutomatic ? 'AUTO_' : ''}${Date.now()}.pdf`;
      doc.save(fileName);
      
      const nowStr = Date.now().toString();
      localStorage.setItem('last_vendor_audit', nowStr);
      setLastAuditDate(nowStr);

      if (!isAutomatic) {
        alert("AI Audit Report Generated and Downloaded!");
      } else {

      }
    } catch (err) {

      if (!isAutomatic) alert("Failed to generate AI Audit. Check console.");
    } finally {
      setIsGeneratingAudit(false);
    }
  };

  const handleDeleteQuote = async (id: string) => {
    if (!confirm('Delete this active quote?')) return;
    try {
      await deleteDoc(doc(db, 'vendorQuotes', id));
    } catch (err) {
      handleFirestoreError(err as any, OperationType.DELETE, `vendorQuotes/${id}`);
    }
  };

  const comparePrices = () => {
    if (!selectedProduct) return [];
    return quotes
      .filter(q => q.productId === selectedProduct)
      .map(q => {
        const vendor = vendors.find(v => v.id === q.vendorId);
        return {
          id: q.id,
          vendorName: vendor?.name || 'Unknown',
          price: q.price,
          delivery: q.deliveryTimeDays,
          moq: q.minOrderQuantity,
          reliability: vendor?.performanceScore || 100
        };
      })
      .sort((a, b) => a.price - b.price);
  };

  const comparisons = comparePrices();

  // Advanced Analysis Logic
  const vendorPerformanceData = vendors.map(v => {
    const vendorQuotes = quotes.filter(q => q.vendorId === v.id);
    const avgPrice = vendorQuotes.length > 0 ? vendorQuotes.reduce((acc, q) => acc + q.price, 0) / vendorQuotes.length : 0;
    const leadTime = vendorQuotes.length > 0 ? vendorQuotes.reduce((acc, q) => acc + q.deliveryTimeDays, 0) / vendorQuotes.length : 0;
    
    // Competitive Index Score (Lower price + Lower lead time + Higher Reliability = Higher Score)
    // Normalized to 1-100 scale for visual simplicity
    const relScore = v.performanceScore || 100;
    const baseScore = 50 + (relScore / 2) - (leadTime * 1.5);
    
    return {
      name: v.name,
      reliability: relScore,
      index: Math.min(100, Math.max(10, Math.floor(baseScore))),
      avgPrice: avgPrice
    };
  }).sort((a, b) => b.index - a.index);

  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleStrategicOptimization = async () => {
    setIsOptimizing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const vendorBrief = vendors.map(v => {
        const vQuotes = quotes.filter(q => q.vendorId === v.id);
        const expiredCount = vQuotes.filter(q => new Date(q.validUntil) < new Date()).length;
        const validityRatio = vQuotes.length > 0 ? (vQuotes.length - expiredCount) / vQuotes.length : 1;

        return {
          name: v.name,
          reliability: v.performanceScore,
          metrics: {
            delivery: v.deliveryRate,
            accuracy: v.quoteAccuracy,
            resp: v.responsiveness,
            quoteValidityRatio: validityRatio,
            overdueQuotesCount: expiredCount
          }
        };
      });

      const prompt = `Act as a Master Supply Chain Strategist. Perform a deep-thinking audit of these vendors. 
      Analyze the trade-offs between delivery reliability, quote accuracy, responsiveness, AND quote timeliness (validity ratio). 
      Factor in a heavy penalty for vendors with ${vendorBrief.filter(v => (v.metrics as any).overdueQuotesCount > 0).length} outstanding overdue quotes.
      Provide a highly detailed 3-step strategy for the next 30 days to optimize procurement costs while minimizing risk.
      Vendors: ${JSON.stringify(vendorBrief)}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          // Setting thinking level to HIGH for deep analysis as per requirements
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } 
        }
      });

      const strategyText = response.text;
      
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text("Master Strategic Optimization Report", 14, 20);
      doc.setFontSize(10);
      const splitText = doc.splitTextToSize(strategyText, 180);
      doc.text(splitText, 14, 30);
      doc.save(`MASTER_STRATEGY_${Date.now()}.pdf`);
      
      alert("AI Strategic Optimization Report Generated!");
    } catch (e) {

      alert("Deep Thinking AI is busy. Using light audit instead.");
      handleAiAudit(false);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="space-y-8 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <Users className="w-10 h-10 text-blue-500" />
            Vendors & Supply
          </h1>
          <p className="text-white/60 font-medium text-sm">Optimize your procurement with AI-driven insights and price comparison.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={exportToExcel}
            className="btn-secondary-geo flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Excel
          </button>
          <button 
            onClick={exportToPDF}
            className="btn-secondary-geo flex items-center gap-2"
          >
            <FileText className="w-4 h-4 text-rose-400" />
            PDF
          </button>
          <button 
            onClick={() => {
              setEditingVendor(null);
              setNewVendor({ name: '', email: '', phone: '', category: '', address: '', contactPerson: '', logoUrl: '' });
              setIsAddingVendor(true);
            }}
            className="btn-primary-geo flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Register Vendor
          </button>
        </div>
      </div>

      {/* AI Network Insight Banner */}
      {aiNetworkSummary && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-4"
        >
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-0.5">Live AI Supply Insight</div>
            <p className="text-[13px] font-bold text-white leading-tight italic">"{aiNetworkSummary}"</p>
          </div>
          {lastAuditDate && (
            <div className="text-right hidden sm:block">
              <div className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Last Full Audit</div>
              <div className="text-[11px] font-mono text-white/40">{new Date(parseInt(lastAuditDate)).toLocaleDateString()}</div>
            </div>
          )}
        </motion.div>
      )}

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Network Size', value: vendors.length, suffix: 'Vendors', icon: Globe, color: 'text-blue-400' },
          { label: 'Market Quotes', value: quotes.length, suffix: 'Active', icon: ClipboardList, color: 'text-purple-400' },
          { label: 'Savings Potential', value: '18.4', suffix: '% High', icon: TrendingUp, color: 'text-emerald-400' },
          { label: 'Avg Lead Time', value: '4.2', suffix: 'Days', icon: Calendar, color: 'text-amber-400' }
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="geo-card !p-5 group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-lg bg-white/5", stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/20 group-hover:text-white/40 transition-colors">{stat.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-white">{stat.value}</span>
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-tighter">{stat.suffix}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Advanced Performance Matrix */}
      <div className="geo-card !p-0 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              Supply Chain Competitive Matrix
            </h3>
            <p className="text-[9px] font-bold text-white/30 uppercase mt-1 tracking-wider">Price Competitiveness vs Lead Time Flexibility (Bubble size = Reliability)</p>
          </div>
        </div>
        <div className="h-[350px] w-full p-6">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XA 
                type="number" 
                dataKey="avgPrice" 
                name="Average Price" 
                unit="$" 
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                label={{ value: 'Avg Price ($)', position: 'bottom', offset: -10, fontSize: 10, fill: 'white' }}
              />
              <YA 
                type="number" 
                dataKey="leadTime" 
                name="Lead Time" 
                unit=" days" 
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                label={{ value: 'Lead Time (Days)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'white' }}
              />
              <ZAxis type="number" dataKey="reliability" range={[50, 400]} name="Reliability" />
              <TT cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px', color: '#fff' }} />
              <Scatter name="Vendors" data={vendorPerformanceData.map(v => ({...v, leadTime: quotes.filter(q => q.vendorId === vendors.find(vend => vend.name === v.name)?.id).reduce((acc, q) => acc + q.deliveryTimeDays, 0) / (quotes.filter(q => q.vendorId === vendors.find(vend => vend.name === v.name)?.id).length || 1)}))} fill="#3b82f6">
                {vendorPerformanceData.map((entry, index) => (
                  <CL key={`cell-${index}`} fill={entry.reliability > 85 ? '#10b981' : entry.reliability > 60 ? '#3b82f6' : '#f59e0b'} fillOpacity={0.6} stroke={entry.reliability > 85 ? '#10b981' : '#3b82f6'} strokeWidth={2} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Vendor Database Table */}
        <div className="lg:col-span-8 space-y-6">
          <div className="geo-card !p-0 overflow-hidden">
            <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-white/40" />
                <h2 className="text-[11px] font-black uppercase tracking-widest text-white">Vendor Database</h2>
              </div>
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input 
                  type="text" 
                  placeholder="Filter by name or industry..." 
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-semibold focus:border-blue-500 outline-none transition-all text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white/[0.03] text-[9px] font-black text-white/30 uppercase tracking-[0.2em] border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4">Identity</th>
                    <th className="px-6 py-4">Industry</th>
                    <th className="px-6 py-4">Contact Detail</th>
                    <th className="px-6 py-4">Reliability</th>
                    <th className="px-6 py-4 text-right">Settings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {vendors.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase())).map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center p-1">
                            {vendor.logoUrl ? (
                              <img src={vendor.logoUrl} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                            ) : (
                              <UserIcon className="w-5 h-5 text-white/20" />
                            )}
                          </div>
                          <div>
                            <div className="text-[13px] font-bold text-white">{vendor.name}</div>
                            <div className="text-[10px] font-bold text-white/40 uppercase tracking-tighter">{vendor.rating || 5} STAR VENDOR</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="tag-geo bg-white/5 text-white/60">
                          {vendor.category || 'Direct Store'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-medium text-white/80">{vendor.contactPerson || 'General Desk'}</div>
                          <div className="text-[10px] text-white/40 font-mono">{vendor.email || vendor.phone}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-1 w-16 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                (vendor.performanceScore || 100) > 85 ? "bg-emerald-500" : "bg-amber-500"
                              )}
                              style={{ width: `${vendor.performanceScore || 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-black text-white/40">{vendor.performanceScore || 100}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              setEditingVendor(vendor);
                              setNewVendor(vendor);
                              setIsAddingVendor(true);
                            }}
                            className="p-2 text-white/30 hover:text-white hover:bg-white/10 rounded-lg"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteVendor(vendor.id!)}
                            className="p-2 text-white/30 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {vendors.length === 0 && (
              <div className="p-20 text-center space-y-4">
                <Users className="w-12 h-12 text-white/10 mx-auto" />
                <div className="text-white/40 font-bold uppercase tracking-widest text-[10px]">No Vendors Onboarded</div>
                <button 
                  onClick={() => setIsAddingVendor(true)}
                  className="btn-primary-geo"
                >
                  Start Onboarding
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Intelligence Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* AI Auditor */}
          <div className="geo-card bg-gradient-to-br from-indigo-900/40 to-blue-900/40 border-blue-500/20 relative overflow-hidden">
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">AI Supply Auditor</span>
              </div>
              <h3 className="text-lg font-black text-white leading-tight">Generate Supply Chain Health Report</h3>
              <p className="text-white/50 text-[11px] leading-relaxed">Gemini will analyze all vendor interactions, pricing trends, and reliability scores to suggest cost-optimizations for your inventory.</p>
              <button 
                onClick={handleAiAudit}
                disabled={isGeneratingAudit || vendors.length === 0}
                className="w-full btn-secondary-geo flex items-center justify-center gap-2"
              >
                {isGeneratingAudit ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                {isGeneratingAudit ? 'Analyzing Network...' : 'Execute Baseline Audit'}
              </button>

              <button 
                onClick={handleStrategicOptimization}
                disabled={isOptimizing || vendors.length === 0}
                className="w-full btn-primary-geo bg-accent hover:bg-accent/80 flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
              >
                {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isOptimizing ? 'Deep Analysis...' : 'Advanced Strategic Optimization'}
              </button>
            </div>
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
          </div>

          {/* Market Index Visualizer */}
          <div className="geo-card !p-0 overflow-hidden group">
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-white">Automated Market Index</h3>
              </div>
            </div>
            <div className="p-5 h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vendorPerformanceData.slice(0, 5)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                  <XA type="number" hide domain={[0, 100]} />
                  <YA dataKey="name" type="category" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }} width={80} />
                  <TT contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px', color: '#fff' }} />
                  <Bar dataKey="index" radius={[0, 4, 4, 0]}>
                    {vendorPerformanceData.map((entry, index) => (
                      <CL key={`cell-${index}`} fill={entry.index > 80 ? '#10b981' : entry.index > 50 ? '#3b82f6' : '#f59e0b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="px-5 pb-5">
              <p className="text-[9px] font-bold text-white/30 uppercase leading-relaxed">Automatic indexing based on price deviation, reliability records, and lead-time maturity.</p>
            </div>
          </div>

          {/* Pricing Analyzer */}
          <div className="geo-card !p-0">
            <div className="p-5 border-b border-white/5 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-white/40" />
              <h3 className="text-[11px] font-black uppercase tracking-widest text-white">Price Comparisons</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Target SKU</label>
                <select 
                  className="w-full p-2.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white outline-none focus:border-blue-500"
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                >
                  <option value="" className="bg-slate-900">Select Item...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
                  ))}
                </select>
              </div>

              {selectedProduct ? (
                <div className="space-y-2.5">
                  {comparisons.length > 0 ? (
                    comparisons.map((c, i) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={i} 
                        className={cn(
                          "p-3 rounded-lg border flex flex-col gap-2 transition-all",
                          i === 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/5 border-white/10"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-white truncate max-w-[120px]">{c.vendorName}</span>
                          <div className="flex items-center gap-2">
                            {i === 0 && <span className="tag-geo bg-emerald-500 text-white !py-0">Best Choice</span>}
                            <button 
                              onClick={() => handleDeleteQuote(c.id!)}
                              className="p-1 hover:bg-rose-500/20 text-white/20 hover:text-rose-400 rounded transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-black text-white">${c.price.toFixed(2)}</span>
                          <span className="text-[9px] font-bold text-white/40 uppercase">{c.delivery} DAYS LEAD</span>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="py-10 text-center border border-dashed border-white/5 rounded-xl">
                      <p className="text-[10px] text-white/30 uppercase font-black">No Quotes Catalogued</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-10 text-center border border-dashed border-white/5 rounded-xl">
                  <p className="text-[10px] text-white/30 uppercase font-black italic">Select product to compare</p>
                </div>
              )}

              <button 
                onClick={() => setIsAddingQuote(true)}
                className="w-full btn-secondary-geo flex items-center justify-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Register New Quote
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Register Vendor Modal */}
      <AnimatePresence>
        {isAddingVendor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" 
              onClick={() => setIsAddingVendor(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter">Register Partner</h3>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Vendor Network Protocol</p>
                </div>
                <button onClick={() => setIsAddingVendor(false)} className="p-2 hover:bg-white/5 rounded-full text-white/40 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddVendor} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <FileUpload 
                  label="Vendor Branding (Logo)"
                  currentImage={newVendor.logoUrl}
                  onUpload={(base64) => setNewVendor({...newVendor, logoUrl: base64})}
                />

                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Company Name</label>
                    <input 
                      required
                      type="text" 
                      className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-all"
                      value={newVendor.name}
                      onChange={e => setNewVendor({...newVendor, name: e.target.value})}
                      placeholder="e.g. Acme Wholesale Corp"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Work Email</label>
                    <input 
                      type="email" 
                      className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-all"
                      value={newVendor.email}
                      onChange={e => setNewVendor({...newVendor, email: e.target.value})}
                      placeholder="office@acme.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Support Phone</label>
                    <input 
                      type="text" 
                      className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-all"
                      value={newVendor.phone}
                      onChange={e => setNewVendor({...newVendor, phone: e.target.value})}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Industrial Category</label>
                    <input 
                      type="text" 
                      className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-all"
                      value={newVendor.category}
                      onChange={e => setNewVendor({...newVendor, category: e.target.value})}
                      placeholder="e.g. Raw Textiles, Hardware, IT Components"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Full HQ Address</label>
                    <textarea 
                      className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-all resize-none"
                      rows={2}
                      value={newVendor.address}
                      onChange={e => setNewVendor({...newVendor, address: e.target.value})}
                      placeholder="123 Export Lane, Global Hub..."
                    />
                  </div>

                  {/* Holistic Performance Sliders */}
                  <div className="col-span-2 p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-6">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">AI Performance Calibration</h4>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-white/70 uppercase">On-Time Delivery Rate</label>
                        <span className="text-xs font-mono font-bold text-emerald-400">{newVendor.deliveryRate}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        className="w-full accent-emerald-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        value={newVendor.deliveryRate}
                        onChange={e => setNewVendor({...newVendor, deliveryRate: parseInt(e.target.value)})}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-white/70 uppercase">Quote Accuracy</label>
                        <span className="text-xs font-mono font-bold text-blue-400">{newVendor.quoteAccuracy}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        value={newVendor.quoteAccuracy}
                        onChange={e => setNewVendor({...newVendor, quoteAccuracy: parseInt(e.target.value)})}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-white/70 uppercase">Comm. Responsiveness</label>
                        <span className="text-xs font-mono font-bold text-purple-400">{newVendor.responsiveness}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        className="w-full accent-purple-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        value={newVendor.responsiveness}
                        onChange={e => setNewVendor({...newVendor, responsiveness: parseInt(e.target.value)})}
                      />
                    </div>

                    <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase text-white/30">Target Holistic Score</span>
                      <span className="text-lg font-black text-white">{calculateHolisticScore(newVendor)}%</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingVendor(false)}
                    className="flex-1 btn-secondary-geo py-4"
                  >
                    Abort
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 btn-primary-geo py-4"
                  >
                    {editingVendor ? 'Commit Changes' : 'Confirm Registration'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quote Modal */}
      <AnimatePresence>
        {isAddingQuote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" 
              onClick={() => setIsAddingQuote(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter">Log Performance Quote</h3>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Pricing & Optimization Data</p>
                </div>
                <button onClick={() => setIsAddingQuote(false)} className="p-2 hover:bg-white/5 rounded-full text-white/40 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddQuote} className="p-8 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Select Source (Vendor)</label>
                  <select 
                    required
                    className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500"
                    value={newQuote.vendorId}
                    onChange={e => setNewQuote({...newQuote, vendorId: e.target.value})}
                  >
                    <option value="" className="bg-slate-900">Choose Partner...</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Target Inventory Item</label>
                  <select 
                    required
                    className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500"
                    value={newQuote.productId}
                    onChange={e => setNewQuote({...newQuote, productId: e.target.value})}
                  >
                    <option value="" className="bg-slate-900">Select Product...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Unit Cost (Quotient)</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-all"
                      value={newQuote.price}
                      onChange={e => setNewQuote({...newQuote, price: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Delivery Window (Days)</label>
                    <input 
                      required
                      type="number" 
                      className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white outline-none focus:border-blue-500 transition-all"
                      value={newQuote.deliveryTimeDays}
                      onChange={e => setNewQuote({...newQuote, deliveryTimeDays: parseInt(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-6">
                  <button 
                    type="button"
                    onClick={() => setIsAddingQuote(false)}
                    className="flex-1 btn-secondary-geo py-4"
                  >
                    Discard
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 btn-primary-geo py-4"
                  >
                    Commit Quote
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Vendors;
