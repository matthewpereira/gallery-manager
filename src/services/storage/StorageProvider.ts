/**
 * Storage Provider Interface
 *
 * This interface defines the contract that all storage providers must implement.
 * Any storage backend (Imgur, S3, Google Drive, etc.) should implement this interface.
 */

import type {
  Album,
  AlbumDetail,
  Image,
  CreateAlbumRequest,
  UpdateAlbumRequest,
  UploadOptions,
  UpdateImageRequest,
  AuthResult
} from '../../types/models';

export interface StorageProvider {
  /**
   * Get the name/type of the storage provider
   */
  readonly name: string;

  // Album operations

  /**
   * List all albums for the current user
   * @param page - Optional page number for pagination (0-indexed)
   * @returns Promise resolving to an array of albums
   */
  listAlbums(page?: number): Promise<Album[]>;

  /**
   * Get detailed information about a specific album including its images
   * @param id - The album ID
   * @param options - Optional parameters for image loading
   * @param options.imageLimit - Maximum number of images to load (undefined = all)
   * @param options.imageOffset - Number of images to skip (for pagination)
   * @returns Promise resolving to album details with images
   */
  getAlbum(id: string, options?: { imageLimit?: number; imageOffset?: number }): Promise<AlbumDetail>;

  /**
   * Create a new album
   * @param data - Album creation data
   * @returns Promise resolving to the created album
   */
  createAlbum(data: CreateAlbumRequest): Promise<Album>;

  /**
   * Update an existing album
   * @param id - The album ID
   * @param updates - Fields to update
   * @returns Promise resolving to the updated album
   */
  updateAlbum(id: string, updates: UpdateAlbumRequest): Promise<Album>;

  /**
   * Delete an album
   * @param id - The album ID
   * @returns Promise resolving to true if successful
   */
  deleteAlbum(id: string): Promise<boolean>;

  /**
   * Rename an album (change its ID)
   * @param oldId - The current album ID
   * @param newId - The new album ID
   * @param onProgress - Optional callback for progress updates
   * @returns Promise resolving to the renamed album
   */
  renameAlbum?(oldId: string, newId: string, onProgress?: (status: string, percent: number) => void): Promise<Album>;

  /**
   * Resolve an Imgur album ID to the current album ID
   * Used for legacy bookmark support (e.g., ?shortcode or /a/shortcode)
   * @param imgurId - The original Imgur album ID
   * @returns Promise resolving to the current album ID, or null if not found
   */
  resolveImgurId?(imgurId: string): Promise<string | null>;

  // Image operations

  /**
   * List all images for the current user
   * @param page - Optional page number for pagination (0-indexed)
   * @returns Promise resolving to an array of images
   */
  listImages(page?: number): Promise<Image[]>;

  /**
   * Get detailed information about a specific image
   * @param id - The image ID
   * @returns Promise resolving to image details
   */
  getImage(id: string): Promise<Image>;

  /**
   * Upload a new image
   * @param file - The file to upload
   * @param options - Upload options (album assignment, title, description)
   * @returns Promise resolving to the uploaded image
   */
  uploadImage(file: File, options?: UploadOptions): Promise<Image>;

  /**
   * Update an existing image's metadata
   * @param id - The image ID
   * @param updates - Fields to update
   * @returns Promise resolving to the updated image
   */
  updateImage(id: string, updates: UpdateImageRequest): Promise<Image>;

  /**
   * Delete an image
   * @param id - The image ID
   * @returns Promise resolving to true if successful
   */
  deleteImage(id: string): Promise<boolean>;

  // Album-Image relationship operations

  /**
   * Add images to an album
   * @param albumId - The album ID
   * @param imageIds - Array of image IDs to add
   * @returns Promise resolving to true if successful
   */
  addImagesToAlbum(albumId: string, imageIds: string[]): Promise<boolean>;

  /**
   * Remove images from an album
   * @param albumId - The album ID
   * @param imageIds - Array of image IDs to remove
   * @returns Promise resolving to true if successful
   */
  removeImagesFromAlbum(albumId: string, imageIds: string[]): Promise<boolean>;

  // Authentication operations

  /**
   * Check if the user is authenticated with this provider
   * @returns True if authenticated
   */
  isAuthenticated(): boolean;

  /**
   * Initiate authentication flow for this provider
   * @returns Promise resolving to authentication result
   */
  authenticate(): Promise<AuthResult>;

  /**
   * Refresh the authentication token if needed
   * @returns Promise resolving when refresh is complete
   */
  refreshToken(): Promise<void>;

  // Account operations

  /**
   * Get account information for the current user
   * @returns Promise resolving to account info
   */
  getAccountInfo(): Promise<any>;
}
