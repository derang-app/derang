import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { explainPicker } from '../ai/tasks';
import { AiAnswer, AiStateCard, AiThinking, useAiReady, useAiTask } from '../ai/ui';
import { usePlayers, useGames, useSessions } from '../db/queries';
import type { AiResponse, Familiarity } from '../db/types';
import { explainEmpty, pickGames, suggestRelaxations, TIME_WINDOWS, type PickerGame, type PickerInput, type TimeWindow } from '../lib/picker';
import { fa, formatRange } from '../lib/text';
import { complexityLabel, FAMILIARITY, MOODS, PLAYER_COUNT_LABEL } from '../lib/vocab';
import { BackButton, BottomAction, cx, Icon, Loading, PhotoImg } from '../ui/kit';

type Step = 1 | 2 | 3;

export default function Picker() {
  const navigate = useNavigate();
  const games = useGames();
  const sessions = useSessions();
  const players = usePlayers();
  const [step, setStep] = useState<Step>(1);
  const [input, setInput] = useState<PickerInput>({ players: 3, time: 'medium', familiarity: 'familiar', moods: [], playerIds: [] });
  const [more, setMore] = useState(false);
  const [index, setIndex] = useState(0);

  const pickerGames: PickerGame[] = useMemo(
    () => (games ?? []).map((g) => ({ ...g, sessions: (sessions ?? []).filter((s) => s.gameCopyId === g.copy.id) })),
    [games, sessions],
  );
  const result = useMemo(() => pickGames(pickerGames, input, players ?? []), [pickerGames, input, players]);

  if (!games || !sessions || !players) return <Loading />;

  const back = () => (step === 1 ? navigate(-1) : setStep((s) => (s - 1) as Step));

  if (step === 3) {
    return result.matches.length ? (
      <Result
        input={input}
        result={result}
        index={index % result.matches.length}
        onAgain={() => setIndex((i) => i + 1)}
        onBack={() => {
          setStep(2);
          setIndex(0);
        }}
      />
    ) : (
      <Empty
        input={input}
        games={pickerGames}
        result={result}
        onApply={(next) => {
          setInput(next);
          setIndex(0);
        }}
        onBack={() => setStep(1)}
        players={players}
      />
    );
  }

  // Selected people imply a minimum group size (me + them).
  const selectedCount = input.playerIds.length + 1;
  const hint = observedHint(players.filter((p) => input.playerIds.includes(p.id)));

  return (
    <div className="pb-32 page-enter">
      <header className="px-6 pt-8 pb-4 flex justify-between items-center">
        <BackButton kind={step === 1 ? 'close' : 'chevron'} onClick={back} />
        <div className="text-center">
          <h1 className="text-lg font-bold text-[#4F4839]">چی بازی کنیم؟</h1>
          <p className="text-[10px] text-[#8E3200] font-bold uppercase tracking-widest">{step === 1 ? 'انتخاب از مجموعهٔ خودت' : 'آشنایی و حال‌وهوا'}</p>
        </div>
        <div className="w-12" />
      </header>

      <section className="px-10 py-6 flex justify-center items-center gap-4" aria-label={`مرحله ${fa(step)} از ۳`}>
        <div className={cx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold', 'step-active', step === 2 && 'text-[10px]')}>
          {step > 1 ? <Icon name="fa-check" /> : '۱'}
        </div>
        <div className={cx('h-0.5 w-12 rounded-full', step > 1 ? 'bg-[#8E3200]' : 'bg-[#EEE2D3]')} />
        <div className={cx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold', step === 2 ? 'step-active shadow-lg shadow-[#8E3200]/20' : 'step-inactive')}>۲</div>
        <div className="h-0.5 w-12 bg-[#EEE2D3] rounded-full" />
        <div className="w-8 h-8 rounded-full step-inactive flex items-center justify-center text-xs font-bold">۳</div>
      </section>

      {step === 1 ? (
        <main className="px-6 mt-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-[#4F4839] mb-2">امروز چند نفرید؟</h2>
            <p className="text-sm text-gray-500">تعداد بازیکنان حاضر را انتخاب کنید.</p>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-6" role="radiogroup" aria-label="تعداد نفرات">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={input.players === n}
                onClick={() => setInput({ ...input, players: n })}
                className={cx(
                  'aspect-square border-2 rounded-[2rem] flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-all',
                  input.players === n ? 'option-card-selected' : 'bg-white border-transparent',
                )}
              >
                <span className={cx('text-3xl font-bold', input.players === n ? 'text-[#8E3200]' : 'text-[#4F4839]')}>{fa(n)}</span>
                <span className={cx('text-[10px] font-bold', input.players === n ? 'text-[#8E3200]' : 'text-gray-500')}>{PLAYER_COUNT_LABEL[n]}</span>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={input.players > 5}
              onClick={() => setMore(true)}
              className={cx(
                'aspect-square border-2 rounded-[2rem] flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-all',
                input.players > 5 ? 'option-card-selected' : 'bg-white border-transparent',
              )}
            >
              {input.players > 5 ? (
                <span className="text-3xl font-bold text-[#8E3200]">{fa(input.players)}</span>
              ) : (
                <Icon name="fa-plus" className="text-2xl text-[#D7A86E]" />
              )}
              <span className="text-[10px] font-bold text-gray-500">بیشتر</span>
            </button>
          </div>
          {more && (
            <div className="flex items-center justify-center gap-4 mb-8">
              <button type="button" aria-label="کمتر" onClick={() => setInput({ ...input, players: Math.max(6, input.players - 1) })} className="w-11 h-11 bg-white rounded-xl border border-[#EEE2D3]">
                <Icon name="fa-minus" />
              </button>
              <span className="text-2xl font-bold w-12 text-center">{fa(Math.max(6, input.players))}</span>
              <button type="button" aria-label="بیشتر" onClick={() => setInput({ ...input, players: Math.max(6, input.players + 1) })} className="w-11 h-11 bg-white rounded-xl border border-[#EEE2D3]">
                <Icon name="fa-plus" />
              </button>
            </div>
          )}

          {players.length > 0 && (
            <div className="space-y-4 mb-10">
              <h3 className="font-bold text-[#4F4839] text-sm px-2">چه کسانی هستند؟ (اختیاری)</h3>
              <div className="flex flex-wrap gap-2">
                {players.map((p) => {
                  const on = input.playerIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const ids = on ? input.playerIds.filter((x) => x !== p.id) : [...input.playerIds, p.id];
                        setInput({ ...input, playerIds: ids, players: Math.max(input.players, ids.length + 1) });
                      }}
                      className={cx(
                        'px-4 py-2 border rounded-full flex items-center gap-2 text-[11px] font-bold min-h-9',
                        on ? 'bg-[#8E3200] text-white border-[#8E3200]' : 'bg-white border-[#EEE2D3] text-gray-600',
                      )}
                    >
                      <PhotoImg id={p.photoId} placeholderIcon="fa-user" className="w-5 h-5 rounded-full" />
                      {p.name}
                    </button>
                  );
                })}
              </div>
              {selectedCount > input.players && <p className="text-[10px] text-red-700 px-2">با خودت {fa(selectedCount)} نفر انتخاب شده‌اند.</p>}
            </div>
          )}

          <div className="space-y-6">
            <h3 className="font-bold text-[#4F4839] text-sm px-2">چقدر زمان دارید؟</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar" role="radiogroup" aria-label="زمان">
              {(Object.keys(TIME_WINDOWS) as TimeWindow[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={input.time === t}
                  onClick={() => setInput({ ...input, time: t })}
                  className={cx(
                    'px-6 py-3 rounded-2xl text-xs font-bold whitespace-nowrap transition-all min-h-11',
                    input.time === t ? 'bg-[#8E3200] text-white' : 'bg-white border border-[#EEE2D3] text-[#4F4839]',
                  )}
                >
                  {TIME_WINDOWS[t].label}
                </button>
              ))}
            </div>
          </div>

          {hint && (
            <div className="mt-12 bg-[#D7A86E]/10 p-6 rounded-[2rem] border border-[#D7A86E]/20 flex items-start gap-4">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#D7A86E] flex-shrink-0">
                <Icon name="fa-eye" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#8E3200] mb-1">از ترجیح‌های ثبت‌شده</p>
                <p className="text-[11px] leading-relaxed text-[#433520]">{hint}</p>
              </div>
            </div>
          )}
        </main>
      ) : (
        <main className="px-6 mt-4 space-y-12">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-[#4F4839] mb-2">جمع چقدر با بردگیم آشناست؟</h2>
              <p className="text-[11px] text-gray-500">میزان تجربه بازیکنان در انتخاب سطح پیچیدگی موثر است.</p>
            </div>
            <div className="space-y-3" role="radiogroup" aria-label="آشنایی جمع">
              {(Object.keys(FAMILIARITY) as Familiarity[]).map((f) => {
                const on = input.familiarity === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setInput({ ...input, familiarity: f })}
                    className={cx(
                      'w-full p-5 bg-white rounded-[2rem] flex items-center gap-4 transition-all',
                      on ? 'border-2 border-[#8E3200] shadow-md' : 'border border-[#EEE2D3]',
                    )}
                  >
                    <div className={cx('w-10 h-10 rounded-xl flex items-center justify-center', on ? 'bg-[#8E3200] text-white' : 'bg-[#FFF9F0] text-[#D7A86E]')}>
                      <Icon name={FAMILIARITY[f].icon} />
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#4F4839]">{FAMILIARITY[f].label}</p>
                      <p className="text-[10px] text-gray-500">{FAMILIARITY[f].hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-[#4F4839] px-2">دوست دارید جو بازی چطور باشد؟ (اختیاری)</h3>
            <div className="grid grid-cols-3 gap-3">
              {MOODS.map((m) => {
                const on = input.moods.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setInput({ ...input, moods: on ? input.moods.filter((x) => x !== m.key) : [...input.moods, m.key] })}
                    className={cx('mood-card min-h-11', on && 'mood-card-selected')}
                  >
                    <Icon name={m.icon} className={cx('text-xl', on ? 'text-[#8E3200]' : 'text-gray-400')} />
                    <span className="text-[10px] font-bold">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      )}

      <BottomAction>
        <button
          type="button"
          disabled={selectedCount > input.players}
          onClick={() => setStep((step + 1) as Step)}
          className="w-full bg-[#8E3200] text-white py-5 rounded-[2.5rem] font-bold shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
        >
          <span>{step === 1 ? 'مرحله بعد' : 'پیدا کردن بازی مناسب'}</span>
          <Icon name="fa-arrow-left" />
        </button>
      </BottomAction>
    </div>
  );
}

function observedHint(selected: { name: string; likes: string[]; dislikes: string[] }[]) {
  const parts = selected
    .filter((p) => p.likes.length || p.dislikes.length)
    .map((p) =>
      [p.likes.length ? `${p.name} بازی‌های ${p.likes.map((t) => `«${t}»`).join('، ')} را دوست دارد` : '', p.dislikes.length ? `${p.name} از ${p.dislikes.map((t) => `«${t}»`).join('، ')} استقبال نمی‌کند` : '']
        .filter(Boolean)
        .join(' و '),
    );
  return parts.length ? `${parts.join('؛ ')}. این‌ها در امتیاز پیشنهادها لحاظ می‌شوند.` : '';
}

function Result({
  input,
  result,
  index,
  onAgain,
  onBack,
}: {
  input: PickerInput;
  result: ReturnType<typeof pickGames>;
  index: number;
  onAgain: () => void;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const { configured, online } = useAiReady();
  const task = useAiTask<AiResponse>();
  const [answer, setAnswer] = useState<AiResponse>();
  const main = result.matches[index];
  const rest = result.matches.filter((_, i) => i !== index).slice(0, 4);
  const w = main.game.work;

  return (
    <div className="pb-32 page-enter">
      <header className="px-6 pt-8 pb-4 flex justify-between items-center bg-[#FFF9F0]/80 backdrop-blur-lg sticky top-0 z-20">
        <BackButton onClick={onBack} />
        <div className="text-center">
          <h1 className="text-lg font-bold text-[#4F4839]">پیشنهاد درنگ</h1>
          <p className="text-[10px] text-[#8E3200] font-bold">از مجموعهٔ خودت • {fa(result.matches.length)} گزینه</p>
        </div>
        <div className="w-12" />
      </header>
      <main className="px-6 mt-6 flex flex-col items-center">
        <div className="mb-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-[#8E3200] rounded-3xl flex items-center justify-center text-white text-2xl shadow-xl shadow-[#8E3200]/20 mb-4">
            <Icon name="fa-dice" />
          </div>
          <h2 className="text-xl font-bold text-[#4F4839]">{index === 0 ? 'بهترین گزینه برای امروز:' : 'گزینهٔ دیگر:'}</h2>
        </div>

        <div className="result-card w-full space-y-6">
          <button type="button" onClick={() => navigate(`/games/${main.game.copy.id}`)} className="relative block w-full aspect-square rounded-[2rem] overflow-hidden shadow-lg">
            <PhotoImg id={main.game.copy.photoIds[0]} full placeholderIcon="fa-dice" className="w-full h-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-6 text-right">
              <span className="text-[10px] text-white/80 font-bold uppercase tracking-widest mb-1">بازی پیشنهادی</span>
              <h3 className="text-2xl font-bold text-white">{main.game.copy.name}</h3>
            </div>
          </button>
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div className="flex flex-col items-center flex-1 border-l border-gray-100">
              <span className="text-[9px] font-bold text-gray-500 uppercase">زمان تخمینی</span>
              <span className="text-sm font-bold text-[#4F4839]">{formatRange(w?.playTimeMin, w?.playTimeMax)} دقیقه</span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-gray-100">
              <span className="text-[9px] font-bold text-gray-500 uppercase">تعداد نفرات</span>
              <span className="text-sm font-bold text-[#4F4839]">{fa(input.players)} نفر</span>
            </div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[9px] font-bold text-gray-500 uppercase">درجه سختی</span>
              <span className="text-sm font-bold text-[#8E3200]">{complexityLabel(w?.complexity)}</span>
            </div>
          </div>
          <div className="bg-[#FFF9F0] p-5 rounded-[1.5rem] border border-[#EEE2D3] relative space-y-2">
            <Icon name="fa-quote-right" className="absolute -top-3 -right-3 text-2xl text-[#D7A86E]/40" />
            <p className="text-[10px] font-bold text-[#8E3200]">چرا این بازی؟ (از داده‌های خودت)</p>
            <ul className="space-y-1.5">
              {main.reasons.map((r) => (
                <li key={r} className="text-[12px] leading-relaxed text-[#433520] flex gap-2">
                  <Icon name="fa-check" className="text-[9px] text-green-700 mt-1.5" />
                  <span>{r}</span>
                </li>
              ))}
              {main.cautions.map((r) => (
                <li key={r} className="text-[12px] leading-relaxed text-[#8E3200] flex gap-2">
                  <Icon name="fa-triangle-exclamation" className="text-[9px] mt-1.5" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="w-full mt-6 space-y-3">
          {task.running ? (
            <AiThinking label="هوش مصنوعی در حال مقایسهٔ گزینه‌هاست..." onCancel={task.cancel} />
          ) : answer ? (
            <AiAnswer response={answer} />
          ) : !configured ? (
            <AiStateCard code="needs_setup" />
          ) : (
            <>
              {task.error && <AiStateCard code={task.error} />}
              <button
                type="button"
                disabled={!online}
                onClick={async () => {
                  const r = await task.run((signal) => explainPicker(input, result.matches, signal));
                  if (r) setAnswer(r);
                }}
                className="w-full bg-[#433520] text-white p-4 rounded-3xl flex items-center gap-4 text-right disabled:opacity-50"
              >
                <span className="w-10 h-10 bg-[#8E3200] rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Icon name="fa-wand-magic-sparkles" className="text-[#D7A86E]" />
                </span>
                <span className="flex-1">
                  <span className="block text-[9px] text-[#D7A86E] font-bold uppercase tracking-widest">همراه انتخاب بازی</span>
                  <span className="block text-xs">{online ? 'توضیح هوش مصنوعی برای این جمع، با سابقهٔ جلسه‌هایت' : 'برای توضیح هوش مصنوعی اینترنت لازم است'}</span>
                </span>
              </button>
            </>
          )}
        </div>

        {rest.length > 0 && (
          <div className="w-full mt-10 space-y-4">
            <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-4">سایر گزینه‌ها</h3>
            <div className="space-y-3">
              {rest.map((m) => (
                <button
                  key={m.game.copy.id}
                  type="button"
                  onClick={() => navigate(`/games/${m.game.copy.id}`)}
                  className="w-full bg-white/50 p-3 rounded-2xl border border-[#EEE2D3] flex gap-4 items-center text-right"
                >
                  <PhotoImg id={m.game.copy.photoIds[0]} placeholderIcon="fa-dice" className="w-12 h-12 rounded-xl flex-shrink-0 opacity-80" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-[#4F4839] truncate">{m.game.copy.name}</h4>
                    <p className="text-[10px] text-gray-500 truncate">{m.reasons[0] ?? ''}</p>
                  </div>
                  <Icon name="fa-chevron-left" className="text-[10px] text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        )}
        {result.incomplete.length > 0 && <IncompleteList items={result.incomplete} />}
      </main>
      <BottomAction>
        <div className="flex gap-4">
          <button
            type="button"
            disabled={result.matches.length < 2}
            onClick={onAgain}
            className="flex-1 bg-white border border-[#EEE2D3] text-[#4F4839] py-4 rounded-2xl font-bold text-sm shadow-sm active:scale-95 transition-all disabled:opacity-50 min-h-11"
          >
            پیشنهاد دوباره
          </button>
          <button
            type="button"
            onClick={() => navigate(`/games/${main.game.copy.id}/log`)}
            className="flex-[2] bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#8E3200]/20 active:scale-95 transition-all min-h-11"
          >
            بزن بریم بازی!
          </button>
        </div>
      </BottomAction>
    </div>
  );
}

function IncompleteList({ items }: { items: ReturnType<typeof pickGames>['incomplete'] }) {
  const navigate = useNavigate();
  return (
    <div className="w-full mt-10 space-y-3">
      <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-4">اطلاعات ناقص؛ قضاوت نشد</h3>
      {items.map(({ game, missing }) => (
        <button
          key={game.copy.id}
          type="button"
          onClick={() => navigate(`/games/${game.copy.id}/edit`)}
          className="w-full bg-orange-50/50 border border-orange-100 p-3 rounded-2xl flex gap-3 items-center text-right"
        >
          <Icon name="fa-circle-exclamation" className="text-orange-500" />
          <span className="flex-1 text-xs">
            <span className="font-bold">{game.copy.name}</span>
            <span className="text-gray-500"> — نیاز به {missing.join('، ')}</span>
          </span>
          <span className="text-[10px] font-bold text-[#8E3200]">تکمیل</span>
        </button>
      ))}
    </div>
  );
}

function Empty({
  input,
  games,
  result,
  onApply,
  onBack,
  players,
}: {
  input: PickerInput;
  games: PickerGame[];
  result: ReturnType<typeof pickGames>;
  onApply: (next: PickerInput) => void;
  onBack: () => void;
  players: Parameters<typeof suggestRelaxations>[2];
}) {
  const navigate = useNavigate();
  const relax = suggestRelaxations(games, input, players);
  const chips = [`${fa(input.players)} نفر`, TIME_WINDOWS[input.time].label, FAMILIARITY[input.familiarity].label, ...MOODS.filter((m) => input.moods.includes(m.key)).map((m) => `سبک ${m.label}`)];
  return (
    <div className="min-h-screen flex flex-col items-center px-8 pt-28 pb-12 text-center space-y-8 page-enter relative">
      <header className="absolute top-8 left-6 right-6 flex justify-start">
        <BackButton kind="close" onClick={onBack} />
      </header>
      <div className="relative w-40 h-40">
        <div className="absolute inset-0 bg-[#D7A86E]/10 rounded-full blur-3xl" />
        <div className="relative flex items-center justify-center h-full">
          <Icon name="fa-magnifying-glass" className="text-7xl text-[#EEE2D3] absolute" />
          <Icon name="fa-question" className="text-3xl text-[#8E3200] relative top-[-10px] left-[-20px]" />
        </div>
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-[#4F4839]">موردی پیدا نکردم...</h1>
        <p className="text-sm leading-relaxed text-gray-500 px-4">با فیلترهای فعلی، هیچ بازی‌ای در مجموعه‌ات مطابقت نداشت.</p>
      </div>
      <div className="bg-white p-6 rounded-[2.5rem] border border-[#EEE2D3] w-full space-y-4 shadow-sm">
        <h3 className="text-xs font-bold text-[#8E3200] uppercase tracking-widest">چرا نتیجه‌ای نیست؟</h3>
        <div className="flex flex-wrap justify-center gap-2">
          {chips.map((c) => (
            <span key={c} className="reason-tag">
              {c}
            </span>
          ))}
        </div>
        <p className="text-[12px] leading-relaxed text-[#4F4839]">{explainEmpty(result, input)}</p>
      </div>
      {result.incomplete.length > 0 && <IncompleteList items={result.incomplete} />}
      <div className="w-full space-y-3 pt-2">
        {relax.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => onApply(r.input)}
            className="w-full bg-[#8E3200] text-white py-4 rounded-[2.5rem] font-bold shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-3 active:scale-95 transition-all text-sm"
          >
            <Icon name="fa-sliders" />
            <span>
              {r.label} ({fa(r.count)} بازی)
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => navigate('/games')}
          className="w-full bg-white border-2 border-[#EEE2D3] text-[#4F4839] py-4 rounded-[2.5rem] font-bold flex items-center justify-center gap-3 active:scale-95 transition-all text-sm"
        >
          <Icon name="fa-dice" />
          <span>مشاهده کل لیست بازی‌ها</span>
        </button>
      </div>
    </div>
  );
}
