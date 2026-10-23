import { useMemo, useRef, useState } from 'react';
import { deletePlayer, savePlayer } from '../db/games';
import { usePlayers, useSessions } from '../db/queries';
import type { Familiarity, Player } from '../db/types';
import { relativeDays } from '../lib/date';
import { fa, matchesQuery } from '../lib/text';
import { FAMILIARITY, GAME_TAGS } from '../lib/vocab';
import { TagEditor, TextField } from '../ui/fields';
import { BackButton, ChipButton, Icon, Loading, PhotoImg, useFlight } from '../ui/kit';
import { Sheet, useOverlay } from '../ui/overlay';
import { HiddenInputs, usePhotoImport } from '../ui/PhotoPicker';
import { useNavigate } from 'react-router-dom';
import { deletePhotos } from '../lib/images';

/** PlayerManagement design. Only observable preferences are stored; no labels about people. */
export default function Players() {
  const players = usePlayers();
  const sessions = useSessions();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('');
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const navigate = useNavigate();

  const stats = useMemo(() => {
    type Entry = { last?: number; plays: number; wins: number; games: Map<string, number> };
    const m = new Map<string, Entry>();
    for (const s of sessions ?? []) {
      for (const pid of s.playerIds) {
        const e: Entry = m.get(pid) ?? { plays: 0, wins: 0, games: new Map() };
        e.plays++;
        if (s.winnerIds.includes(pid)) e.wins++;
        e.last = Math.max(e.last ?? 0, s.at);
        e.games.set(s.gameCopyId, (e.games.get(s.gameCopyId) ?? 0) + 1);
        m.set(pid, e);
      }
    }
    return m;
  }, [sessions]);

  if (!players || !sessions) return <Loading />;
  const groups = [...new Set(players.map((p) => p.group).filter(Boolean))] as string[];
  const shown = players.filter((p) => (!group || p.group === group) && matchesQuery(query, p.name, p.group));

  return (
    <div className="pb-24 page-enter">
      <header className="px-6 pt-8 pb-6 flex justify-between items-center sticky top-0 bg-[#FFF9F0]/80 backdrop-blur-lg z-20">
        <BackButton />
        <h1 className="text-xl font-bold text-[#4F4839]">مدیریت هم‌بازی‌ها</h1>
        <button
          type="button"
          aria-label="افزودن هم‌بازی"
          onClick={() => setEditing('new')}
          className="w-12 h-12 bg-[#8E3200] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-[#8E3200]/20"
        >
          <Icon name="fa-plus" />
        </button>
      </header>
      <main className="px-6 space-y-6">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو میان دوستان..."
            aria-label="جستجو"
            className="w-full bg-white border border-[#EEE2D3] rounded-2xl py-3 pr-12 pl-4 text-sm focus:outline-none focus:border-[#8E3200] transition-all"
          />
          <Icon name="fa-magnifying-glass" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#D7A86E]" />
        </div>
        {groups.length > 0 && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
            <ChipButton active={!group} onClick={() => setGroup('')}>
              همه
            </ChipButton>
            {groups.map((g) => (
              <ChipButton key={g} active={group === g} onClick={() => setGroup(g)}>
                {g}
              </ChipButton>
            ))}
          </div>
        )}
        <div className="space-y-4">
          {shown.map((p) => {
            const s = stats.get(p.id);
            return (
              <button key={p.id} type="button" onClick={() => setEditing(p)} className="player-card shadow-sm">
                <PhotoImg id={p.photoId} placeholderIcon="fa-user" className="w-14 h-14 rounded-2xl border-2 border-[#FFF9F0] shadow-sm flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-[#4F4839]">{p.name}</h3>
                  {s?.last ? (
                    <p className="text-[11px] text-[#8E3200] font-medium">آخرین بازی: {relativeDays(s.last)}</p>
                  ) : (
                    <p className="text-[11px] text-gray-500 font-medium italic">هنوز بازی ثبت نشده</p>
                  )}
                  {p.likes.length > 0 && <p className="text-[10px] text-gray-500 truncate">دوست دارد: {p.likes.join('، ')}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {s && <span className="text-[10px] font-bold text-[#8E3200]">{fa(s.plays)} جلسه</span>}
                  <Icon name="fa-chevron-left" className="text-[10px] text-gray-400" />
                </div>
              </button>
            );
          })}
          {players.length === 0 && (
            <div className="text-center py-10 space-y-4">
              <Icon name="fa-user-group" className="text-4xl text-[#EEE2D3]" />
              <p className="text-sm text-gray-500 leading-relaxed">
                هم‌بازی‌هایت را اضافه کن تا در ثبت جلسه‌ها و «چی بازی کنیم؟» از ترجیح‌هایشان استفاده شود.
              </p>
            </div>
          )}
        </div>
        {players.length > 0 && sessions.length > 0 && <Insight stats={stats} players={players} onPick={() => navigate('/picker')} />}
      </main>
      {editing && <PlayerSheet player={editing === 'new' ? undefined : editing} groups={groups} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Factual, local summary of who plays most; no ranking of people. */
function Insight({ stats, players, onPick }: { stats: Map<string, { plays: number }>; players: Player[]; onPick: () => void }) {
  const top = players
    .map((p) => ({ p, plays: stats.get(p.id)?.plays ?? 0 }))
    .filter((x) => x.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 3);
  if (!top.length) return null;
  return (
    <button type="button" onClick={onPick} className="w-full mt-8 bg-[#433520] p-6 rounded-[2.5rem] text-white flex items-start gap-4 text-right">
      <div className="w-12 h-12 bg-[#8E3200] rounded-2xl flex items-center justify-center text-xl flex-shrink-0">
        <Icon name="fa-chart-pie" />
      </div>
      <div>
        <p className="text-xs font-bold text-[#D7A86E] mb-1">از جلسه‌های ثبت‌شده</p>
        <p className="text-[12px] leading-relaxed text-white/85">
          بیشترین جلسه‌ها را با {top.map((x) => `${x.p.name} (${fa(x.plays)})`).join('، ')} ثبت کرده‌ای. برای جمع بعدی از «چی بازی کنیم؟» کمک بگیر.
        </p>
      </div>
    </button>
  );
}

function PlayerSheet({ player, groups, onClose }: { player?: Player; groups: string[]; onClose: () => void }) {
  const flight = useFlight();
  const [name, setName] = useState(player?.name ?? '');
  const [group, setGroup] = useState(player?.group ?? '');
  const [likes, setLikes] = useState(player?.likes ?? []);
  const [dislikes, setDislikes] = useState(player?.dislikes ?? []);
  const [familiarity, setFamiliarity] = useState<Familiarity | ''>(player?.familiarity ?? '');
  const [notes, setNotes] = useState(player?.notes ?? '');
  const [photoId, setPhotoId] = useState(player?.photoId);
  const { confirm, toast } = useOverlay();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { run } = usePhotoImport();

  const save = flight.wrap(async () => {
    if (!name.trim()) {
      toast('نام را وارد کن.', 'error');
      return;
    }
    if (player?.photoId && player.photoId !== photoId) await deletePhotos([player.photoId]);
    await savePlayer({ id: player?.id, name, group: group.trim() || undefined, likes, dislikes, familiarity: familiarity || undefined, notes: notes.trim() || undefined, photoId });
    onClose();
  });

  return (
    <Sheet open onClose={onClose} label="هم‌بازی">
      <HiddenInputs
        onFiles={async (f) => {
          const [id] = await run(f);
          if (id) setPhotoId(id);
        }}
        cameraRef={cameraRef}
        galleryRef={galleryRef}
      />
      <div className="flex flex-col items-center gap-3 mb-6">
        <button type="button" onClick={() => galleryRef.current?.click()} aria-label="انتخاب عکس">
          <PhotoImg id={photoId} placeholderIcon="fa-camera" className="w-20 h-20 rounded-[1.5rem] shadow" />
        </button>
        <h2 className="text-lg font-bold">{player ? 'ویرایش هم‌بازی' : 'هم‌بازی جدید'}</h2>
      </div>
      <div className="space-y-6">
        <TextField label="نام" value={name} onChange={setName} />
        <div className="space-y-2">
          <TextField label="گروه (اختیاری)" value={group} onChange={setGroup} placeholder="خانواده، دوستان، همکاران..." />
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pr-2">
              {groups.map((g) => (
                <button key={g} type="button" onClick={() => setGroup(g)} className="px-2.5 py-1 rounded-full text-[10px] font-bold text-gray-600 bg-[#EEE2D3]/40 min-h-7">
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
        <TagEditor label="از چه سبک‌هایی لذت برده" tags={likes} onChange={setLikes} suggestions={GAME_TAGS} />
        <TagEditor label="از چه سبک‌هایی استقبال نکرده" tags={dislikes} onChange={setDislikes} suggestions={GAME_TAGS} />
        <div className="space-y-2">
          <p className="field-label">آشنایی با بردگیم</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FAMILIARITY) as Familiarity[]).map((f) => (
              <ChipButton key={f} active={familiarity === f} onClick={() => setFamiliarity(familiarity === f ? '' : f)}>
                {FAMILIARITY[f].label}
              </ChipButton>
            ))}
          </div>
        </div>
        <TextField label="یادداشت" value={notes} onChange={setNotes} multiline />
        <div className="flex gap-3">
          {player && (
            <button
              type="button"
              aria-label="حذف"
              onClick={async () => {
                if (await confirm({ tone: 'danger', title: 'حذف هم‌بازی؟', message: 'جلسه‌های گذشته حفظ می‌شوند و فقط نام این فرد از آن‌ها برداشته می‌شود.', confirm: 'حذف', cancel: 'انصراف' })) {
                  await deletePlayer(player.id);
                  onClose();
                }
              }}
              className="px-5 py-4 rounded-2xl text-red-600 bg-red-50 font-bold text-sm"
            >
              <Icon name="fa-trash-can" />
            </button>
          )}
          <button type="button" onClick={save} disabled={flight.busy} className="flex-1 bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#8E3200]/20 min-h-11">
            ذخیره
          </button>
        </div>
      </div>
    </Sheet>
  );
}
