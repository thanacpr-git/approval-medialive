import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

function ConfirmDialog({ open, onClose, onConfirm, loading, match }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Warning Header */}
        <div className="bg-red-50 px-6 py-4 flex items-center gap-3 border-b border-red-100">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-900">⚠️ Channel Turn-Off Warning</h3>
            <p className="text-sm text-red-700">This action requires approval</p>
          </div>
          <button 
            onClick={onClose} 
            className="ml-auto text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-700 mb-4">
            You are about to initiate the <strong>channel turn-off process</strong> for:
          </p>
          
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="font-semibold text-gray-900">
              {match.homeTeam} vs {match.awayTeam}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Channel: <span className="font-mono">{match.channelLabel}</span>
            </p>
            <p className="text-sm text-gray-600">
              ARN: <span className="font-mono text-xs">{match.channelArn}</span>
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <strong>Note:</strong> This will send approval emails to all designated parties. 
            The channel will only be turned off after <strong>all parties approve</strong>.
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end border-t">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button 
            onClick={onConfirm} 
            disabled={loading}
            className="btn-danger"
          >
            {loading ? 'Processing...' : 'Confirm Turn Off'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
