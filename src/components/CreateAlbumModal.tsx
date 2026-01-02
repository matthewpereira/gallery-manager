import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Privacy } from '../types/models';

interface CreateAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; description?: string; privacy: Privacy; customId?: string }) => Promise<void>;
}

export const CreateAlbumModal: React.FC<CreateAlbumModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [customId, setCustomId] = useState('');
  const [customIdError, setCustomIdError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateCustomId = (id: string): string => {
    if (!id) return ''; // Empty is valid (optional field)

    if (id.length < 3) {
      return 'Custom ID must be at least 3 characters';
    }

    if (id.length > 20) {
      return 'Custom ID must be no more than 20 characters';
    }

    if (!/^[a-zA-Z0-9_]+$/.test(id)) {
      return 'Custom ID can only contain letters, numbers, and underscores';
    }

    return '';
  };

  const handleCustomIdChange = (value: string) => {
    setCustomId(value);
    setCustomIdError(validateCustomId(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      return;
    }

    // Validate custom ID if provided
    if (customId) {
      const error = validateCustomId(customId);
      if (error) {
        setCustomIdError(error);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        privacy,
        customId: customId.trim() || undefined,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setPrivacy('public');
      setCustomId('');
      setCustomIdError('');
      onClose();
    } catch (error) {
      console.error('Failed to create album:', error);
      alert('Failed to create album. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Header */}
          <h2 className="mb-4 text-xl font-semibold text-gray-900">
            Create New Album
          </h2>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700"
              >
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="My Album"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700"
              >
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="Optional description"
                disabled={isSubmitting}
              />
            </div>

            {/* Custom Album ID */}
            <div>
              <label
                htmlFor="customId"
                className="block text-sm font-medium text-gray-700"
              >
                Custom Album ID
              </label>
              <input
                type="text"
                id="customId"
                value={customId}
                onChange={(e) => handleCustomIdChange(e.target.value)}
                className={`mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none sm:text-sm ${
                  customIdError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
                placeholder="e.g., 6Hpyr"
                disabled={isSubmitting}
              />
              {customIdError ? (
                <p className="mt-1 text-xs text-red-600">{customIdError}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  Optional: Use a custom ID (e.g., imgur album ID) or leave blank for auto-generated ID
                </p>
              )}
            </div>

            {/* Privacy */}
            <div>
              <label
                htmlFor="privacy"
                className="block text-sm font-medium text-gray-700"
              >
                Privacy
              </label>
              <select
                id="privacy"
                value={privacy}
                onChange={(e) => setPrivacy(e.target.value as Privacy)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                disabled={isSubmitting}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {privacy === 'public' && 'Anyone can see this album'}
                {privacy === 'private' && 'Only you can see this album'}
                {privacy === 'unlisted' && 'Anyone with the link can see this album'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-300"
                disabled={isSubmitting || !title.trim()}
              >
                {isSubmitting ? 'Creating...' : 'Create Album'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
