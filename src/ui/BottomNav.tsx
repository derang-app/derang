import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cx, Icon } from './kit';

const TABS = [
  { to: '/', icon: 'fa-house', label: 'خانه', end: true },
  { to: '/books', icon: 'fa-book', label: 'کتاب‌ها' },
  null,
  { to: '/games', icon: 'fa-dice', label: 'بازی‌ها' },
  { to: '/settings', icon: 'fa-gear', label: 'تنظیمات' },
] as const;

const TAB_PATHS = new Set(['/', '/books', '/games', '/settings']);

/** «+» target for the current tab: books/games add their own kind, the wishlist filter adds a wish. */
function addTarget(pathname: string, params: URLSearchParams) {
  if (pathname === '/books') return `/add?type=book${params.get('status') === 'wish' ? '&wish=1' : ''}`;
  if (pathname === '/games') return `/add?type=game${params.get('filter') === 'wish' ? '&wish=1' : ''}`;
  return '/add';
}

/**
 * Bottom navigation from the Home design: four tabs around a floating «+».
 * Rendered once by the app shell (not per page), so switching tabs never remounts or animates it.
 */
export function BottomNav() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  if (!TAB_PATHS.has(pathname)) return null;
  const addTo = addTarget(pathname, new URLSearchParams(search));
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="hide-on-keyboard fixed bottom-0 inset-x-app bg-white border-t border-[#EEE2D3] px-8 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-between items-center z-30 rounded-t-[2rem] shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
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
