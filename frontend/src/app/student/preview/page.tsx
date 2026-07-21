'use client';

import { useState, useEffect, useRef } from 'react';
import {
  BookOpen, CheckCircle2, XCircle, RefreshCw, ChevronRight,
  Star, Flame, Crown, Video, FileText, Lightbulb, AlertCircle,
  PlayCircle, Pause, Lock, Eye, Clock, ExternalLink, Target,
} from 'lucide-react';
import { getStoredUser, studentPreviews, submitPreviewAnswer, submitWatchLog } from '@/lib/api';

interface PreviewQuestion {
  id: number;
  question_text: string;
  question_type: string;
  difficulty: string;
  options: string;
}

interface LayerVideo {
  title: string;
  url?: string;
  bvid?: string;
  page?: number;
  embed_url?: string;
  platform: string;
  duration: number;
  description: string;
}

interface WatchStatus {
  completed: boolean;
  watch_duration: number;
  total_duration: number;
}

interface PreviewTask {
  id: number;
  lesson_code: string;
  lesson_title: string;
  unit_code: string;
  preview_content: string;
  video_url: string;
  layer_videos: string;
  material_json: string;
  created_at: string;
  questions: PreviewQuestion[];
  watch_status: Record<string, WatchStatus>;
}

// ===== 结构化预习资料类型 =====

interface MaterialVideo {
  title: string;
  bvid?: string;
  url?: string;
  embed_url?: string;
  platform: string;
  duration: number;
  description: string;
  page?: number;
}

interface KnowledgeGuide {
  topic?: string;
  key_conclusion?: string;
  learning_goals?: string[];
  example_analysis?: {
    question?: string;
    steps?: string[];
  };
}

interface ReferenceItem {
  title: string;
  url: string;
  platform: string;
  description: string;
  highlight?: string;
  bvid?: string;
  layer?: string;
}

interface MaterialData {
  title?: string;
  knowledge_guide?: KnowledgeGuide;
  videos?: MaterialVideo | null;
  knowledge_summary?: Record<string, string[]>;
  preview_questions?: Record<string, Array<{
    question: string;
    type: string;
    options: string[];
    answer: string;
    analysis: string;
    knowledge_point: string;
  }>>;
  reference_materials?: Record<string, ReferenceItem[]>;
  ai_powered?: boolean;
  ai_model?: string;
}

interface PreviewContent {
  title?: string;
  basic?: string[];
  advanced?: string[];
  extension?: string[];
}

const diffConfig = [
  { key: 'basic', label: '基础', icon: Star, color: '#73C067', bg: 'rgba(232, 245, 228, 0.85)' },
  { key: 'advanced', label: '提升', icon: Flame, color: '#FFB86C', bg: 'rgba(255, 240, 219, 0.85)' },
  { key: 'extension', label: '拓展', icon: Crown, color: '#9C7BB8', bg: 'rgba(243, 232, 249, 0.85)' },
];

export default function StudentPreview() {
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<PreviewTask[]>([]);
  const [studentLayer, setStudentLayer] = useState<string>('basic');
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<PreviewTask | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<number, { correct: boolean; correctAnswer?: string; explanation?: string }>>({});
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [showRefs, setShowRefs] = useState<Record<string, boolean>>({});

  // 视频观看状态
  const [activeVideoLayer, setActiveVideoLayer] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const intervalRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    const u = getStoredUser();
    if (u) {
      setUser(u);
      loadTasks(u.class_id, u.id);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      Object.values(intervalRef.current).forEach(clearInterval);
    };
  }, []);

  const loadTasks = async (classId: number, studentId?: number) => {
    if (!classId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await studentPreviews(classId, studentId);
      setTasks(data.tasks || []);
      // 后端返回学生分层（basic/advanced/extension），用于过滤可见题目
      if (data.student_layer) {
        setStudentLayer(data.student_layer);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 根据学生分层返回可见的难度层级集合
  // basic → [basic]；advanced → [basic, advanced]；extension → [basic, advanced, extension]
  const getVisibleLayers = (): string[] => {
    if (studentLayer === 'extension') return ['basic', 'advanced', 'extension'];
    if (studentLayer === 'advanced') return ['basic', 'advanced'];
    return ['basic'];
  };

  // 过滤出当前学生可见的题目
  const getVisibleQuestions = (questions: PreviewQuestion[]): PreviewQuestion[] => {
    const visible = getVisibleLayers();
    return questions.filter(q => visible.includes(q.difficulty));
  };

  const parseLayerVideos = (str: string): Record<string, LayerVideo> => {
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  };

  const parsePreviewContent = (content: string): PreviewContent => {
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  };

  const parseMaterial = (str: string): MaterialData | null => {
    if (!str) return null;
    try {
      const parsed = JSON.parse(str);
      if (parsed && (parsed.knowledge_guide || parsed.knowledge_summary)) {
        // 兼容旧格式：videos 是 dict（{basic, advanced, extension}）时转为单个视频
        if (parsed.videos && typeof parsed.videos === 'object' && !('title' in parsed.videos)) {
          const dict = parsed.videos as Record<string, MaterialVideo | null>;
          let found: MaterialVideo | null = null;
          for (const layer of ['basic', 'advanced', 'extension']) {
            if (dict[layer]) { found = dict[layer]!; break; }
          }
          parsed.videos = found;
        }
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  };

  const isLayerWatched = (layer: string): boolean => {
    if (!selectedTask) return false;
    return selectedTask.watch_status?.[layer]?.completed === true;
  };

  const handleStartWatch = (layer: string, video: LayerVideo) => {
    if (!user || !selectedTask) return;

    // 如果已经在计时，则停止
    if (activeVideoLayer === layer) {
      clearInterval(intervalRef.current[layer]);
      setActiveVideoLayer(null);
      return;
    }

    // 停止其他层的计时
    Object.keys(intervalRef.current).forEach(k => clearInterval(intervalRef.current[k]));
    setActiveVideoLayer(layer);

    const duration = video.duration || 180;
    const currentProgress = progress[layer] || 0;
    const increment = 100 / duration; // 每秒+1/duration%

    intervalRef.current[layer] = setInterval(() => {
      setProgress(prev => {
        const cur = prev[layer] || currentProgress;
        const next = Math.min(cur + increment, 100);

        if (next >= 100) {
          clearInterval(intervalRef.current[layer]);
          setActiveVideoLayer(null);
          // 保存观看完成
          submitWatchLog(user.id, selectedTask.id, layer, duration, duration, true).catch(console.error);
          // 更新本地状态
          setSelectedTask(t => {
            if (!t) return t;
            return {
              ...t,
              watch_status: {
                ...t.watch_status,
                [layer]: { completed: true, watch_duration: duration, total_duration: duration },
              },
            };
          });
        } else if (Math.floor(next) % 10 === 0) {
          // 每10%保存一次进度
          submitWatchLog(user.id, selectedTask.id, layer, Math.floor(duration * next / 100), duration, false).catch(console.error);
        }

        return { ...prev, [layer]: next };
      });
    }, 1000);
  };

  const handleManualComplete = (layer: string, video: LayerVideo) => {
    if (!user || !selectedTask) return;
    const duration = video.duration || 180;
    clearInterval(intervalRef.current[layer]);
    setActiveVideoLayer(null);
    setProgress(prev => ({ ...prev, [layer]: 100 }));
    submitWatchLog(user.id, selectedTask.id, layer, duration, duration, true).catch(console.error);
    setSelectedTask(t => {
      if (!t) return t;
      return {
        ...t,
        watch_status: {
          ...t.watch_status,
          [layer]: { completed: true, watch_duration: duration, total_duration: duration },
        },
      };
    });
  };

  const handleAnswer = async (questionId: number) => {
    const answer = answers[questionId]?.trim();
    if (!answer || !user) return;
    setSubmitting({ ...submitting, [questionId]: true });
    setErrorMsg('');
    try {
      const result = await submitPreviewAnswer(user.id, questionId, answer);
      setFeedbacks({
        ...feedbacks,
        [questionId]: { correct: result.is_correct, correctAnswer: result.correct_answer, explanation: result.explanation },
      });
    } catch (e: any) {
      setErrorMsg(e.message || '提交失败');
    } finally {
      setSubmitting({ ...submitting, [questionId]: false });
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" style={{ color: '#73C067' }} />
        <p className="text-sm" style={{ color: '#8B7355' }}>加载预习任务中...</p>
      </div>
    );
  }

  // 没有选择任务时，显示任务列表
  if (!selectedTask) {
    return (
      <div className="space-y-6">
        <div className="glass-card-solid p-6 md:p-8">
          <div className="flex items-center gap-4">
            <span className="text-5xl select-none">📖</span>
            <div className="flex-1">
              <h2 className="text-2xl font-bold" style={{ color: '#4A3728' }}>课前预习</h2>
              <p className="text-sm mt-1" style={{ color: '#8B7355' }}>观看分层微课视频，完成预习练习，带着问题去上课！</p>
            </div>
            {/* 学生分层标签 */}
            {(() => {
              const lc = diffConfig.find(d => d.key === studentLayer) || diffConfig[0];
              const LIcon = lc.icon;
              const layerLabel = studentLayer === 'extension' ? '拓展层' : studentLayer === 'advanced' ? '提升层' : '基础层';
              const layerHint = studentLayer === 'extension' ? '基础+提升+拓展题' : studentLayer === 'advanced' ? '基础+提升题' : '基础题';
              return (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 font-bold" style={{ background: lc.bg, color: lc.color }}>
                    <LIcon className="w-3.5 h-3.5" /> 我的分层：{layerLabel}
                  </span>
                  <span className="text-xs" style={{ color: '#B8B0A4' }}>需完成 {layerHint}</span>
                </div>
              );
            })()}
          </div>
        </div>

        {errorMsg && (
          <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: 'rgba(255,235,238,0.9)', color: '#C62828' }}>
            <AlertCircle size={16} /> {errorMsg}
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="glass-card-solid text-center py-16">
            <BookOpen className="w-12 h-12 mx-auto mb-4" style={{ color: '#C8E6C0' }} />
            <p className="text-lg" style={{ color: '#8B7355' }}>老师还没有布置预习任务</p>
            <p className="text-sm mt-2" style={{ color: '#B8B0A4' }}>敬请期待～</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tasks.map(task => {
              const visibleQuestions = getVisibleQuestions(task.questions);
              const total = visibleQuestions.length;
              const mat = parseMaterial(task.material_json);
              const hasMatVideo = !!mat?.videos;
              const oldLayerVideos = parseLayerVideos(task.layer_videos);
              const oldVidCount = Object.keys(oldLayerVideos).length;
              const videoCount = hasMatVideo ? 1 : oldVidCount;
              const watchedCount = Object.values(task.watch_status || {}).filter(w => w.completed).length;
              const hasMat = !!mat;
              return (
                <div
                  key={task.id}
                  className="glass-card p-5 cursor-pointer transition-all hover:scale-[1.02]"
                  onClick={() => {
                    setSelectedTask(task);
                    setAnswers({});
                    setFeedbacks({});
                    setProgress({});
                    setActiveVideoLayer(null);
                    setShowRefs({});
                  }}
                  style={{ background: 'rgba(255, 255, 255, 0.85)' }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(232, 245, 228, 0.9)' }}>
                      <FileText className="w-5 h-5" style={{ color: '#2D5A27' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm truncate" style={{ color: '#4A3728' }}>{task.lesson_title}</h3>
                      <p className="text-xs" style={{ color: '#8B7355' }}>{task.created_at}</p>
                    </div>
                    {hasMat && mat?.ai_powered && (
                      <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(192, 120, 92, 0.15)', color: '#C0785C' }}>AI</span>
                    )}
                    <ChevronRight className="w-5 h-5" style={{ color: '#B8B0A4' }} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {videoCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(232, 245, 228, 0.85)', color: '#2D5A27' }}>
                        <Video className="w-3 h-3" /> {watchedCount}/{videoCount} 视频已看
                      </span>
                    )}
                    {total > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255, 240, 219, 0.85)', color: '#8B5A1B' }}>
                        {total} 道练习题
                      </span>
                    )}
                    {hasMat && (
                      <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(243, 232, 249, 0.85)', color: '#9C7BB8' }}>
                        <BookOpen className="w-3 h-3" /> 结构化预习单
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 选择了任务后，显示结构化预习资料（或旧版格式）
  const material = parseMaterial(selectedTask.material_json);
  const hasMaterial = !!material;
  const previewContent = parsePreviewContent(selectedTask.preview_content);
  const layerVideos = parseLayerVideos(selectedTask.layer_videos);
  // 新格式：单个视频；旧格式从 layer_videos 取
  const matVideo = hasMaterial ? (material!.videos || null) : null;

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: 'rgba(255,235,238,0.9)', color: '#C62828' }}>
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      {/* 返回按钮 + 标题 */}
      <div className="glass-card-solid p-5">
        <button
          onClick={() => setSelectedTask(null)}
          className="text-sm font-medium mb-3 flex items-center gap-1 transition-colors hover:opacity-70"
          style={{ color: '#8B7355' }}
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          返回任务列表
        </button>
        <h2 className="text-xl font-bold" style={{ color: '#4A3728' }}>{selectedTask.lesson_title}</h2>
        <p className="text-xs mt-1" style={{ color: '#8B7355' }}>发布时间：{selectedTask.created_at}</p>
      </div>

      {hasMaterial ? (
        <>
          {/* ===== 新格式：AI结构化预习资料 ===== */}

          {/* 知识引导 */}
          {material!.knowledge_guide && (
            <div className="glass-card-solid p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255, 240, 219, 0.9)' }}>
                  <Lightbulb className="w-4 h-4" style={{ color: '#FFB86C' }} />
                </div>
                <h3 className="text-lg font-bold" style={{ color: '#4A3728' }}>知识引导</h3>
                {material!.ai_powered && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(192, 120, 92, 0.15)', color: '#C0785C' }}>AI生成</span>
                )}
              </div>

              {/* 主题概述 */}
              {material!.knowledge_guide.topic && (
                <div className="mb-4">
                  <p className="text-xs font-bold mb-1.5" style={{ color: '#8B7355' }}>主题概述</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#4A3728' }}>{material!.knowledge_guide.topic}</p>
                </div>
              )}

              {/* 核心结论 */}
              {material!.knowledge_guide.key_conclusion && (
                <div className="mb-4 rounded-xl p-4" style={{ background: 'rgba(255, 248, 240, 0.95)', border: '1.5px solid rgba(255, 184, 108, 0.3)' }}>
                  <p className="text-xs font-bold mb-1.5" style={{ color: '#8B5A1B' }}>核心结论</p>
                  <p className="text-sm font-medium leading-relaxed" style={{ color: '#4A3728' }}>{material!.knowledge_guide.key_conclusion}</p>
                </div>
              )}

              {/* 学习目标 */}
              {material!.knowledge_guide.learning_goals && material!.knowledge_guide.learning_goals.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold mb-2 flex items-center gap-1" style={{ color: '#8B7355' }}>
                    <Target className="w-3.5 h-3.5" /> 学习目标
                  </p>
                  <div className="space-y-1.5">
                    {material!.knowledge_guide.learning_goals.map((g, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-xs font-bold mt-0.5 shrink-0" style={{ color: '#FFB86C' }}>{i + 1}.</span>
                        <span className="text-sm" style={{ color: '#4A3728' }}>{g}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 例题解析 */}
              {material!.knowledge_guide.example_analysis && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(247, 243, 233, 0.9)' }}>
                  <p className="text-xs font-bold mb-2" style={{ color: '#8B7355' }}>例题解析</p>
                  {material!.knowledge_guide.example_analysis.question && (
                    <p className="text-sm font-medium mb-3" style={{ color: '#4A3728' }}>{material!.knowledge_guide.example_analysis.question}</p>
                  )}
                  {material!.knowledge_guide.example_analysis.steps && material!.knowledge_guide.example_analysis.steps.length > 0 && (
                    <div className="space-y-2">
                      {material!.knowledge_guide.example_analysis.steps.map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: 'rgba(255, 184, 108, 0.2)', color: '#FFB86C' }}>
                            {i + 1}
                          </div>
                          <span className="text-sm" style={{ color: '#4A3728' }}>{s}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 微课视频 */}
          {matVideo && (() => {
            const video = matVideo;
            const layerKey = 'main';
            const watched = isLayerWatched(layerKey);
            const prog = progress[layerKey] || (watched ? 100 : 0);
            const vColor = '#2D5A27';
            return (
            <div className="glass-card-solid p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(232, 245, 228, 0.9)' }}>
                  <Video className="w-4 h-4" style={{ color: vColor }} />
                </div>
                <h3 className="text-lg font-bold" style={{ color: '#4A3728' }}>微课视频</h3>
                {watched ? (
                  <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ml-auto" style={{ background: 'rgba(232, 245, 228, 0.9)', color: vColor }}>
                    <CheckCircle2 className="w-3 h-3" /> 已完成
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ml-auto" style={{ background: 'rgba(255, 240, 219, 0.9)', color: '#8B5A1B' }}>
                    <Clock className="w-3 h-3" /> 未完成
                  </span>
                )}
              </div>

              {/* 视频播放器 */}
              <div className="rounded-2xl overflow-hidden" style={{ background: '#1a1a2e' }}>
                <div className="relative aspect-video">
                  <iframe
                    src={video.embed_url || `https://player.bilibili.com/player.html?bvid=${video.bvid}&page=${video.page || 1}&high_quality=1&danmaku=0&autoplay=0`}
                    className="w-full h-full"
                    allowFullScreen
                    scrolling="no"
                    frameBorder="0"
                    sandbox="allow-top-navigation allow-same-origin allow-forms allow-scripts allow-popups"
                    title={video.title}
                    style={{ border: 'none' }}
                  />
                </div>

                {/* 视频信息 + 观看进度 */}
                <div className="px-4 py-3" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.95)' }}>{video.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {video.platform} · {Math.floor((video.duration || 180) / 60)}分{(video.duration || 180) % 60}秒
                      </p>
                    </div>
                    {watched ? (
                      <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0 ml-3" style={{ background: 'rgba(115, 192, 103, 0.9)', color: '#fff' }}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> 已看完
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartWatch(layerKey, video as unknown as LayerVideo)}
                        className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0 ml-3 transition-all hover:scale-105"
                        style={{ background: activeVideoLayer === layerKey ? `${vColor}40` : `${vColor}20`, color: vColor, border: `1px solid ${vColor}60` }}
                      >
                        {activeVideoLayer === layerKey ? <Pause className="w-3 h-3" /> : <PlayCircle className="w-3 h-3" />}
                        {activeVideoLayer === layerKey ? '暂停计时' : '开始计时'}
                      </button>
                    )}
                  </div>

                  {/* 进度条 */}
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }} />
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${prog}%`, background: vColor }}
                      />
                    </div>
                    <span className="text-xs font-mono shrink-0" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {Math.floor((video.duration || 180) * prog / 100)}s / {video.duration || 180}s
                    </span>
                    {!watched && prog >= 50 && (
                      <button
                        onClick={() => handleManualComplete(layerKey, video as unknown as LayerVideo)}
                        className="text-xs px-2 py-1 rounded-full flex items-center gap-1 shrink-0 transition-all hover:scale-105"
                        style={{ background: 'rgba(115, 192, 103, 0.3)', color: '#73C067', border: '1px solid rgba(115, 192, 103, 0.5)' }}
                      >
                        <CheckCircle2 className="w-3 h-3" /> 已看完
                      </button>
                    )}
                  </div>

                  {video.description && (
                    <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{video.description}</p>
                  )}
                </div>
              </div>
            </div>
            );
          })()}

          {/* 知识点总结 */}
          {material!.knowledge_summary && (
            <div className="glass-card-solid p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(243, 232, 249, 0.9)' }}>
                  <BookOpen className="w-4 h-4" style={{ color: '#9C7BB8' }} />
                </div>
                <h3 className="text-lg font-bold" style={{ color: '#4A3728' }}>知识点总结</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {diffConfig.map(({ key, label, icon: Icon, color, bg }) => {
                  const points = material!.knowledge_summary![key] || [];
                  if (points.length === 0) return null;
                  return (
                    <div key={key} className="rounded-xl p-4" style={{ background: bg }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className="w-4 h-4" style={{ color }} />
                        <span className="text-sm font-bold" style={{ color }}>{label}层要点</span>
                      </div>
                      <div className="space-y-2">
                        {points.map((p, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color }} />
                            <span className="text-sm" style={{ color: '#4A3728' }}>{p}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 预习练习题 - 视频锁定机制：需先看完视频才能做题 */}
          {(() => {
            const visibleQuestions = getVisibleQuestions(selectedTask.questions);
            const visibleLayers = getVisibleLayers();
            if (visibleQuestions.length === 0) return null;
            // 视频锁定：如果有视频且未看完，题目锁定
            const videoWatched = matVideo ? isLayerWatched('main') : true;
            const videoLocked = !videoWatched && !!matVideo;
            return (
            <div className="glass-card-solid p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255, 240, 219, 0.9)' }}>
                  <Lightbulb className="w-4 h-4" style={{ color: '#FFB86C' }} />
                </div>
                <h3 className="text-lg font-bold" style={{ color: '#4A3728' }}>预习练习题</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255, 240, 219, 0.85)', color: '#8B5A1B' }}>
                  {visibleQuestions.length} 题
                </span>
                {videoLocked && (
                  <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ml-auto font-bold" style={{ background: 'rgba(255, 235, 238, 0.85)', color: '#E57A9E' }}>
                    <Lock className="w-3.5 h-3.5" /> 请先看完视频解锁
                  </span>
                )}
                {/* 显示学生分层提示 */}
                {(() => {
                  const lc = diffConfig.find(d => d.key === studentLayer) || diffConfig[0];
                  const LIcon = lc.icon;
                  const layerLabel = studentLayer === 'extension' ? '拓展层' : studentLayer === 'advanced' ? '提升层' : '基础层';
                  return (
                    <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ml-auto" style={{ background: lc.bg, color: lc.color }}>
                      <LIcon className="w-3 h-3" /> {layerLabel}
                    </span>
                  );
                })()}
              </div>

              {/* 按层分组显示题目（仅显示当前学生可见的层级） */}
              {diffConfig.filter(d => visibleLayers.includes(d.key)).map(({ key, label, icon: Icon, color, bg }) => {
                const layerQuestions = visibleQuestions.filter(q => q.difficulty === key);
                if (layerQuestions.length === 0) return null;

                return (
                  <div key={key} className="mb-5 last:mb-0">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-4 h-4" style={{ color }} />
                      <span className="text-sm font-bold" style={{ color }}>{label}层（{layerQuestions.length}题）</span>
                    </div>

                    <div className="space-y-3">
                      {layerQuestions.map((q, i) => {
                        const dc = diffConfig.find(d => d.key === q.difficulty) || diffConfig[0];
                        const fb = feedbacks[q.id];
                        const isSubmitting = submitting[q.id];
                        return (
                          <div
                            key={q.id}
                            className="rounded-xl p-4 transition-all"
                            style={{
                              background: videoLocked ? 'rgba(200, 200, 200, 0.15)' : 'rgba(255, 255, 255, 0.7)',
                              border: `1.5px solid ${videoLocked ? 'rgba(200,200,200,0.3)' : dc.color + '30'}`,
                              opacity: videoLocked ? 0.6 : 1,
                            }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ background: dc.color }}>
                                {dc.label}
                              </span>
                              <span className="text-xs font-mono" style={{ color: '#8B7355' }}>第{i + 1}题</span>
                              {videoLocked && <Lock className="w-3.5 h-3.5 ml-auto" style={{ color: '#B8B0A4' }} />}
                            </div>
                            <p className="text-sm font-medium mb-3" style={{ color: '#4A3728' }}>{q.question_text}</p>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder={videoLocked ? '请先观看视频解锁' : '输入你的答案...'}
                                value={answers[q.id] || ''}
                                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !videoLocked) handleAnswer(q.id); }}
                                disabled={videoLocked || fb?.correct}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                                style={{
                                  background: videoLocked ? 'rgba(240, 235, 224, 0.5)' : 'rgba(255, 248, 240, 0.95)',
                                  border: `2px solid ${fb ? (fb.correct ? '#73C067' : '#FFB86C') : videoLocked ? 'rgba(200,200,200,0.3)' : 'rgba(200, 230, 192, 0.7)'}`,
                                  color: '#4A3728',
                                  cursor: videoLocked ? 'not-allowed' : 'text',
                                }}
                              />
                              {fb?.correct ? (
                                <span className="flex items-center gap-1 text-sm font-bold px-3 py-2 rounded-xl" style={{ background: 'rgba(232, 245, 228, 0.9)', color: '#2D5A27' }}>
                                  <CheckCircle2 className="w-4 h-4" /> 正确
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleAnswer(q.id)}
                                  disabled={isSubmitting || !answers[q.id]?.trim() || videoLocked}
                                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                                  style={{ background: videoLocked ? '#ccc' : `linear-gradient(135deg, ${color}, ${color}dd)` }}
                                >
                                  {isSubmitting ? '提交中...' : '提交'}
                                </button>
                              )}
                            </div>
                            {fb && !fb.correct && (
                              <div className="mt-2 space-y-1.5">
                                <div className="flex items-start gap-2 text-sm" style={{ color: '#8B5A1B' }}>
                                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#FF9F4A' }} />
                                  <span>答案不对哦，正确答案是：<strong>{fb.correctAnswer}</strong>，再想想为什么？</span>
                                </div>
                                {fb.explanation && fb.explanation !== '回答正确！' && (
                                  <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(255, 248, 240, 0.8)', color: '#8B5A1B' }}>
                                    <span className="shrink-0">💡</span>
                                    <span>{fb.explanation}</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {fb && fb.correct && (
                              <div className="mt-2 space-y-1.5">
                                <div className="flex items-center gap-2 text-sm" style={{ color: '#2D5A27' }}>
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>太棒了！答对了！</span>
                                </div>
                                {fb.explanation && fb.explanation !== '回答正确！' && (
                                  <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(232, 245, 228, 0.7)', color: '#2D5A27' }}>
                                    <span className="shrink-0">💡</span>
                                    <span>{fb.explanation}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* 参考资料：学生端不显示，仅供教师备课参考 */}
        </>
      ) : (
        <>
          {/* ===== 旧格式：分层视频 + 预习内容 + 答题 ===== */}
          {diffConfig.filter(d => getVisibleLayers().includes(d.key)).map(({ key, label, icon: Icon, color, bg }) => {
        const items = (previewContent as any)?.[key] as string[] || [];
        const video = layerVideos[key];
        const watched = isLayerWatched(key);
        const prog = progress[key] || (watched ? 100 : 0);
        const layerQuestions = selectedTask.questions.filter(q => q.difficulty === key);

        if (items.length === 0 && !video && layerQuestions.length === 0) return null;

        return (
          <div key={key} className="glass-card-solid p-5 md:p-6">
            {/* 层标题 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: '#4A3728' }}>{label}层预习</h3>
                  <p className="text-xs" style={{ color: '#8B7355' }}>
                    {key === 'basic' && '全员必做 · 适配学困生'}
                    {key === 'advanced' && '大部分学生选做 · 适配中等生'}
                    {key === 'extension' && '学优生选做 · 适配尖子生'}
                  </p>
                </div>
              </div>
              {watched ? (
                <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: 'rgba(232, 245, 228, 0.9)', color: '#2D5A27' }}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> 已完成观看
                </span>
              ) : video ? (
                <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: 'rgba(255, 240, 219, 0.9)', color: '#8B5A1B' }}>
                  <Lock className="w-3.5 h-3.5" /> 需先看视频
                </span>
              ) : null}
            </div>

            {/* 视频播放器 - 真实B站嵌入 */}
            {video && (
              <div className="mb-4 rounded-2xl overflow-hidden" style={{ background: '#1a1a2e' }}>
                {/* B站视频iframe嵌入 */}
                <div className="relative aspect-video">
                  <iframe
                    src={video.embed_url || `https://player.bilibili.com/player.html?bvid=${video.bvid}&page=${video.page || 1}&high_quality=1&danmaku=0&autoplay=0`}
                    className="w-full h-full"
                    allowFullScreen
                    scrolling="no"
                    frameBorder="0"
                    sandbox="allow-top-navigation allow-same-origin allow-forms allow-scripts allow-popups"
                    title={video.title}
                    style={{ border: 'none' }}
                  />
                </div>

                {/* 视频信息 + 观看进度 */}
                <div className="px-4 py-3" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.95)' }}>{video.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{video.platform} · {Math.floor(video.duration / 60)}分{video.duration % 60}秒</p>
                    </div>
                    {watched ? (
                      <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0 ml-3" style={{ background: 'rgba(115, 192, 103, 0.9)', color: '#fff' }}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> 已看完
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartWatch(key, video)}
                        className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0 ml-3 transition-all hover:scale-105"
                        style={{ background: activeVideoLayer === key ? `${color}40` : `${color}20`, color, border: `1px solid ${color}60` }}
                      >
                        {activeVideoLayer === key ? <Pause className="w-3 h-3" /> : <PlayCircle className="w-3 h-3" />}
                        {activeVideoLayer === key ? '暂停计时' : '开始计时'}
                      </button>
                    )}
                  </div>

                  {/* 进度条 */}
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }} />
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${prog}%`, background: color }}
                      />
                    </div>
                    <span className="text-xs font-mono shrink-0" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {Math.floor((video.duration || 180) * prog / 100)}s / {video.duration || 180}s
                    </span>
                    {/* 手动标记已看完（进度超过50%时可用） */}
                    {!watched && prog >= 50 && (
                      <button
                        onClick={() => handleManualComplete(key, video)}
                        className="text-xs px-2 py-1 rounded-full flex items-center gap-1 shrink-0 transition-all hover:scale-105"
                        style={{ background: 'rgba(115, 192, 103, 0.3)', color: '#73C067', border: '1px solid rgba(115, 192, 103, 0.5)' }}
                      >
                        <CheckCircle2 className="w-3 h-3" /> 已看完
                      </button>
                    )}
                  </div>

                  {/* 视频描述 */}
                  <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{video.description}</p>
                </div>
              </div>
            )}

            {/* 预习任务内容 */}
            {items.length > 0 && (
              <div className="rounded-xl p-4 mb-4" style={{ background: bg }}>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4" style={{ color }} />
                  <span className="text-sm font-bold" style={{ color }}>{label}层预习任务</span>
                </div>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color }} />
                      <span className="text-sm" style={{ color: '#4A3728' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 练习题（锁定状态） */}
            {layerQuestions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4" style={{ color }} />
                  <span className="text-sm font-bold" style={{ color: '#4A3728' }}>
                    {label}层练习题（{layerQuestions.length}题）
                  </span>
                  {!watched && video && (
                    <span className="text-xs flex items-center gap-1 ml-auto" style={{ color: '#FF9F4A' }}>
                      <Lock className="w-3 h-3" /> 请先看完视频再答题
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {layerQuestions.map((q, i) => {
                    const dc = diffConfig.find(d => d.key === q.difficulty) || diffConfig[0];
                    const fb = feedbacks[q.id];
                    const isSubmitting = submitting[q.id];
                    const locked = !watched && !!video;
                    return (
                      <div
                        key={q.id}
                        className="rounded-xl p-4 transition-all"
                        style={{
                          background: locked ? 'rgba(200, 200, 200, 0.15)' : 'rgba(255, 255, 255, 0.7)',
                          border: `1.5px solid ${locked ? 'rgba(200,200,200,0.3)' : dc.color + '30'}`,
                          opacity: locked ? 0.6 : 1,
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ background: dc.color }}>
                            {dc.label}
                          </span>
                          <span className="text-xs font-mono" style={{ color: '#8B7355' }}>第{i + 1}题</span>
                          {locked && <Lock className="w-3.5 h-3.5 ml-auto" style={{ color: '#B8B0A4' }} />}
                        </div>
                        <p className="text-sm font-medium mb-3" style={{ color: '#4A3728' }}>{q.question_text}</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder={locked ? '请先观看视频解锁' : '输入你的答案...'}
                            value={answers[q.id] || ''}
                            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !locked) handleAnswer(q.id); }}
                            disabled={locked || fb?.correct}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                            style={{
                              background: locked ? 'rgba(240, 235, 224, 0.5)' : 'rgba(255, 248, 240, 0.95)',
                              border: `2px solid ${fb ? (fb.correct ? '#73C067' : '#FFB86C') : locked ? 'rgba(200,200,200,0.3)' : 'rgba(200, 230, 192, 0.7)'}`,
                              color: '#4A3728',
                              cursor: locked ? 'not-allowed' : 'text',
                            }}
                          />
                          {fb?.correct ? (
                            <span className="flex items-center gap-1 text-sm font-bold px-3 py-2 rounded-xl" style={{ background: 'rgba(232, 245, 228, 0.9)', color: '#2D5A27' }}>
                              <CheckCircle2 className="w-4 h-4" /> 正确
                            </span>
                          ) : (
                            <button
                              onClick={() => handleAnswer(q.id)}
                              disabled={isSubmitting || !answers[q.id]?.trim() || locked}
                              className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                              style={{ background: locked ? '#ccc' : `linear-gradient(135deg, ${color}, ${color}dd)` }}
                            >
                              {isSubmitting ? '提交中...' : '提交'}
                            </button>
                          )}
                        </div>
                        {fb && !fb.correct && (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-start gap-2 text-sm" style={{ color: '#8B5A1B' }}>
                              <XCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#FF9F4A' }} />
                              <span>答案不对哦，正确答案是：<strong>{fb.correctAnswer}</strong>，再想想为什么？</span>
                            </div>
                            {fb.explanation && fb.explanation !== '回答正确！' && (
                              <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(255, 248, 240, 0.8)', color: '#8B5A1B' }}>
                                <span className="shrink-0">💡</span>
                                <span>{fb.explanation}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {fb && fb.correct && (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-center gap-2 text-sm" style={{ color: '#2D5A27' }}>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>太棒了！答对了！</span>
                            </div>
                            {fb.explanation && fb.explanation !== '回答正确！' && (
                              <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(232, 245, 228, 0.7)', color: '#2D5A27' }}>
                                <span className="shrink-0">💡</span>
                                <span>{fb.explanation}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
        </>
      )}

      {/* 底部提示 */}
      <div className="glass-card p-4 flex items-center gap-3">
        <Eye className="w-5 h-5 shrink-0" style={{ color: '#FFB86C' }} />
        <p className="text-xs" style={{ color: '#8B7355' }}>
          系统会记录你的视频观看时长和答题情况，老师会根据全班的预习数据针对性地备课。请认真观看视频并作答哦！
        </p>
      </div>
    </div>
  );
}
