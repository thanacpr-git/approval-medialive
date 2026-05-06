import React, { useState, useEffect } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { auditApi } from '../services/api';

function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const data = await auditApi.list();
      setLogs(data || []);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  const getActionColor = (action) => {
    switch (action) {
      case 'TURN_OFF_INITIATED': return 'bg-blue-100 text-blue-700';
      case 'APPROVAL_EMAIL_SENT': return 'bg-purple-100 text-purple-700';
      case 'APPROVAL_RECEIVED': return 'bg-green-100 text-green-700';
      case 'APPROVAL_REJECTED': return 'bg-red-100 text-red-700';
      case 'CHANNEL_STOPPED': return 'bg-red-100 text-red-700';
      case 'CHANNEL_STOP_FAILED': return 'bg-red-200 text-red-800';
      case 'CONFIRMATION_EMAIL': return 'bg-gray-100 text-gray-700';
      case 'MATCH_CREATED': return 'bg-emerald-100 text-emerald-700';
      case 'MATCH_UPDATED': return 'bg-yellow-100 text-yellow-700';
      case 'MATCH_DELETED': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-gray-500 mt-1">All channel management activities (last 30 days)</p>
        </div>
        <button
          onClick={loadLogs}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-center py-12 text-gray-500">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 text-gray-300 animate-spin" />
            <p>Loading audit logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ScrollText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No activities logged yet</p>
            <p className="text-sm mt-1">Actions will appear here as you manage matches and channels</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-3 font-medium">Timestamp</th>
                  <th className="pb-3 font-medium">Action</th>
                  <th className="pb-3 font-medium">User</th>
                  <th className="pb-3 font-medium">Match</th>
                  <th className="pb-3 font-medium">Channel</th>
                  <th className="pb-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.logId} className="hover:bg-gray-50">
                    <td className="py-3 text-xs text-gray-500 whitespace-nowrap">
                      {log.timestamp ? format(new Date(log.timestamp), 'dd MMM HH:mm:ss') : '—'}
                    </td>
                    <td className="py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 text-gray-600">{log.user || '—'}</td>
                    <td className="py-3 font-medium">{log.matchName || '—'}</td>
                    <td className="py-3 font-mono text-xs">{log.channel || '—'}</td>
                    <td className="py-3 text-gray-500 text-xs">{log.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLog;
