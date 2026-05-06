import React, { useState, useEffect } from 'react';
import { Tv, Calendar, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { matchesApi, channelsApi } from '../services/api';

function Dashboard() {
  const [stats, setStats] = useState({
    totalMatches: 0,
    pendingApproval: 0,
    channelsOff: 0,
    activeChannels: 0,
  });
  const [channels, setChannels] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoadingChannels(true);
    try {
      // Fetch matches and channels with status in parallel
      const [matches, channelData] = await Promise.all([
        matchesApi.list().catch(() => []),
        channelsApi.listWithStatus().catch(() => []),
      ]);

      setStats({
        totalMatches: matches.length,
        pendingApproval: matches.filter(m => m.status === 'pending_approval').length,
        channelsOff: matches.filter(m => m.status === 'turned_off').length,
        activeChannels: channelData.length,
      });

      setChannels(channelData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoadingChannels(false);
    }
  }

  const getStateBadge = (state) => {
    switch (state) {
      case 'RUNNING':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">● RUNNING</span>;
      case 'IDLE':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">○ IDLE</span>;
      case 'STARTING':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">◐ STARTING</span>;
      case 'STOPPING':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">◑ STOPPING</span>;
      case 'CREATE_FAILED':
      case 'UPDATE_FAILED':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">✗ FAILED</span>;
      case 'UNKNOWN':
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">? UNKNOWN</span>;
    }
  };

  const statCards = [
    { label: 'Total Matches', value: stats.totalMatches, icon: Calendar, color: 'text-blue-600 bg-blue-100' },
    { label: 'Pending Approval', value: stats.pendingApproval, icon: AlertCircle, color: 'text-yellow-600 bg-yellow-100' },
    { label: 'Channels Turned Off', value: stats.channelsOff, icon: CheckCircle, color: 'text-green-600 bg-green-100' },
    { label: 'MediaLive Channels', value: stats.activeChannels, icon: Tv, color: 'text-purple-600 bg-purple-100' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">MediaLive Channel Approval Overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Channel Status Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">MediaLive Channels</h2>
          <button
            onClick={loadData}
            disabled={loadingChannels}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingChannels ? 'animate-spin' : ''}`} />
            {loadingChannels ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-3 font-medium">#</th>
                <th className="pb-3 font-medium">Label</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">ARN</th>
                <th className="pb-3 font-medium">Class</th>
                <th className="pb-3 font-medium">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {channels.map((ch, idx) => (
                <tr key={ch.channelLabel} className="hover:bg-gray-50">
                  <td className="py-3">{idx + 1}</td>
                  <td className="py-3 font-medium">{ch.channelLabel}</td>
                  <td className="py-3">{getStateBadge(ch.state)}</td>
                  <td className="py-3 font-mono text-xs text-gray-500">
                    {ch.arn || <span className="text-gray-400 italic">missing</span>}
                  </td>
                  <td className="py-3">{ch.class || '—'}</td>
                  <td className="py-3 text-xs">{ch.version || '—'}</td>
                </tr>
              ))}
              {channels.length === 0 && !loadingChannels && (
                <tr>
                  <td colSpan="6" className="py-6 text-center text-gray-400">
                    No channels found. Run <code className="bg-gray-100 px-2 py-0.5 rounded">make seed-channels</code> to populate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
