import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, getDocs, where, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  Plus, 
  Search, 
  FileText, 
  Download, 
  Eye, 
  CheckCircle, 
  Clock, 
  XCircle,
  X,
  Trash2,
  ChevronDown,
  Printer,
  ShieldCheck,
  Mail,
  Send,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Invoice, Customer, InvoiceItem, Business } from '../types';
import { cn } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { getAutomatedTaxSuggestion } from '../services/aiService';
import { Sparkles } from 'lucide-react';

export default function Invoices({ user }: { user: User }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);

  const toggleSelectAll = () => {
    if (selectedInvoices.length === invoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(invoices.map(i => i.id!));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedInvoices(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const exportSelectedToPDF = () => {
    const list = invoices.filter(i => selectedInvoices.includes(i.id!));
    if (list.length === 0) return;
    
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Selected Invoices', 14, 22);
    
    const tableData = list.map(inv => [
      inv.invoiceNumber,
      customers.find(c => c.id === inv.customerId)?.name || 'Unknown',
      new Date(inv.date).toLocaleDateString(),
      `$${inv.total.toLocaleString()}`,
      inv.status.toUpperCase()
    ]);

    autoTable(doc, {
      head: [['Invoice #', 'Customer', 'Date', 'Total', 'Status']],
      body: tableData,
      startY: 30,
      theme: 'grid',
      headStyles: { fontStyle: 'bold', fillColor: [59, 130, 246] }
    });
    doc.save(`invoices_batch_${Date.now()}.pdf`);
  };

  const exportSelectedToExcel = () => {
    const list = invoices.filter(i => selectedInvoices.includes(i.id!));
    if (list.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(list.map(inv => ({
      InvoiceNumber: inv.invoiceNumber,
      Customer: customers.find(c => c.id === inv.customerId)?.name || 'Unknown',
      Date: inv.date,
      Subtotal: inv.subtotal,
      Tax: inv.tax,
      Total: inv.total,
      Status: inv.status
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Selected Invoices");
    XLSX.writeFile(workbook, "selected_invoices.xlsx");
  };

  const generateInvoicePDF = (invoice: Invoice) => {
    const doc = new jsPDF();
    const customer = customers.find(c => c.id === invoice.customerId);
    const taxConfig = business?.taxConfigs?.find(t => t.id === invoice.taxConfigId);

    // Header
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text(business?.name || 'RETAILFLOW AI', 14, 25);
    doc.setFontSize(10);
    doc.text('INVOICE DOCUMENT', 14, 32);
    
    // Details
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, 140, 50);
    doc.text(`Date: ${new Date(invoice.date).toLocaleDateString()}`, 140, 56);
    doc.text(`Status: ${invoice.status.toUpperCase()}`, 140, 62);

    doc.setFont(undefined, 'bold');
    doc.text('Bill To:', 14, 50);
    doc.setFont(undefined, 'normal');
    doc.text(customer?.name || 'Valued Customer', 14, 56);
    doc.text(customer?.address || '-', 14, 62);
    doc.text(customer?.email || '-', 14, 68);

    // Items Table
    autoTable(doc, {
      startY: 80,
      head: [['Description', 'Qty', 'Unit Price', 'Amount']],
      body: invoice.items.map(i => [
        i.productName,
        i.quantity.toString(),
        `$${i.price.toFixed(2)}`,
        `$${(i.quantity * i.price).toFixed(2)}`
      ]),
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] }
    });

    // Tax Breakdown Section
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    
    doc.setDrawColor(230, 230, 230);
    doc.line(120, finalY, 196, finalY);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, 'normal');
    
    const summaryX = 130;
    doc.text('Subtotal:', summaryX, finalY + 10);
    doc.text(`$${invoice.subtotal.toFixed(2)}`, 196, finalY + 10, { align: 'right' });
    
    doc.text(`Tax (${taxConfig?.name || 'Tax'} - ${taxConfig?.rate || business?.taxRate || 0}${taxConfig?.type === 'fixed' ? ' Fixed' : '%'}):`, summaryX, finalY + 18);
    doc.text(`$${invoice.tax.toFixed(2)}`, 196, finalY + 18, { align: 'right' });
    
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.5);
    doc.line(summaryX, finalY + 24, 196, finalY + 24);
    
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text('Total Amount:', summaryX, finalY + 32);
    doc.text(`$${invoice.total.toFixed(2)}`, 196, finalY + 32, { align: 'right' });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont(undefined, 'italic');
    doc.text('This is a computer-generated document. No signature required.', 105, 285, { align: 'center' });

    doc.save(`Invoice_${invoice.invoiceNumber}.pdf`);
  };

  const sendInvoiceEmail = async (invoice: Invoice) => {
    const customer = customers.find(c => c.id === invoice.customerId);
    if (!customer?.email) {
      alert("Customer has no email address.");
      return;
    }

    const subject = encodeURIComponent(`Invoice #${invoice.invoiceNumber} from ${business?.name || 'RetailFlow AI'}`);
    const body = encodeURIComponent(`
Hello ${customer.name},

Please find your invoice details below:
Invoice #: ${invoice.invoiceNumber}
Date: ${new Date(invoice.date).toLocaleDateString()}

Items:
${invoice.items.map(item => `- ${item.productName}: ${item.quantity} x $${item.price.toFixed(2)} = $${(item.quantity * item.price).toFixed(2)}`).join('\n')}

Subtotal: $${invoice.subtotal.toFixed(2)}
Tax: $${invoice.tax.toFixed(2)}
Total: $${invoice.total.toFixed(2)}

Thank you for your business!
    `);

    window.location.href = `mailto:${customer.email}?subject=${subject}&body=${body}`;
  };
  
  // New Invoice Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoiceStatus, setInvoiceStatus] = useState<'paid' | 'pending'>('pending');
  const [selectedTaxId, setSelectedTaxId] = useState('');
  const [isAiCalculatingTax, setIsAiCalculatingTax] = useState(false);
  const [aiTaxReasoning, setAiTaxReasoning] = useState('');

  const handleAiAutoTax = async () => {
    if (invoiceItems.length === 0 || !selectedCustomerId) return;
    setIsAiCalculatingTax(true);
    try {
      const customer = customers.find(c => c.id === selectedCustomerId);
      const suggestion = await getAutomatedTaxSuggestion(invoiceItems, business, customer);
      if (suggestion) {
        setAiTaxReasoning(suggestion.reasoning);
        // Try to find a matching tax config or just set it manually for this invoice if possible
        // For simplicity, we'll try to find if a config with this rate exists, otherwise we'll just show the suggestion
        const matchingConfig = business?.taxConfigs?.find(t => t.rate === suggestion.suggestedRate);
        if (matchingConfig) {
          setSelectedTaxId(matchingConfig.id);
        }
      }
    } catch (e) {

    } finally {
      setIsAiCalculatingTax(false);
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, 'invoices'), 
      where('ownerUid', '==', user.uid),
      orderBy('date', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInvoices(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    });

    const fetchCustomers = async () => {
      const cq = query(collection(db, 'customers'), where('ownerUid', '==', user.uid));
      const snap = await getDocs(cq);
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    };

    const fetchProducts = async () => {
      const pq = query(collection(db, 'products'), where('ownerUid', '==', user.uid));
      const snap = await getDocs(pq);
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    };

    const fetchBusiness = async () => {
      const q = query(collection(db, 'businesses'), where('ownerUid', '==', user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setBusiness({ id: snap.docs[0].id, ...snap.docs[0].data() } as Business);
      }
    };

    fetchCustomers();
    fetchProducts();
    fetchBusiness();
    return () => unsubscribe();
  }, [user.uid]);

  const addItem = () => {
    setInvoiceItems([...invoiceItems, { productId: '', productName: '', quantity: 1, price: 0 }]);
  };

  const removeItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...invoiceItems];
    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index] = {
          ...newItems[index],
          productId: value,
          productName: product.name,
          price: product.price
        };
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setInvoiceItems(newItems);
  };

  const calculateSubtotal = () => invoiceItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const calculateTax = () => {
    const subtotal = calculateSubtotal();
    const activeTax = business?.taxConfigs?.find(t => t.id === selectedTaxId);
    if (activeTax) {
      return activeTax.type === 'percentage' 
        ? subtotal * (activeTax.rate / 100) 
        : activeTax.rate;
    }
    return subtotal * ((business?.taxRate || 18) / 100);
  };
  const calculateTotal = () => calculateSubtotal() + calculateTax();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || invoiceItems.length === 0) return;

    try {
      const invoiceData: Omit<Invoice, 'id'> = {
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString(),
        customerId: selectedCustomerId,
        ownerUid: user.uid,
        businessId: business?.id || 'default',
        items: invoiceItems,
        subtotal: calculateSubtotal(),
        tax: calculateTax(),
        total: calculateTotal(),
        status: invoiceStatus,
        taxConfigId: selectedTaxId
      };

      await addDoc(collection(db, 'invoices'), invoiceData);
      
      // Update customer total spent
      const customer = customers.find(c => c.id === selectedCustomerId);
      if (customer) {
        await updateDoc(doc(db, 'customers', selectedCustomerId), {
          totalSpent: (customer.totalSpent || 0) + invoiceData.total
        });
      }

      // Update product stock levels
      for (const item of invoiceItems) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          await updateDoc(doc(db, 'products', item.productId), {
            stockLevel: product.stockLevel - item.quantity
          });
        }
      }

      setIsModalOpen(false);
      setInvoiceItems([]);
      setSelectedCustomerId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invoices');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Invoices & Sales</h1>
          <p className="text-white/60 font-medium text-sm">Generate and track your sales transactions with tax compliance.</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedInvoices.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 pr-4 border-r border-white/10"
            >
              <span className="text-[10px] font-bold text-accent uppercase tracking-widest">{selectedInvoices.length} Selected</span>
              <button 
                onClick={exportSelectedToPDF}
                className="btn-secondary-geo py-1 px-3 text-[10px]"
              >
                PDF
              </button>
              <button 
                onClick={exportSelectedToExcel}
                className="btn-secondary-geo py-1 px-3 text-[10px]"
              >
                Excel
              </button>
            </motion.div>
          )}
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn-primary-geo flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Invoice
          </button>
        </div>
      </div>

      <div className="geo-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5">
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedInvoices.length === invoices.length && invoices.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-white/10 bg-white/5 accent-accent"
                  />
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Invoice</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Customer</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoices.map((invoice) => {
                const customer = customers.find(c => c.id === invoice.customerId);
                return (
                  <tr key={invoice.id} className={cn("hover:bg-white/5 transition-colors", selectedInvoices.includes(invoice.id!) && "bg-accent/5")}>
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        checked={selectedInvoices.includes(invoice.id!)}
                        onChange={() => toggleSelectRow(invoice.id!)}
                        className="w-4 h-4 rounded border-white/10 bg-white/5 accent-accent"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center">
                          <FileText className="w-4 h-4 text-blue-400" />
                        </div>
                        <span className="font-bold text-white text-[13px]">#{invoice.invoiceNumber}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[13px] font-bold text-white">{customer?.name || 'Unknown Customer'}</p>
                      <p className="text-[10px] font-bold text-white/40 uppercase">{customer?.email || '-'}</p>
                    </td>
                    <td className="px-6 py-4 text-[12px] text-white/40 font-medium">
                      {new Date(invoice.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-[13px] font-extrabold text-white">
                      ${invoice.total.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "tag-geo",
                        invoice.status === 'paid' 
                          ? "tag-ok-geo" 
                          : "bg-amber-500/20 text-amber-400"
                      )}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => setViewingInvoice(invoice)}
                          className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => generateInvoicePDF(invoice)}
                          className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Invoice Modal */}
      <AnimatePresence>
        {viewingInvoice && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingInvoice(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative w-full max-w-3xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden rounded-2xl"
            >
              {/* Watermark */}
              {business?.showWatermark && business?.watermarkText && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden opacity-[0.03] rotate-[-45deg]">
                  <span className="text-[120px] font-black whitespace-nowrap uppercase tracking-widest text-white">
                    {business.watermarkText}
                  </span>
                </div>
              )}

              <div className="p-12 space-y-12">
                <div className="flex justify-between items-start">
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-blue-600 rounded flex items-center justify-center">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{business?.name || 'RETAILFLOW AI'}</h2>
                      <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">{business?.address}</p>
                      <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">GST: {business?.gstNumber}</p>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <h3 className="text-4xl font-black text-white uppercase tracking-tighter">INVOICE</h3>
                    <p className="text-[13px] font-bold text-white">#{viewingInvoice.invoiceNumber}</p>
                    <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Date: {new Date(viewingInvoice.date).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-12">
                  <div>
                    <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Bill To</h4>
                    <p className="text-[15px] font-bold text-white">{customers.find(c => c.id === viewingInvoice.customerId)?.name}</p>
                    <p className="text-[12px] font-medium text-white/60">{customers.find(c => c.id === viewingInvoice.customerId)?.address}</p>
                    <p className="text-[12px] font-medium text-white/60">{customers.find(c => c.id === viewingInvoice.customerId)?.email}</p>
                  </div>
                  <div className="text-right">
                    <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Payment Status</h4>
                    <span className={cn(
                      "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full",
                      viewingInvoice.status === 'paid' ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                    )}>
                      {viewingInvoice.status}
                    </span>
                  </div>
                </div>

                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-white/10">
                      <th className="py-4 text-left text-[10px] font-bold text-white uppercase tracking-widest">Description</th>
                      <th className="py-4 text-center text-[10px] font-bold text-white uppercase tracking-widest">Qty</th>
                      <th className="py-4 text-right text-[10px] font-bold text-white uppercase tracking-widest">Price</th>
                      <th className="py-4 text-right text-[10px] font-bold text-white uppercase tracking-widest">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {viewingInvoice.items.map((item, i) => (
                      <tr key={i}>
                        <td className="py-4 text-[13px] font-bold text-white">{item.productName}</td>
                        <td className="py-4 text-center text-[13px] font-medium text-white/60">{item.quantity}</td>
                        <td className="py-4 text-right text-[13px] font-medium text-white/60">${item.price.toFixed(2)}</td>
                        <td className="py-4 text-right text-[13px] font-bold text-white">${(item.price * item.quantity).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end">
                  <div className="w-64 space-y-3">
                    <div className="flex justify-between text-[12px] font-bold">
                      <span className="text-white/40 uppercase tracking-widest">Subtotal</span>
                      <span className="text-white">${viewingInvoice.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[12px] font-bold">
                      <span className="text-white/40 uppercase tracking-widest">
                        Tax ({business?.taxConfigs?.find(t => t.id === viewingInvoice.taxConfigId)?.name || 'Default'})
                      </span>
                      <span className="text-white">${viewingInvoice.tax.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-white/10" />
                    <div className="flex justify-between text-xl font-black">
                      <span className="text-white uppercase tracking-tighter">Total</span>
                      <span className="text-white">${viewingInvoice.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-12 border-t border-white/10 flex justify-between items-center">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Thank you for your business!</p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => sendInvoiceEmail(viewingInvoice)}
                      disabled={isSendingEmail}
                      className={cn(
                        "btn-secondary-geo flex items-center gap-2",
                        emailStatus === 'success' && "text-emerald-400 border-emerald-400/30 bg-emerald-500/10"
                      )}
                    >
                      {isSendingEmail ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : emailStatus === 'success' ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      {emailStatus === 'success' ? 'Sent!' : 'Email Invoice'}
                    </button>
                    <button 
                      onClick={() => generateInvoicePDF(viewingInvoice)}
                      className="btn-secondary-geo flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </button>
                    <button className="btn-secondary-geo flex items-center gap-2">
                      <Printer className="w-4 h-4" />
                      Print
                    </button>
                    <button 
                      onClick={() => setViewingInvoice(null)}
                      className="btn-primary-geo"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Invoice Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl bg-slate-900 border border-white/10 shadow-2xl rounded-2xl overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Create New Invoice</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded transition-colors">
                  <X className="w-5 h-5 text-white/40" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Select Customer</label>
                    <select 
                      required
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                    >
                      <option value="" className="bg-slate-900">Choose a customer...</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Status</label>
                    <select 
                      value={invoiceStatus}
                      onChange={(e) => setInvoiceStatus(e.target.value as any)}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                    >
                      <option value="pending" className="bg-slate-900">Pending</option>
                      <option value="paid" className="bg-slate-900">Paid</option>
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Tax Rule</label>
                    <div className="relative group/select">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within/select:text-accent transition-colors">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <select 
                        value={selectedTaxId}
                        onChange={(e) => setSelectedTaxId(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-xl appearance-none hover:bg-white/10 shadow-lg"
                      >
                        <option value="" className="bg-slate-900">Global Default ({business?.taxRate || 18}%)</option>
                        {business?.taxConfigs?.map(tax => (
                          <option key={tax.id} value={tax.id} className="bg-slate-900">
                            {tax.name} ({tax.rate}{tax.type === 'percentage' ? '%' : ''})
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={handleAiAutoTax}
                      disabled={isAiCalculatingTax || invoiceItems.length === 0}
                      className="mt-2 flex items-center gap-2 text-[10px] font-bold text-accent hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50"
                    >
                      {isAiCalculatingTax ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      AI Auto-Detect Tax Compliance
                    </button>
                    {aiTaxReasoning && (
                      <p className="mt-1 text-[9px] text-white/40 italic leading-relaxed bg-white/5 p-2 rounded-lg border border-white/5">{aiTaxReasoning}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-white">Invoice Items</h4>
                    <button 
                      type="button"
                      onClick={addItem}
                      className="text-[10px] font-bold text-blue-400 flex items-center gap-1 hover:underline uppercase tracking-widest"
                    >
                      <Plus className="w-3 h-3" /> Add Item
                    </button>
                  </div>

                  <div className="space-y-3">
                    {invoiceItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-4 items-end bg-white/5 p-4 border border-white/10 rounded-xl">
                        <div className="col-span-5 space-y-1">
                          <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Product</label>
                          <select 
                            required
                            value={item.productId}
                            onChange={(e) => updateItem(index, 'productId', e.target.value)}
                            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 focus:border-accent outline-none text-[12px] font-medium text-white rounded-lg"
                          >
                            <option value="" className="bg-slate-900">Select product...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id} className="bg-slate-900">{p.name} (${p.price})</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Qty</label>
                          <input 
                            required
                            type="number" 
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 focus:border-accent outline-none text-[12px] font-medium text-white rounded-lg"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Price</label>
                          <input 
                            required
                            type="number" 
                            value={item.price}
                            onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value))}
                            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 focus:border-accent outline-none text-[12px] font-medium text-white rounded-lg"
                          />
                        </div>
                        <div className="col-span-2 text-right py-2">
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Total</p>
                          <p className="text-[13px] font-extrabold text-white">${(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                        <div className="col-span-1 text-right">
                          <button 
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1.5 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="w-full max-w-xs space-y-3">
                    <div className="flex justify-between text-[12px] font-medium">
                      <span className="text-white/40 uppercase tracking-widest">Subtotal</span>
                      <span className="text-white">${calculateSubtotal().toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[12px] font-medium">
                      <span className="text-white/40 uppercase tracking-widest">
                        {business?.taxConfigs?.find(t => t.id === selectedTaxId)?.name || 'Tax'}
                      </span>
                      <span className="text-white">${calculateTax().toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-white/10 my-2" />
                    <div className="flex justify-between text-lg font-extrabold">
                      <span className="text-white uppercase tracking-tighter">Total</span>
                      <span className="text-white">${calculateTotal().toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 btn-secondary-geo"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={invoiceItems.length === 0}
                    className="flex-1 btn-primary-geo"
                  >
                    Generate Invoice
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
