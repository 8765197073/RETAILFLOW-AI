export interface TaxConfig {
  id: string;
  name: string;
  rate: number;
  type: 'percentage' | 'fixed';
}

export interface Business {
  id?: string;
  name: string;
  gstNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  ownerUid: string;
  inventoryMethod: 'FIFO' | 'LIFO' | 'AVG' | 'AI_OPTIMIZED';
  taxRate: number; // Default/Legacy
  taxConfigs?: TaxConfig[];
  watermarkText?: string;
  showWatermark: boolean;
  logoUrl?: string;
  profilePicUrl?: string;
  fullName?: string;
  mission?: string;
  services?: string[];
}

export interface StockBatch {
  id: string;
  quantity: number;
  cost: number;
  receivedDate: string;
}

export interface Product {
  id?: string;
  name: string;
  sku?: string;
  category?: string;
  price: number;
  cost?: number;
  stockLevel: number;
  reorderLevel?: number;
  ownerUid: string;
  businessId: string;
  batches?: StockBatch[];
  imageUrl?: string;
  description?: string;
  unit: string;
  brand?: string;
  specifications?: Record<string, string>;
  taxConfigId?: string;
}

export interface Customer {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  ownerUid: string;
  businessId: string;
  totalSpent?: number;
  profilePicture?: string;
  purchaseHistory?: string[]; // Array of product IDs
  browsingHistory?: string[]; // Array of product categories or names
}

export interface InvoiceItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Invoice {
  id?: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  ownerUid: string;
  businessId: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: 'paid' | 'pending' | 'cancelled';
  taxConfigId?: string;
}

export interface BusinessDocument {
  id?: string;
  name: string;
  type: string;
  size: string;
  date: string;
  ownerUid: string;
  url: string;
}

export interface Vendor {
  id?: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
  rating?: number;
  ownerUid: string;
  businessId: string;
  performanceScore?: number;
  logoUrl?: string;
  // Holistic Performance Metrics (0-100)
  deliveryRate?: number;
  quoteAccuracy?: number;
  responsiveness?: number;
}

export interface VendorQuote {
  id?: string;
  vendorId: string;
  productId: string;
  price: number;
  minOrderQuantity: number;
  deliveryTimeDays: number;
  validUntil: string;
  date: string;
  ownerUid: string;
  businessId: string;
}
