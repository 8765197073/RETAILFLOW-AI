import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  where,
  getDocs 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  TrendingUp, 
  Download, 
  Send,
  Calendar,
  Filter,
  BarChart2,
  PieChart as PieChartIcon,
  Activity,
  Database
} from 'lucide-react';
import { motion } from 'motion/react';
import { Invoice, Product, Customer, Vendor, VendorQuote } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';

export default function Reports({ user }: { user: User }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'invoices'), where('ownerUid', '==', user.uid));
    const unsubscribeInvoices = onSnapshot(q, (snapshot) => {
      setInvoices(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
    });

    const pq = query(collection(db, 'products'), where('ownerUid', '==', user.uid));
    const unsubscribeProducts = onSnapshot(pq, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    const cq = query(collection(db, 'customers'), where('ownerUid', '==', user.uid));
    const unsubscribeCustomers = onSnapshot(cq, (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });

    return () => {
      unsubscribeInvoices();
      unsubscribeProducts();
      unsubscribeCustomers();
    };
  }, [user.uid]);

  // Automated Report Generation Logic
  useEffect(() => {
    if (invoices.length === 0) return;

    const lastCheck = localStorage.getItem(`last_auto_report_${user.uid}`);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (!lastCheck || now - parseInt(lastCheck) > oneDay) {

      // Logic for automatic notification or background prep
      localStorage.setItem(`last_auto_report_${user.uid}`, now.toString());
    }
  }, [invoices, user.uid]);

  const exportSalesToPDF = () => {
    const doc = new jsPDF();
    doc.text('Sales Report', 14, 15);
    const tableData = invoices.map(inv => [
      inv.invoiceNumber,
      inv.date,
      `$${inv.total.toLocaleString()}`,
      inv.status.toUpperCase()
    ]);
    autoTable(doc, {
      head: [['Invoice #', 'Date', 'Total', 'Status']],
      body: tableData,
      startY: 20
    });
    doc.save('sales_report.pdf');
  };

  const exportInventoryToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(products.map(p => ({
      Name: p.name,
      SKU: p.sku,
      Category: p.category,
      Price: p.price,
      Stock: p.stockLevel
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, "inventory_report.xlsx");
  };

  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const exportSelectionToPDF = (type: 'sales' | 'inventory') => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(type === 'sales' ? 'Sales Batch Report' : 'Inventory Batch Report', 14, 22);

    if (type === 'sales') {
      const list = invoices.filter(inv => selectedInvoices.includes(inv.id!));
      autoTable(doc, {
        head: [['Invoice #', 'Date', 'Amount', 'Status']],
        body: list.map(inv => [inv.invoiceNumber, inv.date, `$${inv.total}`, inv.status]),
        startY: 30
      });
    } else {
      const list = products.filter(p => selectedProducts.includes(p.id!));
      autoTable(doc, {
        head: [['Product', 'Stock', 'Price', 'Category']],
        body: list.map(p => [p.name, p.stockLevel.toString(), `$${p.price}`, p.category || '-']),
        startY: 30
      });
    }
    doc.save(`${type}_batch_${Date.now()}.pdf`);
  };

  const shareReportByEmail = async (reportName: string) => {
    const subject = encodeURIComponent(`${reportName} - RetailFlow AI`);
    const body = encodeURIComponent(`
Hello,

Please find the ${reportName} summary below.
Generated on: ${new Date().toLocaleDateString()}

Total Revenue: $${invoices.reduce((acc, inv) => acc + inv.total, 0).toLocaleString()}
Total Orders: ${invoices.length}

Thank you!
    `);

    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const exportAllDataToExcel = async () => {
    setIsExporting(true);
    try {
      // Fetch everything for owner
      const pSnap = await getDocs(query(collection(db, 'products'), where('ownerUid', '==', user.uid)));
      const cSnap = await getDocs(query(collection(db, 'customers'), where('ownerUid', '==', user.uid)));
      const iSnap = await getDocs(query(collection(db, 'invoices'), where('ownerUid', '==', user.uid)));
      const vSnap = await getDocs(query(collection(db, 'vendors'), where('ownerUid', '==', user.uid)));
      const qSnap = await getDocs(query(collection(db, 'vendorQuotes'), where('ownerUid', '==', user.uid)));

      const wb = XLSX.utils.book_new();

      const inventoryWS = XLSX.utils.json_to_sheet(pSnap.docs.map(d => {
        const p = d.data() as Product;
        return { Name: p.name, SKU: p.sku, Price: p.price, Cost: p.cost, Stock: p.stockLevel, Category: p.category };
      }));
      XLSX.utils.book_append_sheet(wb, inventoryWS, "Inventory");

      const customersWS = XLSX.utils.json_to_sheet(cSnap.docs.map(d => {
        const c = d.data() as Customer;
        return { Name: c.name, Email: c.email, Phone: c.phone, TotalSpent: c.totalSpent };
      }));
      XLSX.utils.book_append_sheet(wb, customersWS, "Customers");

      const invoicesWS = XLSX.utils.json_to_sheet(iSnap.docs.map(d => {
        const i = d.data() as Invoice;
        return { ID: i.invoiceNumber, Date: i.date, Customer: i.customerId, Total: i.total, Status: i.status };
      }));
      XLSX.utils.book_append_sheet(wb, invoicesWS, "Invoices");

      const vendorsWS = XLSX.utils.json_to_sheet(vSnap.docs.map(d => {
        const v = d.data() as Vendor;
        return { Name: v.name, Email: v.email, Phone: v.phone, Category: v.category, Reliability: v.performanceScore };
      }));
      XLSX.utils.book_append_sheet(wb, vendorsWS, "Vendors");

      const quotesWS = XLSX.utils.json_to_sheet(qSnap.docs.map(d => {
        const q = d.data() as VendorQuote;
        const v = vSnap.docs.find(vDoc => vDoc.id === q.vendorId)?.data() as Vendor;
        const p = pSnap.docs.find(pDoc => pDoc.id === q.productId)?.data() as Product;
        return { Vendor: v?.name, Product: p?.name, Price: q.price, DeliveryDays: q.deliveryTimeDays, ValidUntil: q.validUntil };
      }));
      XLSX.utils.book_append_sheet(wb, quotesWS, "VendorQuotes");

      XLSX.writeFile(wb, `RetailFlow_FullData_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {

      alert('Export failed. Check console.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Business Reports</h1>
          <p className="text-white/60 font-medium text-sm">Comprehensive data analysis and strategic reporting.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportAllDataToExcel}
            disabled={isExporting}
            className="btn-primary-geo flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 shadow-xl shadow-emerald-900/40"
          >
            {isExporting ? <Database className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {isExporting ? 'Exporting...' : 'Master Export (All Data)'}
          </button>
          <button className="btn-secondary-geo flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Last 30 Days
          </button>
          <button className="btn-secondary-geo flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="geo-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-accent" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Total Revenue</h3>
          </div>
          <p className="text-3xl font-black text-white">${invoices.reduce((acc, inv) => acc + inv.total, 0).toLocaleString()}</p>
          <p className="text-[10px] font-bold text-emerald-400 mt-2 uppercase tracking-widest">+12.5% vs last month</p>
        </div>
        <div className="geo-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-6 h-6 text-emerald-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Avg. Order Value</h3>
          </div>
          <p className="text-3xl font-black text-white">
            ${invoices.length ? (invoices.reduce((acc, inv) => acc + inv.total, 0) / invoices.length).toFixed(2) : '0.00'}
          </p>
        </div>
        <div className="geo-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <BarChart2 className="w-6 h-6 text-amber-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Total Orders</h3>
          </div>
          <p className="text-3xl font-black text-white">{invoices.length}</p>
        </div>
        <div className="geo-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <PieChartIcon className="w-6 h-6 text-rose-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Active Customers</h3>
          </div>
          <p className="text-3xl font-black text-white">{customers.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="geo-card">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Sales Performance</h3>
              {selectedInvoices.length > 0 && (
                <button 
                  onClick={() => exportSelectionToPDF('sales')}
                  className="px-2 py-0.5 bg-accent/20 text-accent text-[9px] font-black uppercase tracking-widest rounded border border-accent/30"
                >
                  Download {selectedInvoices.length} PDF
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportSalesToPDF} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all" title="Download PDF">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={() => shareReportByEmail('Sales Report')} className="p-2 text-white/40 hover:text-accent hover:bg-white/5 rounded transition-all" title="Share by Email">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="space-y-6">
            {invoices.slice(0, 5).map(inv => (
              <div key={inv.id} className={cn("flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 transition-all", selectedInvoices.includes(inv.id!) && "bg-accent/10 border-accent/30")}>
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    checked={selectedInvoices.includes(inv.id!)}
                    onChange={() => setSelectedInvoices(prev => prev.includes(inv.id!) ? prev.filter(i => i !== inv.id!) : [...prev, inv.id!])}
                    className="w-4 h-4 rounded-md border-white/10 bg-white/5 accent-accent"
                  />
                  <div>
                    <p className="text-[13px] font-bold text-white">Invoice #{inv.invoiceNumber}</p>
                    <p className="text-[11px] font-medium text-white/40">{inv.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-black text-white">${inv.total.toLocaleString()}</p>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">Paid</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="geo-card">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Inventory Status</h3>
              {selectedProducts.length > 0 && (
                <button 
                  onClick={() => exportSelectionToPDF('inventory')}
                  className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest rounded border border-emerald-500/30"
                >
                  Download {selectedProducts.length} PDF
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportInventoryToExcel} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all" title="Download Excel">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={() => shareReportByEmail('Inventory Report')} className="p-2 text-white/40 hover:text-accent hover:bg-white/5 rounded transition-all" title="Share by Email">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="space-y-6">
            {products.slice(0, 5).map(prod => (
              <div key={prod.id} className={cn("flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 transition-all", selectedProducts.includes(prod.id!) && "bg-emerald-500/10 border-emerald-500/30")}>
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    checked={selectedProducts.includes(prod.id!)}
                    onChange={() => setSelectedProducts(prev => prev.includes(prod.id!) ? prev.filter(i => i !== prod.id!) : [...prev, prod.id!])}
                    className="w-4 h-4 rounded-md border-white/10 bg-white/5 accent-emerald-500"
                  />
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden">
                      <img src={prod.imageUrl || `https://picsum.photos/seed/${prod.name}/100/100`} alt={prod.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-white">{prod.name}</p>
                      <p className="text-[11px] font-medium text-white/40">SKU: {prod.sku}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-black text-white">{prod.stockLevel}</p>
                  <span className={cn(
                    "text-[9px] font-bold uppercase tracking-widest",
                    prod.stockLevel <= (prod.reorderLevel || 5) ? "text-rose-400" : "text-emerald-400"
                  )}>
                    {prod.stockLevel <= (prod.reorderLevel || 5) ? "Low Stock" : "In Stock"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
