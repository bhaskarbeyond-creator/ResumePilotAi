# ResumePilot AI — Blog Data Lineage & Database Architecture Audit

**Audit Date**: September 1, 2026  
**Environment**: Local Development Only (`https://ai-resume-builder.local/`)  
**Storage Engine**: MariaDB Local Primary Database  
**Authoritative Status**: Verified & Active  

---

## 1. Database Schema & Data Lineage

The blog module is backed directly by MariaDB table `blog` and system settings table `system_settings`.

### MariaDB `blog` Schema
```sql
CREATE TABLE IF NOT EXISTS `blog` (
  `id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `slug` varchar(255) NOT NULL UNIQUE,
  `content` longtext NOT NULL,
  `excerpt` text DEFAULT NULL,
  `cover_image` varchar(512) DEFAULT NULL,
  `author` varchar(128) DEFAULT 'ResumePilot Editorial',
  `author_id` varchar(128) DEFAULT 'system_admin',
  `category` varchar(64) DEFAULT 'General',
  `tags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_blog_slug` (`slug`),
  KEY `idx_blog_published` (`published`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 2. Active MariaDB Blog Records

The database contains 3 certified, published articles:

| ID | Title | Slug | Category | Status | Created At |
|---|---|---|---|---|---|
| `blog-1` | How to Beat Applicant Tracking Systems (ATS) in 2026: The Definitive Guide | `how-to-beat-ats-screening-2026` | ATS & Optimization | Published (1) | 2026-08-25 |
| `blog-2` | Mastering Google's X-Y-Z Resume Bullet Formula with Real Examples | `google-xyz-resume-bullet-formula` | Resume Writing | Published (1) | 2026-08-26 |
| `blog-3` | Ace Behavioral Interviews Using the STAR Method: Complete Playbook | `mastering-the-star-interview-method` | Interview Preparation | Published (1) | 2026-08-27 |

---

## 3. Configuration & Module Flags Lineage

### System Settings `public_config`
In MariaDB `system_settings` table (key `public_config`), the module flag is configured as:
```json
{
  "modules": {
    "blog": true,
    "enableBlogModule": true,
    "enableGoogleAuthModule": true,
    "enableLinkedinAuthModule": false,
    "enableGithubAuthModule": false,
    "enableImportModule": false,
    "enablePortfolioModule": false,
    "enablePublicSharingModule": true
  }
}
```

### Admin Console State Synchronization
In `src/components/admin/settings/ModulesSettings.jsx`, the Blog Engine state is hydrated via `enableBlogModule: mods.enableBlogModule !== undefined ? mods.enableBlogModule : (mods.blog !== undefined ? mods.blog : true)`. The admin toggle correctly reflects `ENABLED` and persists changes atomically.

---

## 4. REST API Endpoint Lineage & Contract

### 1. `GET /api/blog-data`
- **Authentication**: Public (Unauthenticated)
- **Parameters**: `page` (default 1), `limit` (default 20), `categoryId` (optional filter)
- **Response Format**:
```json
{
  "success": true,
  "posts": [
    {
      "id": "blog-1",
      "title": "How to Beat Applicant Tracking Systems (ATS) in 2026: The Definitive Guide",
      "slug": "how-to-beat-ats-screening-2026",
      "excerpt": "Learn how modern ATS algorithms parse your resume...",
      "content": "<p>Content body...</p>",
      "coverImage": "https://...",
      "featuredImage": "https://...",
      "category": "ATS & Optimization",
      "categoryName": "ATS & Optimization",
      "author": "ResumePilot Editorial",
      "published": 1,
      "status": "published",
      "publishedAt": "2026-08-25T10:00:00.000Z",
      "createdAt": "2026-08-25T10:00:00.000Z"
    }
  ],
  "pagination": {
    "totalCount": 3,
    "totalPages": 1,
    "currentPage": 1,
    "limit": 20
  }
}
```

### 2. `GET /api/blog-data/categories`
- **Authentication**: Public (Unauthenticated)
- **Response Format**:
```json
{
  "success": true,
  "categories": [
    { "id": "ats-optimization", "slug": "ats-optimization", "name": "ATS & Optimization", "count": 1, "color": "blue" },
    { "id": "resume-writing", "slug": "resume-writing", "name": "Resume Writing", "count": 1, "color": "emerald" },
    { "id": "interview-preparation", "slug": "interview-preparation", "name": "Interview Preparation", "count": 1, "color": "purple" }
  ]
}
```

### 3. `GET /api/blog-data/slug/:slug`
- **Authentication**: Public (Unauthenticated)
- **Response Format**:
```json
{
  "success": true,
  "post": {
    "id": "blog-1",
    "title": "How to Beat Applicant Tracking Systems (ATS) in 2026: The Definitive Guide",
    "slug": "how-to-beat-ats-screening-2026",
    "content": "<p>Full sanitized article html...</p>",
    "category": "ATS & Optimization",
    "author": "ResumePilot Editorial",
    "publishedAt": "2026-08-25T10:00:00.000Z"
  }
}
```
