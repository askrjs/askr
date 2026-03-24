import { formatCurrency, formatPercent } from './format';

export type AppearanceMode = 'default' | 'harbor' | 'ink';
export type AccountStatus = 'active' | 'pending' | 'archived';

export type DashboardStat = {
  key: string;
  label: string;
  value: string;
  trend: string;
};

export type ActivityEntry = {
  id: string;
  actor: string;
  action: string;
  resource: string;
  timestamp: string;
};

export type AccountRecord = {
  id: string;
  name: string;
  email: string;
  plan: 'Starter' | 'Growth' | 'Enterprise';
  status: AccountStatus;
  mrr: number;
  seats: number;
};

export type PagedResult<T> = {
  items: T[];
  totalItems: number;
  totalPages: number;
  page: number;
};

const appearanceStorageKey = 'startkit:appearance';
const sessionStorageKey = 'startkit:session';
const appearanceOrder: AppearanceMode[] = ['default', 'harbor', 'ink'];
const storageFallback = new Map<string, string>();

let appearance: AppearanceMode = 'default';
let sessionEmail: string | null = null;

const accountSeed: AccountRecord[] = [
  {
    id: 'acc_001',
    name: 'Northwind Logistics',
    email: 'ops@northwind.example',
    plan: 'Enterprise',
    status: 'active',
    mrr: 32000,
    seats: 82,
  },
  {
    id: 'acc_002',
    name: 'Pinecone Retail',
    email: 'team@pinecone.example',
    plan: 'Growth',
    status: 'active',
    mrr: 9800,
    seats: 28,
  },
  {
    id: 'acc_003',
    name: 'Hexa Health',
    email: 'care@hexa.example',
    plan: 'Growth',
    status: 'pending',
    mrr: 6400,
    seats: 16,
  },
  {
    id: 'acc_004',
    name: 'Atlas Research',
    email: 'lab@atlas.example',
    plan: 'Starter',
    status: 'archived',
    mrr: 0,
    seats: 4,
  },
  {
    id: 'acc_005',
    name: 'Lumen Ops',
    email: 'admin@lumen.example',
    plan: 'Growth',
    status: 'active',
    mrr: 11400,
    seats: 34,
  },
  {
    id: 'acc_006',
    name: 'Summit Security',
    email: 'it@summit.example',
    plan: 'Enterprise',
    status: 'pending',
    mrr: 22900,
    seats: 63,
  },
  {
    id: 'acc_007',
    name: 'Aster Finance',
    email: 'hello@aster.example',
    plan: 'Starter',
    status: 'active',
    mrr: 3700,
    seats: 11,
  },
  {
    id: 'acc_008',
    name: 'Calico Labs',
    email: 'team@calico.example',
    plan: 'Growth',
    status: 'active',
    mrr: 12400,
    seats: 39,
  },
];

let accountsDb = [...accountSeed];

const activitiesSeed: ActivityEntry[] = [
  {
    id: 'evt_001',
    actor: 'Alex Morgan',
    action: 'invited',
    resource: '2 teammates to Northwind Logistics',
    timestamp: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt_002',
    actor: 'Priya Shah',
    action: 'upgraded',
    resource: 'Pinecone Retail from Starter to Growth',
    timestamp: new Date(Date.now() - 74 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt_003',
    actor: 'Jordan Kim',
    action: 'resolved',
    resource: 'billing retry for Aster Finance',
    timestamp: new Date(Date.now() - 5.5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt_004',
    actor: 'System',
    action: 'synced',
    resource: 'daily usage metrics',
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  },
];

function wait(signal?: AbortSignal, delay = 220): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delay);

    if (!signal) {
      return;
    }

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error('Request aborted'));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function readStorage(key: string): string | null {
  const fallback = storageFallback.get(key) ?? null;

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const storage = window.localStorage as {
      getItem?: (storageKey: string) => string | null;
    };
    if (typeof storage.getItem !== 'function') {
      return fallback;
    }

    return storage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string) {
  storageFallback.set(key, value);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    const storage = window.localStorage as {
      setItem?: (storageKey: string, storageValue: string) => void;
    };
    if (typeof storage.setItem !== 'function') {
      return;
    }

    storage.setItem(key, value);
  } catch {
    // Ignore storage write failures in non-browser or restricted test envs.
  }
}

function removeStorage(key: string) {
  storageFallback.delete(key);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    const storage = window.localStorage as {
      removeItem?: (storageKey: string) => void;
    };
    if (typeof storage.removeItem !== 'function') {
      return;
    }

    storage.removeItem(key);
  } catch {
    // Ignore storage delete failures in non-browser or restricted test envs.
  }
}

export function initializeAppSession() {
  if (typeof window === 'undefined') {
    return;
  }

  const storedAppearance = normalizeAppearance(
    readStorage(appearanceStorageKey) ?? appearance
  );
  setAppearance(storedAppearance);

  sessionEmail = readStorage(sessionStorageKey) ?? sessionEmail;
}

export function appearanceMode() {
  return appearance;
}

export function setAppearance(mode: AppearanceMode) {
  const normalized = normalizeAppearance(mode);
  appearance = normalized;

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.skAppearance = normalized;
  }

  writeStorage(appearanceStorageKey, normalized);
}

export function nextAppearance(mode: AppearanceMode): AppearanceMode {
  const current = normalizeAppearance(mode);
  const index = appearanceOrder.indexOf(current);
  return appearanceOrder[(index + 1) % appearanceOrder.length];
}

export function resetAppearancePreference() {
  appearance = 'default';

  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.skAppearance;
  }

  removeStorage(appearanceStorageKey);
}

export function isAuthenticated(): boolean {
  return sessionEmail !== null;
}

export function getSessionEmail(): string | null {
  return sessionEmail;
}

export async function signIn(input: {
  email: string;
  password: string;
  signal?: AbortSignal;
}): Promise<void> {
  await wait(input.signal, 260);

  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) {
    throw new Error('Enter a valid email address.');
  }

  if (input.password.trim().length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  sessionEmail = email;

  writeStorage(sessionStorageKey, email);
}

export function signOut() {
  sessionEmail = null;

  removeStorage(sessionStorageKey);
}

export async function getDashboardData(input: {
  signal?: AbortSignal;
}): Promise<{ stats: DashboardStat[]; activities: ActivityEntry[] }> {
  await wait(input.signal, 240);

  const activeAccounts = accountsDb.filter(
    (item) => item.status === 'active'
  ).length;
  const pendingAccounts = accountsDb.filter(
    (item) => item.status === 'pending'
  ).length;
  const mrr = accountsDb.reduce((sum, item) => sum + item.mrr, 0);
  const seats = accountsDb.reduce((sum, item) => sum + item.seats, 0);

  return {
    stats: [
      {
        key: 'mrr',
        label: 'Monthly recurring revenue',
        value: formatCurrency(mrr),
        trend: formatPercent(4.2),
      },
      {
        key: 'accounts',
        label: 'Active accounts',
        value: String(activeAccounts),
        trend: formatPercent(2.3),
      },
      {
        key: 'pending',
        label: 'Pending approvals',
        value: String(pendingAccounts),
        trend: formatPercent(-1.1),
      },
      {
        key: 'seats',
        label: 'Provisioned seats',
        value: String(seats),
        trend: formatPercent(3.8),
      },
    ],
    activities: [...activitiesSeed],
  };
}

export async function listAccounts(input: {
  query: string;
  status: AccountStatus | 'all';
  page: number;
  pageSize: number;
  signal?: AbortSignal;
}): Promise<PagedResult<AccountRecord>> {
  await wait(input.signal, 280);

  if (input.query.trim().toLowerCase() === 'error') {
    throw new Error('Mock API failed. Clear search text "error" and retry.');
  }

  const normalizedQuery = input.query.trim().toLowerCase();
  const filtered = accountsDb.filter((item) => {
    const statusMatch =
      input.status === 'all' ? true : item.status === input.status;
    if (!statusMatch) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return (
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.email.toLowerCase().includes(normalizedQuery) ||
      item.id.toLowerCase().includes(normalizedQuery)
    );
  });

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / input.pageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);
  const start = (page - 1) * input.pageSize;

  return {
    items: filtered.slice(start, start + input.pageSize),
    totalItems,
    totalPages,
    page,
  };
}

export async function archiveAccounts(input: {
  ids: string[];
  signal?: AbortSignal;
}): Promise<{ archived: number }> {
  await wait(input.signal, 220);

  let archived = 0;
  accountsDb = accountsDb.map((item) => {
    if (!input.ids.includes(item.id)) {
      return item;
    }

    archived += 1;
    return {
      ...item,
      status: 'archived',
    };
  });

  return { archived };
}

export function resetMockData() {
  accountsDb = [...accountSeed];
  signOut();
}

function normalizeAppearance(value: string | null | undefined): AppearanceMode {
  if (value === 'harbor' || value === 'ink' || value === 'default') {
    return value;
  }

  return 'default';
}
