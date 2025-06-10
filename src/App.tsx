import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthButton } from './components/AuthButton';
import { ImageGrid } from './components/ImageGrid';
import { AuthCallback } from './components/AuthCallback';
import { authService } from './services/auth';
import { imgurService } from './services/imgur';
import type { ImgurImage } from './types/imgur';

function Gallery() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [images, setImages] = useState<ImgurImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setIsAuthenticated(authService.isAuthenticated());
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
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

  const handleImageDelete = async (imageId: string) => {
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    try {
      await imgurService.deleteImage(imageId);
      setImages(images.filter(img => img.id !== imageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Imgur Gallery Manager
            </h1>
            <AuthButton 
              isAuthenticated={isAuthenticated} 
              onAuthChange={setIsAuthenticated}
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isAuthenticated ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-4">Welcome to Gallery Manager</h2>
            <p className="text-gray-600 mb-6">
              Connect your Imgur account to view and manage your images.
            </p>
            <AuthButton 
              isAuthenticated={false} 
              onAuthChange={setIsAuthenticated}
            />
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p>Loading your images...</p>
              </div>
            ) : (
              <ImageGrid 
                images={images} 
                onImageDelete={handleImageDelete}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  const basename = import.meta.env.PROD ? '/gallery-manager' : '';
  
  return (
    <Router basename={basename}>
      <Routes>
        <Route path="/" element={<Gallery />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Routes>
    </Router>
  );
}

export default App;
