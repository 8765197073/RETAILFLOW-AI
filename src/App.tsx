/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInAnonymously, signOut, User, updateProfile } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  FileText, 
  Settings, 
  LogOut, 
  Plus, 
  Search, 
  Bell,
  Store,
  TrendingUp,
  AlertCircle,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  Mail,
  UserPlus,
  FilePlus,
  Box,
  MessageSquare,
  Edit2,
  Receipt,
  BarChart3,
  Activity,
  Camera,
  ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Business } from './types';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { languages } from './lib/translations';
import { FileUpload } from './components/FileUpload';

// Components
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import CRM from './components/CRM';
import Invoices from './components/Invoices';
import BusinessSettings from './components/BusinessSettings';
import Analytics from './components/Analytics';
import ChatAssistant from './components/ChatAssistant';
import Documents from './components/Documents';
import Reports from './components/Reports';
import Vendors from './components/Vendors';
import NotificationTicker from './components/NotificationTicker';

function BottomNav() {
  const location = useLocation();
  const { t } = useLanguage();
  
  const menuItems = [
    { icon: LayoutDashboard, label: t('dashboard'), path: '/' },
    { icon: Users, label: t('customers'), path: '/customers' },
    { icon: Receipt, label: t('invoices'), path: '/invoices' },
    { icon: Package, label: t('inventory'), path: '/inventory' },
    { icon: FileText, label: t('documents'), path: '/documents' },
    { icon: BarChart3, label: t('reports'), path: '/reports' },
    { icon: ClipboardList, label: 'Vendors', path: '/vendors' },
    { icon: Activity, label: t('analytics'), path: '/analytics' },
    { icon: Settings, label: t('settings'), path: '/settings' },
  ];

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-5xl px-4">
      <nav className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "nav-pill shrink-0",
                isActive && "nav-pill-active"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Header({ user, business }: { user: User; business: Business | null }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const [profileData, setProfileData] = useState({
    displayName: user.displayName || '',
    photoURL: user.photoURL || ''
  });

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(user, {
        displayName: profileData.displayName,
        photoURL: profileData.photoURL
      });
      setIsEditProfileOpen(false);
      window.location.reload(); // Refresh to show changes
    } catch (error) {

      alert('Failed to update profile.');
    }
  };

  return (
    <header className="h-24 flex items-center justify-between px-8 max-w-7xl mx-auto w-full relative z-[100]">
      <div className="flex items-center gap-4 group cursor-pointer">
        <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center overflow-hidden shadow-lg shadow-accent/20 group-hover:scale-110 transition-transform duration-500">
          {business?.logoUrl ? (
            <img src={business.logoUrl} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          ) : (
            <Store className="w-7 h-7 text-white" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="font-black text-2xl uppercase tracking-tighter text-white leading-none">
            {business?.name || 'RETAILFLOW'}
          </span>
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.3em] mt-1">AI-Powered Systems</span>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl">
          <select 
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="bg-transparent text-[10px] font-bold text-white uppercase tracking-widest outline-none cursor-pointer"
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code} className="bg-slate-900">
                {lang.nativeName}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-3 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[11px] font-bold text-white uppercase tracking-widest hover:bg-white/10 hover:border-white/20 transition-all shadow-xl shadow-black/20"
          >
            <Plus className="w-4 h-4 text-accent" />
            {t('quickActions')}
            <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform duration-500", isDropdownOpen && "rotate-180")} />
          </button>

          <AnimatePresence>
            {isDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-[-1]" 
                  onClick={() => setIsDropdownOpen(false)} 
                />
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-56 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-2"
                >
                  <Link to="/inventory" onClick={() => setIsDropdownOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[12px] font-bold text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                    <Box className="w-4 h-4" />
                    Add New Product
                  </Link>
                  <Link to="/customers" onClick={() => setIsDropdownOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[12px] font-bold text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                    <UserPlus className="w-4 h-4" />
                    New Customer
                  </Link>
                  <Link to="/invoices" onClick={() => setIsDropdownOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[12px] font-bold text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                    <FilePlus className="w-4 h-4" />
                    Create Invoice
                  </Link>
                  <div className="h-px bg-white/10 my-2" />
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-[12px] font-bold text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                    <Mail className="w-4 h-4" />
                    Send Notifications
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="h-10 w-px bg-white/10 hidden sm:block" />
        
        <div className="flex items-center gap-5 pl-2">
          <div className="text-right hidden sm:block">
            <p className="text-[13px] font-black text-white leading-none mb-1">{user.displayName}</p>
            <div className="flex items-center justify-end gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Store Manager</p>
            </div>
          </div>
          <div className="relative group" onClick={() => setIsEditProfileOpen(true)}>
            <div className="absolute inset-0 bg-accent/20 rounded-full blur-md group-hover:blur-lg transition-all" />
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
              alt="Profile" 
              className="relative w-11 h-11 rounded-full border-2 border-white/10 group-hover:border-accent/50 transition-all cursor-pointer shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent rounded-full flex items-center justify-center border-2 border-slate-900 opacity-0 group-hover:opacity-100 transition-opacity">
              <Edit2 className="w-2 h-2 text-white" />
            </div>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="p-2.5 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400 rounded-xl border border-white/10 transition-all shadow-xl"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditProfileOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditProfileOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-slate-900 border border-white/10 shadow-2xl rounded-2xl overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Edit Profile Details</h3>
                <button onClick={() => setIsEditProfileOpen(false)} className="p-2 hover:bg-white/5 rounded transition-colors">
                  <X className="w-5 h-5 text-white/40" />
                </button>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="p-8 space-y-6">
                <FileUpload 
                  label="Profile Picture"
                  currentImage={profileData.photoURL}
                  onUpload={(base64) => setProfileData({...profileData, photoURL: base64})}
                />
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Display Name</label>
                  <input 
                    required
                    type="text" 
                    value={profileData.displayName}
                    onChange={(e) => setProfileData({...profileData, displayName: e.target.value})}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-accent outline-none transition-all text-[13px] font-medium text-white rounded-lg"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsEditProfileOpen(false)}
                    className="flex-1 btn-secondary-geo"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 btn-primary-geo"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
}

function LoginPage() {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {

    }
  };

  const handleGuestLogin = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {

    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse [animation-delay:2s]" />

      <motion.div 
        initial={{ opacity: 0, y: 40, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-md w-full geo-card p-12 text-center relative z-10"
      >
        <div className="w-20 h-20 bg-accent rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-accent/40 rotate-12 hover:rotate-0 transition-transform duration-500">
          <Store className="w-10 h-10 text-white" />
        </div>
        
        <div className="space-y-2 mb-12">
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">RETAILFLOW AI</h1>
          <div className="flex items-center justify-center gap-2">
            <span className="h-px w-8 bg-white/10" />
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">Next-Gen Operations</p>
            <span className="h-px w-8 bg-white/10" />
          </div>
        </div>

        <p className="text-white/60 font-medium text-sm mb-12 leading-relaxed">
          Experience the future of retail management with AI-driven insights, real-time inventory, and smart invoicing.
        </p>
        
        <div className="space-y-4">
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-4 bg-white text-slate-950 font-black text-[13px] uppercase tracking-widest py-5 px-8 rounded-2xl transition-all active:scale-[0.98] hover:bg-white/90 shadow-xl shadow-white/5 group"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Continue with Google
          </button>

          <button 
            onClick={handleGuestLogin}
            className="w-full flex items-center justify-center gap-4 bg-white/5 text-white border border-white/10 font-bold text-[13px] uppercase tracking-widest py-5 px-8 rounded-2xl transition-all active:scale-[0.98] hover:bg-white/10 hover:border-white/20 group"
          >
            <UserPlus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Continue as Guest (Demo)
          </button>
        </div>
        
        <div className="mt-12 pt-12 border-t border-white/5">
          <div className="flex justify-center gap-8 opacity-30 grayscale hover:grayscale-0 transition-all">
            <TrendingUp className="w-5 h-5 text-white" />
            <Users className="w-5 h-5 text-white" />
            <Package className="w-5 h-5 text-white" />
          </div>
          <p className="mt-6 text-[9px] font-bold text-white/20 uppercase tracking-[0.4em]">
            ENTERPRISE GRADE &bull; CLOUD SECURE
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        const q = query(collection(db, 'businesses'), where('ownerUid', '==', user.uid));
        onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            setBusiness({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Business);
          }
        });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <LanguageProvider>
      <Router>
        <div className="min-h-screen pb-32">
          <Header user={user} business={business} />
          
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Routes>
              <Route path="/" element={<Dashboard user={user} />} />
              <Route path="/inventory" element={<Inventory user={user} />} />
              <Route path="/customers" element={<CRM user={user} />} />
              <Route path="/invoices" element={<Invoices user={user} />} />
              <Route path="/analytics" element={<Analytics user={user} />} />
              <Route path="/documents" element={<Documents user={user} />} />
              <Route path="/reports" element={<Reports user={user} />} />
              <Route path="/vendors" element={<Vendors user={user} />} />
              <Route path="/settings" element={<BusinessSettings user={user} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <BottomNav />
          <NotificationTicker user={user} />
          <ChatAssistant isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

          {/* Floating Chat Button */}
          <button 
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-8 right-8 w-14 h-14 bg-accent rounded-full flex items-center justify-center shadow-lg shadow-accent/40 hover:scale-110 transition-transform z-50"
          >
            <div className="relative">
              <MessageSquare className="w-6 h-6 text-white" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-accent" />
            </div>
          </button>
        </div>
      </Router>
    </LanguageProvider>
  );
}

