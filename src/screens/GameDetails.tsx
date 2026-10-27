import { useNavigate, useParams } from 'react-router-dom';
import { deleteGameCopy, updateGameCopy } from '../db/games';
import { usePlayers, useGame } from '../db/queries';
import { useSetting } from '../db/settings';
import { ME } from '../db/types';
import { relativeDays, startOfJalaliMonth } from '../lib/date';
import { winStats } from '../lib/stats';
import { fa, formatRange } from '../lib/text';
import { complexityLabel } from '../lib/vocab';
import { BackButton, cx, Icon, Loading, PhotoImg } from '../ui/kit';
import { Menu, useOverlay } from '../ui/overlay';
import { NotFound } from './BookDetails';

export default function GameDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useGame(id);
  const players = usePlayers();
  const profile = useSetting('profile');
  const { confirm, toast } = useOverlay();
  if (data === undefined || !players || !profile) return <Loading />;
  if (data === null) return <NotFound />;
  const { copy, work, sessions } = data;
  const nameOf = (pid: string) => (pid === ME ? profile.name || 'خودم' : players.find((p) => p.id === pid)?.name ?? '؟');
  const stats = winStats(sessions);
  const thisMonth = sessions.filter((s) => s.at >= startOfJalaliMonth(Date.now())).length;

  const remove = async () => {
    const ok = await confirm({
      tone: 'danger',
      title: 'مطمئنی حذف شود؟',
      message: 'این بازی با جلسه‌ها و عکس‌هایش برای همیشه پاک می‌شود.',
      confirm: 'بله، حذف کن',
      cancel: 'انصراف',
    });
    if (!ok) return;
    await deleteGameCopy(copy.id);
    toast('حذف شد');
    navigate('/games', { replace: true });
  };

  return (
    <div className="pb-24 page-enter">
      <header className="fixed top-0 inset-x-app z-30 px-6 py-6 flex justify-between items-center">
        <BackButton kind="chevron" glass />
        <div className="flex gap-3">
          <button
            type="button"
            aria-label="مشخصات فنی"
            onClick={() => navigate(`/games/${copy.id}/specs`)}
            className="w-12 h-12 glass-effect rounded-2xl flex items-center justify-center text-[#8E3200]"
          >
            <Icon name="fa-dice-d20" />
          </button>
          <Menu
            items={[
              { label: 'ویرایش اطلاعات', icon: 'fa-pen', onClick: () => navigate(`/games/${copy.id}/edit`) },
              { label: 'جلد باکیفیت', icon: 'fa-crop-simple', onClick: () => navigate(`/cover/game/${copy.id}`) },
              { label: 'مشخصات فنی و منشأ داده', icon: 'fa-dice-d20', onClick: () => navigate(`/games/${copy.id}/specs`) },
              { label: 'دریافت مشخصات از BGG', icon: 'fa-cloud-arrow-down', onClick: () => navigate(`/games/${copy.id}/bgg`) },
              { label: 'شناسایی بازی اصلی با AI', icon: 'fa-wand-magic-sparkles', onClick: () => navigate(`/identify/game/${copy.id}`) },
              ...(copy.owned ? [] : [{ label: 'این بازی را خریدم', icon: 'fa-cart-arrow-down', onClick: () => updateGameCopy(copy.id, { owned: true }) }]),
              { label: 'حذف', icon: 'fa-trash-can', onClick: remove, danger: true },
            ]}
          />
        </div>
      </header>

      <section className="relative pt-24 pb-12 px-6 flex flex-col items-center">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#8E3200]/10 to-transparent -z-10" />
        <button type="button" aria-label="جلد باکیفیت" onClick={() => navigate(`/cover/game/${copy.id}`)} className="mb-8 active:scale-95 transition-transform">
          <PhotoImg id={copy.photoIds[0]} full placeholderIcon="fa-dice" alt={copy.name} className="w-64 aspect-square rounded-[2.5rem] shadow-2xl" />
        </button>
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-[#4F4839] leading-snug">{copy.name}</h1>
          {work?.name && work.name !== copy.name && <p className="text-lg text-[#8E3200] font-medium italic ltr">{work.name}</p>}
          {copy.brand && <p className="text-xs text-gray-500 font-medium">برند: {copy.brand}</p>}
          {!copy.owned && (
            <span className="inline-flex items-center gap-1 bg-[#8E3200] text-white text-[10px] px-3 py-1 rounded-full font-bold">
              <Icon name="fa-heart" /> در فهرست علاقه‌مندی؛ هنوز ندارم
            </span>
          )}
          <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
            <Chip icon="fa-user-group">{work?.minPlayers !== undefined ? `${formatRange(work.minPlayers, work.maxPlayers)} نفر` : 'تعداد نفرات؟'}</Chip>
            <Chip icon="fa-clock">
              {work?.playTimeMin !== undefined || work?.playTimeMax !== undefined ? `${formatRange(work?.playTimeMin, work?.playTimeMax)} دقیقه` : 'زمان؟'}
            </Chip>
            <span className="px-3 py-1 bg-[#D7A86E]/20 text-[#8E3200] rounded-full text-[10px] font-bold flex items-center gap-1">
              <Icon name="fa-brain" className="text-[8px]" /> {complexityLabel(work?.complexity)}
            </span>
          </div>
        </div>
      </section>

      {copy.owned && (
        <section className="px-6 mb-10">
          <button
            type="button"
            onClick={() => navigate(`/games/${copy.id}/log`)}
            className="w-full bg-[#8E3200] text-white p-5 rounded-[2rem] font-bold shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-3 active:scale-95 transition-all"
          >
            <Icon name="fa-circle-plus" />
            <span>ثبت جلسه بازی جدید</span>
          </button>
        </section>
      )}

      <section className="px-6 grid grid-cols-2 gap-4 mb-10">
        <div className="bg-white p-5 rounded-[2rem] border border-[#EEE2D3] flex flex-col justify-center">
          <p className="text-[10px] text-gray-500 font-bold mb-1 uppercase">تعداد بازی</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#4F4839]">{fa(stats.total)}</span>
            {thisMonth > 0 && <span className="text-[10px] text-green-700 font-bold">{fa(thisMonth)}+ این ماه</span>}
          </div>
        </div>
        <div className="bg-white p-5 rounded-[2rem] border border-[#EEE2D3] flex flex-col justify-center">
          <p className="text-[10px] text-gray-500 font-bold mb-1 uppercase">نرخ برد من</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#8E3200]">{stats.wins + stats.losses + stats.draws ? `${fa(stats.rate)}٪` : '—'}</span>
            {stats.wins > 0 && <span className="text-[10px] text-[#8E3200] font-bold">{fa(stats.wins)} برد</span>}
          </div>
        </div>
      </section>

      <section className="px-6 space-y-6">
        <div className="flex justify-between items-center px-2">
          <h3 className="font-bold text-[#4F4839] text-lg">تاریخچه جلسات</h3>
        </div>
        {sessions.length === 0 && <p className="text-xs text-gray-500 px-2">هنوز جلسه‌ای ثبت نشده است.</p>}
        {sessions.map((s, i) => {
          const others = s.playerIds.filter((p) => p !== ME).map(nameOf);
          const result = { win: ['برد', 'bg-green-50 text-green-700'], loss: ['باخت', 'bg-red-50 text-red-700'], draw: ['مساوی', 'bg-[#D7A86E]/15 text-[#8E3200]'], unknown: ['—', 'bg-gray-50 text-gray-500'] }[s.result];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => navigate(`/games/${copy.id}/log/${s.id}`)}
              className={cx('w-full text-right bg-white p-6 rounded-[2.5rem] border border-[#EEE2D3] shadow-sm space-y-4', i > 0 && 'opacity-90')}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={cx('w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-xs', result[1])}>{result[0]}</div>
                  <div>
                    <p className="text-sm font-bold text-[#4F4839]">بازی {fa(s.playerIds.length)} نفره</p>
                    <p className="text-[10px] text-gray-500 italic">
                      {relativeDays(s.at)}
                      {s.durationMin ? `، ${fa(s.durationMin)} دقیقه` : ''}
                    </p>
                  </div>
                </div>
                <Icon name="fa-chevron-left" className="text-gray-300" />
              </div>
              {(others.length > 0 || s.notes) && (
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  {others.length > 0 && <p className="text-[10px] text-gray-500">به همراه {others.join('، ')}</p>}
                  {s.notes && <p className="text-xs text-[#4F4839] leading-relaxed line-clamp-2">{s.notes}</p>}
                </div>
              )}
            </button>
          );
        })}
      </section>

      {(work?.tags.length ?? 0) > 0 && (
        <section className="px-6 mt-12 mb-8">
          <h3 className="font-bold text-[#4F4839] text-sm mb-4 px-2">سبک و ویژگی‌ها</h3>
          <div className="flex flex-wrap gap-2">
            {work!.tags.map((t) => (
              <span key={t} className="px-4 py-2 bg-white border border-[#EEE2D3] rounded-2xl text-[10px] font-bold text-[#4F4839]">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {copy.notes && (
        <section className="px-6 mt-8">
          <h3 className="font-bold text-[#4F4839] text-sm mb-3 px-2">یادداشت من</h3>
          <p className="bg-white p-5 rounded-[2rem] border border-[#EEE2D3] text-sm leading-relaxed whitespace-pre-line">{copy.notes}</p>
        </section>
      )}
    </div>
  );
}

function Chip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 bg-white border border-[#EEE2D3] rounded-full text-[10px] font-bold text-gray-600 flex items-center gap-1">
      <Icon name={icon} className="text-[8px]" /> {children}
    </span>
  );
}
