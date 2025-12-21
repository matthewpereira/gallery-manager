import React from 'react';
import { Calendar, Eye, Monitor, FileText, Trash2, Image as ImageIcon, Play } from 'lucide-react';
import type { Image } from '../types/models';

interface ImageGridProps {
  images: Image[];
  onImageClick?: (image: Image) => void;
  onImageDelete?: (imageId: string) => void;
}

export const ImageGrid: React.FC<ImageGridProps> = ({ 
  images, 
  onImageClick,
  onImageDelete 
}) => {
  const formatDate = (date: Date | string | number) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">No images found</h3>
        <p className="text-sm text-center max-w-sm">
          Upload some images to Imgur to see them here! Your individual images will appear in this gallery.
        </p>
      </div>
    );
  }

  return (
    <div className="grid-gallery animate-fade-in">
      {images.map((image) => (
        <div key={image.id} className="bg-card border border-border rounded-lg overflow-hidden card-hover animate-slide-up">
          <div 
            className="relative cursor-pointer group"
            onClick={() => onImageClick?.(image)}
          >
            <img
              src={image.url}
              alt={image.title || 'Gallery image'}
              className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            {image.animated && (
              <div className="absolute top-3 right-3 glassmorphism rounded-md px-2 py-1">
                <div className="flex items-center gap-1 text-white text-xs font-medium">
                  <Play className="w-3 h-3" />
                  GIF
                </div>
              </div>
            )}
          </div>
          
          <div className="p-4">
            <h3 className="font-medium text-sm mb-2 text-card-foreground line-clamp-2">
              {image.title || 'Untitled'}
            </h3>
            
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(image.createdAt)}
              </div>
              <div className="flex items-center gap-1">
                <Monitor className="w-3 h-3" />
                {image.width} × {image.height}
              </div>
              <div className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {formatFileSize(image.size)}
              </div>
              {image.views !== undefined && (
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {image.views.toLocaleString()}
                </div>
              )}
            </div>

            {onImageDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onImageDelete(image.id);
                }}
                className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
