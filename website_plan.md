# BuildSight CRM — Marketing Website Implementation Plan

## Goal
Create a high-converting, visually stunning marketing website for BuildSight CRM that compels Indian real estate developers to request a demo or sign up. The site must feel premium, modern, and purpose-built for its audience.

---

## Design Philosophy

### Visual Identity
- **Dark mode-first** with rich navy (`#0F2A4A`) and electric blue (`#3B82F6`) brand colors already used in the app.
- **Glassmorphism** cards over gradient backgrounds to create depth.
- **Micro-animations** (AOS / Framer Motion) — elements slide in as the user scrolls.
- **Typography:** `Inter` (headings) + `Outfit` (body) from Google Fonts.
- **Hero Section:** Full-screen animated gradient + a floating 3D mockup of the actual app dashboard.

---

## Tech Stack
- **Framework:** Next.js (standalone, separate repo from the CRM codebase)
- **Styling:** Vanilla CSS with CSS custom properties (no Tailwind)
- **Animations:** CSS keyframes + Intersection Observer for scroll-triggered effects
- **Deployment:** Vercel (free tier, instant global CDN)

---

## Page Structure

### 1. Navigation Bar
- Sticky, with blur backdrop (`backdrop-filter: blur`)
- Logo (BuildSight) on the left
- Links: Features | How It Works | Pricing | Contact
- CTA Button: `Request a Demo →` (primary button, glowing effect)

---

### 2. Hero Section
**Goal:** Instant "wow" — make it clear what BuildSight is in under 5 seconds.

- **Headline:** `The All-in-One CRM Built for Indian Real Estate Developers`
- **Sub-headline:** `From booking to possession — automate demand letters, track payments, and send WhatsApp notifications. No spreadsheets. No chaos.`
- **CTAs:** `Request a Free Demo` (primary) | `See it in Action ↓` (ghost)
- **Visual:** Animated mockup of the CRM dashboard / demand letter sending in action
- **Social Proof Strip:** `Trusted by developers managing 2,000+ units across Maharashtra`

---

### 3. Problem → Solution Section
**Goal:** Connect emotionally with the pain points developers face daily.

Two-column layout alternating image/text:

| Pain Point | BuildSight Solution |
|:---|:---|
| Tracking payments in 5 different Excel sheets | Unified payment ledger, auto-calculated |
| Forgetting to send demand letters on milestone | Auto-dispatch on milestone completion |
| Manually drafting WhatsApp messages | WhatsApp + Email with one click |
| Chasing buyers for KYC documents | Centralized KYC upload & verification |

---

### 4. Features Showcase (Animated Cards Grid)
**Goal:** Sell each feature visually with icons and short copy.

12 Feature Cards in a 3-column responsive grid, each with a hover glow effect:

1. 🏗️ **Project & Unit Management** — Wings, floors, units, real-time availability
2. 📝 **Booking & Sale Lifecycle** — Full buyer onboarding in minutes
3. 👥 **Co-owner Support** — Separate notifications to each owner
4. 💰 **Payment Schedules** — Milestone-linked demand generation
5. 📄 **Demand Letters** — Auto-generated, auto-dispatched PDFs
6. 🏛️ **Architect Certificates** — Upload & attach to demand emails
7. 📧 **Email Automation** — Gmail SMTP, beautifully formatted
8. 💬 **WhatsApp Notifications** — Meta Cloud API, no third-party cost
9. 🧾 **Receipt Generation** — Auto-PDFs on payment recording
10. 📊 **Financial Dashboard** — Outstanding, overdue aging, collection efficiency
11. 🔐 **KYC Management** — PAN & Aadhaar with OCR auto-fill (Surepass)
12. 📑 **Audit Trail** — Every action logged with timestamps

---

### 5. "How It Works" Section (3-Step Visual Flow)
**Goal:** Reduce friction — make the product feel simple to use.

Animated numbered steps with a connecting dotted line:

```
① Set Up Your Project   →   ② Register Sales & Buyers   →   ③ Milestones Do the Rest
```

Each step has a short description and a looping GIF/screenshot of the actual UI.

---

### 6. Stats / Social Proof Bar
Animated number counters on scroll:

- `2,000+` Units Managed
- `100%` Automated Demand Dispatch
- `₹0` WhatsApp API Cost (beyond free tier)
- `5 Min` Average Booking Time

---

### 7. Pricing Section
**Goal:** Transparent pricing to remove the "I need to call someone" barrier.

Two pricing cards:
| | Cloud (AWS Hosted) | On-Premise |
|:---|:---|:---|
| **Price** | Contact for Pricing | ₹1,50,000/year |
| **Hosting** | AWS (managed) | Client's own server |
| **Projects** | Unlimited | Per project basis |
| **Updates** | Auto | One-click script |
| **CTA** | `Request a Demo` | `Talk to Us` |

---

### 8. Testimonial / Trust Section
Placeholder cards for client testimonials (to be filled in once you have clients go live).

---

### 9. FAQ Section
Accordion-style answers to common sales objections:
- "Is our data safe if it's on the cloud?"
- "Do we need to pay extra for WhatsApp?"
- "Can multiple team members use it?"
- "What happens if we need a new feature?"

---

### 10. Final CTA Section
Full-width dark section with gradient background:
> **"Ready to ditch the spreadsheets?"**
> `Schedule Your Free Demo →`

---

### 11. Footer
- Logo + tagline
- Navigation links
- Contact: email, phone, LinkedIn
- © 2026 BuildSight Technologies

---

## Conversion Optimisation Details
- **Sticky "Request a Demo" button** that follows the user as they scroll
- **Exit-intent popup** (optional, Phase 2)
- **WhatsApp Chat Widget** so prospects can directly message you
- **Demo Request Form** with just 4 fields (Name, Company, Phone, No. of Units)

---

## Open Questions

> [!IMPORTANT]
> Please answer these before I start building:
> 1. **Domain:** Do you have a domain for the website (e.g., `buildsight.in`)? Or should I design it for a generic placeholder for now?
> 2. **Brand Name:** Should the product be called "BuildSight" on the website, or do you have a different commercial product name?
> 3. **Contact:** What email/phone number should appear in the footer and on the demo form?
> 4. **Testimonials:** Do you have any client quotes ready, or should I use placeholders?
> 5. **Logo:** Do you have an SVG or PNG logo asset, or should I design a text-based logo?
> 6. **Demo CTA:** Should the "Request a Demo" button open a contact form on the page, or link to a Calendly/Google Form?
