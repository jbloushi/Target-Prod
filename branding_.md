# Target Logistics Brand And UI Notes

This document captures the current UI direction for Target Logistics. Keep it aligned with the actual app and public tracking experience.

## Direction

Target Logistics should feel operational, clear, and trustworthy. The interface should prioritize shipment work over marketing copy.

Default mode is light. Dark mode can remain available as an optional preference, but new screens should be designed and checked in light mode first.

## Brand Principles

- Use Target Logistics naming consistently.
- Use clear logistics language: shipment, tracking, pickup, delivery, warehouse, route, client, carrier, Manual Shipment.
- Prefer friendly labels over raw carrier-specific language where possible.
- Keep dense operational pages readable with strong spacing, clear field groups, and predictable actions.
- Public tracking should be customer-friendly and lighter than the internal operations UI.

## Color And Surface Direction

- Default background should be light and neutral.
- Use Target blue as the primary brand color.
- Use green/teal sparingly for active progress and successful movement.
- Use amber or red only for warnings, exceptions, holds, and destructive actions.
- Avoid making the whole app dark by default.
- Avoid heavy gradients, decorative blobs, and visually noisy card stacks.

## Layout Direction

- The shipment creation wizard should be step-by-step and easy to scan.
- Field widths should match the expected input length.
- Required operational fields should be visible without crowding.
- Manual Shipment should read as a normal shipment path, not as an error or fallback.
- Public tracking should center the tracking result, progress, route, timeline, and shipment facts without feeling like an admin dashboard.

## Copy Direction

Use product copy that helps the user act.

Examples:

- `Manual Shipment`
- `Standard Package`
- `Document Express`
- `Ready for Pickup`
- `Pending Review`
- `Shipment booked`
- `Picked up`
- `In transit`
- `Out for delivery`
- `Delivered`

Avoid exposing raw service jargon when a friendlier label is available. Carrier-specific service names are still valid in admin/user assignment flows where the exact service matters.

## Status Labels

Status labels are maintained in:

- Backend: `backend/src/constants/statusConstants.js`
- Frontend: `frontend/src/constants/statusConfig.jsx`

Keep both files aligned when status naming changes.

## Client And Manual Shipment UX

- Client users should only see actions that match their assigned access.
- A client assigned to Manual Shipment should not be asked to select a carrier or service.
- A client assigned to one carrier/service should not have to choose it again.
- Manual Shipment details should expose manual cost, sale price, currency, and estimated delivery to authorized platform roles.
- Manual Shipment should not show the Manage Approval / carrier booking action.

## Public Tracking UX

Public tracking should be:

- Light by default.
- Branded as Target Logistics.
- Easy to read on mobile.
- Focused on the current status, route, delivery estimate, timeline, and shipment facts.
- Free from internal-only finance, approval, or carrier-debug details.
