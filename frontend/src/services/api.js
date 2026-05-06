import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE = import.meta.env.VITE_API_ENDPOINT || '/api';

async function getAuthHeaders() {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

async function apiRequest(method, path, body = null) {
  const headers = await getAuthHeaders();
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`${API_BASE}${path}`, options);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// Match Schedule APIs
export const matchesApi = {
  list: (month) => apiRequest('GET', `/matches${month ? `?month=${month}` : ''}`),
  get: (id) => apiRequest('GET', `/matches/${id}`),
  create: (data) => apiRequest('POST', '/matches', data),
  update: (id, data) => apiRequest('PUT', `/matches/${id}`, data),
  delete: (id) => apiRequest('DELETE', `/matches/${id}`),
  bulkCreate: (matches) => apiRequest('POST', '/matches', { matches }),
};

// Channel Turn-Off APIs
export const turnoffApi = {
  initiate: (matchId) => apiRequest('POST', `/matches/${matchId}/turnoff`),
};

// Channel APIs
export const channelsApi = {
  list: () => apiRequest('GET', '/channels'),
  listWithStatus: () => apiRequest('GET', '/channels?status=true'),
  status: (channelId) => apiRequest('GET', `/channels/${channelId}/status`),
};

// Approval APIs
export const approvalApi = {
  respond: (token, action) => apiRequest('POST', `/approval/${token}`, { action }),
};

// Audit Log APIs
export const auditApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest('GET', `/audit-log${query ? `?${query}` : ''}`);
  },
};
