// Shared domain types. Keep this file free of imports so every module can depend on it.

/** One active record as reported by packet 0x111: id and raw progress count. */
export type RoeActive = { id: number; p: number };

/** Ids 4008..4021 are the rotating daily objectives the game assigns itself; accept is refused. */
export const AUTO_RANGE: readonly [number, number] = [4008, 4021];
export const MAX_ACTIVE = 30;
export const isAutoId = (id: number): boolean => id >= AUTO_RANGE[0] && id <= AUTO_RANGE[1];

/** A live addon connection, keyed by the Rust listener's conn id. */
export type Box = {
  conn: number;
  id: number;
  name: string;
  main?: string;
  mainLvl?: number;
  sub?: string;
  subLvl?: number;
  zone?: number;
  zoneName?: string;
  server?: string;
  av?: string;
  active?: RoeActive[];
  activeAt?: number;
  donePages?: Record<number, number[]>;
  doneAt?: number;
  lastSeen: number;
};

/** What is written to characters/<name>.json so offline characters keep their last state. */
export type PersistedChar = {
  name: string;
  id?: number;
  main?: string;
  sub?: string;
  zoneName?: string;
  active?: RoeActive[];
  activeAt?: number;
  donePages?: Record<number, number[]>;
  doneAt?: number;
  savedAt: number;
};

/** What views consume: online boxes merged over persisted snapshots. */
export type KnownChar = {
  name: string;
  id?: number;
  online: boolean;
  conn?: number;
  main?: string;
  sub?: string;
  zoneName?: string;
  active: RoeActive[];
  activeAt?: number;
  /** Union of every completion page received for this character. */
  doneIds: Set<number>;
  /** Page indices received; an id whose page (floor(id/1024)) is absent is UNKNOWN, not "not done". */
  donePagesKnown: Set<number>;
  savedAt?: number;
};

export type CatalogEntry = {
  id: number;
  n: string;
  cat?: string;
  sub?: string;
  repeat?: boolean;
  goal?: number;
  sparks?: number;
  exp?: number;
  acc?: number;
  text?: string;
  auto?: boolean;
};

export type RoeSet = {
  id: string;
  name: string;
  ids: number[];
  createdAt: number;
  updatedAt: number;
  lastAppliedAt?: number;
};
