import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { OverlayProvider } from './ui/overlay';
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

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <OverlayProvider>
        <ScrollToTop />
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
        </div>
      </OverlayProvider>
    </HashRouter>
  );
}
