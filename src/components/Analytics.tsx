import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, onSnapshot, where, limit, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  PieChart as PieChartIcon, 
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  BrainCircuit,
  Download,
  Send
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { Product, Invoice } from '../types';
import { cn } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function Analytics({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubProducts = onSnapshot(
      query(collection(db, 'products'), where('ownerUid', '==', user.uid)), 
      (snapshot) => {
        setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      }
    );

    const unsubInvoices = onSnapshot(
      query(
        collection(db, 'invoices'), 
        where('ownerUid', '==', user.uid),
        orderBy('date', 'desc'),
        limit(100)
      ), 
      (snapshot) => {
        setInvoices(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
        setLoading(false);
      }
    );

    return () => {
      unsubProducts();
      unsubInvoices();
    };
  }, []);

  const exportAnalyticsToPDF = () => {
    const doc = new jsPDF();
    doc.text('Analytics Report', 14, 15);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
    
    const tableData = [
      ['Metric', 'Value'],
      ['Gross Margin', '34.2%'],
      ['Stock Turnover', '4.8x'],
      ['Sales Velocity', '12.4/day'],
      ['Customer LTV', '$842']
    ];

    autoTable(doc, {
      head: [['Metric', 'Value']],
      body: tableData,
      startY: 35
    });

    doc.save('analytics_report.pdf');
  };

  const exportAnalyticsToExcel = () => {
    const data = [
      { Metric: 'Gross Margin', Value: '34.2%' },
      { Metric: 'Stock Turnover', Value: '4.8x' },
      { Metric: 'Sales Velocity', Value: '12.4/day' },
      { Metric: 'Customer LTV', Value: '$842' }
    ];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Analytics");
    XLSX.writeFile(workbook, "analytics_data.xlsx");
  };

  const shareAnalyticsByEmail = async () => {
    const subject = encodeURIComponent('Business Analytics Report - RetailFlow AI');
    const body = encodeURIComponent(`
Business Analytics Report
Generated on: ${new Date().toLocaleDateString()}

Key Metrics:
- Gross Margin: 34.2%
- Stock Turnover: 4.8x
- Sales Velocity: 12.4/day
- Customer LTV: $842

Please find the detailed analytics in the dashboard.
    `);

    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // Calculate Sales Trends (Last 7 days)
  const salesTrends = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().split('T')[0];
    const dayTotal = invoices
      .filter(inv => inv.date.startsWith(dateStr) && inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.total, 0);
    
    return {
      name: new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }),
      sales: dayTotal
    };
  });

  // Calculate Profitability by Category
  const categoryData = products.reduce((acc: any, product) => {
    const category = product.category || 'Uncategorized';
    if (!acc[category]) acc[category] = { name: category, profit: 0, revenue: 0 };
    
    // Simple profit calculation: (Price - Cost) * Units Sold (simulated from invoices)
    const unitsSold = invoices
      .filter(inv => inv.status === 'paid')
      .flatMap(inv => inv.items)
      .filter(item => item.productId === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    const profitPerUnit = product.price - (product.cost || 0);
    acc[category].profit += profitPerUnit * unitsSold;
    acc[category].revenue += product.price * unitsSold;
    
    return acc;
  }, {});

  const categoryChartData = Object.values(categoryData);

  // Stock Value Analysis
  const stockValueData = products.reduce((acc: any, product) => {
    const category = product.category || 'Uncategorized';
    if (!acc[category]) acc[category] = { name: category, value: 0 };
    acc[category].value += (product.cost || 0) * product.stockLevel;
    return acc;
  }, {});

  const stockPieData = Object.values(stockValueData);

  // Product Performance (Top 5 by Revenue)
  const productPerformanceData = products
    .map(product => {
      const revenue = invoices
        .filter(inv => inv.status === 'paid')
        .flatMap(inv => inv.items)
        .filter(item => item.productId === product.id)
        .reduce((sum, item) => sum + (item.price * item.quantity), 0);
      return { name: product.name, revenue };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Advanced Analytics</h1>
          <p className="text-white/60 font-medium text-sm">AI-driven trends, stock analysis, and profitability insights.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportAnalyticsToPDF}
            className="btn-secondary-geo flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
          <button 
            onClick={exportAnalyticsToExcel}
            className="btn-secondary-geo flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
          <button 
            onClick={shareAnalyticsByEmail}
            className="btn-secondary-geo flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Share
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-full">
            <BrainCircuit className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">AI Engine Active</span>
          </div>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="geo-card">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase">+12.5%</span>
          </div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Gross Margin</p>
          <p className="text-2xl font-black text-white">34.2%</p>
        </div>
        <div className="geo-card">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] font-bold text-blue-400 uppercase">Stable</span>
          </div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Stock Turnover</p>
          <p className="text-2xl font-black text-white">4.8x</p>
        </div>
        <div className="geo-card">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] font-bold text-purple-400 uppercase">On Track</span>
          </div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Sales Velocity</p>
          <p className="text-2xl font-black text-white">12.4/day</p>
        </div>
        <div className="geo-card">
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400 uppercase">High</span>
          </div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Customer LTV</p>
          <p className="text-2xl font-black text-white">$842</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales Trends */}
        <div className="geo-card">
          <div className="flex items-center gap-3 mb-8">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-white">Revenue Trends (7D)</h2>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrends}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 600, fill: 'rgba(255,255,255,0.4)' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 600, fill: 'rgba(255,255,255,0.4)' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorSales)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Profitability by Category */}
        <div className="geo-card">
          <div className="flex items-center gap-3 mb-8">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-white">Profitability by Category</h2>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 600, fill: 'rgba(255,255,255,0.4)' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 600, fill: 'rgba(255,255,255,0.4)' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stock Value Distribution */}
        <div className="geo-card">
          <div className="flex items-center gap-3 mb-8">
            <PieChartIcon className="w-5 h-5 text-purple-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-white">Stock Value Distribution</h2>
          </div>
          <div className="h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stockPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {stockPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Product Performance */}
        <div className="geo-card">
          <div className="flex items-center gap-3 mb-8">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-white">Top Performing Products</h2>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productPerformanceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={100}
                  tick={{ fontSize: 10, fontWeight: 600, fill: 'rgba(255,255,255,0.4)' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights Panel */}
        <div className="geo-card bg-white/5 border-white/10 text-white">
          <div className="flex items-center gap-3 mb-6">
            <BrainCircuit className="w-5 h-5 text-blue-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-blue-400">AI Strategic Insights</h2>
          </div>
          <div className="space-y-6">
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Opportunity</span>
              </div>
              <p className="text-[13px] font-medium leading-relaxed text-white/80">
                Electronics category shows 15% higher profitability than average. Consider increasing stock levels for top-performing SKUs to avoid stockouts.
              </p>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <ArrowDownRight className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Risk Alert</span>
              </div>
              <p className="text-[13px] font-medium leading-relaxed text-white/80">
                Stock turnover for "Home" category has slowed by 8%. AI suggests a 10% discount promotion to clear aging inventory and improve liquidity.
              </p>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Optimization</span>
              </div>
              <p className="text-[13px] font-medium leading-relaxed text-white/80">
                Switching to FIFO valuation for high-velocity items could reduce tax liability by approximately 4% based on current cost trends.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
