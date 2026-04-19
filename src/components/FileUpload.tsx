import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, UploadCloud, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileUploadProps {
  onUpload: (base64: string) => void;
  currentImage?: string;
  label?: string;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUpload, currentImage, label, className }) => {
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("File is too large. Please select an image smaller than 2MB.");
        return;
      }

      setIsUploading(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setPreview(base64String);
        onUpload(base64String);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
    onUpload('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1">{label}</label>}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative group cursor-pointer border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden transition-all hover:border-blue-400 hover:bg-blue-50/30",
          preview ? "aspect-video" : "py-8 flex flex-col items-center justify-center gap-2"
        )}
      >
        {preview ? (
          <>
            <img src={preview} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="p-2 bg-white text-gray-900 rounded-full hover:scale-110 transition-transform"
              >
                <Camera className="w-5 h-5" />
              </button>
              <button 
                type="button" 
                onClick={clearImage}
                className="p-2 bg-white text-red-600 rounded-full hover:scale-110 transition-transform"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 bg-gray-100 text-gray-400 rounded-xl group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
              {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-bold text-gray-600">Click to upload photo</p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 2MB</p>
            </div>
          </>
        )}
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />
      </div>
    </div>
  );
};
