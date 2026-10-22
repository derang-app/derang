import { NavLink, useNavigate } from 'react-router-dom';
import { cx, Icon } from './kit';

const TABS = [
  { to: '/', icon: 'fa-house', label: 'خانه', end: true },
  { to: '/books', icon: 'fa-book', label: 'کتاب‌ها' },
  null,
  { to: '/games', icon: 'fa-dice', label: 'بازی‌ها' },
  { to: '/settings', icon: 'fa-gear', label: 'تنظیمات' },
] as const;

/** Bottom navigation from the Home design: four tabs around a floating «+». */
export function BottomNav({ addTo = '/add' }: { addTo?: string }) {
  const navigate = useNavigate();
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed bottom-0 inset-x-app bg-white border-t border-[#EEE2D3] px-8 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-between items-center z-30 rounded-t-[2rem] shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
    >
      {TABS.map((tab) =>
        tab === null ? (
          <div key="fab" className="relative -top-8">
            <button
              type="button"
              aria-label="افزودن"
              onClick={() => navigate(addTo)}
              className="w-14 h-14 bg-[#8E3200] text-white rounded-full shadow-lg shadow-[#8E3200]/30 flex items-center justify-center text-xl border-4 border-[#FFF9F0] active:scale-95 transition-transform"
            >
              <Icon name="fa-plus" />
            </button>
          </div>
        ) : (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={'end' in tab}
            replace
            className={({ isActive }) =>
              cx('flex flex-col items-center gap-1 min-w-11 min-h-11 justify-center', isActive ? 'text-[#8E3200]' : 'text-gray-400')
            }
          >
            <Icon name={tab.icon} className="text-lg" />
            <span className="text-[10px] font-bold">{tab.label}</span>
          </NavLink>
        ),
      )}
    </nav>
  );
}
