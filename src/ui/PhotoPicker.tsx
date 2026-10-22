import { useRef, useState } from 'react';
import { importPhoto } from '../lib/images';
import { cx, Icon, PhotoImg } from './kit';
import { useOverlay } from './overlay';

/**
 * Camera / gallery picker. Files are copied into app storage immediately, so the
 * original can be deleted from the gallery without losing the photo. The browser
 * asks for camera access only when the camera button is used.
 */
export function usePhotoImport() {
  const { toast } = useOverlay();
  const [busy, setBusy] = useState(false);
  const run = async (files: FileList | null): Promise<string[]> => {
    if (!files?.length) return [];
    setBusy(true);
    const ids: string[] = [];
    try {
      for (const f of Array.from(files)) ids.push(await importPhoto(f));
    } catch {
      toast('این عکس قابل خواندن نبود. عکس دیگری را امتحان کن.', 'error');
    } finally {
      setBusy(false);
    }
    return ids;
  };
  return { busy, run };
}

export function HiddenInputs({
  onFiles,
  cameraRef,
  galleryRef,
  multiple,
}: {
  onFiles: (files: FileList | null) => void;
  cameraRef: React.RefObject<HTMLInputElement | null>;
  galleryRef: React.RefObject<HTMLInputElement | null>;
  multiple?: boolean;
}) {
  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** The AddEntry "cover upload area", extended with a strip of chosen photos. */
export function PhotoField({
  photoIds,
  onChange,
  hint = 'عکس اختیاری است؛ می‌توانی بعداً اضافه کنی',
}: {
  photoIds: string[];
  onChange: (ids: string[]) => void;
  hint?: string;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { busy, run } = usePhotoImport();
  const add = async (files: FileList | null) => {
    const ids = await run(files);
    if (ids.length) onChange([...photoIds, ...ids]);
  };

  return (
    <div className="space-y-3">
      <HiddenInputs onFiles={add} cameraRef={cameraRef} galleryRef={galleryRef} multiple />
      {photoIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[#D7A86E]/30 rounded-[2.5rem] bg-white">
          <div className="w-16 h-16 bg-[#FFF9F0] rounded-full flex items-center justify-center text-[#D7A86E] mb-4 text-2xl">
            <Icon name={busy ? 'fa-spinner fa-spin' : 'fa-camera'} />
          </div>
          <p className="text-sm font-bold text-[#4F4839]">عکس واقعی نسخهٔ خودت</p>
          <p className="text-[10px] text-gray-400 mt-1 italic">{hint}</p>
          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="bg-[#8E3200] text-white px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#8E3200]/20 min-h-11"
            >
              <Icon name="fa-camera" /> گرفتن عکس
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="bg-white border border-[#EEE2D3] text-[#4F4839] px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 min-h-11"
            >
              <Icon name="fa-images" className="text-[#D7A86E]" /> از گالری
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
          {photoIds.map((id, i) => (
            <div key={id} className="relative flex-shrink-0">
              <PhotoImg id={id} className="w-24 h-32 rounded-2xl shadow-sm" alt={`عکس ${i + 1}`} />
              <button
                type="button"
                aria-label="حذف عکس"
                onClick={() => onChange(photoIds.filter((p) => p !== id))}
                className="absolute -top-2 -left-2 w-8 h-8 bg-white rounded-full shadow flex items-center justify-center text-red-500 text-xs"
              >
                <Icon name="fa-xmark" />
              </button>
              {i === 0 && (
                <span className="absolute bottom-2 right-2 bg-[#8E3200] text-white text-[8px] px-2 py-0.5 rounded-full font-bold">
                  جلد
                </span>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className={cx('w-24 h-32 flex-shrink-0 rounded-2xl border-2 border-dashed border-[#D7A86E]/40 flex flex-col items-center justify-center gap-2 text-[#D7A86E] text-[10px] font-bold')}
          >
            <Icon name={busy ? 'fa-spinner fa-spin' : 'fa-camera'} className="text-lg" />
            عکس
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="w-24 h-32 flex-shrink-0 rounded-2xl border-2 border-dashed border-[#D7A86E]/40 flex flex-col items-center justify-center gap-2 text-[#D7A86E] text-[10px] font-bold"
          >
            <Icon name="fa-images" className="text-lg" />
            گالری
          </button>
        </div>
      )}
    </div>
  );
}
