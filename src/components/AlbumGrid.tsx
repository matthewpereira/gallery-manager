import React from 'react';
import { Calendar, Eye, Lock, Users, Image as ImageIcon, Trash2 } from 'lucide-react';
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
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">No albums found</h3>
        <p className="text-sm text-center max-w-sm">
          Create some albums on Imgur to see them here! Albums help organize your images into collections.
        </p>
      </div>
    );
  }

  return (
    <div className="grid-gallery animate-fade-in">
      {albums.map((album) => (
        <div key={album.id} className="bg-card border border-border rounded-lg overflow-hidden card-hover animate-slide-up">
          <div 
            className="relative cursor-pointer group"
            onClick={() => onAlbumClick?.(album)}
          >
            {album.cover ? (
              <img
                src={`https://i.imgur.com/${album.cover}m.jpg`}
                alt={album.title || 'Album cover'}
                className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-48 bg-muted flex items-center justify-center">
                <ImageIcon className="w-12 h-12 text-muted-foreground" />
              </div>
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="absolute bottom-3 left-3 right-3">
              <div className="glassmorphism rounded-md px-2 py-1">
                <div className="flex items-center gap-1 text-white text-sm font-medium">
                  <ImageIcon className="w-3 h-3" />
                  {album.images_count} {album.images_count === 1 ? 'image' : 'images'}
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4">
            <h3 className="font-semibold text-lg mb-2 text-card-foreground line-clamp-2">
              {album.title || 'Untitled Album'}
            </h3>
            
            {album.description && (
              <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                {album.description}
              </p>
            )}
            
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-4">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(album.datetime)}
              </div>
              <div className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {album.views.toLocaleString()}
              </div>
              <div className="flex items-center gap-1">
                {album.privacy === 'public' ? (
                  <Users className="w-3 h-3 text-green-600" />
                ) : (
                  <Lock className="w-3 h-3 text-amber-600" />
                )}
                <span className="capitalize">{album.privacy}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAlbumClick?.(album);
                }}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-sm py-2 px-3 rounded-md transition-colors"
              >
                View Album
              </button>
              
              {onAlbumDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAlbumDelete(album.id);
                  }}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground p-2 rounded-md transition-colors"
                  title="Delete album"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
