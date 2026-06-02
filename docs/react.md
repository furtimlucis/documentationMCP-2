# React 19.2 – Official Documentation (react.dev)

This repository is the source code for [react.dev](https://react.dev), the official documentation website for React 19.2. It is a Next.js 15 application that combines MDX content with interactive Sandpack code playgrounds, covering everything from beginner tutorials to advanced API references. The site documents the full React surface area: core hooks, built-in components, DOM rendering APIs, server-side rendering, React Server Components (RSC), and the experimental React Compiler — making it the authoritative reference for all React developers.

The content is organized into four main pillars: **Learn** (conceptual guides and tutorials), **Reference** (exhaustive API docs for `react`, `react-dom`, and RSC directives), **Community** (blog posts, release notes, and conference resources), and **Errors** (human-readable explanations for React's error codes). Each reference page follows a consistent structure — signature, parameters, return value, caveats, and usage examples with live Sandpack demos — and targets React 19.2, the latest stable release at the time of writing.

---

## Core Hooks (`react`)

### `useState` — Add reactive state to a function component

Declares a state variable and a setter. On each render the current value is returned; calling the setter with a new value (or an updater function) schedules a re-render.

```jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);           // primitive initial value
  const [todos, setTodos] = useState(() => loadTodosFromStorage()); // lazy initializer

  function increment() {
    setCount(c => c + 1);   // updater form — safe when new state depends on previous
  }

  function addTodo(text) {
    setTodos(prev => [...prev, { id: Date.now(), text, done: false }]);
  }

  return (
    <>
      <p>Count: {count}</p>
      <button onClick={increment}>+1</button>
      <button onClick={() => addTodo('Buy milk')}>Add todo</button>
      <ul>{todos.map(t => <li key={t.id}>{t.text}</li>)}</ul>
    </>
  );
}
```

---

### `useReducer` — Manage complex state with a reducer function

An alternative to `useState` suited for state that involves multiple sub-values or complex transition logic. Dispatching an action passes it through a pure reducer that produces the next state.

```jsx
import { useReducer } from 'react';

function reducer(state, action) {
  switch (action.type) {
    case 'increment': return { count: state.count + 1 };
    case 'decrement': return { count: state.count - 1 };
    case 'reset':     return { count: action.payload ?? 0 };
    default: throw new Error('Unknown action: ' + action.type);
  }
}

function Counter({ initialCount = 0 }) {
  const [state, dispatch] = useReducer(reducer, { count: initialCount });

  return (
    <>
      <p>Count: {state.count}</p>
      <button onClick={() => dispatch({ type: 'increment' })}>+</button>
      <button onClick={() => dispatch({ type: 'decrement' })}>−</button>
      <button onClick={() => dispatch({ type: 'reset', payload: initialCount })}>Reset</button>
    </>
  );
}
```

---

### `useEffect` — Synchronize a component with an external system

Runs a side-effect after the browser has painted. Accepts an optional cleanup function and a dependency array; the effect re-runs whenever a dependency changes.

```jsx
import { useState, useEffect } from 'react';

function ChatRoom({ roomId, serverUrl }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const connection = createChatConnection(serverUrl, roomId);
    connection.connect();
    connection.onMessage(msg => setMessages(prev => [...prev, msg]));

    // Cleanup runs before the next effect or on unmount
    return () => connection.disconnect();
  }, [serverUrl, roomId]); // Re-run only when roomId or serverUrl changes

  return <ul>{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>;
}

// Effect with no dependencies — runs once after mount
useEffect(() => {
  document.title = 'My App';
}, []);
```

---

### `useContext` — Read and subscribe to context

Returns the current value from the nearest matching `<Context>` provider above in the tree. The component re-renders automatically when the context value changes.

```jsx
import { createContext, useContext, useState } from 'react';

// 1. Create context (defaultValue used when no provider is found)
const ThemeContext = createContext('light');

// 2. Provide context value
function App() {
  const [theme, setTheme] = useState('dark');
  return (
    <ThemeContext value={theme}>   {/* React 19: use context directly as JSX */}
      <Toolbar />
      <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
        Toggle theme
      </button>
    </ThemeContext>
  );
}

// 3. Consume context anywhere in the tree
function Toolbar() {
  return <ThemedButton />;
}

function ThemedButton() {
  const theme = useContext(ThemeContext); // 'dark' or 'light'
  return <button className={`btn-${theme}`}>Styled button</button>;
}
```

---

### `useRef` — Reference a value or DOM node without triggering re-renders

Returns a mutable object `{ current: initialValue }` whose identity is stable across renders. Useful for storing interval IDs, previous values, or direct DOM references.

```jsx
import { useRef, useEffect } from 'react';

function StopWatch() {
  const intervalRef = useRef(null); // store timer id — changes don't cause re-renders
  const inputRef    = useRef(null); // reference a DOM element

  function start() {
    intervalRef.current = setInterval(() => console.log('tick'), 1000);
  }

  function stop() {
    clearInterval(intervalRef.current);
  }

  function focusInput() {
    inputRef.current.focus(); // imperative DOM access
  }

  return (
    <>
      <input ref={inputRef} placeholder="Type here" />
      <button onClick={focusInput}>Focus</button>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </>
  );
}
```

---

### `useCallback` — Cache a function definition between renders

Returns a memoized version of the callback that only changes when dependencies change. Primarily used to avoid unnecessary re-renders of child components wrapped in `memo`.

```jsx
import { useState, useCallback, memo } from 'react';

// Child only re-renders when onAddTodo reference changes
const TodoList = memo(function TodoList({ todos, onAddTodo }) {
  return (
    <>
      <button onClick={() => onAddTodo('New task')}>Add</button>
      <ul>{todos.map(t => <li key={t.id}>{t.text}</li>)}</ul>
    </>
  );
});

function TodoApp() {
  const [todos, setTodos] = useState([]);

  // Stable function reference — TodoList won't re-render when TodoApp re-renders for other reasons
  const handleAddTodo = useCallback((text) => {
    setTodos(prev => [...prev, { id: Date.now(), text }]);
  }, []); // no dependencies — function never needs to be recreated

  return <TodoList todos={todos} onAddTodo={handleAddTodo} />;
}
```

> **Note:** [React Compiler](/learn/react-compiler) automatically applies equivalent memoization, reducing the need for manual `useCallback`.

---

### `useMemo` — Cache an expensive calculation result

Re-computes a derived value only when its dependencies change. Avoids redundant work on every render for CPU-intensive transformations.

```jsx
import { useState, useMemo } from 'react';

function filterTodos(todos, filter) {
  // Simulate expensive filtering
  return todos.filter(t =>
    filter === 'all'    ? true :
    filter === 'done'   ? t.done :
    /* active */          !t.done
  );
}

function TodoList({ todos }) {
  const [filter, setFilter] = useState('all');

  // Only re-computes when `todos` or `filter` changes
  const visibleTodos = useMemo(() => filterTodos(todos, filter), [todos, filter]);

  return (
    <>
      <select value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">All</option>
        <option value="done">Done</option>
        <option value="active">Active</option>
      </select>
      <ul>{visibleTodos.map(t => <li key={t.id}>{t.text}</li>)}</ul>
    </>
  );
}
```

---

### `useTransition` — Mark state updates as non-blocking background renders

Returns `[isPending, startTransition]`. State updates inside `startTransition` are deprioritized so urgent updates (typing, clicking) remain responsive.

```jsx
import { useState, useTransition } from 'react';

function SearchPage() {
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value); // urgent — update the input immediately

    startTransition(async () => {
      // Non-blocking — React can interrupt this if the user keeps typing
      const data = await fetchResults(value);
      setResults(data);
    });
  }

  return (
    <>
      <input value={query} onChange={handleChange} placeholder="Search…" />
      {isPending && <span>Loading…</span>}
      <ul>{results.map(r => <li key={r.id}>{r.title}</li>)}</ul>
    </>
  );
}
```

---

### `useActionState` — Manage state driven by async Actions (React 19)

Combines a reducer-style function with async side effects. The dispatched action goes through a `reducerAction`, which can be async and perform network requests.

```jsx
import { useActionState } from 'react';

async function submitComment(previousState, formData) {
  const text = formData.get('comment');
  try {
    const saved = await postComment(text);
    return { status: 'success', comment: saved, error: null };
  } catch (err) {
    return { status: 'error', comment: null, error: err.message };
  }
}

function CommentForm() {
  const [state, dispatch, isPending] = useActionState(submitComment, {
    status: 'idle',
    comment: null,
    error: null,
  });

  return (
    <form action={dispatch}>
      <textarea name="comment" rows={4} />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Submitting…' : 'Submit'}
      </button>
      {state.status === 'success' && <p>Saved: {state.comment.text}</p>}
      {state.status === 'error'   && <p style={{ color: 'red' }}>{state.error}</p>}
    </form>
  );
}
```

---

### `useOptimistic` — Optimistically update the UI before a server response

Shows a temporary optimistic value while an async Action is in flight; automatically reverts to the real value when the Action settles.

```jsx
import { useOptimistic, useTransition } from 'react';

function LikeButton({ postId, initialLiked, initialCount }) {
  const [liked,  setLiked]  = useOptimistic(initialLiked);
  const [count,  setCount]  = useOptimistic(initialCount);
  const [, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setLiked(l => !l);              // optimistic toggle
      setCount(c => liked ? c - 1 : c + 1); // optimistic counter
      await toggleLike(postId);       // real server call
      // if the server call fails, React reverts to initialLiked / initialCount
    });
  }

  return (
    <button onClick={handleClick}>
      {liked ? '❤️' : '🤍'} {count}
    </button>
  );
}
```

---

### `use` — Read a Promise or context value (can be used inside conditions)

Unlike other hooks, `use` can be called inside `if` blocks and loops. When passed a Promise, it integrates with `<Suspense>` to suspend the component until the data is ready.

```jsx
import { use, Suspense } from 'react';

// Stream a promise from Server → Client Component
function MessagesList({ messagesPromise }) {
  const messages = use(messagesPromise); // suspends until resolved

  return <ul>{messages.map(m => <li key={m.id}>{m.text}</li>)}</ul>;
}

// Conditional context reading (not possible with useContext)
function Button({ showTheme }) {
  if (showTheme) {
    const theme = use(ThemeContext); // ✅ allowed inside a condition
    return <button className={theme}>Click</button>;
  }
  return <button>Click</button>;
}

// Usage with Suspense boundary
function App({ messagesPromise }) {
  return (
    <Suspense fallback={<p>Loading messages…</p>}>
      <MessagesList messagesPromise={messagesPromise} />
    </Suspense>
  );
}
```

---

### `useDeferredValue` — Defer updating a non-urgent derived value

Returns a stale version of a value that lags behind the latest; useful for keeping an input responsive while an expensive child re-renders with the new value.

```jsx
import { useState, useDeferredValue, memo } from 'react';

const SlowList = memo(function SlowList({ query }) {
  // Artificially slow render
  const items = Array.from({ length: 5000 }, (_, i) => ({
    id: i,
    match: `${query} result ${i}`,
  }));
  return <ul>{items.map(it => <li key={it.id}>{it.match}</li>)}</ul>;
});

function SearchPage() {
  const [query, setQuery] = useState('');
  const deferredQuery     = useDeferredValue(query); // stale until browser is idle

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      {/* Input stays responsive; SlowList re-renders in the background */}
      <SlowList query={deferredQuery} />
    </>
  );
}
```

---

### `useId` — Generate stable, unique IDs for accessibility attributes

Produces a server/client consistent ID that avoids hydration mismatches. Must not be used for list `key` props.

```jsx
import { useId } from 'react';

function PasswordField() {
  const id = useId();

  return (
    <div>
      <label htmlFor={`${id}-password`}>Password</label>
      <input id={`${id}-password`} type="password" aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`}>Must be at least 8 characters.</p>
    </div>
  );
}

// Multiple fields from one useId call — append suffixes
function SignupForm() {
  const id = useId();
  return (
    <form>
      <label htmlFor={`${id}-email`}>Email</label>
      <input id={`${id}-email`} type="email" />

      <label htmlFor={`${id}-username`}>Username</label>
      <input id={`${id}-username`} type="text" />
    </form>
  );
}
```

---

### `useSyncExternalStore` — Subscribe to an external (non-React) store

The correct way to subscribe to browser APIs, third-party state managers, or any mutable store outside React state.

```jsx
import { useSyncExternalStore } from 'react';

// --- A minimal external store ---
function createNetworkStatusStore() {
  let listeners = new Set();
  return {
    subscribe(cb) {
      window.addEventListener('online',  cb);
      window.addEventListener('offline', cb);
      listeners.add(cb);
      return () => {
        window.removeEventListener('online',  cb);
        window.removeEventListener('offline', cb);
        listeners.delete(cb);
      };
    },
    getSnapshot()       { return navigator.onLine; },
    getServerSnapshot() { return true; }, // assume online on server
  };
}
const networkStore = createNetworkStatusStore();

function NetworkBanner() {
  const isOnline = useSyncExternalStore(
    networkStore.subscribe,
    networkStore.getSnapshot,
    networkStore.getServerSnapshot,
  );
  if (isOnline) return null;
  return <div className="banner">You are offline</div>;
}
```

---

### `useEffectEvent` — Extract non-reactive logic from Effects

Creates an "Effect Event" — a function that reads the latest props and state without being listed as a dependency of the surrounding Effect.

```jsx
import { useEffect, useEffectEvent, useState } from 'react';

function ChatRoom({ roomId, theme }) {
  const [messages, setMessages] = useState([]);

  // showNotification reads `theme` but we don't want Effect to re-run when theme changes
  const onConnected = useEffectEvent(() => {
    showNotification('Connected to ' + roomId, theme); // always sees latest `theme`
  });

  useEffect(() => {
    const conn = createConnection(roomId);
    conn.connect();
    conn.onOpen(() => onConnected()); // call Effect Event from inside Effect
    return () => conn.disconnect();
  }, [roomId]); // ✅ theme is NOT in deps — onConnected is not reactive

  return <ul>{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>;
}
```

---

### `useImperativeHandle` — Customize the ref handle exposed to parents

Limits what a parent can do via a ref to only the methods you explicitly expose.

```jsx
import { useRef, useImperativeHandle } from 'react';

function FancyInput({ ref }) {
  const realInputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus()  { realInputRef.current.focus(); },
    clear()  { realInputRef.current.value = ''; },
    // hides all other native input methods from the parent
  }), []);

  return <input ref={realInputRef} className="fancy-input" />;
}

// Parent usage
function Form() {
  const fancyRef = useRef(null);
  return (
    <>
      <FancyInput ref={fancyRef} />
      <button onClick={() => fancyRef.current.focus()}>Focus</button>
      <button onClick={() => fancyRef.current.clear()}>Clear</button>
    </>
  );
}
```

---

### `useLayoutEffect` — Run an effect synchronously after DOM mutations, before paint

Same signature as `useEffect` but fires synchronously after DOM updates and before the browser paints — ideal for DOM measurements that must inform layout.

```jsx
import { useRef, useState, useLayoutEffect } from 'react';

function Tooltip({ targetRef, children }) {
  const tooltipRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const targetRect  = targetRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    setPosition({
      top:  targetRect.bottom + 8,
      left: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
    });
  }); // no deps — recalculate on every render, before paint

  return (
    <div ref={tooltipRef} style={{ position: 'fixed', ...position }}>
      {children}
    </div>
  );
}
```

---

### `useDebugValue` — Label custom Hooks in React DevTools

Adds a human-readable label to a custom Hook visible in the React DevTools component inspector.

```jsx
import { useState, useEffect, useDebugValue } from 'react';

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useDebugValue(isOnline ? 'Online' : 'Offline');

  // Optional: expensive format function is only called when DevTools are open
  useDebugValue(isOnline, status => `Network: ${status ? '✅' : '❌'}`);

  useEffect(() => {
    const handler = () => setIsOnline(navigator.onLine);
    window.addEventListener('online',  handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online',  handler);
      window.removeEventListener('offline', handler);
    };
  }, []);

  return isOnline;
}
```

---

## Built-in Components (`react`)

### `<Suspense>` — Show a fallback while children are loading

Wraps asynchronous content (lazy-loaded components, components using `use(promise)`) and displays a fallback until children are ready.

```jsx
import { Suspense, lazy } from 'react';

const Comments  = lazy(() => import('./Comments'));
const UserPanel = lazy(() => import('./UserPanel'));

function ProfilePage({ userId }) {
  return (
    <Suspense fallback={<p>Loading profile…</p>}>
      <UserPanel userId={userId} />
      {/* Nested boundary — Comments has its own fallback */}
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments userId={userId} />
      </Suspense>
    </Suspense>
  );
}
```

---

### `<Activity>` — Hide and restore UI state without unmounting (React 19.2)

Keeps a subtree alive in memory when `mode="hidden"`, preserving state and avoiding teardown costs. Useful for tab panels, drawers, or cached routes.

```jsx
import { Activity, useState } from 'react';

function TabbedLayout() {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <>
      <nav>
        {['home', 'profile', 'settings'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </nav>

      {/* All tabs stay mounted; only the active one is visible */}
      <Activity mode={activeTab === 'home'     ? 'visible' : 'hidden'}><Home /></Activity>
      <Activity mode={activeTab === 'profile'  ? 'visible' : 'hidden'}><Profile /></Activity>
      <Activity mode={activeTab === 'settings' ? 'visible' : 'hidden'}><Settings /></Activity>
    </>
  );
}
```

---

### `<Profiler>` — Measure rendering performance programmatically

Wraps a component subtree and calls an `onRender` callback with timing data every time the subtree commits.

```jsx
import { Profiler } from 'react';

function onRenderCallback(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  console.table({
    id,            // which part of the UI
    phase,         // 'mount' | 'update' | 'nested-update'
    actualDuration, // ms spent rendering (with memoization)
    baseDuration,   // ms without memoization (worst-case estimate)
  });
  analytics.track('render', { id, phase, actualDuration });
}

function App() {
  return (
    <Profiler id="App" onRender={onRenderCallback}>
      <Profiler id="Navigation" onRender={onRenderCallback}>
        <Navigation />
      </Profiler>
      <Profiler id="Feed" onRender={onRenderCallback}>
        <Feed />
      </Profiler>
    </Profiler>
  );
}
```

---

## Utility APIs (`react`)

### `memo` — Skip re-rendering when props are unchanged

Wraps a component so React bails out of re-rendering when all props are shallowly equal (by `Object.is`).

```jsx
import { memo, useState } from 'react';

const Avatar = memo(function Avatar({ src, alt, size = 40 }) {
  console.log('Avatar rendered'); // only when src, alt, or size changes
  return <img src={src} alt={alt} width={size} height={size} />;
});

// Custom equality — skip re-render if only `lastSeen` changed
const UserCard = memo(
  function UserCard({ user }) { return <div>{user.name}</div>; },
  (prevProps, nextProps) => prevProps.user.id === nextProps.user.id,
);
```

---

### `createContext` — Create a context object

Produces a context that components can provide and consume anywhere in the tree.

```jsx
import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null); // null = no logged-in user by default

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const login  = async (credentials) => { setUser(await authenticate(credentials)); };
  const logout = () => setUser(null);

  return (
    <AuthContext value={{ user, login, logout }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// Consumer
function Header() {
  const { user, logout } = useAuth();
  return user
    ? <><span>Hello, {user.name}</span><button onClick={logout}>Logout</button></>
    : <a href="/login">Login</a>;
}
```

---

### `lazy` — Defer loading a component's code until first render

Code-splits a component so its JavaScript bundle is only fetched when the component is first rendered. Must be paired with `<Suspense>`.

```jsx
import { lazy, Suspense } from 'react';

// The import() call happens only when <MarkdownEditor> is first rendered
const MarkdownEditor  = lazy(() => import('./MarkdownEditor'));
const ChartDashboard  = lazy(() => import('./ChartDashboard'));

function App({ page }) {
  return (
    <Suspense fallback={<div className="skeleton" />}>
      {page === 'editor'    && <MarkdownEditor />}
      {page === 'dashboard' && <ChartDashboard />}
    </Suspense>
  );
}
```

---

### `cache` — Deduplicate data fetching in Server Components (RSC)

Wraps a function so that calls with identical arguments return a cached result within a single server request. Each new server request starts with a fresh cache.

```jsx
// data/user.js  (server-only)
import { cache } from 'react';
import { db } from './db';

export const getUser = cache(async (userId) => {
  return await db.users.findById(userId);
});

// --- Server Components can call getUser(id) multiple times without extra DB hits ---

// UserHeader.server.jsx
async function UserHeader({ userId }) {
  const user = await getUser(userId); // first call — hits DB
  return <h1>{user.name}</h1>;
}

// UserBio.server.jsx
async function UserBio({ userId }) {
  const user = await getUser(userId); // cached — no second DB query
  return <p>{user.bio}</p>;
}
```

---

### `startTransition` — Mark a state update as non-blocking (module-level)

The standalone version of the `startTransition` returned by `useTransition` — useful when no `isPending` indicator is needed.

```jsx
import { startTransition } from 'react';
import { updateRoute } from './router';

// In a router or global event handler (outside a component)
function navigate(path) {
  startTransition(() => {
    updateRoute(path); // non-blocking navigation
  });
}

// Async action support (React 19)
startTransition(async () => {
  await saveToServer(formData);
  setSuccess(true);
});
```

---

## React DOM – Client APIs (`react-dom/client`)

### `createRoot` — Mount a React app into a DOM node

The entry point for all client-side React applications in React 18+.

```jsx
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');

const root = createRoot(container, {
  onUncaughtError(error, errorInfo) {
    console.error('Uncaught error:', error, errorInfo.componentStack);
    reportError(error);
  },
  onCaughtError(error, errorInfo) {
    console.warn('Error caught by boundary:', error, errorInfo.componentStack);
  },
});

root.render(<App />);

// Later — update the root (e.g., after hot module replacement)
root.render(<App version="2" />);

// Tear down
root.unmount();
```

---

### `hydrateRoot` — Attach React to server-rendered HTML

Hydrates an HTML payload produced by `react-dom/server`, making it interactive without re-creating the DOM.

```jsx
// client.js
import { hydrateRoot } from 'react-dom/client';
import App from './App';

hydrateRoot(document.getElementById('root'), <App />, {
  onRecoverableError(error) {
    // Called when React recovers from a hydration mismatch
    console.warn('Hydration error:', error);
  },
});

// Root.render can later be used for client-only updates:
// root.render(<App theme="dark" />);
```

---

## React DOM – Server APIs (`react-dom/server`)

### `renderToPipeableStream` — Stream HTML in Node.js with Suspense support

The recommended server rendering API for Node.js. Streams the HTML shell immediately, then streams deferred content as it resolves, enabling fast time-to-first-byte.

```js
// server.js (Express example)
import { renderToPipeableStream } from 'react-dom/server';
import App from './App';

app.get('*', (req, res) => {
  let didError = false;

  const { pipe, abort } = renderToPipeableStream(<App url={req.url} />, {
    bootstrapScripts: ['/static/js/main.js'],

    onShellReady() {
      // Shell is ready — start streaming the initial HTML
      res.statusCode = didError ? 500 : 200;
      res.setHeader('Content-Type', 'text/html');
      pipe(res);
    },

    onShellError(err) {
      // Critical error before the shell — send fallback
      res.statusCode = 500;
      res.send('<h1>Server Error</h1>');
    },

    onError(err) {
      didError = true;
      console.error(err);
    },
  });

  // Abort if client disconnects / timeout
  req.on('close', abort);
  setTimeout(abort, 10_000);
});
```

---

### `renderToReadableStream` — Stream HTML in edge/Web Streams environments

The Web Streams equivalent of `renderToPipeableStream` for Deno, Cloudflare Workers, and modern edge runtimes.

```js
// edge-handler.js
import { renderToReadableStream } from 'react-dom/server';
import App from './App';

export default async function handler(request) {
  const stream = await renderToReadableStream(<App />, {
    bootstrapScripts: ['/main.js'],
    onError(error) {
      console.error(error);
    },
  });

  // Wait for all Suspense boundaries to resolve before responding (for crawlers)
  await stream.allReady;

  return new Response(stream, {
    headers: { 'Content-Type': 'text/html' },
  });
}
```

---

## React Server Components (`react` / RSC directives)

### `"use client"` directive — Mark a module as a Client Component

A file-level directive that tells the RSC bundler to create a client boundary; the module and its imports are included in the client bundle.

```jsx
// Button.jsx
"use client"; // Everything in this file runs only on the client

import { useState } from 'react';

export function LikeButton({ postId }) {
  const [likes, setLikes] = useState(0);

  return (
    <button onClick={() => setLikes(l => l + 1)}>
      👍 {likes}
    </button>
  );
}
```

---

### `"use server"` directive — Create Server Functions callable from the client

A function-level (or file-level) directive that marks an async function to be executed on the server. React serializes arguments and return values automatically.

```jsx
// actions.js  (file-level "use server" makes all exports Server Functions)
"use server";

import { revalidatePath } from 'next/cache';
import { db } from './db';

export async function createPost(formData) {
  const title   = formData.get('title');
  const content = formData.get('content');

  const post = await db.posts.create({ title, content });
  revalidatePath('/blog');
  return post;
}

// --- Client Component using the Server Function via form action ---
"use client";
import { createPost } from './actions';
import { useActionState } from 'react';

export function NewPostForm() {
  const [state, action, isPending] = useActionState(createPost, null);

  return (
    <form action={action}>
      <input  name="title"   placeholder="Title"   />
      <textarea name="content" placeholder="Content" />
      <button disabled={isPending}>{isPending ? 'Saving…' : 'Create Post'}</button>
      {state && <p>Created: {state.title}</p>}
    </form>
  );
}
```

---

## React DOM – Utility APIs

### `createPortal` — Render children into a different DOM node

Mounts JSX into any DOM node (typically outside the root), while keeping React's event and context tree intact. Ideal for modals, tooltips, and toasts.

```jsx
import { createPortal } from 'react-dom';
import { useState, useEffect } from 'react';

function Modal({ isOpen, onClose, children }) {
  // Event bubbling works through the React tree, not the DOM tree
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body  // renders directly into <body> regardless of component position
  );
}

function App() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open Modal</button>
      <Modal isOpen={open} onClose={() => setOpen(false)}>
        <h2>Hello from a portal!</h2>
      </Modal>
    </>
  );
}
```

---

## Summary

React 19.2 as documented on react.dev is a comprehensive, production-grade UI library with a complete, layered API surface. For everyday component development the core hooks — `useState`, `useReducer`, `useEffect`, `useContext`, `useRef`, `useMemo`, and `useCallback` — cover virtually all stateful and side-effect logic. For concurrency-focused use cases, `useTransition`, `useDeferredValue`, `useActionState`, and `useOptimistic` expose React's concurrent rendering scheduler, enabling UIs that remain responsive during heavy updates or server round-trips. The `use` API and built-in `<Suspense>` and `<Activity>` components enable data-driven rendering patterns where components declaratively express their loading and hidden states.

For full-stack React applications, the RSC API (`"use client"`, `"use server"`, and `cache`) provides a first-class model for server-side rendering with seamless client interactivity. Server Functions replace most bespoke REST/RPC layers by letting client components call async server code directly. `renderToPipeableStream` / `renderToReadableStream` and `hydrateRoot` form the server/client handshake for streaming SSR with Suspense, while `createRoot` is the universal entry point for pure client apps. Together these primitives integrate naturally with frameworks like Next.js, Remix, or any custom bundler that implements the RSC specification, making react.dev the single authoritative reference for building everything from a simple widget to a large, data-intensive application.
