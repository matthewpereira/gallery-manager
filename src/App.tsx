import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Image as ImageIcon, FolderOpen, Github } from 'lucide-react';
import { AuthButton } from './components/AuthButton';
import { ImageGrid } from './components/ImageGrid';
import { AlbumGrid } from './components/AlbumGrid';
import { AuthCallback } from './components/AuthCallback';
import { CacheStats } from './components/CacheStats';
import AlbumView from './components/AlbumView';
import { authService } from './services/auth';
import { imgurService } from './services/imgur';
import type { ImgurImage, ImgurAlbum } from './types/imgur';

function Gallery() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [images, setImages] = useState<ImgurImage[]>([]);
  const [albums, setAlbums] = useState<ImgurAlbum[]>([]);
  const [currentView, setCurrentView] = useState<'albums' | 'images'>('albums');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Check if we're receiving an auth callback at the root path
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      handleAuthCallback(code);
    } else {
      setIsAuthenticated(authService.isAuthenticated());
    }
  }, []);

  const handleAuthCallback = async (code: string) => {
    setLoading(true);
    try {
      await authService.exchangeCodeForToken(code);
      setIsAuthenticated(true);
      // Clear the URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAlbums();
      fetchImages();
    }
  }, [isAuthenticated]);

  const fetchImages = async () => {
    setLoading(true);
    setError('');
    try {
      const fetchedImages = await imgurService.getAccountImages();
      setImages(fetchedImages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch images');
    } finally {
      setLoading(false);
    }
  };

  const fetchAlbums = async () => {
    setLoading(true);
    setError('');
    try {
      const fetchedAlbums = await imgurService.getAccountAlbums();
      setAlbums(fetchedAlbums);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch albums');
    } finally {
      setLoading(false);
    }
  };

  const handleImageDelete = async (imageId: string) => {
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    try {
      await imgurService.deleteImage(imageId);
      setImages(images.filter(img => img.id !== imageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image');
    }
  };

  const handleAlbumDelete = async (albumId: string) => {
    if (!confirm('Are you sure you want to delete this album?')) return;
    
    try {
      await imgurService.deleteAlbum(albumId);
      setAlbums(albums.filter(album => album.id !== albumId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete album');
    }
  };

  const handleAlbumClick = async (album: ImgurAlbum) => {
    try {
      const fetchedAlbum = await imgurService.getAlbum(album.id);
      setAlbums([fetchedAlbum]);
      setCurrentView('albums');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load album details');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <ImageIcon className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Gallery Manager
                </h1>
                <p className="text-sm text-muted-foreground">Imgur Collection</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/matthewpereira/gallery-manager"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                title="View on GitHub"
              >
                <Github className="w-5 h-5" />
              </a>
              <AuthButton 
                isAuthenticated={isAuthenticated} 
                onAuthChange={setIsAuthenticated}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isAuthenticated ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-center max-w-md">
              <div className="p-4 bg-primary/10 rounded-full w-fit mx-auto mb-6">
                <ImageIcon className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-4 text-foreground">Welcome to Gallery Manager</h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Connect your Imgur account to view and manage your images and albums in a beautiful, organized interface.
              </p>
              <AuthButton 
                isAuthenticated={false} 
                onAuthChange={setIsAuthenticated}
              />
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg mb-6">
                <p className="font-medium">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            <Tabs.Root value={currentView} onValueChange={(value) => setCurrentView(value as 'albums' | 'images')}>
              <CacheStats />
              <Tabs.List className="flex bg-muted rounded-lg p-1 mb-8 w-fit">
                <Tabs.Trigger 
                  value="albums"
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground"
                >
                  <FolderOpen className="w-4 h-4" />
                  Albums ({albums.length})
                </Tabs.Trigger>
                <Tabs.Trigger 
                  value="images"
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground"
                >
                  <ImageIcon className="w-4 h-4" />
                  Images ({images.length})
                </Tabs.Trigger>
              </Tabs.List>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary border-t-transparent mb-4"></div>
                  <p className="text-muted-foreground">Loading your {currentView}...</p>
                </div>
              ) : (
                <>
                  <Tabs.Content value="albums" className="outline-none">
                    <AlbumGrid 
                      albums={albums} 
                      onAlbumClick={handleAlbumClick}
                      onAlbumDelete={handleAlbumDelete}
                    />
                  </Tabs.Content>
                  <Tabs.Content value="images" className="outline-none">
                    <ImageGrid 
                      images={images} 
                      onImageDelete={handleImageDelete}
                    />
                  </Tabs.Content>
                </>
              )}
            </Tabs.Root>
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  const basename = import.meta.env.PROD ? '/gallery-manager' : '';
  const [album, setAlbum] = useState<ImgurAlbum | null>(null);
  const [images, setImages] = useState<ImgurImage[]>([]);

  const handleAlbumBack = () => {
    setAlbum(null);
  };

  const handleAlbumUpload = async (files: File[], albumId: string) => {
    try {
      // Upload files one by one
      for (const file of files) {
        await imgurService.uploadImage(file, { album: albumId });
      }
      
      // Fetch updated album after all uploads are complete
      const response = await imgurService.getAlbum(albumId);
      setImages(response.images || []);
    } catch (error) {
      console.error('Error uploading images:', error);
    }
  };

  const handleAlbumDeleteImage = async (imageId: string, albumId: string) => {
    try {
      await imgurService.deleteImage(imageId);
      const response = await imgurService.getAlbum(albumId);
      setImages(response.images || []);
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  };

  const handleAlbumReorder = async (newImages: ImgurImage[]) => {
    try {
      // Update image positions in the album
      for (const image of newImages) {
        await imgurService.updateImage(image.id, { 
          description: image.description || '',
          title: image.title || ''
        });
      }
      setImages(newImages);
    } catch (error) {
      console.error('Error reordering images:', error);
    }
  };

  const handleAlbumUpdateCaption = async (imageId: string, caption: string, albumId: string) => {
    try {
      await imgurService.updateImage(imageId, { description: caption });
      const response = await imgurService.getAlbum(albumId);
      setImages(response.images || []);
    } catch (error) {
      console.error('Error updating caption:', error);
    }
  };

  return (
    <Router basename={basename}>
      <Routes>
        <Route path="/" element={<Gallery />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route 
          path="/a/:albumId"
          element={
            <AlbumView
              album={album}
              images={images}
              onBack={handleAlbumBack}
              onUpload={handleAlbumUpload}
              onDeleteImage={handleAlbumDeleteImage}
              onReorder={handleAlbumReorder}
              onUpdateCaption={handleAlbumUpdateCaption}
            />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
