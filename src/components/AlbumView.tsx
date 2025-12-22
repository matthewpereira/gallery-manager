import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { GripVertical, Trash2 } from 'lucide-react';
import type { AlbumDetail, Image } from '../types/models';
import { useStorage } from '../contexts/StorageContext';

interface AlbumViewProps {
  album: AlbumDetail | null;
  images: Image[];
  onBack: () => void;
  onUpload: (files: File[], albumId: string) => void;
  onDeleteImage: (imageId: string) => void;
  onReorder: (images: Image[]) => void;
  onUpdateCaption: (imageId: string, caption: string) => void;
}

const AlbumView: React.FC<AlbumViewProps> = ({
  album,
  images,
  onBack,
  onUpload,
  onDeleteImage,
  onReorder,
  onUpdateCaption,
}) => {
  const storage = useStorage();
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localImages, setLocalImages] = useState<Image[]>(images);

  // Update local images when props change
  useEffect(() => {
    setLocalImages(images);
  }, [images]);

  useEffect(() => {
    return () => {
      setError(null);
    };
  }, []);

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
  const handleDeleteImage = useCallback(async (imageId: string) => {
    try {
      if (!album) {
        setError('Album is not available');
        return;
      }
      await storage.deleteImage(imageId);
      onDeleteImage(imageId);
      setError(null);
    } catch (error) {
      setError('Failed to delete image');
      console.error('Delete failed:', error);
    }
  }, [storage, onDeleteImage, album?.id]);

  const handleCaptionUpdate = useCallback((imageId: string, caption: string) => {
    try {
      if (!album) {
        setError('Album is not available');
        return;
      }
      onUpdateCaption(imageId, caption);
      setError(null);
    } catch (error) {
      setError('Failed to update caption');
      console.error('Caption update failed:', error);
    }
  }, [onUpdateCaption, album?.id]);

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 p-4 rounded-md bg-destructive/10 text-destructive">
          {error}
        </div>
      )}
      <button onClick={onBack} className="mb-4 text-primary underline">← Back to Albums</button>
      <h2 className="text-2xl font-bold mb-2">{album?.title || 'Untitled Album'}</h2>
      <p className="mb-4 text-muted-foreground">{album?.description}</p>

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
        {localImages.map((img, idx) => (
          <div
            key={img.id}
            className="bg-card border rounded-lg p-2 flex flex-col relative group"
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => { e.preventDefault(); handleDragOver(idx); }}
            onDragEnd={handleDragEnd}
          >
            <img src={img.url} alt={img.description || ''} className="rounded mb-2 object-cover h-32 w-full" />
            <input
              type="text"
              className="text-xs p-1 border rounded mb-2"
              placeholder="Add a caption..."
              value={img.description || ''}
              onChange={(e) => handleCaptionUpdate(img.id, e.target.value)}
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
        ))}
      </div>
    </div>
  );
};

export default AlbumView;