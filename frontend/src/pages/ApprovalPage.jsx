import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { approvalApi } from '../services/api';

function ApprovalPage() {
  const { token } = useParams();
  const [status, setStatus] = useState(null); // null, 'approved', 'rejected', 'error'
  const [loading, setLoading] = useState(false);

  const handleAction = async (action) => {
    setLoading(true);
    try {
      await approvalApi.respond(token, action);
      setStatus(action === 'approve' ? 'approved' : 'rejected');
    } catch (error) {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'approved') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Approved!</h1>
          <p className="text-gray-500">Your approval has been recorded. The channel will be turned off once all parties approve.</p>
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Rejected</h1>
          <p className="text-gray-500">Your rejection has been recorded. The channel turn-off process has been cancelled.</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-500">This approval link may have expired or already been used.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card max-w-md w-full mx-4">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Channel Turn-Off Approval</h1>
        <p className="text-gray-500 text-sm mb-6">
          You have been asked to approve turning off a MediaLive channel after a match broadcast.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600">
            <strong>Token:</strong> <span className="font-mono text-xs">{token?.slice(0, 20)}...</span>
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleAction('approve')}
            disabled={loading}
            className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Approve
          </button>
          <button
            onClick={() => handleAction('reject')}
            disabled={loading}
            className="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="w-5 h-5" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApprovalPage;
