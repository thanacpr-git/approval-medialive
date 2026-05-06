import React, { useState } from 'react';
import { AlertTriangle, Power, Clock, CheckCircle } from 'lucide-react';
import { format, differenceInHours, isPast } from 'date-fns';
import ConfirmDialog from './ConfirmDialog';
import { turnoffApi } from '../services/api';

function MatchCard({ match, onStatusChange }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Treat stored times as GMT+7 if no timezone specified
  let endTimeStr = match.endTime;
  if (endTimeStr && !endTimeStr.includes('+') && !endTimeStr.includes('Z')) {
    endTimeStr = endTimeStr + '+07:00';
  }
  const endTime = new Date(endTimeStr);
  const now = new Date();
  const hoursAfterEnd = differenceInHours(now, endTime);
  
  // Button visible: match ended AND within 2 hours after end
  const isEligibleForTurnOff = isPast(endTime) && hoursAfterEnd <= 2 && hoursAfterEnd >= 0;
  const isAlreadyOff = match.status === 'turned_off';
  const isPending = match.status === 'pending_approval';

  const handleTurnOff = async () => {
    setLoading(true);
    try {
      await turnoffApi.initiate(match.matchId);
      onStatusChange?.(match.matchId, 'pending_approval');
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  const getStatusBadge = () => {
    if (isAlreadyOff) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3" /> Channel Off
        </span>
      );
    }
    if (isPending) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <Clock className="w-3 h-3" /> Pending Approval
        </span>
      );
    }
    if (isPast(endTime)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <Clock className="w-3 h-3" /> Match Ended
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <Clock className="w-3 h-3" /> Scheduled
      </span>
    );
  };

  return (
    <>
      <div className="card hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-semibold text-lg">
                {match.homeTeam} vs {match.awayTeam}
              </h3>
              {getStatusBadge()}
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mt-3">
              <div>
                <span className="font-medium text-gray-500">Start:</span>{' '}
                {format(new Date(match.startTime), 'EEE dd MMM yyyy HH:mm')}
              </div>
              <div>
                <span className="font-medium text-gray-500">End:</span>{' '}
                {format(endTime, 'EEE dd MMM yyyy HH:mm')}
              </div>
              <div>
                <span className="font-medium text-gray-500">Channel:</span>{' '}
                <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {match.channelLabel}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-500">CDN:</span>{' '}
                {match.cdnProvider}
              </div>
            </div>
          </div>

          {/* Turn Off Button - only visible after match end within 2 hours */}
          {isEligibleForTurnOff && !isAlreadyOff && !isPending && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={loading}
              className="btn-danger flex items-center gap-2 ml-4"
            >
              <Power className="w-4 h-4" />
              Turn Off Channel
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Alarm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleTurnOff}
        loading={loading}
        match={match}
      />
    </>
  );
}

export default MatchCard;
