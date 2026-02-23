import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach JWT from memory
let _accessToken: string | null = null;
export const setAccessToken = (token: string | null) => { _accessToken = token; };
export const getAccessToken = () => _accessToken;

api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const newToken = res.data.accessToken;
        setAccessToken(newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        setAccessToken(null);
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ============================================================
// Auth API
// ============================================================
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  refresh: () => api.post('/auth/refresh'),
  me: () => api.get('/auth/me'),
};

// ============================================================
// Super Admin API
// ============================================================
export const superAdminApi = {
  getDashboard: () => api.get('/super-admin/dashboard'),
  getTenants: (params?: Record<string, unknown>) => api.get('/super-admin/tenants', { params }),
  createTenant: (data: Record<string, unknown>) => api.post('/super-admin/tenants', data),
  updateTenant: (id: number, data: Record<string, unknown>) => api.put(`/super-admin/tenants/${id}`, data),
  deleteTenant: (id: number) => api.delete(`/super-admin/tenants/${id}`),
  getInternalUsers: () => api.get('/super-admin/internal-users'),
  createInternalUser: (data: Record<string, unknown>) => api.post('/super-admin/internal-users', data),
  updateInternalUser: (id: number, data: Record<string, unknown>) => api.put(`/super-admin/internal-users/${id}`, data),
  deleteInternalUser: (id: number) => api.delete(`/super-admin/internal-users/${id}`),
  impersonate: (userId: number, reason: string) => api.post('/super-admin/impersonate', { userId, reason }),
  endImpersonation: () => api.post('/super-admin/impersonate/end'),
  getAuditLogs: (params?: Record<string, unknown>) => api.get('/super-admin/audit-logs', { params }),
  getAnalytics: () => api.get('/super-admin/analytics'),
};

// ============================================================
// Tenant Admin API
// ============================================================
export const tenantAdminApi = {
  getDashboard: () => api.get('/tenant-admin/dashboard'),
  getUsers: (params?: Record<string, unknown>) => api.get('/tenant-admin/users', { params }),
  inviteUser: (data: Record<string, unknown>) => api.post('/tenant-admin/users/invite', data),
  updateUser: (id: number, data: Record<string, unknown>) => api.put(`/tenant-admin/users/${id}`, data),
  deleteUser: (id: number) => api.delete(`/tenant-admin/users/${id}`),
  getCourses: () => api.get('/tenant-admin/courses'),
  createCourse: (data: Record<string, unknown>) => api.post('/tenant-admin/courses', data),
  updateCourse: (id: number, data: Record<string, unknown>) => api.put(`/tenant-admin/courses/${id}`, data),
  deleteCourse: (id: number) => api.delete(`/tenant-admin/courses/${id}`),
  getAISettings: () => api.get('/tenant-admin/ai-settings'),
  updateAISettings: (data: Record<string, unknown>) => api.put('/tenant-admin/ai-settings', data),
  getConnectors: () => api.get('/tenant-admin/connectors'),
  updateConnector: (data: Record<string, unknown>) => api.put('/tenant-admin/connectors', data),
  getAnalytics: () => api.get('/tenant-admin/analytics'),
  getAuditLogs: (params?: Record<string, unknown>) => api.get('/tenant-admin/audit-logs', { params }),
  ingestDocument: (formData: FormData) => api.post('/ingest/document', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  ingestYoutube: (data: Record<string, unknown>) => api.post('/ingest/youtube', data),
};

// ============================================================
// User Portal API
// ============================================================
export const userApi = {
  getCourses: () => api.get('/portal/courses'),
  getCourse: (id: number) => api.get(`/portal/courses/${id}`),
  getDocuments: (courseId?: number) => api.get('/portal/documents', { params: { courseId } }),
  chat: (data: Record<string, unknown>) => api.post('/portal/chat', data),
  getConversations: () => api.get('/portal/conversations'),
  getConversation: (id: number) => api.get(`/portal/conversations/${id}`),
  getAssessments: () => api.get('/portal/assessments'),
  submitAssessment: (id: number, data: Record<string, unknown>) =>
    api.post(`/portal/assessments/${id}/submit`, data),
  getProgress: () => api.get('/portal/progress'),
  // Faculty only
  getStudentProgress: (courseId?: number) => api.get('/portal/student-progress', { params: { courseId } }),
  createAssessment: (data: Record<string, unknown>) => api.post('/portal/assessments', data),
};
