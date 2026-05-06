import React, { useState, useRef } from 'react';
import { Upload, Plus, Trash2, Save, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { matchesApi, channelsApi } from '../services/api';
import useChannels from '../hooks/useChannels';

// Map CSV channel names to our labels (e.g. "Sport 3" -> "sports3")
function normalizeChannelLabel(csvChannel, CHANNELS) {
  if (!csvChannel) return '';
  const cleaned = csvChannel.trim().toLowerCase().replace(/\s+/g, '');
  // Try exact match first
  const exact = CHANNELS.find(c => c.channelLabel === cleaned);
  if (exact) return exact.channelLabel;
  // Try "sport 3" -> "sports3" pattern
  const match = csvChannel.match(/sport\s*(\d+)/i);
  if (match) {
    const num = match[1];
    const found = CHANNELS.find(c => c.channelLabel === `sports${num}`);
    if (found) return found.channelLabel;
  }
  // Try "sport 12-4K" pattern
  if (csvChannel.toLowerCase().includes('4k')) return 'sports12-4K';
  return '';
}

// Parse CSV date formats: "4/4/26 18:45" or "4/13/2026 0:30:00"
function parseCsvDate(dateStr) {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  
  try {
    // Format: M/D/YY H:MM or M/D/YYYY H:MM:SS or M/D/YY HH:MM
    const parts = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (parts) {
      let [, month, day, year, hour, minute] = parts;
      if (year.length === 2) year = `20${year}`;
      const pad = (n) => String(n).padStart(2, '0');
      // Return as local datetime string (for datetime-local input)
      return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
    }
  } catch (e) {
    console.warn('Failed to parse date:', dateStr, e);
  }
  
  return '';
}

// Parse match name into home/away teams
function parseMatchName(matchStr) {
  if (!matchStr) return { homeTeam: '', awayTeam: '' };
  // Split by "vs" (case insensitive), handle extra spaces
  const parts = matchStr.split(/\s+vs?\s+/i);
  if (parts.length >= 2) {
    return {
      homeTeam: parts[0].trim(),
      awayTeam: parts.slice(1).join(' vs ').trim(),
    };
  }
  return { homeTeam: matchStr.trim(), awayTeam: 'TBD' };
}

// Split CSV text into logical rows, handling multi-line quoted fields
function splitCsvRows(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // End of logical row
      if (current.trim()) rows.push(current);
      current = '';
      // Skip \r\n combo
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.trim()) rows.push(current);
  return rows;
}

// Parse CSV text into match objects
function parseCsv(text, CHANNELS) {
  const lines = splitCsvRows(text);
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const header = parseCSVLine(lines[0]);
  const colMap = {};
  header.forEach((col, idx) => {
    const lower = col.toLowerCase().trim();
    if (lower.includes('match')) colMap.match = idx;
    else if (lower.includes('cdn') || lower.includes('multi')) colMap.cdn = idx;
    else if (lower.includes('channel')) colMap.channel = idx;
    else if (lower.includes('start')) colMap.start = idx;
    else if (lower.includes('end')) colMap.end = idx;
  });

  const matches = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;

    const matchName = cols[colMap.match] || '';
    const { homeTeam, awayTeam } = parseMatchName(matchName);
    const channelLabel = normalizeChannelLabel(cols[colMap.channel] || '', CHANNELS);
    const channel = CHANNELS.find(c => c.channelLabel === channelLabel);

    matches.push({
      homeTeam,
      awayTeam,
      startTime: parseCsvDate(cols[colMap.start] || ''),
      endTime: parseCsvDate(cols[colMap.end] || ''),
      channelLabel: channelLabel,
      channelArn: channel?.arn || '',
      cdnProvider: (cols[colMap.cdn] || 'CF, Akamai').trim(),
      _raw: matchName, // Keep original for display
      _valid: !!(homeTeam && channelLabel),
    });
  }
  return matches;
}

// Handle CSV lines with quoted fields (commas inside quotes)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const emptyMatch = {
  homeTeam: '',
  awayTeam: '',
  startTime: '',
  endTime: '',
  channelLabel: '',
  channelArn: '',
  cdnProvider: 'CF, Akamai',
};

function UploadMatch() {
  const { channels: CHANNELS } = useChannels();
  const [mode, setMode] = useState('manual'); // 'manual' or 'csv'
  const [matches, setMatches] = useState([{ ...emptyMatch }]);
  const [csvMatches, setCsvMatches] = useState([]);
  const [csvErrors, setCsvErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);

  // ---- Manual mode handlers ----
  const addMatch = () => {
    setMatches([...matches, { ...emptyMatch }]);
  };

  const removeMatch = (index) => {
    setMatches(matches.filter((_, i) => i !== index));
  };

  const updateMatch = (index, field, value) => {
    const updated = [...matches];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'channelLabel') {
      const channel = CHANNELS.find(c => c.channelLabel === value);
      if (channel) {
        updated[index].channelArn = channel.arn;
      }
    }
    
    setMatches(updated);
  };

  // ---- CSV mode handlers ----
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsed = parseCsv(text, CHANNELS);
      
      const errors = [];
      parsed.forEach((m, idx) => {
        if (!m.homeTeam) errors.push(`Row ${idx + 1}: Could not parse match name`);
        if (!m.channelLabel) errors.push(`Row ${idx + 1}: Channel "${m._raw}" not recognized`);
        if (!m.startTime) errors.push(`Row ${idx + 1}: Could not parse start time`);
        if (!m.endTime) errors.push(`Row ${idx + 1}: Could not parse end time`);
      });

      setCsvErrors(errors);
      setCsvMatches(parsed);
    };
    reader.readAsText(file);
  };

  const removeCsvMatch = (index) => {
    setCsvMatches(csvMatches.filter((_, i) => i !== index));
  };

  const updateCsvMatch = (index, field, value) => {
    const updated = [...csvMatches];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'channelLabel') {
      const channel = CHANNELS.find(c => c.channelLabel === value);
      if (channel) updated[index].channelArn = channel.arn;
    }
    setCsvMatches(updated);
  };

  // ---- Submit ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    
    const dataToSave = mode === 'csv' ? csvMatches : matches;
    
    try {
      await matchesApi.bulkCreate(dataToSave);
      setMessage({ type: 'success', text: `Successfully uploaded ${dataToSave.length} match(es)` });
      if (mode === 'csv') {
        setCsvMatches([]);
        setCsvErrors([]);
      } else {
        setMatches([{ ...emptyMatch }]);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upload Match Schedule</h1>
        <p className="text-gray-500 mt-1">Add matches manually or bulk upload from CSV</p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Mode Toggle */}
      <div className="flex items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Plus className="w-4 h-4 inline mr-1" />
          Manual Entry
        </button>
        <button
          type="button"
          onClick={() => setMode('csv')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'csv'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 inline mr-1" />
          CSV Upload
        </button>
      </div>

      {/* ========== CSV UPLOAD MODE ========== */}
      {mode === 'csv' && (
        <div>
          {/* Upload Area */}
          <div className="card mb-6">
            <div 
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-1">
                Click to upload a CSV file or drag and drop
              </p>
              <p className="text-xs text-gray-400">
                Expected columns: Match, Multi-cdn, Channel, Start time, End time
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
              <p className="font-medium text-gray-700 mb-1">CSV Format Example:</p>
              <code className="block bg-gray-100 p-2 rounded font-mono">
                Match,Multi-cdn,Channel,Start time ( GMT+7 ),End time ( GMT+7 )<br/>
                Arsenal vs Fulham,"CF, Akamai",Sport 1,5/2/26 23:30,5/3/26 01:30
              </code>
            </div>
          </div>

          {/* CSV Errors */}
          {csvErrors.length > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-700 font-medium text-sm mb-2">
                <AlertCircle className="w-4 h-4" />
                Parsing warnings ({csvErrors.length})
              </div>
              <ul className="text-xs text-yellow-600 space-y-1">
                {csvErrors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* CSV Preview Table */}
          {csvMatches.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-700">
                  Preview ({csvMatches.length} matches)
                </h3>
                <span className="text-xs text-gray-400">
                  Edit any field below before saving
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b text-xs uppercase">
                      <th className="pb-2 px-2">Home</th>
                      <th className="pb-2 px-2">Away</th>
                      <th className="pb-2 px-2">Channel</th>
                      <th className="pb-2 px-2">Start Time</th>
                      <th className="pb-2 px-2">End Time</th>
                      <th className="pb-2 px-2">CDN</th>
                      <th className="pb-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {csvMatches.map((match, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={match.homeTeam}
                            onChange={(e) => updateCsvMatch(index, 'homeTeam', e.target.value)}
                            className="w-full border rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={match.awayTeam}
                            onChange={(e) => updateCsvMatch(index, 'awayTeam', e.target.value)}
                            className="w-full border rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <select
                            value={match.channelLabel}
                            onChange={(e) => updateCsvMatch(index, 'channelLabel', e.target.value)}
                            className={`w-full border rounded px-2 py-1 text-xs ${!match.channelLabel ? 'border-red-300 bg-red-50' : ''}`}
                          >
                            <option value="">Select...</option>
                            {CHANNELS.map(ch => (
                              <option key={ch.channelLabel} value={ch.channelLabel}>{ch.channelLabel}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="datetime-local"
                            value={match.startTime}
                            onChange={(e) => updateCsvMatch(index, 'startTime', e.target.value)}
                            className={`w-full border rounded px-2 py-1 text-xs ${!match.startTime ? 'border-red-300 bg-red-50' : ''}`}
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="datetime-local"
                            value={match.endTime}
                            onChange={(e) => updateCsvMatch(index, 'endTime', e.target.value)}
                            className={`w-full border rounded px-2 py-1 text-xs ${!match.endTime ? 'border-red-300 bg-red-50' : ''}`}
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={match.cdnProvider}
                            onChange={(e) => updateCsvMatch(index, 'cdnProvider', e.target.value)}
                            className="w-full border rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <button
                            type="button"
                            onClick={() => removeCsvMatch(index)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={saving || csvMatches.length === 0}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : `Save ${csvMatches.length} Matches`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== MANUAL ENTRY MODE ========== */}
      {mode === 'manual' && (
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {matches.map((match, index) => (
              <div key={index} className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-700">Match #{index + 1}</h3>
                  {matches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMatch(index)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Home Team</label>
                    <input
                      type="text"
                      value={match.homeTeam}
                      onChange={(e) => updateMatch(index, 'homeTeam', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. Arsenal"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Away Team</label>
                    <input
                      type="text"
                      value={match.awayTeam}
                      onChange={(e) => updateMatch(index, 'awayTeam', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. Fulham"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Channel</label>
                    <select
                      value={match.channelLabel}
                      onChange={(e) => updateMatch(index, 'channelLabel', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select channel...</option>
                      {CHANNELS.map(ch => (
                        <option key={ch.channelLabel} value={ch.channelLabel}>{ch.channelLabel}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Start Time</label>
                    <input
                      type="datetime-local"
                      value={match.startTime}
                      onChange={(e) => updateMatch(index, 'startTime', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">End Time</label>
                    <input
                      type="datetime-local"
                      value={match.endTime}
                      onChange={(e) => updateMatch(index, 'endTime', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">CDN Provider</label>
                    <input
                      type="text"
                      value={match.cdnProvider}
                      onChange={(e) => updateMatch(index, 'cdnProvider', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="CF, Akamai"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-6">
            <button
              type="button"
              onClick={addMatch}
              className="btn-secondary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Another Match
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save All Matches'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default UploadMatch;
