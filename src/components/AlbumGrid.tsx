import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Trash2, Download, Link, Calendar, Upload, Check } from 'lucide-react';
import type { Album } from '../types/models';
import { useStorage } from '../contexts/StorageContext';

interface AlbumGridProps {
  albums: Album[];
  onAlbumClick?: (album: Album) => void;
  onAlbumDelete?: (albumId: string) => void;
  onAlbumDownload?: (albumId: string) => void;
  albumsInProgress?: Set<string>;
}

// Global cache for loaded cover URLs (shared across all album cards)
const coverUrlCache = new Map<string, string>();
// Global set to track which albums we've attempted to load (prevents duplicate requests)
const loadAttemptedSet = new Set<string>();
// Global set to track which albums are currently loading (prevents concurrent requests)
const currentlyLoadingSet = new Set<string>();

/**
 * AlbumCard - Individual album card with lazy-loaded cover image
 */
const AlbumCard: React.FC<{
  album: Album;
  isInProgress: boolean;
  isCopied: boolean;
  onAlbumClick?: (album: Album) => void;
  onAlbumDelete?: (albumId: string) => void;
  onAlbumDownload?: (albumId: string) => void;
  onCopyLink: (album: Album, e: React.MouseEvent) => void;
}> = ({ album, isInProgress, isCopied, onAlbumClick, onAlbumDelete, onAlbumDownload, onCopyLink }) => {
  const storage = useStorage();
  const [coverUrl, setCoverUrl] = useState<string | undefined>(() => {
    // Check cache first, then album data
    return coverUrlCache.get(album.id) || album.coverImageUrl;
  });
  const [isLoading, setIsLoading] = useState(!coverUrl && !loadAttemptedSet.has(album.id));
  const cardRef = useRef<HTMLDivElement>(null);

  // Lazy load cover image when card becomes visible
  useEffect(() => {
    // If we already have a cover URL, no need to load
    if (coverUrl) {
      setIsLoading(false);
      return;
    }

    // If we already attempted to load, don't try again
    if (loadAttemptedSet.has(album.id)) {
      setIsLoading(false);
      return;
    }

    // If album has no cover image ID, nothing to load
    if (!album.metadata?.coverImageId) {
      setIsLoading(false);
      loadAttemptedSet.add(album.id);
      return;
    }

    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;

        // Only proceed if:
        // 1. Element is intersecting
        // 2. We don't have the URL yet
        // 3. We haven't attempted to load
        // 4. We're not currently loading it
        if (entry.isIntersecting &&
            !coverUrlCache.has(album.id) &&
            !loadAttemptedSet.has(album.id) &&
            !currentlyLoadingSet.has(album.id)) {

          // Mark as loading and attempted
          loadAttemptedSet.add(album.id);
          currentlyLoadingSet.add(album.id);

          try {
            // Load the album with just the cover image
            const albumDetails = await storage.getAlbum(album.id, { imageLimit: 1 });
            if (albumDetails.coverImageUrl) {
              setCoverUrl(albumDetails.coverImageUrl);
              // Cache the URL so we don't refetch it
              coverUrlCache.set(album.id, albumDetails.coverImageUrl);
            }
          } catch (error) {
            console.error(`Failed to load cover for album ${album.id}:`, error);
          } finally {
            setIsLoading(false);
            currentlyLoadingSet.delete(album.id);
          }
        }
      },
      {
        rootMargin: '50px', // Start loading 50px before the card enters viewport
        threshold: 0.01,
      }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current);
      }
    };
  }, [album.id, album.metadata?.coverImageId, coverUrl, storage]);

  const formatDate = (date: Date | string | number) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString();
  };

  return (
    <div
      ref={cardRef}
      className={`group animate-slide-up ${isInProgress ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}
      onClick={() => !isInProgress && onAlbumClick?.(album)}
    >
      {/* Image */}
      <div className="relative overflow-hidden rounded-2xl mb-3 bg-gray-100">
        {isLoading ? (
          <div className="w-full aspect-[4/3] flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-400"></div>
          </div>
        ) : coverUrl ? (
          <img
            src={coverUrl}
            alt={album.title || 'Album cover'}
            className="w-full aspect-[4/3] object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-[4/3] flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-gray-300" />
          </div>
        )}

        {/* Loading overlay for albums in progress */}
        {isInProgress && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900"></div>
              <span className="text-sm font-medium text-gray-700">Processing...</span>
            </div>
          </div>
        )}

        {/* Action buttons overlay */}
        <div className={`absolute bottom-3 right-3 flex gap-2 transition-opacity ${isInProgress ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
          {/* Copy Link Button */}
          <button
            onClick={(e) => onCopyLink(album, e)}
            className="bg-white/90 backdrop-blur-sm hover:bg-white p-2.5 rounded-xl transition-all shadow-lg"
            title={isCopied ? 'Link copied!' : 'Copy link'}
          >
            {isCopied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Link className="w-4 h-4 text-gray-700" />
            )}
          </button>

          {onAlbumDownload && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAlbumDownload(album.id);
              }}
              className="bg-white/90 backdrop-blur-sm hover:bg-white p-2.5 rounded-xl transition-all shadow-lg"
              title="Download album"
            >
              <Download className="w-4 h-4 text-gray-700" />
            </button>
          )}

          {onAlbumDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAlbumDelete(album.id);
              }}
              className="bg-white/90 backdrop-blur-sm hover:bg-white p-2.5 rounded-xl transition-all shadow-lg"
              title="Delete album"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          )}
        </div>
      </div>

      {/* Hover-revealed metadata */}
      <div className="relative z-40">
        <div className="z-40 transition-all duration-300 ease-in-out h-0 -t-50 opacity-0 group-hover:opacity-100">
          <div className="bg-white relative top-1 space-y-2 min-h-16">
            {/* Uploaded Date */}
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Upload className="w-3 h-3" />
              <span className="font-medium">Uploaded:</span>
              <span>{formatDate(album.createdAt)}</span>
            </div>

            {/* Image Count */}
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <ImageIcon className="w-3 h-3" />
              <span className="font-medium">Images:</span>
              <span>{album.imageCount} {album.imageCount === 1 ? 'image' : 'images'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content - Title and Date (always visible) */}
      <div className="space-y-1">
        <h3 className="font-medium text-lg text-gray-900 line-clamp-2 leading-snug group-hover:text-gray-600 transition-colors">
          {album.title || 'Untitled Album'}
        </h3>

        {/* Album Date (if set) or Creation Date (fallback) */}
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Calendar className="w-3.5 h-3.5" />
          <span>{formatDate(album.date || album.createdAt)}</span>
        </div>
      </div>
    </div>
  );
};

export const AlbumGrid: React.FC<AlbumGridProps> = ({
  albums,
  onAlbumClick,
  onAlbumDelete,
  onAlbumDownload,
  albumsInProgress = new Set()
}) => {
  const [copiedAlbumId, setCopiedAlbumId] = useState<string | null>(null);

  const handleCopyLink = (album: Album, e: React.MouseEvent) => {
    e.stopPropagation();
    // Use imgurId if available (for legacy support), otherwise use the album ID
    const shortcode = album.imgurId || album.id;
    const url = `https://matthewpereira.com/a/${shortcode}`;

    navigator.clipboard.writeText(url).then(() => {
      setCopiedAlbumId(album.id);
      setTimeout(() => setCopiedAlbumId(null), 2000);
    }).catch(err => {
      console.error('Failed to copy link:', err);
    });
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 animate-fade-in">
      {albums.map((album) => {
        const isInProgress = albumsInProgress.has(album.id);
        const isCopied = copiedAlbumId === album.id;

        return (
          <AlbumCard
            key={album.id}
            album={album}
            isInProgress={isInProgress}
            isCopied={isCopied}
            onAlbumClick={onAlbumClick}
            onAlbumDelete={onAlbumDelete}
            onAlbumDownload={onAlbumDownload}
            onCopyLink={handleCopyLink}
          />
        );
      })}
    </div>
  );
};
