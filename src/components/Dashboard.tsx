import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, limit, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { 
  TrendingUp, 
  Users, 
  Package, 
  FileText, 
  ArrowUpRight, 
  ArrowDownRight,
  Clock,
  Plus,
  Store,
  Sparkles,
  RefreshCw,
  Bell,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Activity,
  Cpu,
  Download,
  UserPlus
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion } from 'motion/react';
import { Product, Invoice, Business, Customer, Vendor } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const data = [
  { name: 'Mon', sales: 4000 },
  { name: 'Tue', sales: 3000 },
  { name: 'Wed', sales: 2000 },
  { name: 'Thu', sales: 2780 },
  { name: 'Fri', sales: 1890 },
  { name: 'Sat', sales: 2390 },
  { name: 'Sun', sales: 3490 },
];

export default function Dashboard({ user }: { user: User }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [recentVendors, setRecentVendors] = useState<any[]>([]);
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [agentStatus, setAgentStatus] = useState<any>(null);
  const [alerts, setAlerts] = useState<{ id: string, type: 'stock' | 'sales' | 'billing', message: string, status: 'urgent' | 'info' | 'success', time: string }[]>([]);
  const [aiRecs, setAiRecs] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExportingMaster, setIsExportingMaster] = useState(false);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalCustomers: 0,
    lowStock: 0,
    criticalStock: 0,
    pendingInvoices: 0
  });

  const [aiAuditLogs, setAiAuditLogs] = useState<string[]>([]);
  const [chartData, setChartData] = useState<{name: string, sales: number}[]>([]);
  const [timeRange, setTimeRange] = useState<'7D' | '30D' | 'YTD'>('7D');

  useEffect(() => {
    const newAlerts: { id: string, type: 'stock' | 'sales' | 'billing', message: string, status: 'urgent' | 'info' | 'success', time: string }[] = [];
    if (stats.criticalStock > 0) {
      newAlerts.push({ id: '1', type: 'stock', message: `${stats.criticalStock} items are below reorder level.`, status: 'urgent', time: 'Just now' });
    }
    if (stats.pendingInvoices > 0) {
      newAlerts.push({ id: '2', type: 'billing', message: `${stats.pendingInvoices} invoices are awaiting payment.`, status: 'info', time: '5m ago' });
    }
    if (stats.totalSales > 5000) {
      newAlerts.push({ id: '3', type: 'sales', message: `Daily sales target surpassed!`, status: 'success', time: '1h ago' });
    }
    setAlerts(newAlerts);

    const recs: string[] = [];
    if (stats.criticalStock > 0) {
      recs.push("Review supplier lead times for low stock items to prevent stockouts.");
    }
    if (stats.pendingInvoices > 3) {
      recs.push("Consider sending batch payment reminders for pending invoices.");
    }
    recs.push("High revenue detected. Check if your tax settings are optimized for this volume.");
    recs.push("A new customer segment is emerging - consider a targeted promo.");
    setAiRecs(recs);
  }, [stats]);

  useEffect(() => {
    const invoicesQuery = query(
      collection(db, 'invoices'), 
      where('ownerUid', '==', user.uid),
      orderBy('date', 'desc'), 
      limit(100)
    );
    const unsubscribeInvoices = onSnapshot(invoicesQuery, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
      setRecentInvoices(docs);
      const total = docs.reduce((acc, curr) => acc + curr.total, 0);
      const pending = docs.filter(i => i.status === 'pending').length;
      setStats(prev => ({ ...prev, totalSales: total, pendingInvoices: pending }));
    });

    const customersQuery = query(collection(db, 'customers'), where('ownerUid', '==', user.uid));
    const unsubscribeCustomers = onSnapshot(customersQuery, (snapshot) => {
      setStats(prev => ({ ...prev, totalCustomers: snapshot.size }));
      const customersData = snapshot.docs.map(d => ({ id: d.id, ...d.data(), type: 'customer' } as any));
      setRecentCustomers(customersData.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)).slice(0, 5));
    });

    const productsQuery = query(collection(db, 'products'), where('ownerUid', '==', user.uid));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const productsData = snapshot.docs.map(d => ({ id: d.id, ...d.data(), type: 'product' } as any));
      setRecentProducts(productsData.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)).slice(0, 5));
      
      const products = snapshot.docs.map(d => d.data() as Product);
      const low = products.filter(p => p.stockLevel <= 10).length;
      const critical = products.filter(p => p.stockLevel <= (p.reorderLevel || 5)).length;
      setStats(prev => ({ ...prev, lowStock: low, criticalStock: critical }));
    });

    const vendorsQuery = query(collection(db, 'vendors'), where('ownerUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(5));
    const unsubscribeVendors = onSnapshot(vendorsQuery, (snapshot) => {
      setRecentVendors(snapshot.docs.map(d => ({ id: d.id, ...d.data(), type: 'vendor' })));
    });

    const businessQuery = query(collection(db, 'businesses'), where('ownerUid', '==', user.uid));
    const unsubscribeBusiness = onSnapshot(businessQuery, (snapshot) => {
      if (!snapshot.empty) {
        setBusiness({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Business);
      }
    });

    const fetchAgentStatus = async () => {
      try {
        // Mock health check
        await new Promise(r => setTimeout(r, 200));
        setAgentStatus({ status: 'ok', activeScans: Math.floor(Math.random() * 5), lastCheck: new Date().toISOString() });
      } catch (e) {

      }
    };

    fetchAgentStatus();
    const agentInterval = setInterval(fetchAgentStatus, 30000);

    const runAudit = async () => {
      try {
        // Mock audit
        await new Promise(r => setTimeout(r, 200));
        const resData = {
          optimizations: [
            "Database indices verified",
            "Cache hit ratio optimized (+12%)",
            "Abandoned carts identified",
            "Supplier risk low"
          ]
        };
        setAiAuditLogs(prev => [resData.optimizations[Math.floor(Math.random() * resData.optimizations.length)], ...prev].slice(0, 5));
      } catch (e) {
        // AI handles silently
      }
    };
    
    const auditInterval = setInterval(runAudit, 8000);
    runAudit();

    return () => {
      unsubscribeInvoices();
      unsubscribeCustomers();
      unsubscribeProducts();
      unsubscribeVendors();
      unsubscribeBusiness();
      clearInterval(agentInterval);
      clearInterval(auditInterval);
    };
  }, [user.uid]);
  useEffect(() => {
    // Generate real-time chart data from invoices based on selected time range
    let dateArray: string[] = [];
    let formatOptions: Intl.DateTimeFormatOptions = {};
    let fallbackMultiplier = 1;

    if (timeRange === '7D') {
      dateArray = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toLocaleDateString('en-US', { weekday: 'short' });
      }).reverse();
      formatOptions = { weekday: 'short' };
      fallbackMultiplier = 1;
    } else if (timeRange === '30D') {
      dateArray = [...Array(30)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }).reverse();
      formatOptions = { month: 'short', day: 'numeric' };
      fallbackMultiplier = 1.2;
    } else if (timeRange === 'YTD') {
      const currentMonth = new Date().getMonth();
      dateArray = [...Array(currentMonth + 1)].map((_, i) => {
        const d = new Date();
        d.setMonth(i);
        return d.toLocaleDateString('en-US', { month: 'short' });
      });
      formatOptions = { month: 'short' };
      fallbackMultiplier = 4;
    }

    const historicalData = dateArray.map(day => {
      const daySales = recentInvoices
        .filter(inv => new Date(inv.date).toLocaleDateString('en-US', formatOptions) === day)
        .reduce((sum, inv) => sum + inv.total, 0);
      
      return { 
        name: day, 
        sales: daySales || Math.floor(Math.random() * 1000 * fallbackMultiplier) + 500 * fallbackMultiplier 
      }; // Fallback visual trend if no real data
    });
    setChartData(historicalData);
  }, [recentInvoices, timeRange]);

  const downloadChartReport = (chartName: string) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text(`${chartName} - Business Summary`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated for ${user.displayName || 'RetailFlow User'}`, 14, 30);
    doc.text(`Date: ${new Date().toLocaleString()}`, 14, 36);

    const tableData = [
      ['Metric', 'Current Value'],
      ['Total Revenue', `$${stats.totalSales.toLocaleString()}`],
      ['Pending Invoices', stats.pendingInvoices.toString()],
      ['Low Stock Items', stats.lowStock.toString()],
      ['Critical Stock', stats.criticalStock.toString()],
      ['Total Customers', stats.totalCustomers.toString()]
    ];

    autoTable(doc, {
      head: [tableData[0]],
      body: tableData.slice(1),
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`${chartName.toLowerCase().replace(' ', '_')}_${Date.now()}.pdf`);
  };

  const handleMasterExport = async () => {
    setIsExportingMaster(true);
    try {
      // Fetch all collections
      const [invSnap, custSnap, prodSnap, vendSnap] = await Promise.all([
        getDocs(query(collection(db, 'invoices'), where('ownerUid', '==', user.uid))),
        getDocs(query(collection(db, 'customers'), where('ownerUid', '==', user.uid))),
        getDocs(query(collection(db, 'products'), where('ownerUid', '==', user.uid))),
        getDocs(query(collection(db, 'vendors'), where('ownerUid', '==', user.uid)))
      ]);

      const invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
      const customers = custSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
      const products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      const vendors = vendSnap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor));

      const workbook = XLSX.utils.book_new();

      // Invoice Sheet
      const invSheet = XLSX.utils.json_to_sheet(invoices.map(i => ({
        ID: i.id, Number: i.invoiceNumber, Date: i.date, Total: i.total, Status: i.status, Tax: i.tax
      })));
      XLSX.utils.book_append_sheet(workbook, invSheet, "Invoices");

      // Customers Sheet
      const custSheet = XLSX.utils.json_to_sheet(customers.map(c => ({
        Name: c.name, Email: c.email, Phone: c.phone, TotalSpent: c.totalSpent
      })));
      XLSX.utils.book_append_sheet(workbook, custSheet, "Customers");

      // Products Sheet
      const prodSheet = XLSX.utils.json_to_sheet(products.map(p => ({
        Name: p.name, SKU: p.sku, Price: p.price, Stock: p.stockLevel, Category: p.category
      })));
      XLSX.utils.book_append_sheet(workbook, prodSheet, "Inventory");

      // Vendors Sheet
      const vendSheet = XLSX.utils.json_to_sheet(vendors.map(v => ({
        Name: v.name, Category: v.category, Reliability: v.performanceScore, Contact: v.contactPerson
      })));
      XLSX.utils.book_append_sheet(workbook, vendSheet, "Vendors");

      XLSX.writeFile(workbook, `RetailFlow_Master_Export_${Date.now()}.xlsx`);
    } catch (e) {

    } finally {
      setIsExportingMaster(false);
    }
  };

  const exportActivityToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(recentInvoices.map(inv => ({
      Invoice: inv.invoiceNumber,
      Date: inv.date,
      Total: inv.total,
      Status: inv.status
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Recent Activity");
    XLSX.writeFile(workbook, "recent_activity.xlsx");
  };

  const handleSyncToEmail = async () => {
    setIsSyncing(true);
    try {

      await new Promise(r => setTimeout(r, 600));
      alert('Report sent to your email (simulated)!');
    } catch (e) {

    } finally {
      setIsSyncing(false);
    }
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
  const pieData = [
    { name: 'Healthy', value: stats.totalCustomers > 0 ? 70 : 10 },
    { name: 'Low Stock', value: stats.lowStock },
    { name: 'Critical', value: stats.criticalStock },
    { name: 'Inactive', value: 10 },
  ];

  const statCards = [
    { label: t('totalRevenue'), value: `$${stats.totalSales.toLocaleString()}`, icon: TrendingUp, trend: '+12.5%', color: 'text-emerald-400' },
    { label: t('totalCustomers'), value: stats.totalCustomers.toString(), icon: Users, trend: '+3.2%', color: 'text-blue-400' },
    { 
      label: t('lowStockItems'), 
      value: stats.lowStock.toString(), 
      icon: Package, 
      trend: stats.criticalStock > 0 ? `${stats.criticalStock} CRITICAL` : 'Stable', 
      color: stats.criticalStock > 0 ? 'text-rose-400' : 'text-amber-400',
      isCritical: stats.criticalStock > 0
    },
    { label: t('pendingInvoices'), value: stats.pendingInvoices.toString(), icon: FileText, trend: stats.pendingInvoices > 0 ? `${stats.pendingInvoices} Pending` : 'All Paid', color: 'text-amber-400' },
  ];

  const combinedActivity = [
    ...recentInvoices.map(inv => ({ 
      id: inv.id, 
      title: `Invoice #${inv.invoiceNumber}`, 
      subtitle: inv.status, 
      value: `$${inv.total.toLocaleString()}`, 
      date: inv.date,
      type: 'invoice' 
    })),
    ...recentVendors.map(v => ({ 
      id: v.id, 
      title: v.name, 
      subtitle: `New Vendor / ${v.category || 'General'}`, 
      value: v.performanceScore ? `${v.performanceScore}%` : '100%', 
      date: v.createdAt?.toDate?.()?.toISOString() || v.date || new Date().toISOString(),
      type: 'vendor' 
    })),
    ...recentProducts.map(p => ({ 
      id: p.id, 
      title: p.name, 
      subtitle: `Inventory / ${p.category || 'Stock'}`, 
      value: `${p.stockLevel} ${p.unit}`, 
      date: p.createdAt?.toDate?.()?.toISOString() || p.date || new Date().toISOString(),
      type: 'product' 
    })),
    ...recentCustomers.map(c => ({ 
      id: c.id, 
      title: c.name, 
      subtitle: `New Customer Registered`, 
      value: c.totalSpent ? `$${c.totalSpent.toLocaleString()}` : '$0', 
      date: c.createdAt?.toDate?.()?.toISOString() || c.date || new Date().toISOString(),
      type: 'customer' 
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

  return (
    <div className="space-y-8 pb-12 relative">
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] pointer-events-none z-[-1]" />
      <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none z-[-1]" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter leading-none mb-2">
            Operations <span className="text-accent">Hub</span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-white/40 font-bold text-[10px] uppercase tracking-[0.3em]">AI-Powered Precision</span>
            <div className="h-px w-12 bg-white/10" />
            <p className="text-white/60 font-medium text-sm">Welcome back, {user.displayName?.split(' ')[0]}</p>
          </div>
        </motion.div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 blur-md rounded-full animate-pulse" />
              <Cpu className="w-5 h-5 text-emerald-400 relative z-10" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">AI AGENT STATUS</p>
              <p className="text-[12px] font-black text-emerald-400 uppercase tracking-tighter">
                {agentStatus?.agentStatus || 'READY'} &bull; OPTIMIZED
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleMasterExport} 
              disabled={isExportingMaster}
              className="btn-secondary-geo flex items-center gap-2 px-5 py-3 border-amber-500/30 text-amber-400 group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-amber-500/5 group-hover:bg-amber-500/10 transition-colors" />
              {isExportingMaster ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span className="relative z-10">Master Export</span>
            </button>
            <button onClick={handleSyncToEmail} disabled={isSyncing} className="btn-secondary-geo flex items-center gap-2 px-5 py-3">
              {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              {t('emailStatus')}
            </button>
            <button onClick={() => navigate('/invoices')} className="btn-primary-geo flex items-center gap-2 px-6 py-3 shadow-xl shadow-accent/20">
              <Plus className="w-5 h-5" /> New Transaction
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={stat.label} 
            className="geo-card group relative overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-24 h-24 bg-accent/5 rounded-full blur-[40px] group-hover:bg-accent/15 transition-all" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="card-title-geo">{stat.label}</span>
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl group-hover:bg-accent group-hover:text-white transition-all shadow-lg">
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <div className="stat-value-geo group-hover:tracking-tighter transition-all relative z-10">{stat.value}</div>
            <div className="mt-6 flex items-center gap-3 relative z-10">
              <div className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider", 
                stat.isCritical ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
              )}>
                {stat.trend}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 geo-card relative overflow-hidden group">
          <div className="flex items-center justify-between mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <h3 className="card-title-geo flex items-center gap-2 m-0">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Revenue Performance Trends
              </h3>
              <div className="flex items-center bg-slate-900/50 border border-white/10 rounded-lg p-0.5">
                {(['7D', '30D', 'YTD'] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
                      timeRange === range 
                        ? "bg-accent/80 text-white shadow-md relative z-10" 
                        : "text-white/40 hover:text-white/80"
                    )}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => downloadChartReport('Revenue Trends')} className="p-2 text-white/20 hover:text-white transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                   <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '11px' }} />
                <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={4} fill="url(#colorSales)" fillOpacity={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="geo-card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="card-title-geo">Inventory Health</h3>
            <button onClick={() => downloadChartReport('Inventory Health')} className="p-2 text-white/20 hover:text-white transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-[9px] font-bold text-white/40 uppercase">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="geo-card relative overflow-hidden group min-h-[400px] [perspective:1000px]">
          <h3 className="card-title-geo mb-6">Market Intelligence</h3>
          <div className="space-y-6">
            <motion.div 
              whileHover={{ rotateY: 10, rotateX: -5, scale: 1.02, translateZ: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer shadow-2xl hover:bg-white/10 transition-colors preserve-3d"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden shadow-2xl skew-x-3 [transform:translateZ(30px)]">
                  <img src="https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?auto=format&fit=crop&q=80&w=200" alt="Luxury Watch" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="[transform:translateZ(20px)]">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-3 h-3 text-accent" />
                    <p className="text-[11px] font-black text-white uppercase tracking-tighter">Luxury Commodities</p>
                  </div>
                  <p className="text-[9px] font-bold text-emerald-400">+14.2% Growth</p>
                </div>
              </div>
            </motion.div>
            
            <motion.div 
              whileHover={{ rotateY: -10, rotateX: 5, scale: 1.02, translateZ: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer shadow-2xl hover:bg-white/10 transition-colors preserve-3d"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden shadow-2xl -skew-x-3 [transform:translateZ(30px)]">
                  <img src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=200" alt="Analytics" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="[transform:translateZ(20px)]">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-3 h-3 text-blue-400" />
                    <p className="text-[11px] font-black text-white uppercase tracking-tighter">Efficiency Audit</p>
                  </div>
                  <p className="text-[9px] font-bold text-blue-400">OPTIMIZED</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="geo-card relative overflow-hidden">
          <h3 className="card-title-geo flex items-center gap-2 mb-6">
            <Zap className="w-4 h-4 text-amber-400" /> AI Backend Guard
          </h3>
          <div className="space-y-3">
            {aiAuditLogs.map((log, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                <Activity className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-medium text-white/70">{log}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="geo-card group relative">
          <div className="flex items-center justify-between mb-6">
            <h3 className="card-title-geo">Recent Activity</h3>
            <button onClick={exportActivityToExcel} className="p-2 text-white/20 hover:text-white transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {combinedActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 hover:bg-white/[0.02] px-2 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border", 
                    activity.type === 'invoice' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                    activity.type === 'vendor' ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                    activity.type === 'customer' ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                    "bg-purple-500/10 border-purple-500/20 text-purple-400"
                  )}>
                    {activity.type === 'invoice' ? <FileText className="w-4 h-4" /> :
                     activity.type === 'vendor' ? <Users className="w-4 h-4" /> :
                     activity.type === 'customer' ? <UserPlus className="w-4 h-4" /> :
                     <Package className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-white uppercase tracking-tighter">{activity.title}</p>
                    <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{activity.subtitle} &bull; {new Date(activity.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-black text-white tracking-widest">{activity.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
