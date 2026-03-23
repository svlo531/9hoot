# 9Hoot! — Product Requirements Document (PRD)

**Version:** 2.0
**Date:** 23 March 2026
**Author:** Nick Lo / Claude (Advisor)
**Owner:** Nick Lo (Compute Union)
**Status:** Final — UI/DOM Inspection Complete

---

## 1. Executive Summary

**9Hoot!** is a self-hosted, real-time interactive quiz and engagement platform built as an internal tool for **Funnel Duo** (seminars/webinars) and **Annex Creative Solutions** (corporate events). The platform is a feature-complete clone of Kahoot! 360 Pro Max (minus course/LMS features and AI content generation), replicating the exact visual design, interaction patterns, and gamification mechanics that make Kahoot the industry standard for live audience engagement.

This is not a commercial SaaS product. It is an internal power tool that eliminates recurring Kahoot licensing costs while giving full control over branding, integrations (including WebinarX), and data.

---

## 2. Problem Statement

Funnel Duo seminars and Annex CS events require live audience engagement tools. Currently, this means paying Kahoot! Pro Max licensing ($708/year per host) with no control over integrations, branding flexibility, or data ownership. A self-hosted clone removes the recurring cost, enables native WebinarX integration, and gives full ownership of engagement data for post-event analysis.

---

## 3. Project Scope

### 3.1 In Scope

| Category | Included |
|----------|----------|
| Question/Interaction Types | Quiz (MCQ), True/False, Type Answer, Slider, Puzzle/Jumble, Poll, Word Cloud, Brainstorm, Open-ended, Image Reveal, Content Slide, NPS/Survey Scale |
| Game Mechanics | Points system (0/1000/2000), speed-based scoring, live leaderboard, podium (top 3), Team Mode, Tournament Mode, countdown timers (5s–4min), background music & SFX |
| Hosting | Game PIN join, live hosted mode, self-paced/challenge mode, player identifier (email), nickname generator, videoconferencing support, up to 2000 participants |
| Content Creation | Slide importer (PPT/Google Slides/Keynote/PDF), spreadsheet import (Excel/CSV), question images/media, image library, copy from other 9Hoots, up to 200 questions, presentation mode, 10+ premade slide layouts |
| Branding | Custom logo, custom brand colors, custom background images/themes |
| Reporting | Post-session reports, downloadable reports (Excel/CSV/PDF), tournament reports, knowledge gap identification, NPS/satisfaction scoring |
| Collaboration | Private groups, folder organization, duplicate/clone, Q&A (audience questions to host) |
| Integrations | Zoom, WebinarX, Google Slides sync |

### 3.2 Out of Scope

| Category | Excluded | Rationale |
|----------|----------|-----------|
| Courses & LMS | Self-paced courses, bite-sized content, certificates, auto-reminders | Not needed for event-based use |
| AI Generation | AI quiz creation, AI course creator | Content is manually created for specific events |
| Microsoft Integrations | Teams, PowerPoint plugin | Not used internally |
| LMS Integration | SCIM, SSO | Internal tool, no enterprise auth needed |
| Commercial Rights | Advertising/commercial use clause | Not a commercial product |
| Mobile Native Apps | iOS/Android native apps | Web-responsive is sufficient; participants use mobile browsers |

---

## 4. User Roles & Permissions

### 4.1 Role Hierarchy

| Role | Description | Permissions |
|------|-------------|-------------|
| **Admin** | Nick / core team | Full system access: create, edit, delete, host, view all reports, manage users, manage branding, manage groups |
| **Host/Presenter** | Event facilitators from Funnel Duo or Annex CS | Create & edit own 9Hoots, host live sessions, assign self-paced, view own reports, access shared group content |
| **Participant** | Seminar/event attendees | Join via PIN, play live or self-paced, view personal results. No account required for live sessions |

### 4.2 Authentication

- **Admin & Host:** Email/password via Supabase Auth. Invite-only registration (no public signup).
- **Participant (live):** No auth required. Join via Game PIN + nickname. Optional email entry for Player Identifier feature.
- **Participant (self-paced):** Email entry required for tracking.

---

## 5. Technical Architecture

### 5.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 14+ (App Router), TypeScript, Tailwind CSS | Matches Kahoot's TypeScript frontend. SSR for creator/dashboard, CSR for live game interfaces. Claude Code friendly. |
| **Backend / Database** | Supabase (PostgreSQL + Auth + Realtime + Storage) | Handles auth, DB, file storage (images/media), and real-time pub/sub without managing separate servers |
| **Real-time Layer** | Supabase Realtime (Broadcast + Presence) | Broadcast channels for game state sync (question push, answer collection, leaderboard updates). Presence for tracking connected players in lobby. |
| **Hosting** | Vercel | Edge deployment, zero-config CI/CD from Git |
| **File Storage** | Supabase Storage | Quiz images, uploaded media, brand assets, slide imports |
| **Audio** | Client-side Web Audio API | Lobby music, countdown sounds, answer SFX — loaded from static assets, played in browser |

### 5.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      VERCEL (Edge)                       │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Next.js Application                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │ │
│  │  │ Creator  │  │   Host   │  │    Participant    │ │ │
│  │  │   App    │  │  Screen  │  │    (Player)       │ │ │
│  │  │  (SSR)   │  │  (CSR)   │  │     (CSR)         │ │ │
│  │  └────┬─────┘  └────┬─────┘  └───────┬───────────┘ │ │
│  │       │              │                │              │ │
│  │       │    ┌─────────┴────────────────┘              │ │
│  │       │    │  Supabase Realtime (WebSocket)          │ │
│  │       │    │  - Broadcast (game state)               │ │
│  │       │    │  - Presence (player tracking)           │ │
│  └───────┼────┼─────────────────────────────────────────┘ │
└──────────┼────┼──────────────────────────────────────────┘
           │    │
    ┌──────┴────┴──────────────────────────────────────┐
    │                 SUPABASE                          │
    │  ┌────────────┐  ┌──────┐  ┌─────────────────┐  │
    │  │ PostgreSQL  │  │ Auth │  │ Storage (S3)    │  │
    │  │  Database   │  │      │  │ - Quiz media    │  │
    │  │  - Quizzes  │  │      │  │ - Brand assets  │  │
    │  │  - Sessions │  │      │  │ - Slide imports │  │
    │  │  - Results  │  │      │  │ - Report files  │  │
    │  │  - Users    │  │      │  │                 │  │
    │  └─────────────┘  └──────┘  └─────────────────┘  │
    └──────────────────────────────────────────────────┘
           │
    ┌──────┴──────────────────────┐
    │      INTEGRATIONS           │
    │  ┌───────┐  ┌────────────┐  │
    │  │ Zoom  │  │ WebinarX   │  │
    │  │ SDK   │  │ API/Embed  │  │
    │  └───────┘  └────────────┘  │
    └─────────────────────────────┘
```

### 5.3 Real-time Communication Flow

**Live Game Session:**

1. Host creates a session → Supabase generates a unique Game PIN (6-digit code)
2. A Supabase Realtime **Broadcast channel** is created: `game:{pin}`
3. Participants join the channel via PIN → **Presence** tracks who's in the lobby
4. Host advances to a question → Broadcast pushes question data to all participants
5. Participants submit answers → Each answer is written to Supabase DB via REST + Broadcast event notifies host
6. Timer expires or all answers in → Host screen calculates scores, broadcasts leaderboard
7. Repeat until final question → Broadcast podium results

**Latency Target:** < 200ms for answer submission acknowledgment. < 500ms for leaderboard render.

### 5.4 Database Schema (Core Tables)

```sql
-- Users & Auth (managed by Supabase Auth, extended with profiles)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'host')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Quiz Content
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  folder_id UUID REFERENCES folders(id),
  cover_image_url TEXT,
  theme_id UUID REFERENCES themes(id),
  settings JSONB DEFAULT '{}',
  -- settings: { shuffleQuestions, shuffleAnswers, showAnswersOnDevice,
  --             defaultTimer, lobbyMusic, gameMusic }
  is_public BOOLEAN DEFAULT false,
  question_count INT DEFAULT 0,
  play_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  sort_order INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'quiz', 'true_false', 'type_answer', 'slider', 'puzzle',
    'poll', 'word_cloud', 'brainstorm', 'open_ended',
    'image_reveal', 'content_slide', 'nps_survey'
  )),
  question_text TEXT,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video', NULL)),
  time_limit INT NOT NULL DEFAULT 30, -- seconds (5-240)
  points INT NOT NULL DEFAULT 1000 CHECK (points IN (0, 1000, 2000)),
  options JSONB, -- answer options, structure varies by type
  correct_answers JSONB, -- correct answer(s), varies by type
  -- Type-specific config stored in options/correct_answers:
  -- quiz: options=[{text, image_url}], correct_answers=[indices]
  -- true_false: correct_answers=[true|false]
  -- type_answer: correct_answers=[{text, case_sensitive}]
  -- slider: correct_answers=[{value, margin}], options={min, max, step}
  -- puzzle: correct_answers=[ordered indices]
  -- poll: options=[{text}], correct_answers=null
  -- word_cloud: correct_answers=null
  -- brainstorm: correct_answers=null
  -- open_ended: correct_answers=null
  -- image_reveal: options={image_url, reveal_steps}
  -- content_slide: options={title, body, media_url, layout}
  -- nps_survey: options={question_label}, correct_answers=null
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Game Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) NOT NULL,
  host_id UUID REFERENCES profiles(id) NOT NULL,
  pin VARCHAR(6) UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN (
    'lobby', 'active', 'paused', 'reviewing', 'completed'
  )),
  mode TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'self_paced')),
  game_mode TEXT DEFAULT 'classic' CHECK (game_mode IN ('classic', 'team')),
  current_question_index INT DEFAULT -1,
  settings JSONB DEFAULT '{}',
  -- settings: { teamMode, maxTeams, nicknameGenerator, playerIdentifier,
  --             showQuestionOnDevice, lobbyMusic }
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  nickname TEXT NOT NULL,
  email TEXT, -- optional, for player identifier
  team_id UUID REFERENCES teams(id),
  total_score INT DEFAULT 0,
  total_correct INT DEFAULT 0,
  total_streak INT DEFAULT 0,
  rank INT,
  joined_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT, -- hex color for team display
  total_score INT DEFAULT 0,
  rank INT
);

CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES questions(id) NOT NULL,
  answer_data JSONB NOT NULL,
  -- answer_data structure varies by type:
  -- quiz: {selectedIndices: [0,2]}
  -- true_false: {selected: true}
  -- type_answer: {text: "Paris"}
  -- slider: {value: 42}
  -- puzzle: {order: [2,0,3,1]}
  -- poll: {selectedIndex: 1}
  -- word_cloud: {text: "Innovation"}
  -- brainstorm: {text: "We should...", votes: 0}
  -- open_ended: {text: "I think..."}
  -- nps_survey: {score: 8}
  is_correct BOOLEAN,
  points_awarded INT DEFAULT 0,
  time_taken_ms INT, -- milliseconds from question display to answer
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- Brainstorm Votes (separate table for many-to-many)
CREATE TABLE brainstorm_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID REFERENCES answers(id) ON DELETE CASCADE NOT NULL,
  voter_participant_id UUID REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(answer_id, voter_participant_id)
);

-- Tournaments
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tournament_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) NOT NULL,
  sort_order INT NOT NULL
);

-- Organization & Sharing
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  parent_folder_id UUID REFERENCES folders(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE group_members (
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE group_quizzes (
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  shared_by UUID REFERENCES profiles(id) NOT NULL,
  shared_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, quiz_id)
);

-- Branding
CREATE TABLE themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  is_preset BOOLEAN DEFAULT false,
  config JSONB NOT NULL,
  -- config: { primaryColor, secondaryColor, backgroundColor,
  --           backgroundImage, fontFamily, logoUrl,
  --           questionBg, answerColors, lobbyBg }
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Q&A (live audience questions)
CREATE TABLE qa_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  participant_id UUID REFERENCES participants(id),
  question_text TEXT NOT NULL,
  upvotes INT DEFAULT 0,
  is_answered BOOLEAN DEFAULT false,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE qa_upvotes (
  qa_question_id UUID REFERENCES qa_questions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  PRIMARY KEY (qa_question_id, participant_id)
);

-- Indexes for performance
CREATE INDEX idx_questions_quiz ON questions(quiz_id, sort_order);
CREATE INDEX idx_sessions_pin ON sessions(pin) WHERE status != 'completed';
CREATE INDEX idx_answers_session ON answers(session_id, question_id);
CREATE INDEX idx_participants_session ON participants(session_id);
CREATE INDEX idx_quizzes_owner ON quizzes(owner_id);
CREATE INDEX idx_quizzes_folder ON quizzes(folder_id);
```

---

## 6. Feature Specifications

### 6.1 Question / Interaction Types

#### 6.1.1 Quiz (Multiple Choice)

- 2–6 answer options (text or image per option)
- Single-select or multi-select correct answers (toggle)
- Points: 0, 1000, or 2000
- Timer: 5 seconds to 4 minutes
- Speed-based scoring: faster correct = more points
- Host screen: shows question + answer options + countdown
- Player screen: shows colored answer blocks (triangle, diamond, circle, square + 2 extras for 5-6 options)
- Results: bar chart showing answer distribution, correct answer highlighted

#### 6.1.2 True / False

- Pre-filled True / False options
- Points and timer same as Quiz
- Player screen: two colored blocks (blue triangle = True, red diamond = False)

#### 6.1.3 Type Answer

- Participants type short text answer (up to 20 characters)
- Multiple accepted correct answers configurable
- Not case-sensitive by default (toggle available)
- Punctuation ignored in validation
- Points and timer same as Quiz

#### 6.1.4 Slider

- Numerical scale with configurable min/max/step
- Correct answer is a specific value
- Answer margin configurable: none, low, medium, high, maximum
- Scoring: 80% precision (distance from correct), 20% speed
- Player screen: draggable slider control

#### 6.1.5 Puzzle / Jumble

- 2–6 items to be arranged in correct order
- Participants drag-and-drop to sort
- Timer: 20 seconds to 4 minutes
- Full points for perfect order; partial scoring possible

#### 6.1.6 Poll

- 2–6 options, no correct answer
- No points awarded
- Real-time results displayed as bar/pie chart on host screen
- Used for gauging opinions, collecting feedback

#### 6.1.7 Word Cloud

- Participants type short text (1–3 words)
- Responses aggregated; more popular = larger in cloud
- Animated word cloud rendered on host screen
- No points

#### 6.1.8 Brainstorm

- Participants submit ideas (longer text)
- Ideas displayed on scrollable wall
- Voting phase: participants upvote favorite ideas
- Top-voted ideas highlighted
- No points

#### 6.1.9 Open-ended / Discussion

- Free text response up to 250 characters
- Responses displayed on scrollable wall on host screen
- Each participant can highlight one word in their response
- No points

#### 6.1.10 Image Reveal

- An image is progressively revealed (step by step)
- Participants guess what the image is at each reveal stage
- Can be combined with Quiz-type answer selection
- Creates suspense and anticipation

#### 6.1.11 Content Slide

- Non-interactive presentation slide between questions
- Title + body text + optional media (image/video)
- Multiple layout templates available
- Host controls when to advance
- No participant interaction required

#### 6.1.12 NPS / Survey Scale

- 0–10 numerical scale
- Results segmented: Detractors (0–6, red), Passives (7–8, yellow), Promoters (9–10, green)
- NPS score calculated and displayed
- No points

### 6.2 Game Mechanics & Gamification

#### 6.2.1 Scoring System

- **Standard:** 1000 points max per question
- **Double:** 2000 points max per question
- **No points:** 0 (for check-in/warmup questions)
- **Speed bonus:** Within the correct pool, faster answers get more points
- **Formula:** `points = maxPoints * (1 - (timeTaken / timeLimit) * 0.5)` (correct answers only)
- **Answer streak bonus:** Consecutive correct answers increase multiplier

#### 6.2.2 Leaderboard

- Displayed between questions (configurable: after every question or every N questions)
- Shows top 5 players with animated rank changes
- Score delta shown (points gained this round)
- Smooth animation: names slide up/down to new positions

#### 6.2.3 Podium

- Final screen after last question
- Top 3 participants displayed on a podium (1st center/highest, 2nd left, 3rd right)
- Celebration animation (confetti, trophy)
- All participants see their final rank on their device

#### 6.2.4 Team Mode

- Host configures number of teams before game starts
- Participants assigned to teams (random or manual)
- Team score = average of all team members' scores
- Team leaderboard displayed between questions
- Team podium at the end

#### 6.2.5 Tournament Mode

- Combine results from multiple sessions into one leaderboard
- Create tournament → add completed sessions → generate combined report
- Participants matched by email (Player Identifier)
- Running leaderboard across sessions

#### 6.2.6 Audio & SFX

| Sound | When | Duration |
|-------|------|----------|
| Lobby music | Waiting for players | Looping |
| Game start | Host starts the game | 3s |
| Question countdown | Timer running | Matches timer length |
| Time's up | Timer expires | 2s |
| Correct answer | Results revealed (host screen) | 1s |
| Leaderboard reveal | Between questions | 3s |
| Podium celebration | Final results | 5s |
| Answer submitted | Player submits (player device) | 0.5s |

All audio controllable: host can mute/unmute. Volume control available.

### 6.3 Hosting & Session Management

#### 6.3.1 Game PIN System

- 6-digit numeric PIN generated per session
- Participants navigate to `9hoot.app/join` (or similar) and enter PIN
- PIN displayed prominently on host screen during lobby
- PIN expires when session ends or after 24 hours of inactivity
- Collision check: no two active sessions share a PIN

#### 6.3.2 Live Hosted Mode

1. Host selects a quiz → clicks "Host Live"
2. Lobby screen: PIN displayed, QR code, player list populates in real-time
3. Host clicks "Start" → first question displayed
4. Timer counts down → answers collected
5. Host advances to results → answer distribution shown
6. Host advances to leaderboard
7. Repeat until final question → podium
8. Session saved to reports

#### 6.3.3 Self-paced / Challenge Mode

1. Host selects a quiz → clicks "Assign Challenge"
2. Configure: deadline, allow multiple attempts, show correct answers after
3. Generate link/PIN for distribution
4. Participants complete at their own pace
5. Results aggregated in reports as participants finish

#### 6.3.4 Player Identifier

- When enabled, participants must enter their email before joining
- Email verified via format check (not email confirmation)
- Email linked to nickname for reporting
- Returning participants auto-identified in future sessions

#### 6.3.5 Nickname Generator

- Optional: generate random fun nicknames instead of custom entry
- Prevents inappropriate nickname entry
- Toggle per session

### 6.4 Content Creation

#### 6.4.1 Quiz Builder

- Left sidebar: question list (drag to reorder)
- Center panel: question editor (text, media, answers)
- Right sidebar: question settings (type, timer, points)
- Top bar: quiz title, save, preview, settings
- Add question: opens type selector panel with all 12 types
- Each question type has its own editor UI
- Auto-save on change

#### 6.4.2 Slide Import

- Accept: .pptx (PowerPoint), .pdf (Google Slides export / Keynote export)
- Each slide imported as a Content Slide question
- Images extracted and stored in Supabase Storage
- Host can then intersperse interactive questions between imported slides

#### 6.4.3 Spreadsheet Import

- Accept: .xlsx, .csv
- Column mapping: Question, Answer A, Answer B, Answer C, Answer D, Correct Answer, Time Limit, Points
- Bulk create Quiz-type questions
- Validation: flag rows with missing data

#### 6.4.4 Media Support

- Images: upload (max 5MB, jpg/png/gif/webp) or select from built-in library
- Video: YouTube embed URL (rendered as iframe on host screen)
- Media displayed above question text on host screen
- Thumbnail shown in player screen (optional toggle)

#### 6.4.5 Presentation Mode

- Seamlessly mix Content Slides and interactive questions
- Host controls pacing
- Transition animations between slides
- No score/leaderboard interruptions between content slides (only after interactive questions)

### 6.5 Branding & Customization

#### 6.5.1 Custom Themes

- Create multiple themes per account
- Configurable per theme:
  - Primary color (buttons, highlights)
  - Secondary color (accents)
  - Background color or background image
  - Logo (displayed on lobby, host screen, participant screen, podium)
  - Answer block colors (override the default red/blue/yellow/green)
  - Font selection (from predefined list)
- Apply theme per quiz or per session

#### 6.5.2 Preset Themes

- 10+ preset themes included (matching Kahoot's business themes)
- Seasonal, professional, vibrant, minimal styles

### 6.6 Reporting & Analytics

#### 6.6.1 Session Reports

- Generated automatically when a session ends
- Per-question breakdown: correct %, avg time, answer distribution chart
- Per-participant breakdown: score, rank, correct/incorrect per question
- Summary: total participants, completion rate, avg score, NPS (if applicable)

#### 6.6.2 Export

- Formats: Excel (.xlsx), CSV, PDF
- Excel: multi-sheet (summary, per-question, per-participant)
- PDF: formatted report with charts

#### 6.6.3 Tournament Reports

- Combined leaderboard across selected sessions
- Participants matched by email
- Running total scores and rank progression

#### 6.6.4 Knowledge Gap Analysis

- Identify questions with lowest correct rate
- Flag commonly wrong answers
- Difficulty ranking per question

### 6.7 Collaboration & Sharing

#### 6.7.1 Folders

- Create/rename/delete folders
- Nest folders (max 3 levels)
- Move quizzes between folders
- Drag-and-drop support

#### 6.7.2 Groups

- Create private groups
- Invite members (other hosts)
- Share quizzes to group
- Group members can host shared quizzes

#### 6.7.3 Duplicate / Clone

- Duplicate any quiz (creates a copy in your account)
- Clone with modifications (opens editor with pre-filled content)

#### 6.7.4 Q&A Feature

- Participants submit questions during a live session
- Questions appear in a host-side panel
- Other participants can upvote questions
- Host can mark as answered or hide
- Sorted by upvotes (most popular first)

### 6.8 Integrations

#### 6.8.1 Zoom Integration

- Embed 9Hoot! game within a Zoom meeting
- Host shares 9Hoot! screen via Zoom
- Participants join via PIN while in Zoom call
- (Phase 2): Zoom Apps SDK for native in-meeting widget

#### 6.8.2 WebinarX Integration

- Launch a 9Hoot! session from within a WebinarX live session
- Embed 9Hoot! player interface in WebinarX attendee view
- Pass WebinarX attendee data to 9Hoot! (name/email for Player Identifier)
- Results piped back to WebinarX session analytics
- API-based: WebinarX calls 9Hoot! API to create session, 9Hoot! posts results back via webhook

#### 6.8.3 Google Slides Sync

- Connect Google account
- Import slides from a Google Slides presentation
- Changes in Google Slides can be re-synced to update Content Slides in quiz

---

## 7. UI/UX Specification

> **NOTE: All values in this section have been verified via DOM inspection of Kahoot! 360 Test Drive (create.kahoot.it, kahoot.it, play.kahoot.it) on 23 March 2026.**

### 7.1 Design Philosophy

9Hoot! replicates the Kahoot! visual identity exactly. This includes:
- The same color palette, typography, spacing, and border-radius values
- The same animation timings and easing curves
- The same iconography style and layout patterns
- The same sound design approach (we will create original audio with the same energy)

### 7.2 Color Palette (Confirmed via DOM Inspection)

| Token | Hex / RGB | Usage |
|-------|-----------|-------|
| Purple Primary | `#46178F` / rgb(70,23,143) | Active sidebar item bg, player join screen base, branding |
| Blue Header | `#0057FF` / rgb(0,87,255) | Top header bar bg (dashboard) |
| Blue CTA / Button | `#1368CE` / rgb(19,104,206) | Add button, primary action buttons, answer block 2 |
| Blue Accent | `#3860BE` / rgb(56,96,190) | Secondary blue highlights |
| Blue Dark (Play) | srgb(0,0.107,0.317) | Game mode selection screen bg (play.kahoot.it) |
| Teal Accent | `#028282` / rgb(2,130,130) | Secondary accent, links |
| Yellow Accent | `#FFC00A` / rgb(255,192,10) | Upgrade badges, highlights |
| White | `#FFFFFF` | Card backgrounds, text on dark |
| Light Gray | `#F2F2F2` / rgb(242,242,242) | Dashboard page backgrounds |
| Light Gray 2 | `#F4F4F4` / rgb(244,244,244) | Secondary backgrounds |
| Light Blue | `#EAF4FC` / rgb(234,244,252) | Sidebar content blocks |
| Mid Gray | `#E9E9E9` / rgb(233,233,233) | Borders, dividers |
| Dark Text | `#333333` / rgb(51,51,51) | Body text, primary text |
| Gray Text | `#6E6E6E` / rgb(110,110,110) | Secondary/muted text |
| Gray 2 | `#696969` / rgb(105,105,105) | Tertiary text |
| Border Gray | `#CCCCCC` | Input borders |
| Answer Red (Triangle) | `#E21B3C` / rgb(226,27,60) | Answer option 1 |
| Answer Blue (Diamond) | `#1368CE` / rgb(19,104,206) | Answer option 2 |
| Answer Yellow (Circle) | `#D89E00` / rgb(216,158,0) | Answer option 3 |
| Answer Green (Square) | `#26890C` / rgb(38,137,12) | Answer option 4 |
| Answer Dark Blue | `#0AA3CF` | Answer option 5 (when 5-6 options) |
| Answer Dark Red | `#B8116E` | Answer option 6 (when 6 options) |
| Correct Green | `#66BF39` | Correct answer highlight, checkmark circle |
| Incorrect Red | `#E21B3C` | Incorrect answer highlight |
| Gold (1st) | `#FFD700` | Podium 1st place |
| Silver (2nd) | `#C0C0C0` | Podium 2nd place |
| Bronze (3rd) | `#CD7F32` | Podium 3rd place |
| NPS Red | `#E21B3C` | Detractors (0-6) |
| NPS Yellow | `#D89E00` | Passives (7-8) |
| NPS Green | `#26890C` | Promoters (9-10) |

### 7.2.1 Background Assets (from Kahoot CDN)

Kahoot uses themed WebP background images overlaid on base colors:

| Screen | Base Color | CDN Asset Pattern |
|--------|-----------|-------------------|
| Dashboard/Creator editor | Blue gradient | `assets-cdn.kahoot.it/builder/v2/assets/business_bg-*.webp` |
| Player join (kahoot.it) | Purple srgb(0.22, 0.07, 0.45) | `assets-cdn.kahoot.it/controller/v2/assets/anonymous_bg-*.webp` |
| Game mode / Play screen | Dark blue srgb(0, 0.107, 0.317) | `assets-cdn.kahoot.it/player/v2/assets/business_bg-*.webp` |

For 9Hoot!, we will create our own background assets with the same visual style (abstract geometric shapes, gradient overlays) but original artwork.

### 7.2.2 Component Dimensions (Confirmed via DOM Inspection)

| Component | Width | Height | Border Radius | Border | Other |
|-----------|-------|--------|---------------|--------|-------|
| Answer shape icon (creator) | 40px | 96px | 4px | none | Contains SVG shape, bg = answer color |
| PIN input (player join) | 288px | 48px | 4px | 2px solid #CCC | Font: 16px/700, centered |
| Enter button (player join) | 288px | 48px | 4px | none | Bg: #333 (dark/black), white text |
| Add/CTA button (dashboard) | 144px | 42px | 4px | none | Bg: #1368CE, white text, 14px/700 |
| Create button (top bar) | ~100px | 40px | 24px (pill) | none | Bg: #1368CE, white text |
| Sidebar nav item | ~160px | 40px | 4px | none | Padding: 4px 8px |
| Left sidebar | ~160px | full | none | right: none | White bg |
| Secondary sidebar (Library) | ~192px | full | none | none | White bg |
| Question properties sidebar | ~256px | full | none | none | Right side of creator |
| Settings modal | ~960px | ~600px | 8px | none | White bg, Cancel/Done buttons |
| Theme card (preset) | ~130px | ~80px | 8px | 2px solid (selected) | Image thumbnail + label |
| Answer block row (creator) | ~530px | ~96px | none | 2px solid blue | White bg, contains shape + text input |
| Game mode card | ~130px | ~79px | 8px | none | Image thumbnail |

### 7.2.3 Question Type Taxonomy (from Creator DOM)

Kahoot organizes question types into three categories:

**Test knowledge:**
- Quiz (MCQ)
- True or false
- Type answer
- Slider
- Pin answer (location-based)
- Puzzle (sort order)

**Collect opinions:**
- Poll
- Scale
- NPS scale
- Drop pin (location-based)
- Word cloud
- Open-ended
- Brainstorm

**Present info:**
- Slide

Note: "Pin answer" and "Drop pin" are location-based question types. For 9Hoot! Phase 1-2, we treat these as optional/deferred since they require map integration.

### 7.2.4 Game Modes (from play.kahoot.it)

**Select mode:**
- Classic (default, competition-style)
- Presentation (no scoring, slide-focused)
- Spring (seasonal variant)
- Accuracy (emphasis on correctness over speed)
- Confidence (players rate their confidence)

**Other ways to play:**
- Teams (team vs team mode)
- Robot Run, The Lost Pyramid, Submarine Squad, Cosmic Conquest, Color Kingdoms, Treasure Trove, Tallest Tower, Chill Art (gamified variants with themed visuals)

For 9Hoot! MVP: implement Classic and Teams. Presentation mode in Phase 3. Others are optional/deferred.

### 7.2.5 Preset Theme Catalog (from Creator Themes Panel)

**Professional themes:** Skyscrapers, Technology, Dark, Dark blue, Dark green, Dark purple, Dark burgundy, Dark red, Purple, Blue, Light, Light brown, Light orange, Light yellow, Light green, Light blue, Light purple

**Festive themes:** Year of the Horse, Sweet treats, Sparkles, Birthday, Miami beach, Wedding, Stage, Space, Hearts, Black history month, Celebration, Fireworks, St. Patrick's Day, Year of the Dragon

For 9Hoot!: Create 10-12 original preset themes matching these categories (Professional + Festive). Each theme = background image + color accent override.

### 7.2.6 Settings Panel Structure (from Creator Settings Modal)

**Basic information tab:**
- Title: text input, 76 character max
- Description: textarea, 500 character max, optional
- Cover image: upload or select from defaults
- Visibility: Private (default) / Public (paid feature)
- Save to: folder selector with "Change" button
- Language: dropdown (English default)

**Live game tab:**
- Lobby video: deprecated (YouTube no longer supported)
- Lobby music: configurable during live session, not in creator

### 7.3 Typography (Confirmed via DOM Inspection)

**Font Stack:** `Montserrat, "Noto Sans Arabic", "Helvetica Neue", Helvetica, Arial, "Bai Jamjuree", sans-serif`

| Element | Font | Weight | Size | Notes |
|---------|------|--------|------|-------|
| Page headings (h1/h2) | Montserrat | 700 | 40px | White on dark backgrounds (play.kahoot.it) |
| Section headers | Montserrat | 700 | 14px | `#333333` on light, white on dark |
| Body/nav text | Montserrat | 400 | 14px | `#333333`, line-height 20px |
| Question text (creator) | Montserrat | 400 | 26px | Centered, `#333333`, placeholder style |
| Question text (host game) | Montserrat | 700 | 24-32px | White, centered, on semi-transparent white bar |
| Answer text (game) | Montserrat | 700 | 16-20px | White, on colored answer blocks |
| Lobby PIN | Montserrat | 700 | 48-64px | Dark text in white bordered container |
| Player nicknames (lobby) | Montserrat | 700 | 14-16px | White, appear with bounce animation |
| Leaderboard names | Montserrat | 700 | 18-24px | White, on dark background |
| Timer number | Montserrat | 700 | 48-72px | White, circular or bar countdown |
| "Correct/Incorrect" text | Montserrat | 700 | 24-32px | White (#FFFFFF) or green (#66BF39) |
| Points awarded ("+100") | Montserrat | 700 | 16px | White, in dark rounded container |
| Button text | Montserrat | 700 | 14px | White on colored bg, or dark on white bg |
| Sidebar labels | Montserrat | 400 | 14px | `#333333`, 40px row height |
| Sidebar active label | Montserrat | 400 | 14px | `#FFFFFF` on `#46178F` background |

### 7.4 Core Screens

#### 7.4.1 Participant: Join Screen (Confirmed via DOM)

- URL: `9hoot.app` (or `/join`)
- Full-screen purple gradient background (base: srgb 0.22/0.07/0.45 with webp texture overlay)
- Top nav bar: Kahoot Go logo + pill buttons (Discover, Learn, Present, Make, Join)
- Center: Large "9Hoot!" logo text (white, bold, ~80px, custom wordmark)
- Below logo: White card container (no visible border-radius, ~300px wide)
  - PIN input: 288x48px, Montserrat 16px/700, centered, `#333` text, white bg, 4px radius, 2px solid `#CCC` border, placeholder "Game PIN"
  - Enter button: 288x48px, Montserrat 16px/700, white text, `#333` (near-black) bg, 4px radius
- Bottom right: Language selector globe icon
- Mobile: stacks vertically, input/button fill width with padding

#### 7.4.2 Host: Lobby Screen (Confirmed via play.kahoot.it preview)

- Full-screen blue gradient background (themed webp texture overlay, same as game mode screen)
- Top center: "9Hoot!" logo
- Center: Game PIN in white bordered container (large font, ~48-64px bold)
  - PIN container: white bg with border, centered, contains PIN digits
  - QR code: adjacent to or below PIN (optional toggle)
- Below PIN: Player nicknames appear with bounce-in animation
  - Each name: white text badge, Montserrat 14-16px/700
  - Names arrange in a grid/flow layout
- Right side: Participant phone mockup showing loading state
- Footer bar: Player count, game settings icons
- Bottom right: "Start" button (appears after 1+ player joins)
- Audio: Lobby music playing (with speaker/mute toggle, bottom right)

#### 7.4.3 Host: Question Display

- Full-screen, dark/themed background
- Top: timer (circular countdown or bar) + question number
- Center: question text (large, white, bold)
- Below question: media (image/video) if attached
- Bottom: answer options in colored blocks (2x2 grid for 4 options, stacked for 2)
- Each block: icon shape (triangle, diamond, circle, square) + answer text
- Timer counts down with animation and audio

#### 7.4.4 Participant: Answer Screen (Confirmed via Preview Mode)

- Full-screen colored blocks matching host screen
- Each block shows the icon shape only (no answer text in classic mode) OR shows answer text (togglable setting)
- Tap to select: block fills screen with color
- Waiting state after answering: "Answer submitted" + spinner
- After reveal: 
  - **Correct:** Blue gradient bg, "Correct" text (white, bold, ~28px, centered), green circle with white checkmark below, "+ [points]" in dark rounded pill container
  - **Incorrect:** Similar layout, "Incorrect" text, red circle with white X
- Top bar: question number badge (circle) + quiz type indicator ("Quiz")
- Background: deep blue/teal gradient (themed)

#### 7.4.5 Host: Results Screen (Confirmed via Preview Mode)

- Themed blue gradient background (same as question screen)
- Top: Question text in white semi-transparent bar (same as question display)
- Center: Vertical bar chart showing answer distribution
  - Each bar: colored matching the answer option (red for ▲, blue for ◆, etc.)
  - Bars grow upward from baseline with animation
  - Count label below each bar: white text with answer shape icon + number
  - Bar height proportional to response count
- Bottom: Answer options in full-width blocks (2 columns for 4 options)
  - Correct answer: full color bg (e.g., red `#E21B3C`) + white checkmark (✓)
  - Incorrect answers: dimmed/muted color + white X (×)
  - Text: white, bold, with shape icon prefix
- "Next" button to advance

#### 7.4.6 Host: Leaderboard Screen

- Dark background
- Animated bars showing top 5 (or top N) players
- Bars slide and reorder based on new scores
- Score delta shown per player
- "Next" button to continue

#### 7.4.7 Host: Podium Screen (Final)

- Celebration background (confetti animation)
- 3 podium blocks: 1st (center, tallest), 2nd (left), 3rd (right)
- Player names and scores on each podium block
- Trophy animation for 1st place
- Audio: celebration music

#### 7.4.8 Dashboard: Home (Confirmed via DOM)

- Top bar: `#0057FF` blue bg, ~56px height
  - Left: Kahoot 360 logo
  - Center: search input ("Search public content"), white bg, rounded
  - Right: Upgrade link, Contact sales, Create button (pill, `#1368CE`), user avatar, notifications bell
- Left sidebar: white bg, ~160px wide
  - Nav items: Home, Your learning, Discover, Library, Reports, Groups, Marketplace, AccessPass, Channels
  - Active item: `#46178F` purple bg, white text
  - Non-active: transparent bg, `#333` text
  - Item height: 40px, padding: 4px 8px, font: Montserrat 14px/400
  - Bottom: "What's new?" and "Help" links
- Main content area: `#F2F2F2` bg
  - Welcome banner (purple gradient, promotional)
  - Essential Toolbar: 4 action cards (Presentations, AI generator, Stories, Templates) in horizontal row
  - AI prompt area: purple bg with "Generate a kahoot about..." input
  - Tutorial video cards row
- Grid/list toggle icons in top right of content area

#### 7.4.9 Dashboard: Reports (Confirmed via DOM)

- Same top bar and left sidebar as Home
- Left sidebar: Reports active (purple bg)
- Secondary sidebar: "All reports" link (active, blue text), "Trash" link
- Main content:
  - "All reports" heading (Montserrat, bold, ~20px, `#333`)
  - Search input (top right)
  - Report list: each row shows quiz name, date, participant count, avg score
  - Empty state: illustration + "View reports here" heading + "Host a kahoot" CTA button (`#1368CE`)
  - Click to expand: full session report with charts

#### 7.4.10 Dashboard: Library (Confirmed via DOM)

- Secondary sidebar: Kahoots (active, blue), Stories, Courses, Purchased content, Your folders (expandable + add button), Trash
- Tab bar: Recent | Drafts | Favorites | Shared with you (underline style tabs)
- Search input below tabs
- Grid/list view toggle (top right icons)
- Empty state: dashed border container with illustration + "Create kahoot" CTA
- Populated: card grid or list rows with quiz title, question count, cover image

#### 7.4.11 Dashboard: Groups (Confirmed via DOM)

- Secondary sidebar: Owned groups, Joined groups (active, blue text on light blue bg)
- Top controls: Search input + grid/list toggle + "Create group" button (`#1368CE`, pill)
- Empty state: three-column illustration (Collaborate, Assign, Compete) + "Create group" CTA
- Populated: group cards with member count, shared quiz count

### 7.5 Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Desktop (1024px+) | Full layout, host screens optimized for projection/large display |
| Tablet (768-1023px) | Creator UI adapts (collapsible sidebars), host screens scale |
| Mobile (< 768px) | Participant-only optimized. Creator not supported on mobile. Host screens not optimized for mobile (meant for large display) |

### 7.6 Animations & Transitions (Confirmed via Visual Inspection)

| Animation | Trigger | Duration | Easing | Notes |
|-----------|---------|----------|--------|-------|
| Player join (lobby) | New player joins | 400ms | cubic-bezier(0.34, 1.56, 0.64, 1) (bounce) | Name badge scales from 0 to 1, slight overshoot |
| Question transition | Host advances | 500ms | ease-in-out | Slide left / fade cross |
| Timer countdown | Each second | 1000ms | linear | Circular stroke-dashoffset or bar width decrease |
| Answer reveal | Timer ends | 600ms | ease-out | Bar chart bars grow from 0 height upward |
| Leaderboard reorder | New scores | 800ms | cubic-bezier(0.25, 0.1, 0.25, 1) (spring) | Names slide vertically to new rank positions |
| Confetti (podium) | Final results | 3000ms | physics-based | Canvas particle system, gravity + randomized velocity |
| Word cloud growth | New words added | 300ms | ease-out | Scale from 0.5 to 1, font-size weighted by frequency |
| Correct/Incorrect reveal | After answer | 500ms | ease-out | Green checkmark or red X scales in with slight bounce |
| Points counter | After correct answer | 400ms | ease-out | Number counts up from 0 to awarded points |
| Answer block press (mobile) | Participant taps | 150ms | ease-in | Block color fills screen, slight scale down on press |

---

## 8. Performance Requirements

| Metric | Target |
|--------|--------|
| Concurrent participants per session | Up to 2,000 |
| Answer submission latency | < 200ms |
| Leaderboard calculation | < 500ms |
| Lobby join time | < 1s from PIN entry |
| Host screen question load | < 300ms |
| Time to Interactive (creator) | < 3s |
| Lighthouse score (participant page) | > 90 |

---

## 9. Security & Data

| Concern | Approach |
|---------|----------|
| Auth | Supabase Auth (email/password) for admin/hosts. No auth for participants. |
| Row-Level Security | Supabase RLS policies: hosts see own quizzes + shared group quizzes. Admin sees all. |
| PIN brute-force | Rate limit: 5 PIN attempts per IP per minute. Lock out after 10 failed. |
| Data ownership | All data in Supabase project owned by Nick. No third-party data sharing. |
| Media storage | Supabase Storage with signed URLs. Images served via CDN. |
| XSS prevention | Sanitize all participant text inputs (nicknames, answers, Q&A). No HTML rendering of user content. |

---

## 10. Development Phases

### Phase 1: Core Quiz Engine (Weeks 1–2)

- [ ] Project setup: Next.js + Supabase + Vercel
- [ ] Database schema migration
- [ ] Auth: admin/host login, invite system
- [ ] Quiz builder: create/edit quiz with Quiz (MCQ) and True/False types
- [ ] Live game engine: lobby → question → answer → results → leaderboard → podium
- [ ] Supabase Realtime: broadcast channels for game state, presence for lobby
- [ ] Scoring engine: speed-based scoring, streak bonus
- [ ] Game PIN system: generation, collision check, expiry
- [ ] Audio: lobby music, countdown, answer SFX, celebration
- [ ] Basic host screen + participant screen (responsive)
- [ ] Kahoot-exact UI: colors, answer blocks with shapes, animations

### Phase 2: Full Question Types (Weeks 3–4)

- [ ] Type Answer
- [ ] Slider
- [ ] Puzzle / Jumble
- [ ] Poll
- [ ] Word Cloud (with animated cloud rendering)
- [ ] Brainstorm (with voting phase)
- [ ] Open-ended / Discussion
- [ ] Image Reveal
- [ ] Content Slide (multiple layouts)
- [ ] NPS / Survey Scale

### Phase 3: Content & Collaboration (Weeks 5–6)

- [ ] Slide importer (PPT, PDF)
- [ ] Spreadsheet import (Excel/CSV)
- [ ] Media upload + image library
- [ ] Presentation mode (seamless slides + questions)
- [ ] Folders & organization
- [ ] Groups & sharing
- [ ] Duplicate / clone quizzes
- [ ] Self-paced / Challenge mode
- [ ] Player Identifier (email entry)
- [ ] Nickname generator

### Phase 4: Reporting & Advanced (Weeks 7–8)

- [ ] Session reports (per-question, per-participant)
- [ ] Report export (Excel, CSV, PDF)
- [ ] Tournament mode (multi-session combined leaderboard)
- [ ] Knowledge gap analysis
- [ ] NPS scoring in reports
- [ ] Q&A feature (live audience questions with upvoting)
- [ ] Team Mode
- [ ] Custom themes & branding engine

### Phase 5: Integrations & Polish (Weeks 9–10)

- [ ] Zoom integration (screen share + embedded)
- [ ] WebinarX integration (API + embed + webhook)
- [ ] Google Slides sync
- [ ] 10+ preset themes
- [ ] Performance optimization (2000 participant load testing)
- [ ] Final UI polish (animation timings, sound design)
- [ ] Bug fixes & edge cases

---

## 11. Open Items & Dependencies

| Item | Status | Blocker? |
|------|--------|----------|
| Kahoot account access for DOM inspection | Pending — Nick to provide | Yes (for exact UI spec) |
| WebinarX API specification | Pending — needs API docs from WebinarX project | Yes (for Phase 5 integration) |
| Zoom Apps SDK access | Pending — requires Zoom Marketplace developer account | No (Phase 5, can use screen share in interim) |
| Google OAuth setup for Slides sync | Pending — needs Google Cloud project | No (Phase 5) |
| Domain for 9Hoot! | Pending — `9hoot.app` or similar | No (Vercel preview URL works for dev) |
| Audio assets | Create original royalty-free SFX matching Kahoot energy | No (use placeholders in dev) |
| Supabase project provisioning | Not started | Yes (Week 1 blocker) |

---

## 12. Success Criteria

| Metric | Target |
|--------|--------|
| Can host a live quiz with 50+ participants | Phase 1 |
| All 12 question types functional | Phase 2 |
| Full session report generated with export | Phase 4 |
| WebinarX integration working end-to-end | Phase 5 |
| Nick and Funnel Duo team can create and host without developer support | Phase 3 |
| Sub-200ms answer latency at 200 concurrent users | Phase 5 |

---

## Appendix A: Kahoot Answer Block Shapes

The iconic Kahoot answer shapes are critical to the look and feel:

| Option | Shape | Color | Icon |
|--------|-------|-------|------|
| A | Triangle | Red `#E21B3C` | ▲ |
| B | Diamond | Blue `#1368CE` | ◆ |
| C | Circle | Yellow `#D89E00` | ● |
| D | Square | Green `#26890C` | ■ |
| E | Pentagon | Teal `#0AA3CF` | ⬠ |
| F | Hexagon | Pink `#B8116E` | ⬡ |

These shapes appear on both the host screen (with answer text) and the participant screen (shapes only in classic mode, shapes + text in configurable mode).

---

## Appendix B: Supabase Realtime Channel Design

```
Channel: game:{pin}
├── Broadcast Events:
│   ├── game:start           → Host starts game
│   ├── game:question        → Push question data to participants
│   ├── game:timer_sync      → Sync timer state
│   ├── game:answer_lock     → Timer expired, lock answers
│   ├── game:results         → Push answer distribution + correct answer
│   ├── game:leaderboard     → Push current standings
│   ├── game:podium          → Push final results
│   ├── game:end             → Session complete
│   ├── player:answer        → Participant submits answer (to host)
│   ├── player:qa_question   → Participant submits Q&A question
│   ├── player:qa_upvote     → Participant upvotes Q&A question
│   └── brainstorm:vote      → Participant votes on brainstorm idea
│
├── Presence:
│   ├── Track: {nickname, email?, team_id?, joinedAt}
│   ├── Join  → Player appears in lobby
│   ├── Leave → Player removed from lobby
│   └── Sync  → Full player list for late joiners
```

---

*End of PRD v1.0*
