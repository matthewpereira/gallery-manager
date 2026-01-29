import { Routes, Route, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut, Image as ImageIcon, Plus, ArrowLeft, ChevronLeft, ChevronRight, Download, Search, RefreshCw, X } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from './auth/AuthProvider';
import { Login } from './pages/Login';
import { AlbumGrid } from './components/AlbumGrid';
import { CreateAlbumModal } from './components/CreateAlbumModal';
import AlbumView from './components/AlbumView';
import { useStorage, useStorageProvider } from './contexts/StorageContext';
import { DownloadService } from './services/download';
import { DownloadProgressModal } from './components/DownloadProgressModal';
import type { Album, AlbumDetail, Image, UpdateAlbumRequest } from './types/models';
import type { DownloadProgress } from './types/download';

// A wrapper component that redirects to the login page if not authenticated
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Only redirect if we're sure auth check is done and user is not authenticated
    if (!isLoading && !isAuthenticated) {
      // Don't redirect if we're in the middle of a callback (code= or access_token in URL)
      const isCallback = location.search.includes('code=') || location.hash.includes('access_token=');

      if (!isCallback && location.pathname !== '/login') {
        const returnTo = location.pathname + location.search;
        navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      }
    }
  }, [isAuthenticated, isLoading, location.pathname, location.search, location.hash, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will be redirected by the useEffect
  }

  return children;
};

function Dashboard() {
  const { user, getToken, logout } = useAuth();
  const storage = useStorage();
  const storageProvider = useStorageProvider();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allAlbums, setAllAlbums] = useState<Album[]>(() => {
    // Load cached albums from localStorage on mount
    try {
      const cached = localStorage.getItem('gallery-albums-cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        // Deserialize dates
        return parsed.map((album: any) => ({
          ...album,
          createdAt: new Date(album.createdAt),
          date: album.date ? new Date(album.date) : undefined,
        }));
      }
    } catch (error) {
      console.error('Failed to load cached albums:', error);
    }
    return [];
  });
  const [images, setImages] = useState<Image[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateAlbumModalOpen, setIsCreateAlbumModalOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadService] = useState(() => new DownloadService(storage));
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'date' | 'imageCount'>('date');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track which albums are currently being modified (rename/delete operations)
  const [albumsInProgress, setAlbumsInProgress] = useState<Set<string>>(new Set());

  // Track active rename operation for notification banner
  const [renameOperation, setRenameOperation] = useState<{
    oldId: string;
    newId: string;
    oldTitle: string;
    status: string;
    percent: number;
  } | null>(null);

  // Get current page from URL, default to 1 (pages are 0-indexed internally but we show 1-indexed)
  const currentPage = Math.max(0, parseInt(searchParams.get('page') || '1', 10) - 1);

  // Determine if we're viewing an album based on the URL
  const albumIdFromUrl = location.pathname.startsWith('/album/')
    ? location.pathname.split('/album/')[1]
    : null;

  // Cache albums to localStorage whenever they change
  useEffect(() => {
    if (allAlbums.length > 0) {
      try {
        localStorage.setItem('gallery-albums-cache', JSON.stringify(allAlbums));
        console.log('[App] Cached', allAlbums.length, 'albums to localStorage');
      } catch (error) {
        console.error('Failed to cache albums:', error);
      }
    }
  }, [allAlbums]);

  // Fetch albums from server
  const fetchAlbums = async (force = false) => {
    try {
      console.log('[App] fetchAlbums - Starting', { user: !!user, storageProvider, force });
      setIsRefreshing(true);
      setError(null);

      // Wait for user to be authenticated before fetching
      if (!user) {
        console.log('[App] fetchAlbums - No user, skipping');
        return;
      }

      // For R2/Worker, add a small delay to ensure authentication status has propagated
      // This fixes a race condition where the effect runs before StorageContext sets auth status
      if (storageProvider === 'r2' || storageProvider === 'worker') {
        console.log('[App] fetchAlbums - Waiting for R2/Worker auth to propagate');
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Only require Auth0 token for Imgur, not for R2
      if (storageProvider === 'imgur') {
        const token = await getToken();
        if (!token) {
          console.log('[App] fetchAlbums - No Imgur token, skipping');
          return;
        }
      }

      // Load ALL albums (metadata only - no cover URLs)
      console.log('[App] fetchAlbums - Fetching all albums from server');
      const fetchedAlbums = await storage.listAlbums();
      console.log('[App] fetchAlbums - Fetched', fetchedAlbums.length, 'albums');
      setAllAlbums(fetchedAlbums);
    } catch (error) {
      console.error('[App] fetchAlbums - Error:', error);
      setError('Failed to load albums. Please try again.');
    } finally {
      console.log('[App] fetchAlbums - Done');
      setIsRefreshing(false);
    }
  };

  // Load albums on mount (only if cache is empty or force refresh)
  useEffect(() => {
    const loadAlbums = async () => {
      setLoading(true);

      // If we have cached albums, just use those and finish loading
      if (allAlbums.length > 0) {
        console.log('[App] Using', allAlbums.length, 'cached albums');
        setLoading(false);
        return;
      }

      // No cache, fetch from server
      await fetchAlbums(false);
      setLoading(false);
    };

    loadAlbums();
  }, [getToken, storage, storageProvider, user]);

  // Client-side filtering, sorting, and pagination
  const { albums, totalAlbums, totalPages } = useMemo(() => {
    // 1. Filter albums by search text
    let filtered = allAlbums;
    if (filterText.trim()) {
      const searchLower = filterText.toLowerCase();
      filtered = allAlbums.filter(album =>
        album.title?.toLowerCase().includes(searchLower) ||
        album.description?.toLowerCase().includes(searchLower)
      );
    }

    // 2. Sort albums
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'date':
          // Use album date if available, otherwise use creation date
          const dateA = a.date || a.createdAt;
          const dateB = b.date || b.createdAt;
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        case 'imageCount':
          return b.imageCount - a.imageCount;
        default:
          return 0;
      }
    });

    // 3. Paginate
    const pageSize = 50;
    const start = currentPage * pageSize;
    const paginated = sorted.slice(start, start + pageSize);

    return {
      albums: paginated,
      totalAlbums: sorted.length,
      totalPages: Math.ceil(sorted.length / pageSize),
    };
  }, [allAlbums, filterText, sortBy, currentPage]);

  // Handle legacy Imgur bookmark URLs (?shortcode or /a/shortcode)
  useEffect(() => {
    const handleLegacyUrl = async () => {
      if (!storage.resolveImgurId) return;

      // Check for query parameter format: ?shortcode
      const shortcode = searchParams.get('') || searchParams.get('0');

      // Check for /a/shortcode format
      const pathMatch = location.pathname.match(/^\/a\/([a-zA-Z0-9]+)$/);
      const pathShortcode = pathMatch ? pathMatch[1] : null;

      const imgurId = shortcode || pathShortcode;

      if (imgurId && imgurId.length <= 7) { // Imgur IDs are typically 5-7 characters
        try {
          console.log(`[App] Attempting to resolve legacy Imgur ID: ${imgurId}`);
          const resolvedAlbumId = await storage.resolveImgurId(imgurId);

          if (resolvedAlbumId) {
            console.log(`[App] Redirecting from Imgur ID "${imgurId}" to album "${resolvedAlbumId}"`);
            navigate(`/album/${resolvedAlbumId}`, { replace: true });
          }
        } catch (error) {
          console.error(`Failed to resolve Imgur ID "${imgurId}":`, error);
        }
      }
    };

    handleLegacyUrl();
  }, [location.pathname, searchParams, storage, navigate]);

  // Load album when URL contains album ID
  useEffect(() => {
    const loadAlbum = async () => {
      if (albumIdFromUrl) {
        try {
          setLoading(true);
          // Load album metadata WITHOUT any images (imageLimit: 0)
          // This allows instant album details (title, date) without bandwidth cost
          const albumDetails = await storage.getAlbum(albumIdFromUrl, { imageLimit: 0 });
          setSelectedAlbum(albumDetails);
          setImages([]); // Start with empty images - they'll load on demand in AlbumView
          setLoading(false);

          console.log(`[App] Loaded album "${albumDetails.title}" (${albumDetails.imageCount} images) - images will lazy load on scroll`);
        } catch (error) {
          console.error('Failed to load album:', error);
          setError('Failed to load album. Please try again.');
          // If album fails to load, redirect to home
          navigate('/');
          setLoading(false);
        }
      } else {
        // Clear album when not viewing one
        setSelectedAlbum(null);
        setImages([]);
      }
    };

    loadAlbum();
  }, [albumIdFromUrl, storage, navigate]);

  // Handle album selection - navigate to album URL
  const handleAlbumClick = async (album: Album) => {
    navigate(`/album/${album.id}`);
  };

  // Handle album deletion
  const handleAlbumDelete = async (albumId: string) => {
    if (!window.confirm('Are you sure you want to delete this album?')) return;

    // Mark album as in-progress
    setAlbumsInProgress(prev => new Set(prev).add(albumId));

    try {
      // Run delete in background - don't block UI
      await storage.deleteAlbum(albumId);

      // Remove from allAlbums list
      setAllAlbums(allAlbums.filter((album: Album) => album.id !== albumId));

      // If we're viewing this album, navigate back to home
      if (albumIdFromUrl === albumId) {
        navigate('/');
      }
    } catch (error) {
      console.error('Failed to delete album:', error);
      setError('Failed to delete album. Please try again.');
    } finally {
      // Remove from in-progress set
      setAlbumsInProgress(prev => {
        const next = new Set(prev);
        next.delete(albumId);
        return next;
      });
    }
  };

  // Handle album creation
  const handleCreateAlbum = async (data: { title: string; description?: string; privacy: 'public' | 'private' | 'unlisted'; customId?: string }) => {
    try {
      const newAlbum = await storage.createAlbum(data);
      setAllAlbums([newAlbum, ...allAlbums]);
    } catch (error) {
      console.error('Failed to create album:', error);
      throw error; // Re-throw so the modal can handle it
    }
  };

  // Handle image upload to album
  const handleImageUpload = async (files: File[], albumId: string) => {
    try {
      setLoading(true);
      for (const file of files) {
        await storage.uploadImage(file, { albumId });
      }
      // Small delay to let Imgur's servers propagate the changes
      await new Promise(resolve => setTimeout(resolve, 500));

      // Refresh album after upload to show new images
      if (selectedAlbum) {
        const updatedAlbum = await storage.getAlbum(albumId);
        setSelectedAlbum(updatedAlbum);
        setImages(updatedAlbum.images || []);
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      setError('Failed to upload image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle image deletion
  const handleImageDelete = async (imageId: string) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    try {
      setLoading(true);
      await storage.deleteImage(imageId);
      setImages(images.filter(img => img.id !== imageId));
    } catch (error) {
      console.error('Failed to delete image:', error);
      setError('Failed to delete image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle image reordering
  const handleImageReorder = async (reorderedImages: Image[]) => {
    if (!selectedAlbum) return;

    // Update local state immediately for a responsive UI
    setImages(reorderedImages);

    try {
      // Persist the new order to Imgur
      const imageIds = reorderedImages.map(img => img.id);
      await storage.updateAlbum(selectedAlbum.id, { imageIds });
      console.log('Image order updated successfully');
    } catch (error) {
      console.error('Failed to update image order:', error);
      setError('Failed to save image order. Please try again.');
      // Revert to original order on error
      if (selectedAlbum) {
        const album = await storage.getAlbum(selectedAlbum.id);
        setImages(album.images || []);
      }
    }
  };

  // Handle image metadata update (title and/or description)
  const handleCaptionUpdate = async (imageId: string, updates: { title?: string; description?: string }) => {
    try {
      // Don't update any state - AlbumView manages its own local state for images
      // Updating parent state here causes scroll jumps and image flickering
      await storage.updateImage(imageId, updates);
    } catch (error) {
      console.error('Failed to update image metadata:', error);
      setError('Failed to update image metadata. Please try again.');
    }
  };

  // Handle back to albums view - navigate to home
  const handleBackToAlbums = () => {
    navigate('/');
  };

  // Handle album rename
  const handleAlbumRename = async (oldId: string, newId: string, onProgress?: (status: string, percent: number) => void) => {
    if (!storage.renameAlbum) {
      throw new Error('Rename operation not supported by this storage provider');
    }

    // Get the album title before we start
    const oldTitle = selectedAlbum?.title || 'Album';

    // Set up rename operation tracking
    setRenameOperation({
      oldId,
      newId,
      oldTitle,
      status: 'Starting rename...',
      percent: 0,
    });

    // Mark album as in-progress (use both old and new IDs)
    setAlbumsInProgress(prev => new Set(prev).add(oldId).add(newId));

    // Navigate back to album listing immediately (non-blocking)
    navigate('/', { replace: false });

    // Run the rename operation in the background
    (async () => {
      try {
        // Progress callback that updates both the notification banner and the original callback
        const progressCallback = (status: string, percent: number) => {
          setRenameOperation(prev => prev ? { ...prev, status, percent } : null);
          onProgress?.(status, percent);
        };

        // Run rename with progress callback
        let renamedAlbum: Album | undefined;
        if (storage.renameAlbum) {
          renamedAlbum = await storage.renameAlbum(oldId, newId, progressCallback);
        } else {
          throw new Error('Rename operation not supported');
        }

        // Small delay to ensure R2 metadata updates have propagated
        await new Promise(resolve => setTimeout(resolve, 500));

        // Update the local cache instead of refetching everything
        setAllAlbums(prevAlbums =>
          prevAlbums.map(album =>
            album.id === oldId ? { ...album, ...renamedAlbum, id: newId } : album
          )
        );

        // Clear the rename operation (success)
        setRenameOperation(null);

        // Show success notification briefly
        setRenameOperation({
          oldId,
          newId,
          oldTitle,
          status: `Successfully renamed to "${newId}"`,
          percent: 100,
        });

        // Clear success notification after 3 seconds
        setTimeout(() => {
          setRenameOperation(null);
        }, 3000);

      } catch (error: any) {
        console.error('Failed to rename album:', error);

        // Show error notification
        setRenameOperation({
          oldId,
          newId,
          oldTitle,
          status: `Failed to rename: ${error.message || 'Unknown error'}`,
          percent: 0,
        });

        // Clear error notification after 5 seconds
        setTimeout(() => {
          setRenameOperation(null);
        }, 5000);
      } finally {
        // Remove from in-progress set
        setAlbumsInProgress(prev => {
          const next = new Set(prev);
          next.delete(oldId);
          next.delete(newId);
          return next;
        });
      }
    })();
  };

  // Handle album update (for date, title, description, etc.)
  const handleAlbumUpdate = async (albumId: string, updates: UpdateAlbumRequest) => {
    try {
      // Update the album
      const updatedAlbum = await storage.updateAlbum(albumId, updates);

      // Update selected album if it's currently being viewed
      if (selectedAlbum && selectedAlbum.id === albumId) {
        setSelectedAlbum({
          ...selectedAlbum,
          ...updatedAlbum,
          images: selectedAlbum.images, // Preserve images array
        });
      }

      // Update the local cache instead of refetching everything
      setAllAlbums(prevAlbums =>
        prevAlbums.map(album =>
          album.id === albumId ? { ...album, ...updatedAlbum } : album
        )
      );
    } catch (error: any) {
      console.error('Failed to update album:', error);
      throw error; // Re-throw to let AlbumView handle the error display
    }
  };

  // Handle album download
  const handleAlbumDownload = async (albumId: string) => {
    try {
      setDownloadProgress({
        stage: 'preparing',
        albumsProcessed: 0,
        totalAlbums: 0,
        imagesProcessed: 0,
        totalImages: 0,
        percentage: 0,
      });

      await downloadService.downloadAlbums({
        albumIds: [albumId],
        includeMetadata: true,
        progressCallback: setDownloadProgress,
      });
    } catch (error) {
      console.error('Failed to download album:', error);
    }
  };

  // Handle download all albums
  const handleDownloadAll = async () => {
    if (!window.confirm('This will download all your albums. Depending on the number of images, this may take a while. Continue?')) {
      return;
    }

    try {
      setDownloadProgress({
        stage: 'preparing',
        albumsProcessed: 0,
        totalAlbums: 0,
        imagesProcessed: 0,
        totalImages: 0,
        percentage: 0,
      });

      await downloadService.downloadAlbums({
        includeMetadata: true,
        progressCallback: setDownloadProgress,
      });
    } catch (error) {
      console.error('Failed to download albums:', error);
    }
  };

  // Handle pagination - update URL search params
  const handleNextPage = () => {
    if (currentPage + 1 < totalPages) {
      setSearchParams({ page: String(currentPage + 2) }); // +2 because we show 1-indexed pages
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      setSearchParams({ page: String(currentPage) }); // currentPage is already decremented by 1
    }
  };

  const handlePageClick = (pageNumber: number) => {
    setSearchParams({ page: String(pageNumber + 1) }); // +1 because we show 1-indexed pages
  };

  // Error state
  if (error && !loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => {
              setError(null);
              fetchAlbums(true);
            }}
            className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
          <div className="flex items-center space-x-8">
            <h1 className="text-2xl font-light text-gray-900 tracking-tight">Gallery Manager</h1>
            <nav className="flex items-center space-x-1">
              {albumIdFromUrl && selectedAlbum && (
                <button
                  onClick={handleBackToAlbums}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Albums</span>
                </button>
              )}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            {user?.picture && (
              <img
                src={user.picture}
                alt={user.name || 'User'}
                className="h-9 w-9 rounded-full"
              />
            )}
            {storageProvider === 'imgur' && (
              <button
                onClick={() => {
                  const redirectUri = (import.meta.env.VITE_IMGUR_REDIRECT_URI || window.location.origin).replace(/\/$/, '');
                  console.log('Imgur redirect URI:', redirectUri);
                  const authUrl = `https://api.imgur.com/oauth2/authorize?client_id=${import.meta.env.VITE_IMGUR_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}`;
                  console.log('Redirecting to Imgur OAuth:', authUrl);
                  window.location.href = authUrl;
                }}
                className="flex items-center space-x-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                <ImageIcon className="h-4 w-4" />
                <span>Connect Imgur</span>
              </button>
            )}
            {storageProvider === 'r2' && (
              <div className="flex items-center space-x-2 rounded-xl bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700">
                <ImageIcon className="h-4 w-4" />
                <span>Cloudflare R2</span>
              </div>
            )}
            <button
              onClick={() => logout()}
              className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Rename Operation Notification Banner */}
      {renameOperation && (
        <div className="bg-blue-50 border-b border-blue-200">
          <div className="mx-auto max-w-7xl px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900">
                  Renaming "{renameOperation.oldTitle}" from "{renameOperation.oldId}" to "{renameOperation.newId}"
                </p>
                <p className="text-xs text-blue-700 mt-0.5">{renameOperation.status}</p>
              </div>
              {renameOperation.percent > 0 && renameOperation.percent < 100 && (
                <div className="flex-shrink-0">
                  <span className="text-sm font-medium text-blue-900">{renameOperation.percent}%</span>
                </div>
              )}
            </div>
            {/* Progress bar */}
            {renameOperation.percent > 0 && renameOperation.percent < 100 && (
              <div className="mt-2 w-full bg-blue-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${renameOperation.percent}%` }}
                ></div>
              </div>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        {!albumIdFromUrl ? (
          <div>
            <div className="mb-12 flex items-center justify-between">
              <h2 className="text-xl font-light text-gray-900 tracking-tight">Your Albums</h2>
              <div className="flex items-center gap-3">
                {(albums.length > 0 || loading || allAlbums.length > 0) && (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Filter albums..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="w-64 rounded-xl border border-gray-200 pl-10 pr-10 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-0 transition-colors"
                        disabled={loading}
                      />
                      {filterText && (
                        <button
                          onClick={() => setFilterText('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                          aria-label="Clear filter"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => fetchAlbums(true)}
                      disabled={isRefreshing}
                      className="inline-flex items-center rounded-xl bg-white border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Refresh albums"
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                      Refresh
                    </button>
                    <button
                      onClick={handleDownloadAll}
                      className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                    >
                      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                      Download All
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsCreateAlbumModalOpen(true)}
                  className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  New Album
                </button>
              </div>
            </div>

            {/* Show skeleton while loading initial albums */}
            {loading && albums.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-gray-200 rounded-2xl mb-3 w-full aspect-[4/3]"></div>
                    <div className="space-y-2">
                      <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : albums.length > 0 ? (
              <>
                <AlbumGrid
                  albums={albums}
                  onAlbumClick={handleAlbumClick}
                  onAlbumDelete={handleAlbumDelete}
                  onAlbumDownload={handleAlbumDownload}
                  albumsInProgress={albumsInProgress}
                />

                {/* Pagination Controls */}
                <div className="mt-6 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg">
                  <div className="flex flex-1 justify-between sm:hidden">
                    <button
                      onClick={handlePreviousPage}
                      disabled={currentPage === 0}
                      className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={handleNextPage}
                      disabled={currentPage + 1 >= totalPages}
                      className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{albums.length}</span> of{' '}
                        <span className="font-medium">{totalAlbums}</span> albums
                        {filterText && ' (filtered)'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Sort control */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">Sort by:</span>
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as 'title' | 'date' | 'imageCount')}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none focus:ring-0 transition-colors"
                        >
                          <option value="date">Most recent</option>
                          <option value="title">Title</option>
                          <option value="imageCount">Most images</option>
                        </select>
                      </div>

                      {/* Pagination controls */}
                      <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                        <button
                          onClick={handlePreviousPage}
                          disabled={currentPage === 0}
                          className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Previous</span>
                          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>

                        {/* Page numbers */}
                        {Array.from({ length: totalPages }, (_, i) => i).map(pageNum => {
                          const isCurrentPage = pageNum === currentPage;
                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePageClick(pageNum)}
                              className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-offset-0 ${
                                isCurrentPage
                                  ? 'z-10 bg-blue-600 text-white ring-blue-600 hover:bg-blue-500'
                                  : 'text-gray-900 hover:bg-gray-50 bg-white'
                              }`}
                            >
                              {pageNum + 1}
                            </button>
                          );
                        })}

                        <button
                          onClick={handleNextPage}
                          disabled={currentPage + 1 >= totalPages}
                          className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Next</span>
                          <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              </>
            ) : filterText.trim() ? (
              <div className="rounded-lg bg-white p-8 text-center">
                <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No albums match your filter</h3>
                <p className="mt-1 text-sm text-gray-500">
                  No albums found matching "{filterText}". Try a different search term or clear the filter above.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-white p-8 text-center">
                <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No albums</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating a new album.</p>
                <div className="mt-6">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    onClick={() => setIsCreateAlbumModalOpen(true)}
                  >
                    <Plus className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                    New Album
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          selectedAlbum && (
            <AlbumView
              album={selectedAlbum}
              images={images}
              onBack={handleBackToAlbums}
              onUpload={handleImageUpload}
              onDeleteImage={handleImageDelete}
              onReorder={handleImageReorder}
              onUpdateCaption={handleCaptionUpdate}
              onRenameAlbum={handleAlbumRename}
              onUpdateAlbum={handleAlbumUpdate}
            />
          )
        )}
      </main>

      {/* Create Album Modal */}
      <CreateAlbumModal
        isOpen={isCreateAlbumModalOpen}
        onClose={() => setIsCreateAlbumModalOpen(false)}
        onSubmit={handleCreateAlbum}
      />

      {/* Download Progress Modal */}
      <DownloadProgressModal
        progress={downloadProgress}
        onClose={() => setDownloadProgress(null)}
      />
    </div>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/album/:albumId"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
      </Routes>
    </div>
  );
}

export default App;
