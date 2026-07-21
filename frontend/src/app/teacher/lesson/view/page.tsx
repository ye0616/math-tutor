'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, Lightbulb, PlayCircle, RefreshCw, AlertCircle, FileText, Video } from 'lucide-react';
import { getToken, fetchPreviewProxy, type PreviewProxyResult } from '@/lib/api';

function ResourceView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [proxyData, setProxyData] = useState<PreviewProxyResult | null>(null);
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyError, setProxyError] = useState('');

  // 读取 URL 参数
  const title = searchParams.get('title') || '未命名资源';
  const url = searchParams.get('url') || '';
  const platform = searchParams.get('platform') || '';
  const type = searchParams.get('type') || '';
  const bvid = searchParams.get('bvid') || '';
  const embedUrl = searchParams.get('embed_url') || '';
  const duration = parseInt(searchParams.get('duration') || '0', 10);
  const highlight = searchParams.get('highlight') || '';
  const description = searchParams.get('description') || '';
  const format = searchParams.get('format') || '';
  const size = searchParams.get('size') || '';

  const isVideo = !!bvid || type === '微课' || type === 'videos';

  useEffect(() => {
    setToken(getToken() || '');
  }, []);

  // 文档类：抓取代理内容
  useEffect(() => {
    if (isVideo || !url || !token) return;
    let cancelled = false;
    setProxyLoading(true);
    setProxyError('');
    setProxyData(null);
    fetchPreviewProxy(token, url)
      .then((res) => { if (!cancelled) { setProxyData(res); setProxyLoading(false); } })
      .catch((err) => { if (!cancelled) { setProxyError(err.message || '获取内容失败'); setProxyLoading(false); } });
    return () => { cancelled = true; };
  }, [url, token, isVideo]);

  const videoSrc = embedUrl || (bvid
    ? `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&danmaku=0&autoplay=0`
    : '');

  return (
    <div className="min-h-screen" style={{ background: '#FDFBF7' }}>
      {/* 顶部导航 */}
      <header className="sticky top-0 z-10 backdrop-blur-sm" style={{ background: 'rgba(253, 251, 247, 0.85)', borderBottom: '1px solid rgba(212, 197, 160, 0.3)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all hover:opacity-70"
            style={{ background: '#F0EBE0', color: '#3D3D3D' }}
            title="返回上一页">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">返回</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate" style={{ color: '#3D3D3D' }}>{title}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-xs flex-wrap" style={{ color: '#9CA3AF' }}>
              {type && (
                <span className="px-1.5 py-0.5 rounded" style={{ background: '#F0EBE0', color: '#7A756D' }}>{type}</span>
              )}
              {platform && <span>{platform}</span>}
              {format && <span>· {format}</span>}
              {size && <span>· {size}</span>}
              {isVideo && duration > 0 && <span>· 时长 {Math.floor(duration / 60)}分{duration % 60}秒</span>}
            </div>
          </div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80 shrink-0"
              style={{ background: '#3D3D3D', color: '#fff' }}>
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">新标签打开</span>
            </a>
          )}
        </div>
      </header>

      {/* 主体内容 */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="rounded-2xl overflow-hidden mb-5" style={{ background: '#fff', border: '1px solid rgba(212, 197, 160, 0.4)', boxShadow: '2px 2px 0px rgba(60,60,60,0.06)' }}>
          {/* 视频区 */}
          {isVideo ? (
            <div className="bg-black">
              {videoSrc ? (
                <div className="aspect-video">
                  <iframe src={videoSrc} className="w-full h-full" allowFullScreen scrolling="no" frameBorder="0"
                    title={title} style={{ border: 'none' }} allow="autoplay; fullscreen" />
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2d2d3a 0%, #1a1a24 100%)' }}>
                  <Video className="w-12 h-12 text-white opacity-40" />
                </div>
              )}
            </div>
          ) : (
            /* 文档/网页内容区 */
            <div className="p-6 min-h-[300px]">
              {proxyLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-6 h-6 mx-auto mb-3 animate-spin" style={{ color: '#C8B88A' }} />
                  <p className="text-sm" style={{ color: '#7A756D' }}>正在抓取页面内容…</p>
                  <p className="text-xs mt-1" style={{ color: '#B8B0A4' }}>服务端代理获取中</p>
                </div>
              ) : proxyError ? (
                <div className="py-10 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#EF5350' }} />
                  <p className="text-sm mb-1" style={{ color: '#5D5040' }}>无法加载此页面</p>
                  <p className="text-xs mb-4" style={{ color: '#9CA3AF' }}>{proxyError}</p>
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                      style={{ background: '#6B8F71', color: '#fff' }}>
                      <ExternalLink className="w-3.5 h-3.5" /> 在新标签打开原页面
                    </a>
                  )}
                </div>
              ) : proxyData?.success && (proxyData.text?.length || 0) > 50 ? (
                <div>
                  {proxyData.title && proxyData.title !== title && (
                    <h2 className="text-lg font-bold mb-2" style={{ color: '#3D3D3D' }}>{proxyData.title}</h2>
                  )}
                  {proxyData.description && (
                    <p className="text-xs mb-4 pb-3" style={{ color: '#7A756D', borderBottom: '1px dashed #E8DCC4' }}>{proxyData.description}</p>
                  )}
                  {proxyData.images && proxyData.images.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {proxyData.images.slice(0, 4).map((img, i) => (
                        <img key={i} src={img} alt="" className="rounded-lg object-cover"
                          style={{ maxWidth: '220px', maxHeight: '160px' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ))}
                    </div>
                  )}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#3D3D3D', lineHeight: 1.9 }}>
                    {proxyData.text}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: '#C8B88A' }} />
                  <p className="text-sm mb-1" style={{ color: '#5D5040' }}>{title}</p>
                  <p className="text-xs mb-4" style={{ color: '#9CA3AF' }}>
                    {proxyData?.text ? '该页面正文内容较少（可能需要登录）' : '该页面无法直接抓取（需要登录或为动态加载）'}
                  </p>
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                      style={{ background: '#6B8F71', color: '#fff' }}>
                      <ExternalLink className="w-3.5 h-3.5" /> 在新标签打开
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 描述信息 */}
        {description && !highlight && (
          <div className="rounded-xl p-4 mb-5" style={{ background: '#fff', border: '1px solid rgba(212, 197, 160, 0.3)' }}>
            <p className="text-xs font-bold mb-1.5" style={{ color: '#7A756D' }}>资源简介</p>
            <p className="text-sm" style={{ color: '#3D3D3D', lineHeight: 1.7 }}>{description}</p>
          </div>
        )}

        {/* AI 批注（柔和风格） */}
        {highlight && (
          <div className="rounded-xl p-4 mb-5 flex items-start gap-2" style={{ background: '#fff', border: '1px solid rgba(212, 197, 160, 0.3)' }}>
            <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#C8A951' }} />
            <div className="flex-1">
              <p className="text-xs font-bold mb-1" style={{ color: '#7A756D' }}>AI 审查重点</p>
              <p className="text-sm" style={{ color: '#5D5040', lineHeight: 1.7 }}>{highlight}</p>
            </div>
          </div>
        )}

        {/* 提示信息 */}
        <div className="text-center py-4 text-xs" style={{ color: '#B8B0A4' }}>
          {isVideo ? '如视频无法播放，请点击右上角「新标签打开」' : '如页面内容不完整，请点击右上角「新标签打开」'}
        </div>
      </main>
    </div>
  );
}

export default function ResourceViewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FDFBF7' }}>
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: '#C8B88A' }} />
      </div>
    }>
      <ResourceView />
    </Suspense>
  );
}
