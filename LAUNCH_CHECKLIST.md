# BIDOU AI — LAUNCH VERIFICATION CHECKLIST

This document tracks all open items, financial assumptions, and provider requirements that must be confirmed with live production credentials prior to commercial launch in Cameroon and regional markets.

---

| # | Item | Document Section | Current Status / Draft Value | Action Required Before Launch |
|---|---|---|---|---|
| 1 | **Live XAF / USD Conversion Rate** | Section 6.6, 14.1 | ~600 XAF = $1.00 USD (Draft Baseline) | Fetch live BEAC / interbank exchange rate and update base configuration in `pricingEngine.ts` |
| 2 | **Google Cloud / Vertex Billing Rate for Veo & Nano Banana** | Section 3.2, 6.6, 14.2 | Veo Lite: $0.05/s, Fast: $0.10/s, Standard: $0.40/s; Nano Banana 2 Lite: $0.0336, Nano Banana 2: $0.067 | Confirm against live Google Cloud project quota & billing tier to ensure enterprise rates match AI Studio public rates |
| 3 | **Willingness-to-Pay Validation (Cameroon)** | Section 6.6, 6.7, 14.3 | Starter Packs: 1,500 FCFA (Image), 4,000 FCFA (Video), 2,000 FCFA (Music) | Conduct closed beta interviews with local content creators, musicians, and TikTok/Instagram video editors in Douala/Yaoundé |
| 4 | **Commercial Licensing Terms Verification** | Section 3.2, 6.4, 14.4 | musicapi.ai (Verified); Google Nano Banana & Veo (Standard terms); Kling & Seedance (Pending Manual Review) | **Hard Gate**: Human review by founder required. System strictly enforces physical disablement of `active` toggle in Admin UI until `licensing_verified` is manually approved. |
| 5 | **FuturaPay Merchant Fee Schedule** | Section 5, 7, 14.5 | Modeled as configurable variable expense (~2.5% MoMo / Orange Money estimate) | Enter finalized contract fee rates into the `ai_models` / variable expenses database table |
| 6 | **Design System Contrast & Hex Audit** | Section 10.2, 14.6 | Brand gradient: `#F86A00` -> `#FF8800` -> `#FFB020`; Dark: `#121214`; Light: `#FFFFFF` | Run WCAG AA automated pass on all glassmorphic containers in both light & dark themes |
| 7 | **MusicAPI Billing Unit Verification (Sonic v4.5 & Sonic v5)** | Section 2.4, 6.5 | `provider_cost: 0.11` for Sonic v4.5, `0.12` for Sonic v5 (2 takes per task) | Confirm on MusicAPI dashboard whether charges are per task ($0.11 / $0.12 for 2 clips returned) or per individual clip. If billed per clip, update `MUSIC_PROVIDER_COST_USD` accordingly to preserve margin floors. |

---

*Generated as single source of truth for engineering and product operations.*
