import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  MapPin, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  User as UserIcon,
  Users,
  ChevronRight,
  X,
  Sparkles,
  Camera,
  ShoppingBag,
  History,
  Download,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, Product } from '../types';
import { cn } from '../lib/utils';
import { getProductRecommendations } from '../services/aiService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { useLanguage } from '../contexts/LanguageContext';

export default function CRM({ user }: { user: User }) {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [recommendations, setRecommendations] = useState<Record<string, Product[]>>({});
  const [loadingRecs, setLoadingRecs] = useState<Record<string, boolean>>({});
  
  const [purchaseData, setPurchaseData] = useState<{productId: string, quantity: number}[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    totalSpent: 0,
    profilePicture: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'customers'), where('ownerUid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    const pq = query(collection(db, 'products'), where('ownerUid', '==', user.uid));
    const unsubscribeProducts = onSnapshot(pq, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    return () => {
      unsubscribe();
      unsubscribeProducts();
    };
  }, []);

  const handleLogPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || purchaseData.length === 0) return;

    try {
      const newPurchaseHistory = [...(selectedCustomer.purchaseHistory || [])];
      let addedSpent = 0;

      purchaseData.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          for (let i = 0; i < item.quantity; i++) {
            newPurchaseHistory.push(item.productId);
          }
          addedSpent += product.price * item.quantity;
        }
      });

      await updateDoc(doc(db, 'customers', selectedCustomer.id!), {
        purchaseHistory: newPurchaseHistory,
        totalSpent: (selectedCustomer.totalSpent || 0) + addedSpent
      });

      setIsPurchaseModalOpen(false);
      setPurchaseData([]);
      setSelectedCustomer(null);
      // Refresh recommendations for this customer
      fetchRecommendations({ ...selectedCustomer, purchaseHistory: newPurchaseHistory, totalSpent: (selectedCustomer.totalSpent || 0) + addedSpent });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'customers');
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Customer List', 14, 15);
    const tableData = filteredCustomers.map(c => [
      c.name,
      c.email || 'N/A',
      c.phone || 'N/A',
      `$${(c.totalSpent || 0).toLocaleString()}`
    ]);
    autoTable(doc, {
      head: [['Name', 'Email', 'Phone', 'Total Spent']],
      body: tableData,
      startY: 20
    });
    doc.save('customers.pdf');
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredCustomers.map(c => ({
      Name: c.name,
      Email: c.email,
      Phone: c.phone,
      Address: c.address,
      TotalSpent: c.totalSpent
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    XLSX.writeFile(workbook, "customers.xlsx");
  };

  const shareByEmail = async (customer: Customer) => {
    if (!customer.email) {
      alert('Customer has no email address.');
      return;
    }

    const subject = encodeURIComponent('Account Summary - RetailFlow AI');
    const body = encodeURIComponent(`
Hello ${customer.name},

Here is your account summary:
Total Spent: $${(customer.totalSpent || 0).toLocaleString()}

Thank you for your business!
    `);

    window.location.href = `mailto:${customer.email}?subject=${subject}&body=${body}`;
  };

  const fetchRecommendations = async (customer: Customer) => {
    if (!customer.id || recommendations[customer.id]) return;
    
    setLoadingRecs(prev => ({ ...prev, [customer.id!]: true }));
    try {
      const recs = await getProductRecommendations(customer, products);
      setRecommendations(prev => ({ ...prev, [customer.id!]: recs }));
    } finally {
      setLoadingRecs(prev => ({ ...prev, [customer.id!]: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        ownerUid: user.uid,
        businessId: 'default',
        profilePicture: formData.profilePicture || `https://picsum.photos/seed/${formData.name}/200/200`
      };

      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id!), data);
      } else {
        await addDoc(collection(db, 'customers'), data);
      }
      setIsModalOpen(false);
      setEditingCustomer(null);
      setFormData({ name: '', email: '', phone: '', address: '', totalSpent: 0, profilePicture: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'customers');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this customer?')) {
      try {
        await deleteDoc(doc(db, 'customers', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
      }
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">{t('customers')}</h1>
          <p className="text-white/60 font-medium text-sm">AI-driven insights and relationship management.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportToPDF}
            className="btn-secondary-geo flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
          <button 
            onClick={exportToExcel}
            className="btn-secondary-geo flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
          <button 
            onClick={() => {
              setEditingCustomer(null);
              setFormData({ name: '', email: '', phone: '', address: '', totalSpent: 0, profilePicture: '' });
              setIsModalOpen(true);
            }}
            className="btn-primary-geo flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {t('newCustomer')}
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input 
          type="text" 
          placeholder="Search by name, email or phone..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 focus:border-accent rounded-md text-[13px] font-medium outline-none transition-all text-white"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {filteredCustomers.map((customer) => (
          <motion.div 
            layout
            key={customer.id}
            className="geo-card group overflow-hidden"
          >
            <div className="flex flex-col md:flex-row gap-8">
              {/* Profile & Info */}
              <div className="flex-1 space-y-6">
                <div className="flex items-start justify-between">
                  <div className="relative">
                    <img 
                      src={customer.profilePicture || `https://picsum.photos/seed/${customer.name}/200/200`}
                      alt={customer.name}
                      className="w-20 h-20 rounded-2xl object-cover border-2 border-white/10"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-accent rounded-lg flex items-center justify-center border-4 border-slate-900">
                      <UserIcon className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => shareByEmail(customer)}
                      className="p-2 text-white/40 hover:text-accent hover:bg-white/5 rounded transition-all"
                      title="Share Summary"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setIsPurchaseModalOpen(true);
                        setPurchaseData([{ productId: '', quantity: 1 }]);
                      }}
                      className="p-2 text-white/40 hover:text-emerald-400 hover:bg-white/5 rounded transition-all"
                      title="Log Purchase"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setEditingCustomer(customer);
                        setFormData({
                          name: customer.name,
                          email: customer.email || '',
                          phone: customer.phone || '',
                          address: customer.address || '',
                          totalSpent: customer.totalSpent || 0,
                          profilePicture: customer.profilePicture || ''
                        });
                        setIsModalOpen(true);
                      }}
                      className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(customer.id!)}
                      className="p-2 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-extrabold text-white text-2xl mb-1">{customer.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="tag-geo tag-ok-geo">Active Client</span>
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Since 2024</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 text-[13px] font-medium text-white/80">
                    <Mail className="w-4 h-4 text-white/40" />
                    <span className="truncate">{customer.email || 'No email'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[13px] font-medium text-white/80">
                    <Phone className="w-4 h-4 text-white/40" />
                    <span>{customer.phone || 'No phone'}</span>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Lifetime Value</p>
                  <p className="text-3xl font-black text-white">${(customer.totalSpent || 0).toLocaleString()}</p>
                </div>
              </div>

              {/* AI Recommendations */}
              <div className="w-full md:w-64 bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-white">AI Recommendations</h4>
                </div>

                {!recommendations[customer.id!] ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center">
                      <ShoppingBag className="w-6 h-6 text-white/20" />
                    </div>
                    <p className="text-[11px] font-medium text-white/40">Analyze history to suggest products</p>
                    <button 
                      onClick={() => fetchRecommendations(customer)}
                      disabled={loadingRecs[customer.id!]}
                      className="text-[10px] font-bold uppercase tracking-widest text-accent hover:text-white transition-colors disabled:opacity-50"
                    >
                      {loadingRecs[customer.id!] ? 'Analyzing...' : 'Generate Suggestions'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 flex-1 overflow-y-auto no-scrollbar">
                    {recommendations[customer.id!].map((prod) => (
                      <div key={prod.id} className="group/item flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                        <img 
                          src={prod.imageUrl || `https://picsum.photos/seed/${prod.name}/100/100`}
                          alt={prod.name}
                          className="w-10 h-10 rounded-lg object-cover border border-white/10"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold text-white truncate">{prod.name}</p>
                          <p className="text-[10px] font-medium text-accent">${prod.price}</p>
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => fetchRecommendations(customer)}
                      className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors border border-dashed border-white/10 rounded-lg mt-2"
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

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
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">{editingCustomer ? 'Edit Customer Intelligence' : 'Register New Customer'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded transition-colors">
                  <X className="w-5 h-5 text-white/40" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="flex justify-center mb-8">
                  <div className="relative group cursor-pointer">
                    <div className="w-24 h-24 rounded-2xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden transition-all group-hover:border-accent">
                      {formData.profilePicture ? (
                        <img src={formData.profilePicture} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Camera className="w-8 h-8 text-white/20 group-hover:text-accent transition-colors" />
                      )}
                    </div>
                    <input 
                      type="text" 
                      placeholder="Paste Image URL"
                      value={formData.profilePicture}
                      onChange={(e) => setFormData({...formData, profilePicture: e.target.value})}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <p className="text-[10px] font-bold text-center mt-2 text-white/40 uppercase tracking-widest">Profile Photo</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Full Name</label>
                  <input 
                    required
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                    placeholder="John Doe"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Email Address</label>
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Phone Number</label>
                    <input 
                      type="tel" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Address</label>
                  <textarea 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium resize-none text-white rounded-lg"
                    rows={3}
                    placeholder="123 Retail St, Business City"
                  />
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
                    className="flex-1 btn-primary-geo"
                  >
                    {editingCustomer ? 'Update Intelligence' : 'Register Customer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Log Purchase Modal */}
      <AnimatePresence>
        {isPurchaseModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPurchaseModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-slate-900 border border-white/10 shadow-2xl rounded-2xl overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Log Past Purchase: {selectedCustomer?.name}</h3>
                <button onClick={() => setIsPurchaseModalOpen(false)} className="p-2 hover:bg-white/5 rounded transition-colors">
                  <X className="w-5 h-5 text-white/40" />
                </button>
              </div>
              
              <form onSubmit={handleLogPurchase} className="p-8 space-y-6">
                <div className="space-y-4">
                  {purchaseData.map((item, index) => (
                    <div key={index} className="flex gap-3 items-end">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Product</label>
                        <select 
                          required
                          value={item.productId}
                          onChange={(e) => {
                            const newData = [...purchaseData];
                            newData[index].productId = e.target.value;
                            setPurchaseData(newData);
                          }}
                          className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                        >
                          <option value="" className="bg-slate-900">Select Product</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id} className="bg-slate-900">{p.name} - ${p.price}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24 space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Qty</label>
                        <input 
                          required
                          type="number" 
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const newData = [...purchaseData];
                            newData[index].quantity = parseInt(e.target.value);
                            setPurchaseData(newData);
                          }}
                          className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                        />
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          const newData = purchaseData.filter((_, i) => i !== index);
                          setPurchaseData(newData);
                        }}
                        className="p-2.5 text-rose-400 hover:bg-rose-500/10 rounded-lg border border-white/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button 
                  type="button"
                  onClick={() => setPurchaseData([...purchaseData, { productId: '', quantity: 1 }])}
                  className="w-full py-3 border border-dashed border-white/10 rounded-xl text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 transition-all"
                >
                  <Plus className="w-4 h-4 mx-auto mb-1" />
                  Add Another Item
                </button>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsPurchaseModalOpen(false)}
                    className="flex-1 btn-secondary-geo"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 btn-primary-geo"
                  >
                    Save Purchase History
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
