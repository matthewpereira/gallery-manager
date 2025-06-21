import type { ImgurImage } from '../types/imgur';
import { imgurService } from '../services/imgur';

export const handleUpload = async (files: File[], albumId: string) => {
  try {
    const file = files[0];
    await imgurService.uploadImage(file, { album: albumId });
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

export const handleDeleteImage = async (imageId: string) => {
  try {
    await imgurService.deleteImage(imageId);
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};

export const handleReorder = async (images: ImgurImage[]) => {
  try {
    // Reordering is not directly supported by Imgur API, so we'll need to update each image's position
    for (const image of images) {
      await imgurService.updateImage(image.id, { 
        description: image.description || '',
        title: image.title || ''
      });
    }
  } catch (error) {
    console.error('Error reordering images:', error);
    throw error;
  }
};

export const handleUpdateCaption = async (imageId: string, caption: string) => {
  try {
    await imgurService.updateImage(imageId, { description: caption });
  } catch (error) {
    console.error('Error updating caption:', error);
    throw error;
  }
};
