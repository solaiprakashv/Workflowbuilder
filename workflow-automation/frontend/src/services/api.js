import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me')
};

// Workflows
export const workflowAPI = {
  create: (data) => api.post('/workflows', data),
  list: (params) => api.get('/workflows', { params }),
  getById: (id) => api.get(`/workflows/${id}`),
  update: (id, data) => api.put(`/workflows/${id}`, data),
  delete: (id) => api.delete(`/workflows/${id}`),
  execute: (id, data) => api.post(`/workflows/${id}/execute`, data),
  getVersionHistory: (id) => api.get(`/workflows/${id}/versions`),
  getVersionSnapshot: (id, version) => api.get(`/workflows/${id}/versions/${version}`)
};

// Steps
export const stepAPI = {
  add: (workflowId, data) => api.post(`/workflows/${workflowId}/steps`, data),
  list: (workflowId) => api.get(`/workflows/${workflowId}/steps`),
  update: (id, data) => api.put(`/steps/${id}`, data),
  delete: (id) => api.delete(`/steps/${id}`)
};

// Rules
export const ruleAPI = {
  add: (stepId, data) => api.post(`/steps/${stepId}/rules`, data),
  list: (stepId) => api.get(`/steps/${stepId}/rules`),
  update: (id, data) => api.put(`/rules/${id}`, data),
  delete: (id) => api.delete(`/rules/${id}`)
};

// Executions
export const executionAPI = {
  list: (params) => api.get('/executions', { params }),
  getById: (id) => api.get(`/executions/${id}`),
  cancel: (id) => api.post(`/executions/${id}/cancel`),
  retry: (id) => api.post(`/executions/${id}/retry`)
};

// Templates
export const templateAPI = {
  list: () => api.get('/templates'),
  getById: (id) => api.get(`/templates/${id}`)
};

// Metrics
export const metricsAPI = {
  get: () => api.get('/metrics')
};

export default api;
