import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  Package,
  ArrowUpDown,
  X,
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  Camera,
  Layers,
  Box,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, StockBatch, Business } from '../types';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import { cleanUnstructuredData } from '../services/aiService';
import { Sparkles, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { useLanguage } from '../contexts/LanguageContext';
import { FileUpload } from './FileUpload';

export default function Inventory({ user }: { user: User }) {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    price: 0,
    cost: 0,
    stockLevel: 0,
    reorderLevel: 5,
    imageUrl: '',
    description: '',
    unit: 'pcs',
    brand: '',
    taxConfigId: ''
  });
  const [specs, setSpecs] = useState<{ [key: string]: string }>({});

  const [aiRecs, setAiRecs] = useState<Product[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'businesses'), where('ownerUid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setBusiness({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Business);
      }
    });
    return () => unsubscribe();
  }, [user.uid]);

  const notifyLowStock = async (product: Product) => {
    try {

      // simulated await
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {

    }
  };

  useEffect(() => {
    const q = query(collection(db, 'products'), where('ownerUid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newProducts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProducts(newProducts);

      // Check for low stock and notify
      newProducts.forEach(product => {
        if (product.stockLevel <= (product.reorderLevel || 5) && user.email) {
          // Simple local storage throttle to avoid spamming
          const lastNotified = localStorage.getItem(`notified_${product.id}`);
          const now = Date.now();
          if (!lastNotified || now - parseInt(lastNotified) > 24 * 60 * 60 * 1000) {
            notifyLowStock(product);
            localStorage.setItem(`notified_${product.id}`, now.toString());
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return () => unsubscribe();
  }, [user.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const productData = {
        ...formData,
        specifications: specs,
        ownerUid: user.uid,
        businessId: 'default',
        imageUrl: formData.imageUrl || `https://picsum.photos/seed/${formData.name}/400/400`
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id!), productData);
      } else {
        const initialBatches: StockBatch[] = [];
        if (formData.stockLevel > 0) {
          initialBatches.push({
            id: crypto.randomUUID(),
            quantity: formData.stockLevel,
            cost: formData.cost,
            receivedDate: new Date().toISOString()
          });
        }
        await addDoc(collection(db, 'products'), {
          ...productData,
          batches: initialBatches
        });
      }
      setIsModalOpen(false);
      setEditingProduct(null);
      setFormData({ 
        name: '', 
        sku: '', 
        category: '', 
        price: 0, 
        cost: 0, 
        stockLevel: 0, 
        reorderLevel: 5, 
        imageUrl: '', 
        description: '',
        unit: 'pcs',
        brand: '',
        taxConfigId: ''
      });
      setSpecs({});
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  const handleAiClean = async () => {
    if (!rawText.trim()) return;
    setIsCleaning(true);
    setImportError(null);
    try {
      const cleanedData = await cleanUnstructuredData(rawText);
      const batch = writeBatch(db);
      const productsRef = collection(db, 'products');

      cleanedData.forEach((item: any) => {
        const newProductRef = doc(productsRef);
        const initialBatches: StockBatch[] = [];
        if (item.stockLevel > 0) {
          initialBatches.push({
            id: crypto.randomUUID(),
            quantity: item.stockLevel,
            cost: item.cost || 0,
            receivedDate: new Date().toISOString()
          });
        }

        batch.set(newProductRef, {
          ...item,
          ownerUid: user.uid,
          businessId: 'default',
          batches: initialBatches
        });
      });

      await batch.commit();
      setIsImportModalOpen(false);
      setRawText('');
      alert(`Successfully imported ${cleanedData.length} products with AI cleaning!`);
    } catch (error) {

      setImportError('Failed to clean data with AI. Please try again.');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const { data, errors } = results;
        if (errors.length > 0) {
          setImportError('Failed to parse CSV file. Please check the format.');
          return;
        }

        try {
          const batch = writeBatch(db);
          const productsRef = collection(db, 'products');

          data.forEach((row: any) => {
            const name = row.name || row.Name;
            const price = parseFloat(row.price || row.Price || '0');
            const cost = parseFloat(row.cost || row.Cost || '0');
            const stockLevel = parseInt(row.stockLevel || row.Stock || '0');
            
            if (name) {
              const newProductRef = doc(productsRef);
              const initialBatches: StockBatch[] = [];
              if (stockLevel > 0) {
                initialBatches.push({
                  id: crypto.randomUUID(),
                  quantity: stockLevel,
                  cost: cost,
                  receivedDate: new Date().toISOString()
                });
              }

              batch.set(newProductRef, {
                name,
                sku: row.sku || row.SKU || '',
                category: row.category || row.Category || '',
                price,
                cost,
                stockLevel,
                reorderLevel: parseInt(row.reorderLevel || row.Reorder || '5'),
                ownerUid: user.uid,
                businessId: 'default',
                batches: initialBatches
              });
            }
          });

          await batch.commit();
          setIsImportModalOpen(false);
        } catch (error) {

          setImportError('Failed to save products to database.');
        }
      }
    });
  };

  const downloadTemplate = () => {
    const csv = Papa.unparse([
      { name: 'Product A', sku: 'SKU001', category: 'Electronics', price: 99.99, cost: 50.00, stockLevel: 10, reorderLevel: 5 },
      { name: 'Product B', sku: 'SKU002', category: 'Home', price: 49.99, cost: 20.00, stockLevel: 20, reorderLevel: 10 }
    ]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'inventory_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      }
    }
  };

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const toggleSelectAll = () => {
    if (selectedProducts.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id!));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedProducts(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const exportSelectedToExcel = () => {
    const list = products.filter(p => selectedProducts.includes(p.id!));
    if (list.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(list.map(p => ({
      Name: p.name,
      SKU: p.sku,
      Brand: p.brand,
      Category: p.category,
      Price: p.price,
      Cost: p.cost,
      Stock: p.stockLevel,
      Unit: p.unit,
      ReorderLevel: p.reorderLevel
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Selected Inventory");
    XLSX.writeFile(workbook, "inventory_export.xlsx");
  };

  const exportSelectedToPDF = () => {
    const list = products.filter(p => selectedProducts.includes(p.id!));
    if (list.length === 0) return;

    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Inventory Report', 14, 22);

    autoTable(doc, {
      head: [['Product', 'Brand', 'Category', 'Price', 'Stock']],
      body: list.map(p => [
        p.name,
        p.brand || '-',
        p.category || 'Uncategorized',
        `$${p.price.toFixed(2)}`,
        `${p.stockLevel} ${p.unit || 'pcs'}`
      ]),
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });
    doc.save(`inventory_batch_${Date.now()}.pdf`);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">{t('inventory')}</h1>
          <p className="text-white/60 font-medium text-sm">Track and manage your product stock levels.</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedProducts.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 pr-4 border-r border-white/10"
            >
              <span className="text-[10px] font-bold text-accent uppercase tracking-widest">{selectedProducts.length} Selected</span>
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
            onClick={() => setIsImportModalOpen(true)}
            className="btn-secondary-geo flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button 
            onClick={() => {
              setEditingProduct(null);
              setFormData({ 
                name: '', 
                sku: '', 
                category: '', 
                price: 0, 
                cost: 0, 
                stockLevel: 0, 
                reorderLevel: 5,
                imageUrl: '',
                description: '',
                unit: 'pcs',
                brand: '',
                taxConfigId: ''
              });
              setSpecs({});
              setIsModalOpen(true);
            }}
            className="btn-primary-geo flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {t('addNewProduct')}
          </button>
        </div>
      </div>

      <div className="geo-card !p-0 overflow-hidden">
        <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input 
              type="text" 
              placeholder="Search by name or SKU..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 focus:border-accent rounded-md text-[13px] font-medium outline-none transition-all text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary-geo flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button className="btn-secondary-geo flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4" />
              Sort
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5">
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-white/10 bg-white/5 accent-accent"
                  />
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Product</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Brand</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Price</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Stock</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredProducts.map((product) => (
                <tr key={product.id} className={cn("hover:bg-white/5 transition-colors group", selectedProducts.includes(product.id!) && "bg-accent/5")}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      checked={selectedProducts.includes(product.id!)}
                      onChange={() => toggleSelectRow(product.id!)}
                      className="w-4 h-4 rounded border-white/10 bg-white/5 accent-accent"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/5 rounded-lg overflow-hidden border border-white/10">
                        <img 
                          src={product.imageUrl || `https://picsum.photos/seed/${product.name}/100/100`}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div>
                        <p className="font-bold text-white text-[13px]">{product.name}</p>
                        <div className="flex gap-2 items-center">
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{product.sku || 'No SKU'}</p>
                          {product.unit && <span className="text-[9px] px-1 bg-white/5 text-white/40 rounded uppercase font-bold">{product.unit}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[12px] text-white/40 font-bold uppercase">{product.brand || '-'}</td>
                  <td className="px-6 py-4 text-[12px] text-white/40">{product.category || 'Uncategorized'}</td>
                  <td className="px-6 py-4 text-[13px] font-bold text-white">${product.price.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "tag-geo",
                        product.stockLevel <= (product.reorderLevel || 5) 
                          ? "tag-critical-geo" 
                          : product.stockLevel <= 10 
                            ? "tag-low-geo" 
                            : "tag-ok-geo"
                      )}>
                        {product.stockLevel} UNITS
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => {
                          setEditingProduct(product);
                          setFormData({
                            name: product.name,
                            sku: product.sku || '',
                            category: product.category || '',
                            price: product.price,
                            cost: product.cost || 0,
                            stockLevel: product.stockLevel,
                            reorderLevel: product.reorderLevel || 5,
                            imageUrl: product.imageUrl || '',
                            description: product.description || '',
                            unit: product.unit || 'pcs',
                            brand: product.brand || '',
                            taxConfigId: product.taxConfigId || ''
                          });
                          setSpecs(product.specifications || {});
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id!)}
                        className="p-2 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all"
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
      </div>

      {/* Import Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-slate-900 border border-white/10 shadow-2xl rounded-2xl overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Bulk Import Products</h3>
                <button onClick={() => setIsImportModalOpen(false)} className="p-2 hover:bg-white/5 rounded transition-colors">
                  <X className="w-5 h-5 text-white/40" />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="p-8 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-4 bg-white/5 hover:bg-white/10 transition-colors relative">
                    <FileSpreadsheet className="w-12 h-12 text-white/20" />
                    <div className="text-center">
                      <p className="text-[13px] font-bold text-white">Upload CSV File</p>
                      <p className="text-[11px] text-white/40 font-medium">Drag and drop or click to browse</p>
                    </div>
                    <input 
                      type="file" 
                      accept=".csv"
                      onChange={handleCsvImport}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-white/5"></span>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                      <span className="bg-slate-900 px-2 text-white/20">or use AI Agent</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Paste Raw/Unstructured Data</label>
                    <textarea 
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Paste messy product data, notes, or raw text here..."
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-xl resize-none"
                      rows={4}
                    />
                    <button 
                      onClick={handleAiClean}
                      disabled={isCleaning || !rawText.trim()}
                      className="w-full py-3 bg-accent text-white rounded-xl text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-accent/90 transition-all"
                    >
                      {isCleaning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {isCleaning ? 'AI Agent Cleaning...' : 'Clean & Import with AI'}
                    </button>
                  </div>
                </div>

                {importError && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                    <p className="text-[12px] font-medium text-rose-400">{importError}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Instructions</p>
                  <ul className="space-y-2 text-[12px] font-medium text-white/60 list-disc pl-4">
                    <li>Use the CSV template for correct formatting.</li>
                    <li>Required columns: name, price, stockLevel.</li>
                    <li>Optional columns: sku, category, cost, reorderLevel.</li>
                  </ul>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={downloadTemplate}
                    className="flex-1 btn-secondary-geo flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Template
                  </button>
                  <button 
                    onClick={() => setIsImportModalOpen(false)}
                    className="flex-1 btn-primary-geo"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal */}
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
              className="relative w-full max-w-lg bg-slate-900 border border-white/10 shadow-2xl rounded-2xl overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded transition-colors">
                  <X className="w-5 h-5 text-white/40" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Product Name</label>
                    <input 
                      required
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                      placeholder="e.g. Wireless Headphones"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <FileUpload 
                      label="Product Photo"
                      currentImage={formData.imageUrl}
                      onUpload={(base64) => setFormData({...formData, imageUrl: base64})}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Description</label>
                    <textarea 
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg resize-none"
                      rows={2}
                      placeholder="Product details..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">SKU</label>
                    <input 
                      type="text" 
                      value={formData.sku}
                      onChange={(e) => setFormData({...formData, sku: e.target.value})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                      placeholder="WH-001"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Category</label>
                    <input 
                      type="text" 
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                      placeholder="Electronics"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Brand</label>
                    <input 
                      type="text" 
                      value={formData.brand}
                      onChange={(e) => setFormData({...formData, brand: e.target.value})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                      placeholder="e.g. Sony"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Unit</label>
                    <input 
                      type="text" 
                      value={formData.unit}
                      onChange={(e) => setFormData({...formData, unit: e.target.value})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                      placeholder="e.g. pcs, kg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Selling Price</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value)})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Cost Price</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={formData.cost}
                      onChange={(e) => setFormData({...formData, cost: parseFloat(e.target.value)})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Stock Level</label>
                    <input 
                      required
                      type="number" 
                      value={formData.stockLevel}
                      onChange={(e) => setFormData({...formData, stockLevel: parseInt(e.target.value)})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Reorder Level</label>
                    <input 
                      required
                      type="number" 
                      value={formData.reorderLevel}
                      onChange={(e) => setFormData({...formData, reorderLevel: parseInt(e.target.value)})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Applied Tax Rule</label>
                    <div className="relative group/select">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within/select:text-accent transition-colors">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <select 
                        value={formData.taxConfigId}
                        onChange={(e) => setFormData({...formData, taxConfigId: e.target.value})}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-xl appearance-none hover:bg-white/10"
                      >
                        <option value="">Default (Global Settings)</option>
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
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Specifications</label>
                    <button 
                      type="button" 
                      onClick={() => setSpecs({...specs, '': ''})}
                      className="text-[10px] font-bold text-accent uppercase tracking-widest hover:text-white transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(specs).map(([k, v], i) => (
                      <div key={i} className="flex gap-2">
                        <input 
                          type="text" 
                          value={k}
                          onChange={(e) => {
                            const newSpecs = { ...specs };
                            delete newSpecs[k];
                            newSpecs[e.target.value] = v;
                            setSpecs(newSpecs);
                          }}
                          placeholder="Label"
                          className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white"
                        />
                        <input 
                          type="text" 
                          value={v}
                          onChange={(e) => setSpecs({ ...specs, [k]: e.target.value })}
                          placeholder="Value"
                          className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white"
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const newSpecs = { ...specs };
                            delete newSpecs[k];
                            setSpecs(newSpecs);
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-3 sticky bottom-0 bg-slate-900 py-4 border-t border-white/10">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 btn-secondary-geo"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 btn-primary-geo"
                  >
                    {editingProduct ? 'Update Product' : 'Add Product'}
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
