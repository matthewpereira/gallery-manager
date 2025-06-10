import React from 'react';
import type { ImgurImage } from '../types/imgur';

interface ImageGridProps {
  images: ImgurImage[];
  onImageClick?: (image: ImgurImage) => void;
  onImageDelete?: (imageId: string) => void;
}

export const ImageGrid: React.FC<ImageGridProps> = ({ 
  images, 
  onImageClick,
  onImageDelete 
}) => {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
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
      <div className="text-center py-12 text-gray-500">
        No images found. Upload some images to Imgur to see them here!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {images.map((image) => (
        <div key={image.id} className="bg-white rounded-lg shadow-md overflow-hidden">
          <div 
            className="relative cursor-pointer group"
            onClick={() => onImageClick?.(image)}
          >
            <img
              src={image.link}
              alt={image.title || 'Imgur image'}
              className="w-full h-48 object-cover group-hover:opacity-90 transition-opacity"
              loading="lazy"
            />
            {image.animated && (
              <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                GIF
              </div>
            )}
          </div>
          
          <div className="p-3">
            <h3 className="font-medium text-sm mb-1 truncate">
              {image.title || 'Untitled'}
            </h3>
            
            <div className="text-xs text-gray-500 space-y-1">
              <div>{formatDate(image.datetime)}</div>
              <div>{image.width} × {image.height}</div>
              <div>{formatFileSize(image.size)}</div>
              <div>{image.views.toLocaleString()} views</div>
            </div>

            {onImageDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onImageDelete(image.id);
                }}
                className="mt-2 w-full bg-red-500 hover:bg-red-600 text-white text-xs py-1 px-2 rounded"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
