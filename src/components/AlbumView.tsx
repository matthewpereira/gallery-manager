import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { GripVertical, Trash2, Edit2, Check, X, Calendar, Upload, Link } from 'lucide-react';
import type { AlbumDetail, Image, UpdateAlbumRequest } from '../types/models';
import { Lightbox } from './Lightbox';
import { useStorage } from '../contexts/StorageContext';

interface AlbumViewProps {
  album: AlbumDetail | null;
  images: Image[];
  onBack: () => void;
  onUpload: (files: File[], albumId: string) => void;
  onDeleteImage: (imageId: string) => void;
  onReorder: (images: Image[]) => void;
  onUpdateCaption: (imageId: string, updates: { title?: string; description?: string }) => void;
  onRenameAlbum?: (oldId: string, newId: string, onProgress?: (status: string, percent: number) => void) => Promise<void>;
  onUpdateAlbum?: (albumId: string, updates: UpdateAlbumRequest) => Promise<void>;
}

const AlbumView: React.FC<AlbumViewProps> = ({
  album,
  images,
  onBack,
  onUpload,
  onDeleteImage,
  onReorder,
  onUpdateCaption,
  onRenameAlbum,
  onUpdateAlbum,
}) => {
  const storage = useStorage();
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localImages, setLocalImages] = useState<Image[]>(images);
  const [isEditingId, setIsEditingId] = useState(false);
  const [newAlbumId, setNewAlbumId] = useState('');
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [albumDate, setAlbumDate] = useState<string>('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [albumTitle, setAlbumTitle] = useState<string>('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Lazy loading state
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [hasMoreImages, setHasMoreImages] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Local state for image metadata (allows instant UI updates while debouncing API calls)
  const [imageMetadata, setImageMetadata] = useState<Record<string, { title?: string; description?: string }>>({});
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Initialize album title when album changes
  useEffect(() => {
    if (album?.title) {
      setAlbumTitle(album.title);
    }
  }, [album?.title]);

  // Initialize album date when album changes
  useEffect(() => {
    if (album?.date) {
      // Format date as YYYY-MM-DD for input[type="date"] in local timezone
      const dateObj = album.date instanceof Date ? album.date : new Date(album.date);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      setAlbumDate(`${year}-${month}-${day}`);
    } else {
      setAlbumDate('');
    }
  }, [album?.date]);

  // Update local images when props change
  useEffect(() => {
    setLocalImages(images);
  }, [images]);

  // Initialize image metadata from images
  useEffect(() => {
    const metadata: Record<string, { title?: string; description?: string }> = {};
    images.forEach(img => {
      metadata[img.id] = {
        title: img.title || '',
        description: img.description || '',
      };
    });
    setImageMetadata(metadata);
  }, [images]);

  useEffect(() => {
    return () => {
      setError(null);
      // Clear all pending debounce timers on unmount
      Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Check if there are more images to load
  useEffect(() => {
    if (album) {
      const totalImages = album.imageCount || 0;
      const loadedImages = localImages.length;
      setHasMoreImages(loadedImages < totalImages);
    }
  }, [album, localImages.length]);

  // Load more images function
  const loadMoreImages = useCallback(async () => {
    if (!album || isLoadingImages || !hasMoreImages) return;

    setIsLoadingImages(true);
    try {
      const offset = localImages.length;
      const batchSize = 12; // Load 12 images at a time

      console.log(`[AlbumView] Loading images ${offset + 1}-${Math.min(offset + batchSize, album.imageCount)} of ${album.imageCount}...`);

      const batch = await storage.getAlbum(album.id, {
        imageOffset: offset,
        imageLimit: batchSize,
      });

      // Append batch to existing images
      setLocalImages(prev => [...prev, ...(batch.images || [])]);

      // Update metadata for new images
      const newMetadata: Record<string, { title?: string; description?: string }> = {};
      (batch.images || []).forEach(img => {
        newMetadata[img.id] = {
          title: img.title || '',
          description: img.description || '',
        };
      });
      setImageMetadata(prev => ({ ...prev, ...newMetadata }));
    } catch (error) {
      console.error('[AlbumView] Failed to load more images:', error);
    } finally {
      setIsLoadingImages(false);
    }
  }, [album, isLoadingImages, hasMoreImages, localImages.length, storage]);

  // Intersection observer for lazy loading
  useEffect(() => {
    if (!loadMoreRef.current || !hasMoreImages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMoreImages();
        }
      },
      {
        rootMargin: '200px', // Start loading 200px before reaching the sentinel
        threshold: 0.01,
      }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMoreImages, loadMoreImages]);

  // Drag and drop handlers for reordering
  const handleDragStart = (idx: number) => setDraggedIdx(idx);

  const handleDragOver = (idx: number) => {
    if (draggedIdx === null || draggedIdx === idx) return;
    const reordered = [...localImages];
    const [removed] = reordered.splice(draggedIdx, 1);
    reordered.splice(idx, 0, removed);
    setDraggedIdx(idx);
    // Update local state immediately for visual feedback
    setLocalImages(reordered);
  };

  const handleDragEnd = () => {
    if (draggedIdx !== null) {
      // Only call onReorder when user releases the mouse
      try {
        if (!album) {
          setError('Album is not available');
          return;
        }
        onReorder(localImages);
        setError(null);
      } catch (error) {
        setError('Failed to reorder images');
        console.error('Reorder failed:', error);
        // Revert to original order on error
        setLocalImages(images);
      }
    }
    setDraggedIdx(null);
  };

  // Dropzone for uploading
  const onDrop = useCallback((acceptedFiles: File[]) => {
    try {
      if (!album) {
        setError('Album is not available');
        return;
      }
      onUpload(acceptedFiles, album.id);
      setError(null);
    } catch (error) {
      setError('Failed to upload image');
      console.error('Upload failed:', error);
    }
  }, [album?.id, onUpload]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  // Image handlers
  const handleDeleteImage = useCallback((imageId: string) => {
    try {
      if (!album) {
        setError('Album is not available');
        return;
      }
      // Let parent handle the actual deletion (it will show confirmation)
      onDeleteImage(imageId);
      setError(null);
    } catch (error) {
      setError('Failed to delete image');
      console.error('Delete failed:', error);
    }
  }, [onDeleteImage, album?.id]);

  // Handle metadata updates with local state (instant UI feedback)
  const handleMetadataChange = useCallback((imageId: string, field: 'title' | 'description', value: string) => {
    // Update local state immediately for instant UI feedback
    setImageMetadata(prev => ({
      ...prev,
      [imageId]: {
        ...prev[imageId],
        [field]: value,
      },
    }));

    // Clear existing debounce timer for this image
    const timerKey = `${imageId}-${field}`;
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey]);
    }

    // Set new debounce timer to save after 1 second of inactivity
    debounceTimers.current[timerKey] = setTimeout(() => {
      try {
        if (!album) {
          setError('Album is not available');
          return;
        }
        onUpdateCaption(imageId, { [field]: value });
        setError(null);
        delete debounceTimers.current[timerKey];
      } catch (error) {
        setError(`Failed to update ${field}`);
        console.error(`${field} update failed:`, error);
      }
    }, 3000);
  }, [onUpdateCaption, album]);

  // Handle blur event to immediately save any pending changes
  const handleMetadataBlur = useCallback((imageId: string, field: 'title' | 'description') => {
    const timerKey = `${imageId}-${field}`;
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey]);
      delete debounceTimers.current[timerKey];

      // Save immediately on blur
      try {
        if (!album) {
          setError('Album is not available');
          return;
        }
        const value = imageMetadata[imageId]?.[field] || '';
        onUpdateCaption(imageId, { [field]: value });
        setError(null);
      } catch (error) {
        setError(`Failed to update ${field}`);
        console.error(`${field} update failed:`, error);
      }
    }
  }, [onUpdateCaption, album, imageMetadata]);

  const handleStartEdit = () => {
    if (album) {
      setNewAlbumId(album.id);
      setIsEditingId(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingId(false);
    setNewAlbumId('');
  };

  const validateAlbumId = (id: string): string | null => {
    if (id.length < 3 || id.length > 20) {
      return 'Album ID must be between 3 and 20 characters';
    }

    if (!/^[a-zA-Z0-9_]+$/.test(id)) {
      return 'Album ID can only contain letters, numbers, and underscores';
    }

    // Ensure custom IDs don't conflict with system prefixes
    if (id.startsWith('album_') || id.startsWith('img_')) {
      return 'Album ID cannot start with reserved prefixes (album_, img_)';
    }

    return null;
  };

  const handleSaveRename = async () => {
    if (!album || !onRenameAlbum || !newAlbumId.trim()) return;

    const trimmedId = newAlbumId.trim();

    if (trimmedId === album.id) {
      setIsEditingId(false);
      return;
    }

    // Validate the new ID format
    const validationError = validateAlbumId(trimmedId);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError(null);

      // Call rename (non-blocking - parent will handle navigation)
      // We don't await here because the parent navigates immediately
      onRenameAlbum(album.id, trimmedId, (status: string, percent: number) => {
        // Progress callback - parent component tracks this now
        console.log(`Rename progress: ${status} (${percent}%)`);
      });

      // No need to setIsEditingId(false) - we'll be navigated away
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to rename album ID. Make sure the new ID is unique.';
      setError(errorMessage);
      console.error('Rename failed:', error);
    }
  };

  // Date editing handlers
  const handleEditDate = () => {
    setIsEditingDate(true);
  };

  const handleSaveDate = async () => {
    if (!album || !onUpdateAlbum) return;

    try {
      setError(null);
      // Parse the date in local timezone by appending time
      const dateValue = albumDate ? new Date(albumDate + 'T12:00:00') : null;
      await onUpdateAlbum(album.id, { date: dateValue });
      setIsEditingDate(false);
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to update album date';
      setError(errorMessage);
      console.error('Date update failed:', error);
    }
  };

  const handleCancelDateEdit = () => {
    setIsEditingDate(false);
    // Reset to original date in local timezone
    if (album?.date) {
      const dateObj = album.date instanceof Date ? album.date : new Date(album.date);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      setAlbumDate(`${year}-${month}-${day}`);
    } else {
      setAlbumDate('');
    }
  };

  const handleClearDate = async () => {
    if (!album || !onUpdateAlbum) return;

    try {
      setError(null);
      await onUpdateAlbum(album.id, { date: null });
      setAlbumDate('');
      setIsEditingDate(false);
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to clear album date';
      setError(errorMessage);
      console.error('Date clear failed:', error);
    }
  };

  const formatDisplayDate = (date: Date | undefined): string => {
    if (!date) return 'Not set';
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Title editing handlers
  const handleEditTitle = () => {
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (!album || !onUpdateAlbum) return;

    const trimmedTitle = albumTitle.trim();
    if (!trimmedTitle) {
      setError('Album title cannot be empty');
      return;
    }

    if (trimmedTitle === album.title) {
      setIsEditingTitle(false);
      return;
    }

    try {
      setError(null);
      await onUpdateAlbum(album.id, { title: trimmedTitle });
      setIsEditingTitle(false);
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to update album title';
      setError(errorMessage);
      console.error('Title update failed:', error);
    }
  };

  const handleCancelTitleEdit = () => {
    setIsEditingTitle(false);
    // Reset to original title
    if (album?.title) {
      setAlbumTitle(album.title);
    }
  };

  return (
    <div className="p-6 relative">
      {error && (
        <div className="mb-4 p-4 rounded-md bg-red-50 text-red-600 border border-red-200 rounded-lg">
          {error}
        </div>
      )}
      <button onClick={onBack} className="mb-6 text-gray-600 hover:text-gray-900 transition-colors">← Back to Albums</button>

      {/* Album Header Section */}
      <div className="mb-8 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {/* Album Title with inline editing */}
        {onUpdateAlbum && isEditingTitle ? (
          <div className="mb-4 flex items-center gap-2">
            <input
              type="text"
              value={albumTitle}
              onChange={(e) => setAlbumTitle(e.target.value)}
              className="text-3xl font-light px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-gray-500 flex-1"
              placeholder="Enter album title"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') handleCancelTitleEdit();
              }}
              autoFocus
            />
            <button
              onClick={handleSaveTitle}
              className="p-2 rounded hover:bg-green-50 text-green-600"
              title="Save"
            >
              <Check className="w-5 h-5" />
            </button>
            <button
              onClick={handleCancelTitleEdit}
              className="p-2 rounded hover:bg-red-50 text-red-600"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-3xl font-light text-gray-900">{album?.title || 'Untitled Album'}</h2>
            {onUpdateAlbum && (
              <button
                onClick={handleEditTitle}
                className="p-1 rounded hover:bg-gray-100 text-gray-600"
                title="Edit album title"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {album?.description && (
          <p className="mb-4 text-gray-600">{album.description}</p>
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
          {/* Album ID */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Album ID</span>
            {isEditingId ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newAlbumId}
                  onChange={(e) => setNewAlbumId(e.target.value)}
                  className="px-2 py-1.5 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:border-gray-500 flex-1"
                  placeholder="Enter new album ID"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  autoFocus
                />
                <button
                  onClick={handleSaveRename}
                  className="p-1 rounded hover:bg-green-50 text-green-600"
                  title="Save"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1 rounded hover:bg-red-50 text-red-600"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <code className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
                  {album?.id}
                </code>
                {onRenameAlbum && (
                  <button
                    onClick={handleStartEdit}
                    className="p-1 rounded hover:bg-gray-100 text-gray-600"
                    title="Edit album ID"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Imgur ID (read-only) */}
          {album?.imgurId && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Link className="w-3 h-3" />
                Legacy Imgur ID
              </span>
              <code className="text-sm text-gray-700 font-mono bg-gray-50 px-3 py-1.5 rounded border border-gray-200 w-fit">
                {album.imgurId}
              </code>
            </div>
          )}

          {/* Album Date */}
          {onUpdateAlbum && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Album Date
              </span>
              {isEditingDate ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={albumDate}
                    onChange={(e) => setAlbumDate(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveDate();
                      if (e.key === 'Escape') handleCancelDateEdit();
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveDate}
                    className="p-1 rounded hover:bg-green-50 text-green-600"
                    title="Save"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelDateEdit}
                    className="p-1 rounded hover:bg-red-50 text-red-600"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  {albumDate && (
                    <button
                      onClick={handleClearDate}
                      className="px-2 py-1 text-xs rounded hover:bg-gray-100 text-gray-600"
                      title="Clear date"
                    >
                      Clear
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900 bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
                    {formatDisplayDate(album?.date)}
                  </span>
                  <button
                    onClick={handleEditDate}
                    className="p-1 rounded hover:bg-gray-100 text-gray-600"
                    title="Edit album date"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Upload Date (read-only) */}
          {album?.createdAt && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Upload className="w-3 h-3" />
                Uploaded
              </span>
              <span className="text-sm text-gray-700 bg-gray-50 px-3 py-1.5 rounded border border-gray-200 w-fit">
                {formatDisplayDate(album.createdAt)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Upload area */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 mb-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-primary bg-primary/10' : 'border-border'
        }`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the files here ...</p>
        ) : (
          <p>Drag & drop images here, or click to upload</p>
        )}
      </div>

      {/* Images grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {localImages.map((img, idx) => {
          const isVideo = img.mimeType?.startsWith('video/');
          const fileExt = img.mimeType?.split('/')[1]?.toUpperCase() || 'FILE';

          return (
            <div
              key={img.id}
              className="bg-card border rounded-lg p-2 flex flex-col relative group"
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => { e.preventDefault(); handleDragOver(idx); }}
              onDragEnd={handleDragEnd}
            >
              {/* Media display */}
              <div
                className="relative rounded mb-2 h-32 w-full overflow-hidden bg-gray-100 cursor-pointer"
                onClick={() => setLightboxIndex(idx)}
              >
                {isVideo ? (
                  <video
                    src={img.url}
                    className="w-full h-full object-cover"
                    controls
                    preload="metadata"
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <img
                    src={img.url}
                    alt={img.description || img.title || ''}
                    className="w-full h-full object-cover"
                  />
                )}

                {/* File type badge */}
                <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
                  {fileExt}
                </div>
              </div>

              <input
                type="text"
                className="text-xs p-1 border rounded mb-1"
                placeholder="Title..."
                value={imageMetadata[img.id]?.title || ''}
                onChange={(e) => handleMetadataChange(img.id, 'title', e.target.value)}
                onBlur={() => handleMetadataBlur(img.id, 'title')}
              />
              <input
                type="text"
                className="text-xs p-1 border rounded mb-2"
                placeholder="Description..."
                value={imageMetadata[img.id]?.description || ''}
                onChange={(e) => handleMetadataChange(img.id, 'description', e.target.value)}
                onBlur={() => handleMetadataBlur(img.id, 'description')}
              />
              <button
                className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                title="Delete image"
                onClick={() => handleDeleteImage(img.id)}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <GripVertical className="absolute bottom-2 right-2 w-4 h-4 text-muted-foreground cursor-move opacity-50" />
            </div>
          );
        })}
      </div>

      {/* Lazy loading sentinel and status */}
      {hasMoreImages && (
        <div ref={loadMoreRef} className="mt-6 text-center">
          {isLoadingImages ? (
            <div className="inline-flex items-center gap-2 text-sm text-gray-600">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
              <span>Loading more images...</span>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              {localImages.length} of {album?.imageCount || 0} images loaded
            </div>
          )}
        </div>
      )}

      {/* All images loaded message */}
      {album && !hasMoreImages && localImages.length > 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          All {album.imageCount} images loaded
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && localImages[lightboxIndex] && (
        <Lightbox
          image={localImages[lightboxIndex]}
          images={localImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrevious={lightboxIndex > 0 ? () => setLightboxIndex(lightboxIndex - 1) : undefined}
          onNext={lightboxIndex < localImages.length - 1 ? () => setLightboxIndex(lightboxIndex + 1) : undefined}
        />
      )}
    </div>
  );
};

export default AlbumView;