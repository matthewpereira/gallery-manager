import React from 'react';
import './DownloadProgressModal.css';

export interface UploadProgress {
  current: number;
  total: number;
  currentFile: string;
  stage: 'uploading' | 'complete' | 'error';
  error?: string;
}

interface UploadProgressModalProps {
  progress: UploadProgress | null;
  onClose: () => void;
}

export const UploadProgressModal: React.FC<UploadProgressModalProps> = ({
  progress,
  onClose,
}) => {
  if (!progress) return null;

  const isComplete = progress.stage === 'complete';
  const hasError = progress.stage === 'error';
  const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="modal-overlay" onClick={isComplete || hasError ? onClose : undefined}>
      <div className="modal-content download-progress-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {hasError ? 'Upload failed' : isComplete ? 'Upload complete!' : 'Uploading images...'}
          </h2>
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
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <div className="progress-stats">
                <div className="progress-stat">
                  <span className="stat-label">Images:</span>
                  <span className="stat-value">
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <div className="progress-stat">
                  <span className="stat-label">Progress:</span>
                  <span className="stat-value">{Math.round(percentage)}%</span>
                </div>
              </div>

              {progress.currentFile && !isComplete && (
                <div className="current-item">
                  <strong>Uploading:</strong> {progress.currentFile}
                </div>
              )}

              {isComplete && (
                <div className="success-message">
                  <p>Successfully uploaded {progress.total} image{progress.total !== 1 ? 's' : ''}.</p>
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
