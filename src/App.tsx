import { useEffect, useLayoutEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { OverlayProvider } from './ui/overlay';
import { BottomNav } from './ui/BottomNav';
import Home from './screens/Home';
import Collection from './screens/Collection';
import AddEntry from './screens/AddEntry';
import BookDetails from './screens/BookDetails';
import EditBook from './screens/EditBook';
import WorkDetails from './screens/WorkDetails';
import GameDetails from './screens/GameDetails';
import GameSpecs from './screens/GameSpecs';
import EditGame from './screens/EditGame';
import LogSession from './screens/LogSession';
import Picker from './screens/Picker';
import Players from './screens/Players';
import Settings, { AiSettings, BggSettings, ProfileSettings } from './screens/Settings';
import BggLookup from './screens/BggLookup';
import Backup from './screens/Backup';
import Stats from './screens/Stats';
import ReadingPath from './screens/ReadingPath';
import Wishlist from './screens/Wishlist';
import Search from './screens/Search';
import Identify from './screens/Identify';

const scrollPositions = new Map<string, number>();

/** New pages start at the top; going back returns to where you were (once the page's data has rendered). */
function ScrollMemory() {
  const { key } = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    window.history.scrollRestoration = 'manual';
  }, []);
  // Layout effect: stop recording before the next page can clamp the scroll of this one.
  useLayoutEffect(() => {
    // Also on taps (capture), since navigation starts from one and scroll events can lag behind.
    const save = () => scrollPositions.set(key, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    document.addEventListener('click', save, true);
    return () => {
      window.removeEventListener('scroll', save);
      document.removeEventListener('click', save, true);
    };
  }, [key]);
  useEffect(() => {
    const target = type === 'POP' ? (scrollPositions.get(key) ?? 0) : 0;
    window.scrollTo(0, target);
    if (!target) return;
    // The page may still be loading; keep trying until it is tall enough, for up to a second.
    const until = performance.now() + 1000;
    let timer = 0;
    const retry = () => {
      if (Math.abs(window.scrollY - target) < 2 || performance.now() > until) return;
      window.scrollTo(0, target);
      timer = window.setTimeout(retry, 16);
    };
    timer = window.setTimeout(retry, 16);
    const stop = () => clearTimeout(timer);
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    return () => {
      stop();
      window.removeEventListener('touchstart', stop);
    };
  }, [key, type]);
  return null;
}

/** Marks <body data-keyboard> while the on-screen keyboard is up, so fixed bottom bars can step aside. */
function KeyboardWatch() {
  useEffect(() => {
    let base = window.innerHeight;
    const editing = () => {
      const el = document.activeElement;
      return el instanceof HTMLElement && el.matches('input:not([type=checkbox],[type=radio],[type=file],[type=range]),textarea,select,[contenteditable]');
    };
    const update = () => {
      const typing = editing();
      if (!typing) base = window.innerHeight;
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.body.toggleAttribute('data-keyboard', typing && base - height > 150);
    };
    const later = () => setTimeout(update, 50);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    document.addEventListener('focusin', later);
    document.addEventListener('focusout', later);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      document.removeEventListener('focusin', later);
      document.removeEventListener('focusout', later);
    };
  }, []);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <OverlayProvider>
        <ScrollMemory />
        <KeyboardWatch />
        <div className="app-frame">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/books" element={<Collection key="books" kind="books" />} />
            <Route path="/games" element={<Collection key="games" kind="games" />} />
            <Route path="/add" element={<AddEntry />} />
            <Route path="/books/:id" element={<BookDetails />} />
            <Route path="/books/:id/edit" element={<EditBook />} />
            <Route path="/works/:id" element={<WorkDetails />} />
            <Route path="/games/:id" element={<GameDetails />} />
            <Route path="/games/:id/specs" element={<GameSpecs />} />
            <Route path="/games/:id/edit" element={<EditGame />} />
            <Route path="/games/:id/log" element={<LogSession />} />
            <Route path="/games/:id/log/:sessionId" element={<LogSession />} />
            <Route path="/identify/:kind/:id" element={<Identify />} />
            <Route path="/picker" element={<Picker />} />
            <Route path="/players" element={<Players />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/profile" element={<ProfileSettings />} />
            <Route path="/settings/ai" element={<AiSettings />} />
            <Route path="/settings/bgg" element={<BggSettings />} />
            <Route path="/games/:id/bgg" element={<BggLookup />} />
            <Route path="/settings/backup" element={<Backup />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/reading-path" element={<ReadingPath />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/search" element={<Search />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <BottomNav />
        </div>
      </OverlayProvider>
    </HashRouter>
  );
}
