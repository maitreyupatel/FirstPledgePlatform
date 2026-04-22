# FirstPledge - Trust-as-a-Service Platform

## Overview

FirstPledge is a consumer product safety verification platform that uses AI-powered ingredient analysis to provide transparent, evidence-backed safety reports. The platform enables administrators to rapidly vet products (skincare, food, cleaning supplies) and publish authoritative safety assessments for public consumption.

**Core Value Proposition:**
- **For Consumers:** Instant clarity on product safety with transparent, clickable evidence and citations
- **For Admins:** 10x faster research workflow using AI as a junior researcher that proposes complete reports for human approval

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework:** React with TypeScript, using Vite as the build tool

**UI Component Strategy:**
- **shadcn/ui** component library (Radix UI primitives with custom styling)
- Design system inspired by premium fintech (Cred) and health-tech (Yuka) aesthetics
- Emphasis on "articulate trust" over generic tech appearance
- Typography: Inter/SF Pro Display for authority and presence
- Color system focused on trustworthy, muted tones for safety states (safe/caution/banned)

**Routing:**
- Client-side routing with `wouter` library
- Key routes: Home (`/`), Product Detail (`/product/:id`), Admin Dashboard (`/admin`), Product Form (`/admin/:action`)

**State Management:**
- TanStack Query (React Query) for server state and caching
- Local component state with React hooks
- No global state management library (relying on React Query's cache)

**Styling Approach:**
- Tailwind CSS with custom design tokens
- CSS custom properties for theming (light/dark mode support)
- Elevation system using shadow utilities (`hover-elevate`, `active-elevate-2`)
- Modular component architecture with isolated concerns

### Backend Architecture

**Runtime:** Node.js with Express.js

**API Design:**
- RESTful API pattern (routes prefixed with `/api`)
- Express middleware stack for logging, JSON parsing, and request handling
- Storage interface pattern (currently in-memory, designed for database migration)

**Data Layer:**
- **ORM:** Drizzle ORM configured for PostgreSQL
- **Database Driver:** Neon serverless PostgreSQL client with WebSocket support
- Schema defined in shared TypeScript for type safety across client/server
- Migration system via Drizzle Kit

**Storage Interface Design:**
- Abstraction layer (`IStorage` interface) separating business logic from data access
- Current implementation: `MemStorage` (in-memory, for development)
- Designed to swap to database-backed implementation without changing application code
- Full CRUD methods for users, products, and ingredients
- Supports draft/published states with `includeUnpublished` filtering

### AI Integration Architecture

**Provider:** Google Generative AI (`@google/genai`)

**Implemented AI Workflow:**
1. Parse raw ingredient lists into structured data
2. Call Gemini 2.5 Flash model to analyze all ingredients
3. Receive safety ratings (Safe/Caution/Banned) with rationale and sources
4. Robust JSON parsing with fallback error handling
5. Present complete analysis to admin for editorial review
6. Admin can override any AI rating with one click
7. Track original AI ratings and override flags

**Current Implementation:**
- `POST /api/vet-ingredients` - Analyzes raw ingredient text using Gemini
- Sanitizes responses by stripping markdown fences and extracting JSON
- Validates all fields with fallback defaults (missing status → caution)
- Generates overall product status and safety summary
- Takes 15-30 seconds per analysis

**Design Philosophy:** AI acts as a "junior researcher" requiring human approval, not autonomous decision-maker

### Key Architectural Decisions

**Monorepo Structure:**
- `/client` - React frontend application
- `/server` - Express backend application  
- `/shared` - Shared types, schemas, and utilities
- Enables type sharing between frontend and backend

**Type Safety:**
- End-to-end TypeScript for compile-time safety
- Zod schemas for runtime validation via `drizzle-zod`
- Shared schema types prevent client/server drift

**Development Environment:**
- Replit-optimized with hot module replacement
- Custom Vite plugins for development experience
- Path aliases for clean imports (`@/`, `@shared/`, `@assets/`)

**Session Management:**
- Planned: `connect-pg-simple` for PostgreSQL-backed sessions
- Cookie-based authentication approach

**Build Strategy:**
- Client: Vite bundle to `dist/public`
- Server: esbuild ESM bundle to `dist`
- Separate build processes with single production entry point

## External Dependencies

### Core Infrastructure
- **Database:** Neon Serverless PostgreSQL (configured but not yet provisioned based on error handling)
- **ORM:** Drizzle with PostgreSQL dialect
- **Session Store:** PostgreSQL via `connect-pg-simple` (planned)

### AI/ML Services
- **Google Generative AI:** Primary AI engine for ingredient research and analysis

### UI Component Libraries
- **Radix UI:** Headless component primitives (21+ components)
- **shadcn/ui:** Pre-styled component patterns built on Radix
- **Lucide React:** Icon library

### Styling & Design
- **Tailwind CSS:** Utility-first CSS framework
- **class-variance-authority:** Component variant system
- **clsx + tailwind-merge:** Conditional className utilities

### Data & Forms
- **React Hook Form:** Form state management
- **Zod:** Schema validation
- **@hookform/resolvers:** Zod integration for forms
- **TanStack Query:** Server state and caching

### Development Tools
- **Vite:** Frontend build tool and dev server
- **esbuild:** Server bundling
- **TypeScript:** Type safety across stack
- **Replit-specific plugins:** Runtime error overlay, cartographer, dev banner

## Current Implementation Status

### Completed Features (December 2024)

**Backend Infrastructure:**
- ✅ Complete REST API with product/ingredient CRUD operations
- ✅ AI vetting engine using Google Gemini 2.5 Flash
- ✅ Robust JSON parsing with error handling
- ✅ Draft/published workflow with state management
- ✅ Editorial override system with original rating tracking
- ✅ In-memory storage (MemStorage) ready for database migration

**API Endpoints:**
- `GET /api/products` - Fetch published products (public)
- `GET /api/products?includeUnpublished=true` - All products (admin)
- `GET /api/products/:id` - Single product with ingredients
- `POST /api/products` - Create product (draft or published)
- `PATCH /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `POST /api/vet-ingredients` - AI analysis of ingredients
- `PATCH /api/ingredients/:id` - Override ingredient safety rating

**Frontend Pages:**
- ✅ Home page with product grid and safety filtering
- ✅ Product detail page with ingredient accordion
- ✅ Admin dashboard with real-time stats
- ✅ Product form with AI vetting integration
- ✅ Editorial override controls

**Key Features:**
- ✅ Real-time AI ingredient vetting (15-30 second analysis)
- ✅ One-click safety rating override (cycles through safe→caution→banned)
- ✅ Draft saving with admin-only visibility
- ✅ Publish workflow with cache invalidation
- ✅ Premium health-tech design aesthetic
- ✅ Responsive layouts with loading states
- ✅ Toast notifications for all actions

**Technical Achievements:**
- ✅ End-to-end type safety with shared schemas
- ✅ TanStack Query integration with proper cache management
- ✅ Defensive programming (SafetyBadge normalization, JSON parsing fallbacks)
- ✅ Proper separation of concerns (storage abstraction, API validation)

### Planned Integrations
- **Amazon Affiliate API:** Product purchase links ("Buy on Amazon" buttons)
- **Database Migration:** Move from MemStorage to PostgreSQL
- **Advanced AI:** Memory system for previously vetted ingredients
- **Search Integration:** AI agent with web search capabilities for research