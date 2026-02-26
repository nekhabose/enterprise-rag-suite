import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

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
        const newToken = res.data.accessToken ?? res.data.token;
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

export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  refresh: () => api.post('/auth/refresh'),
  me: () => api.get('/auth/me'),
};

export const superAdminApi = {
  getDashboard: () => api.get('/super-admin/dashboard'),
  getTenants: (params?: Record<string, unknown>) => api.get('/super-admin/tenants', { params }),
  createTenant: (data: Record<string, unknown>) => api.post('/super-admin/tenants', data),
  updateTenant: (id: number, data: Record<string, unknown>) => api.put(`/super-admin/tenants/${id}`, data),
  deleteTenant: (id: number) => api.patch(`/super-admin/tenants/${id}/toggle`),
  getInternalUsers: () => api.get('/super-admin/internal-users'),
  createInternalUser: (data: Record<string, unknown>) => api.post('/super-admin/internal-users', data),
  updateInternalUser: (id: number, data: Record<string, unknown>) => api.put(`/super-admin/internal-users/${id}`, data),
  deleteInternalUser: (id: number) => api.delete(`/super-admin/internal-users/${id}`),
  impersonate: (userId: number, reason: string) => api.post('/super-admin/impersonate', { userId, reason }),
  endImpersonation: () => api.post('/super-admin/impersonate/end'),
  getAuditLogs: (params?: Record<string, unknown>) => api.get('/super-admin/audit-logs', { params }),
  getAnalytics: () => api.get('/super-admin/analytics'),
  getAIGovernance: () => api.get('/super-admin/ai-governance'),
  getTenantAIGovernance: (tenantId: number) => api.get(`/super-admin/ai-governance/${tenantId}`),
  updateTenantAIGovernance: (tenantId: number, data: Record<string, unknown>) =>
    api.put(`/super-admin/ai-governance/${tenantId}`, data),
};

export const tenantAdminApi = {
  getDashboard: () => api.get('/tenant-admin/dashboard'),
  getUsers: (params?: Record<string, unknown>) => api.get('/tenant-admin/users', { params }),
  inviteUser: (data: Record<string, unknown>) => api.post('/tenant-admin/invite', data),
  updateUser: (id: number, data: Record<string, unknown>) => api.put(`/tenant-admin/users/${id}`, data),
  deleteUser: (id: number) => api.put(`/tenant-admin/users/${id}`, { is_active: false }),
  getCourses: () => api.get('/tenant-admin/courses'),
  createCourse: (data: Record<string, unknown>) => api.post('/tenant-admin/courses', data),
  updateCourse: (id: number, data: Record<string, unknown>) => api.put(`/tenant-admin/courses/${id}`, data),
  deleteCourse: (id: number) => api.put(`/tenant-admin/courses/${id}`, { is_active: false }),
  getCourseEnrollments: (id: number) => api.get(`/tenant-admin/courses/${id}/enrollments`),
  updateCourseEnrollments: (id: number, student_ids: number[]) =>
    api.put(`/tenant-admin/courses/${id}/enrollments`, { student_ids }),
  getAISettings: () => api.get('/tenant-admin/ai-settings'),
  updateAISettings: (data: Record<string, unknown>) => api.put('/tenant-admin/ai-settings', data),
  getConnectors: () => api.get('/connectors'),
  updateConnector: (data: Record<string, unknown>) => api.post('/connectors/ingest', data),
  getAnalytics: () => api.get('/tenant-admin/analytics'),
  getAuditLogs: (params?: Record<string, unknown>) => api.get('/tenant-admin/audit-logs', { params }),
  ingestDocument: (formData: FormData) => api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  ingestYoutube: (data: Record<string, unknown>) =>
    api.post('/videos/upload', {
      youtube_url: data.sourceUrl ?? data.youtube_url,
      title: data.title ?? 'YouTube Video',
      subject: data.subject ?? null,
      year: data.year ?? null,
      course_id: data.course_id ?? null,
    }),
};

export const userApi = {
  getCourses: () => api.get('/portal/courses'),
  getCourse: (id: number) => api.get(`/portal/courses/${id}`),
  getDocuments: (courseId?: number) => api.get('/documents', { params: { course_id: courseId } }),
  getVideos: () => api.get('/videos'),
  uploadDocument: (formData: FormData) => api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  uploadYoutube: (data: Record<string, unknown>) => api.post('/videos/upload', data),
  deleteDocument: (id: number) => api.delete(`/documents/${id}`),
  deleteVideo: (id: number) => api.delete(`/videos/${id}`),
  chat: (data: Record<string, unknown>) =>
    api.post('/chat/send', {
      question: data.message ?? data.question,
      conversation_id: data.conversationId ?? data.conversation_id,
      document_ids: data.document_ids ?? null,
      provider: data.provider ?? null,
      model: data.model ?? null,
      retrieval_strategy: data.retrieval_strategy ?? null,
      enable_reranking: data.enable_reranking ?? false,
      top_k: data.top_k ?? 5,
    }),
  getConversations: () => api.get('/conversations'),
  getConversation: (id: number) => api.get(`/conversations/${id}/messages`),
  getAssessments: () => api.get('/assessments'),
  submitAssessment: (id: number, data: Record<string, unknown>) =>
    api.post(`/assessments/${id}/submit`, data),
  getProgress: () => api.get('/portal/progress'),
  getStudentProgress: (courseId?: number) => api.get('/portal/student-progress', { params: { courseId } }),
  createAssessment: (data: Record<string, unknown>) => api.post('/assessments/create', data),
};
