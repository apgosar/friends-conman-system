const pptxgen = require('pptxgenjs');
const fs = require('fs');

const pptx = new pptxgen();

// Title Slide
let slide1 = pptx.addSlide();
slide1.background = { color: "0b0f19" }; // Dark modern theme
slide1.addText("PARADIGM FRIENDS REALTORS LLP", { x: "10%", y: "30%", w: "80%", h: 1, fontSize: 32, bold: true, color: "ffffff", align: "center" });
slide1.addText("Friends ConMan System", { x: "10%", y: "45%", w: "80%", h: 1, fontSize: 48, bold: true, color: "6366f1", align: "center" });
slide1.addText("End-to-End Real Estate & Construction Management", { x: "10%", y: "60%", w: "80%", h: 0.5, fontSize: 24, color: "9ca3af", align: "center" });

// Define a standard layout for content slides
const addContentSlide = (title, bulletPoints) => {
    let slide = pptx.addSlide();
    slide.background = { color: "0f172a" };
    
    // Header
    slide.addText(title, {
        x: "5%", y: "5%", w: "90%", h: "15%",
        fontSize: 36, bold: true, color: "818cf8",
        border: [0, 0, { pt: 2, color: "334155" }, 0]
    });
    
    // Bullets
    slide.addText(
        bulletPoints.map(t => ({ text: t, options: { bullet: true } })),
        { x: "5%", y: "25%", w: "90%", h: "70%", fontSize: 22, color: "f8fafc", lineSpacing: 35, bullet: { type: "bullet", color: "818cf8" } }
    );
}

// Slide 2: Core Overview
addContentSlide("Project & Inventory Management", [
    "Interactive Building Viewer: Instantly visualize floor plans, wings, and units.",
    "Color-coded Legend: Track Available, Sold, Blocked, and Redevelopment units at a glance.",
    "Single-Click Filtering: Seamlessly filter by Configurations (e.g. 2BHK) or Status.",
    "Dual Strategy: Support for both Fresh Sales and Redevelopment tenant mappings.",
    "Granular Configuration: Define custom carpet areas, parking allocations, and unit pricing."
]);

// Slide 3: CRM
addContentSlide("Sales & CRM Onboarding", [
    "Multi-Buyer Architecture: Support for Primary and multiple Secondary co-buyers.",
    "AI-Powered KYC: Automatic extraction of details from uploaded PAN and Aadhaar cards using Gemini Vision.",
    "Tenant Linking: Seamlessly attach existing tenants to redevelopment units.",
    "Digital Onboarding Wizard: Step-by-step UI ensuring no critical data is missed.",
    "Centralized Communications: Log every interaction in a structured timeline."
]);

// Slide 4: Financials
addContentSlide("Financial & Payment Planning", [
    "Dynamic Payment Schedules: Fully customizable milestone-based payment plans.",
    "Auto-Consolidation: Automatically aggregates past-due milestones for mid-construction sales.",
    "Spill-Over Credits: Intelligently cascade excess booking amounts into upcoming milestones.",
    "One-Click Penalties: Automatically calculate 12% PA interest on overdue payments.",
    "GST & Stamp Duty Integration: Exclude/Include statutory taxes effortlessly."
]);

// Slide 5: Documents
addContentSlide("Document Generation Engine", [
    "Dynamic PDF Generation: High-fidelity receipts, quotes, and demand letters generated on-the-fly.",
    "Liquid Template Engine: Customize formats using tags like {{buyer.name}} and {{companyName}}.",
    "Number-to-Words: Automated Indian currency conversions (e.g., 'One Lakh Only').",
    "Hybrid Architecture: Client-side rendering for instant previews, background Puppeteer for robust attachments.",
    "Artifact Management: Download, preview, and email directly from the portal."
]);

// Slide 6: Automation
addContentSlide("Communication & Automation", [
    "AWS SES Integration: Guaranteed email delivery for payment demands and receipts.",
    "WhatsApp API Ready: Multi-channel communication strategy.",
    "Background Worker Queue: Sequential, memory-capped processing for stability on economical cloud servers.",
    "Direct PDF Attachments: Customers receive actual files, not just links.",
    "Audit Trail: 100% visibility into when communications were sent and their delivery status."
]);

// Slide 7: Dashboard
addContentSlide("Dashboard & Analytics", [
    "Real-Time Aging Buckets: Instantly view Current Due, Overdue 7, Overdue 15, and Overdue 30+ days.",
    "Collection Efficiency: Monitor cash flow health and milestone conversions.",
    "Financial Summaries: Track Total Outstanding, Collected This Month, and TDS Pending.",
    "Actionable Insights: Focus your sales team on the highest-priority outstanding accounts.",
    "Scalable Infrastructure: Built on Next.js, Prisma, and PostgreSQL for enterprise reliability."
]);

// Final Slide
let slideLast = pptx.addSlide();
slideLast.background = { color: "0b0f19" };
slideLast.addText("Ready for Deployment", { x: "10%", y: "40%", w: "80%", h: 1, fontSize: 48, bold: true, color: "6366f1", align: "center" });
slideLast.addText("Thank You", { x: "10%", y: "55%", w: "80%", h: 1, fontSize: 28, color: "f1f5f9", align: "center" });

// Save
pptx.writeFile({ fileName: "public/Friends_ConMan_Features.pptx" })
    .then(fileName => {
        console.log(`Presentation generated successfully: ${fileName}`);
    })
    .catch(err => {
        console.error("Error generating presentation:", err);
    });
