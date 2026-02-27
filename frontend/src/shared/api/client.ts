import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
export const setAccessToken = (token: string | null) => { _accessToken = token; };
export const getAccessToken = () => _accessToken;
export const setRefreshToken = (token: string | null) => {
  _refreshToken = token;
  try {
    if (token) window.localStorage.setItem('lms_refresh_token', token);
    else window.localStorage.removeItem('lms_refresh_token');
  } catch {}
};
export const getRefreshToken = () => {
  if (_refreshToken) return _refreshToken;
  try {
    _refreshToken = window.localStorage.getItem('lms_refresh_token');
  } catch {
    _refreshToken = null;
  }
  return _refreshToken;
};

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
        const refreshToken = getRefreshToken();
        const res = await axios.post('/api/auth/refresh', refreshToken ? { refreshToken } : {}, { withCredentials: true });
        const newToken = res.data.accessToken ?? res.data.token;
        if (!newToken) throw new Error('No refreshed access token');
        setAccessToken(newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        setAccessToken(null);
        setRefreshToken(null);
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const accessToken = res.data.accessToken ?? res.data.token ?? null;
    const refreshToken = res.data.refreshToken ?? null;
    if (accessToken) setAccessToken(accessToken);
    if (refreshToken) setRefreshToken(refreshToken);
    return res;
  },
  logout: async () => {
    const res = await api.post('/auth/logout');
    setAccessToken(null);
    setRefreshToken(null);
    return res;
  },
  refresh: () => {
    const refreshToken = getRefreshToken();
    return api.post('/auth/refresh', refreshToken ? { refreshToken } : {});
  },
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
  uploadLectureRecording: (formData: FormData) => api.post('/videos/upload-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteDocument: (id: number) => api.delete(`/documents/${id}`),
  deleteVideo: (id: number) => api.delete(`/videos/${id}`),
  chat: (data: Record<string, unknown>) =>
    api.post('/chat/send', {
      question: data.message ?? data.question,
      conversation_id: data.conversationId ?? data.conversation_id,
      course_id: data.course_id ?? null,
      document_ids: data.document_ids ?? null,
      provider: data.provider ?? null,
      model: data.model ?? null,
      retrieval_strategy: data.retrieval_strategy ?? null,
      enable_reranking: data.enable_reranking ?? false,
      top_k: data.top_k ?? 10,
    }),
  getConversations: () => api.get('/conversations'),
  createConversation: (data?: Record<string, unknown>) => api.post('/conversations', data ?? {}),
  renameConversation: (id: number, title: string) => api.put(`/conversations/${id}`, { title }),
  deleteConversation: (id: number) => api.delete(`/conversations/${id}`),
  getConversation: (id: number) => api.get(`/conversations/${id}/messages`),
  getAssessments: () => api.get('/assessments'),
  getAssessmentById: (id: number) => api.get(`/assessments/${id}`),
  submitAssessment: (id: number, data: Record<string, unknown>) =>
    api.post(`/assessments/${id}/submit`, data),
  getProgress: () => api.get('/portal/progress'),
  getStudentProgress: (courseId?: number) => api.get('/portal/student-progress', { params: { courseId } }),
  createAssessment: (data: Record<string, unknown>) => api.post('/assessments/create', data),
};

export const studentApi = {
  getDashboard: () => api.get('/student/dashboard'),
  getCourses: () => api.get('/student/courses'),
  getCalendar: (params?: Record<string, unknown>) => api.get('/student/calendar', { params }),
  getInbox: (params?: Record<string, unknown>) => api.get('/student/inbox', { params }),
  getHistory: () => api.get('/student/history'),
  getAccount: () => api.get('/student/account'),
  getCourseHome: (courseId: number) => api.get(`/student/courses/${courseId}/home`),
  getCourseModules: (courseId: number) => api.get(`/student/courses/${courseId}/modules`),
  setCourseItemCompletion: (courseId: number, module_item_id: number, completed: boolean, item_key?: string) =>
    api.post(`/student/courses/${courseId}/modules/complete`, { module_item_id, completed, item_key }),
  getCourseQuizzes: (courseId: number, params?: Record<string, unknown>) =>
    api.get(`/student/courses/${courseId}/quizzes`, { params }),
  getCourseFiles: (courseId: number, params?: Record<string, unknown>) =>
    api.get(`/student/courses/${courseId}/files`, { params }),
  getCourseFileChunks: (courseId: number, contentType: 'DOCUMENT' | 'VIDEO', sourceId: number, params?: Record<string, unknown>) =>
    api.get(`/student/courses/${courseId}/files/${contentType}/${sourceId}/chunks`, { params }),
  getCourseAssignments: (courseId: number) => api.get(`/student/courses/${courseId}/assignments`),
  submitCourseAssignment: (courseId: number, assignmentId: number, data: Record<string, unknown>) =>
    api.post(`/student/courses/${courseId}/assignments/${assignmentId}/submit`, data),
  getCourseThreads: (courseId: number) => api.get(`/student/courses/${courseId}/inbox/threads`),
  createCourseThread: (courseId: number, data: Record<string, unknown>) => api.post(`/student/courses/${courseId}/inbox/threads`, data),
  getCourseThreadMessages: (courseId: number, threadId: number) =>
    api.get(`/student/courses/${courseId}/inbox/threads/${threadId}`),
  sendCourseThreadMessage: (courseId: number, threadId: number, body: string) =>
    api.post(`/student/courses/${courseId}/inbox/threads/${threadId}/messages`, { body }),
};

export const facultyApi = {
  getDashboard: () => api.get('/faculty/dashboard'),
  getCourses: () => api.get('/faculty/courses'),
  getCalendar: () => api.get('/faculty/calendar'),
  getInbox: (params?: Record<string, unknown>) => api.get('/faculty/inbox', { params }),
  getHistory: () => api.get('/faculty/history'),
  getCourseHome: (courseId: number) => api.get(`/faculty/courses/${courseId}/home`),
  getCourseModules: (courseId: number) => api.get(`/faculty/courses/${courseId}/modules`),
  createCourseModule: (courseId: number, data: Record<string, unknown>) => api.post(`/faculty/courses/${courseId}/modules`, data),
  reorderCourseModules: (courseId: number, module_ids: number[]) => api.put(`/faculty/courses/${courseId}/modules/reorder`, { module_ids }),
  toggleModulePublish: (courseId: number, moduleId: number) => api.put(`/faculty/courses/${courseId}/modules/${moduleId}/toggle-publish`),
  createModuleItem: (courseId: number, moduleId: number, data: Record<string, unknown>) =>
    api.post(`/faculty/courses/${courseId}/modules/${moduleId}/items`, data),
  updateModuleItem: (courseId: number, moduleId: number, itemId: number, data: Record<string, unknown>) =>
    api.put(`/faculty/courses/${courseId}/modules/${moduleId}/items/${itemId}`, data),
  reorderModuleItems: (courseId: number, moduleId: number, item_ids: number[]) =>
    api.put(`/faculty/courses/${courseId}/modules/${moduleId}/items/reorder`, { item_ids }),
  moveModuleItem: (courseId: number, itemId: number, target_module_id: number) =>
    api.put(`/faculty/courses/${courseId}/modules/items/${itemId}/move`, { target_module_id }),
  getCourseFiles: (courseId: number) => api.get(`/faculty/courses/${courseId}/files`),
  getCourseFileChunks: (courseId: number, contentType: 'DOCUMENT' | 'VIDEO', sourceId: number, params?: Record<string, unknown>) =>
    api.get(`/faculty/courses/${courseId}/files/${contentType}/${sourceId}/chunks`, { params }),
  attachFileToModule: (courseId: number, data: Record<string, unknown>) => api.post(`/faculty/courses/${courseId}/files/attach`, data),
  getCourseQuizzes: (courseId: number, params?: Record<string, unknown>) => api.get(`/faculty/courses/${courseId}/quizzes`, { params }),
  createManualQuiz: (courseId: number, data: Record<string, unknown>) => api.post(`/faculty/courses/${courseId}/quizzes/manual`, data),
  generateQuiz: (courseId: number, data: Record<string, unknown>) => api.post(`/faculty/courses/${courseId}/quizzes/generate`, data),
  getCourseQuizDetail: (courseId: number, assessmentId: number) => api.get(`/faculty/courses/${courseId}/quizzes/${assessmentId}`),
  regenerateQuizQuestion: (courseId: number, assessmentId: number, questionId: number, data?: Record<string, unknown>) =>
    api.put(`/faculty/courses/${courseId}/quizzes/${assessmentId}/questions/${questionId}/regenerate`, data ?? {}),
  updateQuizQuestion: (courseId: number, assessmentId: number, questionId: number, data: Record<string, unknown>) =>
    api.put(`/faculty/courses/${courseId}/quizzes/${assessmentId}/questions/${questionId}`, data),
  publishQuiz: (courseId: number, assessmentId: number, data: Record<string, unknown>) =>
    api.put(`/faculty/courses/${courseId}/quizzes/${assessmentId}/publish`, data),
  duplicateQuiz: (courseId: number, assessmentId: number) =>
    api.post(`/faculty/courses/${courseId}/quizzes/${assessmentId}/duplicate`),
  deleteQuiz: (courseId: number, assessmentId: number) =>
    api.delete(`/faculty/courses/${courseId}/quizzes/${assessmentId}`),
  getAssignments: (courseId: number) => api.get(`/faculty/courses/${courseId}/assignments`),
  createAssignment: (courseId: number, data: Record<string, unknown>) => api.post(`/faculty/courses/${courseId}/assignments`, data),
  getAssignmentSubmissions: (courseId: number, assignmentId: number) => api.get(`/faculty/courses/${courseId}/assignments/${assignmentId}/submissions`),
  gradeSubmission: (courseId: number, submissionId: number, data: Record<string, unknown>) =>
    api.put(`/faculty/courses/${courseId}/assignments/submissions/${submissionId}/grade`, data),
  getGradebook: (courseId: number) => api.get(`/faculty/courses/${courseId}/gradebook`),
  getCourseThreads: (courseId: number) => api.get(`/faculty/courses/${courseId}/inbox/threads`),
  createCourseThread: (courseId: number, data: Record<string, unknown>) => api.post(`/faculty/courses/${courseId}/inbox/threads`, data),
  getThreadMessages: (courseId: number, threadId: number) => api.get(`/faculty/courses/${courseId}/inbox/threads/${threadId}`),
  sendThreadMessage: (courseId: number, threadId: number, body: string) =>
    api.post(`/faculty/courses/${courseId}/inbox/threads/${threadId}/messages`, { body }),
};
