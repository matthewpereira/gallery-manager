import { Routes, Route, useLocation, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FolderOpen, LogOut, Image as ImageIcon, Plus, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useAuth } from './auth/AuthProvider';
import { Login } from './pages/Login';
import { AlbumGrid } from './components/AlbumGrid';
import { CreateAlbumModal } from './components/CreateAlbumModal';
import AlbumView from './components/AlbumView';
import { useStorage } from './contexts/StorageContext';
import type { Album, AlbumDetail, Image } from './types/models';

// A wrapper component that redirects to the login page if not authenticated
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnTo = location.pathname + location.search;
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isAuthenticated, isLoading, location, navigate]);

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
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [images, setImages] = useState<Image[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateAlbumModalOpen, setIsCreateAlbumModalOpen] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [totalAlbums, setTotalAlbums] = useState<number | null>(null);

  // Get current page from URL, default to 1 (Imgur pages are 0-indexed but we show 1-indexed)
  const currentPage = Math.max(0, parseInt(searchParams.get('page') || '1', 10) - 1);

  // Determine if we're viewing an album based on the URL
  const albumIdFromUrl = location.pathname.startsWith('/album/')
    ? location.pathname.split('/album/')[1]
    : null;

  // Fetch account info to get total album count
  useEffect(() => {
    const fetchAccountInfo = async () => {
      try {
        const accountInfo = await storage.getAccountInfo();
        if (accountInfo && typeof accountInfo.album_count === 'number') {
          setTotalAlbums(accountInfo.album_count);
        }
      } catch (error) {
        console.error('Failed to fetch account info:', error);
      }
    };

    fetchAccountInfo();
  }, [storage]);

  // Fetch albums when page changes
  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        if (token) {
          const fetchedAlbums = await storage.listAlbums(currentPage);
          setAlbums(fetchedAlbums);

          // Check if there are more pages (Imgur returns 50 albums per page)
          setHasMorePages(fetchedAlbums.length === 50);
        }
      } catch (error) {
        console.error('Failed to fetch albums:', error);
        setError('Failed to load albums. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAlbums();
  }, [currentPage, getToken, storage]);

  // Load album when URL contains album ID
  useEffect(() => {
    const loadAlbum = async () => {
      if (albumIdFromUrl) {
        try {
          setLoading(true);
          const albumDetails = await storage.getAlbum(albumIdFromUrl);
          setSelectedAlbum(albumDetails);
          setImages(albumDetails.images || []);
        } catch (error) {
          console.error('Failed to load album:', error);
          setError('Failed to load album. Please try again.');
          // If album fails to load, redirect to home
          navigate('/');
        } finally {
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

    try {
      setLoading(true);
      await storage.deleteAlbum(albumId);
      setAlbums(albums.filter(album => album.id !== albumId));
    } catch (error) {
      console.error('Failed to delete album:', error);
      setError('Failed to delete album. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle album creation
  const handleCreateAlbum = async (data: { title: string; description?: string; privacy: 'public' | 'private' | 'unlisted' }) => {
    try {
      const newAlbum = await storage.createAlbum(data);
      setAlbums([newAlbum, ...albums]);
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

  // Handle caption update
  const handleCaptionUpdate = async (imageId: string, caption: string) => {
    try {
      setLoading(true);
      await storage.updateImage(imageId, { description: caption });
      setImages(images.map(img =>
        img.id === imageId ? { ...img, description: caption } : img
      ));
    } catch (error) {
      console.error('Failed to update caption:', error);
      setError('Failed to update caption. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle back to albums view - navigate to home
  const handleBackToAlbums = () => {
    navigate('/');
  };

  // Handle pagination - update URL search params
  const handleNextPage = () => {
    if (hasMorePages) {
      setSearchParams({ page: String(currentPage + 2) }); // +2 because we show 1-indexed pages
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      setSearchParams({ page: String(currentPage) }); // currentPage is already decremented by 1
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900">Gallery Manager</h1>
            <nav className="flex items-center space-x-4">
              {albumIdFromUrl && selectedAlbum && (
                <button
                  onClick={handleBackToAlbums}
                  className="flex items-center space-x-1 rounded-md px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Albums</span>
                </button>
              )}
              <Link
                to="/"
                className="flex items-center space-x-1 rounded-md px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                <FolderOpen className="h-4 w-4" />
                <span>Albums</span>
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            {user?.picture && (
              <img
                src={user.picture}
                alt={user.name || 'User'}
                className="h-8 w-8 rounded-full"
              />
            )}
            <button
              onClick={() => {
                const redirectUri = import.meta.env.VITE_IMGUR_REDIRECT_URI || window.location.origin;
                const authUrl = `https://api.imgur.com/oauth2/authorize?client_id=${import.meta.env.VITE_IMGUR_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}`;
                console.log('Redirecting to Imgur OAuth:', authUrl);
                window.location.href = authUrl;
              }}
              className="flex items-center space-x-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <ImageIcon className="h-4 w-4" />
              <span>Connect Imgur</span>
            </button>
            <button
              onClick={() => logout()}
              className="flex items-center space-x-1 rounded-md px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {!albumIdFromUrl ? (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Your Albums</h2>
              <button
                onClick={() => setIsCreateAlbumModalOpen(true)}
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <Plus className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                New Album
              </button>
            </div>
            
            {albums.length > 0 ? (
              <>
                <AlbumGrid
                  albums={albums}
                  onAlbumClick={handleAlbumClick}
                  onAlbumDelete={handleAlbumDelete}
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
                      disabled={!hasMorePages}
                      className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Page <span className="font-medium">{currentPage + 1}</span>
                        {totalAlbums !== null && (
                          <>
                            {' of '}
                            <span className="font-medium">{Math.ceil(totalAlbums / 50)}</span>
                          </>
                        )}
                        {' · '}
                        <span className="font-medium">{albums.length}</span> albums on this page
                        {totalAlbums !== null && (
                          <>
                            {' · '}
                            <span className="font-medium">{totalAlbums}</span> total
                          </>
                        )}
                      </p>
                    </div>
                    <div>
                      <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                        <button
                          onClick={handlePreviousPage}
                          disabled={currentPage === 0}
                          className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Previous</span>
                          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300">
                          {currentPage + 1}
                          {totalAlbums !== null && ` / ${Math.ceil(totalAlbums / 50)}`}
                        </span>
                        <button
                          onClick={handleNextPage}
                          disabled={!hasMorePages}
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
