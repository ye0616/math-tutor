const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

// ===== 共享类型 =====

export interface ClassInfo {
  id: number;
  name: string;
  class_code: string;
  student_count: number;
}

// Token 管理
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('math-tutor-token');
}

export function setToken(token: string) {
  localStorage.setItem('math-tutor-token', token);
}

export function clearToken() {
  localStorage.removeItem('math-tutor-token');
  localStorage.removeItem('math-tutor-user');
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem('math-tutor-user');
  return saved ? JSON.parse(saved) : null;
}

async function fetchAPI(path: string, options?: RequestInit & { timeout?: number }) {
  const timeout = options?.timeout ?? 90000; // 默认90秒超时（AI请求需要较长时间）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // FormData 不需要手动设 Content-Type，浏览器会自动设 multipart/form-data + boundary
    const isFormData = options?.body instanceof FormData;
    const headers: Record<string, string> = isFormData
      ? { ...(options?.headers as Record<string, string> || {}) }
      : { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> || {}) };

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      // 401: token 过期或无效，只清 token，不强制跳转（避免打断用户操作）
      // 让上层组件根据 user 状态自然决定是否跳转
      if (res.status === 401 && typeof window !== 'undefined') {
        console.warn('[API] 401, clearing token. path:', path);
        clearToken();
        // 抛出错误，由调用方决定如何处理（不在此处强制跳转）
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || '登录已过期，请重新登录');
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || `API error: ${res.status}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时，AI正在处理中，请稍后重试');
    }
    throw err;
  }
}

// ===== 认证 API =====

export async function authRegister(role: string, name: string, phone: string, password: string, inviteCode?: string, classCode?: string) {
  return fetchAPI('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ role, name, phone, password, invite_code: inviteCode, class_code: classCode }),
  });
}

export async function authLogin(phone: string, password: string, role: string) {
  return fetchAPI('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password, role }),
  });
}

export async function authStudentLogin(name: string, studentNo: string) {
  return fetchAPI('/auth/student-login', {
    method: 'POST',
    body: JSON.stringify({ name, student_no: studentNo }),
  });
}

export async function authMe(token: string) {
  return fetchAPI('/auth/me', {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function authUpdateProfile(token: string, name?: string, avatar?: string) {
  return fetchAPI('/auth/profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, avatar }),
  });
}

export async function authChangePassword(token: string, oldPassword: string, newPassword: string) {
  return fetchAPI('/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}

export async function authGetPending(token: string) {
  return fetchAPI('/auth/admin/pending', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function authGetTeachers(token: string) {
  return fetchAPI('/auth/admin/teachers', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function authApprove(token: string, userId: number) {
  return fetchAPI(`/auth/admin/approve/${userId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function authReject(token: string, userId: number) {
  return fetchAPI(`/auth/admin/reject/${userId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchTeacherDashboard(teacherId?: number) {
  const query = teacherId ? `?teacher_id=${teacherId}` : '';
  return fetchAPI('/teacher/dashboard' + query);
}

export async function generateTeach(lessonTopic: string) {
  return fetchAPI('/teacher/teach', {
    method: 'POST',
    body: JSON.stringify({ lesson_topic: lessonTopic }),
  });
}

export async function gradeHomework(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/teacher/grade`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function fetchClassReport(classId: number) {
  return fetchAPI(`/teacher/class-report/${classId}`);
}

export async function fetchStudentReport(studentId: number) {
  return fetchAPI(`/teacher/student-report/${studentId}`);
}

export async function generateResearch(unitCode: string) {
  return fetchAPI('/teacher/research', {
    method: 'POST',
    body: JSON.stringify({ unit_code: unitCode }),
  });
}

export async function fetchClassManagement(classId: number) {
  return fetchAPI(`/teacher/class-management/${classId}`);
}

export async function generateCultivate(unitCode: string) {
  return fetchAPI('/teacher/cultivate', {
    method: 'POST',
    body: JSON.stringify({ unit_code: unitCode }),
  });
}

export async function generateResource(unitCode: string) {
  return fetchAPI('/teacher/resource/build', {
    method: 'POST',
    body: JSON.stringify({ unit_code: unitCode }),
  });
}

export async function fetchResources() {
  return fetchAPI('/teacher/resources');
}

export async function fetchQuestions(unitCode?: string, difficulty?: string) {
  const params = new URLSearchParams();
  if (unitCode) params.set('unit_code', unitCode);
  if (difficulty) params.set('difficulty', difficulty);
  const query = params.toString() ? `?${params.toString()}` : '';
  return fetchAPI(`/teacher/questions${query}`);
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function fetchStudentDashboard(studentId: number) {
  return fetchAPI(`/student/dashboard/${studentId}`, { headers: authHeaders() });
}

export async function startLearning(studentId: number, topic: string, errorType?: string) {
  const fd = new FormData();
  fd.append('student_id', String(studentId));
  fd.append('topic', topic);
  if (errorType) fd.append('error_type', errorType);
  return fetchAPI('/student/learn', {
    method: 'POST',
    body: fd,
  });
}

export async function fetchErrors(studentId: number) {
  return fetchAPI(`/student/errors/${studentId}`);
}

export async function fetchPracticeQuestions(venue: string, difficulty: string, studentId: number) {
  const fd = new FormData();
  fd.append('venue', venue);
  fd.append('difficulty', difficulty);
  fd.append('student_id', String(studentId));
  return fetchAPI('/student/practice/questions', {
    method: 'POST',
    body: fd,
  });
}

export async function diagnoseError(
  studentId: number,
  questionContent: string,
  studentAnswer: string,
  correctAnswer: string,
  topic?: string
) {
  const fd = new FormData();
  fd.append('student_id', String(studentId));
  fd.append('question_content', questionContent);
  fd.append('student_answer', studentAnswer);
  fd.append('correct_answer', correctAnswer);
  fd.append('topic', topic || '数学');
  return fetchAPI('/student/errors/diagnose', {
    method: 'POST',
    body: fd,
  });
}

// 苏格拉底式分步引导改错（4 步：hint → checkpoint → method → practice）
export interface GuidedStep {
  step: number;
  type: 'hint' | 'checkpoint' | 'method' | 'practice';
  content: string;
}

export interface GuidedCorrectionResult {
  error_id: number;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  knowledge_point: string;
  steps: GuidedStep[];
  error_reason?: string;
  full_solution?: string;
}

export async function guidedCorrection(errorId: number, token: string, questionText?: string): Promise<{ success: boolean; data?: GuidedCorrectionResult; message?: string }> {
  return fetchAPI(`/student/errors/${errorId}/guided-correction`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question_text: questionText || '' }),
    timeout: 90000,
  });
}

// 基于错题生成 3 道类似题
export interface SimilarQuestion {
  index: number;
  question: string;
  answer: string;
  hint?: string;
  explanation?: string;
}

export interface SimilarQuestionsResult {
  error_id: number;
  knowledge_point: string;
  questions: SimilarQuestion[];
}

export async function similarQuestions(errorId: number, token: string, count: number = 3): Promise<{ success: boolean; data?: SimilarQuestionsResult; message?: string }> {
  const fd = new FormData();
  fd.append('authorization', token);
  return fetchAPI(`/student/errors/${errorId}/similar-questions?count=${count}`, {
    method: 'POST',
    body: fd,
    timeout: 90000,
  });
}

export async function fetchRanking(classId: number) {
  return fetchAPI(`/student/ranking/${classId}`);
}

export async function fetchGames() {
  return fetchAPI('/student/games');
}

export async function fetchPoints(studentId: number) {
  return fetchAPI(`/student/points/${studentId}`);
}

// ===== #192 成长手册 真实化 API =====
export interface GrowthWeek {
  week_label: string;
  week_start: string;
  rank: number;
  points: number;
  score: number;
  questions: number;
  correct: number;
  correct_rate: number;
  has_data: boolean;
}
export interface GrowthSummary {
  total_questions: number;
  total_correct: number;
  correct_rate: number;
  current_rank: number;
  current_points: number;
}
export async function fetchGrowthCurve(weeks: number = 6): Promise<{ weeks: GrowthWeek[]; summary: GrowthSummary }> {
  return fetchAPI(`/student/growth-curve?weeks=${weeks}`, { headers: authHeaders() });
}

export interface WeakTopic {
  topic: string;
  venue: string;
  emoji: string;
  accuracy: number;
  error_count: number;
  attempt_count: number;
  unit_code: string;
}
export async function fetchWeakTopics(topN: number = 3): Promise<{ weak_topics: WeakTopic[]; total_topics: number }> {
  return fetchAPI(`/student/weak-topics?top_n=${topN}`, { headers: authHeaders() });
}

export interface CollectionItem {
  unit: string;
  emoji: string;
  name: string;
  topic: string;
  unlocked: boolean;
  progress: number;
  accuracy: number;
  total_answered: number;
  total_correct: number;
}
export async function fetchCollections(): Promise<{ collections: CollectionItem[] }> {
  return fetchAPI(`/student/collections`, { headers: authHeaders() });
}

// ===== 班级管理 API =====

export async function classCreate(token: string, name: string) {
  return fetchAPI('/classes/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
}

export async function classMyList(token: string) {
  return fetchAPI('/classes/my', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function classStudents(token: string, classId: number) {
  return fetchAPI(`/classes/${classId}/students`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function classImportStudents(token: string, classId: number, students: { name: string; student_no: string }[]) {
  return fetchAPI('/classes/import-students', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ class_id: classId, students }),
  });
}

export async function classImportExcel(token: string, classId: number, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('class_id', String(classId));
  const res = await fetch(`${API_BASE}/classes/import-excel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `上传失败: ${res.status}`);
  }
  return res.json();
}

export async function classByCode(classCode: string) {
  return fetchAPI(`/classes/by-code/${classCode}`);
}

export async function classDelete(token: string, classId: number) {
  return fetchAPI(`/classes/${classId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ===== 学生分层管理 API =====

export async function classGetLayers(token: string, classId: number) {
  return fetchAPI(`/classes/${classId}/layers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function classSetStudentLayer(
  token: string,
  classId: number,
  studentId: number,
  layer: string,
) {
  return fetchAPI(`/classes/${classId}/students/${studentId}/layer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ layer }),
  });
}

export async function classAutoLayer(
  token: string,
  classId: number,
  scores: { student_id?: number; name?: string; student_no?: string; score: number }[],
) {
  return fetchAPI(`/classes/${classId}/auto-layer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ scores }),
  });
}

// ===== 课堂教学（预习任务）API =====

export async function generateTeachContent(
  token: string,
  lessonCode: string,
  lessonTitle: string,
  unitCode: string,
): Promise<any> {
  // Step 1: 启动异步任务，立即拿到 task_id
  const startResp = await fetchAPI('/teach/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lesson_code: lessonCode, lesson_title: lessonTitle, unit_code: unitCode }),
  });

  const taskId = startResp.task_id;
  if (!taskId) throw new Error('未获取到任务ID');

  // Step 2: 每2秒轮询一次，最多等6分钟（真实搜索~15s + AI分析~35s ≈ 50s，留足余量）
  const maxAttempts = 180;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const task = await fetchAPI(`/teach/task/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (task.status === 'completed' && task.result) {
      return task.result;
    }
    if (task.status === 'failed') {
      throw new Error(task.error || 'AI生成失败');
    }
    // status === 'processing' → 继续等
  }
  throw new Error('AI生成超时，请重试');
}

export async function loadSavedTeach(token: string, lessonCode?: string) {
  const query = lessonCode ? `?lesson_code=${encodeURIComponent(lessonCode)}` : '';
  return fetchAPI(`/teach/saved${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ===== AI 生成板书设计 =====

export async function generateBlackboard(
  token: string,
  data: { lesson_title: string; knowledge_points?: string[]; preview_content?: string },
): Promise<{ message: string; blackboard: { title: string; main_board: string; side_board: string; ai_powered: boolean; ai_model: string } }> {
  return fetchAPI('/teach/generate-blackboard', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

// ===== 撤回预习发布 =====

export async function unpublishPreview(token: string, taskId: number): Promise<{ message: string }> {
  return fetchAPI(`/preview/${taskId}/unpublish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function republishPreview(token: string, taskId: number): Promise<{ message: string }> {
  return fetchAPI(`/preview/${taskId}/republish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deletePreview(token: string, taskId: number): Promise<{ message: string }> {
  return fetchAPI(`/preview/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function publishPreview(
  token: string,
  data: {
    class_id: number;
    lesson_code: string;
    lesson_title: string;
    unit_code: string;
    preview_content: string;
    inquiry_content?: string;
    board_content?: string;
    video_url?: string;
    layer_videos?: string;
    questions: { question: string; type: string; difficulty: string; answer: string; analysis: string; knowledge_point?: string }[];
    material_json?: string;
  },
) {
  return fetchAPI('/preview/publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

// ===== AI 预习资料生成 =====

export async function generatePreviewMaterial(
  token: string,
  data: {
    lesson_code: string;
    lesson_title: string;
    unit_code?: string;
    resource_folders?: any;
    layer_videos?: any;
    knowledge_points?: string[];
    preview_questions?: any[];
  },
): Promise<any> {
  // Step 1: 启动异步任务
  const startResp = await fetchAPI('/preview-material/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

  const taskId = startResp.task_id;
  if (!taskId) throw new Error('未获取到任务ID');

  // Step 2: 每2秒轮询一次，最多等3分钟
  const maxAttempts = 90;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const task = await fetchAPI(`/preview-material/task/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (task.status === 'completed' && task.result) {
      return task.result;
    }
    if (task.status === 'failed') {
      throw new Error(task.error || 'AI生成预习资料失败');
    }
  }
  throw new Error('AI生成预习资料超时，请重试');
}

export async function listPreviews(token: string, classId: number) {
  return fetchAPI(`/preview/list/${classId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function previewReport(token: string, taskId: number) {
  return fetchAPI(`/preview/${taskId}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function previewStats(token: string, taskId: number) {
  return fetchAPI(`/preview/${taskId}/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ===== 学生端预习 API =====

export async function studentPreviews(classId: number, studentId?: number) {
  const query = studentId ? `?student_id=${studentId}` : '';
  return fetchAPI(`/student/preview/${classId}${query}`);
}

export async function submitPreviewAnswer(studentId: number, questionId: number, answer: string) {
  return fetchAPI('/student/preview/answer', {
    method: 'POST',
    body: JSON.stringify({ student_id: studentId, question_id: questionId, answer }),
  });
}

export async function submitWatchLog(studentId: number, taskId: number, layer: string, watchDuration: number, totalDuration: number, completed: boolean) {
  return fetchAPI('/student/preview/watch-log', {
    method: 'POST',
    body: JSON.stringify({
      student_id: studentId,
      task_id: taskId,
      layer,
      watch_duration: watchDuration,
      total_duration: totalDuration,
      completed,
    }),
  });
}

// ===== 资源整合库 API =====

export async function resourceSearch(
  token: string,
  grade: string,
  subject: string,
  lessonTitle: string,
  textbookVersion: string = '人教版',
) {
  return fetchAPI('/resource/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ grade, subject, lesson_title: lessonTitle, textbook_version: textbookVersion }),
  });
}

export async function resourceSearchSaved(token: string, lessonTitle?: string) {
  const query = lessonTitle ? `?lesson_title=${encodeURIComponent(lessonTitle)}` : '';
  return fetchAPI(`/resource/search/saved${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ===== 备课资源收藏（基础生/提升生/拓展生档案） API =====

export interface CollectedResource {
  id: number;
  layer: string;
  lesson_code: string;
  lesson_title: string;
  resource_type: string;
  title: string;
  url: string;
  embed_url: string;
  platform: string;
  description: string;
  highlight: string;
  format: string;
  size: string;
  bvid: string;
  match_score: number;
  created_at: string;
  is_ai_generated?: boolean;
  ai_content?: any;
}

export async function collectResource(
  token: string,
  data: {
    layer: string;
    lesson_code?: string;
    lesson_title?: string;
    resource_type: string;
    title: string;
    url?: string;
    embed_url?: string;
    platform?: string;
    description?: string;
    highlight?: string;
    format?: string;
    size?: string;
    bvid?: string;
    match_score?: number;
    class_id?: number;
    is_ai_generated?: boolean;
    ai_content?: any;
  },
) {
  return fetchAPI('/teacher/resources/collect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function listCollectedResources(token: string, layer?: string, lessonCode?: string) {
  const params = new URLSearchParams();
  if (layer) params.set('layer', layer);
  if (lessonCode) params.set('lesson_code', lessonCode);
  const query = params.toString() ? `?${params.toString()}` : '';
  return fetchAPI(`/teacher/resources/collection${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteCollectedResource(token: string, itemId: number) {
  return fetchAPI(`/teacher/resources/collection/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function collectBatch(
  token: string,
  layer: string,
  items: {
    title: string;
    resource_type?: string;
    url?: string;
    embed_url?: string;
    platform?: string;
    description?: string;
    highlight?: string;
    format?: string;
    size?: string;
    bvid?: string;
    match_score?: number;
    is_ai_generated?: boolean;
    ai_content?: any;
  }[],
  classId?: number,
  lessonCode?: string,
  lessonTitle?: string,
) {
  return fetchAPI('/teacher/resources/collect/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ layer, class_id: classId ?? 0, lesson_code: lessonCode ?? '', lesson_title: lessonTitle ?? '', items }),
  });
}

// ===== 页面代理预览 API =====

export interface PreviewProxyResult {
  title: string;
  description: string;
  text: string;
  text_length: number;
  images: string[];
  final_url: string;
  status_code: number;
  success: boolean;
  error?: string;
}

export async function fetchPreviewProxy(token: string, url: string): Promise<PreviewProxyResult> {
  const query = `?url=${encodeURIComponent(url)}`;
  return fetchAPI(`/resource/preview-proxy${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });
}

export async function fetchResolveUrl(token: string, url: string): Promise<{ resolved_url: string }> {
  const query = `?url=${encodeURIComponent(url)}`;
  return fetchAPI(`/resource/preview-resolve-url${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
}

// ===== 复习作业批改 API =====

export interface HomeworkQuestion {
  id: number;
  question_index: number;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  is_correct: number;
  analysis: string;
  error_type: string;
  correction_hint: string;
  knowledge_point: string;
}

export interface GradingTaskResult {
  task_id: string;
  status: 'pending' | 'grading' | 'completed' | 'failed';
  error?: string;
  submission?: {
    id: number;
    lesson_title: string;
    status: string;
    summary: string;
    total_questions: number;
    correct_count: number;
    created_at: string;
    completed_at: string | null;
  };
  questions?: HomeworkQuestion[];
  accuracy?: number;
}

export interface GuidedCorrection {
  hint?: string;
  checkpoint?: string;
  method?: string;
  practice?: string;
  error_reason?: string;
  full_solution?: string;
  success?: boolean;
  summary?: string;
  steps?: { step: number; type: string; content: string }[];
}

export interface SimilarQuestion {
  question: string;
  answer: string;
  knowledge_point?: string;
  difficulty?: string;
}

export interface BreakthroughResult {
  knowledge_tag?: string;
  questions?: {
    question: string;
    answer: string;
    knowledge_point?: string;
    difficulty?: string;
  }[];
  message?: string;
  success?: boolean;
}

/** 上传作业图片，启动AI异步批改 */
export async function uploadHomework(
  token: string,
  file: File,
  lessonTitle?: string,
  assignmentId?: number,
): Promise<{ task_id: string; submission_id: number }> {
  const formData = new FormData();
  formData.append('file', file);
  if (lessonTitle) formData.append('lesson_title', lessonTitle);
  if (assignmentId) formData.append('assignment_id', String(assignmentId));
  return fetchAPI('/homework/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
}

/** 获取学生本班已发布作业列表 */
export interface PublishedAssignment {
  id: number;
  title: string;
  description: string;
  unit_code: string;
  due_date: string | null;
  created_at: string;
  question_count: number;
  questions?: Array<{
    index?: number;
    question_text: string;
    correct_answer?: string;
    analysis?: string;
    knowledge_point?: string;
    difficulty?: string;
  }>;
  submitted: boolean;
  submission_status: string;
  correct_count?: number;
  total_questions?: number;
}

export async function getPublishedAssignments(token: string): Promise<{ assignments: PublishedAssignment[] }> {
  return fetchAPI('/homework/published-assignments', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** 轮询批改任务状态 */
export async function getGradingTask(token: string, taskId: string): Promise<GradingTaskResult> {
  return fetchAPI(`/homework/task/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** 轮询直到批改完成 */
export async function pollGradingTask(token: string, taskId: string): Promise<GradingTaskResult> {
  const maxAttempts = 90; // 最多等3分钟
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const task = await getGradingTask(token, taskId);
    if (task.status === 'completed') return task;
    if (task.status === 'failed') throw new Error(task.error || 'AI批改失败');
  }
  throw new Error('AI批改超时，请重试');
}

/** 获取AI引导改错 */
export async function getGuidedCorrection(token: string, questionId: number): Promise<GuidedCorrection> {
  return fetchAPI(`/homework/question/${questionId}/guided-correction`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
  });
}

/** 生成类似题目 */
export async function getSimilarQuestions(token: string, questionId: number): Promise<{ success: boolean; questions: SimilarQuestion[]; summary?: string }> {
  return fetchAPI(`/homework/question/${questionId}/similar-questions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
  });
}

/** 获取作业历史 */
export async function homeworkHistory(token: string, studentId: number): Promise<{ submissions: any[] }> {
  return fetchAPI(`/homework/history/${studentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** 错题突破 - AI生成针对性练习题 */
export async function mistakeBreakthrough(token: string): Promise<BreakthroughResult> {
  return fetchAPI('/homework/mistake-book/breakthrough', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
  });
}

/** 提交错题突破答题 */
export async function submitBreakthroughAnswer(
  token: string,
  data: { student_id: number; question_index: number; student_answer: string; correct_answer: string },
): Promise<{ is_correct: boolean; points: number }> {
  return fetchAPI('/homework/mistake-book/breakthrough/answer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/** 标记错题已解决 */
export async function resolveErrorNote(token: string, noteId: number): Promise<{ message: string; points: number; reheat_due?: string }> {
  return fetchAPI(`/homework/error-note/${noteId}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ===== 随机考察（"再考考你"） =====

export interface RandomChallengeQuestion {
  index: number;
  question: string;
  answer: string;
  knowledge_point?: string;
  explanation?: string;
}

export async function generateRandomChallenge(
  token: string,
  lessonTitle: string,
  submissionId: number,
  lessonCode: string = '',
): Promise<{ task_id: string; message: string }> {
  const fd = new FormData();
  fd.append('lesson_title', lessonTitle);
  fd.append('submission_id', String(submissionId));
  if (lessonCode) fd.append('lesson_code', lessonCode);
  return fetchAPI('/homework/random-challenge', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export async function getRandomChallengeTask(
  token: string,
  taskId: string,
): Promise<{
  status: string;
  result?: {
    challenge_title: string;
    questions: RandomChallengeQuestion[];
  };
  error?: string;
}> {
  return fetchAPI(`/homework/random-challenge/task/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function submitRandomChallenge(
  token: string,
  studentId: number,
  submissionId: number,
  lessonTitle: string,
  questionsJson: string,
  answersJson: string,
): Promise<{
  challenge_id: number;
  total: number;
  correct: number;
  has_errors: boolean;
  reported: number;
  message: string;
}> {
  const fd = new FormData();
  fd.append('student_id', String(studentId));
  fd.append('submission_id', String(submissionId));
  fd.append('lesson_title', lessonTitle);
  fd.append('questions_json', questionsJson);
  fd.append('answers_json', answersJson);
  return fetchAPI('/homework/random-challenge/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

// ===== 学习问答（苏格拉底式引导） =====

export interface QAResponse {
  reply: string;
  is_solved: boolean;
  suggested_answer?: string;
  similar_question?: string;
}

export async function askQA(
  token: string,
  question: string,
  imageBase64?: string,
  conversationHistory?: { role: string; content: string }[],
): Promise<{ task_id: string; message: string }> {
  const fd = new FormData();
  fd.append('question', question);
  if (imageBase64) fd.append('image', imageBase64);
  if (conversationHistory && conversationHistory.length > 0) {
    fd.append('conversation_history', JSON.stringify(conversationHistory));
  }
  return fetchAPI('/homework/qa/ask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export async function getQATask(
  token: string,
  taskId: string,
): Promise<{ status: string; result?: QAResponse; error?: string }> {
  return fetchAPI(`/homework/qa/task/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function saveQASession(
  token: string,
  studentId: number,
  questionText: string,
  conversationJson: string,
  isSolved: boolean,
  similarQuestion?: string,
  similarAnswer?: string,
  imageBase64?: string,
): Promise<{ qa_id: number; message: string }> {
  const fd = new FormData();
  fd.append('student_id', String(studentId));
  fd.append('question_text', questionText);
  fd.append('conversation_json', conversationJson);
  fd.append('is_solved', String(isSolved));
  if (similarQuestion) fd.append('similar_question', similarQuestion);
  if (similarAnswer) fd.append('similar_answer', similarAnswer);
  if (imageBase64) fd.append('image', imageBase64);
  return fetchAPI('/homework/qa/save', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export async function getQASimilar(
  token: string,
  questionText: string,
  correctAnswer: string,
  knowledgePoint?: string,
): Promise<{ questions: { index: number; question: string; answer: string; explanation: string }[] }> {
  const fd = new FormData();
  fd.append('question_text', questionText);
  fd.append('correct_answer', correctAnswer);
  if (knowledgePoint) fd.append('knowledge_point', knowledgePoint);
  return fetchAPI('/homework/qa/similar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

// ===== 教师端：随机考察预警 =====

export interface RandomChallengeAlert {
  id: number;
  student_id: number;
  student_name: string;
  student_no: string;
  lesson_title: string;
  total_questions: number;
  correct_count: number;
  wrong_count: number;
  wrong_answers: {
    index: number;
    question: string;
    student_answer: string;
    correct_answer: string;
    is_correct: boolean;
    knowledge_point: string;
  }[];
  created_at: string;
}

export async function getRandomChallengeAlerts(
  token: string,
  classId: number,
): Promise<{ alerts: RandomChallengeAlert[]; total: number }> {
  return fetchAPI(`/teacher/homework/random-challenges/${classId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** 学生上传错题照片（AI识别+录入） */
export async function uploadErrorPhoto(
  studentId: number,
  imageBase64: string,
  knowledgePoint?: string,
  note?: string,
): Promise<{
  id: number;
  question_text: string;
  correct_answer: string;
  analysis: string;
  knowledge_point: string;
  error_type: string;
  image_path: string;
  message: string;
}> {
  const fd = new FormData();
  fd.append('student_id', String(studentId));
  fd.append('image', imageBase64);
  if (knowledgePoint) fd.append('knowledge_point', knowledgePoint);
  if (note) fd.append('note', note);
  return fetchAPI('/student/errors/upload', {
    method: 'POST',
    body: fd,
    timeout: 120000,
  });
}

/** 获取每周回炉列表 */
export async function fetchReheatList(
  studentId: number,
): Promise<{
  pending: any[];
  mastered: any[];
  stats: { total_resolved: number; pending_count: number; mastered_count: number };
}> {
  return fetchAPI(`/student/errors/reheat/${studentId}`);
}

/** 生成错题拓展练习（异步任务） */
export async function generateExpansion(token: string, studentId: number): Promise<{ task_id: string; message: string }> {
  const fd = new FormData();
  fd.append('student_id', String(studentId));
  return fetchAPI('/student/errors/expansion', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

/** 轮询拓展练习生成状态 */
export async function getExpansionTask(taskId: string): Promise<{
  status: 'running' | 'done' | 'error';
  result?: { knowledge_tag: string; questions: any[] };
  error?: string;
}> {
  return fetchAPI(`/student/errors/expansion/task/${taskId}`);
}

/** 提交拓展练习答题结果 */
export async function submitExpansionAnswer(
  token: string,
  data: { student_id: number; question_text: string; student_answer: string; correct_answer: string; knowledge_point: string; all_correct: boolean },
): Promise<{ result: string; message: string; points?: number }> {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => fd.append(k, String(v)));
  return fetchAPI('/student/errors/expansion/answer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

// ======================== 课堂交互式探索提问 ========================

export interface InquiryStage {
  stage: string;
  stage_goal: string;
  questions: {
    question: string;
    expected_answer: string;
    guide_strategy: string;
    difficulty: string;
    teaching_tip: string;
  }[];
}

export interface InquiryResult {
  lesson_title: string;
  unit_info: string;
  stages: InquiryStage[];
}

export async function generateInquiry(
  token: string,
  data: { lesson_title: string; unit_info?: string; difficulty?: string },
): Promise<{ success: boolean; data: InquiryResult }> {
  const form = new FormData();
  form.append('lesson_title', data.lesson_title);
  form.append('unit_info', data.unit_info || '');
  form.append('difficulty', data.difficulty || 'mixed');
  form.append('authorization', token);
  return fetchAPI('/inquiry/generate', {
    method: 'POST',
    body: form,
    timeout: 120000,
  });
}

export async function saveInquiry(
  token: string,
  data: { lesson_code: string; lesson_title: string; unit_code: string; inquiry_json: string },
): Promise<{ success: boolean }> {
  const form = new FormData();
  form.append('lesson_code', data.lesson_code);
  form.append('lesson_title', data.lesson_title);
  form.append('unit_code', data.unit_code);
  form.append('inquiry_json', data.inquiry_json);
  form.append('authorization', token);
  return fetchAPI('/inquiry/save', { method: 'POST', body: form });
}

export async function loadInquiry(
  token: string,
  lesson_code: string,
): Promise<{ success: boolean; data: any | null }> {
  const params = new URLSearchParams({ lesson_code, authorization: token });
  return fetchAPI(`/inquiry/load?${params.toString()}`, { method: 'GET' });
}

// ======================== 创意闯关 ========================

export interface ChallengeLevel {
  level: number;
  level_name: string;
  scene: string;
  question: string;
  answer: string;
  explanation: string;
  knowledge_point: string;
  difficulty: string;
  question_type: string;
}

export interface ChallengeResult {
  theme: string;
  theme_intro: string;
  levels: ChallengeLevel[];
  knowledge_points: string[];
}

export interface ChallengeAnswerResult {
  is_correct: boolean;
  points_earned: number;
  correct_answer: string;
  error_note_id?: number | null;
  session_id?: number | null;
  error_analysis?: {
    knowledge_point: string;
    knowledge_explanation: string;
    common_mistake: string;
    mnemonic: string;
    type_features: string;
  };
  similar_questions?: {
    questions: { index: number; question: string; answer: string; knowledge_point: string; difficulty: string; explanation: string }[];
  };
  guided_correction?: any;
}

export async function getChallengeCurriculum(): Promise<{ success: boolean; data: Record<string, any> }> {
  return fetchAPI('/challenge/curriculum');
}

export async function startChallenge(
  token: string,
  data: { unit_code: string; lesson_code: string },
): Promise<{ success: boolean; task_id: string }> {
  const form = new FormData();
  form.append('unit_code', data.unit_code);
  form.append('lesson_code', data.lesson_code);
  return fetchAPI('/challenge/start', {
    method: 'POST',
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
  });
}

export async function pollChallengeTask(taskId: string): Promise<{ success: boolean; status: string; data?: ChallengeResult; error?: string }> {
  return fetchAPI(`/challenge/task/${taskId}`, { timeout: 10000 });
}

export async function submitChallengeAnswer(
  token: string,
  data: {
    lesson_code: string;
    level_index: number;
    question: string;
    student_answer: string;
    correct_answer: string;
    knowledge_point: string;
  },
): Promise<{ success: boolean; data: ChallengeAnswerResult }> {
  const form = new FormData();
  form.append('lesson_code', data.lesson_code);
  form.append('level_index', String(data.level_index));
  form.append('question', data.question);
  form.append('student_answer', data.student_answer);
  form.append('correct_answer', data.correct_answer);
  form.append('knowledge_point', data.knowledge_point);
  return fetchAPI('/challenge/answer', {
    method: 'POST',
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
  });
}

export async function submitSimilarAnswer(
  token: string,
  data: { question: string; student_answer: string; correct_answer: string; knowledge_point: string },
): Promise<{ success: boolean; data: { is_correct: boolean; points_earned: number; correct_answer: string } }> {
  const form = new FormData();
  form.append('question', data.question);
  form.append('student_answer', data.student_answer);
  form.append('correct_answer', data.correct_answer);
  form.append('knowledge_point', data.knowledge_point);
  return fetchAPI('/challenge/similar-answer', {
    method: 'POST',
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60000,
  });
}

export async function generateChallengeHint(
  token: string,
  data: { question: string; correct_answer: string; knowledge_point: string; student_answer?: string },
): Promise<{ success: boolean; data: { hint: string; thinking_path: string } }> {
  const form = new FormData();
  form.append('question', data.question);
  form.append('correct_answer', data.correct_answer);
  form.append('knowledge_point', data.knowledge_point);
  form.append('student_answer', data.student_answer || '');
  return fetchAPI('/challenge/hint', {
    method: 'POST',
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });
}

export async function getLessonStats(
  token: string,
  lesson_code: string,
): Promise<{ success: boolean; data: { lesson_code: string; total: number; correct: number; accuracy: number } }> {
  return fetchAPI(`/challenge/lesson-stats/${encodeURIComponent(lesson_code)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
}

export async function completeChallengeSession(
  token: string,
  session_id: number,
): Promise<{ success: boolean; data: { already_completed: boolean; venue_unlocked_next: boolean; next_unit_code: string | null; completed_count: number } }> {
  const form = new FormData();
  form.append('session_id', String(session_id));
  return fetchAPI('/challenge/complete', {
    method: 'POST',
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
}

// ======================== 错题康复流程（rehab） ========================

export type RehabStatus = 'pending' | 'guided' | 'recovered';

export interface RehabStats {
  rehab_pending: number;
  rehab_guided: number;
  rehab_recovered: number;
  [key: string]: number;
}

export async function startRehab(
  token: string,
  errorId: number,
): Promise<{ error_id: number; rehab_status: RehabStatus; previous_status: RehabStatus }> {
  return fetchAPI(`/student/errors/${errorId}/rehab/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function completeRehab(
  token: string,
  errorId: number,
  via: 'xiaocong' | 'similar' | 'guided' | 'challenge' = 'similar',
): Promise<{ error_id: number; rehab_status: RehabStatus; via: string | null; completed_at: string }> {
  return fetchAPI(`/student/errors/${errorId}/rehab/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ via }),
  });
}

// ======================== 个人知识图谱 ========================

export interface KnowledgeNode {
  id: string;
  name: string;
  mastery: number;
  category: string;
  status: string; // mastered / learning / weak / not_started
  error_count: number;
  unit_code?: string;
  unit_name?: string;
  lesson_code?: string;
  lesson_title?: string;
  keywords?: string[];
}

export interface UnitNode {
  unit_code: string;
  unit_name: string;
  category: string;
  lesson_count: number;
  kp_count: number;
  mastered_count: number;
  learning_count: number;
  weak_count: number;
  not_started_count: number;
  avg_mastery: number;
}

export interface KnowledgeGraphData {
  summary: string;
  nodes: KnowledgeNode[];
  unit_nodes: UnitNode[];
  weak_areas: string[];
  strength_areas: string[];
  suggestions: string[];
}

export async function getStudentKnowledgeGraph(studentId: number): Promise<{ success: boolean; data: { student: any; graph: KnowledgeGraphData; total_errors: number; total_practices: number } }> {
  return fetchAPI(`/knowledge/student/${studentId}`, { timeout: 120000 });
}

export async function getStudentRawData(studentId: number): Promise<{ success: boolean; student: any; kp_stats: any; total_errors: number }> {
  return fetchAPI(`/knowledge/student-raw/${studentId}`);
}

// ======================== 班级共性错题 ========================

export async function getClassCommonErrors(classId: number, assignmentIds?: number[]): Promise<{
  success: boolean;
  data: {
    student_count: number;
    total_errors: number;
    kp_stats: Record<string, { count: number; students: string[]; examples: any[] }>;
    ai_analysis: {
      common_weak_points: { knowledge_point: string; error_count: number; error_rate: number; root_cause: string; teaching_suggestion: string }[];
      overall_analysis: string;
      urgent_actions: string[];
      recommended_exercises: string[];
    };
  };
}> {
  const params = new URLSearchParams();
  if (assignmentIds?.length) {
    assignmentIds.forEach(id => params.append('assignment_ids', String(id)));
  }
  const query = params.toString();
  return fetchAPI(`/knowledge/class/${classId}${query ? `?${query}` : ''}`, { timeout: 120000 });
}

export async function uploadTeacherQuestion(
  token: string,
  data: {
    unit_code: string;
    question_type?: string;
    difficulty?: string;
    content: string;
    answer: string;
    analysis?: string;
    knowledge_point?: string;
  },
): Promise<{ success: boolean; message: string }> {
  const form = new FormData();
  form.append('unit_code', data.unit_code);
  form.append('question_type', data.question_type || 'fill');
  form.append('difficulty', data.difficulty || 'basic');
  form.append('content', data.content);
  form.append('answer', data.answer);
  form.append('analysis', data.analysis || '');
  form.append('knowledge_point', data.knowledge_point || '');
  form.append('authorization', token);
  return fetchAPI('/knowledge/upload-question', { method: 'POST', body: form });
}

// ===== 教师拍照出题 OCR 识别 =====
export async function ocrTeacherQuestion(
  token: string,
  file: File,
): Promise<{
  success: boolean;
  data: {
    question_text: string;
    answer: string;
    knowledge_point: string;
    question_type: string;
    analysis: string;
    error?: string;
  };
}> {
  const form = new FormData();
  form.append('file', file);
  return fetchAPI('/knowledge/ocr-question', {
    method: 'POST',
    body: form,
    headers: { Authorization: token },
    timeout: 60000,
  });
}

// ===== 教师作业管理 API =====

export interface AssignmentQuestion {
  index: number;
  question_text: string;
  correct_answer: string;
  analysis: string;
  knowledge_point: string;
  difficulty: string;
}

export interface Assignment {
  id: number;
  class_id: number;
  class_name?: string;
  teacher_id: number;
  title: string;
  description: string;
  unit_code: string;
  type: string;
  source_image: string;
  status: 'draft' | 'published';
  due_date: string | null;
  created_at: string;
  question_count: number;
  questions: AssignmentQuestion[];
  answers: { index: number; correct_answer: string; analysis: string; knowledge_point: string }[];
  stats?: {
    total_students: number;
    submitted: number;
    unsubmitted: number;
    submission_rate: number;
    avg_correct_rate: number;
  };
}

export interface AssignmentStudentSubmission {
  id: number;
  name: string;
  student_no: string;
  layer: string;
  points: number;
  status: string;
  submitted_at: string | null;
  correct_count: number;
  total_questions: number;
  accuracy: number;
  submission_id: number | null;
  done: boolean;
}

export async function extractHomeworkFromImage(
  token: string,
  file: File,
): Promise<{ task_id: string; image_path: string }> {
  const form = new FormData();
  form.append('file', file);
  return fetchAPI('/teacher/homework/extract', {
    method: 'POST',
    body: form,
    timeout: 120000,
    headers: { authorization: token },
  });
}

export async function pollExtractTask(
  token: string,
  taskId: string,
): Promise<{
  task_id: string;
  status: string;
  result?: { title: string; questions: AssignmentQuestion[]; summary: string };
  image_path?: string;
  error?: string;
}> {
  return fetchAPI(`/teacher/homework/extract-task/${taskId}`, {
    headers: { authorization: token },
    timeout: 30000,
  });
}

export async function createAssignment(
  token: string,
  data: {
    class_id: number;
    title: string;
    description?: string;
    unit_code?: string;
    source_image?: string;
    questions: AssignmentQuestion[];
    due_date?: string;
  },
): Promise<{ id: number; message: string }> {
  return fetchAPI('/teacher/homework', {
    method: 'POST',
    headers: { authorization: token },
    body: JSON.stringify(data),
  });
}

export async function getAssignments(token: string): Promise<{ assignments: Assignment[] }> {
  return fetchAPI('/teacher/homework', { headers: { authorization: token } });
}

export async function getAssignmentDetail(token: string, id: number): Promise<Assignment> {
  return fetchAPI(`/teacher/homework/${id}`, { headers: { authorization: token } });
}

export async function publishAssignment(token: string, id: number): Promise<{ message: string }> {
  return fetchAPI(`/teacher/homework/${id}/publish`, {
    method: 'POST',
    headers: { authorization: token },
  });
}

export async function deleteAssignment(token: string, id: number): Promise<{ message: string }> {
  return fetchAPI(`/teacher/homework/${id}`, {
    method: 'DELETE',
    headers: { authorization: token },
  });
}

export async function getAssignmentSubmissions(
  token: string,
  id: number,
): Promise<{ assignment_id: number; class_id: number; students: AssignmentStudentSubmission[] }> {
  return fetchAPI(`/teacher/homework/${id}/submissions`, { headers: { authorization: token } });
}

export async function analyzeAssignment(
  token: string,
  id: number,
): Promise<{
  assignment_id: number;
  overall_analysis: string;
  common_weak_points: {
    knowledge_point: string;
    error_count: number;
    error_rate: number;
    root_cause: string;
    teaching_suggestion: string;
  }[];
  urgent_actions: string[];
  recommended_exercises: string[];
}> {
  return fetchAPI(`/teacher/homework/${id}/analyze`, {
    method: 'POST',
    headers: { authorization: token },
    timeout: 120000,
  });
}

/* ──────────────────────────────────────────────
   学情分析 API
   ────────────────────────────────────────────── */

export interface AnalyticsOverview {
  class_id: number;
  class_name: string;
  student_count: number;
  layer_distribution: { basic: number; advanced: number; extension: number };
  preview: { total_tasks: number; submission_count: number; submission_rate: number; avg_accuracy: number };
  homework: { total_assignments: number; submission_count: number; submission_rate: number; avg_accuracy: number };
  errors: { total: number; unresolved: number; resolved_rate: number };
  exams: { total: number; avg_score: number; pass_rate: number; excellent_rate: number };
  common_errors: { knowledge_point: string; count: number; error_rate: number }[];
  students: AnalyticsStudent[];
  exam_trend: { exam_id: number; title: string; date: string; avg_score: number; pass_rate: number; excellent_rate: number; total: number }[];
}

export interface AnalyticsStudent {
  id: number;
  name: string;
  layer: string;
  points: number;
  preview_done: number;
  preview_accuracy: number;
  hw_done: number;
  hw_accuracy: number;
  exam_score: number | null;
  exam_title: string;
  error_count: number;
  weak_points: string[];
  mastery: number;
}

export interface ExamInfo {
  id: number;
  title: string;
  description: string;
  unit_code: string;
  max_score: number;
  exam_date: string;
  source_image: string;
  questions_json: string;
  result_count: number;
  avg_score: number | null;
}

export interface ExamScore {
  id: number;
  student_id: number;
  name: string;
  student_no: string;
  score: number;
  correct_count: number;
  total_count: number;
  status: string;
}

export interface TieredWeeklyPlan {
  tier: string;
  plan: {
    title: string;
    weekly_goal: string;
    plan: { day: string; focus: string; exercises: string[]; notes: string }[];
    key_points: string[];
    printable_html: string;
  };
}

export interface AutoLayerResult {
  class_id: number;
  total_students: number;
  adjustments: {
    student_id: number;
    name: string;
    old_layer: string;
    new_layer: string;
    composite_score: number;
    changed?: boolean;
  }[];
}

export async function getAnalyticsOverview(token: string, classId: number): Promise<AnalyticsOverview> {
  return fetchAPI(`/analytics/${classId}/overview`, { headers: { authorization: token } });
}

export async function analyzeClassErrors(token: string, classId: number): Promise<{ analysis: any }> {
  return fetchAPI(`/analytics/${classId}/analyze-errors`, {
    method: 'POST',
    headers: { authorization: token },
    timeout: 120000,
  });
}

export async function createExam(token: string, classId: number, data: {
  title: string; description?: string; unit_code?: string; max_score?: number; exam_date?: string;
}): Promise<{ id: number; title: string }> {
  return fetchAPI(`/analytics/${classId}/exam`, {
    method: 'POST',
    headers: { authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function uploadExamImage(token: string, classId: number, file: File): Promise<{ task_id: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('authorization', token);
  return fetchAPI(`/analytics/${classId}/exam-upload`, { method: 'POST', body: form, timeout: 120000 });
}

export async function pollExamExtractTask(token: string, taskId: string): Promise<any> {
  return fetchAPI(`/analytics/exam-extract-task/${taskId}`, { headers: { authorization: token } });
}

export async function listExams(token: string, classId: number): Promise<{ exams: ExamInfo[] }> {
  return fetchAPI(`/analytics/${classId}/exams`, { headers: { authorization: token } });
}

export async function inputExamScores(token: string, classId: number, examId: number,
  scores: { student_id: number; score: number; correct_count?: number; total_count?: number }[]
): Promise<{ exam_id: number; inserted: number }> {
  return fetchAPI(`/analytics/${classId}/exam/${examId}/scores`, {
    method: 'POST',
    headers: { authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(scores),
  });
}

export async function getExamScores(token: string, classId: number, examId: number): Promise<{ scores: ExamScore[] }> {
  return fetchAPI(`/analytics/${classId}/exam/${examId}/scores`, { headers: { authorization: token } });
}

export async function deleteExam(token: string, classId: number, examId: number): Promise<{ deleted: boolean }> {
  return fetchAPI(`/analytics/${classId}/exam/${examId}`, {
    method: 'DELETE',
    headers: { authorization: token },
  });
}

export async function generateWeeklyPlan(token: string, classId: number, tier: string): Promise<TieredWeeklyPlan> {
  return fetchAPI(`/analytics/${classId}/weekly-plan`, {
    method: 'POST',
    headers: { authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
    timeout: 120000,
  });
}

export async function weeklyAutoLayer(token: string, classId: number): Promise<AutoLayerResult> {
  return fetchAPI(`/analytics/${classId}/auto-layer`, {
    method: 'POST',
    headers: { authorization: token },
  });
}

/* ──────────────────────────────────────────────
   积分商城 API
   ────────────────────────────────────────────── */

export interface StoreItem {
  id: number;
  name: string;
  description: string;
  points: number;
  stock: number;
  icon: string;
  status: string;
}

export interface RedemptionRecord {
  id: number;
  item_name: string;
  icon: string;
  student_name?: string;
  points: number;
  status: string;
  teacher_note: string;
  created_at: string;
  delivered_at?: string;
}

export async function createStoreItem(token: string, data: { class_id: number; name: string; description?: string; points: number; stock?: number; icon?: string }): Promise<{ id: number }> {
  return fetchAPI('/store/items', { method: 'POST', headers: { authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}

export async function listStoreItems(token: string, classId: number): Promise<{ items: StoreItem[] }> {
  return fetchAPI(`/store/items/${classId}`, { headers: { authorization: token } });
}

export async function updateStoreItem(token: string, itemId: number, data: any): Promise<{ ok: boolean }> {
  return fetchAPI(`/store/items/${itemId}`, { method: 'PUT', headers: { authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}

export async function deleteStoreItem(token: string, itemId: number): Promise<{ ok: boolean }> {
  return fetchAPI(`/store/items/${itemId}`, { method: 'DELETE', headers: { authorization: token } });
}

export async function redeemItem(token: string, itemId: number): Promise<{ ok: boolean; item_name: string; points_spent: number; remaining_points: number }> {
  return fetchAPI(`/store/redeem/${itemId}`, { method: 'POST', headers: { authorization: token } });
}

export async function myRedemptions(token: string): Promise<{ redemptions: RedemptionRecord[] }> {
  return fetchAPI('/store/my-redemptions', { headers: { authorization: token } });
}

export async function listRedemptionsByClass(token: string, classId: number): Promise<{ redemptions: RedemptionRecord[] }> {
  return fetchAPI(`/store/redemptions/${classId}`, { headers: { authorization: token } });
}

export async function updateRedemption(token: string, redemptionId: number, status: string, note?: string): Promise<{ ok: boolean }> {
  return fetchAPI(`/store/redemptions/${redemptionId}`, { method: 'PUT', headers: { authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note: note || '' }) });
}

/* 教师手动加分 */
export interface ClassStudentForPoints {
  id: number;
  name: string;
  points: number;
  layer: string;
}

export async function teacherAddPoints(token: string, studentId: number, points: number, reason: string): Promise<{ ok: boolean; student_name: string; points_added: number; new_total: number }> {
  return fetchAPI('/store/teacher/add-points', { method: 'POST', headers: { authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, points, reason }) });
}

export async function getClassStudentsForPoints(token: string, classId: number): Promise<{ students: ClassStudentForPoints[] }> {
  return fetchAPI(`/store/teacher/students/${classId}`, { headers: { authorization: token } });
}

// ======================== 个人资源库 ========================

export interface LibraryResource {
  id: number;
  title: string;
  category: string;
  grade: string;
  semester: string;
  description: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  tags: string;
  created_at: string;
}

export async function uploadResource(token: string, formData: FormData): Promise<{ ok: boolean; id: number }> {
  return fetchAPI('/resource-library/upload', { method: 'POST', headers: { authorization: token }, body: formData });
}

export async function listLibraryResources(token: string, category?: string, grade?: string, q?: string, page?: number): Promise<{ resources: LibraryResource[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (grade) params.set('grade', grade);
  if (q) params.set('q', q);
  if (page) params.set('page', String(page));
  return fetchAPI(`/resource-library/list?${params.toString()}`, { headers: { authorization: token } });
}

export async function updateLibraryResource(token: string, id: number, data: Partial<LibraryResource>): Promise<{ ok: boolean }> {
  return fetchAPI(`/resource-library/${id}`, { method: 'PUT', headers: { authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}

export async function deleteLibraryResource(token: string, id: number): Promise<{ ok: boolean }> {
  return fetchAPI(`/resource-library/${id}`, { method: 'DELETE', headers: { authorization: token } });
}

export async function listResourceCategories(): Promise<{ categories: string[] }> {
  return fetchAPI('/resource-library/categories');
}

// ===== 每日科普小知识 =====

export interface DailyFact {
  id: number;
  title: string;
  content: string;
  fun_fact: string;
  category: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  fact_date: string;
  has_read: boolean;
  answered_correctly: number;
}

export async function getTodayFact(token: string): Promise<{ success: boolean; data: DailyFact }> {
  return fetchAPI(`/daily-fact/today?authorization=${encodeURIComponent(token)}`);
}

export async function submitFactRead(token: string, factId: number, studentAnswer: string): Promise<{ success: boolean; data: { already_read: boolean; points_earned: number; is_correct: boolean; correct_answer: string; explanation?: string } }> {
  const body = new URLSearchParams();
  body.append('fact_id', String(factId));
  body.append('student_answer', studentAnswer);
  body.append('authorization', token);
  return fetchAPI('/daily-fact/read', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
}

export async function getFactHistory(token: string, page = 1, pageSize = 10): Promise<{ success: boolean; data: { list: DailyFact[]; total: number; page: number; page_size: number } }> {
  return fetchAPI(`/daily-fact/history?page=${page}&page_size=${pageSize}&authorization=${encodeURIComponent(token)}`);
}

// ===== 趣味小游戏 =====

export interface Puzzle24 {
  numbers: number[];
  solution: string;
  difficulty: string;
}

export interface SpeedQuizQuestion {
  question: string;
  answer: string;
  difficulty: string;
}

export interface TessellationQuestion {
  question: string;
  question_type: 'choice' | 'fill';
  options?: string[];
  answer: string;
  analysis: string;
  knowledge_point: string;
}

export interface GameRecord {
  game_type: string;
  score: number;
  correct_count: number;
  total_count: number;
  time_used: number;
  detail: Record<string, unknown>;
  wrong_questions?: { question: string; student_answer: string; correct_answer: string; knowledge_point?: string }[];
}

export interface LeaderboardEntry {
  rank: number;
  student_id: number;
  name: string;
  avatar: string;
  game_type: string;
  score: number;
  correct_count: number;
  total_count: number;
  time_used: number;
  is_me: boolean;
}

export async function get24Points(token: string, count = 5): Promise<{ success: boolean; data: { puzzles: Puzzle24[] } }> {
  return fetchAPI(`/fun-games/24points?count=${count}&authorization=${encodeURIComponent(token)}`);
}

export async function verify24Points(token: string, numbers: string, expression: string): Promise<{ success: boolean; data: { is_correct: boolean; result?: number; reason: string } }> {
  const body = new URLSearchParams();
  body.append('numbers', numbers);
  body.append('expression', expression);
  body.append('authorization', token);
  return fetchAPI('/fun-games/24points/verify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
}

export async function getSpeedQuiz(token: string, count = 10, difficulty = 'mixed', lessonCode?: string): Promise<{ success: boolean; data: { questions: SpeedQuizQuestion[] } }> {
  const params = new URLSearchParams();
  params.set('count', String(count));
  params.set('difficulty', difficulty);
  params.set('authorization', token);
  if (lessonCode) params.set('lesson_code', lessonCode);
  return fetchAPI(`/fun-games/speed-quiz?${params.toString()}`);
}

export async function getTessellationQuestions(token: string, count = 10): Promise<{ success: boolean; data: { questions: TessellationQuestion[] } }> {
  return fetchAPI(`/fun-games/tessellation?count=${count}&authorization=${encodeURIComponent(token)}`);
}

export async function saveGameRecord(token: string, req: GameRecord): Promise<{ success: boolean; data: { points_earned: number; daily_earned: number; daily_cap: number } }> {
  return fetchAPI(`/fun-games/record?authorization=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
}

export async function getGameLeaderboard(token: string, gameType?: string, limit = 20): Promise<{ success: boolean; data: LeaderboardEntry[] }> {
  const params = new URLSearchParams();
  if (gameType) params.set('game_type', gameType);
  params.set('limit', String(limit));
  params.set('authorization', token);
  return fetchAPI(`/fun-games/leaderboard?${params.toString()}`);
}

export async function getMyGameRecords(token: string, gameType?: string, limit = 20): Promise<{ success: boolean; data: any[] }> {
  const params = new URLSearchParams();
  if (gameType) params.set('game_type', gameType);
  params.set('limit', String(limit));
  params.set('authorization', token);
  return fetchAPI(`/fun-games/my-records?${params.toString()}`);
}

// ===== AI 智能体「小聪」API =====

// v3 - 苏格拉底式 5 步引导 + 类型 A/B 分流 + 3 道巩固题
export type XiaocongStage =
  | 'step1_thought'
  | 'step2_review'
  | 'step3_formula'
  | 'step4_calc'
  | 'step5_reflect'
  | 'recovery_questions'
  | 'done'
  | 'b_quick_check';

export interface XiaocongChatResult {
  error_note_id: number;
  student_id: number;
  stage: XiaocongStage;
  node: XiaocongStage;
  reply: string;
  current_question: string | null;
  current_answer: string | null;
  current_knowledge_point: string | null;
  summary_text: string | null;
  current_stage_label: string;
  session_round: number;
  user_mastered: boolean;
  // v3 新增字段
  error_type: 'A' | 'B' | null;
  topic: string;
  node_stuck_count: number;
  total_stuck_count: number;
  recovery_q_index: number;
  is_node_advance: boolean;
}

export async function chatWithXiaocong(
  token: string,
  errorNoteId: number,
  message: string,
  supplements?: { question_text?: string; correct_answer?: string; knowledge_point?: string }
): Promise<XiaocongChatResult> {
  return fetchAPI('/student/xiaocong/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      error_note_id: errorNoteId,
      message,
      ...(supplements || {}),
    }),
    timeout: 90000,
  });
}

export async function resetXiaocongSession(token: string, errorNoteId: number) {
  return fetchAPI('/student/xiaocong/reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ error_note_id: errorNoteId }),
  });
}

export async function getXiaocongStatus(token: string, errorNoteId: number) {
  return fetchAPI(`/student/xiaocong/status/${errorNoteId}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
}

// ===== 小聪历史翻阅记录 =====

export interface XiaocongSessionSummary {
  id: number;
  student_id: number;
  error_note_id: number;
  question_text: string;
  question_preview: string;
  knowledge_point: string;
  current_node: string;
  error_type: string;
  topic: string;
  user_mastered: number;
  summary_text: string;
  message_count: number;
  round_count: number;
  status: string;        // active | completed | reset
  started_at: string;
  last_active_at: string;
  completed_at: string | null;
  err_kp?: string;
}

export interface XiaocongSessionDetail extends XiaocongSessionSummary {
  student_answer: string;
  correct_answer: string;
  recovery_q_index: number;
  history: { role: string; content: string }[];
}

export async function listXiaocongSessions(
  token: string,
  limit = 100
): Promise<{ student_id: number; count: number; sessions: XiaocongSessionSummary[] }> {
  return fetchAPI(`/student/xiaocong/sessions?limit=${limit}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
}

export async function getXiaocongSession(
  token: string,
  sessionId: number
): Promise<XiaocongSessionDetail> {
  return fetchAPI(`/student/xiaocong/sessions/${sessionId}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
}

export async function deleteXiaocongSession(token: string, sessionId: number) {
  return fetchAPI(`/student/xiaocong/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token },
  });
}

export async function getXiaocongForError(
  token: string,
  errorNoteId: number
): Promise<{ found: boolean; session: XiaocongSessionDetail | null }> {
  return fetchAPI(`/student/xiaocong/error/${errorNoteId}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
}
