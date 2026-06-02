# Next.js

Next.js is a full-stack React framework built by Vercel that enables production-ready web applications with built-in support for server-side rendering (SSR), static site generation (SSG), incremental static regeneration (ISR), and React Server Components. It provides a file-system-based router, automatic code splitting, image optimization, font optimization, and an integrated development server, removing the need to configure bundlers or server infrastructure from scratch. The current codebase is at version `16.3.0-canary.19`, encompassing the App Router (the primary routing model), the legacy Pages Router, and a suite of companion packages (`next-codemod`, `create-next-app`, `eslint-config-next`, etc.).

At its core, Next.js compiles and serves React applications through two distinct router models. The **App Router** (introduced in v13) is built on React Server Components, co-located layouts, streaming, Server Functions (formerly Server Actions), and a new caching layer called Cache Components (`use cache`). The **Pages Router** (the original model) provides `getStaticProps`, `getServerSideProps`, and `getStaticPaths` for data-fetching at the page level. Both routers share components such as `<Image>`, `<Link>`, `<Script>`, and `<Font>`, and are configured via a single `next.config.js` file at the project root.

---

## Installation and Project Setup

Bootstrap a new Next.js project using `create-next-app`, which scaffolds the directory structure, installs dependencies, and creates a starter `app/` (or `pages/`) directory.

```bash
# Interactive setup (recommended)
npx create-next-app@latest my-app
# --ts: TypeScript, --tailwind: Tailwind CSS, --app: App Router, --src-dir: src/ directory
npx create-next-app@latest my-app --ts --tailwind --app --src-dir

# Development server
cd my-app && npm run dev   # http://localhost:3000

# Production build + start
npm run build && npm start

# Upgrade to latest stable
npx @next/codemod@canary upgrade latest
```

---

## File-System Routing — Pages and Layouts (App Router)

In the App Router every folder in `app/` becomes a route segment. A `page.tsx` file makes the segment publicly accessible. A `layout.tsx` wraps all children in a shared UI that persists across navigations without re-rendering.

```tsx
// app/layout.tsx — Root layout (required, wraps every page)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

// app/page.tsx — Index route (/)
export default function HomePage() {
  return <h1>Hello Next.js!</h1>
}

// app/blog/[slug]/page.tsx — Dynamic route (/blog/:slug)
export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await fetch(`https://api.example.com/posts/${slug}`).then((r) =>
    r.json()
  )
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  )
}

// app/blog/[slug]/layout.tsx — Layout scoped to /blog/:slug and its children
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <nav>Blog Navigation</nav>
      {children}
    </section>
  )
}
```

---

## `<Link>` Component — Client-Side Navigation

`<Link>` extends `<a>` with automatic prefetching and client-side transitions. It is the primary navigation primitive in Next.js.

```tsx
// app/nav.tsx
import Link from 'next/link'

export default function Nav() {
  return (
    <nav>
      {/* Basic navigation */}
      <Link href="/dashboard">Dashboard</Link>

      {/* With query params */}
      <Link href={{ pathname: '/search', query: { q: 'nextjs' } }}>Search</Link>

      {/* Disable scroll-to-top on navigation */}
      <Link href="/docs" scroll={false}>Docs</Link>

      {/* Disable prefetching */}
      <Link href="/heavy-page" prefetch={false}>Heavy Page</Link>

      {/* Open in new tab */}
      <Link href="https://vercel.com" target="_blank" rel="noopener noreferrer">
        Vercel
      </Link>
    </nav>
  )
}
```

---

## `useRouter` Hook — Programmatic Navigation (Client Components)

`useRouter` (imported from `next/navigation`) enables programmatic route changes inside Client Components. Use `<Link>` for standard navigation; reserve `useRouter` for event-driven redirects.

```tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

export default function Dashboard() {
  const router = useRouter()
  const pathname = usePathname()          // e.g. '/dashboard'
  const searchParams = useSearchParams()  // URLSearchParams instance

  useEffect(() => {
    console.log('Navigated to:', pathname, searchParams.toString())
  }, [pathname, searchParams])

  return (
    <div>
      <button onClick={() => router.push('/profile')}>Go to Profile</button>
      <button onClick={() => router.replace('/login')}>Replace with Login</button>
      <button onClick={() => router.back()}>Go Back</button>
      <button onClick={() => router.refresh()}>Refresh Server Data</button>
      <button
        onClick={() =>
          router.push('/settings', { scroll: false })
        }
      >
        Settings (no scroll reset)
      </button>
    </div>
  )
}
```

---

## `useSearchParams` Hook — Reading URL Query Parameters

`useSearchParams` is a read-only Client Component hook that returns a `URLSearchParams`-compatible interface for the current URL's query string.

```tsx
'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export default function SearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Read a param
  const query = searchParams.get('q') ?? ''

  // Update the search param without losing others
  const setQuery = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set('q', value)
      } else {
        params.delete('q')
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <input
      defaultValue={query}
      placeholder="Search..."
      onChange={(e) => setQuery(e.target.value)}
    />
  )
}
```

---

## `cookies` — Reading and Writing Cookies (Server)

`cookies` is an async server-side function (from `next/headers`) for reading request cookies in Server Components and reading/writing cookies in Server Functions and Route Handlers.

```tsx
// app/actions.ts — Server Function (write cookies)
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function signIn(formData: FormData) {
  const token = await authenticateUser(
    formData.get('email') as string,
    formData.get('password') as string
  )

  if (!token) throw new Error('Invalid credentials')

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  redirect('/dashboard')
}

export async function signOut() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
  redirect('/login')
}

// app/dashboard/page.tsx — Server Component (read cookies)
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')

  if (!session) redirect('/login')

  return <h1>Welcome back!</h1>
}
```

---

## `headers` — Reading Request Headers (Server Components)

`headers` is an async server-side function that returns a read-only Web `Headers` object representing the incoming HTTP request headers.

```tsx
// app/page.tsx
import { headers } from 'next/headers'

export default async function Page() {
  const headersList = await headers()

  const userAgent = headersList.get('user-agent') ?? 'unknown'
  const acceptLang = headersList.get('accept-language') ?? 'en'
  const authorization = headersList.get('authorization')

  // Forward auth header to an upstream API
  const data = authorization
    ? await fetch('https://api.example.com/me', {
        headers: { authorization },
      }).then((r) => r.json())
    : null

  return (
    <div>
      <p>Browser: {userAgent}</p>
      <p>Language: {acceptLang}</p>
      {data && <p>User: {data.name}</p>}
    </div>
  )
}
```

---

## `redirect` and `permanentRedirect` — Server-Side Redirects

`redirect` (307 Temporary) and `permanentRedirect` (308 Permanent) throw a special `NEXT_REDIRECT` error that Next.js catches to redirect the user. They work in Server Components, Server Functions, and Route Handlers. Call them **outside** `try` blocks.

```tsx
// app/team/[id]/page.tsx
import { redirect, permanentRedirect } from 'next/navigation'
import { notFound } from 'next/navigation'

async function getTeam(id: string) {
  const res = await fetch(`https://api.example.com/teams/${id}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to fetch team')
  return res.json()
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const team = await getTeam(id)

  if (!team) notFound()                        // renders not-found.tsx
  if (team.dissolved) permanentRedirect('/')   // 308 redirect
  if (!team.active) redirect('/teams')         // 307 redirect

  return <h1>{team.name}</h1>
}

// app/actions.ts — Redirect after a Server Function
'use server'

import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const id = await savePost({ title: formData.get('title') as string })
  redirect(`/posts/${id}`)   // must be outside try/catch
}
```

---

## Route Handlers — API Endpoints (`route.ts`)

Route Handlers are file-based API endpoints created by exporting HTTP method functions from a `route.ts` (or `.js`) file inside `app/`. They receive a `NextRequest` and return a `Response`.

```ts
// app/api/posts/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// GET /api/posts?limit=10&offset=0
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const limit = Number(searchParams.get('limit') ?? 10)
  const offset = Number(searchParams.get('offset') ?? 0)

  const posts = await db.posts.findMany({ take: limit, skip: offset })
  return NextResponse.json({ posts, total: posts.length })
}

// POST /api/posts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    const post = await db.posts.create({ data: body })
    return NextResponse.json(post, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// app/api/posts/[id]/route.ts — Dynamic Route Handler
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const post = await db.posts.findUnique({ where: { id } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(post)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.posts.delete({ where: { id } })
  return new Response(null, { status: 204 })
}
```

---

## `<Image>` Component — Automatic Image Optimization

`next/image` wraps `<img>` with automatic lazy loading, size optimization, WebP/AVIF conversion, responsive sizing via `sizes`, and layout-shift prevention. External domains must be listed in `next.config.js` under `images.remotePatterns`.

```tsx
// app/gallery/page.tsx
import Image from 'next/image'
import profilePic from './profile.png' // static import — auto width/height

export default function Gallery() {
  return (
    <div>
      {/* Static import — no width/height needed */}
      <Image src={profilePic} alt="Profile picture" placeholder="blur" />

      {/* Known dimensions */}
      <Image
        src="https://images.unsplash.com/photo-123"
        alt="Landscape"
        width={1200}
        height={630}
        sizes="(max-width: 768px) 100vw, 50vw"
        quality={85}
        priority // LCP image — disables lazy loading
      />

      {/* Fill parent container (requires position: relative on parent) */}
      <div style={{ position: 'relative', width: '100%', height: 400 }}>
        <Image
          src="/hero.jpg"
          alt="Hero"
          fill
          style={{ objectFit: 'cover' }}
          sizes="100vw"
        />
      </div>

      {/* Custom loader for a CDN */}
      <Image
        src="product-123.jpg"
        alt="Product"
        width={400}
        height={400}
        loader={({ src, width, quality }) =>
          `https://cdn.example.com/${src}?w=${width}&q=${quality ?? 75}`
        }
      />
    </div>
  )
}

// next.config.js — allow external image domains
/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.example.com' },
    ],
  },
}
```

---

## `generateMetadata` — Dynamic SEO Metadata

Export a `metadata` object or an async `generateMetadata` function from any `page.tsx` or `layout.tsx` to set `<head>` tags. Dynamic metadata can fetch data using the route `params`.

```tsx
// app/products/[id]/page.tsx
import type { Metadata, ResolvingMetadata } from 'next'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Dynamic metadata per product
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { id } = await params
  const product = await fetch(`https://api.example.com/products/${id}`).then(
    (r) => r.json()
  )
  const parentOpenGraph = (await parent).openGraph?.images ?? []

  return {
    title: `${product.name} | My Store`,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: [product.imageUrl, ...parentOpenGraph],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      images: [product.imageUrl],
    },
    alternates: {
      canonical: `/products/${id}`,
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params
  const product = await fetch(`https://api.example.com/products/${id}`).then(
    (r) => r.json()
  )
  return <h1>{product.name}</h1>
}

// app/layout.tsx — static metadata with template
export const metadata: Metadata = {
  title: { template: '%s | My Store', default: 'My Store' },
  description: 'The best online store.',
  metadataBase: new URL('https://example.com'),
}
```

---

## `generateStaticParams` — Static Generation for Dynamic Routes

`generateStaticParams` pre-renders all specified dynamic route variants at build time, enabling static HTML output and fast CDN delivery.

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await fetch('https://api.example.com/posts').then((r) =>
    r.json()
  )
  // Pre-render every post at build time
  return posts.map((post: { slug: string }) => ({ slug: post.slug }))
}

// app/[category]/[product]/page.tsx — nested dynamic segments
export async function generateStaticParams() {
  const products = await fetch('https://api.example.com/products').then((r) =>
    r.json()
  )
  return products.map((p: { category: string; id: string }) => ({
    category: p.category,
    product: p.id,
  }))
}

// Disable rendering for unlisted paths (404 instead of on-demand render)
export const dynamicParams = false

export default async function ProductPage({
  params,
}: {
  params: Promise<{ category: string; product: string }>
}) {
  const { category, product } = await params
  const data = await fetch(
    `https://api.example.com/${category}/${product}`
  ).then((r) => r.json())
  return <div>{data.name}</div>
}
```

---

## `revalidatePath` — On-Demand Path Cache Invalidation

`revalidatePath` invalidates the server-side cache for a specific path or layout pattern, causing fresh data to be fetched on the next visit.

```ts
// app/api/revalidate/route.ts — webhook endpoint
import type { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-revalidate-secret')
  if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path, type } = await request.json()

  if (path === '/') {
    revalidatePath('/', 'layout') // purge entire Client Cache
  } else if (type === 'layout') {
    revalidatePath(path, 'layout') // revalidate layout + all nested pages
  } else {
    revalidatePath(path) // revalidate single page
  }

  return Response.json({ revalidated: true, now: Date.now() })
}

// app/actions.ts — after a mutation
'use server'

import { revalidatePath } from 'next/cache'

export async function publishPost(id: string) {
  await db.posts.update({ where: { id }, data: { published: true } })
  revalidatePath('/blog')            // specific page
  revalidatePath('/blog/[slug]', 'page') // all blog post pages
}
```

---

## `revalidateTag` — On-Demand Tag-Based Cache Invalidation

`revalidateTag` marks all cache entries associated with a tag as stale, so they refresh using stale-while-revalidate semantics on the next visit. Tags must first be assigned via `fetch`'s `next.tags` option or the `cacheTag()` function.

```ts
// Assign a tag when fetching
const posts = await fetch('https://api.example.com/posts', {
  next: { tags: ['posts'] },
})

// app/actions.ts — invalidate after a write
'use server'

import { revalidateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.posts.create({ data: { title: formData.get('title') as string } })
  revalidateTag('posts', 'max') // stale-while-revalidate on all pages using 'posts'
}

// app/api/webhook/route.ts — external CMS webhook
import type { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function POST(request: NextRequest) {
  const { type, tag } = await request.json()

  if (type === 'immediate') {
    revalidateTag(tag, { expire: 0 }) // force immediate expiration
  } else {
    revalidateTag(tag, 'max') // background revalidation
  }

  return Response.json({ ok: true })
}
```

---

## `use cache` Directive — Cache Components

The `use cache` directive marks an async function or component as cacheable. It requires `cacheComponents: true` in `next.config.js` and integrates with `cacheTag` and `cacheLife` for fine-grained cache control.

```tsx
// next.config.ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = { cacheComponents: true }
export default nextConfig

// app/data.ts — cached data-fetching function
import { cacheTag } from 'next/cache'

export async function getPosts(category: string) {
  'use cache'
  cacheTag('posts', `category:${category}`)
  const posts = await fetch(
    `https://api.example.com/posts?category=${category}`
  ).then((r) => r.json())
  return posts
}

// app/dashboard/page.tsx — cached Server Component
import { cacheTag, cacheLife } from 'next/cache'

async function UserStats({ userId }: { userId: string }) {
  'use cache'
  cacheTag(`user:${userId}`)
  cacheLife('hours') // built-in profile: stale for 1 hour

  const stats = await fetch(`https://api.example.com/users/${userId}/stats`).then(
    (r) => r.json()
  )
  return <div>Posts: {stats.postCount} | Likes: {stats.likeCount}</div>
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  return (
    <div>
      <h1>Dashboard</h1>
      <UserStats userId={userId} />
    </div>
  )
}
```

---

## `cacheTag` — Tagging Cache Entries for Invalidation

`cacheTag` assigns one or more string tags to the current `use cache` scope, enabling targeted on-demand invalidation via `revalidateTag` or `updateTag`.

```tsx
// app/products/data.ts
import { cacheTag } from 'next/cache'

export async function getProduct(id: string) {
  'use cache'
  cacheTag('products', `product:${id}`) // multiple tags
  return fetch(`https://api.example.com/products/${id}`).then((r) => r.json())
}

// app/admin/actions.ts — invalidate after update
'use server'

import { revalidateTag } from 'next/cache'
import { getProduct } from '../products/data'

export async function updateProduct(id: string, data: Record<string, unknown>) {
  await db.products.update({ where: { id }, data })
  revalidateTag(`product:${id}`, 'max') // invalidate this specific product
  revalidateTag('products', 'max')      // also invalidate product listings
}
```

---

## `after` — Non-Blocking Post-Response Work

`after` schedules a callback to execute after the response (or prerender) is complete without blocking the response to the client. Ideal for logging, analytics, and secondary side effects.

```ts
// app/api/orders/route.ts
import { after } from 'next/server'
import { cookies, headers } from 'next/headers'

export async function POST(request: Request) {
  const order = await request.json()

  // Primary work — user waits for this
  const createdOrder = await db.orders.create({ data: order })

  // Non-blocking secondary work — user does NOT wait
  after(async () => {
    const sessionId = (await cookies()).get('session-id')?.value
    const ua = (await headers()).get('user-agent') ?? 'unknown'

    await Promise.all([
      analytics.track('order.created', { orderId: createdOrder.id, sessionId }),
      emailService.sendConfirmation(order.email, createdOrder),
      logger.info('order_created', { id: createdOrder.id, ua }),
    ])
  })

  return Response.json(createdOrder, { status: 201 })
}

// app/page.tsx — after in a Server Component (read request data outside after)
import { after } from 'next/server'
import { cookies } from 'next/headers'

export default async function Page() {
  // Read request-time data BEFORE after() — required in Server Components
  const sessionId = (await cookies()).get('session-id')?.value ?? 'anonymous'

  after(() => {
    pageViewTracker.record({ path: '/', sessionId })
  })

  return <h1>Home</h1>
}
```

---

## Proxy (`proxy.ts`) — Request Interception and Rewriting

The `proxy.ts` file (formerly `middleware.ts`, renamed in Next.js 16) runs on the server edge before routes are rendered. It intercepts every matching request and can redirect, rewrite, add headers, or respond directly. Use the `config.matcher` export to limit which paths trigger the proxy.

```ts
// proxy.ts (project root or src/)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- Authentication guard ---
  const session = request.cookies.get('session')?.value
  if (pathname.startsWith('/dashboard') && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // --- Geo-based rewrite ---
  const country = request.geo?.country ?? 'US'
  if (pathname === '/' && country !== 'US') {
    return NextResponse.rewrite(new URL(`/${country.toLowerCase()}`, request.url))
  }

  // --- Add custom request header ---
  const response = NextResponse.next()
  response.headers.set('x-request-id', crypto.randomUUID())
  return response
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
}
```

---

## `NextResponse` — Enhanced Response API (Proxy / Route Handlers)

`NextResponse` extends the Web `Response` API with convenience methods for redirects, rewrites, JSON responses, and cookie manipulation, designed for use in `proxy.ts` and Route Handlers.

```ts
// proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Redirect
  if (request.nextUrl.pathname === '/old-path') {
    return NextResponse.redirect(new URL('/new-path', request.url))
  }

  // Rewrite (URL stays the same in the browser)
  if (request.nextUrl.pathname.startsWith('/docs')) {
    return NextResponse.rewrite(new URL('/internal-docs', request.url))
  }

  // Pass through, set a cookie and a response header
  const response = NextResponse.next()
  response.cookies.set('visited', 'true', { maxAge: 3600 })
  response.headers.set('x-frame-options', 'DENY')
  return response
}

// app/api/data/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const data = await fetchData()
    return NextResponse.json(data)                         // 200
  } catch (err) {
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500, headers: { 'retry-after': '30' } }
    )
  }
}
```

---

## `next.config.js` — Project Configuration

`next.config.js` (or `.mjs` / `.ts`) is the central configuration file. It controls the build, routing, caching, image optimization, headers, redirects, rewrites, and experimental features.

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deployment
  output: 'standalone', // minimal Docker image
  basePath: '/app',     // serve from a sub-path
  assetPrefix: 'https://cdn.example.com', // CDN prefix for static assets

  // Caching (Cache Components)
  cacheComponents: true,
  cacheLife: {
    // Custom profiles usable with cacheLife()
    blog: { stale: 3600, revalidate: 900, expire: 86400 },
  },

  // Image optimization
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.example.com' }],
    formats: ['image/avif', 'image/webp'],
  },

  // Security
  reactStrictMode: true,

  // Custom HTTP headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },

  // Redirects
  async redirects() {
    return [
      { source: '/old', destination: '/new', permanent: true },
    ]
  },

  // Rewrites
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'https://upstream.api/:path*' },
    ]
  },

  // Transpile third-party packages
  transpilePackages: ['some-esm-only-package'],

  // Turbopack (experimental bundler)
  turbopack: {},
}

module.exports = nextConfig
```

---

## Extended `fetch` — Server-Side Caching and Revalidation

Next.js extends the native `fetch()` API with a `next` option for server-side persistent caching, revalidation intervals, and cache tag assignment.

```tsx
// app/page.tsx — various caching strategies
export default async function Page() {
  // Force-cache: stored indefinitely, use revalidateTag/revalidatePath to refresh
  const staticData = await fetch('https://api.example.com/config', {
    cache: 'force-cache',
  })

  // Time-based revalidation: refresh every 60 seconds (ISR equivalent)
  const recentPosts = await fetch('https://api.example.com/posts', {
    next: { revalidate: 60 },
  })

  // Tag-based invalidation: purge on demand with revalidateTag('products')
  const products = await fetch('https://api.example.com/products', {
    next: { tags: ['products'], revalidate: 3600 },
  })

  // No caching: always fresh (dynamic rendering)
  const livePrice = await fetch('https://api.example.com/price', {
    cache: 'no-store',
  })

  const [config, posts, prods, price] = await Promise.all([
    staticData.json(),
    recentPosts.json(),
    products.json(),
    livePrice.json(),
  ])

  return (
    <div>
      <p>Version: {config.version}</p>
      <p>Posts: {posts.length}</p>
      <p>Products: {prods.length}</p>
      <p>Price: {price.usd}</p>
    </div>
  )
}
```

---

## Summary

Next.js is the production standard for React applications that need a unified full-stack developer experience. Its primary use cases span from fully static marketing sites and documentation portals (using `generateStaticParams` + `force-cache` fetches) to highly dynamic SaaS dashboards and e-commerce platforms (using Route Handlers, Server Functions, `cookies`/`headers`, and on-demand cache invalidation via `revalidateTag`/`revalidatePath`). The App Router's Cache Components system (`use cache`, `cacheTag`, `cacheLife`) and post-response hooks (`after`) let teams implement sophisticated caching and analytics pipelines without dedicated background queues.

Integration patterns consistently rely on a small set of primitives: the file-system router defines the URL structure through folders; `<Link>` and `useRouter` handle client navigation; `cookies`/`headers` bridge server-rendered content with request context; Route Handlers (`route.ts`) expose typed REST or webhook endpoints; and `proxy.ts` intercepts requests at the edge for auth, geo-routing, and security headers. Third-party integrations (CMS webhooks, Stripe, Auth providers) typically call `revalidateTag` or `revalidatePath` via a protected Route Handler to keep cached content fresh, while `after` handles non-critical side effects (logging, email, analytics) without penalizing response latency.
