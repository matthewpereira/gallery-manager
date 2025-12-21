import { Routes, Route, useLocation, Link, useNavigate } from 'react-router-dom';
import { FolderOpen, LogOut, Image as ImageIcon, Plus, ArrowLeft } from 'lucide-react';
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
  const [albums, setAlbums] = useState<Album[]>([]);
  const [images, setImages] = useState<Image[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'albums' | 'album'>('albums');
  const [isCreateAlbumModalOpen, setIsCreateAlbumModalOpen] = useState(false);

  // Fetch albums on component mount
  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        if (token) {
          const albums = await storage.listAlbums();
          setAlbums(albums);
        }
      } catch (error) {
        console.error('Failed to fetch albums:', error);
        setError('Failed to load albums. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAlbums();
  }, [getToken, storage]);

  // Handle album selection
  const handleAlbumClick = async (album: Album) => {
    try {
      setLoading(true);
      const albumDetails = await storage.getAlbum(album.id);
      setSelectedAlbum(albumDetails);
      setImages(albumDetails.images || []);
      setView('album');
    } catch (error) {
      console.error('Failed to load album:', error);
      setError('Failed to load album. Please try again.');
    } finally {
      setLoading(false);
    }
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
      // Refresh album after upload
      if (selectedAlbum) {
        const updatedAlbum = await storage.getAlbum(albumId);
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
  const handleImageReorder = (reorderedImages: Image[]) => {
    // Update local state immediately for a responsive UI
    setImages(reorderedImages);

    // In a real app, you would make an API call to save the new order
    console.log('Reordered images:', reorderedImages);
    // Note: The Imgur API doesn't support reordering directly
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

  // Handle back to albums view
  const handleBackToAlbums = () => {
    setSelectedAlbum(null);
    setView('albums');
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
              {view === 'album' && selectedAlbum && (
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
        {view === 'albums' ? (
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
              <AlbumGrid 
                albums={albums} 
                onAlbumClick={handleAlbumClick}
                onAlbumDelete={handleAlbumDelete}
              />
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
