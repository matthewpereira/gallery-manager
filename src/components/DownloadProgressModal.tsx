import React from 'react';
import type { DownloadProgress } from '../types/download';
import './DownloadProgressModal.css';

interface DownloadProgressModalProps {
  progress: DownloadProgress | null;
  onClose: () => void;
}

export const DownloadProgressModal: React.FC<DownloadProgressModalProps> = ({
  progress,
  onClose,
}) => {
  if (!progress) return null;

  const isComplete = progress.stage === 'complete';
  const hasError = progress.stage === 'error';

  const getStageLabel = (stage: DownloadProgress['stage']): string => {
    switch (stage) {
      case 'preparing':
        return 'Preparing download...';
      case 'downloading':
        return 'Downloading images...';
      case 'packaging':
        return 'Creating archive...';
      case 'complete':
        return 'Download complete!';
      case 'error':
        return 'Download failed';
      default:
        return 'Processing...';
    }
  };

  return (
    <div className="modal-overlay" onClick={isComplete || hasError ? onClose : undefined}>
      <div className="modal-content download-progress-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{getStageLabel(progress.stage)}</h2>
          {(isComplete || hasError) && (
            <button className="close-button" onClick={onClose}>
              &times;
            </button>
          )}
        </div>

        <div className="modal-body">
          {hasError ? (
            <div className="error-message">
              <p>{progress.error || 'An unknown error occurred'}</p>
            </div>
          ) : (
            <>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>

              <div className="progress-stats">
                <div className="progress-stat">
                  <span className="stat-label">Albums:</span>
                  <span className="stat-value">
                    {progress.albumsProcessed} / {progress.totalAlbums}
                  </span>
                </div>
                <div className="progress-stat">
                  <span className="stat-label">Images:</span>
                  <span className="stat-value">
                    {progress.imagesProcessed} / {progress.totalImages}
                  </span>
                </div>
                <div className="progress-stat">
                  <span className="stat-label">Progress:</span>
                  <span className="stat-value">{Math.round(progress.percentage)}%</span>
                </div>
              </div>

              {progress.currentAlbum && (
                <div className="current-item">
                  <strong>Current album:</strong> {progress.currentAlbum}
                </div>
              )}

              {progress.currentImage && (
                <div className="current-item">
                  <strong>Current image:</strong> {progress.currentImage}
                </div>
              )}

              {isComplete && (
                <div className="success-message">
                  <p>
                    Successfully downloaded {progress.totalAlbums} album(s) with{' '}
                    {progress.totalImages} image(s).
                  </p>
                  <p className="help-text">Check your browser's downloads folder.</p>
                </div>
              )}
            </>
          )}
        </div>

        {(isComplete || hasError) && (
          <div className="modal-footer">
            <button className="primary-button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
