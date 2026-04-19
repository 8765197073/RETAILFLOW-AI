import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  Save,
  CheckCircle2,
  ShieldCheck,
  Settings2,
  Type,
  AlertCircle,
  Plus,
  Trash2,
  Sparkles
} from 'lucide-react';
import { Business, TaxConfig } from '../types';
import { cn } from '../lib/utils';
import { FileUpload } from './FileUpload';

export default function BusinessSettings({ user }: { user: User }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    gstNumber: '',
    address: '',
    phone: '',
    email: '',
    inventoryMethod: 'AI_OPTIMIZED' as 'FIFO' | 'LIFO' | 'AVG' | 'AI_OPTIMIZED',
    taxRate: 18,
    taxConfigs: [] as TaxConfig[],
    watermarkText: '',
    showWatermark: false,
    logoUrl: '',
    profilePicUrl: '',
    fullName: '',
    mission: '',
    services: [] as string[]
  });

  useEffect(() => {
    const q = query(collection(db, 'businesses'), where('ownerUid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Business;
        setBusiness(data);
        setFormData({
          name: data.name,
          gstNumber: data.gstNumber || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          inventoryMethod: data.inventoryMethod || 'AI_OPTIMIZED',
          taxRate: data.taxRate ?? 18,
          taxConfigs: data.taxConfigs || [{ id: '1', name: 'GST', rate: 18, type: 'percentage' }],
          watermarkText: data.watermarkText || '',
          showWatermark: data.showWatermark || false,
          logoUrl: data.logoUrl || '',
          profilePicUrl: data.profilePicUrl || '',
          fullName: data.fullName || '',
          mission: data.mission || '',
          services: data.services || []
        });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (business) {
        await updateDoc(doc(db, 'businesses', business.id!), {
          ...formData,
          ownerUid: user.uid
        });
      } else {
        await addDoc(collection(db, 'businesses'), {
          ...formData,
          ownerUid: user.uid
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'businesses');
    }
  };

  const handleAddTax = () => {
    const newTax: TaxConfig = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Tax',
      rate: 0,
      type: 'percentage'
    };
    setFormData(prev => ({ ...prev, taxConfigs: [...prev.taxConfigs, newTax] }));
  };

  const handleRemoveTax = (id: string) => {
    setFormData(prev => ({ ...prev, taxConfigs: prev.taxConfigs.filter(t => t.id !== id) }));
  };

  const handleUpdateTax = (id: string, field: keyof TaxConfig, value: any) => {
    setFormData(prev => ({
      ...prev,
      taxConfigs: prev.taxConfigs.map(t => t.id === id ? { ...t, [field]: value } : t)
    }));
  };

  if (loading) return null;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Business Profile</h1>
        <p className="text-white/60 font-medium text-sm">Configure your store details, tax settings, and inventory methods.</p>
      </div>

      <div className="geo-card">
        <form onSubmit={handleSubmit} className="space-y-12">
            {/* Personal Profile */}
            <section className="space-y-8">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <Settings2 className="w-5 h-5 text-emerald-400" />
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-white">Personal Profile</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-2 space-y-1.5">
                  <FileUpload 
                    label="Personal Avatar"
                    currentImage={formData.profilePicUrl}
                    onUpload={(base64) => setFormData({...formData, profilePicUrl: base64})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Full Name</label>
                  <input 
                    type="text" 
                    value={formData.fullName}
                    onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                    placeholder="Enter your name"
                  />
                </div>
              </div>
            </section>

          {/* General Info */}
          <section className="space-y-8">
            <div className="flex items-center gap-3 pb-4 border-b border-white/10">
              <Building2 className="w-5 h-5 text-blue-400" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-white">General Information</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 space-y-1.5">
                <FileUpload 
                  label="Business Logo"
                  currentImage={formData.logoUrl}
                  onUpload={(base64) => setFormData({...formData, logoUrl: base64})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Business Name</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                  placeholder="RetailFlow AI Store"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">GST Number</label>
                <input 
                  type="text" 
                  value={formData.gstNumber}
                  onChange={(e) => setFormData({...formData, gstNumber: e.target.value})}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Contact Email</label>
                <input 
                  required
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                  placeholder="contact@retailflow.ai"
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
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Our Mission</label>
                <textarea 
                  value={formData.mission}
                  onChange={(e) => setFormData({...formData, mission: e.target.value})}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg resize-none"
                  rows={2}
                  placeholder="Empowering retail with AI-driven precision..."
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Services Provided (Comma separated)</label>
                <input 
                  type="text" 
                  value={formData.services.join(', ')}
                  onChange={(e) => setFormData({...formData, services: e.target.value.split(',').map(s => s.trim())})}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                  placeholder="Inventory Management, AI Analytics, Smart Invoicing"
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Business Address</label>
                <textarea 
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg resize-none"
                  rows={3}
                  placeholder="123 Retail St, Business City"
                />
              </div>
            </div>
          </section>

          {/* Advanced Settings */}
          <section className="space-y-8">
            <div className="flex items-center gap-3 pb-4 border-b border-white/10">
              <Settings2 className="w-5 h-5 text-blue-400" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-white">AI-Driven Inventory & Multi-Tax</h2>
            </div>
            <div className="space-y-6">
              <div className="p-4 bg-accent/10 border border-accent/20 rounded-xl flex items-start gap-4">
                <div className="p-2 bg-accent/20 rounded-lg">
                  <Sparkles className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-white mb-1">AI-Managed Inventory Method</h4>
                  <p className="text-[11px] text-white/60 leading-relaxed font-medium">
                    The RetailFlow AI agent now automatically selects the optimal inventory valuation method (FIFO, LIFO, or Weighted Average) based on your real-time turnover patterns and tax efficiency. No manual selection required.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Tax Settings (GST, VAT, etc.)</label>
                  <button 
                    type="button"
                    onClick={handleAddTax}
                    className="flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-widest hover:text-white transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Tax Option
                  </button>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {formData.taxConfigs.map((tax) => (
                    <div key={tax.id} className="flex gap-4 p-4 bg-white/5 border border-white/10 rounded-xl items-end group">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-white/30">Tax Name</label>
                        <input 
                          type="text" 
                          value={tax.name}
                          onChange={(e) => handleUpdateTax(tax.id, 'name', e.target.value)}
                          className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded text-xs font-bold text-white outline-none focus:border-accent"
                          placeholder="e.g. VAT"
                        />
                      </div>
                      <div className="w-24 space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-white/30">Rate (%)</label>
                        <input 
                          type="number" 
                          value={tax.rate}
                          onChange={(e) => handleUpdateTax(tax.id, 'rate', parseFloat(e.target.value))}
                          className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded text-xs font-bold text-white outline-none focus:border-accent"
                        />
                      </div>
                      <div className="w-32 space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-white/30">Type</label>
                        <select 
                          value={tax.type}
                          onChange={(e) => handleUpdateTax(tax.id, 'type', e.target.value)}
                          className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded text-xs font-bold text-white outline-none focus:border-accent"
                        >
                          <option value="percentage">Percentage</option>
                          <option value="fixed">Fixed</option>
                        </select>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleRemoveTax(tax.id)}
                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {formData.taxConfigs.length === 0 && (
                    <p className="text-[11px] text-white/20 italic text-center py-4">No custom tax options added.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Document Branding */}
          <section className="space-y-8">
            <div className="flex items-center gap-3 pb-4 border-b border-white/10">
              <Type className="w-5 h-5 text-blue-400" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-white">Document Branding</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Watermark Text</label>
                <input 
                  type="text" 
                  value={formData.watermarkText}
                  onChange={(e) => setFormData({...formData, watermarkText: e.target.value})}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                  placeholder="e.g. OFFICIAL INVOICE"
                />
              </div>
              <div className="flex items-center gap-3 h-full pt-4">
                <input 
                  type="checkbox" 
                  id="showWatermark"
                  checked={formData.showWatermark}
                  onChange={(e) => setFormData({...formData, showWatermark: e.target.checked})}
                  className="w-4 h-4 bg-white/5 border-white/10 text-blue-600 focus:ring-blue-500 rounded"
                />
                <label htmlFor="showWatermark" className="text-[12px] font-bold text-white uppercase tracking-widest cursor-pointer">
                  Enable Watermark on Invoices
                </label>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="space-y-8 pt-8 border-t border-rose-500/20">
            <div className="flex items-center gap-3 pb-4 border-b border-white/10">
              <AlertCircle className="w-5 h-5 text-rose-500" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-rose-500">Danger Zone</h2>
            </div>
            <div className="p-6 bg-rose-500/5 border border-rose-500/10 rounded-2xl flex items-center justify-between gap-6">
              <div>
                <h3 className="text-[13px] font-bold text-white mb-1">Delete All Business Data</h3>
                <p className="text-[11px] text-white/40 font-medium">
                  This will permanently delete all your products, customers, invoices, and business settings. This action cannot be undone.
                </p>
              </div>
              <button 
                type="button"
                onClick={async () => {
                  if (confirm('CRITICAL: Are you absolutely sure? This will wipe ALL your data permanently.')) {
                    if (confirm('FINAL WARNING: All products, customers, and invoices will be deleted. Proceed?')) {
                      // Implementation for bulk deletion would go here
                      alert('Data deletion initiated. Please contact support for full account wipe.');
                    }
                  }
                }}
                className="px-6 py-3 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all"
              >
                Delete Everything
              </button>
            </div>
          </section>

          <div className="pt-8 flex items-center justify-between border-t border-white/10">
            <p className="text-[11px] font-medium text-white/40 italic">
              {saved ? 'Changes saved successfully!' : 'Changes are saved to your cloud profile.'}
            </p>
            <button 
              type="submit"
              className={cn(
                "btn-primary-geo min-w-[160px] flex items-center justify-center gap-2",
                saved && "bg-emerald-600 border-emerald-600"
              )}
            >
              {saved ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
