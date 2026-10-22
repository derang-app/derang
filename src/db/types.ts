// Domain model. A "work" is the original creation (a book or a board game);
// a "copy" is the physical item the user owns or wishes for. Copies point at
// works so two translations of one book (or a redesign and an original of one
// game) share an identity while keeping their own history.

/** Where a stored value came from. Online/AI data never overwrites `manual*` silently. */
export type Source = 'manual' | 'rulebook' | 'online' | 'ai_unconfirmed' | 'ai_confirmed';

/** Identity match state of a copy against its original work. */
export type MatchStatus = 'unidentified' | 'suggested' | 'confirmed';

export type Provenance = Partial<Record<string, Source>>;

export interface BookWork {
  id: string;
  /** Original title (e.g. "Animal Farm"); may be unknown. */
  title?: string;
  authors: string[];
  altTitles: string[];
  refUrl?: string;
  refId?: string;
  provenance: Provenance;
  createdAt: number;
  updatedAt: number;
}

export type ReadStatus = 'unread' | 'reading' | 'read';

export interface Reflection {
  text?: string;
  moods: string[];
  /** True when the user skipped the end-of-book reflection. */
  skipped: boolean;
  at: number;
}

export interface BookCopy {
  id: string;
  workId: string;
  /** Title printed on my copy (usually Persian). */
  title: string;
  translators: string[];
  publisher?: string;
  language?: string;
  /** Free text: year, edition, print run… */
  publication?: string;
  isbn?: string;
  pageCount?: number;
  photoIds: string[];
  /** false = wishlist (not owned yet). */
  owned: boolean;
  status: ReadStatus;
  currentPage?: number;
  startedAt?: number;
  finishedAt?: number;
  rating?: number;
  favorite?: boolean;
  reflection?: Reflection;
  matchStatus: MatchStatus;
  provenance: Provenance;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingLog {
  id: string;
  copyId: string;
  at: number;
  fromPage: number;
  toPage: number;
}

export type NoteKind = 'note' | 'quote';

export interface Note {
  id: string;
  copyId: string;
  kind: NoteKind;
  text: string;
  page?: number;
  chapter?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type Interaction = 'low' | 'medium' | 'high';

export interface GameWork {
  id: string;
  /** Original game name (e.g. "Ticket to Ride: Europe"). */
  name?: string;
  altNames: string[];
  bggId?: string;
  refUrl?: string;
  /** Allowed player count, per the publisher/rulebook. */
  minPlayers?: number;
  maxPlayers?: number;
  /** Recommended counts according to a source/community (e.g. BGG poll). */
  recommendedPlayers: number[];
  playTimeMin?: number;
  playTimeMax?: number;
  /** Learning complexity on a 1–5 scale (1 = very simple, 5 = very complex). */
  complexity?: number;
  interaction?: Interaction;
  tags: string[];
  provenance: Provenance;
  createdAt: number;
  updatedAt: number;
}

export type Edition = 'copy' | 'redesign' | 'original' | 'unknown';

export interface GameCopy {
  id: string;
  workId: string;
  /** Name on my copy. */
  name: string;
  photoIds: string[];
  edition?: Edition;
  owned: boolean;
  /** Player counts I enjoy most, from my own experience. */
  favoritePlayers: number[];
  rating?: number;
  notes?: string;
  matchStatus: MatchStatus;
  provenance: Provenance;
  createdAt: number;
  updatedAt: number;
}

export type Familiarity = 'new' | 'familiar' | 'gamer';

export interface Player {
  id: string;
  name: string;
  photoId?: string;
  group?: string;
  /** Observable preferences: tags they enjoyed / avoided. */
  likes: string[];
  dislikes: string[];
  familiarity?: Familiarity;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type MyResult = 'win' | 'loss' | 'draw' | 'unknown';

export const ME = 'me';

export interface Session {
  id: string;
  gameCopyId: string;
  at: number;
  durationMin?: number;
  /** Player ids present; may include ME. */
  playerIds: string[];
  /** Winner ids; may include ME. */
  winnerIds: string[];
  result: MyResult;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Photo {
  id: string;
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
  createdAt: number;
}

export type AiKind =
  | 'identify_book'
  | 'identify_game'
  | 'reflection_questions'
  | 'creative_idea'
  | 'connections'
  | 'picker_explain'
  | 'wishlist_suggest'
  | 'reading_insight';

/** A stored AI response, viewable offline. Always presented as AI output. */
export interface AiResponse {
  id: string;
  kind: AiKind;
  targetType?: 'book' | 'game' | 'picker' | 'library';
  targetId?: string;
  model: string;
  /** Short human summary of what was asked. */
  prompt: string;
  text: string;
  data?: unknown;
  createdAt: number;
}

export interface KV {
  key: string;
  value: unknown;
}
