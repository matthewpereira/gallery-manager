import React from 'react';
import type { ImgurAlbum } from '../types/imgur';

interface AlbumGridProps {
  albums: ImgurAlbum[];
  onAlbumClick?: (album: ImgurAlbum) => void;
  onAlbumDelete?: (albumId: string) => void;
}

export const AlbumGrid: React.FC<AlbumGridProps> = ({ 
  albums, 
  onAlbumClick,
  onAlbumDelete 
}) => {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  if (albums.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No albums found. Create some albums on Imgur to see them here!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {albums.map((album) => (
        <div key={album.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
          <div 
            className="relative cursor-pointer group"
            onClick={() => onAlbumClick?.(album)}
          >
            {album.cover ? (
              <img
                src={`https://i.imgur.com/${album.cover}m.jpg`}
                alt={album.title || 'Album cover'}
                className="w-full h-48 object-cover group-hover:opacity-90 transition-opacity"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <div className="text-white text-sm font-medium">
                {album.images_count} {album.images_count === 1 ? 'image' : 'images'}
              </div>
            </div>
          </div>
          
          <div className="p-4">
            <h3 className="font-semibold text-lg mb-2 line-clamp-2">
              {album.title || 'Untitled Album'}
            </h3>
            
            {album.description && (
              <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                {album.description}
              </p>
            )}
            
            <div className="text-xs text-gray-500 space-y-1 mb-3">
              <div>Created: {formatDate(album.datetime)}</div>
              <div>Views: {album.views.toLocaleString()}</div>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  album.privacy === 'public' ? 'bg-green-500' : 
                  album.privacy === 'hidden' ? 'bg-yellow-500' : 'bg-red-500'
                }`}></span>
                <span className="capitalize">{album.privacy}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAlbumClick?.(album);
                }}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs py-2 px-3 rounded"
              >
                View Album
              </button>
              
              {onAlbumDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAlbumDelete(album.id);
                  }}
                  className="bg-red-500 hover:bg-red-600 text-white text-xs py-2 px-3 rounded"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
