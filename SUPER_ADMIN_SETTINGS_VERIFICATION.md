# Super Admin 31 System Settings Verification Matrix

## Overview
Every platform configuration setting is stored in MariaDB table `system_settings` under category partitions. Optimistic concurrency control is enforced with monotonic revision counters (`revision`), rejecting stale updates with HTTP 409 Conflict.

---

## 31 Settings Verification Ledger

| # | Setting Panel | Category Key | Read from MariaDB | UI Field / Control | Mutate & Save | DB Persisted | Reload Persistence | Revision Guard | Status |
|:---|:---|:---|:---:|:---|:---:|:---:|:---:|:---:|:---:|
| **1** | **General Site Info** | `public_config.branding` | `brandName`, `logoUrl` | Text Input, Logo Uploader | POST `/api/admin/settings/branding` | Verified | Verified | Revision + 1 | **PROVEN** |
| **2** | **Currency & Locale** | `system_settings` | `currency: 'INR'`, `symbol: '₹'` | Dropdown, Symbol Text | POST `/api/platform/settings` | Verified | Verified | Revision + 1 | **PROVEN** |
| **3** | **AI Provider Config**| `public_config.ai` | `provider: 'nvidia'`, `model` | Provider Dropdown, API Key Input | POST `/api/admin/ai-settings` | Masked in DB | Verified | Revision + 1 | **PROVEN** |
| **4** | **AI Quotas & Limits** | `system_settings (ai_quota)`| `dailyTokensFree: 15000` | Number Inputs | POST `/api/admin/settings/ai_quota` | Verified | Verified | Revision + 1 | **PROVEN** |
| **5** | **SMTP / Email** | `admin_configuration.smtp` | `host`, `port`, `encryption` | Form Inputs, Port Selector | POST `/api/email/admin/save-smtp`| Encrypted | Verified | Revision + 1 | **PROVEN** |
| **6** | **Email Templates** | `public_config.emailTemplates`| `welcomeEmail`, `resetEmail` | Rich Text / Markdown Editor | POST `/api/admin/settings/templates`| HTML sanitized| Verified | Revision + 1 | **PROVEN** |
| **7** | **Razorpay Gateway** | `public_config.subscriptions`| `razorpayKeyId`, `razorpayUPI`| Key Input, UPI Toggle | POST `/api/admin/payment-settings` | Key masked | Verified | Revision + 1 | **PROVEN** |
| **8** | **Stripe Gateway** | `public_config.subscriptions`| `stripePublishableKey` | Key Input, Webhook URL | POST `/api/admin/payment-settings` | Key masked | Verified | Revision + 1 | **PROVEN** |
| **9** | **PayPal Gateway** | `public_config.subscriptions`| `paypalClientId`, `sandboxMode`| Client ID Input, Toggle | POST `/api/admin/payment-settings` | Key masked | Verified | Revision + 1 | **PROVEN** |
| **10**| **Paytm Gateway** | `public_config.subscriptions`| `paytmMid`, `paytmWebsite` | Merchant ID Input | POST `/api/admin/payment-settings` | Key masked | Verified | Revision + 1 | **PROVEN** |
| **11**| **PhonePe Gateway** | `public_config.subscriptions`| `phonepeId`, `phonepeSaltIndex`| Merchant ID, Salt Index | POST `/api/admin/payment-settings` | Key masked | Verified | Revision + 1 | **PROVEN** |
| **12**| **Subscription Plans**| `public_config.subscriptions`| `monthlyPrice: 199`, `yearlyPrice: 499`| Price Inputs (INR `₹`) | POST `/api/admin/settings/plans` | Verified | Verified | Revision + 1 | **PROVEN** |
| **13**| **GST & Tax Rules** | `public_config.subscriptions`| `gstRate: 18%`, `supplierGstin`| Tax Rate Input, Company GSTIN | POST `/api/admin/settings/tax` | Verified | Verified | Revision + 1 | **PROVEN** |
| **14**| **Invoice Prefix** | `public_config.subscriptions`| `invoicePrefix: 'INV'`, `finYear`| Text Inputs | POST `/api/admin/settings/invoice` | Verified | Verified | Revision + 1 | **PROVEN** |
| **15**| **Google OAuth** | `public_config.socialAuth` | `enableGoogleLogin: true` | Toggle Switch | POST `/api/admin/settings/socialAuth`| Verified | Verified | Revision + 1 | **PROVEN** |
| **16**| **Facebook Login** | `public_config.socialAuth` | `facebookAppId`, `enable` | App ID Input, Toggle | POST `/api/admin/settings/socialAuth`| Verified | Verified | Revision + 1 | **PROVEN** |
| **17**| **LinkedIn OAuth** | `public_config.socialAuth` | `linkedinClientId` | Client ID, Secret Input | POST `/api/admin/settings/socialAuth`| Secret stored | Verified | Revision + 1 | **PROVEN** |
| **18**| **GitHub OAuth** | `public_config.socialAuth` | `githubClientId` | Client ID, Secret Input | POST `/api/admin/settings/socialAuth`| Secret stored | Verified | Revision + 1 | **PROVEN** |
| **19**| **Firebase Admin Auth**| `admin_configuration` | `projectId: 'fixture-project'` | Read-only projection | POST `/api/admin/firebase-service-account`| SA Recent Auth| Verified | Revision + 1 | **PROVEN** |
| **20**| **Twilio SMS Alerts**| `admin_configuration.twilio`| `accountSid`, `fromNumber` | Form Inputs, Auth Token | POST `/api/admin/twilio-settings`| Token masked | Verified | Revision + 1 | **PROVEN** |
| **21**| **GDPR Cookie Banner**| `public_config.gdpr` | `enableCookieBanner: true` | Toggle, Cookie Notice Text | POST `/api/admin/settings/gdpr` | Verified | Verified | Revision + 1 | **PROVEN** |
| **22**| **Geo & SEO Metadata**| `public_config.geoSeo` | `targetRegion: 'IN'`, `metaKeywords`| Inputs, Canonical URL | POST `/api/admin/settings/geoSeo` | Verified | Verified | Revision + 1 | **PROVEN** |
| **23**| **LLM & robots.txt**| `public_config.llmGeo` | `allowGptBot`, `allowClaude` | Bot Toggles, llms.txt text | POST `/api/admin/settings/llmGeo` | Verified | Verified | Revision + 1 | **PROVEN** |
| **24**| **Code Injection** | `public_config.codeInjection`| `headerScripts`, `footerScripts`| Script Textareas | POST `/api/admin/settings/scripts`| Verified | Verified | Revision + 1 | **PROVEN** |
| **25**| **Security & Limits** | `public_config.security` | `maxUploadSizeMb: 5`, `rateLimit`| Number Inputs, Extension list | POST `/api/admin/settings/security`| Verified | Verified | Revision + 1 | **PROVEN** |
| **26**| **Maintenance Mode** | `public_config.systemHealth` | `maintenanceMode: false` | Master Toggle Switch, Message | POST `/api/platform/maintenance` | SA Recent Auth| Verified | Revision + 1 | **PROVEN** |
| **27**| **Template Manager** | `public_config.templateManager`| `disabledCvTemplates: []` | Template Grid Checkboxes | POST `/api/admin/settings/templates`| Verified | Verified | Revision + 1 | **PROVEN** |
| **28**| **Free Watermark** | `public_config.watermark` | `enableFreeWatermark: true` | Toggle, Watermark Text, Opacity | POST `/api/admin/settings/watermark`| Verified | Verified | Revision + 1 | **PROVEN** |
| **29**| **PDF Render Engine** | `public_config.exportPdf` | `renderTimeout: 60000`, `A4` | Timeout Number, Format Select | POST `/api/admin/settings/exportPdf`| Verified | Verified | Revision + 1 | **PROVEN** |
| **30**| **Job Scraper Engine**| `public_config.jobScraper` | `keywords`, `location: 'India'` | Inputs, Interval Dropdown | POST `/api/admin/settings/jobScraper`| Verified | Verified | Revision + 1 | **PROVEN** |
| **31**| **Social Media Links**| `public_config.social` | `facebook`, `twitter`, `youtube`| URL Inputs | POST `/api/admin/settings/social` | Verified | Verified | Revision + 1 | **PROVEN** |
