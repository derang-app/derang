import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { deleteSession, saveSession, savePlayer } from '../db/games';
import { useGame, usePlayers } from '../db/queries';
import { useSetting } from '../db/settings';
import { ME, type MyResult } from '../db/types';
import { relativeDays, startOfDay } from '../lib/date';
import { fa, parseNum } from '../lib/text';
import { JalaliField } from '../ui/fields';
import { BackButton, BottomAction, cx, Icon, Loading, PhotoImg, PrimaryButton, useFlight } from '../ui/kit';
import { Sheet, useOverlay } from '../ui/overlay';
import { NotFound } from './BookDetails';

/** LogSession design; also used to edit an existing session. */
export default function LogSession() {
  const flight = useFlight();
  const { id, sessionId } = useParams();
  const navigate = useNavigate();
  const data = useGame(id);
  const players = usePlayers();
  const profile = useSetting('profile');
  const existing = useLiveQuery(() => (sessionId ? db.sessions.get(sessionId) : undefined), [sessionId]);
  const { toast, confirm } = useOverlay();
  const [present, setPresent] = useState<string[]>([ME]);
  const [winners, setWinners] = useState<string[]>([]);
  const [result, setResult] = useState<MyResult>('unknown');
  const [duration, setDuration] = useState('');
  const [at, setAt] = useState<number | undefined>(startOfDay(Date.now()) + 12 * 3600_000);
  const [notes, setNotes] = useState('');
  const [newPlayer, setNewPlayer] = useState(false);
  const [newName, setNewName] = useState('');
  const [loaded, setLoaded] = useState(!sessionId);

  useEffect(() => {
    if (!existing || loaded) return;
    setPresent(existing.playerIds);
    setWinners(existing.winnerIds);
    setResult(existing.result);
    setDuration(existing.durationMin ? fa(existing.durationMin) : '');
    setAt(existing.at);
    setNotes(existing.notes ?? '');
    setLoaded(true);
  }, [existing, loaded]);

  // My result follows the winner selection unless set explicitly.
  useEffect(() => {
    if (!winners.length) return;
    setResult(winners.includes(ME) ? 'win' : 'loss');
  }, [winners]);

  if (data === undefined || !players || !profile || (sessionId && existing === undefined)) return <Loading />;
  if (data === null) return <NotFound />;
  const { copy } = data;
  const last = data.sessions.find((s) => s.id !== sessionId);
  const people = [{ id: ME, name: 'خودم', photoId: profile.photoId }, ...players];

  const togglePresent = (pid: string) => {
    if (present.includes(pid)) {
      setPresent(present.filter((p) => p !== pid));
      setWinners(winners.filter((w) => w !== pid));
    } else setPresent([...present, pid]);
  };
  const toggleWinner = (pid: string) => setWinners(winners.includes(pid) ? winners.filter((w) => w !== pid) : [...winners, pid]);

  const save = flight.wrap(async () => {
    if (!at) {
      toast('تاریخ بازی معتبر نیست.', 'error');
      return;
    }
    await saveSession(
      { gameCopyId: copy.id, at, durationMin: parseNum(duration), playerIds: present, winnerIds: winners, result, notes },
      sessionId,
    );
    toast('جلسه ثبت شد');
    navigate(-1);
  });

  return (
    <div className="pb-32 page-enter">
      <header className="px-6 pt-8 pb-4 flex justify-between items-center bg-[#FFF9F0]/80 backdrop-blur-lg sticky top-0 z-20">
        <BackButton kind="close" />
        <div className="text-center">
          <h1 className="text-lg font-bold text-[#4F4839]">{sessionId ? 'ویرایش جلسه' : 'ثبت جلسه بازی'}</h1>
          <p className="text-[10px] text-[#8E3200] font-bold">{copy.name}</p>
        </div>
        <button type="button" onClick={save} disabled={flight.busy} className="text-[#8E3200] font-bold text-sm px-2 min-h-11">
          ذخیره
        </button>
      </header>

      <main className="px-6 space-y-8 mt-4">
        <div className="flex items-center gap-4 bg-[#D7A86E]/10 p-4 rounded-3xl border border-[#D7A86E]/20">
          <PhotoImg id={copy.photoIds[0]} placeholderIcon="fa-dice" className="w-16 h-16 rounded-2xl shadow-sm flex-shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-[#4F4839]">{copy.name}</h2>
            <p className="text-[11px] text-[#8E3200] font-medium">{last ? `آخرین بازی: ${relativeDays(last.at)}` : 'اولین جلسه'}</p>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest">بازیکنان حاضر</h3>
            <button type="button" onClick={() => setNewPlayer(true)} className="text-[#8E3200] text-[11px] font-bold min-h-9">
              + افزودن بازیکن جدید
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={present.includes(p.id)}
                onClick={() => togglePresent(p.id)}
                className={cx(
                  'px-4 py-2 border rounded-full flex items-center gap-2 text-[11px] font-bold transition-all min-h-9',
                  present.includes(p.id) ? 'bg-[#8E3200] text-white border-[#8E3200]' : 'bg-white border-[#EEE2D3] text-gray-600',
                )}
              >
                <PhotoImg id={p.photoId} placeholderIcon="fa-user" className="w-5 h-5 rounded-full" />
                <span>{p.name}</span>
                {present.includes(p.id) && <Icon name="fa-check" className="text-[9px]" />}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 px-2">{fa(present.length)} نفر</p>
        </section>

        <div className="form-card space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2 block">
              <span className="text-[10px] font-bold text-[#8E3200] uppercase pr-2">مدت زمان (دقیقه)</span>
              <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="مثلاً ۴۵" inputMode="numeric" className="input-soft" />
            </label>
            <label className="space-y-2 block">
              <span className="text-[10px] font-bold text-[#8E3200] uppercase pr-2">نتیجهٔ من</span>
              <select value={result} onChange={(e) => setResult(e.target.value as MyResult)} className="input-soft appearance-none">
                <option value="win">برد</option>
                <option value="loss">باخت</option>
                <option value="draw">مساوی</option>
                <option value="unknown">ثبت نمی‌کنم</option>
              </select>
            </label>
          </div>
          <JalaliField label="تاریخ بازی" value={at} onChange={setAt} soft />
          <label className="space-y-2 block">
            <span className="text-[10px] font-bold text-[#8E3200] uppercase pr-2">خلاصه جلسه و یادداشت</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="لحظات حساس بازی را اینجا ثبت کنید..." className="input-soft h-32 resize-none" />
          </label>
        </div>

        {present.length > 1 && (
          <section className="space-y-4">
            <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-2">برنده نهایی (اختیاری)</h3>
            <div className="grid grid-cols-3 gap-3">
              {people
                .filter((p) => present.includes(p.id))
                .map((p) => {
                  const won = winners.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={won}
                      onClick={() => toggleWinner(p.id)}
                      className={cx(
                        'p-4 rounded-3xl border-2 bg-white flex flex-col items-center gap-2 transition-all',
                        won ? 'border-[#8E3200] shadow-lg shadow-[#8E3200]/10' : 'border-[#D7A86E]/20',
                      )}
                    >
                      <PhotoImg id={p.photoId} placeholderIcon="fa-user" className={cx('w-10 h-10 rounded-full border-2 shadow-sm', won ? 'border-[#8E3200]' : 'border-white')} />
                      <span className={cx('text-[11px] font-bold', won && 'text-[#8E3200]')}>{p.name}</span>
                      {won && <Icon name="fa-crown" className="text-[10px] text-[#D7A86E]" />}
                    </button>
                  );
                })}
            </div>
          </section>
        )}

        {sessionId && (
          <button
            type="button"
            onClick={async () => {
              if (await confirm({ tone: 'danger', title: 'مطمئنی حذف شود؟', message: 'این جلسه برای همیشه پاک می‌شود.', confirm: 'بله، حذف کن', cancel: 'انصراف' })) {
                await deleteSession(sessionId);
                navigate(-1);
              }
            }}
            className="w-full py-4 text-red-600 font-bold text-sm bg-red-50 rounded-2xl border border-red-100 flex items-center justify-center gap-2"
          >
            <Icon name="fa-trash-can" /> حذف جلسه
          </button>
        )}
      </main>

      <BottomAction>
        <PrimaryButton icon="fa-floppy-disk" onClick={save} disabled={flight.busy}>
          ثبت نهایی جلسه بازی
        </PrimaryButton>
      </BottomAction>

      <Sheet open={newPlayer} onClose={() => setNewPlayer(false)} label="هم‌بازی جدید">
        <h2 className="text-lg font-bold text-center mb-6">هم‌بازی جدید</h2>
        <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="نام" className="input-field mb-6" aria-label="نام" />
        <button
          type="button"
          onClick={flight.wrap(async () => {
            if (!newName.trim()) return;
            const p = await savePlayer({ name: newName });
            setPresent([...present, p.id]);
            setNewName('');
            setNewPlayer(false);
          })}
          disabled={flight.busy}
          className="w-full bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm min-h-11"
        >
          افزودن و انتخاب
        </button>
      </Sheet>
    </div>
  );
}
