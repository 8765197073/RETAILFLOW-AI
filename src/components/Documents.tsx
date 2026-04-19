import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { collection, query, onSnapshot, where, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  FileText, 
  Download, 
  Search, 
  Filter,
  MoreVertical,
  Eye,
  Send,
  FilePlus,
  Loader2,
  Trash2
} from 'lucide-react';
import { motion } from 'motion/react';
import { Invoice, BusinessDocument } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Documents({ user }: { user: User }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'invoices'), where('ownerUid', '==', user.uid));
    const unsubscribeInvoices = onSnapshot(q, (snapshot) => {
      setInvoices(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
    });

    const docQ = query(collection(db, 'documents'), where('ownerUid', '==', user.uid));
    const unsubscribeDocs = onSnapshot(docQ, (snapshot) => {
      setDocuments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BusinessDocument)));
    });

    return () => {
      unsubscribeInvoices();
      unsubscribeDocs();
    };
  }, [user.uid]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // simulate real upload
      const newDoc: Omit<BusinessDocument, 'id'> = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        date: new Date().toISOString().split('T')[0],
        ownerUid: user.uid,
        url: '#' // placeholder
      };

      await addDoc(collection(db, 'documents'), newDoc);
      alert('Document uploaded successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'documents');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const exportToPDF = (invoice: Invoice) => {
    const doc = new jsPDF();
    doc.text(`Invoice: ${invoice.invoiceNumber}`, 14, 15);
    doc.text(`Date: ${invoice.date}`, 14, 25);
    doc.text(`Total: $${invoice.total.toLocaleString()}`, 14, 35);
    
    const tableData = invoice.items.map(item => [
      item.productName,
      item.quantity,
      `$${item.price}`,
      `$${item.quantity * item.price}`
    ]);

    autoTable(doc, {
      head: [['Product', 'Quantity', 'Price', 'Subtotal']],
      body: tableData,
      startY: 45
    });

    doc.save(`invoice_${invoice.invoiceNumber}.pdf`);
  };

  const shareByEmail = async (invoice: Invoice) => {
    const subject = encodeURIComponent(`Invoice #${invoice.invoiceNumber}`);
    const body = encodeURIComponent(`
Hello,

Please find the details for Invoice #${invoice.invoiceNumber} below:
Date: ${new Date(invoice.date).toLocaleDateString()}
Total: $${invoice.total.toLocaleString()}

Thank you!
    `);

    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDocs = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Document Vault</h1>
          <p className="text-white/60 font-medium text-sm">Secure storage and management for all business documents.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUpload}
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="btn-primary-geo flex items-center gap-2"
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FilePlus className="w-5 h-5" />}
            {isUploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="geo-card p-6 bg-accent/10 border-accent/20">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-accent" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Total Documents</h3>
          </div>
          <p className="text-3xl font-black text-white">{invoices.length + documents.length}</p>
        </div>
        <div className="geo-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-emerald-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Invoices</h3>
          </div>
          <p className="text-3xl font-black text-white">{invoices.length}</p>
        </div>
        <div className="geo-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-amber-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Other Files</h3>
          </div>
          <p className="text-3xl font-black text-white">{documents.length}</p>
        </div>
      </div>

      <div className="geo-card">
        <div className="flex items-center justify-between mb-8">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input 
              type="text" 
              placeholder="Search documents..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 focus:border-accent rounded-md text-[13px] font-medium outline-none transition-all text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-white/5">
                <th className="pb-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Name</th>
                <th className="pb-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Type</th>
                <th className="pb-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Date</th>
                <th className="pb-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Size</th>
                <th className="pb-4 text-[10px] font-bold uppercase tracking-widest text-white/40 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {/* Other Documents */}
              {filteredDocs.map((doc) => (
                <tr key={doc.id} className="group hover:bg-white/5 transition-colors">
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-400" />
                      </div>
                      <span className="text-[13px] font-medium text-white">{doc.name}</span>
                    </div>
                  </td>
                  <td className="py-4 text-[12px] font-medium text-white/60">{doc.type}</td>
                  <td className="py-4 text-[12px] font-medium text-white/60">{doc.date}</td>
                  <td className="py-4 text-[12px] font-medium text-white/60">{doc.size}</td>
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all"
                        title="Download"
                        onClick={() => alert('Download functionality would be implemented with Firebase Storage.')}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-white/40 hover:text-rose-400 hover:bg-white/5 rounded transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Invoices */}
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="group hover:bg-white/5 transition-colors">
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center">
                        <FileText className="w-4 h-4 text-accent" />
                      </div>
                      <span className="text-[13px] font-medium text-white">Invoice #{invoice.invoiceNumber}</span>
                    </div>
                  </td>
                  <td className="py-4 text-[12px] font-medium text-white/60">Invoice PDF</td>
                  <td className="py-4 text-[12px] font-medium text-white/60">{invoice.date}</td>
                  <td className="py-4 text-[12px] font-medium text-white/60">1.2 MB</td>
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => exportToPDF(invoice)}
                        className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => shareByEmail(invoice)}
                        className="p-2 text-white/40 hover:text-accent hover:bg-white/5 rounded transition-all"
                        title="Share"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
