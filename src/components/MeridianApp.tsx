'use client';

import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/cn';
import { createImageVariants } from '@/lib/compress';
import type { Place } from '@/lib/types';
import appleIcon from '@/app/apple-icon.png';
import darkAppleIcon from '@/app/icon-dark-512.png';

const MapView = dynamic(() => import('@/components/MapView').then((module) => module.MapView), {
  ssr: false,
  loading: () => <div className="meridian-panel h-[100svh] h-[100dvh] w-full rounded-none md:rounded-[2rem]" />
});

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((module) => module.MarkdownEditor),
  { ssr: false }
);

const TimelineSlider = dynamic(
  () => import('@/components/TimelineSlider').then((module) => module.TimelineSlider),
  { ssr: false }
);

type MeridianAppProps = {
  initialPlaces: Place[];
  canEdit: boolean;
  focusPlaceId?: number;
  siteDescription: string;
};

type EditorState =
  | { mode: 'create'; lat: number; lng: number }
  | { mode: 'edit'; placeId: number }
  | null;

type PlacePayload = {
  title: string;
  content: string;
  images: string[];
  thumbnails: string[];
  author: string | null;
  visited_at: string | null;
  is_locked: boolean;
};

type DateInputSource = string | Date | null | undefined;

function toLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateInputValue(value: DateInputSource) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) {
    return match[0];
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function formatVisitedDate(value: DateInputSource) {
  const dateValue = toDateInputValue(value);
  if (!dateValue) {
    return '未填写日期';
  }

  const [year, month, day] = dateValue.split('-');
  return `${Number(year)}/${Number(month)}/${Number(day)}`;
}

function toFormState(place?: Place) {
  return {
    title: place?.title ?? '',
    content: place?.content ?? '',
    images: place?.images ?? [],
    thumbnails: place?.thumbnails ?? [],
    author: place?.author ?? '',
    visited_at: toDateInputValue(place?.visited_at) || toLocalDateInputValue(),
    is_locked: place?.is_locked ?? false
  };
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.fieldErrors
      ? '表单校验失败'
      : payload?.error ?? '请求失败';
    throw new Error(message);
  }

  return payload as T;
}

function filterPlacesByCursor(places: Place[], cursorTime: number) {
  return places.filter((place) => {
    if (!place.visited_at) {
      return true;
    }

    return new Date(place.visited_at).getTime() <= cursorTime;
  });
}

function buildAuthTarget(searchParams: ReadonlyURLSearchParams, destination: '/' | '/edit') {
  const query = searchParams.toString();
  return query ? `${destination}?${query}` : destination;
}

export function MeridianApp({ initialPlaces, canEdit, focusPlaceId, siteDescription }: MeridianAppProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const [places, setPlaces] = useState(initialPlaces);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(focusPlaceId ?? null);
  const [editorState, setEditorState] = useState<EditorState>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pendingCenter, setPendingCenter] = useState({ lat: 31.2304, lng: 121.4737 });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; alt: string } | null>(null);
  const [timelineCursorTime, setTimelineCursorTime] = useState(Date.now());
  const messageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setPlaces(initialPlaces);
    setTimelineCursorTime(Date.now());
  }, [initialPlaces]);

  useEffect(() => {
    if (focusPlaceId) {
      setSelectedPlaceId(focusPlaceId);
    }
  }, [focusPlaceId]);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  const nowTime = useMemo(() => Date.now(), []);
  const visiblePlaces = useMemo(() => filterPlacesByCursor(places, timelineCursorTime), [places, timelineCursorTime]);
  const selectedPlace = useMemo(
    () => visiblePlaces.find((place) => place.id === selectedPlaceId) ?? places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId, visiblePlaces]
  );

  const authorOptions = useMemo(
    () => Array.from(new Set(places.map((place) => place.author).filter(Boolean) as string[])),
    [places]
  );
  const isTimelineVisible = !selectedPlace && !editorState;

  const showMessage = (text: string) => {
    setMessage(text);
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = window.setTimeout(() => setMessage(null), 3200);
  };

  const updateQueryForPlace = useCallback((placeId: number | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (placeId) {
      next.set('place', String(placeId));
    } else {
      next.delete('place');
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const selectPlace = (placeId: number) => {
    setEditorState(null);
    setIsPickerOpen(false);
    setSelectedPlaceId(placeId);
    updateQueryForPlace(placeId);
  };

  const closePanels = useCallback(() => {
    setSelectedPlaceId(null);
    setEditorState(null);
    setIsPickerOpen(false);
    updateQueryForPlace(null);
  }, [updateQueryForPlace]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) {
        return;
      }

      if (fullscreenImage) {
        setFullscreenImage(null);
        return;
      }

      if (editorState) {
        setEditorState(null);
        return;
      }

      if (selectedPlaceId || isPickerOpen) {
        closePanels();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closePanels, editorState, fullscreenImage, isPickerOpen, selectedPlaceId]);

  const beginCreate = () => {
    setSelectedPlaceId(null);
    setEditorState(null);
    setIsPickerOpen(true);
  };

  const confirmCreatePin = () => {
    setEditorState({ mode: 'create', ...pendingCenter });
    setIsPickerOpen(false);
  };

  const beginEdit = (placeId: number) => {
    setEditorState({ mode: 'edit', placeId });
  };

  const uploadFile = async (file: File) => {
    let variants: Awaited<ReturnType<typeof createImageVariants>>;
    try {
      variants = await createImageVariants(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片处理失败';
      throw new Error(`图片处理失败：${message}`);
    }

    const { original, thumbnail } = variants;

    const [originalTarget, thumbTarget] = await Promise.all([
      requestJson<{ uploadUrl: string; fileUrl: string }>('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'original', contentType: original.type })
      }),
      requestJson<{ uploadUrl: string; fileUrl: string }>('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'thumb', contentType: thumbnail.type })
      })
    ]);

    const uploadTasks = [
      { label: '原图', target: originalTarget, file: original },
      { label: '缩略图', target: thumbTarget, file: thumbnail }
    ];

    let uploadResponses: Array<{ label: string; response: Response }>;
    try {
      uploadResponses = await Promise.all(
        uploadTasks.map(async ({ label, target, file }) => ({
          label,
          response: await fetch(target.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file
          })
        }))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '网络请求失败';
      throw new Error(`上传失败：${message}`);
    }

    const failedUpload = uploadResponses.find(({ response }) => !response.ok);
    if (failedUpload) {
      throw new Error(`${failedUpload.label}上传失败（HTTP ${failedUpload.response.status}）`);
    }

    return {
      image: originalTarget.fileUrl,
      thumbnail: thumbTarget.fileUrl
    };
  };

  const createPlace = async (payload: PlacePayload & { lat: number; lng: number }) => {
    const result = await requestJson<{ place: Place }>('/api/places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setPlaces((current) => [result.place, ...current]);
    setTimelineCursorTime(Date.now());
    setSelectedPlaceId(result.place.id);
    setEditorState(null);
    updateQueryForPlace(result.place.id);
    showMessage('地点已创建');
  };

  const patchPlace = async (placeId: number, payload: PlacePayload) => {
    const result = await requestJson<{ place: Place }>(`/api/places/${placeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setPlaces((current) => current.map((place) => (place.id === placeId ? result.place : place)));
    setSelectedPlaceId(placeId);
    setEditorState(null);
    showMessage('地点已更新');
  };

  const handleDelete = async (placeId: number) => {
    if (!window.confirm('确认删除这条记录？')) {
      return;
    }

    setIsDeleting(true);
    try {
      await requestJson(`/api/places/${placeId}`, { method: 'DELETE' });
      setPlaces((current) => current.filter((place) => place.id !== placeId));
      closePanels();
      showMessage('地点已删除');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative h-[100svh] h-[100dvh] overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <MapView
        places={visiblePlaces}
        selectedPlaceId={selectedPlaceId}
        pendingCenter={isPickerOpen ? pendingCenter : null}
        canEdit={canEdit}
        theme={theme}
        onCenterChange={setPendingCenter}
        onSelectPlace={selectPlace}
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col px-[max(0.75rem,var(--safe-area-left))] pt-[max(0.75rem,var(--safe-area-top))] pr-[max(0.75rem,var(--safe-area-right))] md:p-6">
        <Header canEdit={canEdit} onCreate={beginCreate} onShowMessage={showMessage} siteDescription={siteDescription} />
        <div className="flex-1" />
        <AnimatePresence initial={false}>
          {isTimelineVisible ? (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 28 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            >
              <TimelineSlider
                places={places}
                cursorTime={timelineCursorTime}
                nowTime={nowTime}
                onCursorTimeChange={setTimelineCursorTime}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <CreatePinOverlay
        open={isPickerOpen}
        center={pendingCenter}
        onCancel={() => setIsPickerOpen(false)}
        onConfirm={confirmCreatePin}
      />

      <AnimatePresence>
        {selectedPlace ? (
          <DetailPanel
            key={`view-${selectedPlace.id}`}
            place={selectedPlace}
            canEdit={canEdit}
            isDeleting={isDeleting}
            onClose={closePanels}
            onEdit={() => beginEdit(selectedPlace.id)}
            onDelete={() => handleDelete(selectedPlace.id)}
            onOpenImage={(src, alt) => setFullscreenImage({ src, alt })}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editorState ? (
          <EditPanel
            key={editorState.mode === 'create' ? 'create' : `edit-${editorState.placeId}`}
            mode={editorState.mode}
            lat={editorState.mode === 'create' ? editorState.lat : undefined}
            lng={editorState.mode === 'create' ? editorState.lng : undefined}
            place={editorState.mode === 'edit' ? places.find((place) => place.id === editorState.placeId) ?? null : null}
            authorOptions={authorOptions}
            isSaving={isSaving}
            onClose={() => setEditorState(null)}
            onUploadFile={uploadFile}
            onUploadError={showMessage}
            onSubmit={async (payload) => {
              setIsSaving(true);
              try {
                if (editorState.mode === 'create') {
                  await createPlace({ ...payload, lat: editorState.lat, lng: editorState.lng });
                } else {
                  await patchPlace(editorState.placeId, payload);
                }
              } catch (error) {
                showMessage(error instanceof Error ? error.message : '保存失败');
              } finally {
                setIsSaving(false);
              }
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {fullscreenImage ? (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--overlay)] p-4"
            onClick={() => setFullscreenImage(null)}
          >
            <Image
              src={fullscreenImage.src}
              alt={fullscreenImage.alt}
              width={1600}
              height={1200}
              className="max-h-full w-auto rounded-3xl object-contain"
            />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {message ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="meridian-panel fixed bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] left-1/2 z-[100] -translate-x-1/2 rounded-2xl px-4 py-3 text-sm"
          >
            {message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type HeaderProps = {
  canEdit: boolean;
  onCreate: () => void;
  onShowMessage: (message: string) => void;
  siteDescription: string;
};

function Header({ canEdit, onCreate, onShowMessage, siteDescription }: HeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const actionButtonClassName = cn(
    'meridian-button meridian-header-button',
    theme === 'light' ? 'meridian-button--overlay-light' : 'meridian-button--secondary'
  );
  const secondaryActionButtonClassName = cn(
    'meridian-button meridian-header-button',
    theme === 'light' ? 'meridian-button--overlay-light' : 'meridian-button--secondary'
  );
  const brandIcon = theme === 'dark' ? darkAppleIcon : appleIcon;

  const logout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    onShowMessage('已登出');
    router.replace(buildAuthTarget(searchParams, '/'));
  };

  return (
    <div className="pointer-events-none flex items-start justify-between gap-3 md:gap-4">
      <div className="meridian-panel pointer-events-auto max-w-md rounded-[1.75rem] px-3 py-3 md:px-5 md:py-4">
        <div className="flex items-center gap-2.5 md:gap-3">
          <Image src={brandIcon} alt="" width={32} height={32} className="h-8 w-8 rounded-lg md:h-9 md:w-9 md:rounded-xl" priority />
          <div className="text-sm font-semibold md:text-xl">Meridian</div>
        </div>
        <div className="meridian-muted-text mt-1 text-[11px] md:text-sm">{siteDescription}</div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <ThemeToggleButton className={theme === 'light' ? 'meridian-button--overlay-light' : undefined} />
        {canEdit ? (
          <button type="button" className={actionButtonClassName} onClick={onCreate}>
            新建
          </button>
        ) : null}
        {canEdit ? (
          <button type="button" className={secondaryActionButtonClassName} onClick={logout}>
            登出
          </button>
        ) : (
          <a href={`/login?next=${encodeURIComponent(buildAuthTarget(searchParams, '/'))}`} className={actionButtonClassName}>
            登录
          </a>
        )}
      </div>
    </div>
  );
}

type CreatePinOverlayProps = {
  open: boolean;
  center: { lat: number; lng: number };
  onCancel: () => void;
  onConfirm: () => void;
};

function CreatePinOverlay({ open, center, onCancel, onConfirm }: CreatePinOverlayProps) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-xl text-[var(--accent-foreground)] shadow-lg">
              📍
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="meridian-panel absolute inset-x-3 bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] z-30 rounded-[1.75rem] px-4 py-4 md:inset-x-auto md:left-1/2 md:w-[420px] md:-translate-x-1/2"
          >
            <div className="text-sm font-medium">拖动地图来选择位置</div>
            <div className="meridian-muted-text mt-2 text-xs">
              纬度 {center.lat.toFixed(5)}，经度 {center.lng.toFixed(5)}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="meridian-button meridian-button--secondary flex-1" onClick={onCancel}>
                取消
              </button>
              <button type="button" className="meridian-button flex-1" onClick={onConfirm}>
                确认
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

type DetailPanelProps = {
  place: Place;
  canEdit: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenImage: (src: string, alt: string) => void;
};

function DetailPanel({ place, canEdit, isDeleting, onClose, onEdit, onDelete, onOpenImage }: DetailPanelProps) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 32, y: 12 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 32, y: 12 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className="meridian-panel absolute inset-x-3 bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] top-[calc(max(var(--safe-area-top),0.75rem)+4.75rem)] z-40 rounded-[2rem] p-5 md:inset-x-auto md:bottom-6 md:right-6 md:top-24 md:w-[420px]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold leading-tight">{place.title}</h2>
            <div className="meridian-muted-text mt-2 text-sm">
              {formatVisitedDate(place.visited_at)}
              {place.author ? <span className="ml-2">— by {place.author}</span> : null}
            </div>
          </div>
          <button
            type="button"
            className="meridian-button meridian-button--secondary px-3 py-2"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        {place.images.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 overflow-y-auto">
            {place.thumbnails.map((thumbnail, index) => (
              <button
                type="button"
                key={thumbnail}
                className="overflow-hidden rounded-2xl border border-[var(--border)]"
                onClick={() => onOpenImage(place.images[index] ?? thumbnail, place.title)}
              >
                <Image
                  src={thumbnail}
                  alt={place.title}
                  width={400}
                  height={300}
                  className="h-32 w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}

        <div className="meridian-prose mt-5 min-h-0 flex-1 overflow-y-auto pr-1 text-sm md:text-[15px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{place.content || '暂无内容。'}</ReactMarkdown>
        </div>

        {canEdit ? (
          <div className="mt-5 flex gap-2">
            <button type="button" className="meridian-button flex-1" onClick={onEdit}>
              编辑
            </button>
            <button
              type="button"
              className="meridian-button meridian-button--secondary flex-1"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? '删除中…' : '删除'}
            </button>
          </div>
        ) : null}
      </div>
    </motion.aside>
  );
}

type EditPanelProps = {
  mode: 'create' | 'edit';
  place: Place | null;
  lat?: number;
  lng?: number;
  authorOptions: string[];
  isSaving: boolean;
  onClose: () => void;
  onUploadFile: (file: File) => Promise<{ image: string; thumbnail: string }>;
  onUploadError: (message: string) => void;
  onSubmit: (payload: PlacePayload) => Promise<void>;
};

function EditPanel({ mode, place, lat, lng, authorOptions, isSaving, onClose, onUploadFile, onUploadError, onSubmit }: EditPanelProps) {
  const initial = toFormState(place ?? undefined);
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [images, setImages] = useState<string[]>(initial.images);
  const [thumbnails, setThumbnails] = useState<string[]>(initial.thumbnails);
  const [author, setAuthor] = useState(initial.author);
  const [visitedAt, setVisitedAt] = useState(initial.visited_at);
  const [isLocked, setIsLocked] = useState(initial.is_locked);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const next = toFormState(place ?? undefined);
    setTitle(next.title);
    setContent(next.content);
    setImages(next.images);
    setThumbnails(next.thumbnails);
    setAuthor(next.author);
    setVisitedAt(next.visited_at);
    setIsLocked(next.is_locked);
  }, [place]);

  const handleUploadFiles = async (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList).filter((file) => file.type.startsWith('image/')) : [];
    if (!files.length) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      const uploaded = await Promise.all(files.map((file) => onUploadFile(file)));
      setImages((current) => [...current, ...uploaded.map((item) => item.image)]);
      setThumbnails((current) => [...current, ...uploaded.map((item) => item.thumbnail)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败，请稍后重试';
      setUploadError(message);
      onUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  const hasDraggedFiles = (dataTransfer: DataTransfer) =>
    Array.from(dataTransfer.items).some((item) => item.kind === 'file' && (!item.type || item.type.startsWith('image/')));

  const handleImageDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    dragDepthRef.current += 1;
    setIsDraggingImages(true);
  };

  const handleImageDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleImageDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0);
    if (dragDepthRef.current === 0) {
      setIsDraggingImages(false);
    }
  };

  const handleImageDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingImages(false);
    void handleUploadFiles(event.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setThumbnails((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 32, y: 12 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 32, y: 12 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className="meridian-panel absolute inset-x-3 bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] top-[calc(max(var(--safe-area-top),0.75rem)+4.75rem)] z-50 rounded-[2rem] p-5 md:inset-x-auto md:bottom-6 md:right-6 md:top-24 md:w-[420px]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{mode === 'create' ? '新建记录' : '编辑记录'}</h2>
            <div className="meridian-muted-text mt-2 text-xs">
              {mode === 'create'
                ? `纬度 ${lat?.toFixed(5)}，经度 ${lng?.toFixed(5)}`
                : `位置已固定：${place?.lat.toFixed(5)}, ${place?.lng.toFixed(5)}`}
            </div>
          </div>
          <button
            type="button"
            className="meridian-button meridian-button--secondary px-3 py-2"
            onClick={onClose}
          >
            取消
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-4">
            <label className="block">
              <div className="meridian-muted-text-strong mb-2 text-sm">标题</div>
              <input className="meridian-input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label className="block">
              <div className="meridian-muted-text-strong mb-2 text-sm">访问日期</div>
              <input
                type="date"
                className="meridian-input"
                value={visitedAt}
                onChange={(event) => setVisitedAt(event.target.value)}
              />
            </label>

            <AuthorCombobox value={author} options={authorOptions} onChange={setAuthor} />

            <label className="meridian-soft-surface flex items-center justify-between rounded-[1.25rem] px-4 py-3">
              <span className="meridian-muted-text-strong text-sm">上锁</span>
              <input type="checkbox" checked={isLocked} onChange={(event) => setIsLocked(event.target.checked)} />
            </label>

            <div>
              <div className="meridian-muted-text-strong mb-2 text-sm">正文</div>
              <MarkdownEditor markdown={content} onChange={setContent} />
            </div>

            <div>
              <div className="meridian-muted-text-strong mb-2 flex items-center justify-between text-sm">
                <span>图片</span>
                <span>{isUploading ? '上传中…' : `${images.length} 张`}</span>
              </div>
              <label
                className={cn(
                  'meridian-soft-surface meridian-muted-text block cursor-pointer rounded-[1.25rem] border-dashed px-4 py-6 text-center text-sm transition-[background-color,border-color,box-shadow]',
                  isDraggingImages && 'border-[var(--border-strong)] bg-[var(--panel-strong)] shadow-[0_0_0_2px_var(--accent)]'
                )}
                onDragEnter={handleImageDragEnter}
                onDragOver={handleImageDragOver}
                onDragLeave={handleImageDragLeave}
                onDrop={handleImageDrop}
              >
                {isDraggingImages ? '松开以上传图片' : '粘贴、拖拽或点击上传图片'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleUploadFiles(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {uploadError ? <div className="mt-2 text-xs text-red-600 dark:text-red-300">{uploadError}</div> : null}
              {thumbnails.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {thumbnails.map((thumbnail, index) => (
                    <div key={thumbnail} className="relative overflow-hidden rounded-2xl border border-[var(--border)]">
                      <Image src={thumbnail} alt={title || 'image'} width={200} height={200} className="h-24 w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-full bg-[var(--overlay)] px-2 py-1 text-xs text-white"
                        onClick={() => removeImage(index)}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" className="meridian-button meridian-button--secondary flex-1" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={cn('meridian-button flex-1', (isSaving || isUploading) && 'opacity-70')}
            disabled={isSaving || isUploading || !title.trim()}
            onClick={() =>
              void onSubmit({
                title: title.trim(),
                content,
                images,
                thumbnails,
                author: author.trim() ? author.trim() : null,
                visited_at: visitedAt || null,
                is_locked: isLocked
              })
            }
          >
            {isSaving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}

type AuthorComboboxProps = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function AuthorCombobox({ value, options, onChange }: AuthorComboboxProps) {
  return (
    <label className="block">
      <div className="meridian-muted-text-strong mb-2 text-sm">署名</div>
      <input
        list="meridian-authors"
        className="meridian-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="可选，可新增"
      />
      <datalist id="meridian-authors">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}
