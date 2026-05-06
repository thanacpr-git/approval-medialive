import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import MatchCard from '../components/MatchCard';
import { matchesApi } from '../services/api';

function MatchSchedule() {
  const [matches, setMatches] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Default to current month
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(month);
    loadMatches(month);
  }, []);

  async function loadMatches(month) {
    setLoading(true);
    try {
      const data = await matchesApi.list(month);
      // Sort by start time
      const sorted = (data || []).sort((a, b) => 
        new Date(a.startTime) - new Date(b.startTime)
      );
      setMatches(sorted);
    } catch (error) {
      console.error('Failed to load matches:', error);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }

  const handleMonthChange = (e) => {
    const month = e.target.value;
    setSelectedMonth(month);
    loadMatches(month);
  };

  const handleStatusChange = (matchId, newStatus) => {
    setMatches(prev =>
      prev.map(m => (m.matchId === matchId ? { ...m, status: newStatus } : m))
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Match Schedule</h1>
          <p className="text-gray-500 mt-1">
            {matches.length} match{matches.length !== 1 ? 'es' : ''} found
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="month"
              value={selectedMonth}
              onChange={handleMonthChange}
              className="text-sm border-none outline-none"
            />
          </div>
          <button
            onClick={() => loadMatches(selectedMonth)}
            disabled={loading}
            className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Match Cards */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 text-gray-300 animate-spin" />
          <p>Loading matches...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => (
            <MatchCard
              key={match.matchId}
              match={match}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {!loading && matches.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No matches scheduled for this month</p>
          <p className="text-sm mt-1">Upload matches from the "Upload Matches" page</p>
        </div>
      )}
    </div>
  );
}

export default MatchSchedule;
